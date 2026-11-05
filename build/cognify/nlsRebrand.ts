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
//
// Development builds (`transpile-client`, `build-fast`, watch) keep English messages inline.
// With COGNIFY_DEV_REBRAND=1, `rebrandDevSource` applies the same table to the TypeScript source
// as it is transpiled (R-06). It is opt-in because unit tests run against the dev output and
// upstream tests assert upstream's English. A stale entry only warns there; CI's table check fails on it.
// The table is maintained with `node scripts/cognify/nls-rebrand.mts` (see
// DevDocs/Governance/REBRANDING_PLAN.md).

import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

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

/**
 * Overrides the `localize`/`localize2` messages of one module in its TypeScript source, by key.
 * `moduleId` is the NLS module ID (`vs/workbench/…/file`). Returns the new source and the keys
 * whose message no longer matches the entry's `from`; those messages are left unchanged.
 */
export function rebrandSourceMessages(table: RebrandTable, moduleId: string, source: string): { source: string; stale: string[] } {
	const prefix = `${moduleId}#`;
	if (!Object.keys(table).some(id => id.startsWith(prefix))) {
		return { source, stale: [] };
	}
	const sf = ts.createSourceFile(`${moduleId}.ts`, source, ts.ScriptTarget.Latest, true);
	const edits: { start: number; end: number; text: string }[] = [];
	const stale = new Set<string>();
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && /(^|\.)localize2?$/.test(node.expression.getText(sf)) && node.arguments.length >= 2) {
			const [keyArg, messageArg] = node.arguments;
			let key: string | undefined;
			if (ts.isStringLiteralLike(keyArg)) {
				key = keyArg.text;
			} else if (ts.isObjectLiteralExpression(keyArg)) {
				const property = keyArg.properties.find(p => p.name?.getText(sf) === 'key');
				key = property && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : undefined;
			}
			const entry = key === undefined ? undefined : table[`${prefix}${key}`];
			if (entry && ts.isStringLiteralLike(messageArg)) {
				if (messageArg.text === entry.from) {
					edits.push({ start: messageArg.getStart(sf), end: messageArg.end, text: JSON.stringify(entry.to) });
				} else {
					stale.add(`${prefix}${key}`);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	let result = source;
	for (const { start, end, text } of edits.sort((a, b) => b.start - a.start)) {
		result = result.slice(0, start) + text + result.slice(end);
	}
	return { source: result, stale: [...stale] };
}

const SRC_ROOT = path.join(import.meta.dirname, '..', '..', 'src');
let devTable: RebrandTable | undefined;
const warnedStale = new Set<string>();

/** Whether development builds apply the table: set `COGNIFY_DEV_REBRAND=1` when transpiling. */
export function isDevRebrandEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.COGNIFY_DEV_REBRAND === '1';
}

/**
 * For the development transpiler (`build/next/transpile.ts`): when {@link isDevRebrandEnabled},
 * applies the table to a source file under `src/`. Otherwise, and for files outside `src/` or
 * with no entries, the source is returned unchanged.
 */
export function rebrandDevSource(srcPath: string, source: string): string {
	if (!isDevRebrandEnabled()) {
		return source;
	}
	const relative = path.relative(SRC_ROOT, srcPath);
	if (relative.startsWith('..') || path.isAbsolute(relative) || !relative.endsWith('.ts')) {
		return source;
	}
	devTable ??= loadRebrandTable();
	const result = rebrandSourceMessages(devTable, relative.split(path.sep).join('/').slice(0, -'.ts'.length), source);
	for (const id of result.stale.filter(id => !warnedStale.has(id))) {
		warnedStale.add(id);
		console.warn(`[cognify] NLS rebrand entry ${id} is stale (the English message changed upstream); the upstream text is kept. Update build/cognify/nls-rebrand.json with node scripts/cognify/nls-rebrand.mts.`);
	}
	return result.source;
}
