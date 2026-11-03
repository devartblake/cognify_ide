# Changelog: Cognify AI (`extensions/cognify-ai`)

Changes to the built-in Cognify AI extension, newest first. The extension is versioned with the product and has no separate releases. Product-wide changes are in the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Added

- **Settings (S2-08):**
  - `cognify.ai.preferredVendor`, `cognify.ai.pinnedModel` and `cognify.ai.fallbackWhenPinned`.
  - `cognify.ai.disabledVendors`, `cognify.ai.trustedVendors` and `cognify.ai.maxCostTier`.
  - Settings are read on every request. A field passed on the request overrides the setting.
  - `CognifyRouteResponse.settings` reports the settings a route was computed with.
- **Static cost tiers (S2-08):** `ollama` free, `copilot` included, BYOK vendors metered.
- **Settings in candidate selection (S2-08):** `selectCandidates` takes `disabledVendors` (excluded even when pinned, and never sent a token count) and `maxCostTier`.
- **Error rules (S2-07):** `classifyError(error, vendor)` evaluates an ordered rule table and reports the matching rule (`ClassifiedError.rule`).
- **Retry hints and cooldowns (S2-07):** `parseRetryAfterMs`, `ClassifiedError.retryAfterMs`, and `cooldownFor(error, consecutiveFailures)`.
- **Persistent vendor health (S2-07):**
  - `new CognifyRouter(store)` keeps vendor health in `globalState` (`cognify.ai.cooldowns.v1`).
  - `CognifyRouter.cooldownUntil(vendor)` reports a vendor's cooldown.
- **Routing (S2-06):**
  - `selectCandidates` applies capability requirements, per-model context checks, pinning (`pinnedModelId`, `fallbackWhenPinned`) and health demotion, and returns exclusion reasons.
  - Token counts use each provider's own tokenizer (2 s per model, falling back to characters ÷ 4).
  - `deadlineMs` (default 60 s) aborts and cancels a provider that never responds.
- **Public API (S2-10):** `CognifyAiApi { router }` is returned from `activate`.
- **Test fixtures (S2-10):** `test-fixtures/fake-lm` registers fake `gemini`, `openai`, `copilot` and `ollama` vendors (test-only, not packaged).

### Changed

- **`resetCooldowns()` is now async (S2-07):** it also clears the persisted state.
- **Copilot quota errors (S2-07):** `ChatQuotaExceeded` is now `quota-exhausted`, fallback-eligible.
- **Copilot throttling (S2-07):** `Blocked` with "too many requests" is now `rate-limited`, fallback-eligible.
- **Content filters (S2-07):** "Response got filtered.", content filters and SAFETY blocks are `policy-blocked` and never routed to another vendor.

### Fixed

- **Errors while streaming (S2-10):** errors raised while streaming now fall back. Previously only a rejected `sendRequest` did.

## Sprint 1

### Added

- **`@cognify /review` participant:**
  - The six-role map.
  - Ranking, error normalization with credential redaction, and a 3-attempt fallback.
  - Trace footer and chat result metadata.
  - A metadata-only audit log (`Cognify: Show AI Routing Log`).
