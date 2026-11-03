/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: npm test (node --test, TypeScript type stripping; Node >= 22.18)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { classifyError, cooldownFor, costTierOf, getRole, parseRetryAfterMs, type ModelCandidate, rankCandidates, ROLES, routeWithFallback, selectCandidates } from '../router.ts';

const model = (vendor: string, id: string, maxInputTokens = 128_000): ModelCandidate => ({ vendor, id, name: id, family: id, maxInputTokens });

const COPILOT = model('copilot', 'copilot-gpt');
const OPENAI = model('openai', 'gpt-x');
const GEMINI = model('gemini', 'gemini-x');
const OLLAMA = model('ollama', 'llama-local', 8_000);

/** Mimics vscode.LanguageModelError (code = NoPermissions | Blocked | NotFound). */
const lmError = (code: string, message: string, cause?: unknown) => Object.assign(new Error(message), { code, cause });
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

describe('role map', () => {
	test('defines the six MVP roles with unique ids and tasks', () => {
		assert.deepEqual(ROLES.map(r => r.id), ['planner', 'coder', 'reviewer', 'tester', 'devops', 'tutor']);
		const tasks = ROLES.flatMap(r => r.tasks);
		assert.equal(new Set(tasks).size, tasks.length, 'each task belongs to exactly one role');
	});

	test('reviewer hands off to tester', () => {
		assert.equal(getRole('reviewer').handoffTo, 'tester');
	});
});

describe('rankCandidates', () => {
	test('review prefers Gemini, then GPT, then Copilot (contract section 5)', () => {
		const ranked = rankCandidates([COPILOT, OPENAI, GEMINI], 'review');
		assert.deepEqual(ranked.map(m => m.vendor), ['gemini', 'openai', 'copilot']);
	});

	test('edit prefers Copilot', () => {
		assert.equal(rankCandidates([GEMINI, OPENAI, COPILOT], 'edit')[0].vendor, 'copilot');
	});

	test('user vendor preference ranks first', () => {
		assert.equal(rankCandidates([COPILOT, OPENAI, GEMINI], 'review', { preferredVendor: 'copilot' })[0].vendor, 'copilot');
	});

	test('vendors in cooldown rank last instead of being dropped', () => {
		const ranked = rankCandidates([COPILOT, OPENAI, GEMINI], 'review', { coolingDown: new Set(['gemini']) });
		assert.deepEqual(ranked.map(m => m.vendor), ['openai', 'copilot', 'gemini']);
	});

	test('models whose context window is too small are excluded', () => {
		const ranked = rankCandidates([OLLAMA, COPILOT], 'review', { minInputTokens: 20_000 });
		assert.deepEqual(ranked.map(m => m.vendor), ['copilot']);
	});

	test('unknown vendors keep discovery order after preferred ones', () => {
		const ranked = rankCandidates([model('xai', 'a'), model('anthropic', 'b'), GEMINI], 'review');
		assert.deepEqual(ranked.map(m => m.vendor), ['gemini', 'xai', 'anthropic']);
	});
});

