/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run and preview (Sprint 5, S5-04 and S5-05; decisions D1 and D2). Run starts the project's
// `cognify: run` task in the background, waits for its port to serve HTTP, and opens the app in
// the preview. Stop ends the task; a Dev Container keeps running until Stop Environment.

import * as vscode from 'vscode';
import { EnvironmentRunners, pickProject, projectTasks } from './environmentTasks';
import { readProjectFile } from './environments/managedLocal';
import { isPortInUse, waitForHttp } from './environments/portProbe';
import { openPreview, PreviewSurface } from './preview';
import type { RoleLog } from './roles';

export type RunOutcome =
	| { readonly outcome: 'running'; readonly port: number; readonly url: string; readonly surface: PreviewSurface }
	/** Started, but the project declares no port, so there is nothing to preview. */
	| { readonly outcome: 'noPreview' }
	/** Something else already listens on the project's port, so the app wasn't started. */
	| { readonly outcome: 'portInUse'; readonly port: number }
	/** The app is still starting (or stuck): the task keeps running. */
	| { readonly outcome: 'timeout'; readonly port: number }
	/** The task ended before the app answered. */
	| { readonly outcome: 'ended' }
	| { readonly outcome: 'noProject' };

export type RunState = { readonly state: 'stopped' } | { readonly state: 'starting'; readonly port?: number } | { readonly state: 'running'; readonly port?: number; readonly url?: string };

export interface RunOptions {
	/** How long to wait for the app to answer; defaults to 60 s on the host, 120 s in a Dev Container. */
	readonly timeoutMs?: number;
	readonly runners?: EnvironmentRunners;
}

interface ActiveRun {
	readonly execution: vscode.TaskExecution;
	readonly abort: AbortController;
	readonly port?: number;
	url?: string;
}

/** The running app of each project folder. */
export class ProjectRunner implements vscode.Disposable {
	private readonly runs = new Map<string, ActiveRun>();
	private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChange = this.onDidChangeEmitter.event;
	private readonly taskListener: vscode.Disposable;

	constructor() {
		this.taskListener = vscode.tasks.onDidEndTask(e => {
			for (const [folder, run] of this.runs) {
				if (run.execution === e.execution) {
					run.abort.abort();
					this.runs.delete(folder);
					this.onDidChangeEmitter.fire();
				}
			}
		});
	}

	state(folder: string): RunState {
		const run = this.runs.get(folder);
		if (!run) {
			return { state: 'stopped' };
		}
		return run.url || run.port === undefined ? { state: 'running', port: run.port, url: run.url } : { state: 'starting', port: run.port };
	}

	/** Folders with a running or starting app. */
	activeFolders(): string[] {
		return [...this.runs.keys()];
	}

	async run(folder: string, scope: vscode.WorkspaceFolder | vscode.TaskScope.Workspace, options: RunOptions = {}): Promise<RunOutcome> {
		const existing = this.runs.get(folder);
		if (existing?.url && existing.port !== undefined) {
			// Already running: bring the preview back.
			return { outcome: 'running', port: existing.port, url: existing.url, surface: await openPreview(vscode.Uri.parse(existing.url)) };
		}
		const project = await readProjectFile(folder);
		const task = project && (await projectTasks(folder, scope, options.runners)).find(t => t.name === 'run');
		if (!project || !task) {
			return { outcome: 'noProject' };
		}
		const port = project.ports?.[0];
		if (!existing && port !== undefined && await isPortInUse(port)) {
			return { outcome: 'portInUse', port };
		}
		let run = existing;
		if (!run) {
			run = { execution: await vscode.tasks.executeTask(task), abort: new AbortController(), port };
			this.runs.set(folder, run);
			this.onDidChangeEmitter.fire();
		}
		if (port === undefined) {
			return { outcome: 'noPreview' };
		}
		const timeoutMs = options.timeoutMs ?? (project.environment === 'container' ? 120_000 : 60_000);
		const state = await waitForHttp(port, { timeoutMs, signal: run.abort.signal });
		if (state === 'aborted') {
			return { outcome: 'ended' };
		}
		if (state === 'timeout') {
			return { outcome: 'timeout', port };
		}
		run.url = `http://localhost:${port}/`;
		this.onDidChangeEmitter.fire();
		return { outcome: 'running', port, url: run.url, surface: await openPreview(vscode.Uri.parse(run.url)) };
	}

	/** Ends the app's task. Resolves once the task has ended. */
	async stop(folder: string): Promise<void> {
		const run = this.runs.get(folder);
		if (!run) {
			return;
		}
		const ended = new Promise<void>(resolve => {
			const listener = vscode.tasks.onDidEndTask(e => {
				if (e.execution === run.execution) {
					listener.dispose();
					resolve();
				}
			});
		});
		run.execution.terminate();
		await ended;
	}

	dispose(): void {
		for (const run of this.runs.values()) {
			run.abort.abort();
		}
		this.taskListener.dispose();
		this.onDidChangeEmitter.dispose();
	}
}

