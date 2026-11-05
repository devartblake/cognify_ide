/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyRoleId, getRole } from './router';
import { COGNIFY_VENDOR, CognifyRouter, createRequestId } from './routing';
import type { RoleLog } from './roles';

/** The roles that get a Cognify model: the ones in the Planner → Coder → Reviewer → Tester chain. */
const ROUTED_ROLES: readonly CognifyRoleId[] = ['planner', 'coder', 'reviewer', 'tester'];

/**
 * Context size advertised to agent mode. It can't be derived from the vendor models:
 * asking `vscode.lm` for models from inside this provider asks this provider again
 * (a deadlock). The router still checks every request against the real model's
 * limit, with that provider's tokenizer, and skips models that are too small.
 */
const ADVERTISED_MAX_INPUT_TOKENS = 128_000;

interface CognifyRoleModel extends vscode.LanguageModelChatInformation {
	readonly role: CognifyRoleId;
}

/** `Cognify · Coder`, the name agent files reference as `Cognify · Coder (cognify)`. */
export function roleModelName(role: CognifyRoleId): string {
	return `Cognify · ${getRole(role).name}`;
}

/**
 * Cognify's own language models (S3-03): one per routed role. Agent mode runs the
 * tool loop as usual; each request it sends to a Cognify model goes through the
 * router (privacy gate, settings, ranking, fallback, deadline, audit) to a real
 * vendor model, with the tools forwarded, and the parts are streamed back.
 */
export function registerCognifyModelProvider(router: CognifyRouter, log: RoleLog): vscode.Disposable {
	const provider: vscode.LanguageModelChatProvider<CognifyRoleModel> = {
		provideLanguageModelChatInformation(): CognifyRoleModel[] {
			return ROUTED_ROLES.map(role => ({
				id: `cognify-${role}`,
				role,
				name: roleModelName(role),
				family: 'cognify',
				version: '1',
				detail: vscode.l10n.t('Routed by task'),
				tooltip: vscode.l10n.t('Cognify chooses the provider for the {0} role\'s task, with privacy checks, fallback and an audit record.', getRole(role).name),
				maxInputTokens: ADVERTISED_MAX_INPUT_TOKENS,
				maxOutputTokens: 16_384,
				capabilities: { toolCalling: true, imageInput: false },
			}));
		},

		async provideLanguageModelChatResponse(model, messages, options, progress, token): Promise<void> {
			const role = getRole(model.role);
			const requestId = createRequestId();
			const { route } = await router.route({
				task: role.tasks[0],
				role: role.id,
				requestId,
				messages: messages.map(toChatMessage),
				tools: options.tools,
				toolMode: options.toolMode,
				modelOptions: options.modelOptions,
				justification: vscode.l10n.t('Cognify routes the {0} role\'s request to a language model chosen for its task.', role.name),
			}, token);

			if (!route.value) {
				// Agent mode shows this message; the full explanation is in the routing log.
				throw new Error(vscode.l10n.t('Cognify could not route this request: {0}', route.reason));
			}
			try {
				for await (const part of route.value.parts) {
					progress.report(part);
				}
			} catch (error) {
				// Never switch providers mid-stream (contract section 6, step 7).
				await router.audit.amend(requestId, { outcome: 'stream-error', reason: `${route.reason} The response stream failed after it started; retry to route again.` });
				log.warn(`[${requestId}] stream error: ${error instanceof Error ? error.message : String(error)}`);
				throw error;
			}
		},

		async provideTokenCount(_model, text): Promise<number> {
			// The serving model isn't known until routing, so estimate (characters / 4),
			// as the router does when a provider can't count.
			const content = typeof text === 'string' ? text : text.content.map(part => part instanceof vscode.LanguageModelTextPart ? part.value : '').join('');
			return Math.ceil(content.length / 4);
		},
	};

	return vscode.lm.registerLanguageModelChatProvider(COGNIFY_VENDOR, provider);
}

/** Agent mode hands the provider request messages; `vscode.lm` takes chat messages with the same parts. */
function toChatMessage(message: vscode.LanguageModelChatRequestMessage): vscode.LanguageModelChatMessage {
	const content = message.content.filter((part): part is vscode.LanguageModelTextPart | vscode.LanguageModelToolResultPart | vscode.LanguageModelToolCallPart | vscode.LanguageModelDataPart =>
		part instanceof vscode.LanguageModelTextPart || part instanceof vscode.LanguageModelToolResultPart || part instanceof vscode.LanguageModelToolCallPart || part instanceof vscode.LanguageModelDataPart);
	return new vscode.LanguageModelChatMessage(message.role, content, message.name);
}
