/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Minimal, vscode-independent subset of the routing contract
// (DevDocs/Architecture/AI_PROVIDER_ROUTING_CONTRACT.md) used by the #8 role
// proof of concept. Keep this file free of imports so it can be unit tested
// with `node --test` (type stripping) and bundled into the extension unchanged.

export type CognifyTask =
	| 'architecture' | 'requirements' | 'analysis'
	| 'edit' | 'implement' | 'test' | 'refactor'
	| 'review' | 'config' | 'explain' | 'chat';

export type CognifyRoleId = 'planner' | 'coder' | 'reviewer' | 'tester' | 'devops' | 'tutor';

export interface CognifyRole {
	readonly id: CognifyRoleId;
	readonly name: string;
	readonly tasks: readonly CognifyTask[];
	/** Suggested next role after this one finishes (explicit handoff metadata). */
	readonly handoffTo?: CognifyRoleId;
}

/** MVP role map (DevDocs/Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md). */
export const ROLES: readonly CognifyRole[] = [
	{ id: 'planner', name: 'Planner', tasks: ['architecture', 'requirements'], handoffTo: 'coder' },
	{ id: 'coder', name: 'Coder', tasks: ['edit', 'implement', 'refactor'], handoffTo: 'reviewer' },
	{ id: 'reviewer', name: 'Reviewer', tasks: ['review'], handoffTo: 'tester' },
	{ id: 'tester', name: 'Tester', tasks: ['test'], handoffTo: 'reviewer' },
	{ id: 'devops', name: 'DevOps', tasks: ['config'] },
	{ id: 'tutor', name: 'Tutor', tasks: ['explain'] },
];

export function getRole(id: CognifyRoleId): CognifyRole {
	const role = ROLES.find(r => r.id === id);
	if (!role) {
		throw new Error(`Unknown Cognify role: ${id}`);
	}
	return role;
}

/**
 * Vendor preference per task (contract section 5): primary provider first,
 * then secondaries. Vendors not listed rank after these, in discovery order.
 */
const TASK_VENDOR_PREFERENCE: Readonly<Record<CognifyTask, readonly string[]>> = {
	architecture: ['openai', 'copilot', 'gemini'],
	requirements: ['openai', 'copilot', 'gemini'],
	analysis: ['openai', 'gemini', 'copilot'],
	edit: ['copilot', 'openai', 'gemini'],
	implement: ['copilot', 'openai', 'gemini'],
	test: ['copilot', 'openai', 'gemini'],
	refactor: ['copilot', 'openai', 'gemini'],
	review: ['gemini', 'openai', 'copilot'],
	config: ['gemini', 'copilot', 'openai'],
	explain: ['copilot', 'gemini', 'openai'],
	chat: ['copilot', 'openai', 'gemini'],
};

export function vendorPreferenceFor(task: CognifyTask): readonly string[] {
	return TASK_VENDOR_PREFERENCE[task];
}

/** Model capabilities as reported by the provider; `undefined` means unknown. */
export interface ModelCapabilities {
	readonly toolCalling?: boolean;
	readonly vision?: boolean;
}

/** The parts of a `vscode.LanguageModelChat` the router needs. */
export interface ModelCandidate {
	readonly vendor: string;
	readonly id: string;
	readonly name: string;
	readonly family: string;
	readonly maxInputTokens: number;
	readonly capabilities?: ModelCapabilities;
}

/** What a model must support for a request (routing contract section 2). */
/** Contract section 2. Ordered cheapest first. */
export type CognifyCostTier = 'free' | 'included' | 'metered' | 'premium';

export const COST_TIERS: readonly CognifyCostTier[] = ['free', 'included', 'metered', 'premium'];

/**
 * Static cost defaults per vendor (contract section 2, "static default"):
 * local models are free, Copilot models are included in the plan, and
 * bring-your-own-key vendors bill per token. Unknown vendors count as metered.
 */
const VENDOR_COST_TIER: Readonly<Record<string, CognifyCostTier>> = {
	ollama: 'free',
	copilot: 'included',
	openai: 'metered',
	gemini: 'metered',
	anthropic: 'metered',
};

