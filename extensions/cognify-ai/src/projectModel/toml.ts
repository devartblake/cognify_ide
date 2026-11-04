/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The TOML subset that `pyproject.toml` and `Cargo.toml` manifests use for names,
// scripts and dependency lists: tables, string/number/boolean values, string arrays
// (also over several lines), and inline tables kept as raw text. It is not a full
// TOML parser; anything else is skipped, never guessed.

export type TomlValue = string | number | boolean | readonly string[] | { readonly raw: string };

/** Table path (`project`, `tool.poetry.dependencies`; `` for the root) → key → value. */
export type TomlTables = ReadonlyMap<string, ReadonlyMap<string, TomlValue>>;

export function parseTomlSubset(text: string): TomlTables {
	const tables = new Map<string, Map<string, TomlValue>>([['', new Map()]]);
	let current = tables.get('')!;
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = stripComment(lines[i]).trim();
		if (!line) {
			continue;
		}
		const header = /^\[(?<array>\[)?\s*(?<name>[^\]]+?)\s*\]\]?$/.exec(line);
		if (header?.groups) {
			// Arrays of tables (`[[bin]]`) aren't needed for the MVP facts; collect nothing for them.
			const name = unquoteKey(header.groups.name);
			current = header.groups.array ? new Map() : (tables.get(name) ?? tables.set(name, new Map()).get(name)!);
			continue;
		}
		const assignment = /^(?<key>"[^"]*"|'[^']*'|[A-Za-z0-9_.-]+)\s*=\s*(?<value>.*)$/.exec(line);
		if (!assignment?.groups) {
			continue;
		}
		let raw = assignment.groups.value;
		// A multi-line array runs until its closing bracket.
		if (raw.startsWith('[') && !balanced(raw)) {
			while (i + 1 < lines.length && !balanced(raw)) {
				raw += ' ' + stripComment(lines[++i]).trim();
			}
		}
		const value = parseValue(raw.trim());
		if (value !== undefined) {
			current.set(unquoteKey(assignment.groups.key), value);
		}
	}
	return tables;
}

function parseValue(raw: string): TomlValue | undefined {
	const string = /^"((?:[^"\\]|\\.)*)"$|^'([^']*)'$/.exec(raw);
	if (string) {
		return string[1] !== undefined ? string[1].replace(/\\(.)/g, '$1') : string[2];
	}
	if (raw === 'true' || raw === 'false') {
		return raw === 'true';
	}
	if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
		return Number(raw);
	}
	if (raw.startsWith('[')) {
		return [...raw.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map(m => m[1] ?? m[2]);
	}
	if (raw.startsWith('{')) {
		return { raw };
	}
	return undefined;
}

function balanced(raw: string): boolean {
	let depth = 0;
	let quote: string | undefined;
	for (const char of raw) {
		if (quote) {
			if (char === quote) {
				quote = undefined;
			}
		} else if (char === '"' || char === '\'') {
			quote = char;
		} else if (char === '[') {
			depth++;
		} else if (char === ']') {
			depth--;
		}
	}
	return depth <= 0;
}

/** Drop a `#` comment that isn't inside a string. */
function stripComment(line: string): string {
	let quote: string | undefined;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (quote) {
			if (char === quote) {
				quote = undefined;
			}
		} else if (char === '"' || char === '\'') {
			quote = char;
		} else if (char === '#') {
			return line.slice(0, i);
		}
	}
	return line;
}

function unquoteKey(key: string): string {
	return key.split('.').map(part => part.trim().replace(/^["']|["']$/g, '')).join('.');
}
