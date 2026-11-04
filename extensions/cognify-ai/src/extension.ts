/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyAiApi, CognifyRouter } from './routing';
import { checkAiSetup, registerAiSetup } from './aiSetup';
import { registerCognifyModelProvider } from './modelProvider';
import { ProjectModelService } from './projectModelService';
import { registerProjectModelTool } from './projectModelTool';
import { registerRouteExplanation } from './routeExplanation';
import { createRoleHandler } from './roles';

const PARTICIPANT_ID = 'cognify.roles';

export function activate(context: vscode.ExtensionContext): CognifyAiApi {
	const log = vscode.window.createOutputChannel('Cognify AI', { log: true });
	// Cooldowns are per user (globalState); the audit trail is per workspace (workspaceState).
	const router = new CognifyRouter(context.globalState, context.workspaceState);

	const projectModel = new ProjectModelService(context.storageUri, log);

	const handleRequest = createRoleHandler(router, log);
	const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, (request, _chatContext, stream, token) => handleRequest(request, stream, token));
	participant.iconPath = new vscode.ThemeIcon('sparkle');

	context.subscriptions.push(
		log,
		participant,
		vscode.commands.registerCommand('cognify.ai.showAuditLog', () => log.show()),
		vscode.commands.registerCommand('cognify.ai.exportAuditLog', () => exportAuditLog(router)),
		vscode.commands.registerCommand('cognify.ai.clearAuditLog', async () => {
			const clear = vscode.l10n.t('Clear');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Clear the Cognify AI routing log for this workspace?'), { modal: true }, clear) === clear) {
				await router.audit.clear();
			}
		}),
		registerAiSetup(context, router, log),
		registerRouteExplanation(router),
		registerCognifyModelProvider(router, log),
		registerProjectModelTool(projectModel, log),
	);

	return { router, projectModel, checkSetup: () => checkAiSetup(router) };
}

/**
 * Save the workspace's routing audit trail as JSON (contract section 9). The
 * records are metadata only, so the file holds no prompts, code or responses.
 */
async function exportAuditLog(router: CognifyRouter): Promise<void> {
	const records = router.audit.all();
	if (records.length === 0) {
		vscode.window.showInformationMessage(vscode.l10n.t('The Cognify AI routing log for this workspace is empty.'));
		return;
	}
	const fileName = `cognify-ai-routing-log-${new Date().toISOString().slice(0, 10)}.json`;
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
	const target = await vscode.window.showSaveDialog({
		title: vscode.l10n.t('Export AI Routing Log'),
		defaultUri: folder ? vscode.Uri.joinPath(folder, fileName) : undefined,
		filters: { [vscode.l10n.t('JSON')]: ['json'] },
	});
	if (!target) {
		return;
	}
	await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(JSON.stringify(router.audit.export(), undefined, '\t')));
	vscode.window.showInformationMessage(vscode.l10n.t('Exported {0} routing record(s) to {1}.', records.length, vscode.workspace.asRelativePath(target)));
}
