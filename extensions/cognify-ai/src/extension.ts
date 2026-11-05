/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyAiApi, CognifyRouter } from './routing';
import { checkAiSetup, registerAiSetup } from './aiSetup';
import { checkEnvironment, createProject, registerEnvironmentCommands } from './environmentCommands';
import { projectTasks, registerEnvironmentTasks } from './environmentTasks';
import { ProjectRunner, registerRunCommands } from './runProject';
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
	const runner = new ProjectRunner();

	const handleRequest = createRoleHandler(router, log);
	const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, (request, _chatContext, stream, token) => handleRequest(request, stream, token));
	participant.iconPath = new vscode.ThemeIcon('sparkle');

	context.subscriptions.push(
		log,
		registerEnvironmentCommands(context, log),
		registerEnvironmentTasks(log),
		runner,
		registerRunCommands(runner, log),
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
		projectModel,
		vscode.commands.registerCommand('cognify.ai.showProjectModel', async () => {
			const document = await vscode.workspace.openTextDocument({ language: 'json', content: JSON.stringify(await projectModel.get(), null, '\t') });
			await vscode.window.showTextDocument(document, { preview: true });
		}),
		vscode.commands.registerCommand('cognify.ai.rebuildProjectModel', async () => {
			const model = await projectModel.rebuild();
			vscode.window.showInformationMessage(vscode.l10n.t('Project model rebuilt: {0} packages, {1} CI pipelines, {2} files in {3} ms.', model.packages.length, model.ci.length, model.coverage.filesScanned, model.coverage.durationMs));
		}),
		vscode.commands.registerCommand('cognify.ai.clearProjectModel', async () => {
			await projectModel.clear();
			vscode.window.showInformationMessage(vscode.l10n.t('Project model cleared. It is rebuilt the next time it is used.'));
		}),
	);

	return { router, projectModel, checkSetup: () => checkAiSetup(router), checkEnvironment: run => checkEnvironment(context.extensionUri, run), createProject: (ui, run) => createProject(context.extensionUri, ui, run), projectTasks: (folder, runners) => projectTasks(folder, vscode.TaskScope.Workspace, runners),
		runProject: (folder, options) => runner.run(folder, vscode.TaskScope.Workspace, options), stopProject: folder => runner.stop(folder), projectRunState: folder => runner.state(folder),
	};
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
