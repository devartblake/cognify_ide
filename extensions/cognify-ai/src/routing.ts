/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CandidateSelection, CapabilityRequirements, CognifyCostTier, CognifyTask, cooldownFor, COST_TIERS, ModelCapabilities, ModelCandidate, routeWithFallback, RouteResult, selectCandidates } from './router';

/** Storage key for vendor cooldowns (routing contract section 4). Bump the version on shape changes. */
const COOLDOWN_STORAGE_KEY = 'cognify.ai.cooldowns.v1';

/** Persisted health of one vendor. */
interface VendorHealth {
	/** Epoch ms until which the vendor is demoted. */
	readonly until: number;
	/** Consecutive cooled-down failures, for backoff. Reset by a success. */
	readonly failures: number;
}

/** Where cooldowns are kept; `ExtensionContext.globalState` in the product, so they survive a reload. */
export type CooldownStore = Pick<vscode.Memento, 'get' | 'update'>;

/** Default budget for a provider to accept a request (first fragment), across fallbacks. */
const DEFAULT_DEADLINE_MS = 60_000;
/** Budget for one model's pre-flight token count before falling back to an estimate. */
const TOKEN_COUNT_TIMEOUT_MS = 2_000;

/** User routing preferences (`cognify.ai.*` settings, contract section 6). */
export interface CognifyRoutingSettings {
	readonly preferredVendor?: string;
	readonly pinnedModel?: string;
	readonly fallbackWhenPinned: boolean;
	readonly disabledVendors: ReadonlySet<string>;
	/** Vendors allowed to receive `cloud-trusted` context; enforced by the privacy gate (S2-09). */
	readonly trustedVendors: ReadonlySet<string>;
	readonly maxCostTier?: CognifyCostTier;
}

/**
 * Read the routing settings. Called on every request, so changes apply to the
 * next request without a reload. Malformed values are ignored.
 */
export function readRoutingSettings(configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('cognify.ai')): CognifyRoutingSettings {
	const text = (key: string) => {
		const value = configuration.get<unknown>(key);
		return typeof value === 'string' && value.trim() ? value.trim() : undefined;
	};
	const vendors = (key: string) => {
		const value = configuration.get<unknown>(key);
		return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim()) : []);
	};
	const maxCostTier = text('maxCostTier');
	return {
		preferredVendor: text('preferredVendor'),
		pinnedModel: text('pinnedModel'),
		fallbackWhenPinned: configuration.get<unknown>('fallbackWhenPinned') === true,
		disabledVendors: vendors('disabledVendors'),
		trustedVendors: vendors('trustedVendors'),
		maxCostTier: COST_TIERS.find(tier => tier === maxCostTier),
	};
}

export interface CognifyRouteRequest {
	readonly task: CognifyTask;
	readonly messages: readonly vscode.LanguageModelChatMessage[];
	readonly justification: string;
	/** Overrides `cognify.ai.preferredVendor` for this request. */
	readonly preferredVendor?: string;
	readonly requirements?: CapabilityRequirements;
	/** Exact model id to use (contract section 6, step 3). Overrides `cognify.ai.pinnedModel`. */
	readonly pinnedModelId?: string;
	/** Fall back to the ranked route if the pinned model fails. Overrides `cognify.ai.fallbackWhenPinned`. */
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
	/** The settings this route was computed with. */
	readonly settings: CognifyRoutingSettings;
}

/**
 * Routes a Cognify task to a `vscode.lm` model following the routing contract
 * (section 6): discover, pin, capability filter, per-model context check with the
 * provider's own tokenizer, health demotion, rank, try with fallback within a
 * deadline, and remember provider cooldowns. Shared by the `@cognify` chat
 * participant and the extension's public API (used by integration tests).
 */
export class CognifyRouter {
	private readonly health: Map<string, VendorHealth>;

	constructor(private readonly store?: CooldownStore) {
		this.health = new Map(Object.entries(readHealth(store)));
	}

	/** Vendors currently cooling down (exposed for diagnostics and tests). */
	coolingDownVendors(now = Date.now()): ReadonlySet<string> {
		return new Set([...this.health].filter(([, health]) => health.until > now).map(([vendor]) => vendor));
	}

	/** Epoch ms until which a vendor is cooling down, if it is. */
	cooldownUntil(vendor: string, now = Date.now()): number | undefined {
		const until = this.health.get(vendor)?.until;
		return until !== undefined && until > now ? until : undefined;
	}

	/** Forget all cooldowns and failure counts. */
	async resetCooldowns(): Promise<void> {
		this.health.clear();
		await this.persist();
	}

	async route(request: CognifyRouteRequest, token: vscode.CancellationToken): Promise<CognifyRouteResponse> {
		const settings = readRoutingSettings();
		const models = (await vscode.lm.selectChatModels()).map(toRoutedModel);
		// Disabled vendors never see the request, not even a token count.
		const inputTokens = await countInputTokens(models.filter(model => !settings.disabledVendors.has(model.vendor)), request.messages, token);
		const selection = selectCandidates(models, request.task, {
			preferredVendor: request.preferredVendor ?? settings.preferredVendor,
			coolingDown: this.coolingDownVendors(),
			requirements: request.requirements,
			pinnedModelId: request.pinnedModelId ?? settings.pinnedModel,
			fallbackWhenPinned: request.fallbackWhenPinned ?? settings.fallbackWhenPinned,
			inputTokensByModel: inputTokens,
			disabledVendors: settings.disabledVendors,
			maxCostTier: settings.maxCostTier,
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

		await this.recordHealth(route);
		return { route, selection, inputTokens, settings };
	}

	/**
	 * Update vendor health from a route: cool down vendors whose errors call for
	 * it (provider retry hint, else the kind's base, with backoff for repeated
	 * `unavailable`), and clear the failure count of a vendor that served.
	 */
	private async recordHealth(route: RouteResult<CognifyModelResponse>): Promise<void> {
		const now = Date.now();
		let changed = false;
		for (const attempt of route.attempts) {
			const previous = this.health.get(attempt.vendor);
			if (!attempt.error) {
				if (previous) {
					this.health.delete(attempt.vendor);
					changed = true;
				}
				continue;
			}
			const failures = (previous && previous.until > now - RESET_FAILURES_AFTER_MS ? previous.failures : 0) + 1;
			const cooldown = cooldownFor(attempt.error, failures);
			if (cooldown !== undefined) {
				this.health.set(attempt.vendor, { until: now + cooldown, failures });
				changed = true;
			}
		}
		if (changed) {
			await this.persist();
		}
	}

	private async persist(): Promise<void> {
		const now = Date.now();
		const live = Object.fromEntries([...this.health].filter(([, health]) => health.until > now - RESET_FAILURES_AFTER_MS));
		try {
			await this.store?.update(COOLDOWN_STORAGE_KEY, live);
		} catch {
			// Cooldowns are an optimization; never fail a route because they could not be saved.
		}
	}
}

/** A vendor that has been healthy this long after its last cooldown starts its backoff over. */
const RESET_FAILURES_AFTER_MS = 30 * 60_000;

function readHealth(store: CooldownStore | undefined): Record<string, VendorHealth> {
	const stored = store?.get<unknown>(COOLDOWN_STORAGE_KEY);
	if (!stored || typeof stored !== 'object') {
		return {};
	}
	const result: Record<string, VendorHealth> = {};
	for (const [vendor, value] of Object.entries(stored)) {
		const health = value as Partial<VendorHealth> | undefined;
		if (typeof health?.until === 'number' && typeof health.failures === 'number') {
			result[vendor] = { until: health.until, failures: health.failures };
		}
	}
	return result;
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
