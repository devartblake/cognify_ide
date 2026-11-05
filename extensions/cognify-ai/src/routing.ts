/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ProjectModelService } from './projectModelService';
import { CandidateSelection, CapabilityRequirements, CognifyCostTier, CognifyTask, cooldownFor, COST_TIERS, ModelCapabilities, ModelCandidate, routeWithFallback, RouteResult, selectCandidates } from './router';
import type { AiSetupAssessment } from './setup';
import type { EnvironmentReport } from './environmentCommands';
import type { EnvironmentRunners } from './environmentTasks';
import type { NewProjectResult, NewProjectUi } from './environments/newProject';
import type { ProcessRunner } from './environments/runtimes';
import { appendBounded, AUDIT_SCHEMA_VERSION, AuditExport, buildAuditExport, CognifyRouteAuditRecord, readStoredRecords, toAuditRecord, withToolCalls } from './audit';
import { assessPrivacy, CognifyPrivacyClass, PrivacyAssessment, vendorAllowed } from './privacy';

/** Storage key for vendor cooldowns (routing contract section 4). Bump the version on shape changes. */
const COOLDOWN_STORAGE_KEY = 'cognify.ai.cooldowns.v1';

/** Persisted health of one vendor. */
interface VendorHealth {
	/** Epoch ms until which the vendor is demoted. */
	readonly until: number;
	/** Consecutive cooled-down failures, for backoff. Reset by a success. */
	readonly failures: number;
}

/** Where cooldowns are kept; `ExtensionContext.globalState` in the product, so they survive a reload. */
export type CooldownStore = Pick<vscode.Memento, 'get' | 'update'>;

/** Default budget for a provider to accept a request (first fragment), across fallbacks. */
const DEFAULT_DEADLINE_MS = 60_000;
/** Budget for one model's pre-flight token count before falling back to an estimate. */
const TOKEN_COUNT_TIMEOUT_MS = 2_000;

/** User routing preferences (`cognify.ai.*` settings, contract section 6). */
export interface CognifyRoutingSettings {
	readonly preferredVendor?: string;
	readonly pinnedModel?: string;
	readonly fallbackWhenPinned: boolean;
	readonly disabledVendors: ReadonlySet<string>;
	/** Vendors allowed to receive `cloud-trusted` context; enforced by the privacy gate (S2-09). */
	readonly trustedVendors: ReadonlySet<string>;
	readonly maxCostTier?: CognifyCostTier;
}

/**
 * Read the routing settings. Called on every request, so changes apply to the
 * next request without a reload. Malformed values are ignored.
 */
export function readRoutingSettings(configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('cognify.ai')): CognifyRoutingSettings {
	const text = (key: string) => {
		const value = configuration.get<unknown>(key);
		return typeof value === 'string' && value.trim() ? value.trim() : undefined;
	};
	const vendors = (key: string) => {
		const value = configuration.get<unknown>(key);
		return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim()) : []);
	};
	const maxCostTier = text('maxCostTier');
	return {
		preferredVendor: text('preferredVendor'),
		pinnedModel: text('pinnedModel'),
		fallbackWhenPinned: configuration.get<unknown>('fallbackWhenPinned') === true,
		disabledVendors: vendors('disabledVendors'),
		trustedVendors: vendors('trustedVendors'),
		maxCostTier: COST_TIERS.find(tier => tier === maxCostTier),
	};
}

/** `cognify.privacy.*` settings (routing contract section 8). */
export interface CognifyPrivacySettings {
	readonly localOnly: boolean;
	readonly confidentialWorkspace: boolean;
}

/**
 * Read the privacy settings. Each is on if it is on at any level (user,
 * workspace or folder): a more specific level can tighten privacy but never
 * switch off what another level switched on.
 */
export function readPrivacySettings(configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('cognify.privacy')): CognifyPrivacySettings {
	const anyLevel = (key: string) => {
		const inspected = configuration.inspect<unknown>(key);
		return [inspected?.globalValue, inspected?.workspaceValue, inspected?.workspaceFolderValue].some(value => value === true);
	};
	return { localOnly: anyLevel('localOnly'), confidentialWorkspace: anyLevel('confidentialWorkspace') };
}

