/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: node --test build/cognify/test/*.test.ts
import assert from 'assert';
import * as fs from 'fs';
import { suite, test } from 'node:test';
import * as path from 'path';
import * as vm from 'vm';
import { createNLSCollector, finalizeNLS } from '../../next/nls-plugin.ts';
import { loadRebrandTable, rebrandMessages, rebrandPackageNls, type RebrandTable } from '../nlsRebrand.ts';

const table: RebrandTable = {
	'vs/a#restart': { from: 'Please restart VS Code to apply {0}.', to: 'Please restart Cognify to apply {0}.' },
	'vs/gone#key': { from: 'Only in another build of VS Code', to: 'Only in another build of Cognify' },
	'extensions/css/package.nls.json#trace': { from: 'Traces VS Code and the server.', to: 'Traces Cognify and the server.' },
	'extensions/css/package.nls.json#withComment': { from: 'VS Code completion', to: 'Cognify completion' },
};

suite('Cognify NLS rebrand (R-02)', () => {
	test('overrides messages by module and key, and leaves the rest alone', () => {
		const keys: [string, string[]][] = [['vs/a', ['other', 'restart']], ['vs/b', ['restart']]];
		assert.deepStrictEqual(
			rebrandMessages(table, keys, ['Other text', 'Please restart VS Code to apply {0}.', 'Please restart VS Code to apply {0}.']),
			['Other text', 'Please restart Cognify to apply {0}.', 'Please restart VS Code to apply {0}.'],
		);
	});

	test('fails, naming the key, when upstream changed a message or an override changes its placeholders', () => {
		assert.throws(() => rebrandMessages(table, [['vs/a', ['restart']]], ['Please restart VS Code now.']), /vs\/a#restart: the English message changed upstream; it is now "Please restart VS Code now\."/);
		assert.throws(() => rebrandMessages({ 'vs/a#restart': { from: 'Restart VS Code ({0})', to: 'Restart Cognify' } }, [], []), /vs\/a#restart: placeholders differ/);
	});

	test('overrides package.nls.json messages, keeping translator comments', () => {
		const original = { trace: 'Traces VS Code and the server.', withComment: { message: 'VS Code completion', comment: ['{Locked}'] }, other: 'Unrelated' };
		assert.deepStrictEqual(rebrandPackageNls(table, 'extensions/css/package.nls.json', original), {
			trace: 'Traces Cognify and the server.',
			withComment: { message: 'Cognify completion', comment: ['{Locked}'] },
			other: 'Unrelated',
		});
		assert.strictEqual(rebrandPackageNls(table, 'extensions/html/package.nls.json', original), original);
		assert.throws(() => rebrandPackageNls(table, 'extensions/css/package.nls.json', { trace: 'Traces VS Code and the server.' }), /extensions\/css\/package\.nls\.json#withComment: the key no longer exists upstream/);
	});

	test('the packaged bundle carries the override; metadata keeps upstream\'s text for translators', async t => {
		// A real entry from build/cognify/nls-rebrand.json, through the esbuild pipeline's finalizeNLS.
		const [id, entry] = Object.entries(loadRebrandTable()).find(([key]) => key.startsWith('vs/'))!;
		const [moduleId, key] = id.split('#');
		const buildDir = path.resolve(import.meta.dirname, '..', '..', '..', '.build');
		await fs.promises.mkdir(buildDir, { recursive: true });
		const directory = await fs.promises.mkdtemp(path.join(buildDir, 'nls-rebrand-test-'));
		t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

		const collector = createNLSCollector();
		collector.add({ moduleId, key, message: entry.from, placeholder: 'm0' });
		// finalizeNLS sorts by key within a module, so this one comes last.
		collector.add({ moduleId, key: 'zzz.unrelated', message: 'Unrelated', placeholder: 'm1' });
		await finalizeNLS(collector, directory);

		const read = (file: string) => fs.readFileSync(path.join(directory, file), 'utf8');
		const context = { _VSCODE_NLS_MESSAGES: [] as string[] };
		vm.runInNewContext(read('nls.messages.js'), context);
		const metadata = JSON.parse(read('nls.metadata.json')) as { messages: Record<string, string[]> };
		assert.deepStrictEqual({
			json: JSON.parse(read('nls.messages.json')),
			javascript: Array.from(context._VSCODE_NLS_MESSAGES),
			metadata: metadata.messages[moduleId],
		}, {
			json: [entry.to, 'Unrelated'],
			javascript: [entry.to, 'Unrelated'],
			metadata: [entry.from, 'Unrelated'],
		});
	});
});
