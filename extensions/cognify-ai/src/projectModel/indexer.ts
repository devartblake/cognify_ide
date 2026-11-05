/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Builds the ProjectModel from a list of workspace files (PROJECT_COGNITION_MVP.md,
// sections 3–5). Pure: the caller supplies the file list and a reader, so this runs
// under `node --test` and never touches the workspace itself. It never executes
// anything, and in untrusted workspaces it reads only manifests and workflows.

import { isSensitivePath } from '../privacy.ts';
import { type CiPipeline, type CognifyProject, type Convention, type DependencyEdge, type EntryPoint, type IndexCoverage, type PackageNode, PROJECT_MODEL_SCHEMA_VERSION, type ProjectModel, type SkipReason, type TestSuite } from './model.ts';
import { isManifestOrWorkflow, type ModelFragment, parseConvention, parseGithubWorkflow, parserFor } from './parsers.ts';

export interface IndexBudgets {
	/** Candidate input files read at most; the rest are skipped as `budget`. */
	readonly maxFiles: number;
	readonly maxFileBytes: number;
	/** Wall time for one full index. */
	readonly maxDurationMs: number;
}

/** Section 4: 5,000 files, 1 MB per file, 10 s. */
export const DEFAULT_BUDGETS: IndexBudgets = { maxFiles: 5_000, maxFileBytes: 1_000_000, maxDurationMs: 10_000 };

/** Skipped items listed in `coverage`; the rest are only counted, so the model stays small. */
const MAX_LISTED_SKIPS = 200;

export interface IndexSource {
	/** Workspace-relative paths with forward slashes, already without excluded folders. */
	readonly files: readonly { readonly path: string; readonly size?: number }[];
	read(path: string): Promise<string>;
	/** `workspace.isTrusted`. Untrusted workspaces get manifests and workflows only. */
	readonly trusted: boolean;
	/** Injected for tests; defaults to `Date.now`. */
	readonly now?: () => number;
}

export type ProjectDomain = 'packages' | 'ci' | 'conventions';

/** Which model domain an input file feeds (section 4: re-derive only the affected domain). */
export function domainOf(path: string): ProjectDomain | undefined {
	const parser = parserFor(path);
	if (!parser) {
		return undefined;
	}
	if (parser === parseGithubWorkflow) {
		return 'ci';
	}
	return parser === parseConvention ? 'conventions' : 'packages';
}

/** One parsed input: its content hash and what it contributed. */
export interface IndexedInput {
	readonly hash: string;
	readonly fragment: ModelFragment;
}

/** Everything needed to refresh the model incrementally. Kept in memory, not stored. */
export interface IndexState {
	readonly inputs: ReadonlyMap<string, IndexedInput>;
	readonly skipped: readonly { readonly path: string; readonly reason: SkipReason }[];
	readonly truncated: boolean;
	readonly filesScanned: number;
	readonly durationMs: number;
}

export async function buildProjectModel(source: IndexSource, budgets: IndexBudgets = DEFAULT_BUDGETS): Promise<ProjectModel> {
	return assembleModel(await buildIndex(source, budgets), source.now);
}

/** Read and parse every input (a full index). */
export async function buildIndex(source: IndexSource, budgets: IndexBudgets = DEFAULT_BUDGETS): Promise<IndexState> {
	const now = source.now ?? Date.now;
	const startedAt = now();
	const skipped: { path: string; reason: SkipReason }[] = [];
	let truncated = false;

	const candidates = source.files
		.filter(file => isCandidate(file.path, source.trusted))
		// Shallow paths first, so a budget cut keeps the root and top-level packages.
		.sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path));

	const inputs = new Map<string, IndexedInput>();
	let filesScanned = 0;
	for (const [index, file] of candidates.entries()) {
		if (index >= budgets.maxFiles || now() - startedAt > budgets.maxDurationMs) {
			truncated = true;
			candidates.slice(index).forEach(rest => skipped.push({ path: rest.path, reason: 'budget' }));
			break;
		}
		const result = await indexFile(file.path, file.size, source.read, budgets);
		filesScanned += result.read ? 1 : 0;
		if (result.input) {
			inputs.set(file.path, result.input);
		} else {
			skipped.push({ path: file.path, reason: result.skip! });
		}
	}
	return { inputs, skipped, truncated, filesScanned, durationMs: now() - startedAt };
}

export interface FileChange {
	readonly path: string;
	readonly kind: 'created' | 'changed' | 'deleted';
}

export interface RefreshReport {
	/** Inputs whose content actually changed (same-content saves are not changes). */
	readonly changedPaths: readonly string[];
	/** Domains re-derived; empty when nothing relevant changed. */
	readonly domains: readonly ProjectDomain[];
	/** Files read for this refresh: only the changed ones. */
	readonly filesRead: number;
}

/**
 * Apply file changes to an index (section 4). Only the changed files are read; a
 * file whose content hash is unchanged is not a change. The model is then
 * re-assembled from the cached fragments, so other domains are not re-derived.
 */
