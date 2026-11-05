/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// NLS rebrand table check (rebranding plan, phase 2; R-02).
//
// build/cognify/nls-rebrand.json overrides, by NLS key, the English text of every rename- and
// reword-class localized and package.nls.json message in the "VS Code" inventory (R-02, R-05). The build applies it
// (build/cognify/nlsRebrand.ts); this script keeps it in step with the source tree.
//
//   node scripts/cognify/nls-rebrand.mts           check (CI)
//   node scripts/cognify/nls-rebrand.mts --write   add entries for new messages, drop old ones. Rename-class
//       entries get a drafted text to review; reword-class entries start as the upstream text, which
//       the check rejects until someone writes the new wording.
//   node scripts/cognify/nls-rebrand.mts --bundle <dir>
//       check a build's nls.keys.json/nls.messages.json (e.g. out-vscode-min): every override
//       for a module in that build is applied, so no rename-class message still says "VS Code"
//
// Check fails when an inventory message has no entry, an entry is not a rename- or reword-class message,
// an entry's `from` no longer matches the source (upstream changed the message), or an
// override still says "VS Code" or changes the placeholders. --write never rewrites a reviewed
// entry: fix stale ones by hand, then review new entries' generated text before committing.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { type RebrandEntry, REBRAND_TABLE_PATH, validateRebrandTable } from '../../build/cognify/nlsRebrand.ts';
import { CSV_PATH, HEADER, parseCsv } from './inventoryCsv.mts';

const root = resolve(import.meta.dirname, '../..');
/** The product's long name (`nameLong` in product.json). */
const PRODUCT = 'Cognify IDE';
const STILL_VSCODE = /VS ?Code|Visual Studio Code/;

/** `<module>#<key>` → class, for every rename- and reword-class message the table must cover. */
function inventoryIds(): Map<string, 'Rename' | 'Reword'> {
	const [header, ...records] = parseCsv(readFileSync(join(root, CSV_PATH), 'utf8'));
	if (header?.join(',') !== HEADER.join(',')) {
		throw new Error(`${CSV_PATH}: unexpected header`);
	}
	const ids = new Map<string, 'Rename' | 'Reword'>();
	for (const [cls, , source, location, key] of records) {
		if (cls !== 'Rename' && cls !== 'Reword') {
			continue;
		}
		if (source === 'localized') {
			ids.set(`${location.replace(/^src\//, '').replace(/\.ts:\d+$/, '')}#${key}`, cls);
		} else if (source === 'package.nls.json') {
			ids.set(`${location}#${key}`, cls);
		}
	}
	return ids;
}

