/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { resolveDevContainerCli } from './environments/devContainerCli';
import { checkRequirements, detectRuntimes, nodeProcessRunner, ProcessRunner, RequirementCheck, RUNTIME_IDS, RuntimeId, RuntimeStatus } from './environments/runtimes';
import { loadTemplates } from './environments/templates';
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

/** `Cognify: Check Environment` without UI (S4-06). Runs only fixed version commands. */
export async function checkEnvironment(extensionUri: vscode.Uri, run: ProcessRunner = nodeProcessRunner()): Promise<EnvironmentReport> {
	const [runtimes, templates] = await Promise.all([
		detectRuntimes(RUNTIME_IDS, run),
		loadTemplates(vscode.Uri.joinPath(extensionUri, 'templates').fsPath),
	]);
	const devContainerCli = !!resolveDevContainerCli(vscode.env.appRoot);
	const container = devContainerCli && runtimes.get('docker')?.state === 'found';
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

export function registerEnvironmentCommands(context: vscode.ExtensionContext, log: RoleLog): vscode.Disposable {
	return vscode.commands.registerCommand('cognify.environment.check', async () => {
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
	});
}