export function costTierOf(vendor: string): CognifyCostTier {
	return VENDOR_COST_TIER[vendor] ?? 'metered';
}

export interface CapabilityRequirements {
	readonly toolCalling?: boolean;
	readonly vision?: boolean;
}

export interface SelectionOptions extends RankOptions {
	readonly requirements?: CapabilityRequirements;
	/** Exact model pin (model id). Wins over ranking (contract section 6, step 3). */
	readonly pinnedModelId?: string;
	/** When pinned, also fall back to the ranked route if the pinned model fails. Default false. */
	readonly fallbackWhenPinned?: boolean;
	/** Per-model pre-flight input size (tokens), keyed by model id; overrides `minInputTokens` for that model. */
	readonly inputTokensByModel?: ReadonlyMap<string, number>;
	/**
	 * Vendors that must not receive this request, with the reason (contract section 6,
	 * step 2: the privacy filter). Applied first and never relaxed, even for a pinned model.
	 */
	readonly blockedVendors?: ReadonlyMap<string, string>;
	/** Vendors the user turned off (contract section 6, step 1). Always excluded, even when pinned. */
	readonly disabledVendors?: ReadonlySet<string>;
	/** Most expensive cost tier allowed (contract section 6, step 6). Default: no limit. */
	readonly maxCostTier?: CognifyCostTier;
}

export interface ExcludedModel {
	readonly vendor: string;
	readonly modelId: string;
	readonly reason: string;
}

export interface CandidateSelection<T extends ModelCandidate> {
	readonly route: T[];
	readonly excluded: readonly ExcludedModel[];
	/** Set when a pin was requested; whether it was honored. */
	readonly pinned?: 'honored' | 'not-found' | 'excluded';
}

/**
 * Contract section 6, steps 3-6: pin, capability filter (hard on known
 * values, ranking penalty for unknown ones), context-size filter, health
 * demotion, and ranking. Every excluded model gets a human-readable reason.
 */
export function selectCandidates<T extends ModelCandidate>(models: readonly T[], task: CognifyTask, options: SelectionOptions = {}): CandidateSelection<T> {
	const excluded: ExcludedModel[] = [];
	const exclude = (model: T, reason: string) => excluded.push({ vendor: model.vendor, modelId: model.id, reason });
	const required = options.requirements ?? {};
	const unknownCapabilities = new Set<T>();

	const maxCost = options.maxCostTier ? COST_TIERS.indexOf(options.maxCostTier) : COST_TIERS.length;

	const eligible = models.filter(model => {
		const blocked = options.blockedVendors?.get(model.vendor);
		if (blocked !== undefined) {
			exclude(model, blocked);
			return false;
		}
		if (options.disabledVendors?.has(model.vendor)) {
			exclude(model, 'vendor is disabled in settings');
			return false;
		}
		const cost = costTierOf(model.vendor);
		if (COST_TIERS.indexOf(cost) > maxCost) {
			exclude(model, `cost tier ${cost} is above the ${options.maxCostTier} limit in settings`);
			return false;
		}
		for (const capability of ['toolCalling', 'vision'] as const) {
			if (!required[capability]) {
				continue;
			}
			const supported = model.capabilities?.[capability];
			if (supported === false) {
				exclude(model, `does not support ${capability === 'vision' ? 'image input' : 'tool calling'}`);
				return false;
			}
			if (supported === undefined) {
				unknownCapabilities.add(model);
			}
		}
		const inputTokens = options.inputTokensByModel?.get(model.id) ?? options.minInputTokens ?? 0;
		if (inputTokens > model.maxInputTokens) {
			exclude(model, `input of ${inputTokens} tokens exceeds its ${model.maxInputTokens}-token context`);
			return false;
		}
		return true;
	});

	// Rank without the context filter (already applied per model above), then move
	// models with unknown required capabilities behind the known-good ones.
	const ranked = rankCandidates(eligible, task, { preferredVendor: options.preferredVendor, coolingDown: options.coolingDown });
	const route = [...ranked.filter(model => !unknownCapabilities.has(model)), ...ranked.filter(model => unknownCapabilities.has(model))];

	if (options.pinnedModelId === undefined) {
		return { route, excluded };
	}
	const pinnedModel = route.find(model => model.id === options.pinnedModelId);
	if (!pinnedModel) {
		const wasExcluded = excluded.some(entry => entry.modelId === options.pinnedModelId);
		return { route, excluded, pinned: wasExcluded ? 'excluded' : 'not-found' };
	}
	const rest = options.fallbackWhenPinned ? route.filter(model => model !== pinnedModel) : [];
	return { route: [pinnedModel, ...rest], excluded, pinned: 'honored' };
}

