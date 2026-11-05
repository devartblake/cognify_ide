/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The New Project flow (Sprint 4, S4-05): template, name, location, environment, then the files.
// The steps ask through `NewProjectUi`, so the flow is unit-tested without `vscode`, and
// nothing is written until every step is answered.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { checkRequirements, type RequirementCheck, type RuntimeId, type RuntimeStatus } from './runtimes.ts';
import { deriveNames, renderCommands, renderTemplate, type ProjectNameProblem, type Template, type TemplateCommands, validateProjectName, writeProject } from './templates.ts';

/** Where the project builds, tests and runs (D3): on this machine, or in its Dev Container. */
export type ProjectEnvironment = 'host' | 'container';

/** Written into every new project; S4-07 and Project Cognition (S4-09) read it. */
export const PROJECT_FILE = '.cognify/project.json';

export interface CognifyProjectFile {
	readonly version: 1;
	readonly template: string;
	readonly environment: ProjectEnvironment;
	readonly commands: TemplateCommands;
	/** The ports the app listens on, from the template (S5-04); the first one is the preview. */
	readonly ports?: readonly number[];
}

export interface TemplateChoice {
	readonly template: Template;
	/** What this machine has for the template. */
	readonly host: RequirementCheck;
}

/** The questions the flow asks. Each returns `undefined` when the user cancels. */
export interface NewProjectUi {
	pickTemplate(choices: readonly TemplateChoice[]): Promise<Template | undefined>;
	inputName(validate: (name: string) => ProjectNameProblem | undefined): Promise<string | undefined>;
	/** The folder the project folder is created in. */
	pickParentFolder(): Promise<string | undefined>;
	/** Only asked when a Dev Container is available; otherwise the project uses the host. */
	pickEnvironment(host: RequirementCheck): Promise<ProjectEnvironment | undefined>;
}

export type NewProjectStep = 'template' | 'name' | 'location' | 'environment';

export type NewProjectResult =
	| { readonly outcome: 'created'; readonly folder: string; readonly template: string; readonly environment: ProjectEnvironment; readonly host: RequirementCheck }
	| { readonly outcome: 'cancelled'; readonly step: NewProjectStep }
	| { readonly outcome: 'notEmpty'; readonly folder: string };

/** A Dev Container can run when the bundled CLI is there and Docker answers. */
export function containerAvailable(runtimes: ReadonlyMap<RuntimeId, RuntimeStatus>, devContainerCli: boolean): boolean {
	return devContainerCli && runtimes.get('docker')?.state === 'found';
}

/** Runs the flow. Writes only after the last answer, and never into a folder that has files. */
export async function runNewProject(options: {
	readonly templates: readonly Template[];
	readonly runtimes: ReadonlyMap<RuntimeId, RuntimeStatus>;
	readonly container: boolean;
	readonly ui: NewProjectUi;
}): Promise<NewProjectResult> {
	const { templates, runtimes, container, ui } = options;
	const choices = templates.map(template => ({ template, host: checkRequirements(template.manifest.requirements, runtimes) }));

	const template = await ui.pickTemplate(choices);
	if (!template) {
		return { outcome: 'cancelled', step: 'template' };
	}
	const host = choices.find(c => c.template === template)?.host ?? checkRequirements(template.manifest.requirements, runtimes);

	const name = await ui.inputName(validateProjectName);
	if (name === undefined || validateProjectName(name)) {
		return { outcome: 'cancelled', step: 'name' };
	}
	const names = deriveNames(name);

	const parent = await ui.pickParentFolder();
	if (!parent) {
		return { outcome: 'cancelled', step: 'location' };
	}
	const folder = join(parent, names.packageName);
	if (await hasEntries(folder)) {
		return { outcome: 'notEmpty', folder };
	}

	const environment = container ? await ui.pickEnvironment(host) : 'host';
	if (!environment) {
		return { outcome: 'cancelled', step: 'environment' };
	}

	const project: CognifyProjectFile = { version: 1, template: template.manifest.id, environment, commands: renderCommands(template.manifest, names), ...(template.manifest.ports?.length ? { ports: template.manifest.ports } : {}) };
	// The Dev Container preset is written either way, so the project can switch later.
	await writeProject(folder, [...renderTemplate(template, names), { path: PROJECT_FILE, content: JSON.stringify(project, null, '\t') + '\n' }]);
	return { outcome: 'created', folder, template: template.manifest.id, environment, host };
}

async function hasEntries(folder: string): Promise<boolean> {
	try {
		return (await fs.readdir(folder)).length > 0;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return false;
		}
		throw error;
	}
}
