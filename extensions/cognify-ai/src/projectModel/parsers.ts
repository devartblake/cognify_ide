/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Parsers for the Project Cognition inputs (PROJECT_COGNITION_MVP.md, section 3). Pure:
// each takes a workspace-relative path and the file's text, and returns a fragment of
// the model. Nothing here executes code, reads other files, or keeps file contents.

import { parse as parseYaml } from 'yaml';
import { redactSecrets } from '../privacy.ts';
import type { CiJob, CiPipeline, CiTrigger, Convention, DependencyEdge, EntryPoint, Evidence, PackageNode, TestSuite } from './model.ts';
import { parseTomlSubset, type TomlValue } from './toml.ts';

/** What one file contributes. Internal dependencies are resolved later, across packages. */
export interface ModelFragment {
	readonly packages?: readonly PackageNode[];
	readonly dependencies?: readonly DependencyEdge[];
	readonly entryPoints?: readonly EntryPoint[];
	readonly tests?: readonly TestSuite[];
	readonly ci?: readonly CiPipeline[];
	readonly conventions?: readonly Convention[];
	/** Workspace member globs declared by this file (npm/pnpm workspaces, Cargo members). */
	readonly workspaceGlobs?: readonly string[];
}

/** The folder containing a workspace-relative file, `.` for the root. */
export function folderOf(file: string): string {
	const index = file.lastIndexOf('/');
	return index < 0 ? '.' : file.slice(0, index);
}

function packageId(ecosystem: string, folder: string): string {
	return `${ecosystem}:${folder}`;
}

function stringRecord(value: unknown): Record<string, string> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/** Commands are declared text; redact credentials before they go into the model. */
function command(text: string): string {
	return redactSecrets(text.split(/\r?\n/)[0].trim()).slice(0, 300);
}

const TEST_FRAMEWORKS: readonly [RegExp, string][] = [
	[/\bvitest\b/, 'vitest'],
	[/\bjest\b/, 'jest'],
	[/\bmocha\b/, 'mocha'],
	[/node\s+(?:[^|&;]*\s)?--test\b/, 'node:test'],
	[/\bplaywright\b/, 'playwright'],
	[/\bava\b/, 'ava'],
	[/\bpytest\b/, 'pytest'],
	[/\bgo test\b/, 'go test'],
	[/\bcargo test\b/, 'cargo test'],
	[/\bdotnet test\b/, 'dotnet test'],
];

export function testFrameworkOf(commandText: string): string | undefined {
	return TEST_FRAMEWORKS.find(([pattern]) => pattern.test(commandText))?.[1];
}

// --- npm / pnpm ---------------------------------------------------------------

export function parsePackageJson(file: string, text: string): ModelFragment {
	const json = JSON.parse(text) as Record<string, unknown>;
	if (typeof json.name !== 'string' && !['scripts', 'dependencies', 'devDependencies', 'main', 'bin', 'workspaces'].some(key => json[key] !== undefined)) {
		// Not a package: a marker such as `{ "type": "module" }` that sets the module format for a folder.
		return {};
	}
	const folder = folderOf(file);
	const id = packageId('npm', folder);
	const evidence: Evidence[] = [{ file, source: 'manifest' }];
	const scripts = Object.fromEntries(Object.entries(stringRecord(json.scripts)).map(([name, value]) => [name, command(value)]));
	const isVsCodeExtension = typeof stringRecord(json.engines).vscode === 'string';
	const pkg: PackageNode = {
		id,
		name: typeof json.name === 'string' ? json.name : folder,
		path: folder,
		ecosystem: 'npm',
		scripts,
		language: 'javascript',
		packageManager: typeof json.packageManager === 'string' ? /^[a-z]+/.exec(json.packageManager)?.[0] : undefined,
		evidence,
		confidence: 'declared',
	};

	const dependencies: DependencyEdge[] = [];
	for (const [field, scope] of [['dependencies', 'runtime'], ['devDependencies', 'dev'], ['peerDependencies', 'peer']] as const) {
		for (const [name, versionSpec] of Object.entries(stringRecord(json[field]))) {
			// `workspace:` specs and local paths are internal; the indexer resolves them by name.
			const internal = versionSpec.startsWith('workspace:') || versionSpec.startsWith('file:') || versionSpec.startsWith('link:');
			dependencies.push({ from: id, to: internal ? `npm-name:${name}` : `external:npm:${name}`, kind: internal ? 'internal' : 'external', scope, versionSpec, evidence, confidence: 'declared' });
		}
	}

	const entryPoints: EntryPoint[] = [];
	if (typeof json.main === 'string') {
		entryPoints.push({ packageId: id, kind: isVsCodeExtension ? 'extension-activation' : 'main', target: json.main, evidence, confidence: 'declared' });
	}
	if (typeof json.browser === 'string') {
		entryPoints.push({ packageId: id, kind: 'browser', target: json.browser, evidence, confidence: 'declared' });
	}
	if (typeof json.bin === 'string') {
		entryPoints.push({ packageId: id, kind: 'bin', target: json.bin, evidence, confidence: 'declared' });
	} else {
		for (const target of Object.values(stringRecord(json.bin))) {
			entryPoints.push({ packageId: id, kind: 'bin', target, evidence, confidence: 'declared' });
		}
	}

	const tests: TestSuite[] = Object.entries(scripts)
		.filter(([name]) => /^test(?:[:-]|$)/.test(name))
		.map(([name, script]) => ({
			packageId: id,
			framework: testFrameworkOf(script) ?? 'unknown',
			command: `${name === 'test' ? 'npm test' : `npm run ${name}`}`,
			globs: [],
			evidence,
			// The command is declared; the framework is read off the script text.
			confidence: testFrameworkOf(script) ? 'inferred' : 'declared',
		}));

	const workspaces = Array.isArray(json.workspaces) ? json.workspaces : (json.workspaces as { packages?: unknown } | undefined)?.packages;
	return {
		packages: [pkg],
		dependencies,
		entryPoints,
		tests,
		workspaceGlobs: Array.isArray(workspaces) ? workspaces.filter((glob): glob is string => typeof glob === 'string') : undefined,
	};
}

