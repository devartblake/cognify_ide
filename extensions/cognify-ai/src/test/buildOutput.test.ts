/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'node:assert';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, test } from 'node:test';

const SRC = join(import.meta.dirname, '..');

/**
 * Lists the files under a folder, as paths relative to it with forward slashes.
 */
function listFiles(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter(entry => entry.isFile())
		.map(entry => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

describe('build output', () => {
	// The extensions build (`build/gulpfile.extensions.ts`) copies every file in src/ that isn't
	// TypeScript into out/. A package.json there would decide how Node loads out/extension.js:
	// `"type": "module"` made the CommonJS output fail to activate with
	// "exports is not defined in ES module scope" (B1, DEV_BUILD_VERIFICATION_2026-11-05).
	test('src/ has no package.json', () => {
		assert.deepStrictEqual(listFiles(SRC).filter(path => path.split('/').at(-1) === 'package.json'), []);
	});
});
