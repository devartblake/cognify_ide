/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { execFile } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { parseDevContainerUpOutput, resolveDevContainerCli, runDevContainerCli } from '../environments/devContainerCli';
import type { ProcessRunner } from '../environments/runtimes';
import type { CognifyAiApi } from '../routing';

suite('Dev Container CLI from the extension host (S4-03)', () => {
	test('the bundled CLI resolves under the app root and runs on the extension host\'s runtime', async () => {
		const cli = resolveDevContainerCli(vscode.env.appRoot);
		assert.ok(cli, `@devcontainers/cli under ${vscode.env.appRoot}`);
		// process.execPath is the Electron binary here; ELECTRON_RUN_AS_NODE makes it Node.
		const result = await runDevContainerCli(cli, ['--version']);
		assert.deepStrictEqual({ code: result.code, version: /^\d+\.\d+\.\d+$/.test(result.stdout.trim()) }, { code: 0, version: true });
	});

	// Needs a Docker daemon and registry access, so it runs only when asked for:
	// COGNIFY_TEST_DOCKER=1. Timings go to the test output for the S4-03 design note.
	(process.env['COGNIFY_TEST_DOCKER'] === '1' ? test : test.skip)('devcontainer up and exec run a preset (Docker)', async function () {
		this.timeout(600_000);
		const cli = resolveDevContainerCli(vscode.env.appRoot)!;
		const folder = mkdtempSync(join(tmpdir(), 'cognify-devcontainer-'));
		mkdirSync(join(folder, '.devcontainer'));
		writeFileSync(join(folder, '.devcontainer', 'devcontainer.json'), JSON.stringify({ name: 'cognify-spike', image: 'python:3.12-slim' }));
		let containerId: string | undefined;
		try {
			const up = await runDevContainerCli(cli, ['up', '--workspace-folder', folder]);
			const result = parseDevContainerUpOutput(up.stdout);
			containerId = result?.containerId;
			const exec = await runDevContainerCli(cli, ['exec', '--workspace-folder', folder, 'python', '--version']);
			const warm = await runDevContainerCli(cli, ['up', '--workspace-folder', folder]);
			console.log(`[S4-03] cold up ${up.durationMs} ms, exec ${exec.durationMs} ms, warm up ${warm.durationMs} ms`);
			assert.deepStrictEqual({
				up: result?.outcome,
				workspace: result?.remoteWorkspaceFolder?.startsWith('/workspaces/'),
				exec: exec.code,
				python: /^Python 3\.12\./.test(exec.stdout.trim()),
				warm: parseDevContainerUpOutput(warm.stdout)?.containerId === containerId,
			}, { up: 'success', workspace: true, exec: 0, python: true, warm: true });
		} finally {
			const id = containerId;
			if (id) {
				await new Promise(resolve => execFile('docker', ['rm', '-f', id], resolve));
			}
			rmSync(folder, { recursive: true, force: true });
		}
	});
});

suite('Check Environment (S4-06)', () => {
	test('reports runtimes and which templates the host can build, from fixed version commands only', async () => {
		const extension = vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!;
		const api = await extension.activate();
		const calls: string[] = [];
		// A host with Node 18 (too old for Next.js), Python 3.13 with pip, and Docker installed but stopped.
		const answers: Record<string, string> = {
			'node --version': 'v18.20.4',
			'npm --version': '10.8.2',
			'python3 --version': 'Python 3.13.1',
			'python3 -m pip --version': 'pip 25.3 from /usr/lib/python3 (python 3.13)',
		};
		const run: ProcessRunner = async (command, args) => {
			const line = [command, ...args].join(' ');
			calls.push(line);
			if (command === 'docker') {
				return { code: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' };
			}
			return answers[line] ? { code: 0, stdout: answers[line], stderr: '' } : { code: null, stdout: '', stderr: '', error: 'ENOENT' };
		};
		const report = await api.checkEnvironment(run);
		assert.deepStrictEqual({
			docker: report.runtimes.get('docker')?.state,
			cli: report.devContainerCli,
			templates: report.templates.map(t => [t.id, t.host.met, t.container]),
			nextjs: report.templates.find(t => t.id === 'nextjs')?.host.outdated,
			onlyVersionCommands: calls.every(call => /(--version|--list-sdks|--machine|version --format)/.test(call)),
		}, {
			docker: 'notRunning',
			cli: true,
			templates: [['aspnetcore', false, false], ['fastapi', true, false], ['flutter-web', false, false], ['nextjs', false, false]],
			nextjs: [{ runtime: 'node', minVersion: '20.9', version: '18.20.4' }],
			onlyVersionCommands: true,
		});
		assert.ok((await vscode.commands.getCommands(true)).includes('cognify.environment.check'));
	});
});
