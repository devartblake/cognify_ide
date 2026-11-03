/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Extension-host integration tests: the Cognify router against fake `vscode.lm`
// vendors registered by test-fixtures/fake-lm (routing contract section 11).

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import type { CognifyAiApi } from '../routing';

type FakeBehavior =
	| { kind: 'ok'; text?: string }
	| { kind: 'throw'; message: string; code?: 'NoPermissions' | 'Blocked' | 'NotFound' }
	| { kind: 'throw-after-text'; text: string; message: string }
	| { kind: 'hang' };

interface FakeCall {
	readonly vendor: string;
	readonly modelId: string;
	readonly promptChars: number;
}

async function api(): Promise<CognifyAiApi> {
	const extension = vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai');
	assert.ok(extension, 'cognify-ai extension not found');
	return extension.activate();
}

async function configure(behaviors: Record<string, FakeBehavior>): Promise<void> {
	await vscode.commands.executeCommand('cognifyFakeLm.configure', behaviors);
}

async function calls(): Promise<FakeCall[]> {
	return (await vscode.commands.executeCommand<FakeCall[]>('cognifyFakeLm.calls')) ?? [];
}

async function waitForFakeVendors(): Promise<void> {
	for (let i = 0; i < 100; i++) {
		const vendors = new Set((await vscode.lm.selectChatModels()).map(model => model.vendor));
		if (['gemini', 'openai', 'copilot', 'ollama'].every(vendor => vendors.has(vendor))) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
	assert.fail('fake language model vendors did not register');
}

function review(text = 'please review this code'): { task: 'review'; messages: vscode.LanguageModelChatMessage[]; justification: string } {
	return { task: 'review', messages: [vscode.LanguageModelChatMessage.User(text)], justification: 'cognify-ai integration test' };
}

async function readAll(response: { readonly text: AsyncIterable<string> }): Promise<string> {
	let text = '';
	for await (const fragment of response.text) {
		text += fragment;
	}
	return text;
}

suite('Cognify router (integration, fake vendors)', () => {

	suiteSetup(async () => {
		await waitForFakeVendors();
	});

	setup(async () => {
		(await api()).router.resetCooldowns();
		await configure({});
	});

	test('scenario 1: review is served by Gemini on the first attempt', async () => {
		const { route } = await (await api()).router.route(review(), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ outcome: route.outcome, servedBy: route.servedBy?.vendor, attempts: route.attempts.length, text: route.value && await readAll(route.value) },
			{ outcome: 'success', servedBy: 'gemini', attempts: 1, text: 'answer from gemini' },
		);
	});

	test('scenario 2: a rate-limited Gemini falls back to GPT and cools down', async () => {
		await configure({ gemini: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' } });
		const router = (await api()).router;
		const { route } = await router.route(review(), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{
				outcome: route.outcome,
				servedBy: route.servedBy?.vendor,
				attempts: route.attempts.map(a => [a.vendor, a.error?.kind]),
				coolingDown: [...router.coolingDownVendors()],
				calls: (await calls()).map(c => c.vendor),
			},
			{
				outcome: 'fallback-success',
				servedBy: 'openai',
				attempts: [['gemini', 'rate-limited'], ['openai', undefined]],
				coolingDown: ['gemini'],
				calls: ['gemini', 'openai'],
			},
		);
	});

	test('a vendor in cooldown is tried last on the next request', async () => {
		await configure({ gemini: { kind: 'throw', message: 'rate limit exceeded' } });
		const router = (await api()).router;
		await router.route(review(), new vscode.CancellationTokenSource().token);
		await configure({});
		const { route } = await router.route(review(), new vscode.CancellationTokenSource().token);
		assert.strictEqual(route.servedBy?.vendor, 'openai');
	});

	test('scenario 3: a user vendor preference ranks first', async () => {
		const { route } = await (await api()).router.route({ ...review(), preferredVendor: 'copilot' }, new vscode.CancellationTokenSource().token);
		assert.strictEqual(route.servedBy?.vendor, 'copilot');
	});

	test('scenario 5: a content-filter block is not routed to another vendor', async () => {
		await configure({ gemini: { kind: 'throw', code: 'Blocked', message: 'Response blocked by content filter' } });
		const { route } = await (await api()).router.route(review(), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ outcome: route.outcome, attempts: route.attempts.map(a => [a.vendor, a.error?.kind, a.error?.fallbackEligible]), calls: (await calls()).map(c => c.vendor) },
			{ outcome: 'failed', attempts: [['gemini', 'policy-blocked', false]], calls: ['gemini'] },
		);
	});

	test('scenario 6: the context check uses each provider\'s own tokenizer', async () => {
		// 400k chars: ~100k tokens by the chars/4 estimate, which would fit openai (128k).
		// The fake openai tokenizer counts 2 chars/token (200k tokens), so openai must be skipped.
		const large = 'x'.repeat(400_000);
		const { selection, inputTokens } = await (await api()).router.route(review(large), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ route: selection.route.map(c => c.vendor), openaiTokens: inputTokens.get('fake-gpt'), excluded: selection.excluded.map(e => [e.vendor, e.reason]).sort() },
			{
				route: ['gemini'],
				openaiTokens: 200_000,
				excluded: [
					['copilot', 'input of 100000 tokens exceeds its 64000-token context'],
					['ollama', 'input of 100000 tokens exceeds its 8000-token context'],
					['openai', 'input of 200000 tokens exceeds its 128000-token context'],
				],
			},
		);
	});

	test('a capability requirement skips models without it, with reasons', async () => {
		const { route, selection } = await (await api()).router.route({ ...review(), requirements: { vision: true } }, new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ servedBy: route.servedBy?.vendor, route: selection.route.map(c => c.vendor), excluded: selection.excluded.map(e => [e.vendor, e.reason]).sort() },
			{ servedBy: 'gemini', route: ['gemini', 'openai'], excluded: [['copilot', 'does not support image input'], ['ollama', 'does not support image input']] },
		);
	});

	test('a pinned model is used even when it is not the task\'s first choice', async () => {
		const { route, selection } = await (await api()).router.route({ ...review(), pinnedModelId: 'fake-copilot' }, new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual({ servedBy: route.servedBy?.vendor, route: selection.route.map(c => c.vendor), pinned: selection.pinned }, { servedBy: 'copilot', route: ['copilot'], pinned: 'honored' });
	});

	test('scenario 7: a failing pinned model does not fall back by default', async () => {
		await configure({ copilot: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' } });
		const { route } = await (await api()).router.route({ ...review(), pinnedModelId: 'fake-copilot' }, new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual({ outcome: route.outcome, calls: (await calls()).map(c => c.vendor) }, { outcome: 'failed', calls: ['copilot'] });
	});

	test('fallbackWhenPinned falls back to the ranked route', async () => {
		await configure({ copilot: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' } });
		const { route } = await (await api()).router.route({ ...review(), pinnedModelId: 'fake-copilot', fallbackWhenPinned: true }, new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual({ outcome: route.outcome, servedBy: route.servedBy?.vendor }, { outcome: 'fallback-success', servedBy: 'gemini' });
	});

	test('the routing deadline cancels a provider that never responds', async () => {
		await configure({ gemini: { kind: 'hang' } });
		const started = Date.now();
		const { route } = await (await api()).router.route({ ...review(), deadlineMs: 750 }, new vscode.CancellationTokenSource().token);
		const elapsed = Date.now() - started;
		// Cancellation reaches the provider asynchronously; give it a moment.
		let cancelled: FakeCall[] = [];
		for (let i = 0; i < 50 && cancelled.length === 0; i++) {
			cancelled = (await vscode.commands.executeCommand<FakeCall[]>('cognifyFakeLm.cancelled')) ?? [];
			await new Promise(resolve => setTimeout(resolve, 20));
		}
		assert.deepStrictEqual(
			{ outcome: route.outcome, attempts: route.attempts.map(a => [a.vendor, a.error?.kind]), calls: (await calls()).map(c => c.vendor), cancelledProviderRequest: cancelled.map(c => c.vendor) },
			{ outcome: 'failed', attempts: [['gemini', 'unavailable']], calls: ['gemini'], cancelledProviderRequest: ['gemini'] },
		);
		assert.ok(elapsed < 5_000, `deadline not enforced (took ${elapsed} ms)`);
	});

	test('scenario 8: a cancelled request makes no further attempts', async () => {
		await configure({ gemini: { kind: 'throw', message: '503 Service Unavailable' } });
		const source = new vscode.CancellationTokenSource();
		source.cancel();
		const { route } = await (await api()).router.route(review(), source.token);
		assert.strictEqual(route.outcome, 'cancelled');
		assert.strictEqual((await calls()).length, 0);
	});

	test('all vendors failing yields a failed route with every attempt recorded', async () => {
		const unavailable: FakeBehavior = { kind: 'throw', message: '503 Service Unavailable' };
		await configure({ gemini: unavailable, openai: unavailable, copilot: unavailable, ollama: unavailable });
		const { route } = await (await api()).router.route(review(), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ outcome: route.outcome, attempts: route.attempts.map(a => [a.vendor, a.error?.kind]) },
			{ outcome: 'failed', attempts: [['gemini', 'unavailable'], ['openai', 'unavailable'], ['copilot', 'unavailable']] },
		);
	});

	test('a failure after the first fragment is surfaced, not re-routed', async () => {
		await configure({ gemini: { kind: 'throw-after-text', text: 'partial', message: 'connection reset' } });
		const { route } = await (await api()).router.route(review(), new vscode.CancellationTokenSource().token);
		assert.strictEqual(route.servedBy?.vendor, 'gemini');
		const received: string[] = [];
		await assert.rejects(async () => {
			for await (const fragment of route.value!.text) {
				received.push(fragment);
			}
		});
		assert.deepStrictEqual({ received, calls: (await calls()).map(c => c.vendor) }, { received: ['partial'], calls: ['gemini'] });
	});
});
