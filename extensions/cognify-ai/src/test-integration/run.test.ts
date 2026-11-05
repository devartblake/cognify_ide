/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { AddressInfo, createServer } from 'net';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import type { CognifyAiApi } from '../routing';

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	await new Promise(resolve => server.close(resolve));
	return port;
}

/** A host project whose run command is `node <args>`. */
function hostProject(root: string, name: string, run: string[], ports: number[], files: Record<string, string> = {}): string {
	const folder = join(root, name);
	mkdirSync(join(folder, '.cognify'), { recursive: true });
	for (const [file, content] of Object.entries(files)) {
		writeFileSync(join(folder, file), content);
	}
	writeFileSync(join(folder, '.cognify', 'project.json'), JSON.stringify({ version: 1, template: 'fastapi', environment: 'host', commands: { test: ['node', '--version'], run: ['node', ...run] }, ports }));
	return folder;
}

suite('Run Project (S5-04, S5-05)', () => {
	let root: string;
	let api: CognifyAiApi;

	suiteSetup(async () => {
		api = await vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!.activate();
		root = mkdtempSync(join(tmpdir(), 'cognify-run-'));
	});

	suiteTeardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		rmSync(root, { recursive: true, force: true });
	});

	test('starts the app, waits for it to answer, previews it, reuses the run, and stops it', async () => {
		const port = await freePort();
		// The server starts listening a second after the task starts, like a dev server compiling.
		const folder = hostProject(root, 'app', ['server.js'], [port], {
			'server.js': `setTimeout(() => require('http').createServer((q, r) => r.end('hello')).listen(${port}, '127.0.0.1'), 1000);`,
		});
		const first = await api.runProject(folder, { timeoutMs: 30_000 });
		const runningState = api.projectRunState(folder);
		const executions = vscode.tasks.taskExecutions.filter(e => e.task.source === 'cognify').length;
		const second = await api.runProject(folder);
		const executionsAfterSecond = vscode.tasks.taskExecutions.filter(e => e.task.source === 'cognify').length;
		await api.stopProject(folder);
		assert.deepStrictEqual({ first, runningState, executions, second: second.outcome, executionsAfterSecond, afterStop: api.projectRunState(folder) }, {
			first: { outcome: 'running', port, url: `http://localhost:${port}/`, surface: 'integratedBrowser' },
			runningState: { state: 'running', port, url: `http://localhost:${port}/` },
			executions: 1,
			second: 'running',
			executionsAfterSecond: 1,
			afterStop: { state: 'stopped' },
		});
		assert.ok((await vscode.commands.getCommands(true)).includes('cognify.project.run'));
	});

	test('a port already in use, an app that never answers, and an app that exits early', async () => {
		const busyPort = await freePort();
		const busy = createServer(() => { });
		await new Promise<void>(resolve => busy.listen(busyPort, '127.0.0.1', resolve));
		try {
			const inUse = await api.runProject(hostProject(root, 'busy', ['-e', 'setInterval(() => {}, 1000)'], [busyPort]));
			const silentPort = await freePort();
			const silentFolder = hostProject(root, 'silent', ['-e', 'setInterval(() => {}, 1000)'], [silentPort]);
			const silent = await api.runProject(silentFolder, { timeoutMs: 2_000 });
			const stillStarting = api.projectRunState(silentFolder);
			await api.stopProject(silentFolder);
			const exits = await api.runProject(hostProject(root, 'exits', ['-e', 'process.exit(3)'], [await freePort()]), { timeoutMs: 30_000 });
			assert.deepStrictEqual({ inUse, silent, stillStarting, exits }, {
				inUse: { outcome: 'portInUse', port: busyPort },
				silent: { outcome: 'timeout', port: silentPort },
				stillStarting: { state: 'starting', port: silentPort },
				exits: { outcome: 'ended' },
			});
		} finally {
			busy.close();
		}
	});
});
