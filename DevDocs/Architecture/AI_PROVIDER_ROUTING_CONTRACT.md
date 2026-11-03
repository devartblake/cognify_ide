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

#### Implementation (S2-07)

`classifyError(error, vendor)` in `extensions/cognify-ai/src/router.ts` evaluates an ordered rule table. The first match wins, and each result names its rule (for example `gemini:resource-exhausted`) for the audit log:

1. **Priority rules, for any vendor:** the routing deadline, cancellation, and content filters (`Response got filtered.`, "content filter", Responsible AI, SAFETY blocks). Content filters come first, so a vendor rule can never make one fallback-eligible.
2. **Vendor rules**, keyed by the `vscode.lm` vendor id:

| Vendor | Signal (as it reaches Cognify) | `kind` |
|---|---|---|
| `copilot` | error `name` `ChatQuotaExceeded` (the `code` is empty) | `quota-exhausted` |
| `copilot` | error `name` `ChatRateLimited` | `rate-limited` |
| `copilot` | `Blocked` with "temporarily blocked due to making too many requests" (extension throttling) | `rate-limited` (fallback-eligible) |
| `copilot` | "Message exceeds token limit." | `context-too-large` |
| `gemini` | `RESOURCE_EXHAUSTED` with a per-day/billing quota | `quota-exhausted` |
| `gemini` | other `RESOURCE_EXHAUSTED` | `rate-limited` |
| `gemini` | `UNAVAILABLE`, `DEADLINE_EXCEEDED`, "model is overloaded" | `unavailable` |
| `gemini` | "API key not valid", `PERMISSION_DENIED`, `UNAUTHENTICATED` | `auth` |
| `gemini` | "input token count … exceeds the maximum number of tokens" | `context-too-large` |
| `gemini` | other `INVALID_ARGUMENT` | `invalid-request` |
| `anthropic` | `rate_limit_error` / `overloaded_error` / `authentication_error` | `rate-limited` / `unavailable` / `auth` |
| `anthropic` | "credit balance is too low" / "prompt is too long" | `quota-exhausted` / `context-too-large` |
| `anthropic` | other `invalid_request_error` | `invalid-request` |
| `openai` (and OpenAI-compatible vendors) | `insufficient_quota` / `context_length_exceeded` / invalid API key | `quota-exhausted` / `context-too-large` / `auth` |
| `ollama` | `ECONNREFUSED` (server not running) / "model … not found, try pulling it" | `unavailable` / `not-found` |

3. **Generic rules:** the `LanguageModelError` codes and the HTTP status and message patterns in the table above.

Errors cross the extension-host boundary as `{ name, message, code, cause }` only. HTTP `status`, response headers and SDK-specific fields are dropped, and BYOK providers rethrow SDK errors whose text is all that survives. Rules therefore key on error names and message text, and status codes only help for in-process errors. A `code` of `''` does not mask the error `name`.

**Retry hints and cooldowns:**

