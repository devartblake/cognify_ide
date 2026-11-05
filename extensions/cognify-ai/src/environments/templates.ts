/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Project templates (Sprint 4, S4-04; decision D2: bundled, Cognify-owned, pinned).
// A template is a folder `templates/<id>/` with `template.json` and `files/`. Paths and
// contents may use `{{projectName}}`, `{{packageName}}`, `{{dotnetName}}` and `{{dartPackage}}`.
// No `vscode` import: unit-tested with `node --test`.

import { promises as fs } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import type { RuntimeId } from './runtimes.ts';

export interface TemplateRequirement {
	readonly runtime: RuntimeId;
	/** Lowest accepted version, compared numerically by dot-separated parts. */
	readonly minVersion?: string;
	readonly optional?: boolean;
}

/** Commands as argument arrays: they are never passed to a shell. */
export interface TemplateCommands {
	readonly install?: readonly string[];
	readonly build?: readonly string[];
	readonly test: readonly string[];
	readonly run: readonly string[];
}

export interface TemplateManifest {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly requirements: readonly TemplateRequirement[];
	/** The Dev Container preset in `files/.devcontainer`: an image, or a Dockerfile. */
	readonly devcontainer: { readonly image: string } | { readonly dockerfile: string };
	readonly commands: TemplateCommands;
	readonly ports?: readonly number[];
}

export interface TemplateFile {
	/** Relative, with `/` separators. */
	readonly path: string;
	readonly content: string;
}

export interface Template {
	readonly manifest: TemplateManifest;
	readonly files: readonly TemplateFile[];
}

/** The forms of the project name that templates substitute. */
export interface ProjectNames {
	/** As the user typed it: titles and messages. */
	readonly projectName: string;
	/** npm and Python distribution names: lowercase words joined by `-`. */
	readonly packageName: string;
	/** C# project and namespace: PascalCase identifier. */
	readonly dotnetName: string;
	/** Dart package: lowercase words joined by `_`. */
	readonly dartPackage: string;
}

const PLACEHOLDER = /\{\{(?<name>\w+)\}\}/g;
const PROJECT_NAME = /^[A-Za-z][A-Za-z0-9 ._-]{0,63}$/;

/** Why a name can't be a project name: the caller words the message. */
export type ProjectNameProblem = 'characters' | 'ending';

/** What's wrong with `name` as a project name, or `undefined` if nothing is. */
export function validateProjectName(name: string): ProjectNameProblem | undefined {
	if (!PROJECT_NAME.test(name)) {
		return 'characters';
	}
	if (!/[A-Za-z0-9]$/.test(name)) {
		return 'ending';
	}
	return undefined;
}

export function deriveNames(projectName: string): ProjectNames {
	const words = projectName.split(/[^A-Za-z0-9]+/).filter(Boolean);
	const lower = words.map(word => word.toLowerCase());
	return {
		projectName,
		packageName: lower.join('-'),
		dotnetName: words.map(word => word[0].toUpperCase() + word.slice(1)).join(''),
		dartPackage: lower.join('_'),
	};
}

/** Substitutes the names into every path and content. Throws on an unknown placeholder. */
export function renderTemplate(template: Template, names: ProjectNames): TemplateFile[] {
	const values: Record<string, string> = { ...names };
	const substitute = (text: string, where: string) => text.replace(PLACEHOLDER, (match, name: string) => {
		const value = values[name];
		if (value === undefined) {
			throw new Error(`Template ${template.manifest.id}: unknown placeholder ${match} in ${where}`);
		}
		return value;
	});
	return template.files.map(file => ({ path: substitute(file.path, file.path), content: substitute(file.content, file.path) }));
}

/** Template commands with the names substituted (for example the ASP.NET Core project path). */
export function renderCommands(manifest: TemplateManifest, names: ProjectNames): TemplateCommands {
	const values: Record<string, string> = { ...names };
	const render = (args: readonly string[] | undefined) => args?.map(arg => arg.replace(PLACEHOLDER, (match, name: string) => values[name] ?? match));
	return { install: render(manifest.commands.install), build: render(manifest.commands.build), test: render(manifest.commands.test)!, run: render(manifest.commands.run)! };
}

