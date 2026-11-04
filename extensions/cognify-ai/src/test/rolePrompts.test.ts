/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { getRole, vendorPreferenceFor } from '../router.ts';
import { buildExplainPrompt, buildReviewPrompt, getRoleCommand, ROLE_COMMANDS } from '../rolePrompts.ts';

const CODE = [{ label: 'src/a.ts:1-3', text: 'export const add = (a, b) => a + b;' }];

describe('role commands (S2-13)', () => {
	test('each command maps to a role that owns its task', () => {
		assert.deepEqual(
			ROLE_COMMANDS.map(spec => [spec.command, spec.role, spec.task, getRole(spec.role).tasks.includes(spec.task)]),
			[['review', 'reviewer', 'review', true], ['explain', 'tutor', 'explain', true]],
		);
		assert.equal(getRoleCommand('explain')?.role, 'tutor');
		assert.equal(getRoleCommand('deploy'), undefined);
	});

	test('explain routes Copilot first, then Gemini and GPT (contract section 5)', () => {
		assert.deepEqual(vendorPreferenceFor('explain'), ['copilot', 'gemini', 'openai']);
	});

	test('the Tutor prompt covers a question, code, or both', () => {
		const withBoth = buildExplainPrompt('why arrow functions?', CODE);
		const codeOnly = buildExplainPrompt('', CODE);
		const questionOnly = buildExplainPrompt('what is a closure?', []);
		assert.deepEqual([
			withBoth.includes('Tutor role') && withBoth.includes('What the user wants explained: why arrow functions?') && withBoth.includes('### src/a.ts:1-3'),
			codeOnly.includes('Explain the code below.') && codeOnly.includes('export const add'),
			questionOnly.includes('What the user wants explained: what is a closure?') && questionOnly.includes('answer the question directly'),
		], [true, true, true]);
	});

	test('the Reviewer prompt is unchanged by the refactor', () => {
		assert.equal(buildReviewPrompt('', []).endsWith('No code was attached or selected. Ask the user to attach files with # or select code.'), true);
		assert.ok(buildReviewPrompt('focus on errors', CODE).includes('Reviewer focus from the user: focus on errors'));
	});
});
