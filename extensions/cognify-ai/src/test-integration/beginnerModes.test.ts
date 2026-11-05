/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { FIX_DIAGNOSTIC_COMMAND, fixRequest } from '../beginnerModes';

suite('Fix with Cognify and Explain with Cognify (S5-08, S5-09)', () => {
	test('an error offers Fix with Cognify, whose request names the error and attaches the code around it; nothing is edited', async () => {
		// The code action provider is registered when the extension activates.
		await vscode.extensions.getExtension('vscode.cognify-ai')!.activate();
		const dir = mkdtempSync(join(tmpdir(), 'cognify-fix-'));
		const file = join(dir, 'main.py');
		const source = Array.from({ length: 40 }, (_, i) => i === 19 ? 'print(x)' : `# line ${i + 1}`).join('\n');
		writeFileSync(file, source);
		const diagnostics = vscode.languages.createDiagnosticCollection('cognify-test');
		try {
			const document = await vscode.workspace.openTextDocument(file);
			const diagnostic = new vscode.Diagnostic(new vscode.Range(19, 6, 19, 7), 'name \'x\' is not defined', vscode.DiagnosticSeverity.Error);
			diagnostic.source = 'Pylance';
			diagnostics.set(document.uri, [diagnostic]);
			// Diagnostics reach the code action context through the marker service, asynchronously.
			for (let i = 0; i < 50 && !vscode.languages.getDiagnostics(document.uri).length; i++) {
				await new Promise(resolve => setTimeout(resolve, 100));
			}
			const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', document.uri, diagnostic.range, vscode.CodeActionKind.QuickFix.value);
			const fix = actions.find(action => action.title === 'Fix with Cognify');
			const request = fixRequest(document, diagnostic);
			const attached = request.attachFiles?.[0];
			assert.deepStrictEqual({
				offered: fix?.command?.command,
				query: request.query,
				range: attached && !(attached instanceof vscode.Uri) ? [attached.range.startLineNumber, attached.range.endLineNumber] : undefined,
				unchanged: readFileSync(file, 'utf8') === source && !document.isDirty,
			}, {
				offered: FIX_DIAGNOSTIC_COMMAND,
				query: '@cognify /fix name \'x\' is not defined (Pylance) at line 20 of ' + vscode.workspace.asRelativePath(document.uri, false),
				range: [5, 35],
				unchanged: true,
			});
			const commands = await vscode.commands.getCommands(true);
			assert.ok(['cognify.explainSelection', 'cognify.guideMe', FIX_DIAGNOSTIC_COMMAND].every(id => commands.includes(id)));
		} finally {
			diagnostics.dispose();
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
