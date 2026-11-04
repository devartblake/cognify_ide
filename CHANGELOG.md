# Changelog

Notable changes to Cognify IDE, newest first. Cognify has no tagged releases yet. Entries are grouped by sprint and reference the pull request that merged them into `dev`. Upstream `Code - OSS` changes come in through upstream syncs and are not listed here (see [`DevDocs/Governance/UPSTREAM_BASELINE.md`](DevDocs/Governance/UPSTREAM_BASELINE.md)).

The AI extension also keeps its own log: [`extensions/cognify-ai/CHANGELOG.md`](extensions/cognify-ai/CHANGELOG.md).

## [Unreleased]

### Sprint 2: AI provider architecture (in progress)

Plan and status: [`DevDocs/Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](DevDocs/Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md).

#### Changed

- **Upstream import: microsoft/vscode `4c32afe` (2026-11-04), via `vendor/sync-2026-11-04`.**
  - Code OSS 1.139.0 → **1.146.0**, Node 24.18.0 → **24.22.1**, Electron 43.6.0 → **43.8.6**.
  - **npm → pnpm 12.16.0**: install with `pnpm install` (`corepack enable` provides the pinned version). Run scripts with `pnpm run …`.
  - `extensions/cognify-ai` is now a pnpm workspace member.
  - Cognify's `preLaunch.ts` change is retired, because upstream's `shouldDownloadElectron()` does the same check.
- **`cognify-ai` unit tests run as ES modules (S2-15, #37).** This removes Node's module-type reparse warnings from the CI log. The extension build is unchanged.

#### Added

- **Cognify role personas in the agent picker (S2-14, #36).** Cognify Planner, Coder, Reviewer and Tester are custom agents (`.agent.md` files), with handoff buttons that follow the role map. They are data only; they use the picker's model and don't go through the Cognify router or privacy gate yet (Sprint 3).
- **`@cognify /explain`, the Tutor role (S2-13, #35).** It explains code or answers programming questions. It's routed like `/review`, preferring Copilot, with the same footer and audit trail. Role commands now come from one table, so further roles are small additions.
- **Upstream branch model and mirror (S2-16, #30).** Microsoft's code now reaches Cognify only through `vendor/vscode-main`, a read-only mirror updated weekly by `.github/workflows/cognify-upstream-mirror.yml`, and reviewed `vendor/sync-YYYY-MM-DD` branches into `dev`.
  - The workflow also trial-merges upstream into `dev` and reports conflicts, without pushing.
  - `main` becomes Cognify's stable branch, fed only by promotion PRs from `dev`.
  - `Cognify (dev)` CI now also runs for `main`.
  - The S2-16 dry run found 3 conflicts and upstream's move to pnpm; the import was not made.
- **Second promotion of `dev` into `main` (#34, 2026-11-04).** `main` now has the upstream import (Code OSS 1.146.0, pnpm), S2-13 and the branch-model follow-ups. The `main` ruleset now requires the `Typecheck, Unit Tests & Baseline` check; before, it required a `CI` check that no workflow reports.
- **First promotion of `dev` into `main` (#31, 2026-11-04).** `main` now holds Cognify's code. Until then it was a plain Microsoft commit kept current by the fork's sync.
  - The first mirror run created `vendor/vscode-main`.
  - The inherited Microsoft workflows are disabled.
  - A request to detach the repository from the microsoft/vscode fork network is open with GitHub Support; the self-service option isn't available for forks over 1 GB.
- **"Why this provider?" (S2-12, #29):** every `@cognify` response footer links to an explanation of how the provider was chosen: the reason, every attempt with its error type and duration, the models skipped and why, and the privacy class. The explanation is built from metadata only.
- **Cognify line in the chat panel (#28):** the empty Chat view now shows a short Cognify line ("try `@cognify /review`; needs a GitHub Copilot sign-in") with a **Check AI Setup** link. It sits below Copilot's content and never replaces the chat input or the sign-in prompt.
  - It is enabled by a small core change: built-in chat participants can contribute `welcomeMessage`.
  - The change is recorded in `UPSTREAM_BASELINE.md`.
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

- **"VS Code" string inventory (S2-17):** `DevDocs/Governance/VS_CODE_STRING_INVENTORY.md`, with every string as a row in `vs-code-string-inventory.csv`. It covers 634 places where the product calls itself "VS Code", in `src/vs` and the built-in extensions' `package.nls.json`.
  - 318 to rename, 104 to reword (Microsoft services, the chat pet and logo artwork, the issue reporter, Copilot's VS Code help, CLI names) and 212 to keep (identifiers, telemetry, the extension platform).
  - It recommends an NLS override layer for the renames instead of editing upstream files.
  - No code changes.
- **Docs brought up to date after the pnpm import and the promotions (#37):**
  - The Windows build guide now calls for Node 24.22.1 and pnpm (via `corepack enable`).
  - The post-sync gates and the Project Cognition validation answer use `pnpm` commands.
  - S2-01's instructions say `pnpm install`.
  - The branch-model setup records that "Automatically delete head branches" deleted `dev` after both promotions, even with the deletion ruleset active, and recommends turning it off. It adds the recovery steps: recreate `dev` from `main`, and switch PRs that GitHub retargeted to `main` back to `dev`.
  - The Sprint 2 table is current.
- **ADR-0001 is Accepted (S2-05, #29),** with amendments A1–A9 recording what implementation changed: one additive core seam, `customendpoint` counted as cloud, the Copilot sign-in prerequisite, error rules keyed on names and message text, first-fragment acceptance, static cost tiers, persistent cooldowns, privacy settings, and the audit trail.
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
