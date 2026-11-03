# Changelog

Notable changes to Cognify IDE, newest first. Cognify has no tagged releases yet. Entries are grouped by sprint and reference the pull request that merged them into `dev`. Upstream `Code - OSS` changes come in through upstream syncs and are not listed here (see [`DevDocs/Governance/UPSTREAM_BASELINE.md`](DevDocs/Governance/UPSTREAM_BASELINE.md)).

The AI extension also keeps its own log: [`extensions/cognify-ai/CHANGELOG.md`](extensions/cognify-ai/CHANGELOG.md).

## [Unreleased]

### Sprint 2: AI provider architecture (in progress)

Plan and status: [`DevDocs/Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](DevDocs/Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md).

#### Added

- **AI routing audit trail (S2-11, #27):** every Cognify AI request is recorded in a per-workspace audit trail of the last 200 requests.
  - Each record holds the provider, attempts, error kinds, durations, privacy class and reason. It never holds prompts, code, responses, or provider error text.
  - `Cognify: Export AI Routing Log` saves the trail as JSON; `Cognify: Clear AI Routing Log` clears it.
- **Copilot sign-in prerequisite (S2-03, #26):** Cognify now explains that chat roles need a GitHub Copilot sign-in before a user gets stuck on "Language model unavailable".
  - The `@cognify` description names the requirement.
  - A one-time warning offers Copilot's sign-in.
  - A new `Cognify: Check AI Setup` command reports readiness, vendors and settings, and never shows key values.
- **Privacy gate (S2-09, #24):** before any provider is contacted, every Cognify AI request is classed `cloud`, `cloud-trusted` or `local-only`.
  - Credentials in the context, such as API keys, tokens, private keys or `.env` secrets, force `local-only`. So does an attached sensitive file.
  - `cognify.privacy.localOnly` and `cognify.privacy.confidentialWorkspace` set the class too. A workspace can tighten privacy but not relax it.
  - The class is never relaxed. If no allowed model exists, the request fails with zero provider calls.
- **Routing settings (S2-08, #23):**
  - `cognify.ai.preferredVendor`, `cognify.ai.pinnedModel` and `cognify.ai.fallbackWhenPinned`.
  - `cognify.ai.disabledVendors`, `cognify.ai.trustedVendors` and `cognify.ai.maxCostTier`. These are application-scoped, so workspace settings cannot widen them.
  - Changes apply to the next request without a reload.
- **Per-vendor error tables (S2-07, #22):**
  - Covers Copilot, Gemini, Anthropic, OpenAI (and OpenAI-compatible endpoints) and Ollama.
  - Provider retry hints become the cooldown.
  - Cooldowns persist in `globalState`, and repeated `unavailable` errors back off up to 15 min.
- **Full routing algorithm (S2-06, #21):**
  - Capability filters, from the `languageModelCapabilities` proposed API.
  - Context-size checks using each provider's own tokenizer.
  - Model pinning, health demotion, reasons for every skipped model, and a routing deadline that cancels the in-flight provider request.
- **Fake-provider integration harness (S2-10, #20):** extension-host tests against fake `vscode.lm` vendors, run in `Cognify (dev)` CI under Xvfb.
- **Cognify artwork (S2-02, #18, #19):**
  - Product icons replaced with Cognify artwork; a simplified flat icon is used at sizes of 32 px and below.
  - Traced SVG masters and per-theme letterpress watermarks.
  - The identity check guards 27 assets against reverting to upstream.

#### Fixed

- **Copilot errors (S2-07, #22):**
  - Copilot quota errors (`ChatQuotaExceeded`, empty `code`) were classified as `unknown`; they now fall back as `quota-exhausted`.
  - Copilot's extension throttling (`Blocked`, "too many requests") stopped routing; it is now a fallback-eligible rate limit.
  - Copilot's "Response got filtered." was retried on another vendor; content filters are now never routed around.
- **Errors while streaming (S2-10, #20):** a provider error raised while streaming no longer bypasses fallback. A response is accepted only once its first fragment arrives.

#### Documentation

- Sprint 2 plan (#17), with item status.
- Routing contract updates:
  - error-normalization tables (§4);
  - settings and implementation notes (§6).

### Sprint 1: Product identity and AI foundation

#### Added

- **Cognify product identity (#12, part of #6):**
  - Names, `cognify` app and protocol, `.cognify` data folders.
  - Platform identifiers under `com.theoreticalmindstech.cognify`, and new installer GUIDs.
  - An identity smoke check in CI.
- **`extensions/cognify-ai` with the `@cognify /review` Reviewer role (#14, part of #8):**
  - A `vscode`-independent router.
  - Trace footer, chat result metadata, and a metadata-only audit log (`Cognify: Show AI Routing Log`).

#### Changed

- ESLint accepts the Cognify file header, and CI lints Cognify-owned code (#16).
- Cognify scripts are `.mts`.

#### Documentation

- ADR-0001 and the AI provider routing contract (#13, closes #7).
- Project Cognition MVP model (#15, closes #9).
- Agent roles and reuse matrix (#14).

### Sprint 0.5: Stabilization

- **`Cognify (dev)` CI workflow (#11):** typecheck, node unit tests, and the upstream baseline check on GitHub-hosted runners for pull requests into `dev`.
- **Downstream baseline stabilized after the upstream sync (#10):** reconciliation log, upstream baseline manifest, sync and customization policy, and the Windows build guide.
