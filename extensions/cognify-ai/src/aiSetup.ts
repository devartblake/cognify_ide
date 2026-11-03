/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isLocalVendor } from './privacy';
import { CognifyRouter, readPrivacySettings, readRoutingSettings } from './routing';
import { AiSetupAssessment, assessAiSetup, VendorSetup } from './setup';

/** Copilot's sign-in and setup flow (registered by the chat setup contribution). */
const SIGN_IN_COMMAND = 'workbench.action.chat.triggerSetup';
const DONT_SHOW_SETUP_NOTICE_KEY = 'cognify.ai.setupNotice.dontShow.v1';
/** How long to wait for providers to register models before warning at activation. */
const MODEL_SETTLE_MS = 5_000;

/** Assess the current AI setup from `vscode.lm` and the Cognify settings. */
export async function checkAiSetup(router: CognifyRouter): Promise<AiSetupAssessment> {
	const settings = readRoutingSettings();
	const models = await vscode.lm.selectChatModels();
	return assessAiSetup(models, { isLocalVendor, disabledVendors: settings.disabledVendors, cooldownUntil: vendor => router.cooldownUntil(vendor) });
}

function readinessMessage(assessment: AiSetupAssessment): string {
	switch (assessment.readiness) {
		case 'ready':
			return vm.ready();
		case 'needs-copilot':
			return vm.needsCopilot();
		case 'no-models':
			return vm.noModels();
	}
}

/** Localized messages, kept together so the notice and the report use the same wording. */
const vm = {
	ready: () => vscode.l10n.t('Cognify AI is ready: GitHub Copilot is signed in, so Chat can run `@cognify` roles.'),
	needsCopilot: () => vscode.l10n.t('Cognify chat roles need a GitHub Copilot sign-in. Other language models are available to the Cognify router, but Chat only runs `@cognify` requests once Copilot is signed in.'),
	noModels: () => vscode.l10n.t('No language model is available. Cognify chat roles need a GitHub Copilot sign-in; you can also add models from other providers or a local Ollama.'),
};

function describeVendor(vendor: VendorSetup, now: number): string {
	const kind = vendor.kind === 'copilot'
		? vscode.l10n.t('GitHub Copilot')
		: vendor.kind === 'local'
			? vscode.l10n.t('local')
			: vscode.l10n.t('your API key is configured');
	const notes = [kind];
	if (vendor.disabled) {
		notes.push(vscode.l10n.t('disabled in settings'));
	}
	if (vendor.cooldownUntil !== undefined && vendor.cooldownUntil > now) {
		notes.push(vscode.l10n.t('cooling down for {0} s after an error', Math.ceil((vendor.cooldownUntil - now) / 1000)));
	}
	return vscode.l10n.t('- `{0}`: {1} model(s) ({2})', vendor.vendor, vendor.models, notes.join(', '));
}

/**
 * A plain-text setup report: readiness, vendors with model counts, and the
 * routing and privacy settings in effect. It never contains API keys: Cognify
 * never reads them (keys stay in each provider's secret storage).
 */
export function formatAiSetupReport(assessment: AiSetupAssessment, now = Date.now()): string {
	const routing = readRoutingSettings();
	const privacy = readPrivacySettings();
	const onOff = (value: boolean) => value ? vscode.l10n.t('on') : vscode.l10n.t('off');
	const list = (values: ReadonlySet<string>) => values.size > 0 ? [...values].join(', ') : vscode.l10n.t('none');
	return [
		vscode.l10n.t('Cognify AI setup'),
		readinessMessage(assessment),
		vscode.l10n.t('Language model vendors:'),
		...(assessment.vendors.length > 0 ? assessment.vendors.map(vendor => describeVendor(vendor, now)) : [vscode.l10n.t('- none')]),
		vscode.l10n.t('Routing: preferred vendor {0}; pinned model {1}; disabled vendors {2}; cost limit {3}.', routing.preferredVendor ?? vscode.l10n.t('none'), routing.pinnedModel ?? vscode.l10n.t('none'), list(routing.disabledVendors), routing.maxCostTier ?? 'premium'),
		vscode.l10n.t('Privacy: local only {0}; confidential workspace {1}; trusted vendors {2}.', onOff(privacy.localOnly), onOff(privacy.confidentialWorkspace), list(routing.trustedVendors)),
		vscode.l10n.t('API keys are never read or shown by Cognify; a vendor listed with "your API key is configured" has a key set in its provider.'),
	].join('\n');
}

