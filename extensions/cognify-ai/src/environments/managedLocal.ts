/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Managed local execution (Sprint 4, S4-07; decision D3): the project is edited on the host and
// built, tested and run in its Dev Container through the bundled CLI. No `vscode` import:
// unit-tested with `node --test` and fake runners.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { parseDevContainerUpOutput, type DevContainerUpResult } from './devContainerCli.ts';
import { type CognifyProjectFile, PROJECT_FILE } from './newProject.ts';
import type { ProcessRunner } from './runtimes.ts';

/** The template commands a project can run, in the order they are usually needed. */
export const PROJECT_COMMANDS = ['install', 'build', 'test', 'run'] as const;
export type ProjectCommand = typeof PROJECT_COMMANDS[number];

/** Runs the bundled Dev Container CLI with `args`; injectable for tests. */
export type DevContainerRunner = (args: readonly string[], options: { readonly onOutput?: (chunk: string) => void; readonly signal?: AbortSignal }) => Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }>;

function isArgs(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every(arg => typeof arg === 'string');
}

/** Reads `.cognify/project.json`, or `undefined` when it is missing or not one Cognify wrote. */
export function parseProjectFile(text: string): CognifyProjectFile | undefined {
	let value: Partial<CognifyProjectFile>;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!value || value.version !== 1 || typeof value.template !== 'string' || (value.environment !== 'host' && value.environment !== 'container') || !value.commands) {
		return undefined;
	}
	const commands: Partial<Record<ProjectCommand, string[]>> = {};
	for (const name of PROJECT_COMMANDS) {
		const args: unknown = value.commands[name];
		if (args !== undefined && !isArgs(args)) {
			return undefined;
		}
		if (args) {
			commands[name] = args;
		}
	}
	if (!commands.test || !commands.run) {
		return undefined;
	}
	return { version: 1, template: value.template, environment: value.environment, commands: { ...commands, test: commands.test, run: commands.run } };
}

export async function readProjectFile(folder: string): Promise<CognifyProjectFile | undefined> {
	try {
		return parseProjectFile(await fs.readFile(join(folder, PROJECT_FILE), 'utf8'));
	} catch {
		return undefined;
	}
}

/**
 * A failed image download that is worth one retry (S4-03: Docker Hub's first pull sometimes
 * fails). Permanent failures, such as a missing tag or denied access, aren't retried.
 */
export function isTransientPullFailure(output: string): boolean {
	return /TLS handshake timeout|i\/o timeout|connection reset by peer|unexpected EOF|toomanyrequests|net\/http: request canceled/i.test(output);
}

export interface EnvironmentOutput {
	/** Text for the terminal; lines end with `\n`. */
	write(text: string): void;
	/** The image download failed and is being tried once more (the caller words the message). */
	retrying(): void;
}

/** The Dev Container of one project folder. */
export class ManagedEnvironment {
	readonly folder: string;
	private readonly cli: DevContainerRunner;
	private readonly docker: ProcessRunner;

	constructor(folder: string, cli: DevContainerRunner, docker: ProcessRunner) {
		this.folder = folder;
		this.cli = cli;
		this.docker = docker;
	}

	/** `devcontainer up`: creates or reuses the container. Retries a transient pull failure once. */
	async start(output: EnvironmentOutput, signal?: AbortSignal, rebuild = false): Promise<DevContainerUpResult> {
		const args = ['up', '--workspace-folder', this.folder, ...(rebuild ? ['--remove-existing-container'] : [])];
		for (let attempt = 1; ; attempt++) {
			const result = await this.cli(args, { onOutput: chunk => output.write(chunk), signal });
			const up = parseDevContainerUpOutput(result.stdout) ?? { outcome: 'error', message: result.stderr.trim().split('\n').at(-1) };
			if (up.outcome === 'success' || attempt > 1 || signal?.aborted || !isTransientPullFailure(`${result.stdout}\n${result.stderr}`)) {
				return up;
			}
			output.retrying();
		}
	}

	/** Runs a template command in the container, starting it first if needed. Returns the exit code. */
	async exec(command: readonly string[], output: EnvironmentOutput, signal?: AbortSignal): Promise<number | null> {
		const up = await this.start(output, signal);
		if (up.outcome !== 'success') {
			return 1;
		}
		const result = await this.cli(['exec', '--workspace-folder', this.folder, ...command], { onOutput: chunk => output.write(chunk), signal });
		return result.code;
	}

	/** Stops the project's containers (found by the CLI's folder label). */
	async stop(): Promise<number> {
		const list = await this.docker('docker', ['ps', '--quiet', '--filter', `label=devcontainer.local_folder=${this.folder}`], 10_000);
		const ids = list.code === 0 ? list.stdout.split(/\s+/).filter(Boolean) : [];
		if (ids.length) {
			const stopped = await this.docker('docker', ['stop', ...ids], 30_000);
			if (stopped.code !== 0) {
				throw new Error(stopped.stderr.trim() || stopped.error || 'docker stop failed');
			}
		}
		return ids.length;
	}
}
