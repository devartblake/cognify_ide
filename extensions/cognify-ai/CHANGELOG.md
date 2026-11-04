# Changelog: Cognify AI (`extensions/cognify-ai`)

Changes to the built-in Cognify AI extension, newest first. The extension is versioned with the product and has no separate releases. Product-wide changes are in the root [`CHANGELOG.md`](../../CHANGELOG.md).

## [Unreleased]

### Added

- **Role-flow scenario test (S3-06):** an integration test runs Planner → Coder → Reviewer → Tester from the persona files, through their Cognify models and handoff prompts. It asserts one audited request per role, with the role's task and the vendor that task prefers.
- **Project model refresh (S3-08):**
  - `projectModel/indexer.ts` splits into `buildIndex`, `refreshIndex` and `assembleModel`, with a SHA-256 content hash per input and `domainOf` (`packages`, `ci` or `conventions`).
  - `ProjectModelService` watches the input globs after its first build (2 s debounce), applies changes incrementally, and exposes `onDidRefresh` (`{ changedPaths, domains, filesRead }`). Each refresh also writes a metadata-only log line.
  - Workspace-folder changes trigger a rebuild.
  - New commands: `Cognify: Show Project Model`, `Rebuild Project Model` and `Clear Project Model`.
- **Tool calls in the audit trail (S3-04):**
  - `CognifyRouteAuditRecord` gains `toolsOffered` and `toolCalls`, which hold tool names only, sanitized and capped at 50.
  - The router wraps the accepted response stream to collect the names of tool-call parts, and writes them when the stream ends, through `CognifyAuditTrail.recordToolCalls`.
  - Arguments and results are never read.
  - The route explanation shows the tool calls.
  - New `audit.withToolCalls`.
- **Personas routed through Cognify (S3-05):** each `.agent.md` sets `model: Cognify · <Role> (cognify)`, so agent-mode requests from the personas get the router's provider order, fallback, privacy gate and audit record. A unit test checks the `model:` lines.
- **Project Cognition validated on this repository (S3-10):**
  - New unit tests run the design's §7 question against this repository's real files: facts 1–5, the index finishing untruncated within budget, and redaction of a seeded key.
  - `ciFor` and `howToTest` now list the steps that mention the package first, and name the pipelines that run only on other branches, with their branch filters.
  - `recentChanges` accepts a `path`.
- **`cognify_projectModel` tool (S3-09):**
  - A language-model tool (`#projectModel`) with the operations `summary`, `package`, `howToTest`, `ciFor` and `recentChanges`. The pure queries are in `src/projectModel/queries.ts`; recent changes come from the Git extension API.
  - CI matching counts only change events and applies branch and `paths` filters, with an optional `branch` input.
  - Answers are redacted and capped at 4,000 characters. Each call writes a metadata-only log line. The tool refuses under `cognify.privacy.localOnly`.
  - The four personas list it as `vscode.cognify-ai/projectModel`.
  - The root package records `packageManager`, so commands use the workspace's manager (`pnpm`).
  - A `package.json` without a name, scripts or dependencies (such as `src/package.json`) is no longer indexed as a package.
- **Project Cognition indexer (S3-07):**
  - `src/projectModel/` holds the `ProjectModel` v1 schema, the parsers, a TOML subset reader and `buildProjectModel`. The budgets are 5,000 files, 1 MB per file and 10 s; shallow paths are read first.
  - `ProjectModelService` (`CognifyAiApi.projectModel`) builds the model lazily from the workspace, honoring `files.exclude` and `search.exclude`, and stores it as `project-model.v1.json` in workspace storage.
  - `privacy.ts` gains `redactSecrets`.
  - New dependency: `yaml`.
  - `tsconfig.json` sets `rewriteRelativeImportExtensions`, so pure modules can import each other with `.ts` paths under both `node --test` and the build.
- **Cognify role models (S3-03):**
  - New vendor `cognify` (`src/modelProvider.ts`) with the models `Cognify · Planner`, `Coder`, `Reviewer` and `Tester`. Agent-mode requests to them are routed by the role's task.
  - The router accepts `tools`, `toolMode` and `modelOptions`. It requires tool calling when tools are present, and counts a tool-call part as the first fragment.
  - The privacy gate scans tool results.
  - The router and Check AI Setup ignore the `cognify` vendor.
  - `CognifyModelResponse` gains `parts`, which carries text and tool calls.
  - The fake vendors can return tool calls and record the tools offered.
