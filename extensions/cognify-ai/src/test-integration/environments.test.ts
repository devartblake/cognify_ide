/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { execFile } from 'child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import 'mocha';
import { tmpdir } from 'os';
import { join } from 'path';
import * as vscode from 'vscode';
import { parseDevContainerUpOutput, resolveDevContainerCli, runDevContainerCli } from '../environments/devContainerCli';
import type { NewProjectUi, ProjectEnvironment } from '../environments/newProject';
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

suite('New Project (S4-05)', () => {
	/** A host with Python 3.13 and pip; Docker running or not. */
	function fakeHost(dockerRunning: boolean): ProcessRunner {
		const answers: Record<string, string> = {
			'python3 --version': 'Python 3.13.1',
			'python3 -m pip --version': 'pip 25.3 from /usr/lib/python3 (python 3.13)',
			...(dockerRunning ? { 'docker version --format {{.Server.Version}}': '29.9.2' } : {}),
		};
		return async (command, args) => {
			const line = [command, ...args].join(' ');
			return answers[line] ? { code: 0, stdout: answers[line], stderr: '' } : { code: null, stdout: '', stderr: '', error: 'ENOENT' };
		};
	}

	function answering(parent: string, environment?: ProjectEnvironment): NewProjectUi & { environmentAsked: boolean } {
		return {
			environmentAsked: false,
			pickTemplate: async choices => choices.find(c => c.template.manifest.id === 'fastapi')?.template,
			inputName: async () => 'Demo App',
			pickParentFolder: async () => parent,
			async pickEnvironment() {
				this.environmentAsked = true;
				return environment;
			},
		};
	}

	test('creates the project on the host and in a Dev Container, and cancelling writes nothing', async () => {
		const api = await vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!.activate();
		const dir = mkdtempSync(join(tmpdir(), 'cognify-new-project-'));
		try {
			const hostUi = answering(join(dir, 'host'));
			const host = await api.createProject(hostUi, fakeHost(false));
			const containerUi = answering(join(dir, 'container'), 'container');
			const container = await api.createProject(containerUi, fakeHost(true));
			const cancelled = await api.createProject(answering(join(dir, 'cancelled')), fakeHost(true));
			const project = (folder: string) => JSON.parse(readFileSync(join(folder, '.cognify', 'project.json'), 'utf8')).environment;
			assert.deepStrictEqual({
				host: host.outcome === 'created' && [project(host.folder), hostUi.environmentAsked, host.host.met],
				container: container.outcome === 'created' && [project(container.folder), containerUi.environmentAsked],
				cancelled,
				written: readdirSync(dir).sort(),
			}, {
				host: ['host', false, true],
				container: ['container', true],
				cancelled: { outcome: 'cancelled', step: 'environment' },
				written: ['container', 'host'],
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
		assert.ok((await vscode.commands.getCommands(true)).includes('cognify.newProject'));
	});
});

suite('Managed local (S4-07)', () => {
	test('the template\'s commands are `cognify` tasks: in the Dev Container through the CLI, or on the host through the shell', async () => {
		const api = await vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!.activate();
		const dir = mkdtempSync(join(tmpdir(), 'cognify-managed-'));
		try {
			const container = join(dir, 'container');
			const host = join(dir, 'host');
			mkdirSync(join(container, '.cognify'), { recursive: true });
			mkdirSync(join(host, '.cognify'), { recursive: true });
			const commands = { install: ['pip', 'install', '-e', '.[dev]'], test: ['pytest'], run: ['uvicorn', 'app.main:app'] };
			writeFileSync(join(container, '.cognify', 'project.json'), JSON.stringify({ version: 1, template: 'fastapi', environment: 'container', commands }));
			writeFileSync(join(host, '.cognify', 'project.json'), JSON.stringify({ version: 1, template: 'fastapi', environment: 'host', commands }));

			// A fake CLI: `up` succeeds, `exec` prints the test result.
			const calls: string[] = [];
			const cli = async (args: readonly string[], options: { onOutput?: (chunk: string) => void }) => {
				calls.push(args[0]);
				const stdout = args[0] === 'up' ? '{"outcome":"success","containerId":"abc"}\n' : '1 passed\n';
				options.onOutput?.(stdout);
				return { code: 0, stdout, stderr: '' };
			};
			const containerTasks = await api.projectTasks(container, { cli });
			const hostTasks = await api.projectTasks(host);
			const testTask = containerTasks.find(t => t.name === 'test')!;
			const ended = new Promise<number | undefined>(resolve => {
				const listener = vscode.tasks.onDidEndTaskProcess(e => {
					if (e.execution.task.name === 'test' && e.execution.task.source === 'cognify') {
						listener.dispose();
						resolve(e.exitCode);
					}
				});
			});
			await vscode.tasks.executeTask(testTask);
			const exitCode = await ended;
			const shell = hostTasks.find(t => t.name === 'install')!.execution as vscode.ShellExecution;
			assert.deepStrictEqual({
				container: containerTasks.map(t => [t.name, t.definition.command, t.detail, t.group?.id]),
				exitCode,
				calls,
				host: { command: shell.command, args: shell.args?.map(a => typeof a === 'string' ? a : a.value), cwd: shell.options?.cwd },
			}, {
				container: [
					['install', 'install', 'pip install -e .[dev] (in the Dev Container)', undefined],
					['test', 'test', 'pytest (in the Dev Container)', vscode.TaskGroup.Test.id],
					['run', 'run', 'uvicorn app.main:app (in the Dev Container)', undefined],
				],
				exitCode: 0,
				calls: ['up', 'exec'],
				host: { command: 'pip', args: ['install', '-e', '.[dev]'], cwd: host },
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
		const commands = await vscode.commands.getCommands(true);
		assert.ok(['cognify.environment.start', 'cognify.environment.stop', 'cognify.environment.rebuild', 'cognify.environment.run'].every(id => commands.includes(id)));
	});
});
