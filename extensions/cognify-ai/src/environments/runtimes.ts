/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Host runtime detection (Sprint 4, S4-06). Runs only fixed `--version`-style commands of known
// tools, with a timeout, never a shell with user input and never workspace code. The process
// runner is injectable for tests. No `vscode` import: unit-tested with `node --test`.

import { execFile } from 'node:child_process';

export type RuntimeId = 'git' | 'node' | 'npm' | 'pnpm' | 'python' | 'pip' | 'uv' | 'dotnet' | 'flutter' | 'dart' | 'docker';

export const RUNTIME_IDS: readonly RuntimeId[] = ['git', 'node', 'npm', 'pnpm', 'python', 'pip', 'uv', 'dotnet', 'flutter', 'dart', 'docker'];

export type RuntimeState =
	| 'found'
	| 'missing'
	/** Docker only: the client is installed but its daemon isn't reachable. */
	| 'notRunning'
	| 'timeout'
	| 'error';

export interface RuntimeStatus {
	readonly id: RuntimeId;
	readonly state: RuntimeState;
	readonly version?: string;
	/** The command that answered. */
	readonly command?: string;
	readonly detail?: string;
}

export interface ProcessResult {
	readonly code: number | null;
	readonly stdout: string;
	readonly stderr: string;
	/** `ENOENT` when the command doesn't exist, `TIMEOUT` when it ran too long. */
	readonly error?: string;
}

export type ProcessRunner = (command: string, args: readonly string[], timeoutMs: number) => Promise<ProcessResult>;

interface Probe {
	/** Tried in order: the first command that exists answers. */
	readonly commands: readonly (readonly [string, ...string[]])[];
	readonly parse: (result: ProcessResult) => string | undefined;
}

const SEMVER = /(?<version>\d+\.\d+(?:\.\d+)?)/;

function firstVersion(text: string): string | undefined {
	return SEMVER.exec(text)?.groups?.version;
}

const PROBES: Record<RuntimeId, Probe> = {
	git: { commands: [['git', '--version']], parse: r => firstVersion(r.stdout) },
	node: { commands: [['node', '--version']], parse: r => firstVersion(r.stdout) },
	npm: { commands: [['npm', '--version']], parse: r => firstVersion(r.stdout) },
	pnpm: { commands: [['pnpm', '--version']], parse: r => firstVersion(r.stdout) },
	python: { commands: [['python3', '--version'], ['python', '--version'], ['py', '-3', '--version']], parse: r => firstVersion(r.stdout || r.stderr) },
	pip: { commands: [['python3', '-m', 'pip', '--version'], ['python', '-m', 'pip', '--version'], ['py', '-3', '-m', 'pip', '--version']], parse: r => firstVersion(r.stdout) },
	uv: { commands: [['uv', '--version']], parse: r => firstVersion(r.stdout) },
	// The highest installed SDK, from lines like "10.0.100 [/usr/share/dotnet/sdk]".
	dotnet: {
		commands: [['dotnet', '--list-sdks']], parse: r => r.stdout.split('\n').map(line => firstVersion(line)).filter((v): v is string => !!v).sort(compareVersions).pop()
	},
	flutter: { commands: [['flutter', '--version', '--machine']], parse: r => parseJsonField(r.stdout, 'frameworkVersion') ?? firstVersion(r.stdout) },
	dart: { commands: [['dart', '--version']], parse: r => firstVersion(r.stdout || r.stderr) },
	docker: { commands: [['docker', 'version', '--format', '{{.Server.Version}}']], parse: r => firstVersion(r.stdout) },
};

function parseJsonField(text: string, field: string): string | undefined {
	try {
		const value = (JSON.parse(text.slice(text.indexOf('{'))) as Record<string, unknown>)[field];
		return typeof value === 'string' ? value : undefined;
	} catch {
		return undefined;
	}
}