/** Problems in a manifest; empty when it is valid. */
export function validateManifest(value: unknown, folderName: string): string[] {
	const problems: string[] = [];
	const m = value as Partial<TemplateManifest> | null;
	if (!m || typeof m !== 'object') {
		return ['template.json is not an object'];
	}
	if (m.id !== folderName) {
		problems.push(`id "${m.id}" doesn't match the folder "${folderName}"`);
	}
	for (const key of ['name', 'description'] as const) {
		if (typeof m[key] !== 'string' || !m[key]) {
			problems.push(`missing ${key}`);
		}
	}
	if (!Array.isArray(m.requirements)) {
		problems.push('missing requirements');
	}
	const devcontainer = m.devcontainer as { readonly image?: unknown; readonly dockerfile?: unknown } | undefined;
	if (!devcontainer || (typeof devcontainer.image !== 'string' && typeof devcontainer.dockerfile !== 'string')) {
		problems.push('devcontainer needs an image or a dockerfile');
	}
	if (!Array.isArray(m.commands?.test) || !Array.isArray(m.commands?.run)) {
		problems.push('commands need test and run');
	}
	return problems;
}

/** Reads every template under `templatesDir`, sorted by id. Throws on an invalid manifest. */
export async function loadTemplates(templatesDir: string): Promise<Template[]> {
	const templates: Template[] = [];
	for (const entry of (await fs.readdir(templatesDir, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
		const folder = join(templatesDir, entry.name);
		const manifest = JSON.parse(await fs.readFile(join(folder, 'template.json'), 'utf8')) as TemplateManifest;
		const problems = validateManifest(manifest, entry.name);
		if (problems.length) {
			throw new Error(`Template ${entry.name}: ${problems.join('; ')}`);
		}
		const filesRoot = join(folder, 'files');
		const files: TemplateFile[] = [];
		for (const path of await listFiles(filesRoot)) {
			files.push({ path: relative(filesRoot, path).split(sep).join('/'), content: await fs.readFile(path, 'utf8') });
		}
		templates.push({ manifest, files: files.sort((a, b) => a.path.localeCompare(b.path)) });
	}
	return templates;
}

/**
 * Build and dependency output that tools can create inside a template's own folder, for example
 * when an editor restores the ASP.NET Core template's projects. It is never part of a template.
 */
const BUILD_OUTPUT_DIRS: ReadonlySet<string> = new Set(['bin', 'obj', 'node_modules', '.dart_tool', '__pycache__', '.venv', '.next', '.pytest_cache']);

async function listFiles(dir: string): Promise<string[]> {
	const result: string[] = [];
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && BUILD_OUTPUT_DIRS.has(entry.name)) {
			continue;
		}
		const path = join(dir, entry.name);
		result.push(...(entry.isDirectory() ? await listFiles(path) : [path]));
	}
	return result;
}

/**
 * Writes the rendered files into `targetDir`, which must not exist or be empty: an existing
 * project is never overwritten. Paths are checked to stay inside the target.
 */
export async function writeProject(targetDir: string, files: readonly TemplateFile[]): Promise<void> {
	const existing = await fs.readdir(targetDir).catch((error: NodeJS.ErrnoException) => {
		if (error.code === 'ENOENT') {
			return [];
		}
		throw error;
	});
	if (existing.length) {
		throw new Error(`${targetDir} isn't empty`);
	}
	// Check every path before writing anything, so a bad template leaves nothing behind.
	const targets = files.map(file => {
		const target = join(targetDir, ...file.path.split('/'));
		if (relative(targetDir, target).startsWith('..')) {
			throw new Error(`${file.path} is outside the project folder`);
		}
		return { target, content: file.content };
	});
	for (const { target, content } of targets) {
		await fs.mkdir(dirname(target), { recursive: true });
		await fs.writeFile(target, content);
	}
}
