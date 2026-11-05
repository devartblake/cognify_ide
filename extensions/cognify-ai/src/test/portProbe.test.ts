/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { createServer as createHttpServer } from 'node:http';
import { type AddressInfo, createServer as createTcpServer } from 'node:net';
import { describe, test } from 'node:test';
import { isPortInUse, waitForHttp } from '../environments/portProbe.ts';

/** A port that nothing listens on (bound, then released). */
async function freePort(): Promise<number> {
	const server = createTcpServer();
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as AddressInfo;
	await new Promise(resolve => server.close(resolve));
	return port;
}

describe('port probe (S5-04)', () => {
	test('waits for a server that starts late, then reports ready', async () => {
		const port = await freePort();
		const server = createHttpServer((_request, response) => response.end('ok'));
		setTimeout(() => server.listen(port, '127.0.0.1'), 300);
		try {
			const started = Date.now();
			const state = await waitForHttp(port, { timeoutMs: 5_000, intervalMs: 100 });
			assert.deepStrictEqual({ state, waited: Date.now() - started >= 250 }, { state: 'ready', waited: true });
		} finally {
			server.close();
		}
	});

	test('an open port that never answers HTTP is not ready; nothing listening times out; abort stops the wait', async () => {
		// Accepts TCP connections but never writes a response, like a dev server still compiling.
		const silent = createTcpServer(() => { });
		await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve));
		const silentPort = (silent.address() as AddressInfo).port;
		const nothing = await freePort();
		const abort = new AbortController();
		setTimeout(() => abort.abort(), 200);
		try {
			assert.deepStrictEqual({
				silent: await waitForHttp(silentPort, { timeoutMs: 2_500, intervalMs: 100 }),
				nothing: await waitForHttp(nothing, { timeoutMs: 600, intervalMs: 100 }),
				aborted: await waitForHttp(nothing, { timeoutMs: 10_000, intervalMs: 100, signal: abort.signal }),
				inUse: [await isPortInUse(silentPort), await isPortInUse(nothing)],
			}, { silent: 'timeout', nothing: 'timeout', aborted: 'aborted', inUse: [true, false] });
		} finally {
			silent.close();
		}
	});
});