/** The vendor id of Cognify's own role models (`modelProvider.ts`). The router never routes to it. */
export const COGNIFY_VENDOR = 'cognify';

export interface CognifyRouteRequest {
	readonly task: CognifyTask;
	readonly messages: readonly vscode.LanguageModelChatMessage[];
	readonly justification: string;
	/** Overrides `cognify.ai.preferredVendor` for this request. */
	readonly preferredVendor?: string;
	readonly requirements?: CapabilityRequirements;
	/** Exact model id to use (contract section 6, step 3). Overrides `cognify.ai.pinnedModel`. */
	readonly pinnedModelId?: string;
	/** Fall back to the ranked route if the pinned model fails. Overrides `cognify.ai.fallbackWhenPinned`. */
	readonly fallbackWhenPinned?: boolean;
	/** Correlates the audit record with the caller's own logs. Generated when absent. */
	readonly requestId?: string;
	/** The Cognify role making the request, for the audit record. */
	readonly role?: string;
	/** A privacy class the caller requires. The privacy gate can only make it stricter. */
	readonly privacy?: CognifyPrivacyClass;
	/** Workspace-relative paths of attached files, checked for sensitive files (`.env`, keys). */
	readonly contextPaths?: readonly string[];
	/** Overall budget for a provider to accept the request. Default 60 s. */
	readonly deadlineMs?: number;
	/** Tools the model may call (agent mode). When present, only tool-calling models are candidates. */
	readonly tools?: readonly vscode.LanguageModelChatTool[];
	readonly toolMode?: vscode.LanguageModelChatToolMode;
	/** Passed through to the chosen model unchanged. */
	readonly modelOptions?: { readonly [name: string]: unknown };
}

/**
 * A model response whose first fragment has already arrived. `vscode.lm`
 * providers report most failures while streaming rather than by rejecting
 * `sendRequest`, so a response only counts as accepted once its first fragment
 * (or a clean end) is received. Fallback is possible up to that point and never
 * after it (routing contract section 6, step 7).
 */
export interface CognifyModelResponse {
	/**
	 * Every response part (text and tool calls) in order. `text` is the same
	 * stream filtered to text; both read one underlying stream, so consume only one.
	 */
	readonly parts: AsyncIterable<vscode.LanguageModelResponsePart>;
	readonly text: AsyncIterable<string>;
}

/** A `vscode.lm` model plus the router's view of it. */
export interface RoutedModel extends ModelCandidate {
	readonly chat: vscode.LanguageModelChat;
}

export interface CognifyRouteResponse {
	readonly route: RouteResult<CognifyModelResponse>;
	/** Ranked candidates the route was attempted against, and the models excluded (with reasons). */
	readonly selection: CandidateSelection<RoutedModel>;
	/** Pre-flight input size per model id (provider tokenizer, or an estimate when counting failed). */
	readonly inputTokens: ReadonlyMap<string, number>;
	/** The settings this route was computed with. */
	readonly settings: CognifyRoutingSettings;
	/** The privacy gate's decision: class, reasons and detector ids (never secret values). */
	readonly privacy: PrivacyAssessment;
	/** The metadata-only record written to the audit trail for this request. */
	readonly audit: CognifyRouteAuditRecord;
}

/**
 * Routes a Cognify task to a `vscode.lm` model following the routing contract
 * (section 6): discover, pin, capability filter, per-model context check with the
 * provider's own tokenizer, health demotion, rank, try with fallback within a
 * deadline, and remember provider cooldowns. Shared by the `@cognify` chat
 * participant and the extension's public API (used by integration tests).
 */
export class CognifyRouter {
	private readonly health: Map<string, VendorHealth>;

	/** Metadata-only record of every routed request (contract section 9). */
	readonly audit: CognifyAuditTrail;

