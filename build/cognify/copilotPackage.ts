/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The built-in Copilot extension's node_modules, as its VSIX ships them (Sprint 6, S6-01).
//
// Upstream's product builds use a prebuilt Copilot VSIX, whose contents `.vscodeignore` decides:
// the esbuild bundle in dist/, plus only `@github/copilot` (filtered) and the TypeScript server
// plugin from node_modules. The open-source build path (`packageCopilotExtensionStream`) instead
// copied every production dependency (about 190 packages, with nested copies), which made
// Windows install paths longer than MAX_PATH and the extension 578 MB. This applies the same
// `.vscodeignore` rules to node_modules, so a Cognify package ships what the VSIX would.

import fs from 'fs';
import minimatch from 'minimatch';
import path from 'path';

/** The packages under node_modules that `.vscodeignore` can include; everything else is ignored by its `**` rule. */
const VSIX_PACKAGES = ['@github/copilot', '@vscode/copilot-typescript-server-plugin'];

/**
 * Whether `.vscodeignore` (vsce semantics: each pattern ignores, `!` re-includes, the last match
 * wins) ships a file, given its path relative to the extension with forward slashes.
 */
export function isShippedByVscodeignore(rules: readonly string[], file: string): boolean {
	let shipped = true;
	for (const rule of rules) {
		const negated = rule.startsWith('!');
		const pattern = negated ? rule.slice(1) : rule;
		if (minimatch(file, pattern, { dot: true }) || (pattern.endsWith('/') && file.startsWith(pattern))) {
			shipped = negated;
		}
	}
	return shipped;
}

/** Reads the extension's `.vscodeignore` rules, without comments and blank lines. */
export function readVscodeignore(extensionPath: string): string[] {
	return fs.readFileSync(path.join(extensionPath, '.vscodeignore'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

/** The node_modules files the Copilot VSIX ships, relative to the extension, with forward slashes. */
export function copilotVsixNodeModules(extensionPath: string): string[] {
	const rules = readVscodeignore(extensionPath);
	const files: string[] = [];
	for (const name of VSIX_PACKAGES) {
		const folder = path.join(extensionPath, 'node_modules', name);
		if (!fs.existsSync(folder)) {
			continue;
		}
		for (const entry of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
			if (entry.isFile()) {
				const file = path.relative(extensionPath, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
				if (isShippedByVscodeignore(rules, file)) {
					files.push(file);
				}
			}
		}
	}
	return files.sort();
}
