# AI Provider Routing Contract

- **Issue:** #7 (Sprint 1, P0)
- **Decision record:** [ADR-0001](ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md)
- **Implementation target:** Sprint 2, Cognify-owned built-in extension (proposed `extensions/cognify-ai`)
- **Status:** Contract defined; not yet implemented

This document defines the provider capability model, the normalized request/result/error envelope, the routing inputs and MVP policy, the provider role map, the fallback strategy, and the audit and privacy rules. The TypeScript below is the normative shape for the Sprint 2 implementation. It describes Cognify-level types layered on `vscode.lm`; it does not replace any VS Code API.

## 1. Terminology

| Term | Meaning |
|---|---|
| Vendor | A `vscode.lm` vendor id (`copilot`, `openai`, `gemini`, `anthropic`, `ollama`, `customendpoint`, …). |
| Model | A `vscode.LanguageModelChat` returned by `vscode.lm.selectChatModels`. |
| Provider profile | Cognify's static and learned knowledge about a vendor: role strengths, privacy class, cost tier, and health state. |
| Task | What the caller is trying to do (section 3). |
| Route | The ordered list of candidate models the router will try for one request. |

## 2. Provider Capability Model

```ts
/** What a model must support for a task. Derived from vscode.lm metadata where available. */
interface CognifyCapabilityRequirements {
	readonly toolCalling?: boolean;        // ILanguageModelChatMetadata.capabilities.toolCalling
	readonly vision?: boolean;             // capabilities.vision
	readonly agentMode?: boolean;          // capabilities.agentMode
	readonly minInputTokens?: number;      // compared with maxInputTokens
	readonly minOutputTokens?: number;     // compared with maxOutputTokens
	readonly structuredOutput?: boolean;   // JSON/schema adherence (static vendor profile for MVP)
}

type CognifyPrivacyClass =
	| 'cloud'        // may leave the machine to any enabled vendor
	| 'cloud-trusted'// only to vendors the user/org marked trusted
	| 'local-only';  // only to on-device vendors (ollama, customendpoint on localhost)

type CognifyCostTier = 'free' | 'included' | 'metered' | 'premium';

interface CognifyProviderProfile {
	readonly vendor: string;                       // vscode.lm vendor id
	readonly displayName: string;                  // "GPT (OpenAI)", "Gemini", "Copilot", "Local"
	readonly roles: readonly CognifyProviderRole[];// section 5, ordered by preference
	readonly privacy: 'cloud' | 'local';           // where inference runs
	readonly trusted: boolean;                     // user/org setting
	readonly costTier: CognifyCostTier;            // static default, refined by pricing metadata when present
	readonly typicalLatency: 'low' | 'medium' | 'high'; // static default; refined from observed p50 later
}
```

Capability values come from `ILanguageModelChatMetadata` (exposed to extensions through stable fields plus the proposed `languageModelCapabilities`/`languageModelPricing` APIs). Missing metadata is treated as **unknown**. A requirement marked `true` excludes a model only when its metadata explicitly says `false`. Unknown values are allowed but ranked lower.

## 3. Task Taxonomy

```ts
type CognifyTask =
	| 'architecture'      // design, ADRs, cross-cutting reasoning
	| 'requirements'      // specs, acceptance criteria
	| 'analysis'          // complex code/problem analysis, cross-file reasoning
	| 'edit'              // localized in-editor change
	| 'implement'         // multi-step implementation within a repo
	| 'test'              // write/repair tests
	| 'refactor'
	| 'review'            // independent review of a change or design
	| 'config'            // structured/configuration assistance
	| 'explain'           // tutor-style explanation (#8 Tutor role)
	| 'chat';             // general conversation
```

Roles from #8 (Planner, Coder, Reviewer, Tester, DevOps, Tutor) map to tasks. The router never sees role names directly: Planner covers `architecture`/`requirements`, Coder `edit`/`implement`/`refactor`, Reviewer `review`, Tester `test`, DevOps `config`, and Tutor `explain`.

## 4. Normalized Request, Result, and Error

