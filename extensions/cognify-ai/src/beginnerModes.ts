/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The beginner modes' entry points (Sprint 5, S5-07 to S5-09; decisions D3 and D4): Fix with
// Cognify on errors and failed tasks, Explain with Cognify on a selection, and Guide Me. Each one
// opens Chat with an `@cognify` request; nothing is changed or run until the user acts on the answer.

import * as vscode from 'vscode';
import { TASK_TYPE } from './environmentTasks';

const CHAT_OPEN_COMMAND = 'workbench.action.chat.open';
export const FIX_DIAGNOSTIC_COMMAND = 'cognify.fixDiagnostic';

/** Lines of code around a problem that Fix It attaches, on each side. */
const CONTEXT_LINES = 15;

/** Upstream's `IChatViewOpenOptions` (the subset Cognify uses); ranges are 1-based, as in the editor model. */
interface ChatOpenOptions {
	readonly query: string;
	readonly isPartialQuery?: boolean;
	readonly attachFiles?: readonly (vscode.Uri | { readonly uri: vscode.Uri; readonly range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } })[];
}

/** The chat request a Cognify entry point sends. Exported for tests. */
export function fixRequest(document: Pick<vscode.TextDocument, 'uri' | 'lineCount'>, diagnostic: Pick<vscode.Diagnostic, 'message' | 'range' | 'source' | 'code'>): ChatOpenOptions {
	const where = vscode.workspace.asRelativePath(document.uri, false);
	const code = typeof diagnostic.code === 'object' ? diagnostic.code.value : diagnostic.code;
	const origin = [diagnostic.source, code].filter(part => part !== undefined && part !== '').join(' ');
	const start = Math.max(0, diagnostic.range.start.line - CONTEXT_LINES);
	const end = Math.min(document.lineCount - 1, diagnostic.range.end.line + CONTEXT_LINES);
	return {
		query: `@cognify /fix ${vscode.l10n.t('{0} at line {1} of {2}', origin ? `${diagnostic.message} (${origin})` : diagnostic.message, diagnostic.range.start.line + 1, where)}`,
		attachFiles: [{ uri: document.uri, range: { startLineNumber: start + 1, startColumn: 1, endLineNumber: end + 1, endColumn: Number.MAX_SAFE_INTEGER } }],
	};
}

/** Offers "Fix with Cognify" on errors and warnings. */
class FixWithCognifyProvider implements vscode.CodeActionProvider {
	static readonly kinds = [vscode.CodeActionKind.QuickFix];

	provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
		return context.diagnostics
			.filter(d => d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
			.slice(0, 1)
			.map(diagnostic => {
				const action = new vscode.CodeAction(vscode.l10n.t('Fix with Cognify'), vscode.CodeActionKind.QuickFix);
				action.diagnostics = [diagnostic];
				action.command = { command: FIX_DIAGNOSTIC_COMMAND, title: action.title, arguments: [document.uri, diagnostic] };
				return action;
			});
	}
}

async function openChat(options: ChatOpenOptions): Promise<void> {
	await vscode.commands.executeCommand(CHAT_OPEN_COMMAND, options);
}

/** Explain with Cognify: the selection (or the error under the cursor) goes to `/explain`. */
async function explainSelection(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		await openChat({ query: '@cognify /explain ', isPartialQuery: true });
		return;
	}
	const selection = editor.selection;
	const diagnostic = vscode.languages.getDiagnostics(editor.document.uri).find(d => d.range.contains(selection.active));
	if (selection.isEmpty && diagnostic) {
		await openChat({ query: `@cognify /explain ${vscode.l10n.t('What does this error mean: {0}', diagnostic.message)}`, attachFiles: fixRequest(editor.document, diagnostic).attachFiles });
		return;
	}
	const range = selection.isEmpty ? editor.document.lineAt(selection.active.line).range : selection;
	await openChat({
		query: `@cognify /explain ${vscode.l10n.t('Explain this code.')}`,
		attachFiles: [{ uri: editor.document.uri, range: { startLineNumber: range.start.line + 1, startColumn: range.start.character + 1, endLineNumber: range.end.line + 1, endColumn: range.end.character + 1 } }],
	});
}

/** Offers Fix It when a project command (`cognify` task) fails. */
function watchFailedTasks(): vscode.Disposable {
	return vscode.tasks.onDidEndTaskProcess(async e => {
		const task = e.execution.task;
		// `run` ends when the user stops it, with any exit code: only build, test and install count as failures.
		if (task.definition.type !== TASK_TYPE || task.name === 'run' || !e.exitCode) {
			return;
		}
		const fix = vscode.l10n.t('Fix with Cognify');
		const answer = await vscode.window.showWarningMessage(vscode.l10n.t('The {0} command failed (exit code {1}).', task.name, e.exitCode), fix);
		if (answer === fix) {
			await openChat({ query: `@cognify /fix ${vscode.l10n.t('The `{0}` command failed with exit code {1}. The error from the terminal:', `cognify: ${task.name}`, e.exitCode)} `, isPartialQuery: true });
		}
	});
}

export function registerBeginnerModes(): vscode.Disposable {
	return vscode.Disposable.from(
		vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new FixWithCognifyProvider(), { providedCodeActionKinds: FixWithCognifyProvider.kinds }),
		vscode.commands.registerCommand(FIX_DIAGNOSTIC_COMMAND, async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
			const document = await vscode.workspace.openTextDocument(uri);
			await openChat(fixRequest(document, diagnostic));
		}),
		vscode.commands.registerCommand('cognify.explainSelection', () => explainSelection()),
		vscode.commands.registerCommand('cognify.guideMe', async () => {
			const goal = await vscode.window.showInputBox({ title: vscode.l10n.t('Guide Me'), prompt: vscode.l10n.t('What would you like to do?'), placeHolder: vscode.l10n.t('For example: add a page that lists users') });
			if (goal) {
				await openChat({ query: `@cognify /guide ${goal}` });
			}
		}),
		watchFailedTasks(),
	);
}
