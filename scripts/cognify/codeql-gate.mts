/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The CodeQL gate (Sprint 6, S6-05): fails when an analysis found a high or critical security
// issue, so the check is red on the pull request that introduces it.
//
//   node scripts/cognify/codeql-gate.mts <folder of SARIF files>
//
// GitHub rates security queries with `security-severity` (CVSS): 7.0 and above is high, 9.0 and
// above critical. Lower findings are listed but don't fail; triage them in the Security tab.

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface SarifRule {
	readonly id: string;
	readonly properties?: { readonly 'security-severity'?: string };
}

interface SarifResult {
	readonly ruleId?: string;
	readonly message?: { readonly text?: string };
	readonly locations?: readonly { readonly physicalLocation?: { readonly artifactLocation?: { readonly uri?: string }; readonly region?: { readonly startLine?: number } } }[];
}

interface Sarif {
	readonly runs: readonly { readonly tool: { readonly driver: { readonly rules?: readonly SarifRule[] } }; readonly results?: readonly SarifResult[] }[];
}

const HIGH = 7.0;
const folder = resolve(process.argv[2] ?? '');
let blocking = 0;
let total = 0;

for (const file of readdirSync(folder).filter(name => name.endsWith('.sarif'))) {
	const sarif = JSON.parse(readFileSync(join(folder, file), 'utf8')) as Sarif;
	for (const run of sarif.runs) {
		const severities = new Map((run.tool.driver.rules ?? []).map(rule => [rule.id, Number(rule.properties?.['security-severity'] ?? 0)]));
		for (const result of run.results ?? []) {
			total++;
			const severity = severities.get(result.ruleId ?? '') ?? 0;
			const location = result.locations?.[0]?.physicalLocation;
			const where = `${location?.artifactLocation?.uri ?? '?'}:${location?.region?.startLine ?? '?'}`;
			const line = `${severity.toFixed(1)}  ${result.ruleId}  ${where}  ${result.message?.text ?? ''}`;
			if (severity >= HIGH) {
				blocking++;
				console.error(`FAIL  ${line}`);
			} else {
				console.log(`NOTE  ${line}`);
			}
		}
	}
}

console.log(`${total} finding(s), ${blocking} high or critical.`);
process.exit(blocking ? 1 : 0);
