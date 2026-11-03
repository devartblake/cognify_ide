/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: npm test (node --test, TypeScript type stripping; Node >= 22.18)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { classifyError, getRole, type ModelCandidate, rankCandidates, ROLES, routeWithFallback } from '../router.ts';

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