	constructor(private readonly store?: CooldownStore, auditStore?: CooldownStore) {
		this.health = new Map(Object.entries(readHealth(store)));
		this.audit = new CognifyAuditTrail(auditStore);
	}

	/** Vendors currently cooling down (exposed for diagnostics and tests). */
	coolingDownVendors(now = Date.now()): ReadonlySet<string> {
		return new Set([...this.health].filter(([, health]) => health.until > now).map(([vendor]) => vendor));
	}

	/** Epoch ms until which a vendor is cooling down, if it is. */
	cooldownUntil(vendor: string, now = Date.now()): number | undefined {
		const until = this.health.get(vendor)?.until;
		return until !== undefined && until > now ? until : undefined;
	}

	/** Forget all cooldowns and failure counts. */
	async resetCooldowns(): Promise<void> {
		this.health.clear();
		await this.persist();
	}

	async route(request: CognifyRouteRequest, token: vscode.CancellationToken): Promise<CognifyRouteResponse> {
		const requestId = request.requestId ?? createRequestId();
		const startedAt = Date.now();
		const settings = readRoutingSettings();
		const privacySettings = readPrivacySettings();
		// Privacy gate (contract section 8): runs before any provider is contacted.
		const privacy = assessPrivacy({
			texts: messageTexts(request.messages),
			paths: request.contextPaths,
			requested: request.privacy,
			localOnlySetting: privacySettings.localOnly,
			confidentialWorkspace: privacySettings.confidentialWorkspace,
		});
		// Never route to Cognify's own models (S3-03): that would loop back into this router.
		const models = (await vscode.lm.selectChatModels()).filter(model => model.vendor !== COGNIFY_VENDOR).map(toRoutedModel);
		const blockedVendors = new Map(models
			.filter(model => !vendorAllowed(model.vendor, privacy.privacy, settings.trustedVendors))
			.map(model => [model.vendor, `privacy: ${privacy.privacy} context cannot be sent to this vendor`] as const));
		// Blocked and disabled vendors never see the request, not even a token count
		// (counting can call the provider's API).
		const inputTokens = await countInputTokens(models.filter(model => !blockedVendors.has(model.vendor) && !settings.disabledVendors.has(model.vendor)), request.messages, token);
		const selection = selectCandidates(models, request.task, {
			blockedVendors,
			preferredVendor: request.preferredVendor ?? settings.preferredVendor,
			coolingDown: this.coolingDownVendors(),
			requirements: request.tools?.length ? { ...request.requirements, toolCalling: true } : request.requirements,
			pinnedModelId: request.pinnedModelId ?? settings.pinnedModel,
			fallbackWhenPinned: request.fallbackWhenPinned ?? settings.fallbackWhenPinned,
			inputTokensByModel: inputTokens,
			disabledVendors: settings.disabledVendors,
			maxCostTier: settings.maxCostTier,
		});

		if (selection.route.length === 0 && blockedVendors.size > 0) {
			// Never relax privacy to find a provider (contract section 8, scenario 4).
			const route: RouteResult<CognifyModelResponse> = {
				outcome: 'failed',
				attempts: [],
				blocked: 'privacy',
				reason: `Blocked by the privacy gate: this request is ${privacy.privacy} because ${privacy.reasons.join('; ')}, and no allowed model is available. ${privacy.privacy === 'local-only' ? 'Install a local model provider (for example Ollama), or remove the sensitive content.' : 'Add a vendor to cognify.ai.trustedVendors, or use a local model.'}`,
			};
			const audit = await this.audit.record({ requestId, timestamp: startedAt, task: request.task, role: request.role, privacy, outcome: route.outcome, attempts: route.attempts, excluded: selection.excluded, reason: route.reason });
			return { route, selection, inputTokens, settings, privacy, audit };
		}

		const route = await routeWithFallback(
			selection.route,
			async (model, signal) => {
				// Each attempt gets its own cancellation, tied to the caller's token and to the
				// routing deadline, so a timed-out provider request is actually cancelled.
				const attemptSource = new vscode.CancellationTokenSource();
				const onAbort = () => attemptSource.cancel();
				signal.addEventListener('abort', onAbort);
				const callerCancellation = token.onCancellationRequested(() => attemptSource.cancel());
				try {
					const options: vscode.LanguageModelChatRequestOptions = {
						justification: request.justification,
						tools: request.tools?.length ? [...request.tools] : undefined,
						toolMode: request.tools?.length ? request.toolMode : undefined,
						modelOptions: request.modelOptions,
					};
					return await primeResponse(await model.chat.sendRequest([...request.messages], options, attemptSource.token));
				} finally {
					signal.removeEventListener('abort', onAbort);
					callerCancellation.dispose();
					attemptSource.dispose();
				}
			},
			{ isCancelled: () => token.isCancellationRequested, deadlineMs: request.deadlineMs ?? DEFAULT_DEADLINE_MS },
		);

		await this.recordHealth(route);
		const servedTokens = route.servedBy ? inputTokens.get(route.servedBy.modelId) : undefined;
		const audit = await this.audit.record({ requestId, timestamp: startedAt, task: request.task, role: request.role, privacy, outcome: route.outcome, servedBy: route.servedBy, attempts: route.attempts, excluded: selection.excluded, inputTokens: servedTokens, reason: route.reason, toolsOffered: request.tools?.length });
		// With tools offered, note which ones the model calls as the response streams (names only).
		const tracked = route.value && request.tools?.length
			? { ...route, value: trackToolCalls(route.value, names => this.audit.recordToolCalls(requestId, names)) }
			: route;
		return { route: tracked, selection, inputTokens, settings, privacy, audit };
	}

