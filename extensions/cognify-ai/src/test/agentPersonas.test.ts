/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
// The `.agent.md` personas are data; this keeps them in step with the role map in router.ts.
// Upstream's prompt validator checks the same files in the integration tests.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ROLES } from '../router.ts';

const EXTENSION_ROOT = join(import.meta.dirname, '..', '..');

interface Persona {
	readonly path: string;
	readonly name: string;
	readonly handoffAgents: readonly string[];
	readonly tools: readonly string[];
}

function readPersonas(): Persona[] {
	const manifest = JSON.parse(readFileSync(join(EXTENSION_ROOT, 'package.json'), 'utf8')) as { contributes: { chatAgents: { path: string }[] } };
	return manifest.contributes.chatAgents.map(({ path }) => {
		const text = readFileSync(join(EXTENSION_ROOT, path), 'utf8');
		const header = /^---\n(?<header>[\s\S]*?)\n---\n/.exec(text)?.groups?.header ?? '';
		return {
			path,
			name: /^name: (?<name>.+)$/m.exec(header)?.groups?.name ?? '',
			handoffAgents: [...header.matchAll(/^ {4}agent: (?<agent>.+)$/gm)].map(m => m.groups?.agent ?? ''),
			tools: JSON.parse((/^tools: (?<tools>.+)$/m.exec(header)?.groups?.tools ?? '[]').replaceAll('\'', '"')) as string[],
		};
	});
}

describe('role personas (S2-14)', () => {
	test('one persona per role in the handoff chain, with handoffs that follow the role map', () => {
		const personaName = (roleId: string) => `Cognify ${ROLES.find(r => r.id === roleId)?.name}`;
		const expected = ROLES.filter(r => r.handoffTo).map(r => ({
			path: `./agents/${r.id}.agent.md`,
			name: personaName(r.id),
			handoffAgents: [personaName(r.handoffTo!)],
		}));
		assert.deepEqual(readPersonas().map(({ path, name, handoffAgents }) => ({ path, name, handoffAgents })), expected);
	});

	test('the Planner and Reviewer are read-only; the Coder and Tester can edit and run commands; all can query the project model', () => {
		assert.deepEqual(
			Object.fromEntries(readPersonas().map(p => [p.name, p.tools])),
			{
				'Cognify Planner': ['search', 'read', 'vscode.cognify-ai/projectModel'],
				'Cognify Coder': ['search', 'read', 'edit', 'execute', 'vscode.cognify-ai/projectModel'],
				'Cognify Reviewer': ['search', 'read', 'vscode.cognify-ai/projectModel'],
				'Cognify Tester': ['search', 'read', 'edit', 'execute', 'vscode.cognify-ai/projectModel'],
			},
		);
	});
});
