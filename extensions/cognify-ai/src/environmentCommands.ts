/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { resolveDevContainerCli } from './environments/devContainerCli';
import { checkRequirements, detectRuntimes, nodeProcessRunner, ProcessRunner, RequirementCheck, RUNTIME_IDS, RuntimeId, RuntimeStatus } from './environments/runtimes';
import { containerAvailable, NewProjectResult, NewProjectUi, ProjectEnvironment, runNewProject } from './environments/newProject';
import { loadTemplates, ProjectNameProblem } from './environments/templates';
import type { RoleLog } from './roles';

/** Product names: not translated. */
export const RUNTIME_NAMES: Record<RuntimeId, string> = {
	git: 'Git', node: 'Node.js', npm: 'npm', pnpm: 'pnpm', python: 'Python', pip: 'pip', uv: 'uv',
	dotnet: '.NET SDK', flutter: 'Flutter', dart: 'Dart', docker: 'Docker',
};

export interface TemplateReadiness {
	readonly id: string;
	readonly name: string;
	/** Whether the host has what the template needs. */
	readonly host: RequirementCheck;
	/** Whether managed local (a Dev Container) is available: Docker running and the bundled CLI present. */
	readonly container: boolean;
}

export interface EnvironmentReport {
	readonly runtimes: ReadonlyMap<RuntimeId, RuntimeStatus>;
	readonly templates: readonly TemplateReadiness[];
	readonly devContainerCli: boolean;
}

function templatesDir(extensionUri: vscode.Uri): string {
	return vscode.Uri.joinPath(extensionUri, 'templates').fsPath;
}

/** `Cognify: Check Environment` without UI (S4-06). Runs only fixed version commands. */
export async function checkEnvironment(extensionUri: vscode.Uri, run: ProcessRunner = nodeProcessRunner()): Promise<EnvironmentReport> {
	const [runtimes, templates] = await Promise.all([
		detectRuntimes(RUNTIME_IDS, run),
		loadTemplates(templatesDir(extensionUri)),
	]);
	const devContainerCli = !!resolveDevContainerCli(vscode.env.appRoot);
	const container = containerAvailable(runtimes, devContainerCli);
	return {
		runtimes,
		devContainerCli,
		templates: templates.map(t => ({ id: t.manifest.id, name: t.manifest.name, host: checkRequirements(t.manifest.requirements, runtimes), container })),
	};
}

function runtimeItem(status: RuntimeStatus): vscode.QuickPickItem {
	const name = RUNTIME_NAMES[status.id];
	switch (status.state) {
		case 'found':
			return { label: `$(check) ${name}`, description: status.version };
		case 'notRunning':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Installed, but not running') };
		case 'timeout':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Didn\'t answer in time') };
		case 'error':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Installed, but reported an error'), detail: status.detail };
		default:
			return { label: `$(circle-slash) ${name}`, description: vscode.l10n.t('Not found') };
	}
}

/** What the host still needs for a template, as one line. */
export function describeNeeds(host: RequirementCheck): string | undefined {
	const parts = [
		...host.missing.map(m => m.minVersion ? `${RUNTIME_NAMES[m.runtime]} ${m.minVersion}+` : RUNTIME_NAMES[m.runtime]),
		...host.outdated.map(o => vscode.l10n.t('{0} {1}+ (found {2})', RUNTIME_NAMES[o.runtime], o.minVersion, o.version)),
	];
	return parts.length ? parts.join(', ') : undefined;
}

function templateItem(t: TemplateReadiness): vscode.QuickPickItem {
	const needs = describeNeeds(t.host);
	return {
		label: `${t.host.met ? '$(check)' : '$(circle-slash)'} ${t.name}`,
		description: needs ? vscode.l10n.t('Needs {0}', needs) : vscode.l10n.t('Ready on this machine'),
		detail: t.container ? vscode.l10n.t('Can also run in a Dev Container (managed local).') : vscode.l10n.t('Dev Containers need Docker running.'),
	};
}

/** `Cognify: New Project…` without opening the result (S4-05); the questions and the runner are injectable for tests. */
export async function createProject(extensionUri: vscode.Uri, ui: NewProjectUi, run: ProcessRunner = nodeProcessRunner()): Promise<NewProjectResult> {
	const [runtimes, templates] = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Checking the environment…') }, () => Promise.all([
		detectRuntimes(RUNTIME_IDS, run),
		loadTemplates(templatesDir(extensionUri)),
	]));
	return runNewProject({ templates, runtimes, container: containerAvailable(runtimes, !!resolveDevContainerCli(vscode.env.appRoot)), ui });
}

function nameProblemMessage(problem: ProjectNameProblem): string {
	switch (problem) {
		case 'characters':
			return vscode.l10n.t('Start with a letter, then use letters, digits, spaces, dots, dashes or underscores (up to 64 characters).');
		case 'ending':
			return vscode.l10n.t('End with a letter or digit.');
	}
}

