/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Test-only fixture for extensions/cognify-ai integration tests. Registers fake
// language model vendors whose behavior tests script through commands. Never shipped.

import * as vscode from 'vscode';

type FakeBehavior =
	| { readonly kind: 'ok'; readonly text?: string }
	| { readonly kind: 'throw'; readonly message: string; readonly code?: 'NoPermissions' | 'Blocked' | 'NotFound'; readonly name?: string }
	| { readonly kind: 'throw-after-text'; readonly text: string; readonly message: string }
	| { readonly kind: 'hang' };

interface FakeModelSpec {
	readonly id: string;
	readonly maxInputTokens: number;
	readonly toolCalling: boolean;
	readonly imageInput: boolean;
	/** Characters per token for this vendor's fake tokenizer (vendors tokenize differently). */
	readonly charsPerToken: number;
}

interface FakeCall {
	readonly vendor: string;
	readonly modelId: string;
	readonly promptChars: number;
}

const MODELS: Readonly<Record<string, readonly FakeModelSpec[]>> = {
	gemini: [{ id: 'fake-gemini-pro', maxInputTokens: 1_000_000, toolCalling: true, imageInput: true, charsPerToken: 4 }],
	openai: [{ id: 'fake-gpt', maxInputTokens: 128_000, toolCalling: true, imageInput: true, charsPerToken: 2 }],
	copilot: [{ id: 'fake-copilot', maxInputTokens: 64_000, toolCalling: true, imageInput: false, charsPerToken: 4 }],
	ollama: [{ id: 'fake-llama-local', maxInputTokens: 8_000, toolCalling: false, imageInput: false, charsPerToken: 4 }],
};

export function activate(context: vscode.ExtensionContext): void {
	let behaviors = new Map<string, FakeBehavior>();
	const calls: FakeCall[] = [];
	const cancelled: FakeCall[] = [];

	for (const [vendor, models] of Object.entries(MODELS)) {
		context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider(vendor, {
			provideLanguageModelChatInformation: () => models.map(model => ({
				id: model.id,
				name: `${vendor} ${model.id}`,
				family: model.id,
				version: '1',
				maxInputTokens: model.maxInputTokens,
				maxOutputTokens: 4_096,
				capabilities: { toolCalling: model.toolCalling, imageInput: model.imageInput },
			})),
			provideTokenCount: async (model, text) => {
				const spec = models.find(candidate => candidate.id === model.id);
				const content = typeof text === 'string' ? text : text.content.map(part => part instanceof vscode.LanguageModelTextPart ? part.value : '').join('');
				return Math.ceil(content.length / (spec?.charsPerToken ?? 4));
			},
			provideLanguageModelChatResponse: async (model, messages, _options, progress, token) => {
				const prompt = messages.map(message => message.content.map(part => part instanceof vscode.LanguageModelTextPart ? part.value : '').join('')).join('\n');
				calls.push({ vendor, modelId: model.id, promptChars: prompt.length });
				const behavior = behaviors.get(vendor) ?? { kind: 'ok' };
				switch (behavior.kind) {
					case 'ok':
						progress.report(new vscode.LanguageModelTextPart(behavior.text ?? `answer from ${vendor}`));
						return;
					case 'throw': {
						const error = behavior.code ? vscode.LanguageModelError[behavior.code](behavior.message) : new vscode.LanguageModelError(behavior.message);
						if (!behavior.code && !behavior.name) {
							throw new Error(behavior.message);
						}
						if (behavior.name) {
							// Copilot renames errors (ChatQuotaExceeded, ChatRateLimited); the name survives the hop to the caller.
							error.name = behavior.name;
						}
						throw error;
					}
					case 'hang':
						// Never responds; ends only when the request is cancelled.
						await new Promise<void>(resolve => token.onCancellationRequested(() => resolve()));
						cancelled.push({ vendor, modelId: model.id, promptChars: prompt.length });
						throw new vscode.CancellationError();
					case 'throw-after-text':
						// Real providers stream for a while before a connection drops. A failure in the
						// same tick as the first report can drop that fragment, which the router (correctly)
						// treats as a failure before any output.
						progress.report(new vscode.LanguageModelTextPart(behavior.text));
						await new Promise(resolve => setTimeout(resolve, 200));
						throw new Error(behavior.message);
				}
			},
		}));
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('cognifyFakeLm.configure', (config: Readonly<Record<string, FakeBehavior>>) => {
			behaviors = new Map(Object.entries(config));
			calls.length = 0;
			cancelled.length = 0;
		}),
		vscode.commands.registerCommand('cognifyFakeLm.calls', () => [...calls]),
		vscode.commands.registerCommand('cognifyFakeLm.cancelled', () => [...cancelled]),
	);
}
