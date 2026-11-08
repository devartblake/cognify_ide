/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Writes the release checksums and the update record for a folder of packages (S6-12):
//
//   node scripts/cognify/release-manifest.mts <folder> <platform> [release tag]
//
// <platform> is the update service's name: win32-x64-user or linux-x64. The commit comes from
// GITHUB_SHA (or `git rev-parse HEAD`), the product version from package.json. See
// build/cognify/releaseManifest.ts.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeReleaseManifest } from '../../build/cognify/releaseManifest.ts';

const root = resolve(import.meta.dirname, '../..');
const [folder, platform, tag] = process.argv.slice(2);
if (!folder || !platform) {
	console.error('usage: node scripts/cognify/release-manifest.mts <folder> <platform> [release tag]');
	process.exit(2);
}

const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const productVersion = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
const record = await writeReleaseManifest({ folder: resolve(folder), platform, commit, productVersion, tag: tag || undefined });
console.log(`update-${platform}.json:\n${JSON.stringify(record, undefined, 2)}`);
