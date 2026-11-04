/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// "VS Code" string inventory and drift check (rebranding plan, R-01).
//
// Finds every place the product calls itself "VS Code": string literals and localize()
// messages in src/vs (not tests), and built-in extensions' package.nls.json. Each is
// classified as rename, reword or keep (DevDocs/Governance/VS_CODE_STRING_INVENTORY.md).
//
//   node scripts/cognify/vscode-strings.mts           check: fail on new user-visible strings
//   node scripts/cognify/vscode-strings.mts --write   regenerate the inventory CSV
//
// Rows are matched by source, file, key and text, never by line, so upstream edits that
// only move a string are not drift. The committed CSV is the reviewed record: --write keeps
// the class of every row it already has, and classifies only new rows with the rules below.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { CSV_PATH, csvField, HEADER, parseCsv } from './inventoryCsv.mts';

const root = resolve(import.meta.dirname, '../..');
const PATTERN = /VS ?Code|Visual Studio Code|vscode\.dev/;
/** Text kept per row in the CSV. */
const MAX_TEXT = 300;

type Kind = 'localized' | 'literal' | 'package.nls.json';
type Category = keyof typeof CATEGORIES;

const CATEGORIES = {
	'K-id': 'Keep', 'K-telemetry': 'Keep', 'K-log': 'Keep', 'K-ecosystem': 'Keep', 'K-msproduct': 'Keep', 'K-dup': 'Keep',
	'R-ui': 'Rename', 'R-settings': 'Rename', 'R-ext': 'Rename', 'R-theme': 'Rename', 'R-model': 'Rename',
	'W-service': 'Reword', 'W-artwork': 'Reword', 'W-issues': 'Reword', 'W-copilot': 'Reword', 'W-cli': 'Reword',
} as const;

interface Found {
	readonly source: Kind;
	readonly file: string;
	readonly line: number;
	readonly key: string;
	readonly text: string;
}

interface Row extends Found {
	readonly cls: string;
	readonly category: string;
}

// --- Extraction ------------------------------------------------------------------------

function walk(dir: string, out: string[]): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'test' && entry.name !== 'node_modules') {
				walk(path, out);
			}
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.includes('.test.')) {
			out.push(path);
		}
	}
	return out;
}

function toPosix(path: string): string {
	return relative(root, path).split(sep).join('/');
}

