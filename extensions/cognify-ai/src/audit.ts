/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Routing audit records (routing contract section 9). Pure: no `vscode` import,
// so it is unit tested with `node --test`.

/** Bump when the record shape changes; exports carry it so readers can adapt. */
export const AUDIT_SCHEMA_VERSION = 1;
export const AUDIT_SCHEMA = 'cognify.ai.routeAudit';
/** Records kept per workspace; older ones are dropped first. */
export const AUDIT_MAX_RECORDS = 200;

/**
 * One routed request (contract section 9). Metadata only: no prompt text,
 * response text, file contents, provider error messages, or credentials.
 */
export interface CognifyRouteAuditRecord {
	readonly requestId: string;
	/** Epoch ms. */
	readonly timestamp: number;
	readonly task: string;
	readonly role?: string;
	readonly privacy: string;
	/** Why the privacy class is stricter than `cloud`: detector ids and file paths, never values. */
	readonly privacyReasons: readonly string[];
	readonly outcome: string;
	readonly servedBy?: { readonly vendor: string; readonly modelId: string };
	readonly attempts: readonly { readonly vendor: string; readonly modelId: string; readonly durationMs: number; readonly errorKind?: string; readonly errorRule?: string }[];
	readonly excluded: readonly { readonly vendor: string; readonly modelId: string; readonly reason: string }[];
	readonly inputTokens?: number;
	readonly reason: string;
	/** How many tools the request offered the model (agent mode). */
	readonly toolsOffered?: number;
	/** Names of the tools the model called, in order. Never their arguments or results. */
	readonly toolCalls?: readonly string[];
}

/** Tool calls kept per record. */
const MAX_TOOL_CALLS = 50;

/**
 * Add the names of the tools a response called. Names only: arguments and results
 * never reach the audit trail. Names are reduced to tool-name characters and capped.
 */
export function withToolCalls(record: CognifyRouteAuditRecord, names: readonly string[]): CognifyRouteAuditRecord {
	const clean = names.map(name => String(name).replace(/[^\w.\-/]/g, '').slice(0, 64)).filter(Boolean).slice(0, MAX_TOOL_CALLS);
	return { ...record, toolCalls: clean };
}

/** What the router knows about a route; `toAuditRecord` keeps only whitelisted fields. */
export interface AuditSource {
	readonly requestId: string;
	readonly timestamp: number;
	readonly task: string;
	readonly role?: string;
	readonly privacy: { readonly privacy: string; readonly reasons: readonly string[] };
	readonly outcome: string;
	readonly servedBy?: { readonly vendor: string; readonly modelId: string };
	readonly attempts: readonly { readonly vendor: string; readonly modelId: string; readonly durationMs: number; readonly error?: { readonly kind: string; readonly rule: string } }[];
	readonly excluded: readonly { readonly vendor: string; readonly modelId: string; readonly reason: string }[];
	readonly inputTokens?: number;
	readonly reason: string;
	readonly toolsOffered?: number;
}

/**
 * Build an audit record by copying named fields only, so nothing else a
 * caller passes (messages, response streams, error messages) can reach storage.
 */
export function toAuditRecord(source: AuditSource): CognifyRouteAuditRecord {
	return {
		requestId: source.requestId,
		timestamp: source.timestamp,
		task: source.task,
		...(source.role !== undefined ? { role: source.role } : {}),
		privacy: source.privacy.privacy,
		privacyReasons: [...source.privacy.reasons],
		outcome: source.outcome,
		...(source.servedBy ? { servedBy: { vendor: source.servedBy.vendor, modelId: source.servedBy.modelId } } : {}),
		attempts: source.attempts.map(attempt => ({
			vendor: attempt.vendor,
			modelId: attempt.modelId,
			durationMs: attempt.durationMs,
			...(attempt.error ? { errorKind: attempt.error.kind, errorRule: attempt.error.rule } : {}),
		})),
		excluded: source.excluded.map(entry => ({ vendor: entry.vendor, modelId: entry.modelId, reason: entry.reason })),
		...(source.inputTokens !== undefined ? { inputTokens: source.inputTokens } : {}),
		reason: source.reason,
		...(source.toolsOffered ? { toolsOffered: source.toolsOffered } : {}),
	};
}

/** Append a record, keeping at most `max` (oldest dropped first). */
export function appendBounded<T>(records: readonly T[], record: T, max = AUDIT_MAX_RECORDS): T[] {
	return [...records, record].slice(-max);
}

export interface AuditExport {
	readonly schema: typeof AUDIT_SCHEMA;
	readonly version: number;
	readonly exportedAt: string;
	readonly records: readonly CognifyRouteAuditRecord[];
}

export function buildAuditExport(records: readonly CognifyRouteAuditRecord[], now = Date.now()): AuditExport {
	return { schema: AUDIT_SCHEMA, version: AUDIT_SCHEMA_VERSION, exportedAt: new Date(now).toISOString(), records };
}

/** Records read back from storage; anything that is not a record array (or another schema version) is discarded. */
export function readStoredRecords(stored: unknown): CognifyRouteAuditRecord[] {
	if (!stored || typeof stored !== 'object') {
		return [];
	}
	const value = stored as { version?: unknown; records?: unknown };
	return value.version === AUDIT_SCHEMA_VERSION && Array.isArray(value.records) ? value.records as CognifyRouteAuditRecord[] : [];
}