- **Retry hints:** a retry hint in the message ("retry in 34s", "Retry-After: 20", "wait 2 minutes", Gemini's `"retryDelay": "17s"`) becomes `retryAfterMs`, capped at 1 h, and overrides the base cooldown.
- **Persistence:** cooldowns are kept in `globalState` (`cognify.ai.cooldowns.v1`, `{ until, failures }` per vendor), so they survive a reload.
- **Backoff:** `unavailable` backs off 60 s × 2^(failures−1), capped at 15 min.
- **Reset:** a vendor that serves a request has its failure count cleared, and so does one that stays healthy for 30 min after its cooldown.
- **Cleanup:** stale entries are dropped when the store is saved.

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
   - **Implementation note (verified by the S2-10 integration harness):** `vscode.lm` providers report most failures *while streaming*, not by rejecting `sendRequest`. An attempt therefore counts as accepted only once the **first text fragment** (or a clean end of stream) arrives. Errors before that point are fallback-eligible; errors after it are surfaced. A fragment reported in the same tick as a failure can be dropped by the extension host, and that case is correctly treated as a failure before output.
   - **Implementation (S2-06):** `selectCandidates` in `extensions/cognify-ai/src/router.ts` (steps 3–6) and `CognifyRouter.route` in `src/routing.ts` (steps 1, 7, 8). Choices made during implementation:
     - **Token pre-flight:** each model's own tokenizer (`LanguageModelChat.countTokens`), in parallel, 2 s per model, falling back to characters ÷ 4.
     - **Capabilities:** read through the `languageModelCapabilities` proposed API (`supportsToolCalling`, `supportsImageToText`), enabled in the extension manifest. If the API is unavailable, capabilities count as unknown.
     - **Deadline:** defaults to 60 s and bounds *acceptance* (the first fragment), not the whole stream. When it fires, the in-flight provider request is cancelled.
     - **Exclusions:** every excluded model carries a reason, which is shown in the `@cognify` footer and returned in the trace metadata.
     - **Pins:** a pinned model that is missing or excluded is reported (`pinned: 'not-found' | 'excluded'`) and normal ranking applies.
8. **Record:** return `CognifyRouteResult` with every attempt and a plain-language `reason`, for example: "Gemini selected for review; GPT skipped (in cooldown: rate-limited, 25 s left)".

### User settings (S2-08)

The router reads these settings on every request, so a change applies to the next request without a reload. A field passed on the request itself (for example `preferredVendor` or `pinnedModelId` from a caller of the API) overrides the setting.

| Setting | Default | Scope | Effect |
|---|---|---|---|
| `cognify.ai.preferredVendor` | `""` | window | Vendor ranked first (step 6). |
| `cognify.ai.pinnedModel` | `""` | window | Model id pinned for every task (step 3). If it is unavailable or excluded, normal ranking applies, and the selection reports `pinned: 'not-found' \| 'excluded'`. |
| `cognify.ai.fallbackWhenPinned` | `false` | window | When the pinned model fails, continue down the ranked route (scenario 7). |
| `cognify.ai.disabledVendors` | `[]` | application | Vendors that never receive a request, including the pre-flight token count (step 1). This applies even to a pinned model. |
| `cognify.ai.trustedVendors` | `[]` | application | Vendors allowed `cloud-trusted` context (section 8). Local vendors are always allowed. |
| `cognify.ai.maxCostTier` | `premium` | application | The most expensive cost tier allowed (`free` < `included` < `metered` < `premium`). Static tiers: `ollama` free, `copilot` included, `openai`/`gemini`/`anthropic` and unknown vendors metered. |

**Why some settings are application-scoped:** settings that widen what may leave the machine or what it may cost are `application`-scoped. A cloned repository's `.vscode/settings.json` therefore cannot trust a vendor, re-enable one the user disabled, or raise the cost limit. Workspace settings replace user settings rather than merging with them, so a workspace-level `disabledVendors: []` would otherwise undo the user's own list.

Every excluded model appears in the route's `excluded` list with its reason, for example "vendor is disabled in settings" or "cost tier metered is above the included limit in settings". The reason is shown in the chat footer and written to the audit log.

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

### Implementation (S2-09)

`assessPrivacy` lives in `extensions/cognify-ai/src/privacy.ts`, which has no `vscode` import. `CognifyRouter.route` runs it on every request, before discovery, token counting, or any provider call.

- **Inputs.** The gate looks at:
  - the text of every outgoing message;
  - the workspace-relative paths of attached files (`CognifyRouteRequest.contextPaths`);
  - a class the caller requires (`CognifyRouteRequest.privacy`);
  - the `cognify.privacy.*` settings.

  It applies the strictest class that any of these call for.
- **Credential detectors:**
  - private-key blocks;
  - OpenAI, Anthropic and Google API keys;
  - GitHub, AWS, Slack and Stripe tokens;
  - JWTs;
  - passwords in connection strings;
  - quoted secret assignments (`password = "…"`);
  - `.env`-style lines (`*_TOKEN=…`).

  Placeholders such as `<your-key>`, `${VAR}`, `changeme` and `process.env.X` don't count. Ordinary code such as `const token = getToken()` doesn't match, because the generic rules need a quoted literal or a `.env` line.
- **Sensitive files:** `.env*`, `*.pem`, `*.key`, `*.p12`/`*.pfx`, SSH private keys, `.npmrc`, `.netrc`, `credentials(.json)` and `secrets.{json,yaml,toml}`. Attaching one of these forces `local-only`, whatever it contains.
- **What is recorded:** the decision holds detector ids, match counts and file paths. It never holds matched values or file contents. Its reasons are shown in the chat footer (`Privacy: local-only (…)`) and written to the audit record.
- **Local vendors:** only `ollama` counts as local. `customendpoint` and other OpenAI-compatible vendors count as cloud, because the router cannot see whether their endpoint is on this machine.
- **Which vendors may receive the request:** a vendor the class does not allow is excluded before step 1's token count, including a pinned model. The exclusion reason is `privacy: <class> context cannot be sent to this vendor`. If no model remains, the route fails with `blocked: 'privacy'` and makes zero attempts (scenario 4).
- **Settings:**

| Setting | Default | Effect |
|---|---|---|
| `cognify.privacy.localOnly` | `false` | Every request is `local-only`. |
| `cognify.privacy.confidentialWorkspace` | `false` | Every request is at least `cloud-trusted`; trusted vendors come from `cognify.ai.trustedVendors`. |

Both settings are `window`-scoped. Each counts as on if it is on at **any** level (user, workspace or folder), so a workspace can tighten privacy but cannot switch off what the user switched on. For example, a workspace `localOnly: false` does not override a user `localOnly: true`.

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