export interface RankOptions {
	/** Explicit user vendor preference; ranks first when available. */
	readonly preferredVendor?: string;
	/** Pre-flight input size; models with a smaller context window are excluded. */
	readonly minInputTokens?: number;
	/** Vendors currently in cooldown; ranked last rather than dropped. */
	readonly coolingDown?: ReadonlySet<string>;
}

/**
 * Order candidate models for a task. Deterministic: the same inputs always
 * produce the same route (contract section 6, steps 4-6).
 */
export function rankCandidates<T extends ModelCandidate>(models: readonly T[], task: CognifyTask, options: RankOptions = {}): T[] {
	const preference = vendorPreferenceFor(task);
	const vendorRank = (vendor: string): number => {
		if (options.preferredVendor && vendor === options.preferredVendor) {
			return -1;
		}
		const index = preference.indexOf(vendor);
		return index === -1 ? preference.length : index;
	};
	const minTokens = options.minInputTokens ?? 0;
	return models
		.map((model, discoveryIndex) => ({ model, discoveryIndex }))
		.filter(({ model }) => model.maxInputTokens >= minTokens)
		.sort((a, b) => {
			const coolA = options.coolingDown?.has(a.model.vendor) ? 1 : 0;
			const coolB = options.coolingDown?.has(b.model.vendor) ? 1 : 0;
			return (coolA - coolB)
				|| (vendorRank(a.model.vendor) - vendorRank(b.model.vendor))
				|| (a.discoveryIndex - b.discoveryIndex);
		})
		.map(({ model }) => model);
}

export type CognifyErrorKind =
	| 'quota-exhausted' | 'rate-limited' | 'auth' | 'policy-blocked'
	| 'not-found' | 'unavailable' | 'context-too-large' | 'invalid-request'
	| 'cancelled' | 'unknown';

export interface ClassifiedError {
	readonly kind: CognifyErrorKind;
	readonly fallbackEligible: boolean;
	/** Sanitized message: error text only, never prompt content or credentials. */
	readonly message: string;
	/** Provider-suggested wait before retrying, when the error text carries one. */
	readonly retryAfterMs?: number;
	/** Which rule matched, for diagnostics and tests (e.g. `gemini:resource-exhausted`). */
	readonly rule: string;
}

interface ErrorLike {
	readonly name?: string;
	readonly code?: string;
	readonly message?: string;
	readonly status?: number;
	readonly cause?: unknown;
}

function asErrorLike(value: unknown): ErrorLike {
	if (value === undefined || value === null) {
		return {};
	}
	return typeof value === 'object' ? value as ErrorLike : { message: String(value) };
}

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]+)/g;

function sanitize(message: string): string {
	return message.replace(SECRET_PATTERN, '[redacted]').slice(0, 300);
}

/**
 * One row of the error-normalization table (routing contract section 4).
 * All present conditions must match. Errors cross the extension-host boundary
 * as `{ name, code, message, cause }` only (HTTP status and SDK fields are
 * dropped), so rules key on error names, `LanguageModelError` codes and
 * message text; `status` only helps for in-process errors.
 */
interface ErrorRule {
	readonly id: string;
	readonly vendors?: readonly string[];
	readonly name?: string;
	readonly code?: string;
	readonly status?: readonly number[];
	readonly message?: RegExp;
	readonly kind: CognifyErrorKind;
	readonly fallbackEligible: boolean;
}

