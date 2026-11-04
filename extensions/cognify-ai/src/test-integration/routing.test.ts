/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Extension-host integration tests: the Cognify router against fake `vscode.lm`
// vendors registered by test-fixtures/fake-lm (routing contract section 11).

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { CognifyAiApi, CognifyRouter, CooldownStore } from '../routing';
import { EXPLAIN_ROUTE_COMMAND, explainRouteLink, formatRouteExplanation } from '../routeExplanation';
import { createRoleHandler, RoleResponseStream } from '../roles';

type FakeBehavior =
	| { kind: 'ok'; text?: string }
	| { kind: 'throw'; message: string; code?: 'NoPermissions' | 'Blocked' | 'NotFound'; name?: string }
	| { kind: 'throw-after-text'; text: string; message: string }
	| { kind: 'hang' }
	| { kind: 'tool-call'; name: string; input: object };

interface FakeCall {
	readonly vendor: string;
	readonly modelId: string;
	readonly promptChars: number;
	readonly toolNames: readonly string[];
	readonly toolResultIds: readonly string[];
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
		await (await api()).router.resetCooldowns();
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

	test('Copilot quota and throttling errors (as Copilot raises them) fall back', async () => {
		const router = (await api()).router;
		const outcomes: [string, string | undefined, string | undefined][] = [];
		for (const error of [
			{ kind: 'throw', name: 'ChatQuotaExceeded', message: 'You have exceeded your monthly chat messages.' },
			{ kind: 'throw', name: 'ChatRateLimited', message: 'Sorry, you have been rate-limited. Please wait 34 seconds before trying again.' },
			{ kind: 'throw', code: 'Blocked', message: 'The extension has been temporarily blocked due to making too many requests. Please try again later.' },
		] satisfies FakeBehavior[]) {
			await router.resetCooldowns();
			await configure({ copilot: error });
			const { route } = await router.route({ ...review(), preferredVendor: 'copilot' }, new vscode.CancellationTokenSource().token);
			outcomes.push([route.outcome, route.attempts[0].error?.kind, route.servedBy?.vendor]);
		}
		assert.deepStrictEqual(outcomes, [
			['fallback-success', 'quota-exhausted', 'gemini'],
			['fallback-success', 'rate-limited', 'gemini'],
			['fallback-success', 'rate-limited', 'gemini'],
		]);
	});

