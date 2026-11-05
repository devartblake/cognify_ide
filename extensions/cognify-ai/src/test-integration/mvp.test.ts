/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The MVP scenario, end to end (Sprint 6, S6-06): New Project (FastAPI, on the host) → install and
// test → Run and preview → `/guide` and `/fix` answered with the project's context → Stop. Real
// runtimes, real pip and uvicorn; fake language model vendors (test-fixtures/fake-lm).
//
// Needs Python 3.10+ whose `python3` and `pip` are first on PATH (CI uses a virtual environment)
// and network access to PyPI, so it runs only with COGNIFY_TEST_MVP=1, as in `Cognify (dev)`.

import * as assert from 'assert';
import { rmSync } from 'fs';
import 'mocha';
import { join } from 'path';
import * as vscode from 'vscode';
import type { NewProjectUi } from '../environments/newProject';
import { projectContextFor } from '../projectModelTool';
import { createRoleHandler, RoleResponseStream } from '../roles';
import type { CognifyAiApi } from '../routing';

/** Runs a `cognify` task and resolves with its exit code. */
async function runTask(task: vscode.Task): Promise<number | undefined> {
	const ended = new Promise<number | undefined>(resolve => {
		const listener = vscode.tasks.onDidEndTaskProcess(e => {
			if (e.execution.task.source === 'cognify' && e.execution.task.name === task.name) {
				listener.dispose();
				resolve(e.exitCode);
			}
		});
	});
	await vscode.tasks.executeTask(task);
	return ended;
}

suite('MVP scenario (S6-06)', () => {
	(process.env['COGNIFY_TEST_MVP'] === '1' ? test : test.skip)('New Project (FastAPI, host) → install and test → Run and preview → /guide and /fix with the project context → Stop', async function () {
		this.timeout(600_000);
		const api = await vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!.activate();
		await vscode.commands.executeCommand('cognifyFakeLm.configure', {});
		const workspace = vscode.workspace.workspaceFolders![0].uri.fsPath;

		// 1. New Project, with real runtime detection: FastAPI on the host, in the open workspace.
		const ui: NewProjectUi = {
			pickTemplate: async choices => choices.find(choice => choice.template.manifest.id === 'fastapi')?.template,
			inputName: async () => 'MVP Demo',
			pickParentFolder: async () => workspace,
			pickEnvironment: async () => 'host',
		};
		const created = await api.createProject(ui);
		assert.ok(created.outcome === 'created', `New Project: ${JSON.stringify(created)}`);
		const folder = created.folder;
		try {
			// 2. Its install and test commands, as `cognify` tasks.
			const tasks = await api.projectTasks(folder);
			const install = await runTask(tasks.find(t => t.name === 'install')!);
			const tests = await runTask(tasks.find(t => t.name === 'test')!);

			// 3. Run: start uvicorn, wait for the port, open the preview; the app answers.
			const run = await api.runProject(folder, { timeoutMs: 120_000 });
			const body = run.outcome === 'running' ? await (await fetch(run.url)).json() : undefined;

			// 4. Ask Cognify about the open file: the Tutor (/guide) and the Coder (/fix) get the
			// project's run and test commands from Project Cognition.
			await vscode.window.showTextDocument(vscode.Uri.file(join(folder, 'app', 'main.py')));
			await api.projectModel.rebuild();
			const contexts: (string | undefined)[] = [];
			const handler = createRoleHandler(api.router, { info: () => { }, warn: () => { } }, async token => {
				const context = await projectContextFor(api.projectModel, token);
				contexts.push(context);
				return context;
			});
			const ask = async (command: string, prompt: string) => {
				const output: string[] = [];
				const stream: RoleResponseStream = { markdown: value => { output.push(typeof value === 'string' ? value : value.value); }, progress: () => { } };
				const result = await handler({ command, prompt, references: [] }, stream, new vscode.CancellationTokenSource().token);
				return { role: result.metadata?.cognify.role, outcome: result.metadata?.cognify.outcome, answered: output.join('').startsWith('answer from') };
			};
			const guide = await ask('guide', 'how do I run this app and see it?');
			const fix = await ask('fix', 'NameError: name \'FastAPI\' is not defined (app/main.py, line 3)');

			// 5. Stop.
			await api.stopProject(folder);

			assert.deepStrictEqual({
				created: [created.template, created.environment, created.host.met],
				install,
				tests,
				run: run.outcome === 'running' ? [run.port, run.surface] : run,
				body,
				guide,
				fix,
				context: contexts.map(context => !!context && context.includes('uvicorn app.main:app') && context.includes('pytest')),
				afterStop: api.projectRunState(folder),
			}, {
				created: ['fastapi', 'host', true],
				install: 0,
				tests: 0,
				run: [8000, 'integratedBrowser'],
				body: { message: 'Hello from MVP Demo' },
				guide: { role: 'tutor', outcome: 'success', answered: true },
				fix: { role: 'coder', outcome: 'success', answered: true },
				context: [true, true],
				afterStop: { state: 'stopped' },
			});
		} finally {
			await api.stopProject(folder);
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
			rmSync(folder, { recursive: true, force: true });
		}
	});
});