/** Rules evaluated before vendor rules: control flow and safety. */
const PRIORITY_RULES: readonly ErrorRule[] = [
	{ id: 'deadline', name: 'CognifyDeadline', kind: 'unavailable', fallbackEligible: false },
	{ id: 'cancelled', name: 'Canceled', kind: 'cancelled', fallbackEligible: false },
	{ id: 'aborted', name: 'AbortError', kind: 'cancelled', fallbackEligible: false },
	{ id: 'cancelled-text', message: /\bcancel(l)?ed\b/, kind: 'cancelled', fallbackEligible: false },
	// Content filters must never be routed around (contract section 4).
	{ id: 'content-filter', message: /got filtered|content.?filter|content management policy|responsible ai|blocked due to safety|finish_?reason:? ?safety|\bsafety\b.*block|blocked by .*safety/, kind: 'policy-blocked', fallbackEligible: false },
];

/** Vendor-specific rules (vscode.lm vendor ids), checked before the generic rules. */
const VENDOR_RULES: readonly ErrorRule[] = [
	// GitHub Copilot (extensions/copilot languageModelAccess.ts).
	{ id: 'copilot:quota', vendors: ['copilot'], name: 'ChatQuotaExceeded', kind: 'quota-exhausted', fallbackEligible: true },
	{ id: 'copilot:rate-limit', vendors: ['copilot'], name: 'ChatRateLimited', kind: 'rate-limited', fallbackEligible: true },
	{ id: 'copilot:extension-throttled', vendors: ['copilot'], code: 'Blocked', message: /temporarily blocked|too many requests/, kind: 'rate-limited', fallbackEligible: true },
	{ id: 'copilot:token-limit', vendors: ['copilot'], message: /exceeds token limit/, kind: 'context-too-large', fallbackEligible: true },
	{ id: 'copilot:core-only', vendors: ['copilot'], message: /only available to vs ?code core/, kind: 'not-found', fallbackEligible: true },
	// Google Gemini (google-genai ApiError text: "got status: 429 ... RESOURCE_EXHAUSTED").
	{ id: 'gemini:daily-quota', vendors: ['gemini'], message: /resource_exhausted.*(per ?day|daily|billing)|(per ?day|daily|billing).*resource_exhausted/, kind: 'quota-exhausted', fallbackEligible: true },
	{ id: 'gemini:resource-exhausted', vendors: ['gemini'], message: /resource_exhausted/, kind: 'rate-limited', fallbackEligible: true },
	{ id: 'gemini:auth', vendors: ['gemini'], message: /api key not valid|api_key_invalid|permission_denied|unauthenticated|api key not found/, kind: 'auth', fallbackEligible: true },
	{ id: 'gemini:token-limit', vendors: ['gemini'], message: /exceeds the maximum number of tokens|input token count .* exceeds/, kind: 'context-too-large', fallbackEligible: true },
	{ id: 'gemini:invalid-argument', vendors: ['gemini'], message: /invalid_argument/, kind: 'invalid-request', fallbackEligible: false },
	{ id: 'gemini:unavailable', vendors: ['gemini'], message: /\bunavailable\b|deadline_exceeded|\binternal\b.*500|model is overloaded/, kind: 'unavailable', fallbackEligible: true },
	// Anthropic (SDK error text carries the error.type).
	{ id: 'anthropic:rate-limit', vendors: ['anthropic'], message: /rate_limit_error/, kind: 'rate-limited', fallbackEligible: true },
	{ id: 'anthropic:overloaded', vendors: ['anthropic'], message: /overloaded_error|\b529\b/, kind: 'unavailable', fallbackEligible: true },
	{ id: 'anthropic:auth', vendors: ['anthropic'], message: /authentication_error|permission_error|invalid x-api-key/, kind: 'auth', fallbackEligible: true },
	{ id: 'anthropic:credit', vendors: ['anthropic'], message: /credit balance is too low/, kind: 'quota-exhausted', fallbackEligible: true },
	{ id: 'anthropic:prompt-too-long', vendors: ['anthropic'], message: /prompt is too long/, kind: 'context-too-large', fallbackEligible: true },
	{ id: 'anthropic:not-found', vendors: ['anthropic'], message: /not_found_error/, kind: 'not-found', fallbackEligible: true },
	{ id: 'anthropic:invalid-request', vendors: ['anthropic'], message: /invalid_request_error/, kind: 'invalid-request', fallbackEligible: false },
	// OpenAI and OpenAI-compatible endpoints.
	{ id: 'openai:insufficient-quota', vendors: ['openai', 'azure', 'customoai', 'openrouter', 'xai'], message: /insufficient_quota|exceeded your current quota/, kind: 'quota-exhausted', fallbackEligible: true },
	{ id: 'openai:context-length', vendors: ['openai', 'azure', 'customoai', 'openrouter', 'xai'], message: /context_length_exceeded|maximum context length/, kind: 'context-too-large', fallbackEligible: true },
	{ id: 'openai:auth', vendors: ['openai', 'azure', 'customoai', 'openrouter', 'xai'], message: /invalid_api_key|incorrect api key/, kind: 'auth', fallbackEligible: true },
	// Ollama (local server).
	{ id: 'ollama:not-running', vendors: ['ollama'], message: /econnrefused|connect.*11434|is ollama running/, kind: 'unavailable', fallbackEligible: true },
	{ id: 'ollama:model-missing', vendors: ['ollama'], message: /model .*not found|try pulling it/, kind: 'not-found', fallbackEligible: true },
];