/**
 * Register `Cognify: Check AI Setup` and, at activation, warn once when Chat
 * cannot run `@cognify` (no Copilot model). Activation happens when a user
 * invokes `@cognify`, even if Chat then refuses the request with "Language
 * model unavailable" before the participant handler runs, so this is the
 * earliest point at which Cognify can explain the requirement.
 */
export function registerAiSetup(context: vscode.ExtensionContext, router: CognifyRouter, log: vscode.LogOutputChannel): vscode.Disposable {
	const store: vscode.Disposable[] = [];

	const showReport = async (): Promise<AiSetupAssessment> => {
		const assessment = await checkAiSetup(router);
		for (const line of formatAiSetupReport(assessment).split('\n')) {
			log.info(line);
		}
		const showDetails = vscode.l10n.t('Show Details');
		const signIn = vscode.l10n.t('Sign In to Copilot');
		const choice = assessment.readiness === 'ready'
			? await vscode.window.showInformationMessage(readinessMessage(assessment), showDetails)
			: await vscode.window.showWarningMessage(readinessMessage(assessment), signIn, showDetails);
		if (choice === signIn) {
			await vscode.commands.executeCommand(SIGN_IN_COMMAND);
		} else if (choice === showDetails) {
			log.show();
		}
		return assessment;
	};
	store.push(vscode.commands.registerCommand('cognify.ai.checkSetup', showReport));

	if (!context.globalState.get<boolean>(DONT_SHOW_SETUP_NOTICE_KEY)) {
		const noticeCts = new vscode.CancellationTokenSource();
		store.push(noticeCts);
		void warnIfNotReady(context, router, noticeCts.token);
	}

	return vscode.Disposable.from(...store);
}

async function warnIfNotReady(context: vscode.ExtensionContext, router: CognifyRouter, token: vscode.CancellationToken): Promise<void> {
	let assessment = await checkAiSetup(router);
	if (assessment.readiness !== 'ready') {
		// Copilot registers its models shortly after startup; give providers a moment.
		await new Promise<void>(resolve => {
			const pending = new vscode.CancellationTokenSource();
			const subscriptions: vscode.Disposable[] = [pending];
			const done = () => {
				subscriptions.forEach(subscription => subscription.dispose());
				resolve();
			};
			const timer = setTimeout(done, MODEL_SETTLE_MS);
			subscriptions.push(
				new vscode.Disposable(() => clearTimeout(timer)),
				token.onCancellationRequested(done),
				vscode.lm.onDidChangeChatModels(async () => {
					if ((await checkAiSetup(router)).readiness === 'ready') {
						done();
					}
				}),
			);
		});
		assessment = await checkAiSetup(router);
	}
	if (token.isCancellationRequested || assessment.readiness === 'ready') {
		return;
	}
	const signIn = vscode.l10n.t('Sign In to Copilot');
	const checkSetup = vscode.l10n.t('Check AI Setup');
	const dontShowAgain = vscode.l10n.t('Don\'t Show Again');
	const choice = await vscode.window.showWarningMessage(readinessMessage(assessment), signIn, checkSetup, dontShowAgain);
	if (choice === signIn) {
		await vscode.commands.executeCommand(SIGN_IN_COMMAND);
	} else if (choice === checkSetup) {
		await vscode.commands.executeCommand('cognify.ai.checkSetup');
	} else if (choice === dontShowAgain) {
		await context.globalState.update(DONT_SHOW_SETUP_NOTICE_KEY, true);
	}
}
