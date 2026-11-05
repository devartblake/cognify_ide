/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { type DevContainerRunner, type EnvironmentOutput, isTransientPullFailure, ManagedEnvironment, parseProjectFile } from '../environments/managedLocal.ts';
import type { ProcessRunner } from '../environments/runtimes.ts';

const UP_OK = '[1 ms] Start: Run: docker run …\n{"outcome":"success","containerId":"abc123","remoteUser":"root","remoteWorkspaceFolder":"/workspaces/demo-app"}\n';

/** A fake CLI that answers each call in turn and records the arguments. */
function fakeCli(answers: { code: number; stdout?: string; stderr?: string }[]): { cli: DevContainerRunner; calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		cli: async (args, options) => {
			calls.push(args.join(' '));
			const answer = answers.shift() ?? { code: 0 };
			options.onOutput?.(answer.stdout ?? '');
			return { code: answer.code, stdout: answer.stdout ?? '', stderr: answer.stderr ?? '' };
		},
	};
}

function recorder(): EnvironmentOutput & { text: string; retries: number } {
	return {
		text: '',
		retries: 0,
		write(text) {
			this.text += text;
		},
		retrying() {
			this.retries++;
		},
	};
}

const noDocker: ProcessRunner = async () => ({ code: null, stdout: '', stderr: '', error: 'ENOENT' });

describe('managed local (S4-07)', () => {
	test('a command starts the container first, then runs in it with the template\'s arguments', async () => {
		const { cli, calls } = fakeCli([{ code: 0, stdout: UP_OK }, { code: 0, stdout: '3 passed\n' }]);
		const output = recorder();
		const code = await new ManagedEnvironment('/home/me/demo-app', cli, noDocker).exec(['pip', 'install', '-e', '.[dev]'], output);
		assert.deepStrictEqual({ code, calls, streamed: output.text.endsWith('3 passed\n') }, {
			code: 0,
			calls: ['up --workspace-folder /home/me/demo-app', 'exec --workspace-folder /home/me/demo-app pip install -e .[dev]'],
			streamed: true,
		});
	});

	test('a transient image download failure is retried once; a permanent one and a second failure aren\'t', async () => {
		const pullTimeout = { code: 1, stderr: 'Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: TLS handshake timeout\n' };
		const run = async (answers: { code: number; stdout?: string; stderr?: string }[]) => {
			const { cli, calls } = fakeCli(answers);
			const output = recorder();
			const up = await new ManagedEnvironment('/p', cli, noDocker).start(output);
			return { outcome: up.outcome, calls: calls.length, retries: output.retries };
		};
		const rebuild = fakeCli([{ code: 0, stdout: UP_OK }]);
		await new ManagedEnvironment('/p', rebuild.cli, noDocker).start(recorder(), undefined, true);
		assert.deepStrictEqual({
			retried: await run([pullTimeout, { code: 0, stdout: UP_OK }]),
			twice: await run([pullTimeout, pullTimeout]),
			permanent: await run([{ code: 1, stderr: 'pull access denied for nope, repository does not exist\n' }]),
			rebuild: rebuild.calls,
		}, {
			retried: { outcome: 'success', calls: 2, retries: 1 },
			twice: { outcome: 'error', calls: 2, retries: 1 },
			permanent: { outcome: 'error', calls: 1, retries: 0 },
			rebuild: ['up --workspace-folder /p --remove-existing-container'],
		});
		assert.deepStrictEqual(['i/o timeout', 'unexpected EOF', 'manifest unknown'].map(isTransientPullFailure), [true, true, false]);
	});

	test('a failed start doesn\'t run the command', async () => {
		const { cli, calls } = fakeCli([{ code: 1, stdout: '{"outcome":"error","message":"Command failed: docker run"}\n' }]);
		const code = await new ManagedEnvironment('/p', cli, noDocker).exec(['pytest'], recorder());
		assert.deepStrictEqual({ code, calls }, { code: 1, calls: ['up --workspace-folder /p'] });
	});

	test('stop finds the project\'s containers by the CLI\'s folder label', async () => {
		const calls: string[] = [];
		const docker: ProcessRunner = async (command, args) => {
			calls.push([command, ...args].join(' '));
			return { code: 0, stdout: 'abc123\n', stderr: '' };
		};
		const stopped = await new ManagedEnvironment('/home/me/demo-app', fakeCli([]).cli, docker).stop();
		assert.deepStrictEqual({ stopped, calls }, { stopped: 1, calls: ['docker ps --quiet --filter label=devcontainer.local_folder=/home/me/demo-app', 'docker stop abc123'] });
	});

	test('the project file is read only when it is one Cognify wrote', () => {
		const valid = { version: 1, template: 'fastapi', environment: 'container', commands: { install: ['pip', 'install', '-e', '.[dev]'], test: ['pytest'], run: ['uvicorn', 'app.main:app'] } };
		assert.deepStrictEqual([
			JSON.stringify(valid),
			'not json',
			JSON.stringify({ ...valid, version: 2 }),
			JSON.stringify({ ...valid, environment: 'cloud' }),
			JSON.stringify({ ...valid, commands: { test: 'pytest', run: ['x'] } }),
			JSON.stringify({ ...valid, commands: { test: [], run: ['x'] } }),
			JSON.stringify({ ...valid, ports: [70000] }),
			JSON.stringify({ ...valid, ports: ['8000'] }),
		].map(text => parseProjectFile(text)?.environment), ['container', undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
		assert.deepStrictEqual(parseProjectFile(JSON.stringify({ ...valid, ports: [8000, 8001] }))?.ports, [8000, 8001]);
	});
});
