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

/** The parts of a `vscode.LanguageModelChat` the router needs. */
export interface ModelCandidate {
	readonly vendor: string;
	readonly id: string;
	readonly name: string;
	readonly family: string;
	readonly maxInputTokens: number;
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
 * Normalize a provider error (contract section 4, "Error normalization").
 * `vscode.LanguageModelError` codes map directly; quota, rate-limit, and
 * availability signals are detected from the error or its `cause`.
 */
export function classifyError(error: unknown): ClassifiedError {
	const outer = asErrorLike(error);
	const inner = asErrorLike(outer.cause);
	const code = outer.code ?? outer.name ?? '';
	const status = outer.status ?? inner.status;
	const text = `${outer.message ?? ''} ${inner.message ?? ''}`.toLowerCase();
	const message = sanitize((outer.message ?? inner.message ?? 'Unknown error').trim());

	if (code === 'Canceled' || code === 'AbortError' || /\bcancel(l)?ed\b/.test(text)) {
		return { kind: 'cancelled', fallbackEligible: false, message };
	}
	if (code === 'NoPermissions') {
		return { kind: 'auth', fallbackEligible: true, message };
	}
	if (code === 'Blocked') {
		// Content filters must never be routed around; org policy disabling a vendor may fall back.
		const orgPolicy = /policy|disabled by (your )?(organization|administrator)/.test(text) && !/content|filter|safety|responsible ai/.test(text);
		return { kind: 'policy-blocked', fallbackEligible: orgPolicy, message };
	}
	if (code === 'NotFound') {
		return { kind: 'not-found', fallbackEligible: true, message };
	}
	if (/quota|billing|insufficient[_ ]credit|exceeded your current|out of credits/.test(text)) {
		return { kind: 'quota-exhausted', fallbackEligible: true, message };
	}
	if (status === 429 || /rate.?limit|too many requests/.test(text)) {
		return { kind: 'rate-limited', fallbackEligible: true, message };
	}
	if (/context.?length|maximum context|too many tokens|token limit|prompt is too long/.test(text)) {
		return { kind: 'context-too-large', fallbackEligible: true, message };
	}
	if (status === 400 || status === 422 || /invalid request|bad request|schema/.test(text)) {
		return { kind: 'invalid-request', fallbackEligible: false, message };
	}
	if ((status !== undefined && status >= 500) || /econnreset|enotfound|etimedout|timed? ?out|network|service unavailable|overloaded/.test(text)) {
		return { kind: 'unavailable', fallbackEligible: true, message };
	}
	return { kind: 'unknown', fallbackEligible: true, message };
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
}

export interface RouteOptions {
	readonly maxAttempts?: number;
	readonly isCancelled?: () => boolean;
	readonly now?: () => number;
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
	attempt: (candidate: T) => PromiseLike<R>,
	options: RouteOptions = {},
): Promise<RouteResult<R>> {
	const maxAttempts = options.maxAttempts ?? 3;
	const now = options.now ?? Date.now;
	const attempts: RouteAttempt[] = [];

	if (candidates.length === 0) {
		return { outcome: 'failed', attempts, reason: 'No language model is available for this task. Enable a provider (for example Copilot, or an OpenAI/Gemini key) and try again.' };
	}

	for (const candidate of candidates.slice(0, maxAttempts)) {
		if (options.isCancelled?.()) {
			return { outcome: 'cancelled', attempts, reason: 'Request cancelled.' };
		}
		const started = now();
		try {
			const value = await attempt(candidate);
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
			const classified = classifyError(error);
			attempts.push({ vendor: candidate.vendor, modelId: candidate.id, durationMs: now() - started, error: classified });
			if (classified.kind === 'cancelled') {
				return { outcome: 'cancelled', attempts, reason: 'Request cancelled.' };
			}
			if (!classified.fallbackEligible) {
				return { outcome: 'failed', attempts, reason: `${candidate.vendor} failed (${classified.kind}); this error is not retried on another provider.` };
			}
		}
	}
	return { outcome: 'failed', attempts, reason: `All ${attempts.length} attempted provider(s) failed: ${attempts.map(a => `${a.vendor} (${a.error?.kind})`).join(', ')}.` };
}