describe('classifyError', () => {
	test('maps vscode.LanguageModelError codes', () => {
		assert.equal(classifyError(lmError('NoPermissions', 'no key')).kind, 'auth');
		assert.equal(classifyError(lmError('NotFound', 'gone')).kind, 'not-found');
	});

	test('content-filter blocks are never fallback eligible', () => {
		const result = classifyError(lmError('Blocked', 'Response filtered by content safety policy'));
		assert.equal(result.kind, 'policy-blocked');
		assert.equal(result.fallbackEligible, false);
	});

	test('organization policy blocks may fall back', () => {
		assert.equal(classifyError(lmError('Blocked', 'This model is disabled by your organization policy')).fallbackEligible, true);
	});

	test('detects quota, rate limit, context, invalid request, and availability', () => {
		assert.equal(classifyError(lmError('Unknown', 'Request failed', httpError(429, 'You exceeded your current quota'))).kind, 'quota-exhausted');
		assert.equal(classifyError(httpError(429, 'Too Many Requests')).kind, 'rate-limited');
		assert.equal(classifyError(new Error('This model\'s maximum context length is 128000 tokens')).kind, 'context-too-large');
		assert.equal(classifyError(httpError(400, 'Bad Request')).fallbackEligible, false);
		assert.equal(classifyError(httpError(503, 'Service Unavailable')).kind, 'unavailable');
		assert.equal(classifyError(Object.assign(new Error('connect ETIMEDOUT'), {})).kind, 'unavailable');
	});

	test('cancellation is not retried', () => {
		const result = classifyError(Object.assign(new Error('Canceled'), { name: 'Canceled' }));
		assert.equal(result.kind, 'cancelled');
		assert.equal(result.fallbackEligible, false);
	});

	test('redacts credentials from messages', () => {
		const result = classifyError(new Error('Invalid key sk-abcdefghijklmnop1234 for AIzaSyA1234567890abcdefghijk'));
		assert.ok(!result.message.includes('sk-abcdefghijklmnop1234'));
		assert.ok(!result.message.includes('AIzaSyA1234567890abcdefghijk'));
		assert.match(result.message, /\[redacted\]/);
	});

	test('handles non-Error values', () => {
		assert.equal(classifyError('boom').kind, 'unknown');
		assert.equal(classifyError(undefined).message, 'Unknown error');
	});
});

/** Classify and keep only what the error table decides, for snapshot-style comparison. */
const verdict = (error: unknown, vendor?: string) => {
	const result = classifyError(error, vendor);
	return [result.kind, result.fallbackEligible, result.rule];
};

/**
 * Errors as they reach Cognify across the extension-host boundary: only name,
 * code, message and cause survive (routing contract section 4).
 */
const named = (name: string, message: string, code = '') => Object.assign(new Error(message), { name, code });

describe('classifyError vendor tables (S2-07)', () => {
	test('Copilot error shapes', () => {
		assert.deepEqual([
			verdict(named('ChatQuotaExceeded', 'You have exceeded your monthly chat messages.'), 'copilot'),
			verdict(named('ChatRateLimited', 'Sorry, you have been rate-limited.'), 'copilot'),
			verdict(lmError('Blocked', 'The extension has been temporarily blocked due to making too many requests. Please try again later.'), 'copilot'),
			verdict(new Error('Response got filtered.'), 'copilot'),
			verdict(new Error('Message exceeds token limit.'), 'copilot'),
		], [
			['quota-exhausted', true, 'copilot:quota'],
			['rate-limited', true, 'copilot:rate-limit'],
			['rate-limited', true, 'copilot:extension-throttled'],
			['policy-blocked', false, 'content-filter'],
			['context-too-large', true, 'copilot:token-limit'],
		]);
	});

	test('an empty code does not hide the error name', () => {
		assert.equal(classifyError(named('ChatQuotaExceeded', 'x'), 'copilot').kind, 'quota-exhausted');
	});

	test('Gemini error shapes', () => {
		assert.deepEqual([
			verdict(new Error('got status: 429 Too Many Requests. {"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 50 per day"}}'), 'gemini'),
			verdict(new Error('got status: 429 Too Many Requests. {"error":{"status":"RESOURCE_EXHAUSTED"}}'), 'gemini'),
			verdict(new Error('got status: 503 Service Unavailable. {"error":{"status":"UNAVAILABLE","message":"The model is overloaded."}}'), 'gemini'),
			verdict(new Error('got status: 400 Bad Request. {"error":{"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key."}}'), 'gemini'),
			verdict(new Error('got status: 400 Bad Request. {"error":{"status":"INVALID_ARGUMENT","message":"The input token count (1200000) exceeds the maximum number of tokens allowed (1048576)."}}'), 'gemini'),
			verdict(new Error('got status: 400 Bad Request. {"error":{"status":"INVALID_ARGUMENT","message":"Invalid JSON payload"}}'), 'gemini'),
			verdict(new Error('Candidate was blocked due to SAFETY'), 'gemini'),
		], [
			['quota-exhausted', true, 'gemini:daily-quota'],
			['rate-limited', true, 'gemini:resource-exhausted'],
			['unavailable', true, 'gemini:unavailable'],
			['auth', true, 'gemini:auth'],
			['context-too-large', true, 'gemini:token-limit'],
			['invalid-request', false, 'gemini:invalid-argument'],
			['policy-blocked', false, 'content-filter'],
		]);
	});

	test('Anthropic error shapes', () => {
		assert.deepEqual([
			verdict(new Error('429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}'), 'anthropic'),
			verdict(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), 'anthropic'),
			verdict(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'), 'anthropic'),
			verdict(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), 'anthropic'),
			verdict(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 210000 tokens > 200000 maximum"}}'), 'anthropic'),
			verdict(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"messages: field required"}}'), 'anthropic'),
		], [
			['rate-limited', true, 'anthropic:rate-limit'],
			['unavailable', true, 'anthropic:overloaded'],
			['auth', true, 'anthropic:auth'],
			['quota-exhausted', true, 'anthropic:credit'],
			['context-too-large', true, 'anthropic:prompt-too-long'],
			['invalid-request', false, 'anthropic:invalid-request'],
		]);
	});

	test('OpenAI and Ollama error shapes', () => {
		assert.deepEqual([
			verdict(new Error('429 You exceeded your current quota, please check your plan and billing details. (insufficient_quota)'), 'openai'),
			verdict(new Error('400 This model\'s maximum context length is 128000 tokens. (context_length_exceeded)'), 'openai'),
			verdict(new Error('401 Incorrect API key provided: sk-abc***'), 'openai'),
			verdict(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:11434'), 'ollama'),
			verdict(new Error('model "llama3" not found, try pulling it first'), 'ollama'),
		], [
			['quota-exhausted', true, 'openai:insufficient-quota'],
			['context-too-large', true, 'openai:context-length'],
			['auth', true, 'openai:auth'],
			['unavailable', true, 'ollama:not-running'],
			['not-found', true, 'ollama:model-missing'],
		]);
	});

	test('vendor rules apply only to their vendor', () => {
		assert.deepEqual(verdict(named('ChatQuotaExceeded', 'something odd'), 'gemini'), ['unknown', true, 'unmatched']);
	});
});

