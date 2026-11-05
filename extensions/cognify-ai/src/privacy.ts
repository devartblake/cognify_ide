/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Privacy gate (routing contract section 8). Pure: no `vscode` import, so it is
// unit tested with `node --test` and shared by the router.

/**
 * Where request context may be sent (contract section 2), from least to most
 * restrictive. The gate only ever moves a request towards `local-only`.
 */
export type CognifyPrivacyClass = 'cloud' | 'cloud-trusted' | 'local-only';

const PRIVACY_ORDER: readonly CognifyPrivacyClass[] = ['cloud', 'cloud-trusted', 'local-only'];

/** The most restrictive of the given classes. A privacy class is never relaxed (contract section 8). */
export function strictestPrivacy(...classes: readonly (CognifyPrivacyClass | undefined)[]): CognifyPrivacyClass {
	return classes.reduce<CognifyPrivacyClass>((strictest, next) => next && PRIVACY_ORDER.indexOf(next) > PRIVACY_ORDER.indexOf(strictest) ? next : strictest, 'cloud');
}

/**
 * Vendors whose models run on this machine. `customendpoint` and other
 * OpenAI-compatible vendors are not listed: their endpoint may be remote and
 * the router cannot see it, so they are treated as cloud.
 */
const LOCAL_VENDORS: ReadonlySet<string> = new Set(['ollama']);

export function isLocalVendor(vendor: string): boolean {
	return LOCAL_VENDORS.has(vendor);
}

/**
 * Whether a vendor may receive context of the given class: `local-only` allows
 * local vendors; `cloud-trusted` allows local vendors and those the user
 * trusts; `cloud` allows any vendor.
 */
export function vendorAllowed(vendor: string, privacy: CognifyPrivacyClass, trustedVendors: ReadonlySet<string>): boolean {
	switch (privacy) {
		case 'local-only': return isLocalVendor(vendor);
		case 'cloud-trusted': return isLocalVendor(vendor) || trustedVendors.has(vendor);
		case 'cloud': return true;
	}
}

interface SecretDetector {
	readonly id: string;
	readonly pattern: RegExp;
}

/**
 * Credential patterns. Specific token formats first; the generic assignment
 * rules only match quoted literals or `.env`-style lines, so ordinary code
 * such as `const token = getToken()` does not trigger them.
 */
