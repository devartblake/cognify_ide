/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: npm test (node --test, TypeScript type stripping; Node >= 22.18)
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { assessPrivacy, detectSecrets, isSensitivePath, strictestPrivacy, vendorAllowed } from '../privacy.ts';

// Fake credentials are assembled at runtime so no token-shaped literal is committed.
const fake = (prefix: string, length: number, alphabet = 'A1b2C3d4E5f6G7h8') => prefix + Array.from({ length }, (_, i) => alphabet[i % alphabet.length]).join('');
const OPENAI_KEY = fake('sk-', 40);
const ANTHROPIC_KEY = fake('sk-ant-', 40);
const GOOGLE_KEY = fake('AIza', 35);
const GITHUB_TOKEN = fake('ghp_', 36);
const AWS_KEY = fake('AKIA', 16, 'ABCDEFGHIJ0123456789');
const PRIVATE_KEY = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');

const detectors = (text: string) => detectSecrets(text).map(f => f.detector);

describe('secret detection (S2-09)', () => {
	test('detects common credential formats by detector id only', () => {
		assert.deepEqual([
			detectors(`const client = new OpenAI({ apiKey: "${OPENAI_KEY}" });`),
			detectors(`ANTHROPIC_API_KEY=${ANTHROPIC_KEY}`),
			detectors(`key: ${GOOGLE_KEY}`),
			detectors(`git clone https://${GITHUB_TOKEN}@github.com/x/y`),
			detectors(`aws_access_key_id = ${AWS_KEY}`),
			detectors(`${PRIVATE_KEY}\nMIIE...`),
			detectors('DATABASE_URL=postgres://app:s3cretPass@db:5432/app'),
			detectors('password = "hunter2hunter2"'),
		], [
			['openai-key', 'quoted-secret-assignment'],
			['anthropic-key', 'env-secret'],
			['google-api-key'],
			['github-token'],
			['aws-access-key'],
			['private-key'],
			['connection-string-password'],
			['quoted-secret-assignment'],
		]);
	});

	test('ordinary code and placeholders are not credentials', () => {
		assert.deepEqual([
			'const token = getToken();',
			'const apiKey = process.env.OPENAI_API_KEY;',
			'password = "<your-password>"',
			'API_KEY=${API_KEY}',
			'SECRET_TOKEN=changeme',
			'if (password.length < 8) { throw new Error("too short"); }',
			'const skipped = "sk-short";',
		].flatMap(detectors), []);
	});

	test('counts repeated matches and never returns the matched text', () => {
		const findings = detectSecrets(`a=${OPENAI_KEY}\nb=${OPENAI_KEY}`);
		assert.deepEqual(findings, [{ detector: 'openai-key', count: 2 }]);
		assert.ok(!JSON.stringify(findings).includes(OPENAI_KEY));
	});

	test('sensitive file paths', () => {
		assert.deepEqual(
			['.env', 'config/.env.local', 'certs/server.pem', '.ssh/id_ed25519', 'secrets.yaml', 'src/env.ts', 'docs/keys.md', 'src/environment.ts'].map(isSensitivePath),
			[true, true, true, true, true, false, false, false],
		);
	});
});

describe('privacy gate (contract section 8)', () => {
	test('assigns the class and explains why', () => {
		const summary = (input: Parameters<typeof assessPrivacy>[0]) => {
			const result = assessPrivacy(input);
			return [result.privacy, result.reasons.length];
		};
		assert.deepEqual([
			summary({ texts: ['review this function'] }),
			summary({ texts: ['review this function'], confidentialWorkspace: true }),
			summary({ texts: ['review this function'], localOnlySetting: true }),
			summary({ texts: [`const key = "${OPENAI_KEY}";`] }),
			summary({ texts: ['FOO=bar'], paths: ['.env'] }),
			summary({ texts: ['x'], requested: 'cloud-trusted' }),
		], [
			['cloud', 0],
			['cloud-trusted', 1],
			['local-only', 1],
			['local-only', 1],
			['local-only', 1],
			['cloud-trusted', 1],
		]);
	});

	test('a seeded key forces local-only and the reason names the detector, not the key', () => {
		const result = assessPrivacy({ texts: [`please review\nOPENAI_API_KEY=${OPENAI_KEY}`], confidentialWorkspace: true });
		assert.equal(result.privacy, 'local-only');
		assert.ok(result.reasons.some(reason => reason.includes('openai-key')));
		assert.ok(!JSON.stringify(result).includes(OPENAI_KEY));
	});

	test('the class is never relaxed', () => {
		assert.deepEqual([
			strictestPrivacy('local-only', 'cloud'),
			strictestPrivacy('cloud', 'cloud-trusted'),
			strictestPrivacy(undefined, 'cloud'),
			assessPrivacy({ texts: ['x'], requested: 'local-only', confidentialWorkspace: true }).privacy,
		], ['local-only', 'cloud-trusted', 'cloud', 'local-only']);
	});

	test('vendors allowed per class', () => {
		const trusted = new Set(['openai']);
		const allowed = (privacy: 'cloud' | 'cloud-trusted' | 'local-only') => ['ollama', 'openai', 'gemini', 'copilot', 'customendpoint'].filter(vendor => vendorAllowed(vendor, privacy, trusted));
		assert.deepEqual(
			{ cloud: allowed('cloud'), trusted: allowed('cloud-trusted'), local: allowed('local-only') },
			{ cloud: ['ollama', 'openai', 'gemini', 'copilot', 'customendpoint'], trusted: ['ollama', 'openai'], local: ['ollama'] },
		);
	});
});