describe('retry hints and cooldowns', () => {
	test('parses provider retry hints', () => {
		assert.deepEqual(
			['Please retry in 34.5s.', 'Retry-After: 20', 'please wait 2 minutes', '"retryDelay": "17s"', 'retry after 500ms', 'no hint', 'retry in 99999 minutes'].map(parseRetryAfterMs),
			[34_500, 20_000, 120_000, 17_000, 500, undefined, 3_600_000],
		);
	});

	test('a retry hint becomes the cooldown; unavailable backs off to 15 minutes', () => {
		const unavailable = classifyError(new Error('503 Service Unavailable'));
		assert.deepEqual([
			cooldownFor(classifyError(new Error('rate limit exceeded, retry in 7s')), 1),
			cooldownFor(classifyError(new Error('rate limit exceeded')), 3),
			cooldownFor(classifyError(new Error('quota exceeded')), 1),
			[1, 2, 3, 4, 5, 6].map(failures => cooldownFor(unavailable, failures)),
			cooldownFor(classifyError(lmError('NotFound', 'gone')), 1),
		], [7_000, 30_000, 3_600_000, [60_000, 120_000, 240_000, 480_000, 900_000, 900_000], undefined]);
	});
});

describe('routeWithFallback (contract section 11 scenarios)', () => {
	test('scenario 1: first choice serves the request', async () => {
		const result = await routeWithFallback([GEMINI, OPENAI], async m => `answer from ${m.vendor}`);
		assert.equal(result.outcome, 'success');
		assert.deepEqual(result.servedBy, { vendor: 'gemini', modelId: 'gemini-x' });
		assert.equal(result.attempts.length, 1);
	});

	test('scenario 2: rate-limited Gemini falls back to GPT and records both attempts', async () => {
		const result = await routeWithFallback([GEMINI, OPENAI], async m => {
			if (m.vendor === 'gemini') {
				throw httpError(429, 'rate limit exceeded');
			}
			return 'ok';
		});
		assert.equal(result.outcome, 'fallback-success');
		assert.equal(result.servedBy?.vendor, 'openai');
		assert.deepEqual(result.attempts.map(a => [a.vendor, a.error?.kind]), [['gemini', 'rate-limited'], ['openai', undefined]]);
		assert.match(result.reason, /gemini \(rate-limited\)/);
	});

	test('scenario 5: content-filter block stops without fallback', async () => {
		let calls = 0;
		const result = await routeWithFallback([GEMINI, OPENAI], async () => {
			calls++;
			throw lmError('Blocked', 'blocked by content filter');
		});
		assert.equal(result.outcome, 'failed');
		assert.equal(calls, 1);
	});

	test('scenario 8: cancellation stops further attempts', async () => {
		let cancelled = false;
		const result = await routeWithFallback([GEMINI, OPENAI], async () => {
			cancelled = true;
			throw httpError(503, 'unavailable');
		}, { isCancelled: () => cancelled });
		assert.equal(result.outcome, 'cancelled');
		assert.equal(result.attempts.length, 1);
	});

	test('at most three attempts per request', async () => {
		const many = [GEMINI, OPENAI, COPILOT, model('anthropic', 'c')];
		const result = await routeWithFallback(many, async () => {
			throw httpError(503, 'unavailable');
		});
		assert.equal(result.outcome, 'failed');
		assert.equal(result.attempts.length, 3);
	});

	test('no candidates yields a helpful failure', async () => {
		const result = await routeWithFallback([], async () => 'never');
		assert.equal(result.outcome, 'failed');
		assert.match(result.reason, /No language model is available/);
	});

	test('accepts thenables, like vscode.LanguageModelChat.sendRequest', async () => {
		const thenable: PromiseLike<string> = { then: (resolve, _reject) => Promise.resolve('ok').then(resolve) };
		const result = await routeWithFallback([COPILOT], () => thenable);
		assert.equal(result.value, 'ok');
	});
});

