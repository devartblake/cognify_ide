/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The operations of the `cognify_projectModel` tool (PROJECT_COGNITION_MVP.md, section 3,
// "Outputs"). Pure. Each answer is a prompt-sized slice of the model (section 6, rule 4)
// with evidence paths, inferred facts marked, and credentials redacted (rule 3).

import { redactSecrets } from '../privacy.ts';
import type { CiPipeline, PackageNode, ProjectModel } from './model.ts';

export type ProjectQuery =
	| { readonly operation: 'summary' }
	| { readonly operation: 'package'; readonly path: string }
	| { readonly operation: 'howToTest'; readonly path: string; readonly branch?: string }
	| { readonly operation: 'ciFor'; readonly paths: readonly string[]; readonly branch?: string };

/** Recent changes come from the git API at query time, not from the stored model. */
export interface RecentChanges {
	/** What the commits are relative to, e.g. `merge-base with dev (abc1234)`. */
	readonly since: string;
	/** When set, only commits that touched this path. */
	readonly path?: string;
	readonly commits: readonly { readonly sha: string; readonly subject: string; readonly date: string }[];
	readonly workingTree: readonly { readonly path: string; readonly status: string }[];
}

export interface QueryAnswer {
	readonly text: string;
	/** Packages the answer drew on, for the metadata-only audit line. */
	readonly packagesTouched: readonly string[];
	/** Whether redaction replaced anything. */
	readonly redacted: boolean;
}

/** Answers stay small enough to put in a prompt. */
const MAX_ANSWER_CHARS = 4_000;

export function answer(model: ProjectModel, query: ProjectQuery): QueryAnswer {
	switch (query.operation) {
		case 'summary':
			return finish(summary(model), model.packages.filter(p => p.path === '.').map(p => p.id));
		case 'package': {
			const pkg = packageFor(model, query.path);
			return pkg ? finish(describePackage(model, pkg), [pkg.id]) : finish(noPackage(query.path), []);
		}
		case 'howToTest': {
			const pkg = packageFor(model, query.path);
			return pkg ? finish(howToTest(model, pkg, query.path, query.branch), [pkg.id]) : finish(noPackage(query.path), []);
		}
		case 'ciFor':
			return finish(ciFor(model, query.paths, query.branch, query.paths.length === 1 ? packageFor(model, query.paths[0]) : undefined), query.paths.flatMap(path => packageFor(model, path)?.id ?? []));
	}
}

export function answerRecentChanges(model: ProjectModel, changes: RecentChanges): QueryAnswer {
	const lines = [`Recent changes${changes.path ? ` touching ${normalize(changes.path)}` : ''} since ${changes.since}:`];
	for (const commit of changes.commits.slice(0, 20)) {
		lines.push(`- ${commit.sha.slice(0, 10)} ${commit.date.slice(0, 10)} ${commit.subject}`);
	}
	if (changes.commits.length === 0) {
		lines.push('- no commits');
	}
	const touched = new Set<string>();
	if (changes.workingTree.length) {
		lines.push('Uncommitted changes:');
		for (const change of changes.workingTree.slice(0, 30)) {
			const pkg = packageFor(model, change.path);
			if (pkg) {
				touched.add(pkg.id);
			}
			lines.push(`- ${change.status} ${change.path}${pkg ? ` (package ${pkg.name})` : ''}`);
		}
	}
	lines.push('Evidence: git (local repository).');
	return finish(lines.join('\n'), [...touched]);
}

/** The deepest package whose folder contains `path`. */
export function packageFor(model: ProjectModel, path: string): PackageNode | undefined {
	const file = normalize(path);
	return model.packages
		.filter(pkg => pkg.path === '.' || file === pkg.path || file.startsWith(`${pkg.path}/`))
		.sort((a, b) => b.path.length - a.path.length || (a.path === '.' ? 1 : 0))[0];
}

/** Events that run a pipeline because code changed. Manual and scheduled runs don't count. */
const CHANGE_EVENTS = new Set(['push', 'pull_request', 'pull_request_target', 'merge_group']);

/**
 * Whether a pipeline runs for a change to `path`, optionally on (or targeting)
 * `branch`: some change trigger whose branch and path filters both match.
 */
export function pipelineRunsFor(pipeline: CiPipeline, path: string, branch?: string): boolean {
	const file = normalize(path);
	return pipeline.triggers.some(trigger => CHANGE_EVENTS.has(trigger.event)
		&& (!branch || !trigger.branches?.length || filterMatches(trigger.branches, branch))
		&& (!trigger.paths?.length || filterMatches(trigger.paths, file)));
}

/** GitHub filter lists: at least one positive glob matches, and no `!` glob does. */
function filterMatches(globs: readonly string[], value: string): boolean {
	const include = globs.filter(g => !g.startsWith('!'));
	const exclude = globs.filter(g => g.startsWith('!')).map(g => g.slice(1));
	return (include.length === 0 || include.some(glob => globToRegExp(glob).test(value))) && !exclude.some(glob => globToRegExp(glob).test(value));
}

export function globToRegExp(glob: string): RegExp {
	let source = '';
	for (let i = 0; i < glob.length; i++) {
		const char = glob[i];
		if (char === '*' && glob[i + 1] === '*') {
			source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
			i += glob[i + 2] === '/' ? 2 : 1;
		} else if (char === '*') {
			source += '[^/]*';
		} else if (char === '?') {
			source += '[^/]';
		} else {
			source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
		}
	}
	return new RegExp(`^${source}$`);
}

function summary(model: ProjectModel): string {
	const root = model.packages.find(p => p.path === '.');
	const ecosystems = [...new Set(model.packages.map(p => p.ecosystem))].join(', ');
	const lines = [
		`Workspace: ${model.packages.length} package${model.packages.length === 1 ? '' : 's'} (${ecosystems || 'none found'})${root ? `; root package ${root.name}${root.packageManager ? `, managed with ${root.packageManager}` : ''}` : ''}.`,
	];
	const topLevel = model.packages.filter(p => p.path !== '.' && p.path.split('/').length <= 2).slice(0, 15);
	if (topLevel.length) {
		lines.push('Top-level packages:', ...topLevel.map(p => `- ${p.name} (${p.path})`));
	}
	if (model.ci.length) {
		lines.push('CI pipelines:', ...model.ci.slice(0, 10).map(c => `- ${c.name} (${c.file}): on ${c.triggers.map(t => t.event).join(', ')}`));
	}
	if (model.conventions.length) {
		lines.push('Conventions:', ...model.conventions.slice(0, 8).map(c => `- ${c.summary} (${c.evidence[0].file})`));
	}
	lines.push(coverageLine(model));
	return lines.join('\n');
}

function describePackage(model: ProjectModel, pkg: PackageNode): string {
	const pm = packageManager(model, pkg);
	const deps = model.dependencies.filter(d => d.from === pkg.id);
	const internal = deps.filter(d => d.kind === 'internal').map(d => model.packages.find(p => p.id === d.to)?.name ?? d.to);
	const lines = [
		`Package ${pkg.name} (${pkg.ecosystem}, ${pkg.path}). Evidence: ${pkg.evidence.map(e => e.file).join(', ')}.`,
		`Scripts: ${Object.keys(pkg.scripts).length ? Object.entries(pkg.scripts).slice(0, 15).map(([name, cmd]) => `\`${runScript(pm, name)}\` → ${cmd}`).join('; ') : 'none declared'}.`,
		`Dependencies: ${deps.length} (${internal.length ? `internal: ${internal.join(', ')}` : 'no internal ones'}).`,
	];
	const entries = model.entryPoints.filter(e => e.packageId === pkg.id);
	if (entries.length) {
		lines.push(`Entry points: ${entries.map(e => `${e.kind} ${e.target}`).join(', ')}.`);
	}
	return lines.join('\n');
}

function howToTest(model: ProjectModel, pkg: PackageNode, path: string, branch?: string): string {
	const pm = packageManager(model, pkg);
	const lines = [`The file ${normalize(path)} belongs to package ${pkg.name} (${pkg.path}). Evidence: ${pkg.evidence[0].file}.`];
	const build = Object.entries(pkg.scripts).filter(([name]) => /^(?:build|compile|watch|vscode:prepublish)$/.test(name));
	lines.push(build.length ? `Build: ${build.map(([name, cmd]) => `\`${runScript(pm, name)}\` (runs: ${cmd})`).join('; ')}.` : 'Build: no build script declared in this package.');
	const tests = model.tests.filter(t => t.packageId === pkg.id);
	if (tests.length) {
		lines.push(`Test: ${tests.map(t => `\`${withManager(pm, t.command)}\` (${t.framework}${t.confidence === 'inferred' ? ', framework inferred' : ''})`).join('; ')}.`);
	} else {
		lines.push('Test: no test script declared in this package.');
	}
	lines.push(ciFor(model, [path], branch, pkg));
	return lines.join('\n');
}

function ciFor(model: ProjectModel, paths: readonly string[], branch?: string, focus?: PackageNode): string {
	const scope = `${paths.map(normalize).join(', ')}${branch ? ` on a change to or targeting ${branch}` : ''}`;
	const running = model.ci.filter(pipeline => paths.some(path => pipelineRunsFor(pipeline, path, branch)));
	const lines = running.length ? [`CI that runs for ${scope}:`] : [`CI: no indexed pipeline runs for ${scope}.`];
	for (const pipeline of running.slice(0, 8)) {
		const triggers = pipeline.triggers.filter(t => CHANGE_EVENTS.has(t.event)).map(t => `${t.event}${t.branches ? ` → ${t.branches.join(', ')}` : ''}`).join('; ');
		lines.push(`- ${pipeline.name} (${pipeline.file}), on ${triggers}`);
		for (const job of pipeline.jobs.slice(0, 3)) {
			lines.push(`  - job ${job.id}${job.name ? ` "${job.name}"` : ''}${job.runsOn ? ` on ${job.runsOn}` : ''}: ${stepsFor(job.steps, focus)}`);
		}
	}
	// Pipelines that would run on this change on another branch: the classic "why didn't CI run?".
	const otherBranches = branch ? model.ci.filter(pipeline => !running.includes(pipeline) && paths.some(path => pipelineRunsFor(pipeline, path))) : [];
	if (otherBranches.length) {
		lines.push(`Not run for ${branch} (their branch filters don't include it):`);
		for (const pipeline of otherBranches.slice(0, 6)) {
			const branches = [...new Set(pipeline.triggers.filter(t => CHANGE_EVENTS.has(t.event)).flatMap(t => t.branches ?? []))];
			lines.push(`- ${pipeline.name} (${pipeline.file}): only ${branches.join(', ')}`);
		}
		if (otherBranches.length > 6) {
			lines.push(`- and ${otherBranches.length - 6} more`);
		}
	}
	const rest = model.ci.length - running.length - otherBranches.length;
	if (rest > 0) {
		lines.push(`${rest} other pipeline${rest === 1 ? ' doesn\'t' : 's don\'t'} run on a change like this (manual or scheduled only, or their path filters don't match).`);
	}
	if (!branch) {
		lines.push('Branch filters were not applied; pass `branch` to check a specific target branch.');
	}
	return lines.join('\n');
}

