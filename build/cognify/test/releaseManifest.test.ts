/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { updatePackage, writeReleaseManifest } from '../releaseManifest.ts';

describe('release checksums and update records (S6-12)', () => {
	test('the update package is the user setup on Windows and the archive on Linux', () => {
		assert.deepStrictEqual({
			win32: updatePackage(['Cognify-win32-x64-1.146.0-abc1234.zip', 'CognifyUserSetup-x64-1.146.0-abc1234.exe'], 'win32-x64-user'),
			linux: updatePackage(['cognify-linux-x64-1.146.0-abc1234.tar.gz'], 'linux-x64'),
			none: updatePackage(['Cognify-win32-x64-1.146.0-abc1234.zip'], 'win32-x64-user'),
		}, {
			win32: 'CognifyUserSetup-x64-1.146.0-abc1234.exe',
			linux: 'cognify-linux-x64-1.146.0-abc1234.tar.gz',
			none: undefined,
		});
	});

	test('writes a .sha256 per package, SHA256SUMS and the update record, and ignores its own outputs on a rerun', async () => {
		const folder = await mkdtemp(path.join(tmpdir(), 'cognify-release-'));
		try {
			await writeFile(path.join(folder, 'CognifyUserSetup-x64-1.146.0-abc1234.exe'), 'setup');
			await writeFile(path.join(folder, 'Cognify-win32-x64-1.146.0-abc1234.zip'), 'zip');
			const options = { folder, platform: 'win32-x64-user', commit: 'abc1234def', productVersion: '1.146.0', tag: 'cognify-v0.1.0', timestamp: 1 };
			await writeReleaseManifest(options);
			const record = await writeReleaseManifest(options);
			const sums = await readFile(path.join(folder, 'SHA256SUMS-win32-x64-user.txt'), 'utf8');
			const setupSum = await readFile(path.join(folder, 'CognifyUserSetup-x64-1.146.0-abc1234.exe.sha256'), 'utf8');
			assert.deepStrictEqual({
				files: (await readdir(folder)).sort(),
				record,
				stored: JSON.parse(await readFile(path.join(folder, 'update-win32-x64-user.json'), 'utf8')),
				sumLines: sums.split('\n').filter(Boolean).map(line => line.split('  ')[1]),
				setupSum: setupSum === `${record.sha256hash}  CognifyUserSetup-x64-1.146.0-abc1234.exe\n`,
				hashIsTheSetups: record.sha256hash === createHash('sha256').update('setup').digest('hex'),
			}, {
				files: [
					'Cognify-win32-x64-1.146.0-abc1234.zip',
					'Cognify-win32-x64-1.146.0-abc1234.zip.sha256',
					'CognifyUserSetup-x64-1.146.0-abc1234.exe',
					'CognifyUserSetup-x64-1.146.0-abc1234.exe.sha256',
					'SHA256SUMS-win32-x64-user.txt',
					'update-win32-x64-user.json',
				],
				record: {
					version: 'abc1234def',
					productVersion: '1.146.0',
					timestamp: 1,
					url: 'https://github.com/devartblake/cognify_ide/releases/download/cognify-v0.1.0/CognifyUserSetup-x64-1.146.0-abc1234.exe',
					sha256hash: createHash('sha256').update('setup').digest('hex'),
					name: 'CognifyUserSetup-x64-1.146.0-abc1234.exe',
				},
				stored: { ...record },
				sumLines: ['Cognify-win32-x64-1.146.0-abc1234.zip', 'CognifyUserSetup-x64-1.146.0-abc1234.exe'],
				setupSum: true,
				hashIsTheSetups: true,
			});
		} finally {
			await rm(folder, { recursive: true, force: true });
		}
	});
});