	/**
	 * Update vendor health from a route: cool down vendors whose errors call for
	 * it (provider retry hint, else the kind's base, with backoff for repeated
	 * `unavailable`), and clear the failure count of a vendor that served.
	 */
	private async recordHealth(route: RouteResult<CognifyModelResponse>): Promise<void> {
		const now = Date.now();
		let changed = false;
		for (const attempt of route.attempts) {
			const previous = this.health.get(attempt.vendor);
			if (!attempt.error) {
				if (previous) {
					this.health.delete(attempt.vendor);
					changed = true;
				}
				continue;
			}
			const failures = (previous && previous.until > now - RESET_FAILURES_AFTER_MS ? previous.failures : 0) + 1;
			const cooldown = cooldownFor(attempt.error, failures);
			if (cooldown !== undefined) {
				this.health.set(attempt.vendor, { until: now + cooldown, failures });
				changed = true;
			}
		}
		if (changed) {
			await this.persist();
		}
	}

	private async persist(): Promise<void> {
		const now = Date.now();
		const live = Object.fromEntries([...this.health].filter(([, health]) => health.until > now - RESET_FAILURES_AFTER_MS));
		try {
			await this.store?.update(COOLDOWN_STORAGE_KEY, live);
		} catch {
			// Cooldowns are an optimization; never fail a route because they could not be saved.
		}
	}
}

/** Workspace storage key for the audit trail. */
const AUDIT_STORAGE_KEY = 'cognify.ai.audit';

/**
 * Bounded, metadata-only audit trail kept in workspace storage (contract
 * section 9). Records are built by `toAuditRecord`, which copies whitelisted
 * fields only.
 */
export class CognifyAuditTrail {
	private records: CognifyRouteAuditRecord[];

	constructor(private readonly store?: CooldownStore) {
		this.records = readStoredRecords(store?.get<unknown>(AUDIT_STORAGE_KEY));
	}

	all(): readonly CognifyRouteAuditRecord[] {
		return this.records;
	}

	async record(source: Parameters<typeof toAuditRecord>[0]): Promise<CognifyRouteAuditRecord> {
		const record = toAuditRecord(source);
		this.records = appendBounded(this.records, record);
		await this.persist();
		return record;
	}