export async function refreshIndex(state: IndexState, changes: readonly FileChange[], source: Pick<IndexSource, 'read' | 'trusted'>, budgets: IndexBudgets = DEFAULT_BUDGETS): Promise<{ readonly state: IndexState; readonly report: RefreshReport }> {
	const inputs = new Map(state.inputs);
	let skipped = [...state.skipped];
	let truncated = state.truncated;
	const changedPaths: string[] = [];
	const domains = new Set<ProjectDomain>();
	let filesRead = 0;
	for (const change of changes) {
		if (!isCandidate(change.path, source.trusted)) {
			continue;
		}
		const before = inputs.get(change.path);
		skipped = skipped.filter(entry => entry.path !== change.path);
		if (change.kind === 'deleted') {
			if (inputs.delete(change.path)) {
				changedPaths.push(change.path);
				domains.add(domainOf(change.path)!);
			}
			continue;
		}
		if (!before && inputs.size >= budgets.maxFiles) {
			truncated = true;
			skipped.push({ path: change.path, reason: 'budget' });
			continue;
		}
		const result = await indexFile(change.path, undefined, source.read, budgets);
		filesRead += result.read ? 1 : 0;
		if (!result.input) {
			skipped.push({ path: change.path, reason: result.skip! });
			if (inputs.delete(change.path)) {
				changedPaths.push(change.path);
				domains.add(domainOf(change.path)!);
			}
		} else if (result.input.hash !== before?.hash) {
			inputs.set(change.path, result.input);
			changedPaths.push(change.path);
			domains.add(domainOf(change.path)!);
		}
	}
	return {
		state: { inputs, skipped, truncated, filesScanned: state.filesScanned + filesRead, durationMs: state.durationMs },
		report: { changedPaths, domains: [...domains].sort(), filesRead },
	};
}

/** Build the model from parsed inputs. Cheap: no file is read. */
export function assembleModel(state: IndexState, clock: () => number = Date.now): ProjectModel {
	const fragments = [...state.inputs.keys()].sort().map(path => state.inputs.get(path)!.fragment);
	const packages = fragments.flatMap(f => f.packages ?? []).sort(byId);
	const listed = state.skipped.slice(0, MAX_LISTED_SKIPS);
	const notListed = state.skipped.length - listed.length;
	const coverage: IndexCoverage = {
		filesScanned: state.filesScanned,
		truncated: state.truncated,
		skipped: notListed > 0 ? [...listed, { path: `(${notListed} more)`, reason: listed.at(-1)!.reason }] : listed,
		durationMs: state.durationMs,
	};
	return {
		schemaVersion: PROJECT_MODEL_SCHEMA_VERSION,
		generatedAt: new Date(clock()).toISOString(),
		packages,
		dependencies: resolveInternal(fragments.flatMap(f => f.dependencies ?? []), packages),
		entryPoints: fragments.flatMap(f => f.entryPoints ?? []).sort((a: EntryPoint, b: EntryPoint) => a.packageId.localeCompare(b.packageId) || a.target.localeCompare(b.target)),
		tests: fragments.flatMap(f => f.tests ?? []).sort((a: TestSuite, b: TestSuite) => a.packageId.localeCompare(b.packageId) || a.command.localeCompare(b.command)),
		ci: fragments.flatMap(f => f.ci ?? []).sort((a: CiPipeline, b: CiPipeline) => a.file.localeCompare(b.file)),
		conventions: fragments.flatMap(f => f.conventions ?? []).sort((a: Convention, b: Convention) => a.evidence[0].file.localeCompare(b.evidence[0].file)),
		cognifyProjects: fragments.flatMap(f => f.cognifyProjects ?? []).sort((a: CognifyProject, b: CognifyProject) => a.path.localeCompare(b.path)),
		coverage,
	};
}

function isCandidate(path: string, trusted: boolean): boolean {
	return !/(?:^|\/)(?:node_modules|\.git)\//.test(path) && parserFor(path) !== undefined && (trusted || isManifestOrWorkflow(path));
}

/** Either `input` or `skip` is set. */
interface IndexFileResult {
	readonly read: boolean;
	readonly input?: IndexedInput;
	readonly skip?: SkipReason;
}

async function indexFile(path: string, size: number | undefined, read: IndexSource['read'], budgets: IndexBudgets): Promise<IndexFileResult> {
	if (isSensitivePath(path)) {
		return { read: false, skip: 'secret-risk' };
	}
	if (size !== undefined && size > budgets.maxFileBytes) {
		return { read: false, skip: 'too-large' };
	}
	let text: string;
	try {
		text = await read(path);
	} catch {
		return { read: false, skip: 'unparsable' };
	}
	if (text.length > budgets.maxFileBytes) {
		return { read: true, skip: 'too-large' };
	}
	try {
		return { read: true, input: { hash: await sha256(text), fragment: parserFor(path)!(path, text) } };
	} catch {
		return { read: true, skip: 'unparsable' };
	}
}

/** Content hash (section 4). `crypto.subtle` exists in Node and in browsers. */
async function sha256(text: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function depth(path: string): number {
	return path.split('/').length;
}

function byId(a: PackageNode, b: PackageNode): number {
	return a.id.localeCompare(b.id);
}

/**
 * Parsers mark workspace dependencies by package name (`npm-name:x`, `cargo-name:x`);
 * point them at the package that declares that name. A name no indexed package
 * declares is treated as external.
 */
function resolveInternal(edges: readonly DependencyEdge[], packages: readonly PackageNode[]): DependencyEdge[] {
	const byName = new Map(packages.map(pkg => [`${pkg.ecosystem === 'cargo' ? 'cargo' : 'npm'}-name:${pkg.name}`, pkg.id]));
	return edges.map(edge => {
		if (!/^(?:npm|cargo)-name:/.test(edge.to)) {
			return edge;
		}
		const target = byName.get(edge.to);
		const ecosystem = edge.to.startsWith('cargo') ? 'cargo' : 'npm';
		return target
			? { ...edge, to: target }
			: { ...edge, to: `external:${ecosystem}:${edge.to.slice(edge.to.indexOf(':') + 1)}`, kind: 'external' as const };
	}).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}