export function parsePnpmWorkspace(_file: string, text: string): ModelFragment {
	const yaml = parseYaml(text) as { packages?: unknown } | null;
	const packages = Array.isArray(yaml?.packages) ? yaml.packages.filter((glob): glob is string => typeof glob === 'string') : [];
	return { workspaceGlobs: packages };
}

// --- Python -----------------------------------------------------------------------

function tomlStrings(value: TomlValue | undefined): readonly string[] {
	return Array.isArray(value) ? value : [];
}

export function parsePyproject(file: string, text: string): ModelFragment {
	const toml = parseTomlSubset(text);
	const folder = folderOf(file);
	const id = packageId('python', folder);
	const evidence: Evidence[] = [{ file, source: 'manifest' }];
	const project = toml.get('project');
	const poetry = toml.get('tool.poetry');
	const name = project?.get('name') ?? poetry?.get('name');
	const scripts = Object.fromEntries([...(toml.get('project.scripts') ?? toml.get('tool.poetry.scripts') ?? new Map())]
		.filter((entry): entry is [string, string] => typeof entry[1] === 'string')
		.map(([key, value]) => [key, command(value)]));
	const pkg: PackageNode = { id, name: typeof name === 'string' ? name : folder, path: folder, ecosystem: 'python', scripts, language: 'python', evidence, confidence: 'declared' };

	const dependencies: DependencyEdge[] = [];
	for (const requirement of tomlStrings(project?.get('dependencies'))) {
		const depName = /^[A-Za-z0-9_.-]+/.exec(requirement.trim())?.[0];
		if (depName) {
			dependencies.push({ from: id, to: `external:python:${depName.toLowerCase()}`, kind: 'external', scope: 'runtime', versionSpec: requirement.slice(depName.length).trim() || undefined, evidence, confidence: 'declared' });
		}
	}
	for (const [depName, spec] of toml.get('tool.poetry.dependencies') ?? []) {
		if (depName !== 'python') {
			dependencies.push({ from: id, to: `external:python:${depName.toLowerCase()}`, kind: 'external', scope: 'runtime', versionSpec: typeof spec === 'string' ? spec : undefined, evidence, confidence: 'declared' });
		}
	}

	const entryPoints: EntryPoint[] = Object.values(scripts).map(target => ({ packageId: id, kind: 'script', target, evidence, confidence: 'declared' }));
	const tests: TestSuite[] = toml.has('tool.pytest.ini_options')
		? [{ packageId: id, framework: 'pytest', command: 'pytest', globs: tomlStrings(toml.get('tool.pytest.ini_options')?.get('testpaths')), evidence: [{ file, source: 'config' }], confidence: 'inferred' }]
		: [];
	return { packages: [pkg], dependencies, entryPoints, tests };
}

// --- Go ------------------------------------------------------------------------------