/** Generic rules for any vendor, last. */
const GENERIC_RULES: readonly ErrorRule[] = [
	{ id: 'lm:no-permissions', code: 'NoPermissions', kind: 'auth', fallbackEligible: true },
	// Throttling is sometimes reported as Blocked; treat it as a rate limit.
	{ id: 'lm:blocked-throttled', code: 'Blocked', message: /too many requests|rate.?limit|temporarily blocked/, kind: 'rate-limited', fallbackEligible: true },
	// Org policy disabling a vendor may fall back; any other Blocked may be a content decision and must not.
	{ id: 'lm:blocked-org-policy', code: 'Blocked', message: /disabled by (your )?(organization|administrator)|organization policy|enterprise policy/, kind: 'policy-blocked', fallbackEligible: true },
	{ id: 'lm:blocked', code: 'Blocked', kind: 'policy-blocked', fallbackEligible: false },
	{ id: 'lm:not-found', code: 'NotFound', kind: 'not-found', fallbackEligible: true },
	{ id: 'quota', message: /quota|billing|insufficient[_ ]credit|exceeded your current|out of credits/, kind: 'quota-exhausted', fallbackEligible: true },
	{ id: 'rate-limit-status', status: [429], kind: 'rate-limited', fallbackEligible: true },
	{ id: 'rate-limit', message: /rate.?limit|too many requests|\b429\b/, kind: 'rate-limited', fallbackEligible: true },
	{ id: 'context-length', message: /context.?length|maximum context|too many tokens|token limit|prompt is too long/, kind: 'context-too-large', fallbackEligible: true },
	{ id: 'auth', status: [401, 403], kind: 'auth', fallbackEligible: true },
	{ id: 'auth-text', message: /\b401\b|unauthori[sz]ed|invalid api key|api key not found/, kind: 'auth', fallbackEligible: true },
	{ id: 'invalid-request-status', status: [400, 422], kind: 'invalid-request', fallbackEligible: false },
	{ id: 'invalid-request', message: /invalid request|bad request|\b400\b|schema/, kind: 'invalid-request', fallbackEligible: false },
	{ id: 'unavailable-status', status: [500, 502, 503, 504, 529], kind: 'unavailable', fallbackEligible: true },
	{ id: 'unavailable', message: /econnreset|econnrefused|enotfound|etimedout|timed? ?out|network|service unavailable|overloaded|\b50[0234]\b/, kind: 'unavailable', fallbackEligible: true },
];

function matches(rule: ErrorRule, vendor: string | undefined, name: string, code: string, status: number | undefined, text: string): boolean {
	return (!rule.vendors || (vendor !== undefined && rule.vendors.includes(vendor)))
		&& (rule.name === undefined || rule.name === name)
		&& (rule.code === undefined || rule.code === code)
		&& (rule.status === undefined || (status !== undefined && rule.status.includes(status)))
		&& (rule.message === undefined || rule.message.test(text));
}

