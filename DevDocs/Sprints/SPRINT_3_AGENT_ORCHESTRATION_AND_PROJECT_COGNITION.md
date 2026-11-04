# Sprint 3: Agent Orchestration and Project Cognition MVP

- **Status:** In progress (started 2026-11-04). Decisions D1–D3 were approved by the owner on 2026-11-04. See [Progress](#progress).
- **Duration:** 1.5 weeks (about 7 working days), per `REVISED_MVP_ROADMAP.md`.
- **Inputs:**
  - [`SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](SPRINT_2_AI_PROVIDER_ARCHITECTURE.md#sprint-review-2026-11-04): the review and carry-overs;
  - [`PROJECT_COGNITION_MVP.md`](../Architecture/PROJECT_COGNITION_MVP.md) (#9): the schema, inputs, refresh, privacy and the validation scenario;
  - [`AGENT_ROLES_AND_REUSE_MATRIX.md`](../Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md) (#8): the role map and the reuse rules;
  - [`ADR-0001`](../Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md) and the [routing contract](../Architecture/AI_PROVIDER_ROUTING_CONTRACT.md);
  - [`REBRANDING_PLAN.md`](../Governance/REBRANDING_PLAN.md): items R-01 to R-06.

## Sprint Goal

Cognify's roles work **as a flow and know the repository**:
- the Planner → Coder → Reviewer → Tester personas run through the Cognify router, with privacy, fallback and audit;
- every role can ask Project Cognition how this repository is built, tested and shipped.

Also close #6 and #8 with the two hands-on checks carried over from Sprint 2.

## Progress

| ID | State | Pull request | Notes |
|---|---|---|---|
| S3-01, S3-02 | Waiting on the owner | n/a | Hands-on checks. |
| S3-03 | ✅ **Go**, done | #43 | `src/modelProvider.ts` registers vendor `cognify` with four role models. Integration tests with fake vendors cover: tools forwarded; tool calls streamed back; tool results passed through; fallback before the first part; no routing to `cognify` itself; a credential in a **tool result** forcing `local-only`. Found and fixed: asking `vscode.lm` for models from inside the provider deadlocks, so the advertised context is fixed. Chat-UI dispatch is checked in S3-02. ADR-0001 amendment A10. |
| S3-04 | ✅ Done | #48 | With S3-03 (#43), the router already forwarded `tools`, `toolMode` and `modelOptions`, required tool calling when tools were present, and accepted on the first part of any kind. **This change completes the audit:** records hold `toolsOffered` and `toolCalls`, the names in call order, from wrapping the accepted stream. Only tool names are read; never arguments or results. The "Why this provider?" explanation shows them. Unit tests cover sanitizing and the cap of 50 names. The S3-03 integration test asserts the name is recorded and the argument isn't. |
| S3-07 | ✅ Done | #44 | `src/projectModel/` (pure, tested with `node --test`): schema v1; parsers for npm and pnpm, Python, Go, Cargo, GitHub workflows and conventions; budgets, coverage and untrusted mode. `ProjectModelService` builds the model lazily via `findFiles`, honoring `files.exclude` and `search.exclude`, and stores it in workspace storage. **This repository indexes in about 0.4 s, without truncation.** CI commands are stored with credentials redacted. Adds the `yaml` dependency (2.9.0 was already in the lockfile). Pending: `services`, `apis`, `recentChanges` and `.gitignore` exclusions. |
| S3-09 | ✅ Done | #45 | Tool `cognify_projectModel` (`vscode.cognify-ai/projectModel`), with the operations `summary`, `package`, `howToTest`, `ciFor` (with `branch`) and `recentChanges` (Git API). Pure queries are in `src/projectModel/queries.ts`. Redacted, metadata-only log line, refused under `localOnly`. All four personas list it. Running it on this repository fixed two bugs: module-type marker `package.json` files were treated as packages, and manual or scheduled-only workflows were listed as running on a change. For `router.ts` targeting `dev` it now lists only `Cognify (dev)`. |
| S3-10 | ✅ Done | #46 | The validation scenario passes on this repository for facts 1–5 and acceptance criteria 2 and 3. The results are recorded in `PROJECT_COGNITION_MVP.md` §7. Still open: fact 6, which needs the live Git call (S3-02), and criterion 4, which needs refresh (S3-08). Along the way, the answers now put the steps that mention the package first, name the pipelines that run only on other branches, and `recentChanges` takes a `path`. |
| S3-05 | ✅ Done | #47 | All four personas set `model: Cognify · <Role> (cognify)`, so agent-mode requests from them go through the router: privacy gate (including tool results), fallback and audit. A unit test checks each `model:`. Upstream's prompt validator resolves the names: the S2-14 integration test is clean, and a deliberately wrong name was confirmed to fail it with "Unknown model". The routing path itself was covered by S3-03's integration tests (Coder model, tools, privacy). |
| S3-08 | ✅ Done | #49 | The indexer is split into `buildIndex`, `refreshIndex` and `assembleModel`, with a SHA-256 content hash per input and a domain per input (`packages`, `ci` or `conventions`). The service watches the input globs after the first build (2 s debounce), refreshes incrementally, fires `onDidRefresh` with `{ changedPaths, domains, filesRead }`, and logs that as a metadata-only line. Workspace-folder changes rebuild. New commands: **Show**, **Rebuild** and **Clear Project Model**. Closes §7 criterion 4: a workflow edit re-derives `ci` only (unit and integration tests). |
| S3-06 | ✅ Done | #50 | Scripted integration run over the real persona files: Planner → Coder → Reviewer → Tester, each request sent to the persona's `model:` with its instructions, and each handoff prompt sent after the previous answer. Four routed and audited requests: `planner/architecture/openai`, `coder/edit/copilot`, `reviewer/review/gemini`, `tester/test/copilot`. The Tester hands back to the Reviewer, as in `ROLES`. The hands-on run in the Chat UI is part of S3-02. |
| R-01 | ✅ Done | #51 | `scripts/cognify/vscode-strings.mts`, plus a `Cognify (dev)` step, "Check for new \"VS Code\" strings". It reproduces the S2-17 inventory exactly (634: 318/104/212), and its ported rules agree on every row. A temporary new string (`localize(…, "Restart VS Code…")`) failed the check (exit 1) with the file, key and class; a new `X-VSCode-…` header only warned. The CSV is re-sorted by `--write`, with identical rows. |
| R-02 | ✅ Done | #52 | NLS override layer: `build/cognify/nls-rebrand.json`, 256 reviewed entries, worded with the product's long name "Cognify IDE" (owner's choice) covering the 265 rename-class localized and `package.nls.json` messages. One Copilot "VS Code Insiders" message moved to reword. `build/cognify/nlsRebrand.ts` is hooked into `finalizeNLS`, gulp `nls()` and `minifyExtensionResources`. `scripts/cognify/nls-rebrand.mts` is a CI step. **Desktop NLS bundle:** 194 of 199 core overrides applied; the other 5 are in modules that bundle doesn't include. A stale `from` fails the build and names the key. **Extensions:** the 47 overrides outside Copilot apply. Copilot's 10 use the same hook but weren't checked, because its extension build fails in the dev container. |
| R-03 | ✅ Done | #53 | The 16 model-facing literals (`R-model`) now name Cognify IDE: the agent-host identity prompt ("You are an AI assistant using Copilot SDK in Cognify IDE…"), and the descriptions of the tools for tasks, tests, the terminal sandbox, extensions, MCP configuration, automations, sessions, the chat background and customization migration. There are 15 narrow text edits in 13 upstream files, listed in `UPSTREAM_BASELINE.md`. Two follow decision D2: the codicon background is described as "built-in icons", and the extension search tool says "the extension marketplace configured for Cognify IDE", because Cognify configures no gallery. Upstream tests that assert the text were updated (two tests and 12 sandbox snapshots), and 1,145 tests pass across the four affected files. The inventory is now 618 strings (301 rename, 105 reword, 212 keep). |
| R-04 | ✅ Done | #54 | The 36 user-visible literals: 33 now say "Cognify IDE" (18 upstream files, listed in `UPSTREAM_BASELINE.md`). Three are reclassified. The synced-customization plugin names become keep (`K-id`): the window and agent host match on them, so a rename needs a migration. The "VS Code Release Notes" link becomes reword: Cognify has no `releaseNotesUrl`. Tests asserting the text were updated (8 files). 2,212 tests pass in the affected unit files, and the worktree-author check in `agentHostGitService.integrationTest.ts` passes. The two failures in that file come from running as root, because `chmod 0` doesn't block root, and are unrelated. Inventory: 585 strings (265 rename, all covered by the R-02 table; 106 reword; 214 keep). |
| R-05 | ✅ Done | #55 | The D2 decisions are applied to all 106 reword strings: 26 reworded through the NLS table (the check now covers reword messages and rejects unedited ones), 8 literals edited in source, and 69 reclassified as keep with reasons (`K-inactive` 52, `K-msproduct` 9, `K-ecosystem` 5, `K-id` 3). **Chat pet:** a `CHAT_PET_AVAILABLE` gate hides every way to turn it on. **Progress animation:** `cognify-ai` contributes the default `drawMonochromeNoIcon`, and an integration test checks it. Inventory: 577 strings (265 rename and 29 reword, all in the table; 283 keep). |
| R-06 | In review | | **Dev builds (owner: opt-in):** `COGNIFY_DEV_REBRAND=1 pnpm run transpile-client` makes `code.sh` show the rebranded text, through a hook in `build/next/transpile.ts`. Off by default, so unit tests and syncs are unaffected: always-on failed 4 node tests that assert upstream's English. With the flag on, all 216 core entries are in `out/`. Built-in extensions' text stays upstream in dev builds (packaged builds only). **Languages (owner):** English only for now; revisit after the MVP. Tests: 6 `build/cognify` tests, including the dev transpiler with and without the flag. |
| S3-11, S3-12 | Not started | | |

## Starting Point (Sprint 2 exit)

| Area | State | Gap this sprint closes |
|---|---|---|
| Router | Task, privacy, preference and health routing; error tables; cooldowns; audit; "Why this provider?" | Routes only text requests from `@cognify`. **Tool calls aren't supported**, and agent mode doesn't use it. |
| Roles | `@cognify /review` and `/explain`, plus four `.agent.md` personas with handoffs | **The personas bypass the router** and use the picker's model. They have no repository knowledge. |
| Project Cognition | Designed (#9). Nothing implemented. | The whole MVP. |
| Rebranding | Inventory (S2-17) and plan | R-01 to R-04 |
| Hands-on | S2-01 and S2-04 carried over | Both are owner checks. |

## Key design: personas through the router

The role matrix's rule is to reuse upstream unless it can't express the requirement. Agent mode already handles everything except the router: the tool loop, edits, terminal, handoff buttons and the persona files.

**So Cognify plugs in as a model, not as a second agent loop.** `cognify-ai` registers a language-model provider (vendor `cognify`) through the stable `vscode.lm.registerLanguageModelChatProvider` API and the `languageModelChatProviders` contribution point. It exposes one model per routed role, for example **Cognify · Planner**, **Cognify · Coder**, **Cognify · Reviewer** and **Cognify · Tester**. Each persona's `.agent.md` names its model (`model: Cognify · Coder`).

When agent mode sends a request to such a model, the provider:
1. maps the model to its role and task;
2. runs the router (privacy gate, settings, ranking, fallback, deadline) over the **real** vendor models;
3. forwards the messages and the **tools** to the chosen model through `vscode.lm`;
4. streams the text and tool-call parts back;
5. writes the usual metadata-only audit record.

**Why not orchestrate inside `@cognify`:** a participant would have to reimplement the tool-calling loop, editing, terminal access and confirmations that agent mode already provides. That is far more code and an upstream-shaped maintenance burden.

**What has to be proven first (S3-03):**
- that agent mode dispatches tool-using requests to a third-party provider's models;
- what the Copilot sign-in requirement (Sprint 2 decision **a**) means for this path;
- that the router doesn't route to its own models: the `cognify` vendor must be excluded from candidates.

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

### A. Sprint 2 carry-overs (owner)
| ID | Item | Pri | Acceptance | Closes |
|---|---|---|---|---|
| S3-01 | **Windows dev build** (was S2-01): `pnpm install` with Node 24.22.1, then `.\scripts\code.bat`. | P0 | Launches as *Cognify IDE Dev*; user data in `%APPDATA%\cognify-dev`; `.build\electron\Cognify.exe` exists. | #6 |
| S3-02 | **Signed-in session** (was S2-04): `@cognify /review` and `/explain`, the welcome line, the footer and "Why this provider?", the four personas in the picker with their handoff buttons. Repeat for S3-05 once it lands. | P0 | Results recorded in the roles matrix §6. | #8 |

### B. Role flow through the router
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S3-03 | **Spike: Cognify model provider.** Register vendor `cognify` with one model per routed role. Check dispatch from agent mode, tool calling, the picker, and the Copilot-sign-in interaction. Record the findings as an ADR-0001 amendment. | P0 | A go/no-go note. With a go, the integration harness sends a tool-carrying request to `Cognify · Coder` and it is served by a fake vendor. |
| S3-04 | **Router support for tool calls.** Requests may carry `tools` and `toolMode`. The capability filter requires `toolCalling` when tools are present. First-fragment acceptance treats a tool-call part as the first fragment, so there's no fallback after a tool call has started. The audit records the tool-call count and tool **names**, never arguments or results. | P0 | Unit tests for each rule. Integration test: a fake vendor that rate-limits before the first part falls back; one that fails after a tool-call part surfaces the error instead of re-routing. |
| S3-05 | **Personas use Cognify models.** Set `model:` in the four `.agent.md` files. Agent-mode requests get the privacy gate, fallback and audit. Without a footer in agent mode, "Why this provider?" is reached from `Cognify: Show AI Routing Log`. | P1 | The persona unit test asserts each `model:`. Integration test: a Coder persona request with a credential in context is refused by cloud vendors. |
| S3-06 | **Limited role-flow scenario:** "add a small function with a test" in a fixture workspace, run as Planner → Coder → Reviewer → Tester through the handoff prompts. | P1 | Scripted integration run with fake vendors: four routed requests, with role, task and vendor per audit record, and the handoff chain matching `ROLES`. A hands-on run is part of S3-02. |

### C. Project Cognition MVP (`PROJECT_COGNITION_MVP.md`)
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S3-07 | **Indexer core:** the `ProjectModel` v1 schema; parsers for `package.json`/pnpm workspaces, `pyproject.toml`, `go.mod`, `Cargo.toml`, GitHub workflows, test configs and convention files; budgets (5,000 files, 1 MB per file, 10 s); `coverage`; storage in `context.storageUri`. It never executes anything, and untrusted workspaces get manifests and workflows only. | P0 | Unit tests per parser on fixtures. **Monorepo scale**, an open question in #9: this repository has more than 100 `package.json` files, and indexing it either stays within budget or records truncation per folder. |
| S3-08 | **Refresh and invalidation:** debounced watchers on input globs, a content hash per input, git HEAD and branch changes, workspace-folder changes, and the commands **Show**, **Rebuild** and **Clear Project Model**. | P1 | Editing a workflow re-derives only the `ci` domain (asserted through the audit). The cache is dropped when `schemaVersion` doesn't match. |
| S3-09 | **LM tool `cognify_projectModel`:** the operations `summary`, `package(path)`, `howToTest(path)`, `ciFor(paths)` and `recentChanges()`. It applies the redaction rules (§6) and raises the privacy class (§6.5), returns prompt-sized results with evidence paths, and writes a metadata-only audit record. | P0 | Unit tests: redaction of a seeded `sk-…` token in a workflow `env:`; privacy-class propagation. The personas list the tool in `tools:`. |
| S3-10 | **Validation scenario (§7) on this repository:** "How do I build and test the package containing `extensions/cognify-ai/src/router.ts`, and which CI runs on my change?" | P0 | All six facts correct, each with evidence. No file contents in the payload. Integration test against the repository's own manifests. |

### D. Rebranding (`REBRANDING_PLAN.md`)
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| R-01 | Inventory script and CI drift check | P1 | Reproduces the S2-17 counts. CI fails on a new unclassified user-visible "VS Code" string. |
| R-02 | NLS override layer, with the table for 266 messages | P1 | A packaged build's `nls.messages.json` has no rename-class "VS Code". A stale upstream message fails the build by key. |
| R-03 | The 16 model-facing literals | P1 | The agent system prompt and tool descriptions name Cognify. Recorded in `UPSTREAM_BASELINE.md`. |
| R-04 | The 36 user-visible literals | P2 | Recorded in `UPSTREAM_BASELINE.md`. |
| R-05 | Rewords, after owner decisions. The quick win is the `chat.progressAnimation` default that shows the VS Code mark. | P2 | The decisions table is resolved. |
| R-06 | Dev-build parity, and a decision on languages | P2 | `code.sh` shows the rebranded text. |

### E. Upstream and engineering
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S3-11 | **Sprint upstream import:** run the mirror, create `vendor/sync-YYYY-MM-DD`, apply the post-sync gates, merge into `dev` with a merge commit. Per the Sprint 2 lesson, import every sprint. | P1 | A dry-run report if it isn't clean. The baseline manifest is updated if it's imported. |
| S3-12 | **Promotion at sprint end:** `dev` → `main` with a merge commit. | P1 | `dev` survives (auto-delete is off). |

## Decisions needed

All three were approved by the owner on 2026-11-04.


| # | Decision | Proposed | Why it matters |
|---|---|---|---|
| D1 ✅ | Route agent-mode personas through a **Cognify model provider**, not by running the agent loop inside `@cognify`. | Yes, if the S3-03 spike says go. Otherwise fall back to the S2-14 state: personas on the picker model, with a visible note. | It sets the architecture for the role flow and decides whether personas get privacy routing. |
| D2 ✅ | **Rebranding decisions** (`REBRANDING_PLAN.md`, "Decisions"). | Accept the proposed defaults. | Blocks R-05 only. R-01 to R-04 can start now. |
| D3 ✅ | **Scope check:** the roadmap gives Sprint 3 1.5 weeks for both the role flow and Project Cognition. | Commit to the P0s: S3-01 to S3-04, S3-07, S3-09 and S3-10. Treat the P1s as stretch in their listed order. | The full list is more than 1.5 weeks of work. |

## Suggested sequence

| Day | Work |
|---|---|
| 1 | S3-03 spike (go/no-go). S3-07 schema, plus the npm/pnpm and workflow parsers. R-01. |
| 2–3 | S3-04 router tool calls. S3-07 remaining parsers and budgets. |
| 4 | S3-09 tool with redaction and privacy. S3-05 personas on Cognify models. |
| 5 | S3-10 validation on this repository. S3-06 role-flow scenario. |
| 6 | S3-08 refresh. R-02 or R-03. S3-11 upstream import. |
| 7 | Buffer, S3-02 hands-on session, sprint review, S3-12 promotion. |

## Sprint Definition of Done

- [ ] #6 and #8 closed (S3-01, S3-02).
- [ ] A tool-carrying request from a persona is routed, can fall back, and is audited: integration test with fake vendors.
- [ ] No prompt, response, tool argument or tool result in any audit record or log (asserted by tests).
- [ ] The Project Cognition validation scenario (§7) passes on this repository, including the redaction test.
- [ ] The indexer never executes workspace code, and untrusted workspaces are limited to manifests and workflows (tested).
- [ ] `Cognify (dev)` CI green. Any `src/vs/**` or build change is recorded in `UPSTREAM_BASELINE.md`.

## Out of scope

- Autonomous multi-step runs, background agents and the agent host: deferred per the roles matrix.
- Provider-neutral chat without Copilot (options b and c).
- An embedding or semantic index: delegated to `copilot_searchCodebase`.
- Cross-repository graphs.
- The Project Launcher and environments (Sprint 4).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Agent mode won't dispatch to a third-party provider's models, or requires Copilot for it | D1 fails; personas keep the picker model | S3-03 runs first, on day 1. The fallback is documented. The participant loop stays a later option. |
| Tool-call streaming differs between vendors | Fallback or audit gaps | Treat tool-call parts like text for first-fragment acceptance. Add per-vendor fixtures to the fake-LM harness. |
| Monorepo scale (this repository) | Index exceeds its budget | Lazy indexing per folder. `coverage.truncated` per folder. Answer from the package that contains the active file first. |
| Two big themes in 1.5 weeks | Neither finishes | D3: commit to the P0s and treat the P1s as stretch. |
| Upstream import mid-sprint | Conflicts in chat files | Import early (S3-11), using the dry-run report from the weekly mirror. |
