# Sprint 2: AI Provider Architecture

- **Status:** In progress (updated 2026-11-03; see [Progress](#progress))
- **Duration:** 1.5 weeks (about 7 working days), per `REVISED_MVP_ROADMAP.md`
- **Inputs:** follow-ups recorded in the Sprint 1 documents:
  - [`ADR-0001`](../Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md) and [`AI_PROVIDER_ROUTING_CONTRACT.md`](../Architecture/AI_PROVIDER_ROUTING_CONTRACT.md) (#7)
  - [`AGENT_ROLES_AND_REUSE_MATRIX.md`](../Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md) (#8)
  - [`PROJECT_COGNITION_MVP.md`](../Architecture/PROJECT_COGNITION_MVP.md) (#9)
  - [`PRODUCT_IDENTITY_AND_BRANDING.md`](../Governance/PRODUCT_IDENTITY_AND_BRANDING.md) (#6)
  - [`CI_AND_SECURITY_BASELINE.md`](../Quality/CI_AND_SECURITY_BASELINE.md)

## Sprint Goal

Turn the Sprint 1 routing contract and Reviewer prototype into a **working, tested provider layer** in `extensions/cognify-ai`. Every Cognify AI request is routed by task, privacy, preference, and provider health; normalized on failure; and recorded in an audit trail. Close the Sprint 1 issues that still need hands-on verification (#6, #8).

## Sprint 1 Exit State (starting point)

| Issue | State | What remains |
|---|---|---|
| #6 Product identity | Code merged (#12) | Windows dev-build check; branding artwork |
| #7 Provider contract | ✅ Closed (#13) | Implementation (this sprint) |
| #8 Agent roles | Prototype merged (#14) | Copilot sign-in UX (decision **a**) and end-to-end `@cognify /review` check |
| #9 Project Cognition | ✅ Closed (#15) | Implementation is Sprint 3 (roadmap) |
| Lint headers | ✅ Merged (#16) | none |

Decisions already taken that constrain this sprint:

- **Copilot gating, option (a):** a Copilot sign-in is an MVP prerequisite for chat-based Cognify roles (`AGENT_ROLES_AND_REUSE_MATRIX.md`, finding 1).
- **Cognify owns policy, not transport:** no Cognify HTTP clients; route over `vscode.lm` vendors (ADR-0001).
- **No `src/vs/**` changes** are planned. Any that become necessary are recorded in `UPSTREAM_BASELINE.md`.

## Progress

| ID | State | Pull request | Notes |
|---|---|---|---|
| S2-01 | Waiting on the user | n/a | Needs the Windows reference machine. |
| S2-02 | ✅ Done | #18, #19 | Artwork from the supplied logos. A dark-background small icon is still requested from design. |
| S2-03 | ✅ Done | #26, #28 | Participant description, a one-time activation warning, and `Cognify: Check AI Setup`. **No `chatViewsWelcome` entry**: see `AGENT_ROLES_AND_REUSE_MATRIX.md`, finding 1. #28 adds the chat-panel line through an additive core seam instead (recorded in `UPSTREAM_BASELINE.md`). |
| S2-04 | Waiting on the user | n/a | Needs a Copilot-signed-in build. |
| S2-05 | Not started | | |
| S2-06 | ✅ Done | #21 | Capability, context and pin filters; per-provider token counts; routing deadline. |
| S2-07 | ✅ Done | #22 | Vendor error tables, retry hints, persistent cooldowns with backoff. |
| S2-08 | ✅ Done | #23 | `cognify.ai.*` settings. Adds `cognify.ai.pinnedModel`, needed for `fallbackWhenPinned` to be usable. |
| S2-09 | ✅ Done | #24 | Contract scenario 4 passes. Adds `cognify.privacy.confidentialWorkspace` (contract section 8) alongside `localOnly`. Only `ollama` counts as local. |
| S2-10 | ✅ Done | #20 | Fake vendors are `gemini`, `openai`, `copilot` and `ollama` (real vendor ids) rather than `fake-*`, so vendor rules and the role map apply unchanged. |
| S2-11 | ✅ Done | #27 | Contract scenario 9 passes. The router records every request, so API callers are covered too. The export is asserted to contain no prompt, response or provider error text. Also adds `Clear AI Routing Log`. |
| S2-12 to S2-17 | Not started | | |

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

### A. Close Sprint 1 carry-overs

| ID | Item | Pri | Acceptance | Source |
|---|---|---|---|---|
| S2-01 | **Verify Windows dev build identity.** Run `.\scripts\code.bat` on the Windows reference machine with a plain `npm install`. | P0 | App launches as *Cognify IDE Dev*; user data in `%APPDATA%\cognify-dev`; `.build\electron\Cognify.exe` exists; plain `npm install` succeeds (closes Sprint 0.5 residual R1). Results recorded in `WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md`. | #6, #10 R1 |
| S2-02 | **Branding artwork from the supplied logo** (see "Branding Assets" below). | P0 | All asset paths in the branding doc replaced at the same sizes; masters and provenance committed; identity check extended to assert the Code - OSS icon hashes are gone. | #6 |
| S2-03 | **Copilot sign-in prerequisite UX.** The participant handler never runs when no model is available, so surface the requirement up front: participant description, a `chatViewsWelcome` entry shown when no model is available, a `Cognify: Check AI Setup` command (sign-in state, available vendors, BYOK keys present yes/no, never key values), and a README note. | P0 | On a signed-out build, the user sees the prerequisite before hitting "Language model unavailable". `Check AI Setup` reports correct state on signed-in and signed-out builds. | #8 finding 1 |
| S2-04 | **End-to-end `@cognify /review`** on a Copilot-signed-in dev build. | P0 | Review streams; footer shows role, task, provider, outcome; "Cognify AI" log has a metadata-only record. Then close #8 (if S2-10 lands, its fake-provider test is the CI equivalent). | #8 |
| S2-05 | Mark ADR-0001 **Accepted**, with any amendments from implementation. | P1 | ADR status updated; deviations listed. | #13 |

### B. Provider architecture (roadmap Sprint 2 scope)

All items live in `extensions/cognify-ai` and implement the routing contract section by section.

| ID | Item | Pri | Acceptance | Contract § |
|---|---|---|---|---|
| S2-06 | **Router: full routing algorithm.** Discover → privacy filter → pin → capability filter (from model metadata: tool calling, vision, `maxInputTokens`) → health → rank → execute → record. Pre-flight token count with `LanguageModelChat.countTokens` (replaces chars ÷ 4). Overall `deadlineMs`. | P0 | Unit tests for every filter; scenarios 1, 3, 6, 7 pass. | 2, 4, 6 |
| S2-07 | **Per-vendor error mapping tables** for `copilot`, `openai`, `gemini`, `anthropic`, `ollama`, with recorded error fixtures. **Persistent cooldowns** (`globalState`, expiry-based) and backoff for `unavailable`: 60 s, doubling to a 15 min cap. | P0 | One fixture test per vendor × error kind; cooldowns survive reload; backoff covered by tests. | 4 |
| S2-08 | **User preferences and settings:** `cognify.ai.preferredVendor`, `cognify.ai.disabledVendors`, `cognify.ai.trustedVendors`, `cognify.ai.maxCostTier`, `cognify.ai.fallbackWhenPinned` (default `false`). Localized descriptions. | P0 | Settings change routing without reload; scenario 3 passes; pinned-model behaviour matches scenario 7. | 6 |
| S2-09 | **Privacy gate:** `cloud` / `cloud-trusted` / `local-only` classes; secret-pattern detection on outgoing context; `cognify.privacy.localOnly`; the class is never relaxed. | P0 | Scenario 4 passes (no cloud attempt); a seeded fake `sk-…` token in context forces `local-only` or blocks; tests. | 8 |
| S2-10 | **Integration test harness:** extension-host test with a fake `LanguageModelChatProvider` (vendors `fake-gemini`, `fake-openai`, `fake-local`), driving the router through real `vscode.lm` calls. Covers contract scenarios 1–9 end to end. | P0 | Runs in CI. Either extend `Cognify (dev)` with an Electron/Xvfb job or add a separate job; record its duration. | 11 |
| S2-11 | **Audit trail:** bounded ring buffer in workspace storage (contract `CognifyRouteAuditRecord`), `Cognify: Export AI Routing Log` (JSON), no content fields; schema version. | P1 | Scenario 9 passes; an export contains no prompt or response text (asserted by test). | 9 |
| S2-12 | **Route explanation in UI:** a "Why this provider?" footer link or hover showing the route `reason` and attempts. | P1 | Visible for every `@cognify` response. | 4, 6 |
| S2-13 | **Second role command on the router:** `@cognify /explain` (Tutor, task `explain`) to prove the router is role-agnostic. | P2 | Same trace footer and audit; unit and integration coverage. | 3, 5 |
| S2-14 | **Role personas as data:** `.agent.md` files for Planner/Coder/Reviewer/Tester contributed through `contributes.chatAgents`, with `handoffs` that follow the role map. No orchestration code (the full role flow is Sprint 3). | P2 | Personas appear in the agent picker; handoff buttons work; validated by the upstream prompt validator. | Matrix §2 |

### C. Engineering hygiene

| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S2-15 | Rename `extensions/cognify-ai/src/test/*.test.ts` to `.mts` (or add a test `package.json` with `"type": "module"`) to remove Node's `MODULE_TYPELESS_PACKAGE_JSON` reparse warning in CI. | P2 | CI log shows no reparse warning. |
| S2-16 | **First quarantined upstream sync dry run.** `upstream/main` has moved since the baseline (`832cf23…` → `aee59f2…`). Rehearse the `chore/upstream-vscode-sync-YYYY-MM-DD` flow and record conflicts in Cognify zones. Don't merge unless clean. | P2 | Dry-run report in `DevDocs/Governance/`; baseline manifest updated only if the sync is accepted. |
| S2-17 | **Hard-coded "VS Code" string inventory:** classify the ~300 strings (`src/vs` ~193, extension `package.nls.json` ~93, walkthroughs ~18) as rename / keep / reword. No code changes. | P2 | Inventory table in DevDocs; feeds a later rebranding plan. |

## Branding Assets (S2-02)

Supplied artwork (2026-11-03):

| Asset | Size / format | Notes |
|---|---|---|
| Icon ("C" with circuit traces and `</>` mark) | 1254 × 1254 PNG, transparent background | Good master for raster icons (ICO, ICNS up to 1024, PNG 512/192/150/70) |
| Wordmark ("Cognify **IDE**") | 2172 × 724 PNG, transparent background | Dark navy "Cognify" text is unreadable on dark backgrounds, so a light-text variant is needed for dark-theme surfaces |

Work and open needs:

1. Commit the masters under `resources/cognify/brand/` with a `PROVENANCE.md` recording the source, owner, and license (Cognify-owned artwork, not MIT-derived).
2. Generate the raster set listed in `PRODUCT_IDENTITY_AND_BRANDING.md`: `code.ico`, the Start tiles, Inno Setup bitmaps, `code.icns`, `resources/linux/code.png`, and the `resources/server` PNG and favicon files. Keep the file names so no build changes are needed.
3. **Small-size legibility:** the glow and gradients won't read at 16–32 px. Produce a simplified small-size variant (flat "C" + `</>`, no glow) for 16/24/32 px ICO frames and the favicon.
4. **Vector needed:** `src/vs/workbench/browser/media/code-icon.svg` and the four `letterpress-*.svg` watermarks must be SVG. Monochrome versions are needed for the watermarks and high-contrast themes. **Ask the designer for an SVG source.** Auto-tracing the PNG is a fallback, not the plan.
5. Light-text wordmark variant for dark surfaces (README dark mode, future website).

## Suggested Sequence

| Day | Focus |
|---|---|
| 1 | S2-01 (Windows check, user), S2-03 sign-in UX, start S2-10 harness |
| 2 | S2-10 harness in CI; S2-06 filters and pre-flight |
| 3 | S2-06 completion; S2-07 vendor error tables and fixtures |
| 4 | S2-07 persistent cooldowns/backoff; S2-08 settings |
| 5 | S2-09 privacy gate; scenarios 4 and 6 |
| 6 | S2-11 audit/export; S2-04 end-to-end check (needs signed-in build); S2-02 raster assets |
| 7 | S2-12 explanation UI; buffer; sprint review; stretch items (S2-13–S2-17) if time allows |

S2-02 can run in parallel at any point once SVG sources are available.

## Sprint Definition of Done

- [ ] Contract scenarios 1–9 pass in the integration harness, in CI.
- [ ] Unit tests cover every routing filter, each vendor's error table, cooldown/backoff, and the privacy gate.
- [ ] `@cognify /review` verified end to end on a signed-in build; #8 closed.
- [ ] Windows dev build verified; branding assets replaced; #6 closed.
- [ ] Signed-out users see the Copilot prerequisite before the generic error.
- [ ] No prompt/response text in any audit record or log (asserted by tests).
- [ ] No secrets committed; settings use `SecretStorage` only through provider extensions.
- [ ] `Cognify (dev)` CI green: typecheck, node tests, lint, extension unit tests, integration harness, identity, baseline.
- [ ] Any `src/vs/**` or build-file change recorded in `UPSTREAM_BASELINE.md` and `upstream-baseline.json`.

## Out of Scope (moved to Sprint 3)

Project Cognition implementation (`cognify_projectModel` tool, indexer, refresh) and the multi-role Planner → Coder → Reviewer → Tester flow, per the roadmap's Sprint 3. Also out of scope: provider-neutral chat without Copilot (options b/c in the roles matrix), cost/latency-weighted routing, and enterprise policy.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Copilot BYOK unavailable for enterprise Copilot accounts (`isClientBYOKAllowed`) | GPT/Gemini routes disappear | Router degrades to available vendors; `Check AI Setup` explains it; a Cognify-owned provider is a later option (ADR-0001) |
| Integration harness needs Electron + Xvfb in CI | Longer CI | Separate job; cache Electron; measure in S2-10 |
| Vendor error messages change | Mis-classified errors | Fixture tests per vendor; `unknown` falls back once and is logged for mapping |
| No SVG logo source | Workbench icon/watermark blocked | Ship raster assets first; track SVG as a dependency |
| Upstream drift while Sprint 2 runs | Larger later sync | S2-16 dry run surfaces conflicts early |
