/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Project Cognition model, schema version 1 (DevDocs/Architecture/PROJECT_COGNITION_MVP.md,
// section 2). Pure types: no `vscode` import. It holds paths, names, declared commands
// and short summaries, never file contents, secrets or environment values.

export const PROJECT_MODEL_SCHEMA_VERSION = 1;

/** Where a fact came from. `file` is workspace-relative, with forward slashes. */
export interface Evidence {
	readonly file: string;
	readonly line?: number;
	readonly source: 'manifest' | 'config' | 'workflow' | 'git' | 'task' | 'convention-file' | 'heuristic';
}

/** Every fact cites its evidence; roles must say "inferred" when citing an inferred fact. */
export interface Fact {
	readonly evidence: readonly Evidence[];
	readonly confidence: 'declared' | 'inferred';
}

export type Ecosystem = 'npm' | 'python' | 'go' | 'cargo' | 'dotnet' | 'maven' | 'gradle' | 'other';

export interface PackageNode extends Fact {
	/** Stable: `<ecosystem>:<relative path>`, with `.` for the root. */
	readonly id: string;
	readonly name: string;
	/** Root folder, workspace-relative (`.` for the root). */
	readonly path: string;
	readonly ecosystem: Ecosystem;
	/** Commands as declared (npm scripts and similar). */
	readonly scripts: Readonly<Record<string, string>>;
	readonly language?: string;
	/** From `packageManager` (`pnpm@12.16.0` → `pnpm`), when the manifest declares one. */
	readonly packageManager?: string;
}

export interface DependencyEdge extends Fact {
	readonly from: string;
	/** An internal package id, or `external:<ecosystem>:<name>`. */
	readonly to: string;
	readonly kind: 'internal' | 'external';
	readonly scope: 'runtime' | 'dev' | 'peer' | 'build';
	readonly versionSpec?: string;
}

export interface EntryPoint extends Fact {
	readonly packageId: string;
	readonly kind: 'main' | 'bin' | 'browser' | 'server' | 'extension-activation' | 'script';
	readonly target: string;
}

export interface TestSuite extends Fact {
	readonly packageId: string;
	/** mocha, vitest, jest, node:test, pytest, go test, cargo test, … */
	readonly framework: string;
	/** How to run it, as declared. */
	readonly command: string;
	readonly globs: readonly string[];
}

export interface CiTrigger {
	readonly event: string;
	readonly branches?: readonly string[];
	readonly paths?: readonly string[];
}

export interface CiJob {
	readonly id: string;
	readonly name?: string;
	readonly runsOn?: string;
	/** Step names, and `run` commands (first line only). */
	readonly steps: readonly string[];
}

export interface CiPipeline extends Fact {
	readonly provider: 'github-actions' | 'azure-pipelines' | 'gitlab' | 'other';
	readonly file: string;
	readonly name: string;
	readonly triggers: readonly CiTrigger[];
	readonly jobs: readonly CiJob[];
}

export interface Convention extends Fact {
	readonly kind: 'formatting' | 'lint' | 'naming' | 'branching' | 'commit' | 'pr-template' | 'agent-instructions' | 'codeowners';
	/** A short summary: a name and at most a few headings, never the full text. */
	readonly summary: string;
}

export type SkipReason = 'excluded' | 'secret-risk' | 'too-large' | 'binary' | 'budget' | 'unparsable';

export interface IndexCoverage {
	readonly filesScanned: number;
	/** A budget was hit, so the model is incomplete. */
	readonly truncated: boolean;
	readonly skipped: readonly { readonly path: string; readonly reason: SkipReason }[];
	readonly durationMs: number;
}

/**
 * The structural model of a workspace. `recentChanges` and services come from the
 * git API and container files, which later Sprint 3 items add; they are optional here.
 */
export interface ProjectModel {
	readonly schemaVersion: typeof PROJECT_MODEL_SCHEMA_VERSION;
	readonly generatedAt: string;
	readonly packages: readonly PackageNode[];
	readonly dependencies: readonly DependencyEdge[];
	readonly entryPoints: readonly EntryPoint[];
	readonly tests: readonly TestSuite[];
	readonly ci: readonly CiPipeline[];
	readonly conventions: readonly Convention[];
	readonly coverage: IndexCoverage;
}
