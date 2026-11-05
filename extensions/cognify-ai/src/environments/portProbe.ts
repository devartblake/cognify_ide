/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Waiting for a started app to answer (Sprint 5, S5-04). A port that accepts connections isn't
// enough: dev servers often open the port before they can serve a page, so the probe waits for
// an HTTP response (any status). No `vscode` import: unit-tested with `node --test`.

import { request } from 'node:http';
import { connect } from 'node:net';

export type PortState = 'ready' | 'timeout' | 'aborted';

export interface ProbeOptions {
	readonly host?: string;
	readonly timeoutMs: number;
	readonly intervalMs?: number;
	readonly signal?: AbortSignal;
}

/** Whether something already listens on `port` (checked before Run starts the app). */
export function isPortInUse(port: number, host = '127.0.0.1', timeoutMs = 1_000): Promise<boolean> {
	return new Promise(resolve => {
		const socket = connect({ port, host });
		const done = (inUse: boolean) => {
			socket.destroy();
			resolve(inUse);
		};
		socket.setTimeout(timeoutMs, () => done(false));
		socket.once('connect', () => done(true));
		socket.once('error', () => done(false));
	});
}

/** One HTTP request to `/`; true if the server answered at all. */
function answersHttp(port: number, host: string, timeoutMs: number): Promise<boolean> {
	return new Promise(resolve => {
		const req = request({ host, port, path: '/', method: 'GET', timeout: timeoutMs }, response => {
			response.resume();
			resolve(true);
		});
		req.once('timeout', () => req.destroy());
		req.once('error', () => resolve(false));
		req.end();
	});
}

/** Polls until `port` serves HTTP, the deadline passes, or `signal` aborts. */
export async function waitForHttp(port: number, options: ProbeOptions): Promise<PortState> {
	const host = options.host ?? '127.0.0.1';
	const interval = options.intervalMs ?? 500;
	const deadline = Date.now() + options.timeoutMs;
	while (Date.now() < deadline) {
		if (options.signal?.aborted) {
			return 'aborted';
		}
		if (await isPortInUse(port, host, Math.min(1_000, interval * 2)) && await answersHttp(port, host, 2_000)) {
			return 'ready';
		}
		await new Promise(resolve => setTimeout(resolve, interval));
	}
	return options.signal?.aborted ? 'aborted' : 'timeout';
}
