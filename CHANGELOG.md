# Changelog

Notable changes to Cognify IDE, newest first. Cognify has no tagged releases yet. Entries are grouped by sprint and reference the pull request that merged them into `dev`. Upstream `Code - OSS` changes come in through upstream syncs and are not listed here (see [`DevDocs/Governance/UPSTREAM_BASELINE.md`](DevDocs/Governance/UPSTREAM_BASELINE.md)).

The AI extension also keeps its own log: [`extensions/cognify-ai/CHANGELOG.md`](extensions/cognify-ai/CHANGELOG.md).

## [Unreleased]

### Sprint 5: Run/Preview and onboarding (in progress)

Plan: [`DevDocs/Sprints/SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md`](DevDocs/Sprints/SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md). The owner approved decisions D1–D7 on 2026-11-05.

#### Added

- **Upstream import (S5-13).** Cognify now includes Microsoft's VS Code changes up to `37a8101` (2026-11-05), 22 commits: terminal and task fixes, memory-leak fixes, and agent-host and Agents-window updates. The merge was clean, with no new "VS Code" text.
- **See your changes without restarting (S5-06).** New FastAPI and ASP.NET Core projects reload when you save; refresh the preview to see the change.
- **User guide (S5-15).** [Run and preview](DevDocs/Guides/RUN_AND_PREVIEW.md) and [Ask Cognify](DevDocs/Guides/ASK_COGNIFY.md), linked from the Get Started walkthrough.
- **A first run that starts in the right place (S5-11, S5-12).** The first time Cognify IDE runs, it opens the Get Started walkthrough, which now also covers running a project and asking Cognify for help. When a trusted folder opens, Cognify learns how it builds, runs and tests in the background, so the first question is answered quickly. Turn that off with `cognify.projectModel.indexOnOpen`.
- **Explain, Guide Me and Fix It (S5-07 to S5-09).** Ask `@cognify /guide` for step-by-step help toward a goal, using the project's own commands, or `@cognify /fix` to have an error explained and a fix proposed. **Fix with Cognify** appears on errors in the editor and when a project command fails, and **Explain with Cognify** in the editor's right-click menu. Fixes are proposed for you to apply; Cognify never edits or runs anything by itself.
- **Run a project and see it (S5-04, S5-05).** **Cognify: Run Project**, or **▶ Run** in the status bar, starts the app, waits until it answers, and opens it beside the code. The status bar shows that it's running and on which port, with **Stop**. If the port is taken or the app doesn't start, Cognify says so.
- **Previews open inside the editor (S5-03 spike).** Cognify can open a running app in VS Code's integrated browser, beside the code, and reuses the same tab when the app is opened again. Where the integrated browser isn't available (the web build), it uses Simple Browser or the system browser.

### Sprint 4: Project launcher and environments (closed 2026-11-05)

