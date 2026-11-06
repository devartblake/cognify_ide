/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'node:assert';
import path from 'node:path';
import { describe, test } from 'node:test';
import { copilotVsixNodeModules, isShippedByVscodeignore, readVscodeignore } from '../copilotPackage.ts';

const COPILOT = path.join(import.meta.dirname, '..', '..', '..', 'extensions', 'copilot');

describe('Copilot node_modules as the VSIX ships them (S6-01)', () => {
	test('.vscodeignore rules: ignore everything, then re-include, last match wins', () => {
		const rules = readVscodeignore(COPILOT);
		assert.deepStrictEqual(Object.fromEntries([
			'node_modules/@github/copilot/package.json',
			'node_modules/@github/copilot/sdk/index.js',
			'node_modules/@github/copilot/sdk/prebuilds/linux-x64/runtime.node',
			'node_modules/@github/copilot/index.js',
			'node_modules/@github/copilot/prebuilds/linux-x64/x.node',
			'node_modules/@vscode/copilot-typescript-server-plugin/dist/main.js',
			'node_modules/applicationinsights/package.json',
			'node_modules/@opentelemetry/core/build/src/index.js',
		].map(file => [file, isShippedByVscodeignore(rules, file)])), {
			'node_modules/@github/copilot/package.json': true,
			'node_modules/@github/copilot/sdk/index.js': true,
			'node_modules/@github/copilot/sdk/prebuilds/linux-x64/runtime.node': true,
			'node_modules/@github/copilot/index.js': false,
			'node_modules/@github/copilot/prebuilds/linux-x64/x.node': false,
			'node_modules/@vscode/copilot-typescript-server-plugin/dist/main.js': true,
			'node_modules/applicationinsights/package.json': false,
			'node_modules/@opentelemetry/core/build/src/index.js': false,
		});
	});

	test('only @github/copilot and the TypeScript server plugin ship, with the SDK the shim step needs', { skip: !copilotVsixNodeModules(COPILOT).length && 'extensions/copilot has no node_modules' }, () => {
		const files = copilotVsixNodeModules(COPILOT);
		// The plugin's dist/*.js only exists once Copilot's esbuild step has run, so it may be absent here.
		const allowed = ['@github/copilot', '@vscode/copilot-typescript-server-plugin'];
		const others = [...new Set(files.map(file => file.split('/').slice(1, 3).join('/')))].filter(name => !allowed.includes(name));
		assert.deepStrictEqual({ others, sdk: files.includes('node_modules/@github/copilot/sdk/index.js') }, { others: [], sdk: true });
	});
});