const MAX_RETRY_AFTER_MS = 60 * 60_000;

/** Parse a provider's retry hint, e.g. "retry after 20 seconds", "Please retry in 34.5s", `"retryDelay": "34s"`. */
export function parseRetryAfterMs(text: string): number | undefined {
	const match = /retry[- ]?after:?\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>ms|s|sec|seconds?|m|min|minutes?)?\b/i.exec(text)
		?? /(?:retry in|wait)\s*(?<value>\d+(?:\.\d+)?)\s*(?<unit>ms|s|sec|seconds?|m|min|minutes?)\b/i.exec(text)
		?? /"?retrydelay"?\s*:\s*"(?<value>\d+(?:\.\d+)?)(?<unit>s)"/i.exec(text);
	if (!match?.groups) {
		return undefined;
	}
	const value = Number(match.groups.value);
	const unit = match.groups.unit ?? 's';
	const ms = unit === 'ms' ? value : unit.startsWith('m') ? value * 60_000 : value * 1_000;
	return Number.isFinite(ms) && ms > 0 ? Math.min(Math.round(ms), MAX_RETRY_AFTER_MS) : undefined;
}

/**
 * Normalize a provider error (contract section 4, "Error normalization").
 * Evaluates priority rules (cancellation, deadline, content filters), then the
 * vendor's rules, then generic rules. An unmatched error is `unknown` and
 * fallback-eligible.
 */
export function classifyError(error: unknown, vendor?: string): ClassifiedError {
	const outer = asErrorLike(error);
	const inner = asErrorLike(outer.cause);
	// Empty strings are common (e.g. a renamed LanguageModelError has code ''), so use || not ??.
	const name = outer.name || inner.name || '';
	const code = outer.code || inner.code || '';
	const status = outer.status ?? inner.status;
	const text = `${outer.message ?? ''} ${inner.message ?? ''}`.toLowerCase();
	const message = sanitize((outer.message || inner.message || 'Unknown error').trim());
	const retryAfterMs = parseRetryAfterMs(text);

	for (const rule of [...PRIORITY_RULES, ...VENDOR_RULES, ...GENERIC_RULES]) {
		if (matches(rule, vendor, name, code, status, text)) {
			return { kind: rule.kind, fallbackEligible: rule.fallbackEligible, message, rule: rule.id, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
		}
	}
	return { kind: 'unknown', fallbackEligible: true, message, rule: 'unmatched', ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
}

/** Base cooldowns per error kind (contract section 4). */
const BASE_COOLDOWN_MS: Partial<Record<CognifyErrorKind, number>> = {
	'rate-limited': 30_000,
	'quota-exhausted': 60 * 60_000,
	'unavailable': 60_000,
};
const MAX_UNAVAILABLE_COOLDOWN_MS = 15 * 60_000;

/**
 * Cooldown for a failed vendor (contract section 4): the provider's retry hint
 * when present; otherwise the base for the error kind, with `unavailable`
 * backing off 60 s, doubling per consecutive failure up to 15 min. Returns
 * undefined when the kind does not cool a vendor down.
 */
export function cooldownFor(error: ClassifiedError, consecutiveFailures: number): number | undefined {
	const base = BASE_COOLDOWN_MS[error.kind];
	if (base === undefined) {
		return undefined;
	}
	if (error.retryAfterMs !== undefined) {
		return error.retryAfterMs;
	}
	if (error.kind === 'unavailable') {
		return Math.min(base * 2 ** Math.max(0, consecutiveFailures - 1), MAX_UNAVAILABLE_COOLDOWN_MS);
	}
	return base;
}

export type RouteOutcome = 'success' | 'fallback-success' | 'failed' | 'cancelled';

export interface RouteAttempt {
	readonly vendor: string;
	readonly modelId: string;
	readonly durationMs: number;
	readonly error?: ClassifiedError;
}

export interface RouteResult<R> {
	readonly outcome: RouteOutcome;
	readonly value?: R;
	readonly servedBy?: { readonly vendor: string; readonly modelId: string };
	readonly attempts: readonly RouteAttempt[];
	readonly reason: string;
	/** Set when no attempt was made because policy (the privacy gate) excluded every model. */
	readonly blocked?: 'privacy';
}

export interface RouteOptions {
	readonly maxAttempts?: number;
	readonly isCancelled?: () => boolean;
	readonly now?: () => number;
	/** Total budget for accepting a response, across all attempts (contract section 6, step 7). */
	readonly deadlineMs?: number;
}

const DEADLINE_MESSAGE = 'Routing deadline exceeded before a provider accepted the request.';

/**
 * Race `promise` against the remaining deadline. On timeout, aborts `controller`
 * (so the caller can cancel the provider request) and rejects with a
 * non-retryable deadline error.
 */
function withDeadline<R>(promise: PromiseLike<R>, remainingMs: number | undefined, controller: AbortController): Promise<R> {
	if (remainingMs === undefined) {
		return Promise.resolve(promise);
	}
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(Object.assign(new Error(DEADLINE_MESSAGE), { name: 'CognifyDeadline' }));
		}, Math.max(0, remainingMs));
	});
	return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Try ranked candidates in order (contract section 6, step 7): at most
 * `maxAttempts` (default 3), advancing only on fallback-eligible errors.
 * `attempt` should resolve once the provider has accepted the request;
 * failures after streaming starts are the caller's to surface, not to
 * silently re-route.
 */