describe('selectCandidates (contract section 6, steps 3-6)', () => {
	const withCaps = (base: ModelCandidate, toolCalling?: boolean, vision?: boolean): ModelCandidate => ({ ...base, capabilities: { toolCalling, vision } });

	test('a required capability excludes models that lack it, with a reason', () => {
		const selection = selectCandidates([withCaps(GEMINI, true, true), withCaps(COPILOT, true, false), OPENAI], 'review', { requirements: { vision: true } });
		assert.deepStrictEqual(
			{ route: selection.route.map(m => m.vendor), excluded: selection.excluded },
			{ route: ['gemini', 'openai'], excluded: [{ vendor: 'copilot', modelId: 'copilot-gpt', reason: 'does not support image input' }] },
		);
	});

	test('models with unknown required capabilities rank after known-good ones', () => {
		const selection = selectCandidates([OPENAI, withCaps(COPILOT, true)], 'review', { requirements: { toolCalling: true } });
		assert.deepStrictEqual(selection.route.map(m => m.vendor), ['copilot', 'openai']);
	});

	test('per-model token counts decide the context filter', () => {
		const counts = new Map([['gemini-x', 90_000], ['gpt-x', 150_000]]);
		const selection = selectCandidates([GEMINI, OPENAI], 'review', { inputTokensByModel: counts });
		assert.deepStrictEqual(
			{ route: selection.route.map(m => m.vendor), excluded: selection.excluded.map(e => e.reason) },
			{ route: ['gemini'], excluded: ['input of 150000 tokens exceeds its 128000-token context'] },
		);
	});

	test('a pin wins and, by default, has no fallback (scenario 7)', () => {
		const selection = selectCandidates([GEMINI, OPENAI, COPILOT], 'review', { pinnedModelId: 'copilot-gpt' });
		assert.deepStrictEqual({ route: selection.route.map(m => m.vendor), pinned: selection.pinned }, { route: ['copilot'], pinned: 'honored' });
	});

	test('fallbackWhenPinned appends the ranked route after the pin', () => {
		const selection = selectCandidates([GEMINI, OPENAI, COPILOT], 'review', { pinnedModelId: 'copilot-gpt', fallbackWhenPinned: true });
		assert.deepStrictEqual(selection.route.map(m => m.vendor), ['copilot', 'gemini', 'openai']);
	});

	test('a pin that is missing or excluded is reported and normal ranking applies', () => {
		assert.strictEqual(selectCandidates([GEMINI], 'review', { pinnedModelId: 'nope' }).pinned, 'not-found');
		const excluded = selectCandidates([GEMINI, OLLAMA], 'review', { pinnedModelId: 'llama-local', minInputTokens: 20_000 });
		assert.deepStrictEqual({ pinned: excluded.pinned, route: excluded.route.map(m => m.vendor) }, { pinned: 'excluded', route: ['gemini'] });
	});
});