/** Numeric comparison of dot-separated versions: `10.0` > `9.1`, `3.10` > `3.9`. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map(part => parseInt(part, 10) || 0);
	const pb = b.split('.').map(part => parseInt(part, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff) {
			return diff;
		}
	}
	return 0;
}

async function probe(id: RuntimeId, run: ProcessRunner, timeoutMs: number): Promise<RuntimeStatus> {
	let last: ProcessResult | undefined;
	for (const [command, ...args] of PROBES[id].commands) {
		const result = await run(command, args, timeoutMs);
		last = result;
		if (result.error === 'ENOENT') {
			continue;
		}
		const display = [command, ...args].join(' ');
		if (result.error === 'TIMEOUT') {
			return { id, state: 'timeout', command: display };
		}
		const version = result.code === 0 ? PROBES[id].parse(result) : undefined;
		if (version) {
			return { id, state: 'found', version, command: display };
		}
		// The Docker client answers, but its daemon doesn't.
		if (id === 'docker' && /daemon|connect|docker\.sock|pipe/i.test(result.stderr)) {
			return { id, state: 'notRunning', command: display, detail: result.stderr.trim().split('\n')[0] };
		}
		// `python3 -m pip` fails when pip isn't installed for that Python: try the next command.
		if (id !== 'pip') {
			return { id, state: 'error', command: display, detail: (result.stderr || result.stdout).trim().split('\n')[0] };
		}
	}
	return { id, state: 'missing', detail: last?.error && last.error !== 'ENOENT' ? last.error : undefined };
}

/** Probes the runtimes in parallel. */
export async function detectRuntimes(ids: readonly RuntimeId[], run: ProcessRunner, timeoutMs = 3_000): Promise<Map<RuntimeId, RuntimeStatus>> {
	const statuses = await Promise.all(ids.map(id => probe(id, run, timeoutMs)));
	return new Map(statuses.map(status => [status.id, status]));
}

export interface RequirementCheck {
	readonly met: boolean;
	readonly missing: readonly { readonly runtime: RuntimeId; readonly minVersion?: string; readonly status: RuntimeStatus }[];
	readonly outdated: readonly { readonly runtime: RuntimeId; readonly minVersion: string; readonly version: string }[];
}

/** Whether the host can build the project itself; optional requirements never block. */
export function checkRequirements(requirements: readonly { readonly runtime: RuntimeId; readonly minVersion?: string; readonly optional?: boolean }[], statuses: ReadonlyMap<RuntimeId, RuntimeStatus>): RequirementCheck {
	const missing: RequirementCheck['missing'][number][] = [];
	const outdated: RequirementCheck['outdated'][number][] = [];
	for (const requirement of requirements.filter(r => !r.optional)) {
		const status = statuses.get(requirement.runtime) ?? { id: requirement.runtime, state: 'missing' as const };
		if (status.state !== 'found' || !status.version) {
			missing.push({ runtime: requirement.runtime, minVersion: requirement.minVersion, status });
		} else if (requirement.minVersion && compareVersions(status.version, requirement.minVersion) < 0) {
			outdated.push({ runtime: requirement.runtime, minVersion: requirement.minVersion, version: status.version });
		}
	}
	return { met: !missing.length && !outdated.length, missing, outdated };
}

/** Windows runs these through `.cmd`/`.bat` shims, which need `cmd.exe`; arguments are fixed. */
const WINDOWS_SHIMS = new Set(['npm', 'pnpm', 'flutter']);

/** The real runner: `execFile` with a timeout, never a shell with user input. */
export function nodeProcessRunner(platform: NodeJS.Platform = process.platform): ProcessRunner {
	return (command, args, timeoutMs) => new Promise(resolve => {
		const [file, fileArgs] = platform === 'win32' && WINDOWS_SHIMS.has(command) ? ['cmd.exe', ['/d', '/s', '/c', command, ...args]] : [command, args];
		execFile(file, fileArgs, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }, (error, stdout, stderr) => {
			const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
			resolve({
				code: err ? (typeof err.code === 'number' ? err.code : null) : 0,
				stdout: String(stdout ?? ''),
				stderr: String(stderr ?? ''),
				error: !err ? undefined : err.killed ? 'TIMEOUT' : err.code === 'ENOENT' || (platform === 'win32' && /is not recognized/.test(String(stderr))) ? 'ENOENT' : typeof err.code === 'string' ? err.code : undefined,
			});
		});
	});
}
