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
	| { kind: 'throw-after-text'; text: string; message: string };

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

	test('scenario 6: models whose context window is too small are skipped', async () => {
		const large = 'x'.repeat(4 * 100_000); // about 100k tokens: too big for copilot (64k) and ollama (8k)
		const { candidates } = await (await api()).router.route(review(large), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(candidates.map(c => c.vendor), ['gemini', 'openai']);
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
