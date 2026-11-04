/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: npm test (node --test, TypeScript type stripping; Node >= 22.18)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { isLocalVendor } from '../privacy.ts';
import { assessAiSetup } from '../setup.ts';

const models = (...vendors: string[]) => vendors.map(vendor => ({ vendor }));

describe('AI setup assessment (S2-03)', () => {
	test('readiness follows Copilot availability', () => {
		assert.deepEqual([
			assessAiSetup(models('copilot', 'copilot', 'gemini'), { isLocalVendor }).readiness,
			assessAiSetup(models('gemini', 'ollama'), { isLocalVendor }).readiness,
			assessAiSetup([], { isLocalVendor }).readiness,
		], ['ready', 'needs-copilot', 'no-models']);
	});

	test('lists vendors with model counts, kind, disabled state and cooldowns', () => {
		const assessment = assessAiSetup(models('openai', 'copilot', 'ollama', 'openai'), {
			isLocalVendor,
			disabledVendors: new Set(['openai']),
			cooldownUntil: vendor => vendor === 'copilot' ? 1_000 : undefined,
		});
		assert.deepEqual(assessment, {
			readiness: 'ready',
			vendors: [
				{ vendor: 'copilot', kind: 'copilot', models: 1, disabled: false, cooldownUntil: 1_000 },
				{ vendor: 'ollama', kind: 'local', models: 1, disabled: false },
				{ vendor: 'openai', kind: 'byok', models: 2, disabled: true },
			],
		});
	});
});