/**
 * At most 10 steps per job. Steps that mention the package come first, so the
 * answer names the step that tests it even in a long job (`Cognify AI extension
 * unit tests` for `cognify-ai`).
 */
function stepsFor(steps: readonly string[], focus: PackageNode | undefined): string {
	const tokens = focus ? focus.name.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 2) : [];
	const mentions = (step: string) => {
		const text = step.toLowerCase();
		return (focus !== undefined && focus.path !== '.' && text.includes(focus.path.toLowerCase())) || (tokens.length > 0 && tokens.every(t => new RegExp(`\\b${t}\\b`).test(text)));
	};
	const relevant = steps.filter(mentions);
	const ordered = relevant.length ? [...relevant.map(step => `**${step}**`), ...steps.filter(step => !mentions(step))] : [...steps];
	return ordered.length > 10 ? [...ordered.slice(0, 10), `… ${ordered.length - 10} more`].join(' · ') : ordered.join(' · ');
}

function packageManager(model: ProjectModel, pkg: PackageNode): string {
	if (pkg.ecosystem !== 'npm') {
		return '';
	}
	return pkg.packageManager ?? model.packages.find(p => p.path === '.')?.packageManager ?? 'npm';
}

function runScript(pm: string, name: string): string {
	return pm ? `${pm} run ${name}` : name;
}

function withManager(pm: string, command: string): string {
	return pm && pm !== 'npm' ? command.replace(/^npm /, `${pm} `) : command;
}

function noPackage(path: string): string {
	return `No indexed package contains ${normalize(path)}.`;
}

function coverageLine(model: ProjectModel): string {
	const c = model.coverage;
	return `Index: ${c.filesScanned} files read in ${c.durationMs} ms${c.truncated ? '; truncated by a budget, so the model is incomplete' : ''}${c.skipped.length ? `; ${c.skipped.length} skipped` : ''}.`;
}

function normalize(path: string): string {
	return path.split('\\').join('/').replace(/^\.\//, '');
}

function finish(text: string, packagesTouched: readonly string[]): QueryAnswer {
	const redactedText = redactSecrets(text);
	const clipped = redactedText.length > MAX_ANSWER_CHARS ? `${redactedText.slice(0, MAX_ANSWER_CHARS)}\n[truncated]` : redactedText;
	return { text: clipped, packagesTouched, redacted: redactedText !== text };
}