async function runCommand(runner: ProjectRunner, log: RoleLog): Promise<void> {
	const picked = await pickProject(false);
	if (!picked) {
		return;
	}
	const started = Date.now();
	const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Starting {0}...', picked.folder.name) }, () => runner.run(picked.folder.uri.fsPath, picked.folder));
	// Metadata only.
	log.info(JSON.stringify({ event: 'run', template: picked.project.template, environment: picked.project.environment, outcome: result.outcome, waitedMs: Date.now() - started }));
	switch (result.outcome) {
		case 'noPreview':
			vscode.window.showInformationMessage(vscode.l10n.t('{0} is running. It has no port to preview.', picked.folder.name));
			break;
		case 'portInUse': {
			const open = vscode.l10n.t('Open What Is Running');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Port {0} is already in use, so {1} wasn\'t started. Stop the other app, then run again.', result.port, picked.folder.name), open) === open) {
				await openPreview(vscode.Uri.parse(`http://localhost:${result.port}/`));
			}
			break;
		}
		case 'timeout': {
			const preview = vscode.l10n.t('Open Preview Anyway');
			const check = vscode.l10n.t('Check Environment');
			const answer = await vscode.window.showWarningMessage(vscode.l10n.t('{0} didn\'t answer on port {1} yet. It may still be starting; check its terminal for errors.', picked.folder.name, result.port), preview, check);
			if (answer === preview) {
				await openPreview(vscode.Uri.parse(`http://localhost:${result.port}/`));
			} else if (answer === check) {
				await vscode.commands.executeCommand('cognify.environment.check');
			}
			break;
		}
		case 'ended': {
			const check = vscode.l10n.t('Check Environment');
			if (await vscode.window.showErrorMessage(vscode.l10n.t('{0} stopped before it was ready. Check its terminal for errors.', picked.folder.name), check) === check) {
				await vscode.commands.executeCommand('cognify.environment.check');
			}
			break;
		}
	}
}

/** The folder whose app the command acts on: the only running one, or the user's pick. */
async function pickRunning(runner: ProjectRunner): Promise<string | undefined> {
	const folders = runner.activeFolders();
	if (folders.length <= 1) {
		return folders[0];
	}
	return (await vscode.window.showQuickPick(folders.map(folder => ({ label: vscode.workspace.getWorkspaceFolder(vscode.Uri.file(folder))?.name ?? folder, folder })), { placeHolder: vscode.l10n.t('Choose a running project') }))?.folder;
}

/** The status-bar item (S5-05): Run, Starting, or Running with the port; and Stop while active. */
class RunStatus implements vscode.Disposable {
	private readonly main = vscode.window.createStatusBarItem('cognify.run', vscode.StatusBarAlignment.Left, 10);
	private readonly stop = vscode.window.createStatusBarItem('cognify.run.stop', vscode.StatusBarAlignment.Left, 9);
	private readonly disposables: vscode.Disposable[] = [this.main, this.stop];
	private readonly runner: ProjectRunner;
	private hasProject = false;

	constructor(runner: ProjectRunner) {
		this.runner = runner;
		this.main.name = vscode.l10n.t('Cognify Run');
		this.stop.name = vscode.l10n.t('Cognify Stop');
		this.stop.text = '$(debug-stop)';
		this.stop.tooltip = vscode.l10n.t('Stop the App');
		this.stop.command = 'cognify.project.stop';
		const watcher = vscode.workspace.createFileSystemWatcher('**/.cognify/project.json');
		this.disposables.push(
			watcher,
			watcher.onDidCreate(() => this.refreshProjects()),
			watcher.onDidDelete(() => this.refreshProjects()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => this.refreshProjects()),
			vscode.workspace.onDidGrantWorkspaceTrust(() => this.refreshProjects()),
			runner.onDidChange(() => this.update()),
		);
		void this.refreshProjects();
	}

	private async refreshProjects(): Promise<void> {
		const folders = (vscode.workspace.workspaceFolders ?? []).filter(folder => folder.uri.scheme === 'file');
		this.hasProject = vscode.workspace.isTrusted && (await Promise.all(folders.map(folder => readProjectFile(folder.uri.fsPath)))).some(project => !!project);
		this.update();
	}

	private update(): void {
		const active = this.runner.activeFolders().map(folder => this.runner.state(folder));
		const running = active.find(s => s.state === 'running');
		void vscode.commands.executeCommand('setContext', 'cognify.hasProject', this.hasProject);
		void vscode.commands.executeCommand('setContext', 'cognify.projectRunning', active.length > 0);
		if (running && running.state === 'running') {
			this.main.text = running.port ? `$(globe) :${running.port}` : `$(globe) ${vscode.l10n.t('Running')}`;
			this.main.tooltip = vscode.l10n.t('Running. Click to open the preview.');
			this.main.command = 'cognify.project.openPreview';
		} else if (active.length) {
			this.main.text = `$(loading~spin) ${vscode.l10n.t('Starting...')}`;
			this.main.tooltip = vscode.l10n.t('Waiting for the app to answer');
			this.main.command = 'workbench.action.tasks.showTasks';
		} else {
			this.main.text = `$(play) ${vscode.l10n.t('Run')}`;
			this.main.tooltip = vscode.l10n.t('Run the project and open its preview');
			this.main.command = 'cognify.project.run';
		}
		if (this.hasProject || active.length) {
			this.main.show();
		} else {
			this.main.hide();
		}
		if (active.length) {
			this.stop.show();
		} else {
			this.stop.hide();
		}
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export function registerRunCommands(runner: ProjectRunner, log: RoleLog): vscode.Disposable {
	return vscode.Disposable.from(
		new RunStatus(runner),
		vscode.commands.registerCommand('cognify.project.run', () => runCommand(runner, log)),
		vscode.commands.registerCommand('cognify.project.stop', async () => {
			const folder = await pickRunning(runner);
			if (folder) {
				await runner.stop(folder);
			}
		}),
		vscode.commands.registerCommand('cognify.project.openPreview', async () => {
			const folder = await pickRunning(runner);
			const state = folder ? runner.state(folder) : undefined;
			if (state?.state === 'running' && state.url) {
				await openPreview(vscode.Uri.parse(state.url));
			}
		}),
	);
}
