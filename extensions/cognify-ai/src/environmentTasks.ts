/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Managed local in the editor (S4-07): `cognify` tasks for the template's commands, and the
// Start, Stop and Rebuild Environment commands. Everything runs only in trusted workspaces.

import * as vscode from 'vscode';
import { resolveDevContainerCli, runDevContainerCli } from './environments/devContainerCli';
import { DevContainerRunner, EnvironmentOutput, ManagedEnvironment, PROJECT_COMMANDS, ProjectCommand, readProjectFile } from './environments/managedLocal';
import type { CognifyProjectFile } from './environments/newProject';
import { nodeProcessRunner, ProcessRunner } from './environments/runtimes';
import type { RoleLog } from './roles';

export const TASK_TYPE = 'cognify';

interface CognifyTaskDefinition extends vscode.TaskDefinition {
	readonly command: ProjectCommand;
}

/** The CLI and Docker runners; injectable for tests. */
export interface EnvironmentRunners {
	readonly cli?: DevContainerRunner;
	readonly docker?: ProcessRunner;
}

function managedEnvironment(folder: string, runners: EnvironmentRunners): ManagedEnvironment | undefined {
	let cli = runners.cli;
	if (!cli) {
		const path = resolveDevContainerCli(vscode.env.appRoot);
		if (!path) {
			return undefined;
		}
		cli = (args, options) => runDevContainerCli(path, args, { onOutput: options.onOutput, signal: options.signal });
	}
	return new ManagedEnvironment(folder, cli, runners.docker ?? nodeProcessRunner());
}

const noCliMessage = () => vscode.l10n.t('This build of Cognify IDE has no Dev Container CLI, so Dev Containers are unavailable.');

/** A terminal that runs `work`, streams its output, and closes with its exit code. Closing it cancels the work. */
function workTerminal(work: (output: EnvironmentOutput, signal: AbortSignal) => Promise<number | null>): vscode.Pseudoterminal {
	const onDidWrite = new vscode.EventEmitter<string>();
	const onDidClose = new vscode.EventEmitter<number>();
	const abort = new AbortController();
	const write = (text: string) => onDidWrite.fire(text.replace(/\r?\n/g, '\r\n'));
	const finish = (code: number) => {
		onDidClose.fire(code);
		onDidWrite.dispose();
		onDidClose.dispose();
	};
	return {
		onDidWrite: onDidWrite.event,
		onDidClose: onDidClose.event,
		open: async () => {
			try {
				finish(await work({ write, retrying: () => write(`\n${vscode.l10n.t('The image download failed. Trying once more...')}\n`) }, abort.signal) ?? 1);
			} catch (error) {
				write(`\n${abort.signal.aborted ? vscode.l10n.t('Stopped.') : String(error instanceof Error ? error.message : error)}\n`);
				finish(1);
			}
		},
		close: () => abort.abort(),
	};
}

function projectTask(folder: string, project: CognifyProjectFile, command: ProjectCommand, scope: vscode.WorkspaceFolder | vscode.TaskScope.Workspace, runners: EnvironmentRunners): vscode.Task | undefined {
	const args = project.commands[command];
	if (!args) {
		return undefined;
	}
	const definition: CognifyTaskDefinition = { type: TASK_TYPE, command };
	const inContainer = project.environment === 'container';
	const execution = inContainer
		? new vscode.CustomExecution(async () => workTerminal(async (output, signal) => {
			const environment = managedEnvironment(folder, runners);
			if (!environment) {
				output.write(`${noCliMessage()}\n`);
				return 1;
			}
			return environment.exec(args, output, signal);
		}))
		// Each argument is quoted as a whole: the shell only finds the program (for example npm.cmd on Windows).
		: new vscode.ShellExecution(args[0], args.slice(1).map(value => ({ value, quoting: vscode.ShellQuoting.Strong })), { cwd: folder });
	const task = new vscode.Task(definition, scope, command, TASK_TYPE, execution, []);
	task.detail = inContainer ? vscode.l10n.t('{0} (in the Dev Container)', args.join(' ')) : args.join(' ');
	task.group = command === 'build' ? vscode.TaskGroup.Build : command === 'test' ? vscode.TaskGroup.Test : undefined;
	// The app keeps running until it is stopped (S5-04).
	task.isBackground = command === 'run';
	return task;
}

/** The `cognify` tasks of a project folder: its template commands, on the host or in its Dev Container. */
export async function projectTasks(folder: string, scope: vscode.WorkspaceFolder | vscode.TaskScope.Workspace, runners: EnvironmentRunners = {}): Promise<vscode.Task[]> {
	const project = await readProjectFile(folder);
	return project ? PROJECT_COMMANDS.map(command => projectTask(folder, project, command, scope, runners)).filter(task => !!task) : [];
}

