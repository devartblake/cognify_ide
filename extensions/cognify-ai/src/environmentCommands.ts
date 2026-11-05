/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { resolveDevContainerCli } from './environments/devContainerCli';
import { containerAvailable, NewProjectResult, NewProjectUi, ProjectEnvironment, runNewProject } from './environments/newProject';
import { hostOs, PackageManager, Remediation, remediationFor } from './environments/remediation';
import { checkRequirements, detectRuntimes, nodeProcessRunner, ProcessRunner, RequirementCheck, RUNTIME_IDS, RuntimeId, RuntimeState, RuntimeStatus } from './environments/runtimes';
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

/** A tool that needs attention: missing, stopped, failing, or older than a template needs. */
interface Problem {
	readonly runtime: RuntimeId;
	readonly state: RuntimeState | 'outdated';
}

type EnvironmentItem = vscode.QuickPickItem & { readonly problems?: readonly Problem[]; readonly recheck?: boolean };

function runtimeItem(status: RuntimeStatus): EnvironmentItem {
	const name = RUNTIME_NAMES[status.id];
	const problems = [{ runtime: status.id, state: status.state }];
	switch (status.state) {
		case 'found':
			return { label: `$(check) ${name}`, description: status.version };
		case 'notRunning':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Installed, but not running'), problems };
		case 'timeout':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Didn\'t answer in time'), problems };
		case 'error':
			return { label: `$(warning) ${name}`, description: vscode.l10n.t('Installed, but reported an error'), detail: status.detail, problems };
		default:
			return { label: `$(circle-slash) ${name}`, description: vscode.l10n.t('Not found'), problems };
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

function templateItem(t: TemplateReadiness): EnvironmentItem {
	const needs = describeNeeds(t.host);
	const problems: Problem[] = [...t.host.missing.map(m => ({ runtime: m.runtime, state: m.status.state })), ...t.host.outdated.map(o => ({ runtime: o.runtime, state: 'outdated' as const }))];
	return {
		problems: problems.length ? problems : undefined,
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

/** Names of the package managers a suggested command uses. */
function packageManagerName(via: PackageManager): string {
	switch (via) {
		case 'winget': return vscode.l10n.t('winget (Windows Package Manager)');
		case 'homebrew': return vscode.l10n.t('Homebrew');
		case 'apt': return vscode.l10n.t('apt (Debian and Ubuntu)');
		case 'npm': return 'npm';
		case 'python': return 'Python';
		case 'systemctl': return vscode.l10n.t('systemd');
	}
}

type RemediationChoice = 'terminal' | 'copy' | 'link' | 'devContainer' | 'recheck';

/**
 * How to fix one tool (S4-08, D5). Nothing is installed or run: "Open in Terminal" types the
 * command into a new terminal without pressing Enter, so the user reviews and runs it.
 */
async function showRemediation(remediation: Remediation, log: RoleLog): Promise<RemediationChoice | undefined> {
	const name = RUNTIME_NAMES[remediation.runtime];
	const command = remediation.command;
	const items: (vscode.QuickPickItem & { choice: RemediationChoice })[] = [
		...(command ? [
			{ choice: 'terminal' as const, label: `$(terminal) ${vscode.l10n.t('Open in Terminal')}`, description: command.text, detail: vscode.l10n.t('Types the command into a new terminal without running it. Check it, then press Enter.') },
			{ choice: 'copy' as const, label: `$(copy) ${vscode.l10n.t('Copy Command')}`, description: command.text },
		] : []),
		{ choice: 'link', label: `$(link-external) ${vscode.l10n.t('Open the Install Page')}`, description: remediation.link },
		...(remediation.devContainerInstead ? [{ choice: 'devContainer' as const, label: `$(vm) ${vscode.l10n.t('Use a Dev Container Instead')}`, detail: vscode.l10n.t('Create the project with a Dev Container, which comes with the tools. Edit it on this machine.') }] : []),
		{ choice: 'recheck', label: `$(refresh) ${vscode.l10n.t('Re-check')}` },
	];
	const picked = await vscode.window.showQuickPick(items, {
		title: remediation.action === 'start' ? vscode.l10n.t('Start {0}', name) : vscode.l10n.t('Install {0}', name),
		placeHolder: command
			? vscode.l10n.t('The command uses {0}. Cognify never runs it for you.', packageManagerName(command.via))
			: remediation.action === 'start' ? vscode.l10n.t('Start {0} from its app, then re-check.', name) : vscode.l10n.t('Follow the install page for your system, then re-check.'),
	});
	if (!picked) {
		return undefined;
	}
	log.info(JSON.stringify({ event: 'remediation', runtime: remediation.runtime, action: remediation.action, choice: picked.choice }));
	switch (picked.choice) {
		case 'terminal': {
			const terminal = vscode.window.createTerminal({ name: vscode.l10n.t('Install {0}', name) });
			terminal.show();
			// `false`: no newline, so the command is typed but not run.
			terminal.sendText(command!.text, false);
			break;
		}
		case 'copy':
			await vscode.env.clipboard.writeText(command!.text);
			break;
		case 'link':
			await vscode.env.openExternal(vscode.Uri.parse(remediation.link));
			break;
		case 'devContainer':
			await vscode.commands.executeCommand('cognify.newProject');
			break;
	}
	return picked.choice;
}

/** Check Environment: runtimes and templates; picking a problem shows how to fix it, and Re-check runs again. */
async function showEnvironment(context: vscode.ExtensionContext, log: RoleLog): Promise<void> {
	for (; ;) {
		const report = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Checking the environment…') }, () => checkEnvironment(context.extensionUri));
		// Metadata only: tool names, states and versions.
		log.info(JSON.stringify({
			event: 'environment-check',
			runtimes: Object.fromEntries([...report.runtimes].map(([id, s]) => [id, s.version ?? s.state])),
			templatesReady: report.templates.filter(t => t.host.met).map(t => t.id),
			devContainers: report.templates.some(t => t.container),
		}));
		const picked = await vscode.window.showQuickPick<EnvironmentItem>([
			{ label: `$(refresh) ${vscode.l10n.t('Re-check')}`, recheck: true },
			{ label: vscode.l10n.t('Runtimes'), kind: vscode.QuickPickItemKind.Separator },
			...[...report.runtimes.values()].map(runtimeItem),
			{ label: vscode.l10n.t('Templates'), kind: vscode.QuickPickItemKind.Separator },
			...report.templates.map(templateItem),
		], { title: vscode.l10n.t('Cognify Environment'), placeHolder: vscode.l10n.t('Choose a tool or template that needs something to see how to fix it'), matchOnDescription: true });
		if (picked?.recheck) {
			continue;
		}
		const problems = picked?.problems ?? [];
		const problem = problems.length > 1
			? (await vscode.window.showQuickPick(problems.map(p => ({ label: RUNTIME_NAMES[p.runtime], problem: p })), { placeHolder: vscode.l10n.t('Which tool?') }))?.problem
			: problems[0];
		const remediation = problem && remediationFor(problem.runtime, problem.state, hostOs(process.platform), containerAvailable(report.runtimes, report.devContainerCli));
		if (!remediation || await showRemediation(remediation, log) !== 'recheck') {
			return;
		}
	}
}

export function registerEnvironmentCommands(context: vscode.ExtensionContext, log: RoleLog): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.commands.registerCommand('cognify.newProject', () => newProject(context, log)),
		vscode.commands.registerCommand('cognify.environment.check', () => showEnvironment(context, log)),
	);
}