const SECRET_DETECTORS: readonly SecretDetector[] = [
	{ id: 'private-key', pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
	{ id: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
	{ id: 'openai-key', pattern: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/ },
	{ id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ id: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
	{ id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
	{ id: 'slack-token', pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
	{ id: 'stripe-key', pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}/ },
	{ id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
	{ id: 'connection-string-password', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?<password>[^\s:/@]{6,})@/i },
	{ id: 'quoted-secret-assignment', pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["'](?<value>[^"'\s]{8,})["']/i },
	{ id: 'env-secret', pattern: /^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*(?<value>[^\s#'"]{8,})/m },
];

/** Values that look like placeholders, not real credentials. */
const PLACEHOLDER = /^(?:x{4,}|\*{4,}|\.{3,}|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|(?:your|my|example|sample|dummy|placeholder|changeme|redacted)[\w-]*|process\.env\.\w+)$/i;

/** Files whose content is sensitive regardless of what it contains. */
const SENSITIVE_PATH = /(?:^|[\\/])(?:\.env(?:\.[\w-]+)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|id_(?:rsa|dsa|ecdsa|ed25519)|credentials(?:\.json)?|secrets?\.(?:json|ya?ml|toml))$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;

/** One detector that matched, with how often. Never includes the matched text. */
export interface SecretFinding {
	readonly detector: string;
	readonly count: number;
}

/** Scan text for credentials. Returns detector ids and counts only. */
export function detectSecrets(text: string): SecretFinding[] {
	const findings: SecretFinding[] = [];
	for (const detector of SECRET_DETECTORS) {
		const global = new RegExp(detector.pattern.source, detector.pattern.flags.includes('g') ? detector.pattern.flags : `${detector.pattern.flags}g`);
		let count = 0;
		for (const match of text.matchAll(global)) {
			const value = match.groups?.value ?? match.groups?.password;
			if (value === undefined || !PLACEHOLDER.test(value)) {
				count++;
			}
		}
		if (count > 0) {
			findings.push({ detector: detector.id, count });
		}
	}
	return findings;
}

/**
 * Replace credentials in text with `[redacted]`, using the same detectors as
 * `detectSecrets`. Placeholders (`$TOKEN`, `<your-key>`, `${{ secrets.X }}`) are kept.
 */
export function redactSecrets(text: string): string {
	let result = text;
	for (const detector of SECRET_DETECTORS) {
		const global = new RegExp(detector.pattern.source, detector.pattern.flags.includes('g') ? detector.pattern.flags : `${detector.pattern.flags}g`);
		result = result.replace(global, (...args) => {
			const match = args[0] as string;
			const groups = args.at(-1) as { value?: string; password?: string } | undefined;
			const value = typeof groups === 'object' ? groups?.value ?? groups?.password : undefined;
			if (value === undefined) {
				return '[redacted]';
			}
			return PLACEHOLDER.test(value) ? match : match.replace(value, '[redacted]');
		});
	}
	return result;
}

export function isSensitivePath(path: string): boolean {
	return SENSITIVE_PATH.test(path);
}

export interface PrivacyInput {
	/** Text that would leave the machine (prompt, attached content). */
	readonly texts: readonly string[];
	/** Workspace-relative paths of attached files. */
	readonly paths?: readonly string[];
	/** A class the caller requires; the gate can only make it stricter. */
	readonly requested?: CognifyPrivacyClass;
	/** `cognify.privacy.localOnly`. */
	readonly localOnlySetting?: boolean;
	/** `cognify.privacy.confidentialWorkspace`. */
	readonly confidentialWorkspace?: boolean;
}

export interface PrivacyAssessment {
	readonly privacy: CognifyPrivacyClass;
	/** Why the class is stricter than `cloud`; safe to show and log (no secret values or file contents). */
	readonly reasons: readonly string[];
	readonly secrets: readonly SecretFinding[];
	readonly sensitivePaths: readonly string[];
}

/**
 * Assign a privacy class (contract section 8): `local-only` when a setting
 * demands it or the context contains credentials or sensitive files;
 * `cloud-trusted` for confidential workspaces; otherwise `cloud`. Never less
 * restrictive than `input.requested`.
 */
export function assessPrivacy(input: PrivacyInput): PrivacyAssessment {
	const reasons: string[] = [];
	const classes: CognifyPrivacyClass[] = [input.requested ?? 'cloud'];
	if (input.requested && input.requested !== 'cloud') {
		reasons.push(`the request requires ${input.requested}`);
	}
	if (input.localOnlySetting) {
		classes.push('local-only');
		reasons.push('cognify.privacy.localOnly is on');
	}
	const merged = new Map<string, number>();
	for (const text of input.texts) {
		for (const finding of detectSecrets(text)) {
			merged.set(finding.detector, (merged.get(finding.detector) ?? 0) + finding.count);
		}
	}
	const secrets = [...merged].map(([detector, count]) => ({ detector, count }));
	if (secrets.length > 0) {
		classes.push('local-only');
		reasons.push(`the context contains credentials (${secrets.map(s => s.detector).join(', ')})`);
	}
	const sensitivePaths = (input.paths ?? []).filter(isSensitivePath);
	if (sensitivePaths.length > 0) {
		classes.push('local-only');
		reasons.push(`sensitive files are attached (${sensitivePaths.join(', ')})`);
	}
	if (input.confidentialWorkspace) {
		classes.push('cloud-trusted');
		reasons.push('the workspace is marked confidential');
	}
	return { privacy: strictestPrivacy(...classes), reasons, secrets, sensitivePaths };
}
