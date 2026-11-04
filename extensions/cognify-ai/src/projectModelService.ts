/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { buildProjectModel, DEFAULT_BUDGETS } from './projectModel/indexer';
import { PROJECT_MODEL_SCHEMA_VERSION, ProjectModel } from './projectModel/model';
import { INPUT_GLOBS } from './projectModel/parsers';
import type { RoleLog } from './roles';

const STORAGE_FILE = `project-model.v${PROJECT_MODEL_SCHEMA_VERSION}.json`;

/** Never indexed, whatever the settings say. */
const ALWAYS_EXCLUDED = ['**/node_modules/**', '**/.git/**'];

/**
 * Builds, caches and stores the Project Cognition model for the open workspace
 * (PROJECT_COGNITION_MVP.md, sections 3–5). The model is built lazily, on first use,
 * never at startup. It is stored only in this extension's workspace storage: local,
 * per machine, never synced. Refresh on change is S3-08.
 */
export class ProjectModelService {
	private current: Promise<ProjectModel> | undefined;

	constructor(private readonly storageUri: vscode.Uri | undefined, private readonly log: RoleLog) { }

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

	/** Forget the model and delete the stored copy. */
	async clear(): Promise<void> {
		this.current = undefined;
		if (this.storageUri) {
			await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE)).then(undefined, () => undefined);
		}
	}

	private async loadOrBuild(token?: vscode.CancellationToken): Promise<ProjectModel> {
		if (this.storageUri) {
			try {
				const stored = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE)))) as ProjectModel;
				// A schema change invalidates the cache (section 4).
				if (stored.schemaVersion === PROJECT_MODEL_SCHEMA_VERSION) {
					return stored;
				}
			} catch {
				// Not built yet in this workspace.
			}
		}
		return this.build(token);
	}

	private async build(token?: vscode.CancellationToken): Promise<ProjectModel> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		const multiRoot = folders.length > 1;
		const uris = new Map<string, vscode.Uri>();
		// One more than the budget, so the indexer can tell the budget was hit.
		const maxResults = DEFAULT_BUDGETS.maxFiles + 1;
		for (const glob of INPUT_GLOBS) {
			for (const folder of folders) {
				for (const uri of await vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), excludeGlob(folder), maxResults, token)) {
					uris.set(relativePath(uri, multiRoot), uri);
				}
			}
		}
		const model = await buildProjectModel({
			files: [...uris.keys()].map(path => ({ path })),
			read: async path => new TextDecoder().decode(await vscode.workspace.fs.readFile(uris.get(path)!)),
			trusted: vscode.workspace.isTrusted,
		});
		this.log.info(`[project-model] ${model.packages.length} packages, ${model.ci.length} pipelines, ${model.coverage.filesScanned} files in ${model.coverage.durationMs} ms${model.coverage.truncated ? ' (truncated)' : ''}`);
		if (this.storageUri) {
			await vscode.workspace.fs.createDirectory(this.storageUri);
			await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.storageUri, STORAGE_FILE), new TextEncoder().encode(JSON.stringify(model)));
		}
		return model;
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

function relativePath(uri: vscode.Uri, includeFolder: boolean): string {
	return vscode.workspace.asRelativePath(uri, includeFolder).split('\\').join('/');
}