```ts
interface CognifyRouteRequest {
	readonly requestId: string;                    // uuid, for audit correlation
	readonly task: CognifyTask;
	readonly role?: string;                        // #8 role, informational
	readonly requirements?: CognifyCapabilityRequirements;
	readonly privacy: CognifyPrivacyClass;         // from the privacy gate (section 8), never defaulted by callers to 'cloud' when context contains secrets
	readonly preference?: {
		readonly vendor?: string;                  // user override, e.g. "gemini"
		readonly modelId?: string;                 // exact model pin (wins over everything except privacy)
		readonly maxCostTier?: CognifyCostTier;
	};
	readonly messages: readonly vscode.LanguageModelChatMessage[];
	readonly options?: vscode.LanguageModelChatRequestOptions; // tools, justification, modelOptions
	readonly deadlineMs?: number;                  // total budget across fallbacks
}

type CognifyRouteOutcome = 'success' | 'fallback-success' | 'failed' | 'cancelled';

interface CognifyAttempt {
	readonly vendor: string;
	readonly modelId: string;
	readonly startedAt: number;
	readonly durationMs: number;
	readonly error?: CognifyProviderError;         // absent on success
}

interface CognifyRouteResult {
	readonly requestId: string;
	readonly outcome: CognifyRouteOutcome;
	readonly stream?: AsyncIterable<vscode.LanguageModelResponsePart>; // passthrough of the winning model's response
	readonly servedBy?: { readonly vendor: string; readonly modelId: string };
	readonly attempts: readonly CognifyAttempt[];  // full chain, in order
	readonly reason: string;                       // human-readable routing explanation (shown in UI on request)
}

type CognifyErrorKind =
	| 'quota-exhausted'   // plan/credit limit; cooldown until reset or for 1h default
	| 'rate-limited'      // transient throttling; honor retry-after, short cooldown
	| 'auth'              // missing/invalid key or sign-in (LanguageModelError.NoPermissions)
	| 'policy-blocked'    // org policy / content filter (LanguageModelError.Blocked)
	| 'not-found'         // model/vendor gone (LanguageModelError.NotFound)
	| 'unavailable'       // network error, 5xx, timeout
	| 'context-too-large' // input exceeds model limits
	| 'invalid-request'   // malformed request, unsupported option
	| 'cancelled'
	| 'unknown';

interface CognifyProviderError {
	readonly kind: CognifyErrorKind;
	readonly vendor: string;
	readonly modelId?: string;
	readonly retryAfterMs?: number;
	readonly fallbackEligible: boolean;            // see table below
	readonly message: string;                      // sanitized: never includes prompt text or credentials
	readonly cause?: { readonly code?: string; readonly status?: number };
}
```

### Error normalization

| Source signal | `kind` | Fallback eligible | Provider cooldown |
|---|---|---|---|
| `LanguageModelError.NoPermissions` | `auth` | Yes | Until the user re-authenticates (no auto-retry) |
| `LanguageModelError.Blocked` | `policy-blocked` | **No** for content filters; Yes for org policy disabling the vendor | None |
| `LanguageModelError.NotFound` | `not-found` | Yes | Remove the model from the candidate cache |
| HTTP 429 with a quota/billing indicator in the vendor message | `quota-exhausted` | Yes | Until the reset time, else 60 min |
| HTTP 429 or a vendor "rate limit" message | `rate-limited` | Yes | `retry-after`, else 30 s |
| Network error, HTTP 5xx, timeout | `unavailable` | Yes | 60 s, doubling per repeat up to 15 min |
| Context/token limit message, or the pre-flight token count over the limit | `context-too-large` | Yes, only to models with larger `maxInputTokens` | None |
| HTTP 400 / schema errors | `invalid-request` | **No** (a bug, not a provider problem) | None |
| `CancellationToken` fired | `cancelled` | No | None |

Each vendor gets a small mapping table (message patterns plus status codes) with unit tests. An unmapped error becomes `unknown`, which is fallback-eligible once and is logged for mapping.

Content-filter blocks are deliberately **not** retried on another vendor. Routing around a safety filter would defeat it.

## 5. Provider Role Map (MVP defaults)

| Provider | Vendor id(s) | Primary tasks | Secondary tasks | Not used for |
|---|---|---|---|---|
| GPT | `openai`; OpenAI-family models under `copilot` | `architecture`, `requirements`, `analysis` | `review`, `implement` | none |
| Copilot | `copilot` | `edit`, `implement`, `test`, `refactor`, `chat` | `explain` | none |
| Gemini | `gemini` | `review`, `config` | `analysis`, `explain`; quota fallback for all | none |
| Local | `ollama`, `customendpoint` (localhost) | any task when `privacy = local-only` | `explain`, `chat` | tasks whose requirements exceed its limits |
| Bolt | none (not a `vscode.lm` vendor) | n/a: development-team contingency only | n/a | runtime routing |

Each role has one primary owner, so GPT, Copilot, and Gemini don't overlap as primary for the same task. Secondary entries are fallbacks, not peers.

## 6. Routing Inputs and MVP Policy

Inputs: task, capability requirements, privacy class, user preference (vendor/model pin, cost ceiling), provider health (cooldowns), availability (`selectChatModels` result), and context size (pre-flight `countTokens`). Latency and cost are tie-breakers in MVP and become weighted inputs later.

Algorithm (deterministic, so routes are reproducible and testable):

