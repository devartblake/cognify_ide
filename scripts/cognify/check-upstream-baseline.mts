/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Cognify upstream baseline guard. Verifies that the runtime versions and the
// accepted upstream commit recorded in DevDocs/Governance/upstream-baseline.json
// still match the repository. Run with: node scripts/cognify/check-upstream-baseline.mts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface UpstreamBaselineManifest {
	readonly upstream: { readonly importedCommit: string; readonly observedMainCommit: string };
	readonly runtime: { readonly codeOssVersion: string; readonly nodeVersion: string };
}

const root = resolve(import.meta.dirname, '../..');
const manifest: UpstreamBaselineManifest = JSON.parse(readFileSync(resolve(root, 'DevDocs/Governance/upstream-baseline.json'), 'utf8'));

function git(args: readonly string[]): string {
	return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function pass(message: string): void {
	console.log(`PASS  ${message}`);
}

function warn(message: string): void {
	console.warn(`WARN  ${message}`);
}

function fail(message: string): void {
	console.error(`FAIL  ${message}`);
	process.exitCode = 1;
}

const nodeVersion = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
const pkg: { readonly version: string } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

if (nodeVersion === manifest.runtime.nodeVersion) {
	pass(`Node baseline matches .nvmrc (${nodeVersion})`);
} else {
	fail(`Node baseline drift: manifest=${manifest.runtime.nodeVersion}, .nvmrc=${nodeVersion}`);
}

if (pkg.version === manifest.runtime.codeOssVersion) {
	pass(`Code OSS package version matches baseline (${pkg.version})`);
} else {
	fail(`Code OSS version drift: manifest=${manifest.runtime.codeOssVersion}, package.json=${pkg.version}`);
}

try {
	execFileSync('git', ['merge-base', '--is-ancestor', manifest.upstream.importedCommit, 'HEAD'], { cwd: root, stdio: 'ignore' });
	pass(`Accepted upstream commit is present in current history (${manifest.upstream.importedCommit})`);
} catch {
	fail(`Accepted upstream commit is not an ancestor of HEAD: ${manifest.upstream.importedCommit}`);
}

try {
	pass(`Current HEAD: ${git(['rev-parse', 'HEAD'])}`);
} catch (error) {
	fail(`Unable to resolve current git HEAD: ${error instanceof Error ? error.message : String(error)}`);
}

// Microsoft's main as seen locally: the `upstream` remote, or the Cognify mirror branch
// `vendor/vscode-main` (kept by .github/workflows/cognify-upstream-mirror.yml).
const upstreamRefs = ['upstream/main', 'origin/vendor/vscode-main', 'vendor/vscode-main'];
let upstreamRef: string | undefined;
let upstreamMain: string | undefined;
for (const ref of upstreamRefs) {
	try {
		upstreamMain = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
		upstreamRef = ref;
		break;
	} catch {
		// Try the next candidate.
	}
}
if (upstreamRef && upstreamMain) {
	if (upstreamMain === manifest.upstream.observedMainCommit) {
		pass(`${upstreamRef} matches the manifest observation (${upstreamMain})`);
	} else {
		warn(`${upstreamRef} has moved since the manifest was recorded: recorded=${manifest.upstream.observedMainCommit}, local=${upstreamMain}`);
	}
} else {
	warn('No local view of microsoft/vscode main (upstream/main or origin/vendor/vscode-main). Run `git fetch upstream` or `git fetch origin vendor/vscode-main` before an upstream-sync review.');
}

if (process.exitCode) {
	console.error('\nCognify upstream baseline check failed. Reconcile the drift before merging an upstream sync or update the manifest only after validation.');
} else {
	console.log('\nCognify upstream baseline check passed.');
}
