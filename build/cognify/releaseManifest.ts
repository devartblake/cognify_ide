/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Release checksums and update records (Sprint 6, S6-12; DevDocs/Architecture/COGNIFY_UPDATES_AND_SIGNING_DESIGN.md).
// For each package the `Cognify (package)` workflow builds, it writes:
//   - `<file>.sha256`: the SHA-256 in `sha256sum` format, so a user can verify a download;
//   - `SHA256SUMS-<platform>.txt`: every package of that platform in one file;
//   - `update-<platform>.json`: the record an update server returns for the newest release, in the
//     shape the product's update service reads (`IUpdate` in src/vs/platform/update/common/update.ts).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where releases are published; the download URLs follow GitHub's release asset pattern. */
export const RELEASES_URL = 'https://github.com/devartblake/cognify_ide/releases';

/** The update record for one platform: the fields of `IUpdate`, plus the file it describes. */
export interface UpdateRecord {
	/** The build's commit, which the update service compares with its own. */
	readonly version: string;
	/** The product version, for example 1.146.0. */
	readonly productVersion: string;
	/** When the package was built, in milliseconds since the epoch. */
	readonly timestamp: number;
	/** The download URL of the release asset, when the release tag is known. */
	readonly url?: string;
	/** The file's SHA-256, which the Windows updater checks before it installs. */
	readonly sha256hash: string;
	/** The package file name. */
	readonly name: string;
}

/** The SHA-256 of a file, in lowercase hex. */
export async function sha256File(file: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(file)) {
		hash.update(chunk);
	}
	return hash.digest('hex');
}

/** One line in `sha256sum` format: the hash, two spaces, the file name. */
export function checksumLine(hash: string, name: string): string {
	return `${hash}  ${name}\n`;
}

/** The release asset URL for a file, or undefined without a tag. */
export function releaseAssetUrl(tag: string | undefined, name: string): string | undefined {
	return tag ? `${RELEASES_URL}/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}` : undefined;
}

/**
 * The package the updater installs: the Windows user setup, or the Linux archive. Zips and other
 * files are checksummed but not offered as updates.
 */
export function updatePackage(names: readonly string[], platform: string): string | undefined {
	const pattern = platform.startsWith('win32') ? /^CognifyUserSetup-.*\.exe$/ : /\.tar\.gz$/;
	return names.find(name => pattern.test(name));
}

export interface ManifestOptions {
	/** The folder holding the packages; the outputs are written next to them. */
	readonly folder: string;
	/** The update service's platform name, for example `win32-x64-user` or `linux-x64`. */
	readonly platform: string;
	readonly commit: string;
	readonly productVersion: string;
	/** The release tag the packages will be published under, if known. */
	readonly tag?: string;
	readonly timestamp?: number;
}

/** Writes the checksum files and the update record for the packages in a folder, and returns the record. */
export async function writeReleaseManifest(options: ManifestOptions): Promise<UpdateRecord> {
	const names = (await readdir(options.folder, { withFileTypes: true }))
		.filter(entry => entry.isFile() && !entry.name.endsWith('.sha256') && !/^(SHA256SUMS|update)-/.test(entry.name))
		.map(entry => entry.name)
		.sort();
	const hashes = new Map<string, string>();
	for (const name of names) {
		const hash = await sha256File(path.join(options.folder, name));
		hashes.set(name, hash);
		await writeFile(path.join(options.folder, `${name}.sha256`), checksumLine(hash, name));
	}
	await writeFile(path.join(options.folder, `SHA256SUMS-${options.platform}.txt`), names.map(name => checksumLine(hashes.get(name)!, name)).join(''));

	const name = updatePackage(names, options.platform);
	if (!name) {
		throw new Error(`no package to offer as an update for ${options.platform} in ${options.folder}`);
	}
	const url = releaseAssetUrl(options.tag, name);
	const record: UpdateRecord = {
		version: options.commit,
		productVersion: options.productVersion,
		timestamp: options.timestamp ?? Date.now(),
		...(url ? { url } : {}),
		sha256hash: hashes.get(name)!,
		name,
	};
	await writeFile(path.join(options.folder, `update-${options.platform}.json`), `${JSON.stringify(record, undefined, '\t')}\n`);
	return record;
}
