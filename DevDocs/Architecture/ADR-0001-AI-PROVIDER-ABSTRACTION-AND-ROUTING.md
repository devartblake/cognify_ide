# ADR-0001: AI Provider Abstraction and Routing

- **Status:** Accepted (2026-11-04, Sprint 2 item S2-05), with the amendments below. Proposed in Sprint 1 (issue #7, PR #13).
- **Date:** 2026-11-03 (proposed), 2026-11-04 (accepted)
- **Deciders:** Cognify maintainers
- **Related:** #8 (agent roles), #9 (Project Cognition), [`AI_PROVIDER_ROUTING_CONTRACT.md`](AI_PROVIDER_ROUTING_CONTRACT.md)

## Context

Cognify must orchestrate several AI providers (GPT, Gemini, Copilot, and future or local models) without hard-wiring product behavior to any one vendor. Today the team handles quota limits by manually rotating the same prompt across providers (see `GITHUB_ISSUE_MAP.md` and the Sprint 0.5 reconciliation log). The product needs explicit routing instead.

The current VS Code OSS baseline already ships most of the plumbing:

| Existing capability | Where | What it gives Cognify |
|---|---|---|
| Language model provider API (stable) | `vscode.lm.registerLanguageModelChatProvider`, `contributes.languageModelChatProviders` (`src/vscode-dts/vscode.d.ts`) | Any extension can register models under a *vendor* with `provideLanguageModelChatInformation`, `provideLanguageModelChatResponse` (streaming), and `provideTokenCount`. |
| Model discovery and selection (stable) | `vscode.lm.selectChatModels({ vendor, family, id, version })`, `vscode.lm.onDidChangeChatModels` | Vendor-neutral lookup of every registered model at runtime. |
| Model metadata | `ILanguageModelChatMetadata` (`src/vs/workbench/contrib/chat/common/languageModels.ts`) | Max input/output tokens, capabilities (vision, tool calling, agent mode), pricing/cost fields, BYOK flag. Proposed APIs `languageModelCapabilities` and `languageModelPricing` expose more of this to extensions. |
| Error type | `vscode.LanguageModelError` (`NoPermissions`, `Blocked`, `NotFound`) | A base error vocabulary to normalize onto. |
| Provider adapters | Built-in Copilot extension, `extensions/copilot/src/extension/byok/vscode-node/` | Working adapters registered as vendors `copilot`, `openai`, `gemini`, `anthropic`, `azure`, `ollama`, `openrouter`, `xai`, `customoai`, `customendpoint`. API keys live in `SecretStorage`. |
| Chat participants, tools, agent host | `vscode.chat.createChatParticipant`, `vscode.lm.registerTool`, `src/vs/platform/agentHost/**` | Surfaces for Cognify roles (#8). |

Constraints:

- Keep the downstream delta small and upstream-merge friendly (`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`).
- Do not create a parallel chat/agent framework where upstream primitives suffice (Sprint 1 architecture rule).
- Never commit or log provider secrets (`CI_AND_SECURITY_BASELINE.md`).

## Options Considered

### Option 1: Cognify-owned provider SDK with its own HTTP adapters

Cognify writes and maintains clients for OpenAI, Gemini, and others, with its own key storage, streaming, and token counting.

- Pro: full control over every request and response field.
- Con: duplicates working upstream adapters, the VS Code model picker, and `SecretStorage` handling. It creates a second, competing model registry that chat, tools, and agent mode would not see. This is the largest maintenance burden and the opposite of the "reuse upstream" rule.

### Option 2: Copilot only

Route everything through the Copilot vendor and let Copilot's server-side model choice do the work.

- Pro: no new code.
- Con: not provider-neutral. Gemini and GPT become Copilot-plan features, Cognify can't express its own task/privacy/cost policy, and an outage or quota exhaustion has no Cognify-controlled fallback.

### Option 3 (chosen): Cognify routing layer over `vscode.lm`

Cognify treats every model registered through `vscode.lm`, from any vendor, as a candidate. A Cognify-owned router (a built-in extension, implemented in Sprint 2) maps each request's task, role, privacy class, and user preference to an ordered candidate list. It calls the model through `vscode.lm`, normalizes results and errors, and falls back according to policy. Cognify adds an adapter of its own only when no registered vendor covers a provider. That adapter is a normal `LanguageModelChatProvider`, so the whole workbench sees it.

## Decision

Adopt Option 3.

1. **Provider abstraction = `vscode.lm` models.** A *provider* in Cognify is a `vscode.lm` vendor, and a *model* is a `LanguageModelChat`. Cognify does not define a second model registry.
2. **Cognify owns policy, not transport.** The Cognify router owns: the task taxonomy, capability requirements, routing policy, fallback chain, quota/cooldown tracking, normalized result/error envelope, privacy gate, and audit metadata. The contract is in [`AI_PROVIDER_ROUTING_CONTRACT.md`](AI_PROVIDER_ROUTING_CONTRACT.md).
3. **Placement.** The router is a Cognify-owned built-in extension (proposed `extensions/cognify-ai`), with no `src/vs/**` changes for MVP. It consumes stable `vscode.lm` APIs, plus proposed APIs only where needed (capabilities/pricing), each listed in that extension's `enabledApiProposals`.
4. **Provider roles** (MVP defaults; user preference overrides them):
   - **GPT** (`openai`, or OpenAI-family models served by `copilot`): architecture, cross-file reasoning, requirements, complex analysis.
   - **Copilot** (`copilot`): in-editor edits, localized implementation, tests, refactors, VS Code-native workflow.
   - **Gemini** (`gemini`): independent review, alternate reasoning, structured/configuration assistance, quota fallback.
   - **Bolt**: development-team contingency only, not a runtime provider.
   - **Local** (`ollama`, `customendpoint`): required target when a request is classified `local-only` (see privacy).
5. **Quota strategy.** Replace "rotate the same prompt across providers" with policy routing. Cognify classifies the failure (quota, rate limit, auth, policy block, unavailable, invalid request), puts the provider in a cooldown where appropriate, and tries the next candidate whose capabilities and privacy class still fit. It never retries blindly across providers.
6. **Secrets.** Keys stay in `SecretStorage` through the owning provider (for example Copilot BYOK). The router never reads, stores, or logs keys.

## Consequences

Positive:

- Every model the user enables appears in the standard model picker, chat, tools, and agent mode, and is also routable by Cognify.
- Provider support grows through the ecosystem (Copilot BYOK, third-party `LanguageModelChatProvider` extensions) without Cognify writing HTTP clients.
- Cognify's code is small, extension-scoped, and sits outside upstream-owned files, which minimizes upstream merge risk.

Negative / risks:

- **Copilot extension coupling.** The GPT and Gemini adapters are the Copilot extension's BYOK providers. Their availability depends on that extension and on `isClientBYOKAllowed`, which disables BYOK for enterprise Copilot accounts without the policy. Mitigation: the router depends only on vendor IDs and degrades to "provider unavailable". Cognify can ship its own `LanguageModelChatProvider` for a vendor if BYOK becomes unsuitable.
- **Thin error vocabulary.** `LanguageModelError` distinguishes only `NoPermissions`, `Blocked`, and `NotFound`. Quota and rate limits arrive as provider-specific messages or HTTP causes, so the normalizer needs per-vendor mapping tables and tests.
- **Metadata gaps.** Cost, latency, and some capabilities are proposed-API or absent. MVP routing uses static per-vendor defaults and falls back gracefully when metadata is missing.
- **Model-picker interplay.** When the user explicitly picks a model in chat, that choice wins over routing. Routing applies to Cognify roles/tasks and to the "Cognify Auto" path only.

## Amendments from Implementation (Sprint 2)

The decision stands: Cognify routes over `vscode.lm` vendors and owns policy, not transport. Implementing it in `extensions/cognify-ai` (#14, #20–#28) refined the details below. The routing contract has the full specifics.

| # | Area | Original text | As implemented | Why |
|---|---|---|---|---|
| A1 | Placement (decision 3) | "no `src/vs/**` changes for MVP" | One **additive** core seam: `chatParticipants[].welcomeMessage` for built-in extensions, shown in the empty-chat welcome (#28). It is recorded in `UPSTREAM_BASELINE.md`. Routing itself is still extension-only. | No extension hook adds content to the chat panel without replacing Copilot's sign-in welcome. |
| A2 | Local vendors (decision 4) | Local = `ollama`, `customendpoint` | Only `ollama` counts as local. `customendpoint` and other OpenAI-compatible vendors count as cloud. | The router cannot see where a custom endpoint runs, so treating it as local could send `local-only` context off the machine. |
| A3 | Model-picker interplay (consequences) | A picked model wins; routing applies to roles and a "Cognify Auto" path | Chat dispatches participant requests only once **Copilot is signed in** (roles matrix, finding 1). Decision (a) makes that an MVP prerequisite, surfaced by S2-03 (#26, #28). Role commands ignore the picker model, as the original text says. There is no "Cognify Auto" path yet. | `getDefaultLanguageModel` only considers the `copilot` vendor. |
| A4 | Error vocabulary (risks) | Per-vendor mapping tables over `LanguageModelError` | Implemented as ordered rule tables, in priority, then vendor, then generic order (#22). Rules key on error **names and message text**, because only `{ name, message, code, cause }` survive the extension-host hop; HTTP status and headers are dropped. Retry hints come from the message text. | The serialization finding came from the S2-10 harness and from reading Copilot's error paths. |
| A5 | Fallback mechanics | Fall back on fallback-eligible errors | Most provider failures arrive **while streaming**, so an attempt counts as accepted only once its first fragment arrives (#20). A routing deadline (60 s by default) cancels the in-flight provider request (#21). | Without first-fragment acceptance, fallback never triggered. |
| A6 | Metadata (risks) | Proposed `languageModelCapabilities` and `languageModelPricing` | Only `languageModelCapabilities` is enabled. Cost uses static per-vendor tiers (`ollama` free, `copilot` included, BYOK metered). Context size uses each provider's own `countTokens` (#21, #23). | Pricing metadata is not needed for the MVP cost limit. |
| A7 | Quota strategy (decision 5) | Cooldowns | Cooldowns persist in `globalState`, honor provider retry hints, and back off for repeated `unavailable` errors, up to 15 min (#22). | They survive a window reload. |
| A8 | Privacy | Classes and the gate | The gate also detects credentials and sensitive files and forces `local-only` (#24). There are two settings: `localOnly`, plus `confidentialWorkspace` from contract §8. Each counts as on if set at any level. Settings that widen trust or cost are `application`-scoped (#23). | A cloned repository must not be able to relax the user's privacy or cost limits. |
| A9 | Audit | Audit metadata | Records go to a bounded per-workspace trail, built with a field whitelist, and can be exported and cleared (#27). | It is metadata only, by construction. |
| A10 | Agent mode (Sprint 3, S3-03) | Roles route through `@cognify` | Cognify also registers **its own language models** (vendor `cognify`, stable `registerLanguageModelChatProvider` API): one per role in the handoff chain (`Cognify · Planner`, `Coder`, `Reviewer`, `Tester`). Agent mode keeps its tool loop. Each request to a Cognify model goes through the router with its **tools forwarded**; a tool-call part counts as the first fragment, so there's no fallback after one. The privacy gate also scans **tool results**. The router never routes to the `cognify` vendor, and the models advertise a fixed 128K context, because querying `vscode.lm` from inside the provider re-enters it. | Reuses agent mode instead of a second agent loop. Dispatch from the Chat UI still needs a Copilot sign-in (A3); the provider path is proven in the integration harness, and the UI path in the S3-02 hands-on check. |

## Follow-ups

- ✅ Sprint 2: `extensions/cognify-ai` implements the router, normalizer, privacy gate and audit trail against the contract, with unit tests and extension-host integration tests (#20–#28).
- ✅ #8: the Reviewer role calls the router with `role` and `task` metadata.
- ✅ Provider registration smoke test: the S2-10 harness registers fake `vscode.lm` vendors and routes through them in CI.
- Open: a "Cognify Auto" path for non-role chat (A3), and provider neutrality for chat dispatch (options b and c in the roles matrix, finding 1).
