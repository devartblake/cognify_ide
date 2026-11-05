/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Reading and writing the "VS Code" string inventory CSV (DevDocs/Governance/vs-code-string-inventory.csv),
// shared by vscode-strings.mts (R-01) and nls-rebrand.mts (R-02). Quoting matches Python's csv module.

export const CSV_PATH = 'DevDocs/Governance/vs-code-string-inventory.csv';

export const HEADER = ['class', 'category', 'source', 'location', 'key', 'text'];

export function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ',') {
			row.push(field);
			field = '';
		} else if (char === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (char !== '\r') {
			field += char;
		}
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