Plan: [`DevDocs/Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](DevDocs/Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md).

#### Added

- **Sprint 5 plan.** `DevDocs/Sprints/SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md` plans Run/Preview (the project's run task, then the app in upstream's integrated browser), the beginner modes Explain, Guide Me and Fix It, first-run onboarding, and indexing a project when it opens. It waits on decisions D1–D7.
- **Upstream import (S4-10, #69).** Cognify now includes Microsoft's VS Code changes up to `e934a7a` (2026-11-05), 11 commits to chat, the agent host and the Agents window. The merge was clean, with no new "VS Code" text.
- **User guide (S4-12).** Two new pages, [Create a project](DevDocs/Guides/CREATE_A_PROJECT.md) and [Environments](DevDocs/Guides/ENVIRONMENTS.md), cover the templates, New Project, Check Environment, Dev Containers and troubleshooting. The Get Started walkthrough links to them.
- **Cognify's AI knows how your new project builds and runs (S4-09).** For a project made with New Project, the `cognify_projectModel` tool answers how to test it, and now how to run it, with the template's own commands and whether they run on this machine or in the Dev Container. This covers the ASP.NET Core and Flutter templates too.
- **Help installing missing tools (S4-08).** In **Cognify: Check Environment**, pick a missing or outdated tool to get the install command for your system, typed into a terminal for you to run, copied, or as the official install page, or to use a Dev Container instead. Cognify never installs anything itself.
- **Build, test and run in a Dev Container (S4-07).** A Cognify project's install, build, test and run commands are tasks, and run in the project's Dev Container when it has one: Cognify starts the container, runs the command, and shows the output in the terminal. **Cognify: Start Environment**, **Stop Environment**, **Rebuild Environment** and **Run in Environment...**. Checked by hand: a new FastAPI project's tests pass in its container.
- **Cognify: New Project... (S4-05).** Pick a template, a name and a folder, then choose to build and run on this machine or in a Dev Container. Cognify creates the project and opens it, and never writes into a folder that already has files. Also in the Explorer of an empty window and in the new **Get Started with Cognify IDE** walkthrough.
- **Project templates (S4-04).** Four starter projects: FastAPI, Next.js, ASP.NET Core and Flutter (web). Each has pinned, current versions and a ready-to-use Dev Container. All four were built and tested inside their containers.
- **Cognify: Check Environment (S4-06).** Shows which development tools are installed, with versions, and which templates this machine can build, or run in a Dev Container when Docker is running. It runs only the tools' version commands.
- **Managed local environments are feasible (S4-03 spike).** Cognify can drive the Dev Container CLI that ships with the product, from its AI extension, with no dependency on Microsoft's proprietary Dev Containers extension. A Python preset starts in 2.5 s and runs a command in 0.7 s once its image is pulled. Presets will use slim official images. Findings: `DevDocs/Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`.

### Sprint 3: Agent orchestration and Project Cognition (closed 2026-11-05)

Plan: [`DevDocs/Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md`](DevDocs/Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md).

#### Added

- **Upstream import (S3-11, #58).** Cognify now includes Microsoft's VS Code changes up to `e5b6876` (2026-11-04), 119 commits. The new "VS Code" text in the Agents window's Extensions section reads "Cognify IDE" in packaged builds.
- **Sprint 4 plan.** `DevDocs/Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md` plans the project launcher and environments: four templates, runtime detection, managed local Dev Containers through the bundled open-source CLI, and guided remediation. It waits on decisions D1–D5.
- **Cognify pet design note (proposed).** `DevDocs/Architecture/COGNIFY_PET_DESIGN.md` plans Cognify's own chat companion, to replace upstream's VS Code pet: a three.js or Rive/PixiJS widget plugged into upstream's pet plumbing through one factory line. It is listed as a post-MVP (v1.5) item in the roadmap, and needs the owner's avatars and a name before it can start.
- **Preview the rebranded UI in development builds (R-06).** Run `COGNIFY_DEV_REBRAND=1 pnpm run transpile-client`, then `./scripts/code.sh`. Dev builds otherwise keep upstream's English, so tests are unaffected. Built-in extensions show the rebranded text in packaged builds only. Rebranding is English-only for now: Microsoft's language packs still say "VS Code" in their language (owner's decision, to revisit after the MVP).
- **The rest of the "VS Code" text is resolved (R-05).**
  - **Chat pet:** the VS Code pet (Blobby) can no longer be turned on.
  - **Progress animation:** chat's progress animation defaults to the style without the VS Code mark.
  - **Issue reporter:** it says "Cognify IDE" and "Cognify IDE version".
  - **Welcome text:** the Git welcome views, the remote-connection settings and the web walkthrough name Cognify IDE. Accurate links to VS Code docs and Microsoft services stay.
  - **Strings left as they are:** the newsletter, Remote Tunnels and Insiders switching are inactive in Cognify, so their text stays. The inventory records why each one is kept.
- **More of the UI says Cognify IDE (R-04).** Hard-coded text outside the translation system now names Cognify IDE: agent-host window and client names, Agent Merge replies, policy diagnostics, the built-in extension notice, the `extensions.json` and trusted-domains templates, Codex and MCP gateway names, and walkthrough image descriptions. Every rename-class "VS Code" string is now handled, either by these source edits or by the R-02 override table.
- **The AI says it runs in Cognify IDE (R-03).** The agent's system prompt, and the tool descriptions sent to the model (tasks, tests, terminal sandbox, extensions, MCP configuration, automations, sessions and the chat background), now name Cognify IDE instead of VS Code. Asked what it is, the agent answers "an AI assistant using Copilot SDK in Cognify IDE". These are narrow source edits, recorded in `UPSTREAM_BASELINE.md`.
- **Packaged builds stop calling the app "VS Code" (R-02).** Messages and setting descriptions that refer to the running app now say Cognify IDE, for example "Please restart Cognify IDE before reinstalling…". This covers 256 messages in the workbench and in built-in extensions. They are replaced by key at build time from a reviewed table (`build/cognify/nls-rebrand.json`), so upstream source stays untouched. If upstream changes one of those messages, the build fails and names it. Development builds (`code.sh`) still show the original text until R-06.
- **CI guards against new "VS Code" strings (R-01).** `scripts/cognify/vscode-strings.mts` keeps the S2-17 string inventory current. CI fails when a change, including an upstream import, adds a user-visible "VS Code" string that hasn't been reviewed. Run it with `--write` to add reviewed strings to the inventory.
- **The role flow is tested end to end (S3-06).** A scripted run takes a small task from Planner to Coder to Reviewer to Tester, using the real persona files and their handoffs. Each step is routed to the provider its role prefers and recorded in the audit log.
- **The project model stays current (S3-08).** Editing a manifest, CI workflow or convention file updates Cognify's project model within a few seconds, re-reading only that file. New commands: **Show**, **Rebuild** and **Clear Project Model**.
- **Tool use in the routing log (S3-04).** For agent-mode requests, the audit trail and "Why this provider?" now show how many tools were offered and which tools the model called, by name only. Tool arguments and results are never recorded.
- **Personas now use Cognify's routing (S3-05).** Cognify Planner, Coder, Reviewer and Tester run on Cognify's own models, so their requests in agent mode get task-based provider choice, fallback, the privacy check and an audit record, the same as `@cognify` commands. See which provider served each request with **Cognify: Show AI Routing Log**.
- **Project Cognition validated (S3-10).** Asked how to build and test `extensions/cognify-ai/src/router.ts` and which CI runs for a change to `dev`, the tool now answers correctly from this repository. It names the package, the `pnpm` build and test commands, and the `Cognify (dev)` job and test step. It also explains why Microsoft's `pr.yml` doesn't run: it only runs on `main` and `release/*`.
- **Ask the project model (S3-09).** Cognify's personas, and any agent, can now ask how this workspace is built and tested, and which CI runs for a change, through the `cognify_projectModel` tool (`#projectModel`). Answers cite their sources and never include file contents or secrets.
- **Project Cognition indexer (S3-07).** Cognify can now build a structural model of a workspace: packages, scripts, dependencies, entry points, tests, CI pipelines and conventions. It uses manifests and configuration only, and never contains file contents or secrets. It indexes this repository in under a second. Roles will query it in a later Sprint 3 item.
- **Cognify role models (S3-03).** The model picker now offers `Cognify · Planner`, `Coder`, `Reviewer` and `Tester`. Agent-mode requests to them go through Cognify's router, with their tools: privacy gate, fallback and audit record. The privacy gate also scans tool results, such as file contents read by a tool.

#### Documentation

- **Sprint 3 plan.**
  - The role personas would run through the Cognify router via a Cognify model provider (vendor `cognify`, one model per role), so agent mode keeps the tool loop and Cognify keeps routing, privacy and audit.
  - It adds router support for tool calls.
  - It implements the Project Cognition MVP and validates it on this repository.
  - It includes rebranding R-01 to R-06 and the Sprint 2 carry-overs S2-01 and S2-04.
  - It starts after the owner decisions D1–D3.

### Sprint 2: AI provider architecture (closed 2026-11-04)

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

- **Rebranding plan:** `DevDocs/Governance/REBRANDING_PLAN.md` turns the S2-17 inventory into five phases:
  - tooling with a CI drift check;
  - an NLS override layer for the 266 localized renames;
  - narrow source edits, starting with the 16 strings sent to the AI model;
  - the rewords, after owner decisions;
  - dev-build parity and a decision on languages.

  It proposes a default for each reword area and Sprint 3 items R-01 to R-06.
- **"VS Code" string inventory (S2-17, #38):** `DevDocs/Governance/VS_CODE_STRING_INVENTORY.md`, with every string as a row in `vs-code-string-inventory.csv`. It covers 634 places where the product calls itself "VS Code", in `src/vs` and the built-in extensions' `package.nls.json`.
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