export async function routeWithFallback<T extends ModelCandidate, R>(
	candidates: readonly T[],
	attempt: (candidate: T, signal: AbortSignal) => PromiseLike<R>,
	options: RouteOptions = {},
): Promise<RouteResult<R>> {
	const maxAttempts = options.maxAttempts ?? 3;
	const now = options.now ?? Date.now;
	const attempts: RouteAttempt[] = [];
	const deadlineAt = options.deadlineMs === undefined ? undefined : now() + options.deadlineMs;

	if (candidates.length === 0) {
		return { outcome: 'failed', attempts, reason: 'No language model is available for this task. Enable a provider (for example Copilot, or an OpenAI/Gemini key) and try again.' };
	}

	for (const candidate of candidates.slice(0, maxAttempts)) {
		if (options.isCancelled?.()) {
			return { outcome: 'cancelled', attempts, reason: 'Request cancelled.' };
		}
		if (deadlineAt !== undefined && now() >= deadlineAt) {
			return { outcome: 'failed', attempts, reason: `The ${options.deadlineMs} ms routing deadline passed before another provider could be tried.` };
		}
		const started = now();
		const controller = new AbortController();
		try {
			const value = await withDeadline(attempt(candidate, controller.signal), deadlineAt === undefined ? undefined : deadlineAt - started, controller);
			attempts.push({ vendor: candidate.vendor, modelId: candidate.id, durationMs: now() - started });
			const fallback = attempts.length > 1;
			return {
				outcome: fallback ? 'fallback-success' : 'success',
				value,
				servedBy: { vendor: candidate.vendor, modelId: candidate.id },
				attempts,
				reason: fallback
					? `${candidate.vendor} served the request after ${attempts.slice(0, -1).map(a => `${a.vendor} (${a.error?.kind})`).join(', ')}.`
					: `${candidate.vendor} served the request (first choice).`,
			};
		} catch (error) {
			const classified = classifyError(error, candidate.vendor);
			attempts.push({ vendor: candidate.vendor, modelId: candidate.id, durationMs: now() - started, error: classified });
			if (classified.kind === 'cancelled') {
				return { outcome: 'cancelled', attempts, reason: 'Request cancelled.' };
			}
			if (classified.message === DEADLINE_MESSAGE) {
				return { outcome: 'failed', attempts, reason: `${candidate.vendor} did not respond before the ${options.deadlineMs} ms routing deadline; no time left to try another provider.` };
			}
			if (!classified.fallbackEligible) {
				return { outcome: 'failed', attempts, reason: `${candidate.vendor} failed (${classified.kind}); this error is not retried on another provider.` };
			}
		}
	}
	return { outcome: 'failed', attempts, reason: `All ${attempts.length} attempted provider(s) failed: ${attempts.map(a => `${a.vendor} (${a.error?.kind})`).join(', ')}.` };
}