class CognifyTaskProvider implements vscode.TaskProvider {
	async provideTasks(): Promise<vscode.Task[]> {
		if (!vscode.workspace.isTrusted) {
			return [];
		}
		const tasks: vscode.Task[] = [];
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			if (folder.uri.scheme === 'file') {
				tasks.push(...await projectTasks(folder.uri.fsPath, folder));
			}
		}
		return tasks;
	}

	async resolveTask(task: vscode.Task): Promise<vscode.Task | undefined> {
		const command = (task.definition as CognifyTaskDefinition).command;
		const scope = task.scope;
		if (!vscode.workspace.isTrusted || typeof scope !== 'object' || scope.uri.scheme !== 'file' || !PROJECT_COMMANDS.includes(command)) {
			return undefined;
		}
		const project = await readProjectFile(scope.uri.fsPath);
		return project && projectTask(scope.uri.fsPath, project, command, scope, {});
	}
}

/** The workspace folder of a Cognify project, asking when there are several. */
export async function pickProject(containerOnly: boolean): Promise<{ folder: vscode.WorkspaceFolder; project: CognifyProjectFile } | undefined> {
	if (!vscode.workspace.isTrusted) {
		vscode.window.showInformationMessage(vscode.l10n.t('Trust this workspace to build, test and run it.'));
		return undefined;
	}
	const projects: { folder: vscode.WorkspaceFolder; project: CognifyProjectFile }[] = [];
	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		const project = folder.uri.scheme === 'file' ? await readProjectFile(folder.uri.fsPath) : undefined;
		if (project && (!containerOnly || project.environment === 'container')) {
			projects.push({ folder, project });
		}
	}
	if (!projects.length) {
		vscode.window.showInformationMessage(containerOnly
			? vscode.l10n.t('This workspace has no Cognify project that uses a Dev Container. Create one with "Cognify: New Project...".')
			: vscode.l10n.t('This workspace has no Cognify project. Create one with "Cognify: New Project...".'));
		return undefined;
	}
	if (projects.length === 1) {
		return projects[0];
	}
	const picked = await vscode.window.showQuickPick(projects.map(p => ({ label: p.folder.name, description: p.project.template, value: p })), { placeHolder: vscode.l10n.t('Choose a project') });
	return picked?.value;
}

/** Start or Rebuild Environment: `devcontainer up` in a terminal. */
async function startEnvironment(log: RoleLog, rebuild: boolean): Promise<void> {
	const picked = await pickProject(true);
	if (!picked) {
		return;
	}
	const environment = managedEnvironment(picked.folder.uri.fsPath, {});
	if (!environment) {
		vscode.window.showErrorMessage(noCliMessage());
		return;
	}
	const terminal = vscode.window.createTerminal({
		name: vscode.l10n.t('Dev Container: {0}', picked.folder.name),
		pty: workTerminal(async (output, signal) => {
			const started = Date.now();
			const up = await environment.start(output, signal, rebuild);
			log.info(JSON.stringify({ event: 'environment', action: rebuild ? 'rebuild' : 'start', template: picked.project.template, outcome: up.outcome, durationMs: Date.now() - started }));
			output.write(`\n${up.outcome === 'success' ? vscode.l10n.t('The Dev Container is running. Run the project\'s tasks with "Cognify: Run in Environment...".') : vscode.l10n.t('The Dev Container didn\'t start: {0}', up.message ?? '')}\n`);
			return up.outcome === 'success' ? 0 : 1;
		}),
	});
	terminal.show();
}

async function stopEnvironment(log: RoleLog): Promise<void> {
	const picked = await pickProject(true);
	const environment = picked && managedEnvironment(picked.folder.uri.fsPath, {});
	if (!picked || !environment) {
		return;
	}
	try {
		const stopped = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Stopping the Dev Container...') }, () => environment.stop());
		log.info(JSON.stringify({ event: 'environment', action: 'stop', template: picked.project.template, containers: stopped }));
		vscode.window.showInformationMessage(stopped ? vscode.l10n.t('The Dev Container has stopped.') : vscode.l10n.t('The Dev Container isn\'t running.'));
	} catch (error) {
		vscode.window.showErrorMessage(vscode.l10n.t('Couldn\'t stop the Dev Container: {0}', error instanceof Error ? error.message : String(error)));
	}
}

/** Run in Environment: pick one of the project's commands and run its `cognify` task. */
async function runInEnvironment(): Promise<void> {
	const picked = await pickProject(false);
	if (!picked) {
		return;
	}
	const tasks = await projectTasks(picked.folder.uri.fsPath, picked.folder);
	const task = await vscode.window.showQuickPick(tasks.map(t => ({ label: t.name, detail: t.detail, task: t })), { placeHolder: vscode.l10n.t('Choose what to run') });
	if (task) {
		await vscode.tasks.executeTask(task.task);
	}
}

export function registerEnvironmentTasks(log: RoleLog): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.tasks.registerTaskProvider(TASK_TYPE, new CognifyTaskProvider()),
		vscode.commands.registerCommand('cognify.environment.start', () => startEnvironment(log, false)),
		vscode.commands.registerCommand('cognify.environment.rebuild', () => startEnvironment(log, true)),
		vscode.commands.registerCommand('cognify.environment.stop', () => stopEnvironment(log)),
		vscode.commands.registerCommand('cognify.environment.run', () => runInEnvironment()),
	);
}