export function parseGoMod(file: string, text: string): ModelFragment {
	const folder = folderOf(file);
	const id = packageId('go', folder);
	const evidence: Evidence[] = [{ file, source: 'manifest' }];
	const module = /^module\s+(\S+)/m.exec(text)?.[1];
	const dependencies: DependencyEdge[] = [];
	const requireBlock = /^require\s*\(([\s\S]*?)^\)/gm;
	const lines = [...text.matchAll(requireBlock)].flatMap(m => m[1].split(/\r?\n/)).concat([...text.matchAll(/^require\s+([^\s(]+\s+\S+)/gm)].map(m => m[1]));
	for (const line of lines) {
		const match = /^\s*(\S+)\s+(\S+)(\s*\/\/\s*indirect)?/.exec(line);
		if (match && !match[3]) {
			dependencies.push({ from: id, to: `external:go:${match[1]}`, kind: 'external', scope: 'runtime', versionSpec: match[2], evidence, confidence: 'declared' });
		}
	}
	return {
		packages: [{ id, name: module ?? folder, path: folder, ecosystem: 'go', scripts: {}, language: 'go', evidence, confidence: 'declared' }],
		dependencies,
		tests: [{ packageId: id, framework: 'go test', command: 'go test ./...', globs: ['**/*_test.go'], evidence, confidence: 'inferred' }],
	};
}

// --- Rust ----------------------------------------------------------------------------

export function parseCargoToml(file: string, text: string): ModelFragment {
	const toml = parseTomlSubset(text);
	const folder = folderOf(file);
	const id = packageId('cargo', folder);
	const evidence: Evidence[] = [{ file, source: 'manifest' }];
	const members = tomlStrings(toml.get('workspace')?.get('members'));
	const name = toml.get('package')?.get('name');
	if (typeof name !== 'string') {
		// A virtual workspace manifest declares members but no package.
		return { workspaceGlobs: members };
	}
	const dependencies: DependencyEdge[] = [];
	for (const [table, scope] of [['dependencies', 'runtime'], ['dev-dependencies', 'dev'], ['build-dependencies', 'build']] as const) {
		for (const [depName, spec] of toml.get(table) ?? []) {
			const internal = typeof spec === 'object' && !Array.isArray(spec) && /\bpath\s*=/.test((spec as { raw: string }).raw);
			dependencies.push({ from: id, to: internal ? `cargo-name:${depName}` : `external:cargo:${depName}`, kind: internal ? 'internal' : 'external', scope, versionSpec: typeof spec === 'string' ? spec : undefined, evidence, confidence: 'declared' });
		}
	}
	return {
		packages: [{ id, name, path: folder, ecosystem: 'cargo', scripts: {}, language: 'rust', evidence, confidence: 'declared' }],
		dependencies,
		tests: [{ packageId: id, framework: 'cargo test', command: 'cargo test', globs: ['tests/**/*.rs'], evidence, confidence: 'inferred' }],
		workspaceGlobs: members.length ? members : undefined,
	};
}

// --- CI ----------------------------------------------------------------------------------

function stringList(value: unknown): string[] | undefined {
	if (typeof value === 'string') {
		return [value];
	}
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

export function parseGithubWorkflow(file: string, text: string): ModelFragment {
	const yaml = parseYaml(text) as Record<string, unknown> | null;
	if (!yaml || typeof yaml !== 'object') {
		return {};
	}
	// YAML 1.1 parsers read the key `on` as `true`; `yaml` (1.2) keeps it as `on`.
	const on = yaml.on ?? yaml.true;
	const triggers: CiTrigger[] = [];
	if (typeof on === 'string' || Array.isArray(on)) {
		for (const event of stringList(on) ?? []) {
			triggers.push({ event });
		}
	} else if (on && typeof on === 'object') {
		for (const [event, config] of Object.entries(on)) {
			const settings = config && typeof config === 'object' ? config as Record<string, unknown> : {};
			triggers.push({ event, branches: stringList(settings.branches), paths: stringList(settings.paths) });
		}
	}
	const jobs: CiJob[] = [];
	for (const [jobId, value] of Object.entries((yaml.jobs && typeof yaml.jobs === 'object') ? yaml.jobs : {})) {
		const job = value && typeof value === 'object' ? value as Record<string, unknown> : {};
		const steps = Array.isArray(job.steps) ? job.steps : [];
		jobs.push({
			id: jobId,
			name: typeof job.name === 'string' ? job.name : undefined,
			runsOn: stringList(job['runs-on'])?.join(', '),
			// Step names, else their command or action; never `env` or `with` values.
			steps: steps.flatMap(step => {
				const s = step && typeof step === 'object' ? step as Record<string, unknown> : {};
				const label = typeof s.name === 'string' ? s.name : typeof s.run === 'string' ? command(s.run) : typeof s.uses === 'string' ? s.uses : undefined;
				return label ? [redactSecrets(label)] : [];
			}),
		});
	}
	const name = typeof yaml.name === 'string' ? yaml.name : file.slice(file.lastIndexOf('/') + 1);
	return { ci: [{ provider: 'github-actions', file, name, triggers, jobs, evidence: [{ file, source: 'workflow' }], confidence: 'declared' }] };
}

// --- Conventions -----------------------------------------------------------------------

/** Up to `max` Markdown headings: what the document covers, not what it says. */
function headings(text: string, max = 6): string {
	const found = [...text.matchAll(/^#{1,3}\s+(.+?)\s*#*$/gm)].map(m => m[1].trim()).slice(0, max);
	return found.length ? found.join('; ') : 'no headings';
}

export function parseConvention(file: string, text: string): ModelFragment {
	const base = file.slice(file.lastIndexOf('/') + 1);
	const evidence: Evidence[] = [{ file, source: 'convention-file' }];
	let convention: Pick<Convention, 'kind' | 'summary'> | undefined;
	if (base === '.editorconfig') {
		const style = /^\s*indent_style\s*=\s*(\w+)/m.exec(text)?.[1];
		const size = /^\s*indent_size\s*=\s*(\w+)/m.exec(text)?.[1];
		convention = { kind: 'formatting', summary: `EditorConfig: indent ${style ?? 'unspecified'}${size ? ` (${size})` : ''}` };
	} else if (/^(?:\.eslintrc(?:\.\w+)?|eslint\.config\.\w+)$/.test(base)) {
		convention = { kind: 'lint', summary: `ESLint configuration (${base})` };
	} else if (/^(?:\.prettierrc(?:\.\w+)?|prettier\.config\.\w+)$/.test(base)) {
		convention = { kind: 'formatting', summary: `Prettier configuration (${base})` };
	} else if (/^pull_request_template\.md$/i.test(base)) {
		convention = { kind: 'pr-template', summary: `PR template sections: ${headings(text)}` };
	} else if (base === 'CODEOWNERS') {
		const rules = text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).length;
		convention = { kind: 'codeowners', summary: `CODEOWNERS with ${rules} rule${rules === 1 ? '' : 's'}` };
	} else if (base === 'CONTRIBUTING.md') {
		convention = { kind: 'commit', summary: `Contributing guide: ${headings(text)}` };
	} else if (/^(?:AGENTS\.md|CLAUDE\.md|copilot-instructions\.md)$/.test(base)) {
		convention = { kind: 'agent-instructions', summary: `Agent instructions (${base}): ${headings(text)}` };
	}
	return convention ? { conventions: [{ ...convention, evidence, confidence: 'declared' }] } : {};
}

// --- Dispatch ---------------------------------------------------------------------------

export type InputParser = (file: string, text: string) => ModelFragment;

/** Which parser reads a workspace-relative path, if any. Also the indexer's input filter. */
export function parserFor(file: string): InputParser | undefined {
	const base = file.slice(file.lastIndexOf('/') + 1);
	if (base === 'package.json') {
		return parsePackageJson;
	}
	if (base === 'pnpm-workspace.yaml') {
		return parsePnpmWorkspace;
	}
	if (base === 'pyproject.toml') {
		return parsePyproject;
	}
	if (base === 'go.mod') {
		return parseGoMod;
	}
	if (base === 'Cargo.toml') {
		return parseCargoToml;
	}
	if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) {
		return parseGithubWorkflow;
	}
	if (parseConvention(file, '').conventions || /^(?:pull_request_template\.md|CONTRIBUTING\.md|AGENTS\.md|CLAUDE\.md|copilot-instructions\.md|CODEOWNERS)$/i.test(base)) {
		return parseConvention;
	}
	return undefined;
}

/** Manifests and workflows: the only inputs read in untrusted workspaces (section 5). */
export function isManifestOrWorkflow(file: string): boolean {
	const parser = parserFor(file);
	return parser !== undefined && parser !== parseConvention;
}

/** The globs the indexer asks the workspace for; `parserFor` decides on each result. */
export const INPUT_GLOBS: readonly string[] = [
	'**/{package.json,pnpm-workspace.yaml,pyproject.toml,go.mod,Cargo.toml,.editorconfig,.eslintrc,.eslintrc.*,eslint.config.*,.prettierrc,.prettierrc.*,prettier.config.*,pull_request_template.md,CODEOWNERS,CONTRIBUTING.md,AGENTS.md,CLAUDE.md,copilot-instructions.md}',
	'.github/workflows/*.{yml,yaml}',
];
