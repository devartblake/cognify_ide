/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { getRole, vendorPreferenceFor } from '../router.ts';
import { buildExplainPrompt, buildFixPrompt, buildGuidePrompt, buildReviewPrompt, getRoleCommand, ROLE_COMMANDS } from '../rolePrompts.ts';

const CODE = [{ label: 'src/a.ts:1-3', text: 'export const add = (a, b) => a + b;' }];

describe('role commands (S2-13)', () => {
	test('each command maps to a role that owns its task', () => {
		assert.deepEqual(
			ROLE_COMMANDS.map(spec => [spec.command, spec.role, spec.task, getRole(spec.role).tasks.includes(spec.task)]),
			[['review', 'reviewer', 'review', true], ['explain', 'tutor', 'explain', true], ['guide', 'tutor', 'explain', true], ['fix', 'coder', 'edit', true]],
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

	test('Guide Me and Fix It (S5-07, S5-08): the goal or problem, the code, and the project context; commands shown, never run; fixes proposed, never applied', () => {
		const context = 'Run: `uvicorn app.main:app` (task `cognify: run`).';
		const guide = buildGuidePrompt('add a page that lists users', CODE, context);
		const fix = buildFixPrompt('NameError: name \'x\' is not defined at line 3 of app/main.py', CODE, context);
		const bare = buildGuidePrompt('run the tests', []);
		assert.deepStrictEqual({
			guide: [guide.includes('The user\'s goal: add a page that lists users'), guide.includes('numbered steps'), guide.includes('never claim to have run'), guide.includes(context), guide.includes(CODE[0].text)],
			fix: [fix.includes('The problem: NameError'), fix.includes('smallest change'), fix.includes('apply it themselves'), fix.includes(context), fix.includes(CODE[0].text)],
			noContextSection: bare.includes('What Cognify knows about this project'),
			usesContext: ROLE_COMMANDS.filter(spec => spec.usesProjectContext).map(spec => spec.command),
		}, {
			guide: [true, true, true, true, true],
			fix: [true, true, true, true, true],
			noContextSection: false,
			usesContext: ['guide', 'fix'],
		});
	});
});
