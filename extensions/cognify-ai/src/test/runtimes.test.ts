/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { checkRequirements, compareVersions, detectRuntimes, nodeProcessRunner, processError, type ProcessResult, type ProcessRunner, RUNTIME_IDS } from '../environments/runtimes.ts';

/** A fake host: command line → result. Anything else doesn't exist. */
function fakeHost(answers: Record<string, Partial<ProcessResult>>): { run: ProcessRunner; calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		run: async (command, args, timeoutMs) => {
			const line = [command, ...args].join(' ');
			calls.push(`${line} (${timeoutMs} ms)`);
			const answer = answers[line];
			return answer ? { code: 0, stdout: '', stderr: '', ...answer } : { code: null, stdout: '', stderr: '', error: 'ENOENT' };
		},
	};
}

describe('runtime detection (S4-06)', () => {
	test('found, missing, timed out, permission denied, Docker without its daemon, and the Python fallbacks', async () => {
		const host = fakeHost({
			'git --version': { stdout: 'git version 2.47.1\n' },
			'node --version': { stdout: 'v24.22.1\n' },
			'npm --version': { stdout: '11.6.2\n' },
			// python3 doesn't exist on this host; `python` does (Python 2 printed its version to stderr).
			'python --version': { stdout: 'Python 3.13.1\n' },
			'python -m pip --version': { stdout: 'pip 25.3 from /usr/lib/python3/dist-packages/pip (python 3.13)\n' },
			'dotnet --list-sdks': { stdout: '8.0.404 [/usr/share/dotnet/sdk]\n10.0.100 [/usr/share/dotnet/sdk]\n' },
			'pnpm --version': { code: null, error: 'EACCES' },
			'flutter --version --machine': { error: 'TIMEOUT' },
			'docker version --format {{.Server.Version}}': { code: 1, stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n' },
		});
		const statuses = await detectRuntimes(RUNTIME_IDS, host.run, 1_500);
		assert.deepStrictEqual(Object.fromEntries([...statuses].map(([id, s]) => [id, s.state === 'found' ? `${s.state} ${s.version} via ${s.command}` : s.detail ? `${s.state}: ${s.detail}` : s.state])), {
			git: 'found 2.47.1 via git --version',
			node: 'found 24.22.1 via node --version',
			npm: 'found 11.6.2 via npm --version',
			pnpm: 'error: EACCES',
			python: 'found 3.13.1 via python --version',
			pip: 'found 25.3 via python -m pip --version',
			uv: 'missing',
			dotnet: 'found 10.0.100 via dotnet --list-sdks',
			flutter: 'timeout',
			dart: 'missing',
			docker: 'notRunning: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
		});
		assert.ok(host.calls.every(call => call.endsWith('(1500 ms)')), 'every probe has the timeout');
	});

	test('Windows: the Microsoft Store python3 placeholder and a failing command fall through to the next one (B2)', async () => {
		// What the real runner returns for it on Windows (see the `processError` test).
		const storePlaceholder: Partial<ProcessResult> = { code: 9009, error: 'ENOENT', stderr: 'Python was not found; run without arguments to install from the Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app settings > App execution aliases.' };
		const pythonWorks = fakeHost({
			'python3 --version': storePlaceholder,
			'python3 -m pip --version': storePlaceholder,
			// `python` runs, but this Python has no pip; `py` has both.
			'python --version': { stdout: 'Python 3.13.15\n' },
			'python -m pip --version': { code: 1, stderr: 'No module named pip\n' },
			'py -3 -m pip --version': { stdout: 'pip 25.3 from C:\\Python313\\Lib\\site-packages\\pip (python 3.13)\n' },
		});
		const onlyPlaceholder = fakeHost({ 'python3 --version': storePlaceholder });
		const brokenPython = fakeHost({ 'python3 --version': { code: 1, stderr: 'Fatal Python error: init_import_site\n' } });
		const [works, placeholder, broken] = await Promise.all([pythonWorks, onlyPlaceholder, brokenPython].map(host => detectRuntimes(['python', 'pip'], host.run)));
		const describe = (statuses: Map<string, { state: string; version?: string; command?: string; detail?: string }>) =>
			Object.fromEntries([...statuses].map(([id, s]) => [id, s.state === 'found' ? `found ${s.version} via ${s.command}` : s.detail ? `${s.state}: ${s.detail}` : s.state]));
		assert.deepStrictEqual({ works: describe(works), placeholder: describe(placeholder), broken: describe(broken) }, {
			works: { python: 'found 3.13.15 via python --version', pip: 'found 25.3 via py -3 -m pip --version' },
			placeholder: { python: 'missing', pip: 'missing' },
			broken: { python: 'error: Fatal Python error: init_import_site', pip: 'missing' },
		});
	});

	test('requirements: met, missing and outdated; optional ones never block', async () => {
		const statuses = await detectRuntimes(['node', 'npm', 'python', 'dotnet'], fakeHost({
			'node --version': { stdout: 'v18.20.4' },
			'npm --version': { stdout: '10.8.2' },
			'dotnet --list-sdks': { stdout: '10.0.100 [/sdk]' },
		}).run);
		assert.deepStrictEqual({
			nextjs: checkRequirements([{ runtime: 'node', minVersion: '20.9' }, { runtime: 'npm' }], statuses),
			fastapi: checkRequirements([{ runtime: 'python', minVersion: '3.10' }], statuses).missing.map(m => [m.runtime, m.status.state]),
			aspnetcore: checkRequirements([{ runtime: 'dotnet', minVersion: '10.0' }, { runtime: 'python', optional: true }], statuses).met,
		}, {
			nextjs: { met: false, missing: [], outdated: [{ runtime: 'node', minVersion: '20.9', version: '18.20.4' }] },
			fastapi: [['python', 'missing']],
			aspnetcore: true,
		});
	});

	test('versions compare numerically', () => {
		assert.deepStrictEqual(
			[['3.10', '3.9'], ['10.0.100', '9.0.300'], ['20.9', '20.9.0'], ['3.24', '3.47.9']].map(([a, b]) => Math.sign(compareVersions(a, b))),
			[1, 1, 0, -1],
		);
	});

	test('exit code 9009 means "command not found" on Windows only', () => {
		const failed = (code: number | string) => Object.assign(new Error('Command failed'), { code }) as NodeJS.ErrnoException;
		const cases = {
			win32Exit9009: processError('win32', failed(9009), 9009, 'Python was not found; run without arguments to install from the Microsoft Store'),
			win32NotRecognized: processError('win32', failed(1), 1, '\'flutter\' is not recognized as an internal or external command'),
			linuxExit9009: processError('linux', failed(9009), 9009, ''),
			win32Exit1: processError('win32', failed(1), 1, 'error'),
			enoent: processError('linux', failed('ENOENT'), null, ''),
			timeout: processError('linux', Object.assign(failed('SIGTERM'), { killed: true }), null, ''),
			ok: processError('win32', null, 0, ''),
		};
		assert.deepStrictEqual(cases, { win32Exit9009: 'ENOENT', win32NotRecognized: 'ENOENT', linuxExit9009: undefined, win32Exit1: undefined, enoent: 'ENOENT', timeout: 'TIMEOUT', ok: undefined });
	});

	test('the real runner reports a missing command and runs a real one without a shell', async () => {
		const run = nodeProcessRunner();
		const missing = await run('cognify-no-such-command', ['--version'], 2_000);
		const node = await run(process.execPath, ['--version'], 5_000);
		assert.deepStrictEqual({ missing: missing.error, code: node.code, version: /^v\d+\./.test(node.stdout) }, { missing: 'ENOENT', code: 0, version: true });
	});
});
