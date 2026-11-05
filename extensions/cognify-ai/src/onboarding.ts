/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// First-run onboarding and project-context initialization (Sprint 5, S5-11 and S5-12;
// decisions D5 and D6). Both run after startup has finished, and neither runs in extension tests.

import * as vscode from 'vscode';
import { readProjectFile } from './environments/managedLocal';
import { ProjectModelService } from './projectModelService';
import type { RoleLog } from './roles';

export const WALKTHROUGH_ID = 'vscode.cognify-ai#cognify.gettingStarted';
const WALKTHROUGH_SHOWN_KEY = 'cognify.onboarding.walkthroughShown.v1';
const PROJECT_NOTE_SHOWN_KEY = 'cognify.onboarding.projectNoteShown.v1';
/** How long after startup to start indexing, so the window is idle first. */
const INDEX_DELAY_MS = 5_000;

/**
 * Opens the Get Started walkthrough the first time Cognify runs (D5). Upstream's first-run dialog,
 * when it shows, stays in front; the walkthrough is behind it when the dialog closes.
 */
export async function showFirstRunWalkthrough(globalState: vscode.Memento): Promise<'opened' | 'alreadyShown'> {
	if (globalState.get<boolean>(WALKTHROUGH_SHOWN_KEY)) {
		return 'alreadyShown';
	}
	await globalState.update(WALKTHROUGH_SHOWN_KEY, true);
	await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false);
	return 'opened';
}

export type IndexOnOpenResult = 'built' | 'disabled' | 'untrusted' | 'noFolder';

/**
 * Builds (or loads) the project model for a trusted workspace (D6), within the indexer's budgets.
 * Untrusted workspaces keep the on-demand, manifest-only behavior.
 */
export async function indexOnOpen(projectModel: ProjectModelService): Promise<IndexOnOpenResult> {
	if (!vscode.workspace.workspaceFolders?.length) {
		return 'noFolder';
	}
	if (!vscode.workspace.getConfiguration('cognify.projectModel').get<boolean>('indexOnOpen', true)) {
		return 'disabled';
	}
	if (!vscode.workspace.isTrusted) {
		return 'untrusted';
	}
	await projectModel.get();
	return 'built';
}

/** A one-time note in a Cognify project: what Cognify already knows, and how to run it. */
async function showProjectNote(workspaceState: vscode.Memento): Promise<void> {
	if (workspaceState.get<boolean>(PROJECT_NOTE_SHOWN_KEY)) {
		return;
	}
	const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
	const projects = await Promise.all(folders.map(folder => readProjectFile(folder.uri.fsPath)));
	if (!projects.some(project => !!project)) {
		return;
	}
	await workspaceState.update(PROJECT_NOTE_SHOWN_KEY, true);
	const run = vscode.l10n.t('Run Project');
	if (await vscode.window.showInformationMessage(vscode.l10n.t('Cognify knows how to run and test this project. Ask it with @cognify /guide, or run it now.'), run) === run) {
		await vscode.commands.executeCommand('cognify.project.run');
	}
}

export function registerOnboarding(context: vscode.ExtensionContext, projectModel: ProjectModelService, log: RoleLog): vscode.Disposable {
	if (context.extensionMode === vscode.ExtensionMode.Test) {
		// Tests call these through the API instead, with a known state.
		return vscode.Disposable.from();
	}
	void showFirstRunWalkthrough(context.globalState);
	const timer = setTimeout(async () => {
		try {
			const started = Date.now();
			const result = await indexOnOpen(projectModel);
			log.info(JSON.stringify({ event: 'index-on-open', result, durationMs: Date.now() - started }));
			if (result === 'built') {
				await showProjectNote(context.workspaceState);
			}
		} catch (error) {
			log.warn(`[project-model] index on open failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}, INDEX_DELAY_MS);
	return new vscode.Disposable(() => clearTimeout(timer));
}
