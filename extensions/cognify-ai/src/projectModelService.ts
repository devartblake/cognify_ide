/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { assembleModel, buildIndex, DEFAULT_BUDGETS, FileChange, IndexState, refreshIndex, RefreshReport } from './projectModel/indexer';
import { PROJECT_MODEL_SCHEMA_VERSION, ProjectModel } from './projectModel/model';
import { INPUT_GLOBS } from './projectModel/parsers';
import type { RoleLog } from './roles';

const STORAGE_FILE = `project-model.v${PROJECT_MODEL_SCHEMA_VERSION}.json`;

/** Never indexed, whatever the settings say. */
const ALWAYS_EXCLUDED = ['**/node_modules/**', '**/.git/**'];

/** Section 4: input changes are batched and applied after 2 s of quiet. */
const DEFAULT_DEBOUNCE_MS = 2_000;

/**
 * Builds, caches, stores and refreshes the Project Cognition model for the open
 * workspace (PROJECT_COGNITION_MVP.md, sections 3–5).
 *
 * - The model is built lazily, on first use, never at startup.
 * - Once built, file watchers on the input globs refresh it incrementally: only
 *   changed files are read, and only their domain is re-derived (S3-08).
 * - It is stored only in this extension's workspace storage: local, per machine, never synced.
 */
export class ProjectModelService implements vscode.Disposable {
	private current: Promise<ProjectModel> | undefined;
	/** Parsed inputs for incremental refresh. Absent after loading a stored model, until the first rebuild. */
	private index: IndexState | undefined;
	private watching: vscode.Disposable[] = [];
	private pending = new Map<string, FileChange['kind']>();
	private timer: ReturnType<typeof setTimeout> | undefined;
	/** Refreshes run one at a time, in order, so a slow one can't overwrite a later one's index. */
	private refreshes: Promise<void> = Promise.resolve();
	/** Counts builds, so a refresh that a rebuild overtook doesn't replace the rebuilt index. */
	private generation = 0;
	private readonly onDidRefreshEmitter = new vscode.EventEmitter<RefreshReport>();
	private readonly folderListener: vscode.Disposable;

	/** Fires after a refresh applied file changes (also when they turned out to change nothing). */
	readonly onDidRefresh = this.onDidRefreshEmitter.event;

