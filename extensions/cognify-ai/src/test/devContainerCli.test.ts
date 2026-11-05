/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { devContainerCliCandidates, parseDevContainerUpOutput, resolveDevContainerCli, runDevContainerCli } from '../environments/devContainerCli.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

describe('Dev Container CLI (S4-03)', () => {
	test('prefers the packaged (unpacked from ASAR) copy, then the development one, and reports a build without it', () => {
		const [packaged, development] = devContainerCliCandidates('/app');
		assert.deepStrictEqual({
			packaged: resolveDevContainerCli('/app', path => path === packaged || path === development),
			development: resolveDevContainerCli('/app', path => path === development),
			missing: resolveDevContainerCli('/app', () => false),
			candidates: [packaged, development].map(path => path.split(/[\\/]/).join('/')),
		}, {
			packaged,
			development,
			missing: undefined,
			candidates: ['/app/node_modules.asar.unpacked/@devcontainers/cli/devcontainer.js', '/app/node_modules/@devcontainers/cli/devcontainer.js'],
		});
	});

	test('reads the result line at the end of `devcontainer up` output, skipping logs', () => {
		const output = [
			'[2026-11-05T00:30:00.000Z] Start: Run: docker build',
			'{"type":"text","level":2,"text":"not a result"}',
			'{"outcome":"success","containerId":"abc123","remoteUser":"root","remoteWorkspaceFolder":"/workspaces/demo"}',
			'',
		].join('\n');
		assert.deepStrictEqual({
			success: parseDevContainerUpOutput(output),
			error: parseDevContainerUpOutput('{"outcome":"error","message":"Docker is not running"}'),
			none: parseDevContainerUpOutput('just logs\n'),
		}, {
			success: { outcome: 'success', containerId: 'abc123', remoteWorkspaceFolder: '/workspaces/demo', message: undefined },
			error: { outcome: 'error', containerId: undefined, remoteWorkspaceFolder: undefined, message: 'Docker is not running' },
			none: undefined,
		});
	});

	test('runs the CLI that this repository bundles', async () => {
		const cli = resolveDevContainerCli(REPO_ROOT);
		assert.ok(cli, 'node_modules/@devcontainers/cli is installed with the repository');
		const chunks: string[] = [];
		const result = await runDevContainerCli(cli, ['--version'], { onOutput: chunk => chunks.push(chunk) });
		assert.deepStrictEqual({ code: result.code, version: /^\d+\.\d+\.\d+$/.test(result.stdout.trim()), streamed: chunks.join('') === result.stdout }, { code: 0, version: true, streamed: true });
	});
});
