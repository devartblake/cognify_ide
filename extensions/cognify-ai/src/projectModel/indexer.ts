/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Builds the ProjectModel from a list of workspace files (PROJECT_COGNITION_MVP.md,
// sections 3–5). Pure: the caller supplies the file list and a reader, so this runs
// under `node --test` and never touches the workspace itself. It never executes
// anything, and in untrusted workspaces it reads only manifests and workflows.

import { isSensitivePath } from '../privacy.ts';
import { type CiPipeline, type Convention, type DependencyEdge, type EntryPoint, type IndexCoverage, type PackageNode, PROJECT_MODEL_SCHEMA_VERSION, type ProjectModel, type SkipReason, type TestSuite } from './model.ts';
import { isManifestOrWorkflow, type ModelFragment, parserFor } from './parsers.ts';

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

export async function buildProjectModel(source: IndexSource, budgets: IndexBudgets = DEFAULT_BUDGETS): Promise<ProjectModel> {
	const now = source.now ?? Date.now;
	const startedAt = now();
	const skipped: { path: string; reason: SkipReason }[] = [];
	let skippedNotListed = 0;
	let truncated = false;
	const skip = (path: string, reason: SkipReason) => {
		if (skipped.length < MAX_LISTED_SKIPS) {
			skipped.push({ path, reason });
		} else {
			skippedNotListed++;
		}
	};

	const candidates = source.files
		.filter(file => !/(?:^|\/)(?:node_modules|\.git)\//.test(file.path) && parserFor(file.path))
		.filter(file => source.trusted || isManifestOrWorkflow(file.path))
		// Shallow paths first, so a budget cut keeps the root and top-level packages.
		.sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path));

	const fragments: ModelFragment[] = [];
	let filesScanned = 0;
	for (const [index, file] of candidates.entries()) {
		if (index >= budgets.maxFiles || now() - startedAt > budgets.maxDurationMs) {
			truncated = true;
			candidates.slice(index).forEach(rest => skip(rest.path, 'budget'));
			break;
		}
		if (isSensitivePath(file.path)) {
			skip(file.path, 'secret-risk');
			continue;
		}
		if (file.size !== undefined && file.size > budgets.maxFileBytes) {
			skip(file.path, 'too-large');
			continue;
		}
		let text: string;
		try {
			text = await source.read(file.path);
		} catch {
			skip(file.path, 'unparsable');
			continue;
		}
		filesScanned++;
		if (text.length > budgets.maxFileBytes) {
			skip(file.path, 'too-large');
			continue;
		}
		try {
			fragments.push(parserFor(file.path)!(file.path, text));
		} catch {
			skip(file.path, 'unparsable');
		}
	}

	const packages = fragments.flatMap(f => f.packages ?? []).sort(byId);
	const coverage: IndexCoverage = {
		filesScanned,
		truncated,
		skipped: skippedNotListed > 0 ? [...skipped, { path: `(${skippedNotListed} more)`, reason: skipped.at(-1)!.reason }] : skipped,
		durationMs: now() - startedAt,
	};
	return {
		schemaVersion: PROJECT_MODEL_SCHEMA_VERSION,
		generatedAt: new Date(now()).toISOString(),
		packages,
		dependencies: resolveInternal(fragments.flatMap(f => f.dependencies ?? []), packages),
		entryPoints: fragments.flatMap(f => f.entryPoints ?? []).sort((a: EntryPoint, b: EntryPoint) => a.packageId.localeCompare(b.packageId) || a.target.localeCompare(b.target)),
		tests: fragments.flatMap(f => f.tests ?? []).sort((a: TestSuite, b: TestSuite) => a.packageId.localeCompare(b.packageId) || a.command.localeCompare(b.command)),
		ci: fragments.flatMap(f => f.ci ?? []).sort((a: CiPipeline, b: CiPipeline) => a.file.localeCompare(b.file)),
		conventions: fragments.flatMap(f => f.conventions ?? []).sort((a: Convention, b: Convention) => a.evidence[0].file.localeCompare(b.evidence[0].file)),
		coverage,
	};
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