describe('selectCandidates settings (S2-08)', () => {
	const ANTHROPIC = model('anthropic', 'claude-x');
	const summary = (selection: { route: readonly ModelCandidate[]; excluded: readonly { vendor: string; reason: string }[]; pinned?: string }) => ({
		route: selection.route.map(m => m.vendor),
		excluded: selection.excluded.map(e => [e.vendor, e.reason]),
		pinned: selection.pinned,
	});

	test('disabled vendors are excluded with a reason', () => {
		assert.deepEqual(summary(selectCandidates([GEMINI, OPENAI, COPILOT], 'review', { disabledVendors: new Set(['gemini']) })), {
			route: ['openai', 'copilot'],
			excluded: [['gemini', 'vendor is disabled in settings']],
			pinned: undefined,
		});
	});

	test('a disabled vendor stays excluded even when pinned', () => {
		assert.deepEqual(summary(selectCandidates([GEMINI, OPENAI], 'review', { disabledVendors: new Set(['openai']), pinnedModelId: 'gpt-x' })), {
			route: ['gemini'],
			excluded: [['openai', 'vendor is disabled in settings']],
			pinned: 'excluded',
		});
	});

	test('the cost ceiling skips vendors above it', () => {
		assert.deepEqual(summary(selectCandidates([GEMINI, OPENAI, COPILOT, OLLAMA, ANTHROPIC], 'review', { maxCostTier: 'included' })), {
			route: ['copilot', 'ollama'],
			excluded: [
				['gemini', 'cost tier metered is above the included limit in settings'],
				['openai', 'cost tier metered is above the included limit in settings'],
				['anthropic', 'cost tier metered is above the included limit in settings'],
			],
			pinned: undefined,
		});
	});

	test('static cost tiers per vendor', () => {
		assert.deepEqual(['ollama', 'copilot', 'openai', 'gemini', 'anthropic', 'someone-new'].map(costTierOf), ['free', 'included', 'metered', 'metered', 'metered', 'metered']);
	});
});

describe('routeWithFallback deadline', () => {
	test('a provider that never accepts is aborted at the deadline and not retried elsewhere', async () => {
		let aborted = false;
		const calls: string[] = [];
		const result = await routeWithFallback([GEMINI, OPENAI], (m, signal) => {
			calls.push(m.vendor);
			signal.addEventListener('abort', () => { aborted = true; });
			return new Promise<string>(() => { /* never settles */ });
		}, { deadlineMs: 50 });
		assert.deepStrictEqual(
			{ outcome: result.outcome, calls, aborted, kind: result.attempts[0].error?.kind },
			{ outcome: 'failed', calls: ['gemini'], aborted: true, kind: 'unavailable' },
		);
		assert.match(result.reason, /did not respond before the 50 ms routing deadline/);
	});

	test('a fast fallback still succeeds within the deadline', async () => {
		const result = await routeWithFallback([GEMINI, OPENAI], async m => {
			if (m.vendor === 'gemini') {
				throw httpError(429, 'rate limit');
			}
			return 'ok';
		}, { deadlineMs: 1_000 });
		assert.strictEqual(result.outcome, 'fallback-success');
	});
});
