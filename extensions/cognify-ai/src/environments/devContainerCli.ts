/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The Dev Container CLI that the product bundles (`@devcontainers/cli`, MIT), run from the
// extension host (Sprint 4, S4-03). Upstream's build keeps the CLI outside the node_modules
// ASAR so it can be spawned as an external Node process; Cognify uses the same copy instead of
// Microsoft's proprietary Dev Containers extension. No `vscode` import: unit-tested with `node --test`.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Where the bundled CLI lives under the application root: packaged builds first, then development. */
export function devContainerCliCandidates(appRoot: string): string[] {
	return [
		join(appRoot, 'node_modules.asar.unpacked', '@devcontainers', 'cli', 'devcontainer.js'),
		join(appRoot, 'node_modules', '@devcontainers', 'cli', 'devcontainer.js'),
	];
}

/** The bundled CLI's entry point, or `undefined` if this build doesn't include it. */
export function resolveDevContainerCli(appRoot: string, exists: (path: string) => boolean = existsSync): string | undefined {
	return devContainerCliCandidates(appRoot).find(exists);
}

/** The JSON line `devcontainer up` prints last. */
export interface DevContainerUpResult {
	readonly outcome: 'success' | 'error';
	readonly containerId?: string;
	readonly remoteWorkspaceFolder?: string;
	readonly message?: string;
}

/** Finds the result line in `devcontainer up` output (logs come first, the result last). */
export function parseDevContainerUpOutput(stdout: string): DevContainerUpResult | undefined {
	for (const line of stdout.trim().split('\n').reverse()) {
		try {
			const value = JSON.parse(line) as Partial<DevContainerUpResult>;
			if (value && (value.outcome === 'success' || value.outcome === 'error')) {
				return {
					outcome: value.outcome,
					containerId: typeof value.containerId === 'string' ? value.containerId : undefined,
					remoteWorkspaceFolder: typeof value.remoteWorkspaceFolder === 'string' ? value.remoteWorkspaceFolder : undefined,
					message: typeof value.message === 'string' ? value.message : undefined,
				};
			}
		} catch {
			// A log line: keep scanning upwards.
		}
	}
	return undefined;
}

export interface CliRunResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly durationMs: number;
}

export interface CliRunOptions {
	readonly cwd?: string;
	/** Streams output as it arrives, for a terminal or progress UI. */
	readonly onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
	readonly signal?: AbortSignal;
	/**
	 * The Node runtime. In the extension host this is Electron, run as Node through
	 * `ELECTRON_RUN_AS_NODE`; in unit tests it is Node itself.
	 */
	readonly nodePath?: string;
	readonly env?: NodeJS.ProcessEnv;
}

/** Runs the CLI with `args` and collects its output. Never uses a shell. */
export function runDevContainerCli(cliPath: string, args: readonly string[], options: CliRunOptions = {}): Promise<CliRunResult> {
	const started = Date.now();
	return new Promise((resolve, reject) => {
		const child = spawn(options.nodePath ?? process.execPath, [cliPath, ...args], {
			cwd: options.cwd,
			env: { ...(options.env ?? process.env), ELECTRON_RUN_AS_NODE: '1' },
			signal: options.signal,
			windowsHide: true,
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
			stdout += chunk;
			options.onOutput?.(chunk, 'stdout');
		});
		child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
			stderr += chunk;
			options.onOutput?.(chunk, 'stderr');
		});
		child.on('error', reject);
		child.on('close', code => resolve({ code, stdout, stderr, durationMs: Date.now() - started }));
	});
}
