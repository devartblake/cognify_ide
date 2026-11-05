/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { answer, answerRecentChanges, ProjectQuery, QueryAnswer, RecentChanges } from './projectModel/queries';
import { ProjectModelService } from './projectModelService';
import type { RoleLog } from './roles';
import { readPrivacySettings } from './routing';

export const PROJECT_MODEL_TOOL = 'cognify_projectModel';

interface ToolInput {
	readonly operation: 'summary' | 'package' | 'howToTest' | 'howToRun' | 'ciFor' | 'recentChanges';
	readonly path?: string;
	readonly paths?: readonly string[];
	readonly branch?: string;
}

/**
 * The `cognify_projectModel` tool (S3-09): lets any role or agent ask Project
 * Cognition how the workspace is built, tested and shipped. Answers are prompt-sized,
 * cite evidence paths, and are redacted. Every call writes a metadata-only line to
 * the Cognify AI log: operation, packages, size and whether anything was redacted.
 */
export function registerProjectModelTool(service: ProjectModelService, log: RoleLog): vscode.Disposable {
	return vscode.lm.registerTool<ToolInput>(PROJECT_MODEL_TOOL, {
		prepareInvocation(options) {
			return { invocationMessage: vscode.l10n.t('Reading the project model ({0})', options.input.operation) };
		},

		async invoke(options, token) {
			const input = options.input;
			// The tool can't see which model will read its answer. `local-only` requests
			// can't use tools anyway (no local model calls tools), so refuse outright.
			if (readPrivacySettings().localOnly) {
				return result(vscode.l10n.t('Project Cognition is unavailable because cognify.privacy.localOnly is on: its answers would go to a model this tool cannot check.'));
			}
			const model = await service.get(token);
			let response: QueryAnswer;
			if (input.operation === 'recentChanges') {
				const changes = await recentChanges(input.path);
				response = changes ? answerRecentChanges(model, changes) : { text: vscode.l10n.t('Recent changes are unavailable: the Git extension is disabled or this workspace has no repository.'), packagesTouched: [], redacted: false };
			} else {
				response = answer(model, toQuery(input));
			}
			log.info(JSON.stringify({ timestamp: new Date().toISOString(), tool: PROJECT_MODEL_TOOL, operation: input.operation, packagesTouched: response.packagesTouched, bytes: response.text.length, redacted: response.redacted }));
			return result(response.text);
		},
	});
}

function toQuery(input: ToolInput): ProjectQuery {
	switch (input.operation) {
		case 'package':
			return { operation: 'package', path: input.path ?? activeFile() ?? '.' };
		case 'howToTest':
			return { operation: 'howToTest', path: input.path ?? activeFile() ?? '.', branch: input.branch };
		case 'howToRun':
			return { operation: 'howToRun', path: input.path ?? activeFile() ?? '.' };
		case 'ciFor':
			return { operation: 'ciFor', paths: input.paths?.length ? input.paths : [input.path ?? activeFile() ?? '.'], branch: input.branch };
		default:
			return { operation: 'summary' };
	}
}

/** The active editor's workspace-relative path, the default when a query names no file. */
function activeFile(): string | undefined {
	const uri = vscode.window.activeTextEditor?.document.uri;
	return uri && vscode.workspace.getWorkspaceFolder(uri) ? vscode.workspace.asRelativePath(uri, false) : undefined;
}

/**
 * How the project (or the package with the active file) runs and tests, for Guide Me and Fix It
 * (S5-07, S5-08). The same redacted, prompt-sized answers as the tool's `howToRun` and `howToTest`;
 * the router's privacy gate decides where the prompt may go.
 */
export async function projectContextFor(service: ProjectModelService, token?: vscode.CancellationToken): Promise<string | undefined> {
	if (!vscode.workspace.workspaceFolders?.length) {
		return undefined;
	}
	const model = await service.get(token);
	const path = activeFile() ?? '.';
	return [answer(model, { operation: 'howToRun', path }).text, answer(model, { operation: 'howToTest', path }).text].join('\n\n');
}

function result(text: string): vscode.LanguageModelToolResult {
	return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

// The subset of the built-in Git extension's API (`vscode.git`, `getAPI(1)`) used here.
interface GitCommit { readonly hash: string; readonly message: string; readonly commitDate?: Date }
interface GitChange { readonly uri: vscode.Uri; readonly status: number }
interface GitRepository {
	readonly rootUri: vscode.Uri;
	readonly state: { readonly HEAD?: { readonly name?: string; readonly commit?: string }; readonly workingTreeChanges: readonly GitChange[] };
	log(options?: { readonly maxEntries?: number; readonly range?: string; readonly path?: string }): Promise<GitCommit[]>;
	getMergeBase(ref1: string, ref2: string): Promise<string | undefined>;
}
interface GitApi { readonly repositories: readonly GitRepository[] }

/** Integration branches to compare against, in order (the branch model's `dev`, then `main`). */
const BASE_BRANCHES = ['dev', 'origin/dev', 'main', 'origin/main'];

async function recentChanges(path: string | undefined): Promise<RecentChanges | undefined> {
	const git = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
	if (!git) {
		return undefined;
	}
	const api = (git.isActive ? git.exports : await git.activate()).getAPI(1);
	const repository = api.repositories[0];
	if (!repository?.state.HEAD?.commit) {
		return undefined;
	}
	let since = vscode.l10n.t('the last 20 commits');
	let range: string | undefined;
	for (const base of BASE_BRANCHES) {
		if (base === repository.state.HEAD.name) {
			continue;
		}
		const mergeBase = await repository.getMergeBase('HEAD', base).catch(() => undefined);
		if (mergeBase) {
			since = vscode.l10n.t('the merge base with {0} ({1})', base, mergeBase.slice(0, 10));
			range = `${mergeBase}..HEAD`;
			break;
		}
	}
	// `path` narrows the log to commits touching it (`git log -- <path>`); the Git API resolves it against the repository root.
	const commits = await repository.log({ maxEntries: 20, range, path: path ? vscode.Uri.joinPath(repository.rootUri, path).fsPath : undefined }).catch(() => []);
	return {
		since,
		path,
		commits: commits.map(c => ({ sha: c.hash, subject: c.message.split('\n')[0], date: c.commitDate?.toISOString() ?? '' })),
		workingTree: repository.state.workingTreeChanges.map(change => ({ path: vscode.workspace.asRelativePath(change.uri, false), status: GIT_STATUS[change.status] ?? 'changed' })),
	};
}

/** `Status` values from the Git extension's API that matter for a change list. */
const GIT_STATUS: Readonly<Record<number, string>> = { 5: 'modified', 6: 'deleted', 7: 'untracked', 9: 'added', 10: 'renamed' };
