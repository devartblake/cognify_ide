/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import 'mocha';
import * as vscode from 'vscode';
import { openPreview } from '../preview';

/** Resolves when `condition` holds, or rejects after `timeoutMs`. */
async function until(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
	const started = Date.now();
	while (!condition()) {
		if (Date.now() - started > timeoutMs) {
			throw new Error(`Timed out after ${timeoutMs} ms waiting for ${what}`);
		}
		await new Promise(resolve => setTimeout(resolve, 100));
	}
}

suite('Preview in the integrated browser (S5-03)', () => {
	let server: Server;
	const requests: string[] = [];

	suiteSetup(async () => {
		server = createServer((request, response) => {
			requests.push(request.url ?? '');
			response.writeHead(200, { 'content-type': 'text/html' });
			response.end('<!doctype html><title>Cognify preview test</title><h1>Hello</h1>');
		});
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	});

	suiteTeardown(async () => {
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await new Promise(resolve => server.close(resolve));
	});

	test('a local app opens beside the editor, and a second preview of the same origin reuses the tab', async () => {
		const origin = `http://localhost:${(server.address() as AddressInfo).port}`;
		const browserTabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => !(tab.input instanceof vscode.TabInputText));

		const first = await openPreview(vscode.Uri.parse(`${origin}/`));
		await until(() => requests.includes('/'), 15_000, 'the page to be requested');
		const tabsAfterFirst = browserTabs().length;

		const second = await openPreview(vscode.Uri.parse(`${origin}/again`));
		await until(() => requests.includes('/again'), 15_000, 'the second page to be requested');

		assert.deepStrictEqual({ first, second, tabsAfterFirst, tabsAfterSecond: browserTabs().length }, {
			first: 'integratedBrowser',
			second: 'integratedBrowser',
			tabsAfterFirst: 1,
			tabsAfterSecond: 1,
		});
	});
});
