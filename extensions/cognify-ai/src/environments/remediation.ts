/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Guided remediation (Sprint 4, S4-08; decision D5: guide, never install). For a missing,
// outdated or stopped tool: a command the user can copy or have typed into a terminal (never
// run by Cognify), the official install page, and the Dev Container alternative.
// No `vscode` import: unit-tested with `node --test`.

import type { RuntimeId, RuntimeState } from './runtimes.ts';

export type HostOs = 'windows' | 'macos' | 'linux';

/** The package manager a suggested command uses; the caller names it to the user. */
export type PackageManager = 'winget' | 'homebrew' | 'apt' | 'npm' | 'python' | 'systemctl';

export interface SuggestedCommand {
	readonly text: string;
	readonly via: PackageManager;
}

export interface Remediation {
	readonly runtime: RuntimeId;
	/** `start` when the tool is installed but not running (Docker); `install` otherwise. */
	readonly action: 'install' | 'start';
	/** Absent when there's no single command that fits most machines: follow the link. */
	readonly command?: SuggestedCommand;
	/** The tool's official install page. */
	readonly link: string;
	/** A Dev Container can provide the tool instead (Docker is running and the bundled CLI is there). */
	readonly devContainerInstead: boolean;
}

const LINKS: Record<RuntimeId, string> = {
	git: 'https://git-scm.com/downloads',
	node: 'https://nodejs.org/en/download',
	npm: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm',
	pnpm: 'https://pnpm.io/installation',
	python: 'https://www.python.org/downloads/',
	pip: 'https://pip.pypa.io/en/stable/installation/',
	uv: 'https://docs.astral.sh/uv/getting-started/installation/',
	dotnet: 'https://dotnet.microsoft.com/download',
	flutter: 'https://docs.flutter.dev/get-started/install',
	dart: 'https://dart.dev/get-dart',
	docker: 'https://docs.docker.com/get-started/get-docker/',
};

const winget = (id: string): SuggestedCommand => ({ text: `winget install --id ${id} --exact`, via: 'winget' });
const brew = (name: string, cask = false): SuggestedCommand => ({ text: `brew install ${cask ? '--cask ' : ''}${name}`, via: 'homebrew' });
const apt = (packages: string): SuggestedCommand => ({ text: `sudo apt install ${packages}`, via: 'apt' });

/**
 * Install commands by tool and OS. Linux commands are for Debian and Ubuntu; where distributions
 * differ too much (or the vendor's own instructions pipe a script into a shell), only the link is given.
 */
const INSTALL: Record<RuntimeId, Partial<Record<HostOs, SuggestedCommand>>> = {
	git: { windows: winget('Git.Git'), macos: brew('git'), linux: apt('git') },
	node: { windows: winget('OpenJS.NodeJS.LTS'), macos: brew('node') },
	npm: { windows: winget('OpenJS.NodeJS.LTS'), macos: brew('node') },
	pnpm: { windows: { text: 'npm install --global pnpm', via: 'npm' }, macos: brew('pnpm'), linux: { text: 'npm install --global pnpm', via: 'npm' } },
	python: { windows: winget('Python.Python.3.13'), macos: brew('python@3.13'), linux: apt('python3 python3-pip python3-venv') },
	pip: { windows: { text: 'py -m ensurepip --upgrade', via: 'python' }, macos: { text: 'python3 -m ensurepip --upgrade', via: 'python' }, linux: apt('python3-pip') },
	uv: { windows: winget('astral-sh.uv'), macos: brew('uv') },
	dotnet: { windows: winget('Microsoft.DotNet.SDK.10'), macos: brew('dotnet-sdk', true) },
	flutter: { macos: brew('flutter', true) },
	dart: {},
	docker: { windows: winget('Docker.DockerDesktop'), macos: brew('docker-desktop', true) },
};

/** What to suggest for a tool in `state` on `os`; `undefined` when the tool is fine. */
export function remediationFor(runtime: RuntimeId, state: RuntimeState | 'outdated', os: HostOs, devContainerAvailable: boolean): Remediation | undefined {
	if (state === 'found') {
		return undefined;
	}
	// Docker can't be replaced by a container; everything else can, when one is available.
	const devContainerInstead = runtime !== 'docker' && devContainerAvailable;
	if (runtime === 'docker' && state === 'notRunning') {
		// Docker Desktop is started from its app; on Linux the daemon is a system service.
		return { runtime, action: 'start', command: os === 'linux' ? { text: 'sudo systemctl start docker', via: 'systemctl' } : undefined, link: LINKS.docker, devContainerInstead: false };
	}
	return { runtime, action: 'install', command: INSTALL[runtime][os], link: LINKS[runtime], devContainerInstead };
}

export function hostOs(platform: NodeJS.Platform): HostOs {
	return platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
}