function extract(): Found[] {
	const found: Found[] = [];
	for (const path of walk(join(root, 'src/vs'), [])) {
		const text = readFileSync(path, 'utf8');
		if (!PATTERN.test(text)) {
			continue;
		}
		const file = toPosix(path);
		const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
		const visit = (node: ts.Node): void => {
			if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
				const value = ts.isTemplateExpression(node) ? node.getText(sf) : node.text;
				if (PATTERN.test(value)) {
					let source: Kind = 'literal';
					let key = '';
					const call = node.parent;
					if (call && ts.isCallExpression(call) && /(^|\.)localize2?$/.test(call.expression.getText(sf)) && call.arguments[1] === node) {
						source = 'localized';
						const keyArg = call.arguments[0];
						if (ts.isStringLiteralLike(keyArg)) {
							key = keyArg.text;
						} else if (ts.isObjectLiteralExpression(keyArg)) {
							const property = keyArg.properties.find(p => p.name?.getText(sf) === 'key');
							key = property && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : '';
						} else {
							key = keyArg.getText(sf);
						}
					}
					found.push({ source, file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, key, text: value.replace(/\s+/g, ' ') });
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	for (const extension of readdirSync(join(root, 'extensions'))) {
		let messages: Record<string, unknown>;
		try {
			messages = JSON.parse(readFileSync(join(root, 'extensions', extension, 'package.nls.json'), 'utf8'));
		} catch {
			continue;
		}
		for (const [key, raw] of Object.entries(messages)) {
			const value = typeof raw === 'string' ? raw : (raw as { message?: unknown } | null)?.message;
			if (typeof value === 'string' && PATTERN.test(value)) {
				found.push({ source: 'package.nls.json', file: `extensions/${extension}/package.nls.json`, line: 0, key, text: value.replace(/\s+/g, ' ') });
			}
		}
	}
	return found;
}

// --- Classification (the S2-17 rules, in order) ------------------------------------------

function classify({ source, file: f, key, text: t }: Found): Category {
	const extension = f.startsWith('extensions/') ? f.split('/')[1] : '';

	// Explicit overrides, checked by hand.
	if (f.includes('extensionsRegistry')) { return 'K-ecosystem'; }
	if (f.includes('chatColors')) { return 'W-artwork'; }
	if (f.includes('outputMonitor')) { return 'K-log'; }
	if (f.includes('extensionsSlowActions')) { return 'W-issues'; }
	if (/marketplace\.ts|extHostTunnelService/.test(f) || (source === 'literal' && /^(https?:\/\/\S+\s*)+$/.test(t.trim()))) { return 'K-id'; }
	if (source === 'literal' && f.includes('extensions.contribution')) { return 'R-settings'; }
	if (/Dev Tunnel/.test(t)) { return 'W-service'; }

	if (source === 'package.nls.json') {
		if (/vscode\.dev/.test(t)) { return 'W-service'; }
		if (extension === 'copilot' && /Ask questions about VS Code|VS Code API|extension development/.test(t)) { return 'W-copilot'; }
		if (extension.startsWith('theme-') || key.includes('IconThemeLabel')) { return 'R-theme'; }
		if (/custom data format/.test(t)) { return 'K-ecosystem'; }
		if (extension === 'git' && t.includes('aka.ms')) { return 'W-service'; }
		return 'R-ext';
	}

	if (source === 'literal') {
		if (t.includes('localize(')) { return 'K-dup'; }
		if (/^[\w.\-/:$|{}`]+$/.test(t) || /^(X-|VSCode)/.test(t) || /\.js$|\.css$/.test(t)) { return 'K-id'; }
		if (/vscode\.dev|aka\.ms/.test(t) && !/\s/.test(t.trim())) { return 'K-id'; }
		if (f.toLowerCase().includes('telemetry') || /Whether|The (error|SDK|client|initiating|connected|machine|development|package|message|previous|current|type)|Fired when|This is used|Tracks|Entries skipped|Candidates|Additional candidates|VS Code sessions|Backend agent|Inner (width|height)|Width of|Height of|per-window zoom|recent-folder history|Whenever an error|Aggregates|Provides detailed|Used to see|The originating|telemetry session|lookup state|auxiliary window/.test(t)) { return 'K-telemetry'; }
		if (/tools?\/|Tool\.ts|systemMessage|automationTools|chatBackgroundTool|sessionsListTools|mcpConfigurationGeneration|customizationMigrationResultTool|agentHostLocalCustomizations|testingChatAgentTool|installExtensionsTool|searchExtensionsTool/.test(f)) { return 'R-model'; }
		if (/issue\//.test(f)) { return 'W-issues'; }
		if (/gettingStartedContent|vs_code_editor_walkthrough|extensionsWorkbenchService|extensionsActions\.ts|extensionManagementService\.ts/.test(f)) { return /for Web/.test(t) ? 'W-service' : 'R-ui'; }
		if (/server\.cli|argv\.ts/.test(f)) { return 'W-cli'; }
		if (/missionControlHost|loopbackServer/.test(f)) { return 'K-msproduct'; }
		if (/workbenchThemeService/.test(f)) { return 'K-id'; }
		if (/extHostCommands|viewsExtensionPoint|extHostApiCommands/.test(f)) { return 'K-ecosystem'; }
		// Names Cognify presents to other apps, git history or diagnostics the user reads.
		if (/agentHostClientInfo|agentHostFileSystemService|syncedCustomizationBundler|agentMergeTools|codexAgent|codexLaunchConfig|codexSavedThreadReader|mcpGatewaySession|agentHostGitService|artifactIntegration|sessionWorkspaceConversion|policyDiagnosticsMarkdown|developerActions/.test(f)) { return 'R-ui'; }
		if (/trustedDomainsFileSystemProvider|extensionsFileTemplate/.test(f)) { return 'R-ui'; }
		return 'K-log';
	}

	// Localized messages: shown to users.
	if (/vscode\.dev|VS Code for the Web|VS Code Web|Insiders|Stable version|Newsletter|video tutorials|Release Notes|Remote Tunnel|secure tunnel|github\.com\/copilot/i.test(t)) { return 'W-service'; }
	if (/chatPet|chatProgressConfiguration|chatColors/.test(f) || /VS Code pet|VS Code (mark|logo|icon)/.test(t)) { return 'W-artwork'; }
	if (/issue\//.test(f)) { return 'W-issues'; }
	if (/VS Code CLI|VS Code server/.test(t)) { return 'W-cli'; }
	if (/Ask questions about VS Code/.test(t)) { return 'W-copilot'; }
	if (/VS Code Speech/.test(t)) { return 'K-msproduct'; }
	if (/extensionsRegistry|localization\.contribution|taskDefinitionRegistry/.test(f) || /compatible with VS Code|VS Code extension|VS Code tests?\b|VS Code test|VS Code input variables|VS Code API|agent files|rules files|VS Code skills|VS Code agents/.test(t)) { return 'K-ecosystem'; }
	if (/contextkeys\.ts/.test(f)) { return 'K-log'; }
	if (/configuration|Configuration|contribution\.ts|\.config|Config\.ts|Schema|jsonSchema|enablementService|terminalConfiguration/.test(f)) { return 'R-settings'; }
	return 'R-ui';
}

// --- CSV (RFC 4180, as Python's csv module writes it) ------------------------------------

/** Identity of a string across upstream edits: everything except its line. */
function identity(row: Pick<Found, 'source' | 'file' | 'key' | 'text'>): string {
	return [row.source, row.file, row.key, row.text.slice(0, MAX_TEXT)].join('\u0000');
}

/**
 * Key each row by its identity plus its occurrence number among identical strings in
 * the same file (in line order). A string repeated twice in a file is two rows, and
 * moving them within the file changes neither key.
 */
function keyed<T extends Pick<Found, 'source' | 'file' | 'key' | 'text' | 'line'>>(rows: readonly T[]): Map<string, T> {
	const seen = new Map<string, number>();
	const result = new Map<string, T>();
	for (const row of [...rows].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
		const id = identity(row);
		const occurrence = seen.get(id) ?? 0;
		seen.set(id, occurrence + 1);
		result.set(`${id}\u0000${occurrence}`, row);
	}
	return result;
}

function readInventory(): Map<string, Row> {
	const [header, ...records] = parseCsv(readFileSync(join(root, CSV_PATH), 'utf8'));
	if (header?.join(',') !== HEADER.join(',')) {
		throw new Error(`${CSV_PATH}: unexpected header`);
	}
	return keyed(records.map(([cls, category, source, location, key, text]): Row => {
		const [file, line] = location.split(/:(?=\d+$)/);
		return { cls, category, source: source as Kind, file, line: Number(line ?? 0), key, text };
	}));
}

function writeInventory(rows: readonly Row[]): void {
	const sorted = [...rows].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.key.localeCompare(b.key) || a.text.localeCompare(b.text));
	const lines = [HEADER, ...sorted.map(r => [r.cls, r.category, r.source, r.line ? `${r.file}:${r.line}` : r.file, r.key, r.text.slice(0, MAX_TEXT)])];
	writeFileSync(join(root, CSV_PATH), lines.map(fields => fields.map(csvField).join(',')).join('\n') + '\n');
}

// --- Main --------------------------------------------------------------------------------

const inventory = readInventory();
const found = extract();
const current = new Map<string, Row>();
for (const [id, entry] of keyed(found)) {
	// The reviewed class wins for strings the inventory already has.
	const known = inventory.get(id);
	const category = known?.category ?? classify(entry);
	current.set(id, { ...entry, category, cls: known?.cls ?? CATEGORIES[category as Category] });
}
const added = [...current.entries()].filter(([id]) => !inventory.has(id)).map(([, row]) => row);
const removed = [...inventory.entries()].filter(([id]) => !current.has(id)).map(([, row]) => row);
const counts = (rows: Iterable<Row>) => {
	const result: Record<string, number> = { Rename: 0, Reword: 0, Keep: 0 };
	for (const row of rows) {
		result[row.cls] = (result[row.cls] ?? 0) + 1;
	}
	return result;
};
const summary = (c: Record<string, number>) => `${c.Rename + c.Reword + c.Keep} strings: ${c.Rename} rename, ${c.Reword} reword, ${c.Keep} keep`;

if (process.argv.includes('--write')) {
	writeInventory([...current.values()]);
	console.log(`Wrote ${CSV_PATH}: ${summary(counts(current.values()))} (${added.length} added, ${removed.length} removed).`);
} else {
	const userVisible = added.filter(row => row.cls !== 'Keep');
	for (const row of added.filter(r => r.cls === 'Keep')) {
		console.warn(`WARN  new string, classified ${row.category} (keep): ${row.file}:${row.line} ${row.text.slice(0, 100)}`);
	}
	if (removed.length) {
		console.warn(`WARN  ${removed.length} inventory row(s) no longer found (changed or removed upstream); run with --write to update the inventory.`);
	}
	for (const row of userVisible) {
		console.error(`FAIL  new user-visible "VS Code" string, classified ${row.category} (${row.cls.toLowerCase()}): ${row.file}:${row.line}${row.key ? ` [${row.key}]` : ''} ${row.text.slice(0, 120)}`);
	}
	if (userVisible.length) {
		console.error(`\n${userVisible.length} new user-visible string(s). Review them, then run: node scripts/cognify/vscode-strings.mts --write (see DevDocs/Governance/REBRANDING_PLAN.md).`);
		process.exitCode = 1;
	} else {
		console.log(`PASS  no new user-visible "VS Code" strings (${summary(counts(current.values()))}).`);
	}
}
