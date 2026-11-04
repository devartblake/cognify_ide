/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// NLS override layer (rebranding plan, phase 2; Sprint 3 R-02).
//
// Packaged builds replace the English text of reviewed "VS Code" messages with Cognify
// wording, by NLS key, in the generated message bundle (`nls.messages.json`/`.js`) and in
// built-in extensions' `package.nls.json`. Upstream source files stay untouched.
//
// Every entry records the English text it was written against (`from`). If upstream changes
// that message, the build fails and names the key, so a stale override is never applied.
// The table is maintained with `node scripts/cognify/nls-rebrand.mts` (see
// DevDocs/Governance/REBRANDING_PLAN.md).

import fs from 'fs';
import path from 'path';

/** One reviewed override. */
export interface RebrandEntry {
	/** The upstream English message this entry was written against. */
	readonly from: string;
	/** The English message Cognify ships instead. */
	readonly to: string;
}

/**
 * `<module>#<key>` → override. `<module>` is the NLS module ID (`vs/workbench/…/file`, as in
 * `nls.keys.json`) or an extension's `extensions/<name>/package.nls.json`.
 */
export type RebrandTable = Readonly<Record<string, RebrandEntry>>;

export const REBRAND_TABLE_PATH = path.join(import.meta.dirname, 'nls-rebrand.json');

const PLACEHOLDER = /\{(?<index>\d+)\}/g;

export function loadRebrandTable(tablePath = REBRAND_TABLE_PATH): RebrandTable {
	const { messages } = JSON.parse(fs.readFileSync(tablePath, 'utf8')) as { messages: RebrandTable };
	return messages;
}

/** The sorted, distinct `{n}` placeholders of a message. */
function placeholders(message: string): string {
	return [...new Set([...message.matchAll(PLACEHOLDER)].map(m => m[0]))].sort().join(',');
}

/** Problems in the table itself: overrides that would drop or add a placeholder. */
export function validateRebrandTable(table: RebrandTable): string[] {
	const problems: string[] = [];
	for (const [id, { from, to }] of Object.entries(table)) {
		if (placeholders(from) !== placeholders(to)) {
			problems.push(`${id}: placeholders differ ("${placeholders(from)}" → "${placeholders(to)}")`);
		}
	}
	return problems;
}

class RebrandError extends Error {
	constructor(problems: readonly string[]) {
		super(`Cognify NLS rebrand table (build/cognify/nls-rebrand.json) is out of date:\n  ${problems.join('\n  ')}\nUpdate the entries with node scripts/cognify/nls-rebrand.mts.`);
	}
}

/**
 * Overrides in `messages`, which is indexed like the flattened `keys` (the shape of
 * `nls.keys.json` and `nls.messages.json`). Returns a new array; throws if an override's
 * `from` no longer matches the message. Entries for modules not in this build are ignored.
 */
export function rebrandMessages(table: RebrandTable, keys: ReadonlyArray<readonly [string, readonly string[]]>, messages: readonly string[]): string[] {
	const problems = validateRebrandTable(table);
	const result = [...messages];
	let index = 0;
	for (const [moduleId, moduleKeys] of keys) {
		for (const key of moduleKeys) {
			const entry = table[`${moduleId}#${key}`];
			if (entry) {
				if (result[index] === entry.from) {
					result[index] = entry.to;
				} else {
					problems.push(`${moduleId}#${key}: the English message changed upstream; it is now ${JSON.stringify(result[index])}`);
				}
			}
			index++;
		}
	}
	if (problems.length) {
		throw new RebrandError(problems);
	}
	return result;
}

type PackageNls = Record<string, string | { message: string; comment?: string[] }>;

/**
 * Overrides in a built-in extension's `package.nls.json`. `relativePath` is
 * `extensions/<name>/package.nls.json`. Returns `messages` unchanged if no entry applies.
 */
export function rebrandPackageNls(table: RebrandTable, relativePath: string, messages: PackageNls): PackageNls {
	const prefix = `${relativePath.split(path.sep).join('/')}#`;
	const entries = Object.entries(table).filter(([id]) => id.startsWith(prefix));
	if (!entries.length) {
		return messages;
	}
	const problems = validateRebrandTable(Object.fromEntries(entries));
	const result = { ...messages };
	for (const [id, entry] of entries) {
		const key = id.slice(prefix.length);
		const value = result[key];
		const message = typeof value === 'string' ? value : value?.message;
		if (message === entry.from) {
			result[key] = typeof value === 'string' ? entry.to : { ...value, message: entry.to };
		} else {
			problems.push(message === undefined ? `${id}: the key no longer exists upstream` : `${id}: the English message changed upstream; it is now ${JSON.stringify(message)}`);
		}
	}
	if (problems.length) {
		throw new RebrandError(problems);
	}
	return result;
}
