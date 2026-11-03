/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CandidateSelection, CapabilityRequirements, CognifyErrorKind, CognifyTask, ModelCapabilities, ModelCandidate, routeWithFallback, RouteResult, selectCandidates } from './router';

/** Cooldowns per error kind (routing contract section 4). */
const COOLDOWN_MS: Partial<Record<CognifyErrorKind, number>> = {
	'rate-limited': 30_000,
	'quota-exhausted': 60 * 60_000,
	'unavailable': 60_000,
};

/** Default budget for a provider to accept a request (first fragment), across fallbacks. */
const DEFAULT_DEADLINE_MS = 60_000;
/** Budget for one model's pre-flight token count before falling back to an estimate. */
const TOKEN_COUNT_TIMEOUT_MS = 2_000;

export interface CognifyRouteRequest {
	readonly task: CognifyTask;
	readonly messages: readonly vscode.LanguageModelChatMessage[];
	readonly justification: string;
	readonly preferredVendor?: string;
	readonly requirements?: CapabilityRequirements;
	/** Exact model id to use (contract section 6, step 3). */
	readonly pinnedModelId?: string;
	/** Fall back to the ranked route if the pinned model fails. Default false. */
	readonly fallbackWhenPinned?: boolean;
	/** Overall budget for a provider to accept the request. Default 60 s. */
	readonly deadlineMs?: number;
}

/**
 * A model response whose first fragment has already arrived. `vscode.lm`
 * providers report most failures while streaming rather than by rejecting
 * `sendRequest`, so a response only counts as accepted once its first fragment
 * (or a clean end) is received. Fallback is possible up to that point and never
 * after it (routing contract section 6, step 7).
 */
export interface CognifyModelResponse {
	readonly text: AsyncIterable<string>;
}

/** A `vscode.lm` model plus the router's view of it. */
export interface RoutedModel extends ModelCandidate {
	readonly chat: vscode.LanguageModelChat;
}

export interface CognifyRouteResponse {
	readonly route: RouteResult<CognifyModelResponse>;
	/** Ranked candidates the route was attempted against, and the models excluded (with reasons). */
	readonly selection: CandidateSelection<RoutedModel>;
	/** Pre-flight input size per model id (provider tokenizer, or an estimate when counting failed). */
	readonly inputTokens: ReadonlyMap<string, number>;
}

/**
 * Routes a Cognify task to a `vscode.lm` model following the routing contract
 * (section 6): discover, pin, capability filter, per-model context check with the
 * provider's own tokenizer, health demotion, rank, try with fallback within a
 * deadline, and remember provider cooldowns. Shared by the `@cognify` chat
 * participant and the extension's public API (used by integration tests).
 */
export class CognifyRouter {
	private readonly cooldownUntil = new Map<string, number>();

	/** Vendors currently cooling down (exposed for diagnostics and tests). */
	coolingDownVendors(now = Date.now()): ReadonlySet<string> {
		return new Set([...this.cooldownUntil].filter(([, until]) => until > now).map(([vendor]) => vendor));
	}

	/** Forget all cooldowns. */
	resetCooldowns(): void {
		this.cooldownUntil.clear();
	}

	async route(request: CognifyRouteRequest, token: vscode.CancellationToken): Promise<CognifyRouteResponse> {
		const models = (await vscode.lm.selectChatModels()).map(toRoutedModel);
		const inputTokens = await countInputTokens(models, request.messages, token);
		const selection = selectCandidates(models, request.task, {
			preferredVendor: request.preferredVendor,
			coolingDown: this.coolingDownVendors(),
			requirements: request.requirements,
			pinnedModelId: request.pinnedModelId,
			fallbackWhenPinned: request.fallbackWhenPinned,
			inputTokensByModel: inputTokens,
		});

		const route = await routeWithFallback(
			selection.route,
			async (model, signal) => {
				// Each attempt gets its own cancellation, tied to the caller's token and to the
				// routing deadline, so a timed-out provider request is actually cancelled.
				const attemptSource = new vscode.CancellationTokenSource();
				const onAbort = () => attemptSource.cancel();
				signal.addEventListener('abort', onAbort);
				const callerCancellation = token.onCancellationRequested(() => attemptSource.cancel());
				try {
					return await primeResponse(await model.chat.sendRequest([...request.messages], { justification: request.justification }, attemptSource.token));
				} finally {
					signal.removeEventListener('abort', onAbort);
					callerCancellation.dispose();
					attemptSource.dispose();
				}
			},
			{ isCancelled: () => token.isCancellationRequested, deadlineMs: request.deadlineMs ?? DEFAULT_DEADLINE_MS },
		);

		for (const attempt of route.attempts) {
			const cooldown = attempt.error ? COOLDOWN_MS[attempt.error.kind] : undefined;
			if (cooldown) {
				this.cooldownUntil.set(attempt.vendor, Date.now() + cooldown);
			}
		}
		return { route, selection, inputTokens };
	}
}

function toRoutedModel(chat: vscode.LanguageModelChat): RoutedModel {
	return { vendor: chat.vendor, id: chat.id, name: chat.name, family: chat.family, maxInputTokens: chat.maxInputTokens, capabilities: readCapabilities(chat), chat };
}

/**
 * Capabilities come from the `languageModelCapabilities` proposed API. Treat any
 * failure to read them as "unknown" (ranked lower, never excluded).
 */
function readCapabilities(chat: vscode.LanguageModelChat): ModelCapabilities | undefined {
	try {
		const capabilities = chat.capabilities;
		return capabilities ? { toolCalling: capabilities.supportsToolCalling, vision: capabilities.supportsImageToText } : undefined;
	} catch {
		return undefined;
	}
}

function estimateTokens(messages: readonly vscode.LanguageModelChatMessage[]): number {
	const chars = messages.reduce((sum, message) => sum + message.content.reduce((partSum, part) => partSum + (part instanceof vscode.LanguageModelTextPart ? part.value.length : 0), 0), 0);
	return Math.ceil(chars / 4);
}

/**
 * Count the request's input with each model's own tokenizer (vendors differ), in
 * parallel and time-boxed. Falls back to a characters/4 estimate per model.
 */
async function countInputTokens(models: readonly RoutedModel[], messages: readonly vscode.LanguageModelChatMessage[], token: vscode.CancellationToken): Promise<Map<string, number>> {
	const estimate = estimateTokens(messages);
	const counts = await Promise.all(models.map(async model => {
		try {
			const counted = Promise.all(messages.map(message => model.chat.countTokens(message, token))).then(parts => parts.reduce((sum, part) => sum + part, 0));
			const timeout = new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), TOKEN_COUNT_TIMEOUT_MS));
			const result = await Promise.race([counted, timeout]);
			return [model.id, typeof result === 'number' && Number.isFinite(result) ? result : estimate] as const;
		} catch {
			return [model.id, estimate] as const;
		}
	}));
	return new Map(counts);
}

/**
 * Wait for the first text fragment so that errors raised before any output
 * reject here (and can fall back), then replay it ahead of the rest of the stream.
 */
async function primeResponse(response: vscode.LanguageModelChatResponse): Promise<CognifyModelResponse> {
	const iterator = response.text[Symbol.asyncIterator]();
	const first = await iterator.next();
	async function* replay(): AsyncIterable<string> {
		if (first.done) {
			return;
		}
		yield first.value;
		while (true) {
			const next = await iterator.next();
			if (next.done) {
				return;
			}
			yield next.value;
		}
	}
	return { text: replay() };
}

/** Public API returned from the extension's `activate`. */
export interface CognifyAiApi {
	readonly router: CognifyRouter;
}