	/** Add the names of the tools a response called (never their arguments or results). */
	async recordToolCalls(requestId: string, names: readonly string[]): Promise<void> {
		const index = this.records.findIndex(record => record.requestId === requestId);
		if (index !== -1) {
			this.records = this.records.with(index, withToolCalls(this.records[index], names));
			await this.persist();
		}
	}

	/** Update the outcome of a recorded request, e.g. when its stream fails after it was accepted. */
	async amend(requestId: string, change: { readonly outcome: string; readonly reason: string }): Promise<void> {
		const index = this.records.findIndex(record => record.requestId === requestId);
		if (index !== -1) {
			this.records = this.records.with(index, { ...this.records[index], outcome: change.outcome, reason: change.reason });
			await this.persist();
		}
	}

	async clear(): Promise<void> {
		this.records = [];
		await this.persist();
	}

	export(now = Date.now()): AuditExport {
		return buildAuditExport(this.records, now);
	}

	private async persist(): Promise<void> {
		try {
			await this.store?.update(AUDIT_STORAGE_KEY, { version: AUDIT_SCHEMA_VERSION, records: this.records });
		} catch {
			// The audit trail is diagnostic; never fail a route because it could not be saved.
		}
	}
}

export function createRequestId(): string {
	return `cgn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A vendor that has been healthy this long after its last cooldown starts its backoff over. */
const RESET_FAILURES_AFTER_MS = 30 * 60_000;

function readHealth(store: CooldownStore | undefined): Record<string, VendorHealth> {
	const stored = store?.get<unknown>(COOLDOWN_STORAGE_KEY);
	if (!stored || typeof stored !== 'object') {
		return {};
	}
	const result: Record<string, VendorHealth> = {};
	for (const [vendor, value] of Object.entries(stored)) {
		const health = value as Partial<VendorHealth> | undefined;
		if (typeof health?.until === 'number' && typeof health.failures === 'number') {
			result[vendor] = { until: health.until, failures: health.failures };
		}
	}
	return result;
}

function toRoutedModel(chat: vscode.LanguageModelChat): RoutedModel {
	return { vendor: chat.vendor, id: chat.id, name: chat.name, family: chat.family, maxInputTokens: chat.maxInputTokens, capabilities: readCapabilities(chat), chat };
}

/**
 * Capabilities come from the `languageModelCapabilities` proposed API. Treat any
 * failure to read them as "unknown" (ranked lower, never excluded).
 */
function readCapabilities(chat: vscode.LanguageModelChat): ModelCapabilities | undefined {
	try {
		const capabilities = chat.capabilities;
		return capabilities ? { toolCalling: capabilities.supportsToolCalling, vision: capabilities.supportsImageToText } : undefined;
	} catch {
		return undefined;
	}
}

/** Text content of the messages: what the privacy gate scans and the token estimate counts. */
/**
 * The text the privacy gate scans: message text plus the text of tool results.
 * In agent mode, file contents arrive as tool results, so they must be checked too.
 */
function messageTexts(messages: readonly vscode.LanguageModelChatMessage[]): string[] {
	return messages.flatMap(message => message.content.flatMap(part => {
		if (part instanceof vscode.LanguageModelTextPart) {
			return [part.value];
		}
		if (part instanceof vscode.LanguageModelToolResultPart) {
			return part.content.flatMap(inner => inner instanceof vscode.LanguageModelTextPart ? [inner.value] : []);
		}
		return [];
	}));
}

function estimateTokens(messages: readonly vscode.LanguageModelChatMessage[]): number {
	return Math.ceil(messageTexts(messages).reduce((sum, text) => sum + text.length, 0) / 4);
}

/**
 * Count the request's input with each model's own tokenizer (vendors differ), in
 * parallel and time-boxed. Falls back to a characters/4 estimate per model.
 */
async function countInputTokens(models: readonly RoutedModel[], messages: readonly vscode.LanguageModelChatMessage[], token: vscode.CancellationToken): Promise<Map<string, number>> {
	const estimate = estimateTokens(messages);
	const counts = await Promise.all(models.map(async model => {
		try {
			const counted = Promise.all(messages.map(message => model.chat.countTokens(message, token))).then(parts => parts.reduce((sum, part) => sum + part, 0));
			const timeout = new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), TOKEN_COUNT_TIMEOUT_MS));
			const result = await Promise.race([counted, timeout]);
			return [model.id, typeof result === 'number' && Number.isFinite(result) ? result : estimate] as const;
		} catch {
			return [model.id, estimate] as const;
		}
	}));
	return new Map(counts);
}

/**
 * Wait for the first response part, text or tool call, so that errors raised
 * before any output reject here (and can fall back), then replay it ahead of the
 * rest of the stream. Once a part has arrived, including a tool call, the route
 * is committed (contract section 6, step 7).
 */
async function primeResponse(response: vscode.LanguageModelChatResponse): Promise<CognifyModelResponse> {
	const iterator = (response.stream as AsyncIterable<unknown>)[Symbol.asyncIterator]();
	let first = await iterator.next();
	while (!first.done && !isResponsePart(first.value)) {
		first = await iterator.next();
	}
	async function* parts(): AsyncIterable<vscode.LanguageModelResponsePart> {
		if (first.done) {
			return;
		}
		yield first.value as vscode.LanguageModelResponsePart;
		while (true) {
			const next = await iterator.next();
			if (next.done) {
				return;
			}
			if (isResponsePart(next.value)) {
				yield next.value;
			}
		}
	}
	const stream = parts();
	async function* text(): AsyncIterable<string> {
		for await (const part of stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				yield part.value;
			}
		}
	}
	return { parts: stream, text: text() };
}

/**
 * Pass a response through unchanged while collecting the names of the tools it
 * calls; report them once the stream ends, fails or is abandoned. Only
 * `LanguageModelToolCallPart.name` is read, never `input`.
 */
function trackToolCalls(response: CognifyModelResponse, report: (names: readonly string[]) => Promise<void>): CognifyModelResponse {
	async function* parts(): AsyncIterable<vscode.LanguageModelResponsePart> {
		const names: string[] = [];
		try {
			for await (const part of response.parts) {
				if (part instanceof vscode.LanguageModelToolCallPart) {
					names.push(part.name);
				}
				yield part;
			}
		} finally {
			if (names.length) {
				// The audit is best effort; a storage failure must not break the response.
				report(names).catch(() => undefined);
			}
		}
	}
	const stream = parts();
	async function* text(): AsyncIterable<string> {
		for await (const part of stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				yield part.value;
			}
		}
	}
	return { parts: stream, text: text() };
}

/** Parts a provider may stream that Cognify forwards; anything else (unknown future parts) is dropped. */
function isResponsePart(value: unknown): value is vscode.LanguageModelResponsePart {
	return value instanceof vscode.LanguageModelTextPart || value instanceof vscode.LanguageModelToolCallPart || value instanceof vscode.LanguageModelDataPart;
}

/** Public API returned from the extension's `activate`. */
export interface CognifyAiApi {
	readonly router: CognifyRouter;
	/** The Project Cognition model for the open workspace (S3-07). */
	readonly projectModel: ProjectModelService;
	/** The AI setup assessment behind `Cognify: Check AI Setup`, without UI. */
	checkSetup(): Promise<AiSetupAssessment>;
	/** The report behind `Cognify: Check Environment` (S4-06), without UI; the runner is injectable for tests. */
	checkEnvironment(run?: ProcessRunner): Promise<EnvironmentReport>;
	/** `Cognify: New Project…` (S4-05) with injected questions; it creates the project but doesn't open it. */
	createProject(ui: NewProjectUi, run?: ProcessRunner): Promise<NewProjectResult>;
	/** The `cognify` tasks of a project folder (S4-07); the CLI and Docker runners are injectable for tests. */
	projectTasks(folder: string, runners?: EnvironmentRunners): Promise<vscode.Task[]>;
}
