/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: npm test (node --test, TypeScript type stripping; Node >= 22.18)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { appendBounded, AUDIT_SCHEMA_VERSION, buildAuditExport, readStoredRecords, toAuditRecord } from '../audit.ts';

const PROMPT = 'UNIQUE-PROMPT-MARKER please review function foo()';

describe('audit records (S2-11, contract section 9)', () => {
	test('copies whitelisted metadata only, even when the source carries content', () => {
		const source = {
			requestId: 'cgn-1',
			timestamp: 1_000,
			task: 'review',
			role: 'reviewer',
			privacy: { privacy: 'cloud', reasons: [] },
			outcome: 'fallback-success',
			servedBy: { vendor: 'openai', modelId: 'gpt-x' },
			attempts: [
				{ vendor: 'gemini', modelId: 'gemini-x', durationMs: 12, error: { kind: 'rate-limited', rule: 'rate-limit', fallbackEligible: true, message: `429 echoing ${PROMPT}` } },
				{ vendor: 'openai', modelId: 'gpt-x', durationMs: 34 },
			],
			excluded: [],
			inputTokens: 120,
			reason: 'openai served the request after gemini (rate-limited).',
			// Fields a careless caller might pass along; none may reach the record.
			messages: [PROMPT],
			response: 'model output text',
		};
		const record = toAuditRecord(source);
		assert.deepEqual(record, {
			requestId: 'cgn-1',
			timestamp: 1_000,
			task: 'review',
			role: 'reviewer',
			privacy: 'cloud',
			privacyReasons: [],
			outcome: 'fallback-success',
			servedBy: { vendor: 'openai', modelId: 'gpt-x' },
			attempts: [
				{ vendor: 'gemini', modelId: 'gemini-x', durationMs: 12, errorKind: 'rate-limited', errorRule: 'rate-limit' },
				{ vendor: 'openai', modelId: 'gpt-x', durationMs: 34 },
			],
			excluded: [],
			inputTokens: 120,
			reason: 'openai served the request after gemini (rate-limited).',
		});
		const serialized = JSON.stringify(buildAuditExport([record], 0));
		assert.ok(!serialized.includes('UNIQUE-PROMPT-MARKER') && !serialized.includes('model output text'));
	});

	test('the trail is bounded, oldest first out', () => {
		let records: number[] = [];
		for (let i = 1; i <= 5; i++) {
			records = appendBounded(records, i, 3);
		}
		assert.deepEqual(records, [3, 4, 5]);
	});

	test('exports and stored data carry the schema version', () => {
		assert.deepEqual(buildAuditExport([], Date.UTC(2026, 10, 3)), { schema: 'cognify.ai.routeAudit', version: AUDIT_SCHEMA_VERSION, exportedAt: '2026-11-03T00:00:00.000Z', records: [] });
		assert.deepEqual([
			readStoredRecords(undefined).length,
			readStoredRecords({ version: AUDIT_SCHEMA_VERSION + 1, records: [{}] }).length,
			readStoredRecords({ version: AUDIT_SCHEMA_VERSION, records: [{}, {}] }).length,
		], [0, 0, 2]);
	});
});