/** The current English messages of `<module>#<key>` in the source tree (several if a key is reused). */
function sourceMessages(ids: Iterable<string>): Map<string, string[]> {
	const byModule = new Map<string, string[]>();
	for (const id of ids) {
		const [module, key] = [id.slice(0, id.indexOf('#')), id.slice(id.indexOf('#') + 1)];
		byModule.set(module, [...byModule.get(module) ?? [], key]);
	}
	const result = new Map<string, string[]>();
	for (const [module, keys] of byModule) {
		const wanted = new Set(keys);
		if (module.endsWith('package.nls.json')) {
			const messages = JSON.parse(readFileSync(join(root, module), 'utf8')) as Record<string, string | { message: string }>;
			for (const key of wanted) {
				const value = messages[key];
				if (value !== undefined) {
					result.set(`${module}#${key}`, [typeof value === 'string' ? value : value.message]);
				}
			}
			continue;
		}
		const path = join(root, 'src', `${module}.ts`);
		let text: string;
		try {
			text = readFileSync(path, 'utf8');
		} catch {
			continue;
		}
		const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
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
				if (key !== undefined && wanted.has(key) && ts.isStringLiteralLike(messageArg)) {
					const id = `${module}#${key}`;
					result.set(id, [...result.get(id) ?? [], messageArg.text]);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	return result;
}

/** First-draft override: the product name in place of VS Code. Reviewed before commit. */
function draft(message: string): string {
	return message.replace(/Visual Studio Code|VS ?Code/g, PRODUCT);
}

function readTable(): Record<string, RebrandEntry> {
	try {
		return (JSON.parse(readFileSync(REBRAND_TABLE_PATH, 'utf8')) as { messages: Record<string, RebrandEntry> }).messages;
	} catch {
		return {};
	}
}

function writeTable(messages: Record<string, RebrandEntry>): void {
	const sorted = Object.fromEntries(Object.entries(messages).sort(([a], [b]) => a.localeCompare(b)));
	writeFileSync(REBRAND_TABLE_PATH, JSON.stringify({
		$comment: 'Cognify NLS override layer (R-02). Maintained with node scripts/cognify/nls-rebrand.mts; see DevDocs/Governance/REBRANDING_PLAN.md.',
		messages: sorted,
	}, null, '\t') + '\n');
}

/** Problems in a built bundle: table entries for modules in the build whose message isn't the override. */
function checkBundle(dir: string, table: Record<string, RebrandEntry>): { applied: number; problems: string[] } {
	const keys = JSON.parse(readFileSync(join(dir, 'nls.keys.json'), 'utf8')) as [string, string[]][];
	const messages = JSON.parse(readFileSync(join(dir, 'nls.messages.json'), 'utf8')) as string[];
	const problems: string[] = [];
	let applied = 0;
	let index = 0;
	for (const [module, moduleKeys] of keys) {
		for (const key of moduleKeys) {
			const entry = table[`${module}#${key}`];
			if (entry && messages[index] === entry.to) {
				applied++;
			} else if (entry) {
				problems.push(`${module}#${key}: the bundle has ${JSON.stringify(messages[index])}`);
			}
			index++;
		}
	}
	return { applied, problems };
}

// --- Main --------------------------------------------------------------------------------

const bundleIndex = process.argv.indexOf('--bundle');
if (bundleIndex !== -1) {
	const dir = resolve(process.argv[bundleIndex + 1] ?? '');
	const { applied, problems } = checkBundle(dir, readTable());
	for (const problem of problems) {
		console.error(`FAIL  ${problem}`);
	}
	if (problems.length || !applied) {
		console.error(`FAIL  ${dir}: ${applied} overrides applied${applied ? '' : ' (is this an NLS build?)'}`);
		process.exit(1);
	}
	console.log(`PASS  ${dir}: all ${applied} overrides for modules in this build are applied.`);
	process.exit(0);
}


const required = inventoryIds();
const table = readTable();
const current = sourceMessages(new Set([...required.keys(), ...Object.keys(table)]));
const problems: string[] = [];
const missing: string[] = [];

for (const id of required.keys()) {
	const messages = current.get(id);
	if (!messages) {
		problems.push(`${id}: in the inventory, but not found in the source (re-run vscode-strings.mts --write)`);
	} else if (new Set(messages).size > 1) {
		problems.push(`${id}: the key is used with different messages; it can't be overridden by key`);
	} else if (!table[id]) {
		missing.push(id);
	}
}
for (const [id, entry] of Object.entries(table)) {
	const messages = current.get(id);
	if (!required.has(id)) {
		problems.push(`${id}: not a rename- or reword-class message in the inventory`);
	} else if (messages && messages[0] !== entry.from) {
		problems.push(`${id}: the English message changed upstream; it is now ${JSON.stringify(messages[0])}`);
	}
	// Reword-class text is written by hand and may name VS Code accurately (for example, its mark or docs).
	if (required.get(id) !== 'Reword' && STILL_VSCODE.test(entry.to)) {
		problems.push(`${id}: the override still says "VS Code"`);
	}
	if (entry.to === entry.from) {
		problems.push(`${id}: the override doesn't change the message${required.get(id) === 'Reword' ? ' (write the reworded text)' : ''}`);
	}
}
problems.push(...validateRebrandTable(table));

if (process.argv.includes('--write')) {
	const next = Object.fromEntries(Object.entries(table).filter(([id]) => required.has(id)));
	for (const id of missing) {
		const from = current.get(id)![0];
		next[id] = { from, to: required.get(id) === 'Reword' ? from : draft(from) };
	}
	writeTable(next);
	const dropped = Object.keys(table).filter(id => !required.has(id));
	console.log(`Wrote ${REBRAND_TABLE_PATH}: ${Object.keys(next).length} entries (${missing.length} added for review, ${dropped.length} dropped).`);
	for (const problem of problems.filter(p => !dropped.some(id => p.startsWith(`${id}:`)))) {
		console.error(`FAIL  ${problem}`);
	}
} else {
	for (const id of missing) {
		problems.push(`${id}: ${required.get(id)?.toLowerCase()}-class message has no override (run with --write, then review the new entry)`);
	}
	if (problems.length) {
		for (const problem of problems) {
			console.error(`FAIL  ${problem}`);
		}
		process.exitCode = 1;
	} else {
		const rewords = [...required.values()].filter(cls => cls === 'Reword').length;
		console.log(`PASS  the NLS rebrand table covers all ${required.size} rename- and reword-class messages (${required.size - rewords} rename, ${rewords} reword), and every override matches the current English text.`);
	}
}
