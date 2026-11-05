/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { hostOs, remediationFor } from '../environments/remediation.ts';
import { RUNTIME_IDS } from '../environments/runtimes.ts';

describe('guided remediation (S4-08)', () => {
	test('guidance by OS and tool: a command where one fits most machines, otherwise the official link', () => {
		const table = Object.fromEntries(RUNTIME_IDS.map(id => [id, (['windows', 'macos', 'linux'] as const).map(os => remediationFor(id, 'missing', os, false)?.command?.text ?? '(link)')]));
		assert.deepStrictEqual(table, {
			git: ['winget install --id Git.Git --exact', 'brew install git', 'sudo apt install git'],
			node: ['winget install --id OpenJS.NodeJS.LTS --exact', 'brew install node', '(link)'],
			npm: ['winget install --id OpenJS.NodeJS.LTS --exact', 'brew install node', '(link)'],
			pnpm: ['npm install --global pnpm', 'brew install pnpm', 'npm install --global pnpm'],
			python: ['winget install --id Python.Python.3.13 --exact', 'brew install python@3.13', 'sudo apt install python3 python3-pip python3-venv'],
			pip: ['py -m ensurepip --upgrade', 'python3 -m ensurepip --upgrade', 'sudo apt install python3-pip'],
			uv: ['winget install --id astral-sh.uv --exact', 'brew install uv', '(link)'],
			dotnet: ['winget install --id Microsoft.DotNet.SDK.10 --exact', 'brew install --cask dotnet-sdk', '(link)'],
			flutter: ['(link)', 'brew install --cask flutter', '(link)'],
			dart: ['(link)', '(link)', '(link)'],
			docker: ['winget install --id Docker.DockerDesktop --exact', 'brew install --cask docker-desktop', '(link)'],
		});
		assert.ok(RUNTIME_IDS.every(id => remediationFor(id, 'missing', 'linux', false)?.link.startsWith('https://')), 'every tool has an official https link');
	});

	test('states: found needs nothing; outdated installs; stopped Docker is started, never replaced by a container', () => {
		assert.deepStrictEqual({
			found: remediationFor('node', 'found', 'linux', true),
			outdated: remediationFor('node', 'outdated', 'macos', true),
			dockerStopped: [remediationFor('docker', 'notRunning', 'linux', true), remediationFor('docker', 'notRunning', 'windows', true)],
			dockerMissing: remediationFor('docker', 'missing', 'windows', true)?.devContainerInstead,
			noContainer: remediationFor('dotnet', 'missing', 'windows', false)?.devContainerInstead,
		}, {
			found: undefined,
			outdated: { runtime: 'node', action: 'install', command: { text: 'brew install node', via: 'homebrew' }, link: 'https://nodejs.org/en/download', devContainerInstead: true },
			dockerStopped: [
				{ runtime: 'docker', action: 'start', command: { text: 'sudo systemctl start docker', via: 'systemctl' }, link: 'https://docs.docker.com/get-started/get-docker/', devContainerInstead: false },
				{ runtime: 'docker', action: 'start', command: undefined, link: 'https://docs.docker.com/get-started/get-docker/', devContainerInstead: false },
			],
			dockerMissing: false,
			noContainer: false,
		});
	});

	test('nothing is piped into a shell or chained: each suggestion is one plain command for the user to run', () => {
		const commands = RUNTIME_IDS.flatMap(id => (['windows', 'macos', 'linux'] as const).map(os => remediationFor(id, 'missing', os, false)?.command?.text)).filter(text => text !== undefined);
		assert.deepStrictEqual(commands.filter(text => /[|;&`$<>]/.test(text)), []);
		assert.deepStrictEqual(['win32', 'darwin', 'linux', 'freebsd'].map(p => hostOs(p as NodeJS.Platform)), ['windows', 'macos', 'linux', 'linux']);
	});
});