	constructor(private readonly storageUri: vscode.Uri | undefined, private readonly log: RoleLog, private readonly debounceMs = DEFAULT_DEBOUNCE_MS) {
		// Folders added or removed: rebuild, but only if the model is in use.
		this.folderListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			if (this.current) {
				void this.rebuild();
			}
		});
	}

	/** The cached model, loading it from storage or building it the first time. */
	get(token?: vscode.CancellationToken): Promise<ProjectModel> {
		this.current ??= this.loadOrBuild(token);
		return this.current;
	}

	/** Rebuild from the workspace and store the result. */
	rebuild(token?: vscode.CancellationToken): Promise<ProjectModel> {
		this.current = this.build(token);
		return this.current;
	}

	/** Forget the model, stop watching, and delete the stored copy. */
	async clear(): Promise<void> {
		this.current = undefined;
		this.index = undefined;
		this.stopWatching();
		if (this.storageUri) {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE)).then(undefined, () => undefined);
		}
	}

	dispose(): void {
		this.stopWatching();
		this.folderListener.dispose();
		this.onDidRefreshEmitter.dispose();
	}

	private async loadOrBuild(token?: vscode.CancellationToken): Promise<ProjectModel> {
		if (this.storageUri) {
			try {
				const stored = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE)))) as ProjectModel;
				// A schema change invalidates the cache (section 4).
				if (stored.schemaVersion === PROJECT_MODEL_SCHEMA_VERSION) {
					this.startWatching();
					return stored;
				}
			} catch {
				// Not built yet in this workspace.
			}
		}
		return this.build(token);
	}

	private async build(token?: vscode.CancellationToken): Promise<ProjectModel> {
		this.generation++;
		const folders = vscode.workspace.workspaceFolders ?? [];
		const uris = new Map<string, vscode.Uri>();
		// One more than the budget, so the indexer can tell the budget was hit.
		const maxResults = DEFAULT_BUDGETS.maxFiles + 1;
		for (const glob of INPUT_GLOBS) {
			for (const folder of folders) {
				for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), excludeGlob(folder), maxResults, token)) {
					uris.set(relativePath(uri), uri);
				}
			}
		}
		this.index = await buildIndex({ files: [...uris.keys()].map(path => ({ path })), read: path => readText(uris.get(path) ?? resolve(path)), trusted: vscode.workspace.isTrusted });
		const model = assembleModel(this.index);
		this.log.info(`[project-model] ${model.packages.length} packages, ${model.ci.length} pipelines, ${model.coverage.filesScanned} files in ${model.coverage.durationMs} ms${model.coverage.truncated ? ' (truncated)' : ''}`);
		await this.store(model);
		this.startWatching();
		return model;
	}

	private startWatching(): void {
		if (this.watching.length) {
			return;
		}
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			for (const glob of INPUT_GLOBS) {
				const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, glob));
				this.watching.push(
					watcher,
					watcher.onDidCreate(uri => this.queue(uri, 'created')),
					watcher.onDidChange(uri => this.queue(uri, 'changed')),
					watcher.onDidDelete(uri => this.queue(uri, 'deleted')),
				);
			}
		}
	}

	private stopWatching(): void {
		this.watching.forEach(d => d.dispose());
		this.watching = [];
		clearTimeout(this.timer);
		this.timer = undefined;
		this.pending.clear();
	}

	private queue(uri: vscode.Uri, kind: FileChange['kind']): void {
		this.pending.set(relativePath(uri), kind);
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.refreshes = this.refreshes.then(() => this.applyPending()).catch(error => this.log.warn(`[project-model] refresh failed: ${error instanceof Error ? error.message : String(error)}`));
		}, this.debounceMs);
	}

	private async applyPending(): Promise<void> {
		const changes = [...this.pending].map(([path, kind]) => ({ path, kind }));
		this.pending.clear();
		if (!changes.length || !this.current) {
			return;
		}
		if (!this.index) {
			// Loaded from storage: no parsed inputs to update, so rebuild once (well under a second here).
			const model = await this.rebuild();
			this.onDidRefreshEmitter.fire({ changedPaths: changes.map(c => c.path), domains: ['ci', 'conventions', 'packages'], filesRead: model.coverage.filesScanned });
			return;
		}
		const generation = this.generation;
		const { state, report } = await refreshIndex(this.index, changes, { read: path => readText(resolve(path)), trusted: vscode.workspace.isTrusted });
		if (generation !== this.generation) {
			// A rebuild started meanwhile. It reads the files after these changes were made, so it
			// already includes them; keep its index rather than this one, which is based on the old.
			this.onDidRefreshEmitter.fire(report);
			return;
		}
		this.index = state;
		if (report.changedPaths.length) {
			const model = assembleModel(state);
			this.current = Promise.resolve(model);
			await this.store(model);
		}
		// Metadata only: paths of the project's own input files and domain names.
		this.log.info(JSON.stringify({ timestamp: new Date().toISOString(), event: 'project-model-refresh', ...report }));
		this.onDidRefreshEmitter.fire(report);
	}

	private async store(model: ProjectModel): Promise<void> {
		if (this.storageUri) {
			await vscode.workspace.fs.createDirectory(this.storageUri);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE), new TextEncoder().encode(JSON.stringify(model)));
		}
	}
}

/**
 * `files.exclude` and `search.exclude` (section 6, rule 1), plus folders that are
 * never indexed. Passing an exclude replaces the default, so the settings are added here.
 */
function excludeGlob(folder: vscode.WorkspaceFolder): string {
	const patterns = new Set(ALWAYS_EXCLUDED);
	for (const section of ['files', 'search']) {
		const excludes = vscode.workspace.getConfiguration(section, folder).get<Record<string, unknown>>('exclude') ?? {};
		for (const [pattern, enabled] of Object.entries(excludes)) {
			if (enabled === true) {
				patterns.add(pattern);
			}
		}
	}
	return `{${[...patterns].join(',')}}`;
}

function multiRoot(): boolean {
	return (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
}

function relativePath(uri: vscode.Uri): string {
	return vscode.workspace.asRelativePath(uri, multiRoot()).split('\\').join('/');
}

/** The inverse of `relativePath`, for paths of changed files. */
function resolve(path: string): vscode.Uri {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (multiRoot()) {
		const [name, ...rest] = path.split('/');
		const folder = folders.find(f => f.name === name) ?? folders[0];
		return vscode.Uri.joinPath(folder.uri, ...rest);
	}
	return vscode.Uri.joinPath(folders[0].uri, ...path.split('/'));
}

async function readText(uri: vscode.Uri): Promise<string> {
	return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}