	test('a Copilot content-filter response is not routed to another vendor', async () => {
		await configure({ copilot: { kind: 'throw', message: 'Response got filtered.' } });
		const { route } = await (await api()).router.route({ ...review(), preferredVendor: 'copilot' }, new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ outcome: route.outcome, attempts: route.attempts.map(a => [a.vendor, a.error?.kind, a.error?.fallbackEligible]), calls: (await calls()).map(c => c.vendor) },
			{ outcome: 'failed', attempts: [['copilot', 'policy-blocked', false]], calls: ['copilot'] },
		);
	});

	test('cooldowns persist across router instances and honor provider retry hints', async () => {
		const values = new Map<string, unknown>();
		const store: CooldownStore = {
			get: <T>(key: string, defaultValue?: T) => (values.has(key) ? values.get(key) : defaultValue) as T,
			update: async (key: string, value: unknown) => { values.set(key, value); },
		};
		await configure({ gemini: { kind: 'throw', message: 'got status: 429 Too Many Requests. RESOURCE_EXHAUSTED. Please retry in 90s.' } });
		const before = Date.now();
		await new CognifyRouter(store).route(review(), new vscode.CancellationTokenSource().token);
		await configure({});
		const reloaded = new CognifyRouter(store);
		const until = reloaded.cooldownUntil('gemini') ?? 0;
		const { route } = await reloaded.route(review(), new vscode.CancellationTokenSource().token);
		assert.deepStrictEqual(
			{ coolingDown: [...reloaded.coolingDownVendors()], retryHintHonored: until - before >= 90_000 && until - before < 100_000, servedBy: route.servedBy?.vendor },
			{ coolingDown: ['gemini'], retryHintHonored: true, servedBy: 'openai' },
		);
	});

	suite('settings (S2-08)', () => {
		const KEYS = ['preferredVendor', 'pinnedModel', 'fallbackWhenPinned', 'disabledVendors', 'maxCostTier'];

		async function set(values: Record<string, unknown>): Promise<void> {
			const configuration = vscode.workspace.getConfiguration('cognify.ai');
			for (const [key, value] of Object.entries(values)) {
				await configuration.update(key, value, vscode.ConfigurationTarget.Global);
			}
		}

		teardown(async () => {
			await set(Object.fromEntries(KEYS.map(key => [key, undefined])));
		});

		test('settings change routing without a reload', async () => {
			const router = (await api()).router;
			const served: (string | undefined)[] = [];
			for (const values of [
				{},
				{ preferredVendor: 'copilot' },
				{ preferredVendor: undefined, disabledVendors: ['gemini'] },
				{ disabledVendors: [], maxCostTier: 'free' },
			]) {
				await set(values);
				served.push((await router.route(review(), new vscode.CancellationTokenSource().token)).route.servedBy?.vendor);
			}
			assert.deepStrictEqual(served, ['gemini', 'copilot', 'openai', 'ollama']);
		});

		test('a disabled vendor is never called', async () => {
			await set({ disabledVendors: ['gemini', 'openai'] });
			const { route, selection } = await (await api()).router.route(review(), new vscode.CancellationTokenSource().token);
			assert.deepStrictEqual(
				{ servedBy: route.servedBy?.vendor, calls: (await calls()).map(c => c.vendor), excluded: selection.excluded.map(e => [e.vendor, e.reason]).sort() },
				{ servedBy: 'copilot', calls: ['copilot'], excluded: [['gemini', 'vendor is disabled in settings'], ['openai', 'vendor is disabled in settings']] },
			);
		});

		test('scenario 7 from settings: a pinned model does not fall back unless allowed', async () => {
			await configure({ copilot: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' } });
			await set({ pinnedModel: 'fake-copilot' });
			const router = (await api()).router;
			const pinned = (await router.route(review(), new vscode.CancellationTokenSource().token)).route;
			await router.resetCooldowns();
			await set({ fallbackWhenPinned: true });
			const fallback = (await router.route(review(), new vscode.CancellationTokenSource().token)).route;
			assert.deepStrictEqual(
				[[pinned.outcome, pinned.servedBy?.vendor], [fallback.outcome, fallback.servedBy?.vendor]],
				[['failed', undefined], ['fallback-success', 'gemini']],
			);
		});

		test('a request-level preference overrides the setting', async () => {
			await set({ preferredVendor: 'copilot' });
			const { route } = await (await api()).router.route({ ...review(), preferredVendor: 'openai' }, new vscode.CancellationTokenSource().token);
			assert.strictEqual(route.servedBy?.vendor, 'openai');
		});
	});

	suite('privacy gate (S2-09)', () => {
		async function set(section: string, values: Record<string, unknown>, target = vscode.ConfigurationTarget.Global): Promise<void> {
			const configuration = vscode.workspace.getConfiguration(section);
			for (const [key, value] of Object.entries(values)) {
				await configuration.update(key, value, target);
			}
		}

		teardown(async () => {
			await set('cognify.privacy', { localOnly: undefined, confidentialWorkspace: undefined });
			await set('cognify.privacy', { localOnly: undefined }, vscode.ConfigurationTarget.Workspace);
			await set('cognify.ai', { disabledVendors: undefined, trustedVendors: undefined });
		});

		const route = async (request: Partial<Parameters<CognifyRouter['route']>[0]> = {}) => {
			const response = await (await api()).router.route({ ...review(), ...request }, new vscode.CancellationTokenSource().token);
			return {
				outcome: response.route.outcome,
				blocked: response.route.blocked,
				servedBy: response.route.servedBy?.vendor,
				privacy: response.privacy.privacy,
				calls: (await calls()).map(c => c.vendor),
			};
		};

		test('scenario 4: local-only with no local vendor fails with zero cloud attempts', async () => {
			await set('cognify.privacy', { localOnly: true });
			await set('cognify.ai', { disabledVendors: ['ollama'] });
			assert.deepStrictEqual(await route(), { outcome: 'failed', blocked: 'privacy', servedBy: undefined, privacy: 'local-only', calls: [] });
		});

		test('local-only is served by the local vendor only', async () => {
			await set('cognify.privacy', { localOnly: true });
			assert.deepStrictEqual(await route(), { outcome: 'success', blocked: undefined, servedBy: 'ollama', privacy: 'local-only', calls: ['ollama'] });
		});

		test('a credential in the context forces local-only and is never sent to a cloud vendor', async () => {
			// Assembled at runtime so no token-shaped literal is committed.
			const key = `sk-${'A1b2C3d4'.repeat(5)}`;
			const response = await (await api()).router.route(review(`review this\nOPENAI_API_KEY=${key}`), new vscode.CancellationTokenSource().token);
			assert.deepStrictEqual(
				{ servedBy: response.route.servedBy?.vendor, privacy: response.privacy.privacy, calls: (await calls()).map(c => c.vendor), reasonNamesDetector: response.privacy.reasons.some(r => r.includes('openai-key')), keyInDecision: JSON.stringify(response.privacy).includes(key) },
				{ servedBy: 'ollama', privacy: 'local-only', calls: ['ollama'], reasonNamesDetector: true, keyInDecision: false },
			);
		});

		test('an attached sensitive file forces local-only', async () => {
			assert.deepStrictEqual((await route({ contextPaths: ['config/.env.production'] })).privacy, 'local-only');
		});

		test('a confidential workspace goes only to trusted or local vendors', async () => {
			await set('cognify.privacy', { confidentialWorkspace: true });
			await set('cognify.ai', { trustedVendors: ['openai'] });
			assert.deepStrictEqual(await route(), { outcome: 'success', blocked: undefined, servedBy: 'openai', privacy: 'cloud-trusted', calls: ['openai'] });
		});

		test('a workspace setting cannot switch off local-only set by the user', async () => {
			await set('cognify.privacy', { localOnly: true });
			await set('cognify.privacy', { localOnly: false }, vscode.ConfigurationTarget.Workspace);
			assert.deepStrictEqual((await route()).privacy, 'local-only');
		});
	});

	test('Check AI Setup reports readiness and vendors without key material (S2-03)', async () => {
		const assessment = await (await api()).checkSetup();
		assert.deepStrictEqual(
			{ readiness: assessment.readiness, vendors: assessment.vendors.map(v => [v.vendor, v.kind, v.models, v.disabled]) },
			{ readiness: 'ready', vendors: [['copilot', 'copilot', 1, false], ['gemini', 'byok', 1, false], ['ollama', 'local', 1, false], ['openai', 'byok', 1, false]] },
		);
	});

	test('the Check AI Setup command is registered', async () => {
		assert.ok((await vscode.commands.getCommands(true)).includes('cognify.ai.checkSetup'));
	});

	suite('audit trail (S2-11)', () => {
		const memento = (): CooldownStore => {
			const values = new Map<string, unknown>();
			return {
				get: <T>(key: string, defaultValue?: T) => (values.has(key) ? values.get(key) : defaultValue) as T,
				update: async (key: string, value: unknown) => { values.set(key, value); },
			};
		};

		test('scenario 9: the record for scenario 2 has vendors, error kinds and durations but no message text', async () => {
			await configure({ gemini: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded for SECRET-ERROR-DETAIL' } });
			const router = new CognifyRouter(undefined, memento());
			const { audit } = await router.route({ ...review('UNIQUE-PROMPT-MARKER review function foo()'), requestId: 'cgn-test-9', role: 'reviewer' }, new vscode.CancellationTokenSource().token);
			const exported = JSON.stringify(router.audit.export());
			assert.deepStrictEqual(
				{
					requestId: audit.requestId,
					role: audit.role,
					outcome: audit.outcome,
					servedBy: audit.servedBy?.vendor,
					attempts: audit.attempts.map(a => [a.vendor, a.errorKind, typeof a.durationMs]),
					stored: router.audit.all().map(r => r.requestId),
					leaksPrompt: exported.includes('UNIQUE-PROMPT-MARKER'),
					leaksAnswer: exported.includes('answer from openai'),
					leaksErrorText: exported.includes('SECRET-ERROR-DETAIL'),
				},
				{
					requestId: 'cgn-test-9',
					role: 'reviewer',
					outcome: 'fallback-success',
					servedBy: 'openai',
					attempts: [['gemini', 'rate-limited', 'number'], ['openai', undefined, 'number']],
					stored: ['cgn-test-9'],
					leaksPrompt: false,
					leaksAnswer: false,
					leaksErrorText: false,
				},
			);
		});

		test('records persist in workspace storage, keep the privacy class, and can be amended and cleared', async () => {
			const store = memento();
			await new CognifyRouter(undefined, store).route({ ...review(), privacy: 'local-only', requestId: 'cgn-a' }, new vscode.CancellationTokenSource().token);
			const reloaded = new CognifyRouter(undefined, store);
			await reloaded.audit.amend('cgn-a', { outcome: 'stream-error', reason: 'stream failed' });
			assert.deepStrictEqual(reloaded.audit.all().map(r => [r.requestId, r.privacy, r.outcome, r.servedBy?.vendor]), [['cgn-a', 'local-only', 'stream-error', 'ollama']]);
			await reloaded.audit.clear();
			assert.deepStrictEqual(new CognifyRouter(undefined, store).audit.all(), []);
		});

		test('the export and clear commands are registered', async () => {
			const commands = await vscode.commands.getCommands(true);
			assert.deepStrictEqual(['cognify.ai.exportAuditLog', 'cognify.ai.clearAuditLog'].map(id => commands.includes(id)), [true, true]);
		});
	});

	suite('route explanation (S2-12)', () => {
		test('explains a fallback route from its audit record, without content', async () => {
			await configure({ gemini: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' } });
			const { audit } = await (await api()).router.route({ ...review('UNIQUE-PROMPT-MARKER review this'), requestId: 'cgn-explain', role: 'reviewer' }, new vscode.CancellationTokenSource().token);
			const { message, detail } = formatRouteExplanation(audit);
			assert.deepStrictEqual(
				{
					message,
					attemptLines: detail.split('\n').filter(line => /^\s+\d+\. /.test(line)).map(line => line.replace(/\d+ ms/, 'N ms')),
					mentionsPrivacy: detail.includes('Privacy: cloud.'),
					leaksPrompt: detail.includes('UNIQUE-PROMPT-MARKER'),
				},
				{
					message: 'openai (fake-gpt) served this review request.',
					attemptLines: [
						'  1. gemini (fake-gemini-pro): rate-limited after N ms (rule rate-limit)',
						'  2. openai (fake-gpt): accepted after N ms',
					],
					mentionsPrivacy: true,
					leaksPrompt: false,
				},
			);
		});

		test('the footer link targets the explain command with the request id', async () => {
			assert.deepStrictEqual(
				{ link: /\(command:cognify\.ai\.explainRoute\?%5B%22cgn-1%22%5D /.test(explainRouteLink('cgn-1')), registered: (await vscode.commands.getCommands(true)).includes(EXPLAIN_ROUTE_COMMAND) },
				{ link: true, registered: true },
			);
		});
	});

	suite('role commands through the participant handler (S2-13)', () => {
		const run = async (command: string | undefined, prompt: string) => {
			const router = new CognifyRouter();
			const output: string[] = [];
			const stream: RoleResponseStream = {
				markdown: value => { output.push(typeof value === 'string' ? value : value.value); },
				progress: () => { },
			};
			const log = { info: () => { }, warn: () => { } };
			const result = await createRoleHandler(router, log)({ command, prompt, references: [] }, stream, new vscode.CancellationTokenSource().token);
			const text = output.join('');
			return { result, text, audit: router.audit.all(), calls: (await calls()).map(c => c.vendor) };
		};

		test('/explain is served by the Tutor through the same router, footer and audit trail', async () => {
			const { result, text, audit, calls: vendors } = await run('explain', 'what is a closure?');
			assert.deepStrictEqual(
				{
					answered: text.startsWith('answer from copilot'),
					footerRole: text.includes('role **Tutor**') && text.includes('task `explain`'),
					footerLink: text.includes('command:cognify.ai.explainRoute'),
					metadata: [result.metadata?.cognify.role, result.metadata?.cognify.task, result.metadata?.cognify.servedBy?.vendor, result.metadata?.cognify.handoff],
					audit: audit.map(r => [r.role, r.task, r.outcome, r.servedBy?.vendor]),
					vendors,
				},
				{
					answered: true,
					footerRole: true,
					footerLink: true,
					metadata: ['tutor', 'explain', 'copilot', undefined],
					audit: [['tutor', 'explain', 'success', 'copilot']],
					vendors: ['copilot'],
				},
			);
		});

		test('/review keeps its behavior after the refactor', async () => {
			const { result, text } = await run('review', 'focus on errors');
			assert.deepStrictEqual(
				[result.metadata?.cognify.role, result.metadata?.cognify.servedBy?.vendor, result.metadata?.cognify.handoff?.toRole, text.includes('Suggested handoff: **Tester**')],
				['reviewer', 'gemini', 'tester', true],
			);
		});

		test('/explain with no question and no code asks for one instead of calling a model', async () => {
			const { result, text, audit, calls: vendors } = await run('explain', '   ');
			assert.deepStrictEqual({ asks: text.includes('What should the Tutor explain?'), metadata: result.metadata, audit, vendors }, { asks: true, metadata: undefined, audit: [], vendors: [] });
		});

		test('an unknown command lists the available roles', async () => {
			const { text, calls: vendors } = await run(undefined, 'hello');
			assert.deepStrictEqual({ lists: text.includes('`/review`') && text.includes('`/explain`'), vendors }, { lists: true, vendors: [] });
		});
	});

	suite('Cognify role models (S3-03)', () => {
		const TOOL: vscode.LanguageModelChatTool = { name: 'cognify_test_readFile', description: 'Reads a file.', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } };

		async function roleModel(name: string): Promise<vscode.LanguageModelChat> {
			const [model] = await vscode.lm.selectChatModels({ vendor: 'cognify' }).then(models => models.filter(m => m.name === name));
			assert.ok(model, `${name} not registered`);
			return model;
		}

		async function collect(response: vscode.LanguageModelChatResponse): Promise<string[]> {
			const parts: string[] = [];
			for await (const part of response.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					parts.push(`text:${part.value}`);
				} else if (part instanceof vscode.LanguageModelToolCallPart) {
					parts.push(`tool:${part.name}:${JSON.stringify(part.input)}`);
				}
			}
			return parts;
		}

		test('one model per role in the handoff chain, all tool-calling', async () => {
			const models = await vscode.lm.selectChatModels({ vendor: 'cognify' });
			assert.deepStrictEqual(
				models.map(m => [m.name, m.capabilities.supportsToolCalling]).sort(),
				[['Cognify · Coder', true], ['Cognify · Planner', true], ['Cognify · Reviewer', true], ['Cognify · Tester', true]],
			);
		});

		test('a tool-carrying request is routed by task, with the tools forwarded and the tool call streamed back', async () => {
			// Coder's task is `edit`, which prefers Copilot.
			await configure({ copilot: { kind: 'tool-call', name: TOOL.name, input: { path: 'src/a.ts' } } });
			const response = await (await roleModel('Cognify · Coder')).sendRequest([vscode.LanguageModelChatMessage.User('read src/a.ts')], { tools: [TOOL], justification: 'cognify-ai integration test' });
			const parts = await collect(response);
			const record = (await api()).router.audit.all().at(-1);
			assert.deepStrictEqual(
				{ parts, calls: (await calls()).map(c => [c.vendor, c.toolNames]), role: record?.role, task: record?.task, servedBy: record?.servedBy?.vendor },
				{ parts: ['tool:cognify_test_readFile:{"path":"src/a.ts"}'], calls: [['copilot', ['cognify_test_readFile']]], role: 'coder', task: 'edit', servedBy: 'copilot' },
			);
		});

		test('tool results are passed back to the model, and models without tool calling are skipped', async () => {
			await configure({ copilot: { kind: 'ok', text: 'done' } });
			const messages = [
				vscode.LanguageModelChatMessage.User('read src/a.ts'),
				vscode.LanguageModelChatMessage.Assistant([new vscode.LanguageModelToolCallPart('call-1', TOOL.name, { path: 'src/a.ts' })]),
				vscode.LanguageModelChatMessage.User([new vscode.LanguageModelToolResultPart('call-1', [new vscode.LanguageModelTextPart('export const a = 1;')])]),
			];
			const parts = await collect(await (await roleModel('Cognify · Tester')).sendRequest(messages, { tools: [TOOL], justification: 'cognify-ai integration test' }));
			const record = (await api()).router.audit.all().at(-1);
			assert.deepStrictEqual(
				{ parts, results: (await calls()).map(c => c.toolResultIds), ollamaSkipped: record?.excluded.some(e => e.vendor === 'ollama' && /tool/i.test(e.reason)), routedToSelf: record?.attempts.some(a => a.vendor === 'cognify') },
				{ parts: ['text:done'], results: [['call-1']], ollamaSkipped: true, routedToSelf: false },
			);
		});

		test('a provider that fails before its first part falls back to the next vendor for the task', async () => {
			await configure({ copilot: { kind: 'throw', message: '429 Too Many Requests: rate limit exceeded' }, openai: { kind: 'tool-call', name: TOOL.name, input: {} } });
			const parts = await collect(await (await roleModel('Cognify · Coder')).sendRequest([vscode.LanguageModelChatMessage.User('go')], { tools: [TOOL], justification: 'cognify-ai integration test' }));
			assert.deepStrictEqual({ parts, calls: (await calls()).map(c => c.vendor) }, { parts: ['tool:cognify_test_readFile:{}'], calls: ['copilot', 'openai'] });
		});

		test('a credential in a tool result makes the request local-only, and no cloud vendor sees it', async () => {
			// Assembled at runtime so no token-shaped literal is committed.
			const key = `sk-${'A1b2C3d4'.repeat(5)}`;
			const messages = [
				vscode.LanguageModelChatMessage.User('read .env'),
				vscode.LanguageModelChatMessage.Assistant([new vscode.LanguageModelToolCallPart('call-1', TOOL.name, { path: '.env' })]),
				vscode.LanguageModelChatMessage.User([new vscode.LanguageModelToolResultPart('call-1', [new vscode.LanguageModelTextPart(`OPENAI_API_KEY=${key}`)])]),
			];
			// The only local model (ollama) can't call tools, so nothing may serve this request.
			await assert.rejects(
				async () => collect(await (await roleModel('Cognify · Coder')).sendRequest(messages, { tools: [TOOL], justification: 'cognify-ai integration test' })),
				/could not route this request/,
			);
			const record = (await api()).router.audit.all().at(-1);
			assert.deepStrictEqual({ calls: await calls(), privacy: record?.privacy, keyInRecord: JSON.stringify(record).includes(key) }, { calls: [], privacy: 'local-only', keyInRecord: false });
		});
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

suite('role personas (S2-14)', () => {
	const personaFiles = ['planner', 'coder', 'reviewer', 'tester'];

	test('the personas are registered as chat agents', async () => {
		const extensionPath = (await api(), vscode.extensions.getExtension('vscode.cognify-ai')!.extensionUri.path);
		const files = await vscode.commands.executeCommand<{ uri: vscode.Uri; type: string; extensionId: string }[]>('_listExtensionPromptFiles');
		const ours = files
			.filter(file => file.extensionId === 'vscode.cognify-ai')
			.map(file => ({ type: file.type, path: vscode.Uri.from(file.uri).path.slice(extensionPath.length) }))
			.sort((a, b) => a.path.localeCompare(b.path));
		assert.deepStrictEqual(ours, personaFiles.sort().map(name => ({ type: 'agent', path: `/agents/${name}.agent.md` })));
	});

	test('upstream\'s prompt validator reports no problems in the persona files', async () => {
		const extensionUri = vscode.extensions.getExtension('vscode.cognify-ai')!.extensionUri;
		const problems: Record<string, string[]> = {};
		for (const name of personaFiles) {
			const uri = vscode.Uri.joinPath(extensionUri, 'agents', `${name}.agent.md`);
			const document = await vscode.workspace.openTextDocument(uri);
			await vscode.window.showTextDocument(document);
			// The validator runs for open editors and only reports when it finds something;
			// give it time, then read every diagnostic for the file.
			await new Promise(resolve => setTimeout(resolve, 1500));
			// `search` and `edit` are contributed by the Copilot extension, which this test instance
			// does not load; the validator only hints that they are ignored here.
			problems[name] = vscode.languages.getDiagnostics(uri)
				.filter(d => !(d.severity === vscode.DiagnosticSeverity.Hint && /^Unknown tool '(search|edit)' will be ignored\.$/.test(d.message)))
				.map(d => `${vscode.DiagnosticSeverity[d.severity]}: ${d.message}`);
			await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
		}
		assert.deepStrictEqual(problems, Object.fromEntries(personaFiles.map(name => [name, []])));
	});
});
