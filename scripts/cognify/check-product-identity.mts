/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Cognify identity smoke check (issue #6).
//
// Verifies that product.json, the web/dev product fallback, the Windows
// visual-elements manifest, and the web app manifest carry the Cognify identity recorded in
// DevDocs/Governance/product-identity.json, and that no identifier collides
// with an upstream Code - OSS value. Run after every upstream sync:
// node scripts/cognify/check-product-identity.mts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const manifest = JSON.parse(read('DevDocs/Governance/product-identity.json'));
const product = JSON.parse(read('product.json'));

let failures = 0;
const pass = (message: string): void => console.log(`PASS  ${message}`);
const fail = (message: string): void => {
	console.error(`FAIL  ${message}`);
	failures++;
};

// 1. product.json matches the recorded identity.
for (const [key, expected] of Object.entries(manifest.productJson)) {
	if (product[key] === expected) {
		pass(`product.json ${key} = ${JSON.stringify(expected)}`);
	} else {
		fail(`product.json ${key}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(product[key])}`);
	}
}

// 2. No top-level string identifier in product.json reuses a Code - OSS value.
const forbidden = new Set(manifest.forbiddenCodeOssValues);
const collisions = Object.entries(product).filter(([, value]) => typeof value === 'string' && forbidden.has(value));
if (collisions.length === 0) {
	pass('product.json has no Code - OSS identifier collisions');
} else {
	for (const [key, value] of collisions) {
		fail(`product.json ${key} collides with Code - OSS value ${JSON.stringify(value)}`);
	}
}

// 3. The out-of-sources (web/dev) fallback in product.ts carries the same identity.
const fallbackSource = read(manifest.webDevFallback.file);
for (const [key, expected] of Object.entries(manifest.webDevFallback.values)) {
	const match = fallbackSource.match(new RegExp(`\\b${key}:\\s*'([^']*)'`));
	if (match?.[1] === expected) {
		pass(`${manifest.webDevFallback.file} fallback ${key} = ${JSON.stringify(expected)}`);
	} else {
		fail(`${manifest.webDevFallback.file} fallback ${key}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(match?.[1])}`);
	}
}

// 4. Windows Start-menu tile name.
const visualElements = read(manifest.win32VisualElements.file);
const tileName = visualElements.match(/ShortDisplayName="([^"]*)"/)?.[1];
if (tileName === manifest.win32VisualElements.shortDisplayName) {
	pass(`${manifest.win32VisualElements.file} ShortDisplayName = ${JSON.stringify(tileName)}`);
} else {
	fail(`${manifest.win32VisualElements.file} ShortDisplayName: expected ${JSON.stringify(manifest.win32VisualElements.shortDisplayName)}, found ${JSON.stringify(tileName)}`);
}

// 5. Web app (PWA) manifest served by the web/server build.
const webManifest = JSON.parse(read(manifest.webAppManifest.file));
for (const key of ['name', 'short_name']) {
	if (webManifest[key] === manifest.webAppManifest[key]) {
		pass(`${manifest.webAppManifest.file} ${key} = ${JSON.stringify(webManifest[key])}`);
	} else {
		fail(`${manifest.webAppManifest.file} ${key}: expected ${JSON.stringify(manifest.webAppManifest[key])}, found ${JSON.stringify(webManifest[key])}`);
	}
}

// 6. Dev (VSCODE_DEV) user-data folder name, so source builds never share data with Code - OSS.
const devProductName = read(manifest.devUserDataPath.file).match(/productName = '([^']*)'/)?.[1];
if (devProductName === manifest.devUserDataPath.productName) {
	pass(`${manifest.devUserDataPath.file} dev productName = ${JSON.stringify(devProductName)}`);
} else {
	fail(`${manifest.devUserDataPath.file} dev productName: expected ${JSON.stringify(manifest.devUserDataPath.productName)}, found ${JSON.stringify(devProductName)}`);
}

// 7. Product icons were replaced with Cognify artwork (no upstream Code - OSS icon remains).
const upstreamAssets: Record<string, string> = manifest.replacedBrandAssets.upstreamSha256;
const stillUpstream = Object.entries(upstreamAssets).filter(([file, upstreamHash]) => createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex') === upstreamHash);
if (stillUpstream.length === 0) {
	pass(`${Object.keys(upstreamAssets).length} product icon files carry Cognify artwork (none match upstream)`);
} else {
	for (const [file] of stillUpstream) {
		fail(`${file} still contains the upstream Code - OSS icon; regenerate with resources/cognify/brand/generate_assets.py`);
	}
}

if (failures > 0) {
	console.error(`\nCognify identity check failed (${failures} problem${failures === 1 ? '' : 's'}). An upstream sync may have reverted Cognify identity values; restore them or update DevDocs/Governance/product-identity.json deliberately.`);
	process.exitCode = 1;
} else {
	console.log('\nCognify identity check passed.');
}