1. **Discover:** `vscode.lm.selectChatModels()`; drop models whose vendor is disabled in Cognify settings.
2. **Privacy filter (hard):** `local-only` keeps only local vendors; `cloud-trusted` keeps vendors with `trusted = true`; `cloud` keeps all. If nothing remains, fail with `policy-blocked` and do **not** relax privacy.
3. **Pin:** if `preference.modelId` is set and survives step 2, the route is `[pinned model]` followed by normal fallback only if the user enabled "fallback when pinned model fails" (default **off**).
4. **Capability filter (hard):** drop models whose known capabilities violate the requirements or whose `maxInputTokens` is below the pre-flight token count.
5. **Health filter:** drop models whose vendor is in cooldown, unless that would empty the list. In that case keep the vendor with the earliest cooldown expiry.
6. **Rank:** user `preference.vendor` first, then the task's primary provider (section 5), then secondary providers, then everything else. Within a group, rank by cost tier (cheaper first, respecting `maxCostTier`), then known-capability completeness, then the vendor's default model.
7. **Execute:** try candidates in order within `deadlineMs`, at most **3 attempts** per request. Move to the next candidate only when the error is `fallbackEligible`. A streamed response that has already started emitting parts is never silently switched mid-stream; the failure is surfaced and the user can retry.
8. **Record:** return `CognifyRouteResult` with every attempt and a plain-language `reason`, for example: "Gemini selected for review; GPT skipped (in cooldown: rate-limited, 25 s left)".

## 7. Quota and Fallback Strategy (replaces prompt rotation)

| Before (Sprint 0 practice) | After (this contract) |
|---|---|
| A person resends the same prompt to another provider when one hits a limit | The router classifies the failure, applies a cooldown, and selects the next eligible provider automatically |
| No record of which provider produced an answer | Every result carries `servedBy` and the attempt chain |
| Privacy depends on who is pasting the prompt | Privacy class is enforced before any provider is contacted |
| Retries can loop across providers | At most 3 attempts per request, with a deadline, and no retry on `invalid-request`, content blocks, or cancellation |

The Bolt contingency and manual prompt rotation stay as **development-team** practices (see `GITHUB_ISSUE_MAP.md`). They are not product behavior.

## 8. Privacy and Context Rules

- The **privacy gate** runs before routing and assigns `CognifyPrivacyClass`:
  - `local-only` if the workspace or user setting demands it, or the context contains content matched by secret-detection patterns (keys, tokens, private keys, `.env` values).
  - `cloud-trusted` for workspaces marked confidential.
  - Otherwise `cloud`.
- Project Cognition (#9) context is passed to the router already redacted. The router never adds context itself.
- Prompts and responses are **not** written to the audit log (section 9). Only metadata is recorded.
- The router never relaxes a privacy class to find an available provider.

## 9. Audit Metadata

One record per routed request, stored locally (workspace storage, bounded ring buffer) and exportable for debugging:

```ts
interface CognifyRouteAuditRecord {
	readonly requestId: string;
	readonly timestamp: number;
	readonly task: CognifyTask;
	readonly role?: string;
	readonly privacy: CognifyPrivacyClass;
	readonly outcome: CognifyRouteOutcome;
	readonly servedBy?: { vendor: string; modelId: string };
	readonly attempts: readonly { vendor: string; modelId: string; durationMs: number; errorKind?: CognifyErrorKind }[];
	readonly inputTokens?: number;
	readonly reason: string;
}
```

No prompt text, response text, file contents, or credentials are stored. Telemetry, if added later, sends only aggregated counts by vendor, task, and error kind, and follows the user's telemetry setting.

## 10. Secrets

- Keys are owned by the vendor's provider extension and stored in VS Code `SecretStorage` (for example Copilot BYOK uses `copilot-byok-<provider>-api-key`).
- The router never reads, caches, logs, or forwards keys. A missing key surfaces as `auth` with a command to configure that provider.
- No provider keys in settings files, repository files, CI, or test fixtures. Tests use fake vendors registered through `vscode.lm`.

## 11. Validation Scenarios (Sprint 2 acceptance)

1. `review` task, all vendors healthy: served by Gemini, single attempt.
2. `review` task, Gemini returns HTTP 429 with `retry-after: 20`: Gemini enters a 20 s cooldown, GPT serves the request, and `outcome = fallback-success` with 2 attempts recorded.
3. `edit` task with the user preference `vendor = openai`: served by GPT, preference respected.
4. `local-only` request with no local vendor installed: `failed` / `policy-blocked`, with zero cloud attempts.
5. Content-filter `Blocked` from the first candidate: `failed`, no fallback attempt.
6. Context of 300k tokens: only models with `maxInputTokens >= 300k` are considered; if none exist, `context-too-large` without sending.
7. Pinned model fails while "fallback when pinned" is off: `failed`, 1 attempt.
8. Cancellation mid-request: `cancelled`, no further attempts, and no cooldown applied.
9. Audit log for scenario 2 contains vendors, error kinds, and durations, but no message text.

## 12. Out of Scope for MVP

Cost/latency-weighted optimization, enterprise policy distribution, multi-model ensembles, response merging, server-side routing, and automatic mid-stream failover. These are tracked in `REVISED_MVP_ROADMAP.md` ("Cognify provider router: Basic → Cost/privacy/latency-aware → Policy/enterprise aware").
