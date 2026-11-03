/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyErrorKind, CognifyTask, rankCandidates, routeWithFallback, RouteResult } from './router';

/** Cooldowns per error kind (routing contract section 4). */
const COOLDOWN_MS: Partial<Record<CognifyErrorKind, number>> = {
	'rate-limited': 30_000,
	'quota-exhausted': 60 * 60_000,
	'unavailable': 60_000,
};

export interface CognifyRouteRequest {
	readonly task: CognifyTask;
	readonly messages: readonly vscode.LanguageModelChatMessage[];
	readonly justification: string;
	readonly preferredVendor?: string;
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

export interface CognifyRouteResponse {
	readonly route: RouteResult<CognifyModelResponse>;
	/** Ranked candidates the route was attempted against. */
	readonly candidates: readonly vscode.LanguageModelChat[];
	readonly estimatedInputTokens: number;
}

/**
 * Routes a Cognify task to a `vscode.lm` model: discover, rank, try with
 * fallback, and remember provider cooldowns. Shared by the `@cognify` chat
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
		const promptChars = request.messages.reduce((sum, message) => sum + message.content.reduce((partSum, part) => partSum + (part instanceof vscode.LanguageModelTextPart ? part.value.length : 0), 0), 0);
		const estimatedInputTokens = Math.ceil(promptChars / 4);
		const models = await vscode.lm.selectChatModels();
		const candidates = rankCandidates(models, request.task, {
			minInputTokens: estimatedInputTokens,
			coolingDown: this.coolingDownVendors(),
			preferredVendor: request.preferredVendor,
		});

		const route = await routeWithFallback(
			candidates,
			async model => primeResponse(await model.sendRequest([...request.messages], { justification: request.justification }, token)),
			{ isCancelled: () => token.isCancellationRequested },
		);

		for (const attempt of route.attempts) {
			const cooldown = attempt.error ? COOLDOWN_MS[attempt.error.kind] : undefined;
			if (cooldown) {
				this.cooldownUntil.set(attempt.vendor, Date.now() + cooldown);
			}
		}
		return { route, candidates, estimatedInputTokens };
	}
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