- **Role personas as custom agents (S2-14, #36):**
  - `agents/planner.agent.md`, `coder.agent.md`, `reviewer.agent.md` and `tester.agent.md` are contributed through `contributes.chatAgents` and appear in the agent picker as **Cognify Planner**, **Coder**, **Reviewer** and **Tester**.
  - Each persona's `handoffs` follow `handoffTo` in the role map (Planner → Coder → Reviewer → Tester → Reviewer). The Planner and Reviewer are read-only (`search`, `read`).
  - They are data only and run in agent mode with the picker's model, outside the Cognify router.
  - Tests: a unit test checks the files against `ROLES`, and an integration test checks that they register and that upstream's prompt validator reports no errors or warnings.

- **`@cognify /explain`, the Tutor role (S2-13, #35):**
  - It explains attached or selected code, or answers a question, and is routed with task `explain` (Copilot first).
  - It produces the same footer, "Why this provider?" link and audit record as `/review`.
  - With no question and no code, it asks for one instead of calling a model.
  - Role commands are now a table: `ROLE_COMMANDS` in `src/rolePrompts.ts`, holding the pure prompts, and `createRoleHandler` in `src/roles.ts`. Adding a role is one table entry plus a prompt.

- **Route explanation (S2-12):**
  - Every `@cognify` footer ends with a **Why this provider?** link (`cognify.ai.explainRoute`, hidden from the Command Palette). The footer's Markdown is trusted for that one command only.
  - The link opens a dialog built from that request's audit record: the reason, each attempt (vendor, model, error kind, matching rule, duration), skipped models with reasons, the privacy class and reasons, and the input size.
  - `formatRouteExplanation` and `explainRouteLink` are in `src/routeExplanation.ts`.
- **Chat panel welcome line (S2-03 follow-up):** the empty chat shows "Cognify roles: … try `@cognify /review` … needs a GitHub Copilot sign-in", with a **Check AI Setup** link. It is contributed through the new `chatParticipants[].welcomeMessage` field (a small core change).
- **Audit trail (S2-11):**
  - `CognifyRouter.audit` (`CognifyAuditTrail`) records one metadata-only `CognifyRouteAuditRecord` per routed request in workspace storage. It keeps the newest 200 and carries schema version 1.
  - New commands: `Cognify: Export AI Routing Log` (JSON) and `Cognify: Clear AI Routing Log`.
  - `CognifyRouteRequest` gains `requestId` and `role`. `CognifyRouteResponse` gains `audit`.
  - `new CognifyRouter(cooldownStore, auditStore)` takes the audit store as a second argument.
  - `createRequestId` moved to `routing.ts`.
- **Copilot sign-in prerequisite (S2-03):**
  - The `@cognify` participant description now names the requirement.
  - A one-time warning appears when `@cognify` activates without a Copilot model. It offers Sign In to Copilot, Check AI Setup, or Don't Show Again.
  - New command `Cognify: Check AI Setup` (`cognify.ai.checkSetup`), backed by `assessAiSetup` in `src/setup.ts`.
  - `CognifyAiApi.checkSetup()` returns the assessment without UI.
- **Privacy gate (S2-09):**
  - `src/privacy.ts` provides `assessPrivacy`, `detectSecrets`, `isSensitivePath`, `vendorAllowed` and `strictestPrivacy`.
  - Requests are classed `cloud`, `cloud-trusted` or `local-only` before any provider is contacted. Credentials in the context, or attached sensitive files, force `local-only`.
  - New settings: `cognify.privacy.localOnly` and `cognify.privacy.confidentialWorkspace`. Each is on if it is on at any level.
  - `CognifyRouteRequest` gains `privacy` and `contextPaths`.
  - `CognifyRouteResponse` gains `privacy` (the class, plus reasons and detector ids, never secret values).
  - `RouteResult.blocked` is `'privacy'` when no allowed model exists.
  - The privacy decision appears in the chat footer and the audit record.
- **`selectCandidates` takes `blockedVendors` (S2-09):** a map from vendor to reason, applied first and even to a pinned model.
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

- **Unit tests run as ES modules (S2-15, #37):** `src/package.json` sets `"type": "module"`, so `node --test` no longer prints a `MODULE_TYPELESS_PACKAGE_JSON` reparse warning per test file. The test typecheck (`nodenext`) now treats the files as ESM too, so it matches the runtime. The extension build is unchanged: tsc emits CommonJS and esbuild bundles to `cjs`, and neither reads this file. `agentPersonas.test.ts` now finds the extension folder from `import.meta.dirname`, so it no longer depends on the working directory.
- **No duplicate notification (S2-03 follow-up):** running `Check AI Setup` cancels the pending first-use warning, so the user gets one notification instead of two.
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
