/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { CognifyRouteAuditRecord } from './audit';
import type { CognifyRouter } from './routing';

/** Opens the route explanation for a request id (S2-12). Hidden from the Command Palette. */
export const EXPLAIN_ROUTE_COMMAND = 'cognify.ai.explainRoute';

/**
 * A Markdown command link to the explanation of one routed request. The footer
 * that embeds it must trust only `EXPLAIN_ROUTE_COMMAND`.
 */
export function explainRouteLink(requestId: string): string {
	const args = encodeURIComponent(JSON.stringify([requestId]));
	return `[${vscode.l10n.t('Why this provider?')}](command:${EXPLAIN_ROUTE_COMMAND}?${args} "${vscode.l10n.t('Show how Cognify chose the provider for this response')}")`;
}

/**
 * Explain a route from its audit record: the reason, every attempt with its
 * error kind and duration, the models that were skipped and why, the privacy
 * class, and the input size. Built from metadata only, like the record itself.
 */
export function formatRouteExplanation(record: CognifyRouteAuditRecord): { readonly message: string; readonly detail: string } {
	const served = record.servedBy
		? vscode.l10n.t('{0} ({1}) served this {2} request.', record.servedBy.vendor, record.servedBy.modelId, record.task)
		: vscode.l10n.t('No provider served this {0} request (outcome: {1}).', record.task, record.outcome);
	const lines: string[] = [record.reason, ''];

	lines.push(vscode.l10n.t('Attempts:'));
	if (record.attempts.length === 0) {
		lines.push(vscode.l10n.t('  none; no provider was contacted'));
	}
	record.attempts.forEach((attempt, index) => {
		lines.push(attempt.errorKind
			? vscode.l10n.t('  {0}. {1} ({2}): {3} after {4} ms (rule {5})', index + 1, attempt.vendor, attempt.modelId, attempt.errorKind, attempt.durationMs, attempt.errorRule ?? '-')
			: vscode.l10n.t('  {0}. {1} ({2}): accepted after {3} ms', index + 1, attempt.vendor, attempt.modelId, attempt.durationMs));
	});

	if (record.excluded.length > 0) {
		lines.push('', vscode.l10n.t('Skipped:'));
		for (const entry of record.excluded) {
			lines.push(vscode.l10n.t('  {0} ({1}): {2}', entry.vendor, entry.modelId, entry.reason));
		}
	}

	lines.push('', record.privacyReasons.length > 0
		? vscode.l10n.t('Privacy: {0}, because {1}.', record.privacy, record.privacyReasons.join('; '))
		: vscode.l10n.t('Privacy: {0}.', record.privacy));
	if (record.inputTokens !== undefined) {
		lines.push(vscode.l10n.t('Input size: {0} tokens (counted by the serving provider).', record.inputTokens));
	}
	lines.push(vscode.l10n.t('Request {0}{1} at {2}.', record.requestId, record.role ? ` (${record.role})` : '', new Date(record.timestamp).toLocaleString()));
	return { message: served, detail: lines.join('\n') };
}

/** Register the command behind the footer's "Why this provider?" link. */
export function registerRouteExplanation(router: CognifyRouter): vscode.Disposable {
	return vscode.commands.registerCommand(EXPLAIN_ROUTE_COMMAND, async (requestId: unknown) => {
		const record = typeof requestId === 'string' ? router.audit.all().find(entry => entry.requestId === requestId) : undefined;
		if (!record) {
			await vscode.window.showInformationMessage(vscode.l10n.t('The routing details for this response are no longer available. The routing log keeps the last requests of this workspace and may have been cleared.'));
			return;
		}
		const { message, detail } = formatRouteExplanation(record);
		await vscode.window.showInformationMessage(message, { modal: true, detail });
	});
}