/** The New Project questions as Quick Picks, an input box and a folder dialog. */
function newProjectUi(): NewProjectUi {
	const title = vscode.l10n.t('New Project');
	return {
		async pickTemplate(choices) {
			const picked = await vscode.window.showQuickPick(choices.map(choice => {
				const needs = describeNeeds(choice.host);
				return {
					label: choice.template.manifest.name,
					description: needs ? vscode.l10n.t('Needs {0}', needs) : vscode.l10n.t('Ready on this machine'),
					detail: choice.template.manifest.description,
					template: choice.template,
				};
			}), { title, placeHolder: vscode.l10n.t('Choose a project template'), matchOnDetail: true });
			return picked?.template;
		},
		async inputName(validate) {
			return vscode.window.showInputBox({
				title,
				prompt: vscode.l10n.t('Project name. The folder is named after it.'),
				placeHolder: vscode.l10n.t('My App'),
				validateInput: value => {
					const problem = validate(value);
					return problem && nameProblemMessage(problem);
				},
			});
		},
		async pickParentFolder() {
			const folders = await vscode.window.showOpenDialog({ title: vscode.l10n.t('Choose Where to Create the Project'), openLabel: vscode.l10n.t('Create Project Here'), canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
			return folders?.[0]?.fsPath;
		},
		async pickEnvironment(host) {
			const needs = describeNeeds(host);
			const items: (vscode.QuickPickItem & { environment: ProjectEnvironment })[] = [
				{ environment: 'host', label: `$(device-desktop) ${vscode.l10n.t('This Machine')}`, description: needs ? vscode.l10n.t('Needs {0}', needs) : vscode.l10n.t('Ready'), detail: vscode.l10n.t('Build, test and run with the tools installed here.') },
				{ environment: 'container', label: `$(vm) ${vscode.l10n.t('Dev Container')}`, description: needs ? vscode.l10n.t('Recommended') : undefined, detail: vscode.l10n.t('Build, test and run in a container that has the tools. Edit on this machine; needs Docker.') },
			];
			const picked = await vscode.window.showQuickPick(needs ? items.reverse() : items, { title, placeHolder: vscode.l10n.t('Where should the project build, test and run?') });
			return picked?.environment;
		},
	};
}

async function newProject(context: vscode.ExtensionContext, log: RoleLog): Promise<void> {
	const result = await createProject(context.extensionUri, newProjectUi());
	// Metadata only: no project name or path.
	log.info(JSON.stringify(result.outcome === 'created'
		? { event: 'new-project', outcome: result.outcome, template: result.template, environment: result.environment, hostReady: result.host.met }
		: { event: 'new-project', outcome: result.outcome, step: result.outcome === 'cancelled' ? result.step : undefined }));
	if (result.outcome === 'notEmpty') {
		await vscode.window.showErrorMessage(vscode.l10n.t('{0} already has files in it. Choose another name or location.', result.folder));
		return;
	}
	if (result.outcome !== 'created') {
		return;
	}
	const needs = result.environment === 'host' ? describeNeeds(result.host) : undefined;
	if (needs) {
		const open = vscode.l10n.t('Open Project');
		const answer = await vscode.window.showWarningMessage(vscode.l10n.t('The project was created. To build it on this machine you still need {0}. Run "Cognify: Check Environment" for details.', needs), { modal: true }, open);
		if (answer !== open) {
			return;
		}
	}
	await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.folder), { forceNewWindow: !!vscode.workspace.workspaceFolders?.length });
}

async function showEnvironment(context: vscode.ExtensionContext, log: RoleLog): Promise<void> {
	const report = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Checking the environment…') }, () => checkEnvironment(context.extensionUri));
	// Metadata only: tool names, states and versions.
	log.info(JSON.stringify({
		event: 'environment-check',
		runtimes: Object.fromEntries([...report.runtimes].map(([id, s]) => [id, s.version ?? s.state])),
		templatesReady: report.templates.filter(t => t.host.met).map(t => t.id),
		devContainers: report.templates.some(t => t.container),
	}));
	await vscode.window.showQuickPick([
		{ label: vscode.l10n.t('Runtimes'), kind: vscode.QuickPickItemKind.Separator },
		...[...report.runtimes.values()].map(runtimeItem),
		{ label: vscode.l10n.t('Templates'), kind: vscode.QuickPickItemKind.Separator },
		...report.templates.map(templateItem),
	], { title: vscode.l10n.t('Cognify Environment'), placeHolder: vscode.l10n.t('Tools found on this machine, and what each project template needs'), matchOnDescription: true });
}

export function registerEnvironmentCommands(context: vscode.ExtensionContext, log: RoleLog): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.commands.registerCommand('cognify.newProject', () => newProject(context, log)),
		vscode.commands.registerCommand('cognify.environment.check', () => showEnvironment(context, log)),
	);
}
