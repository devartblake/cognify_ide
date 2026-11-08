# Cognify IDE DevDocs

This directory is the authoritative development documentation for Cognify IDE. It separates Cognify product decisions from the upstream VS Code OSS documentation so upstream synchronization remains manageable.

## Structure

- `Baseline/` — technical product baseline, architectural boundaries, current repository state.
- `Roadmap/` — MVP scope, phased roadmap, release sequencing.
- `Sprints/` — Sprint stabilization and execution plans.
- `Governance/` — upstream synchronization, customization, reconciliation, AI-agent, and project-governance policies.
- `Environment/` — reproducible developer workstation/build requirements and native dependency guidance.
- `Quality/` — CI, test, security, and release-quality baselines.
- `Backlog/` — GitHub issue mapping and execution order.
- `Architecture/` — architecture decision records (ADRs) and technical contracts.

## Current Direction

Cognify IDE is a downstream product based on VS Code OSS. The project will reuse the editor, terminal, SCM, LSP/DAP, extension platform, agent-host primitives, Dev Containers, browser workbench, and testing infrastructure wherever practical. Cognify-specific engineering will concentrate on product identity, AI orchestration, Project Cognition, hybrid local/container/cloud workflows, guided onboarding, and future preview/deployment features.

## Product Principle

> Extend upstream. Abstract vendors. Own the Cognify experience.

## Documents

Start with the current sprint, [`Sprints/SPRINT_6_MVP_CERTIFICATION.md`](Sprints/SPRINT_6_MVP_CERTIFICATION.md). The documents:

- `Sprints/SPRINT_0_5_STABILIZATION_PLAN.md` — Sprint 0.5 status and exit gate (closed).
- `Sprints/SPRINT_1_PRODUCT_IDENTITY_AND_AI_FOUNDATION.md` — Sprint 1 plan (#6–#9).
- `Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md` — Sprint 3 plan, progress and outcome (closed 2026-11-05): personas routed through a Cognify model provider, router tool-call support, the Project Cognition MVP (indexer, `cognify_projectModel` tool, validation on this repository), rebranding R-01 to R-06, and the Sprint 2 carry-overs.
- `Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md` — Sprint 4 plan, progress and outcome (closed 2026-11-05; decisions D1–D5 approved; S4-01 and S4-02 carried over): the Cognify project launcher with four templates, host runtime detection, managed local execution through upstream's bundled Dev Container CLI, guided remediation, and the Sprint 3 carry-overs.
- `Sprints/SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md` — Sprint 5 plan, progress and outcome (closed 2026-11-05; decisions D1–D7 approved; S5-01 and S5-02 carried over to Sprint 6): Run/Preview through the `cognify: run` task and upstream's integrated browser, the beginner modes Explain, Guide Me and Fix It, first-run onboarding, project-context initialization on open, and the Sprint 4 carry-overs.
- `Sprints/SPRINT_6_MVP_CERTIFICATION.md` — Sprint 6 plan and progress (since 2026-11-05; decisions D1–D8 approved): MVP certification with a CI-built Windows package, packaged-build and security gates, failure-scenario catalogs, the owner's Windows and signed-in checks (now blocking), documentation reconciliation, the certification report and go/no-go, and the `cognify-v0.1.0` release.
- `Sprints/SPRINT_7_VISUAL_IDENTITY.md` — Sprint 7 plan (proposed 2026-11-06, after the MVP): Cognify's own visual identity, built in layers (design system, themes, icons, defaults, start page, then a budgeted few workbench changes).
- `../KNOWN_LIMITATIONS.md` — what the MVP doesn't do yet, and why (reconciled in S6-10).
- `Guides/README.md` — the index of user guides.
- `Quality/MVP_CERTIFICATION.md` — the MVP certification report (S6-11): each capability's evidence, the gates, the manual checks, the go conditions and the owner's go/no-go decision.
- `Quality/FAILURE_SCENARIOS.md` — the AI routing and environment failure catalogs (Sprint 6, S6-07 and S6-08): each scenario, what the user gets, and the test that covers it.
- `Quality/DEPENDENCY_ADVISORIES.md` — the high and critical advisories in dependencies inherited from upstream (Sprint 6, D7): where each ships, Cognify's exposure assessment, and the plan to fix them through upstream imports.
- `Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md` — Sprint 2 plan, item status and sprint review (closed 2026-11-04; S2-01 and S2-04 carry over).
- `../CHANGELOG.md` — notable changes per sprint and pull request; `../extensions/cognify-ai/CHANGELOG.md` for the AI extension.
- `Governance/SPRINT_0_5_RECONCILIATION_LOG.md` — what was restored, preserved, retired, or deferred after upstream sync.
- `Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` — how future Microsoft VS Code OSS updates enter Cognify.
- `Governance/UPSTREAM_BASELINE.md` — exact accepted upstream/downstream compatibility record.
- `Governance/REBRANDING_PLAN.md` — how to stop the product calling itself "VS Code": an NLS override layer for localized strings, narrow source edits for model-facing and other literals, the owner's decisions for the rewords, and Sprint 3 items R-01 to R-06 (R-01 to R-06 done).
- `Governance/VS_CODE_STRING_INVENTORY.md` (+ `vs-code-string-inventory.csv`) — inventory of the strings where the product calls itself "VS Code" (634 at S2-17, 577 after R-05), classified as rename, reword or keep. CI keeps it current (`scripts/cognify/vscode-strings.mts`).
- `Governance/UPSTREAM_SYNC_DRY_RUN_2026-11-04.md` — S2-16 rehearsal of an upstream import: 3 conflicts, plus the npm→pnpm migration that the next import requires.
- `Governance/upstream-baseline.json` — machine-readable compatibility manifest.
- `Governance/PRODUCT_IDENTITY_AND_BRANDING.md` — Cognify identifiers, downstream identity delta, and branding asset requirements (#6).
- `Governance/product-identity.json` — machine-readable identity manifest checked by `scripts/cognify/check-product-identity.mts`.
- `Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md` — Windows/native dependency baseline.
- `Quality/CI_AND_SECURITY_BASELINE.md` — minimum validation and security posture.
- `Quality/DEV_BUILD_VERIFICATION_2026-11-05.md` — dev-build sign-off on Windows before the remaining branding work: build and CI-gate results, a functional smoke test (New Project end to end), defects B1–B4 (the cognify-ai ES-module activation failure, Windows Python detection, CRLF checkouts, build output copied from templates) and their fixes, the branding items with the owner's decisions (the Agents-window icon and the dark-background small icon replaced), and the sign-off checklist. Its open checks became Sprint 6's S6-01 (Windows install, Run/Preview, Dev Containers) and S6-02 (signed-in session), both passed.
- `Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md` — (Accepted, with implementation amendments) decision to route over `vscode.lm` providers instead of a Cognify-owned provider SDK (#7).
- `Architecture/AI_PROVIDER_ROUTING_CONTRACT.md` — provider capability model, normalized request/result/error, routing policy, role map, fallback, privacy, and audit contract (#7).
- `Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md` — role map, reuse-vs-customization matrix, Reviewer role proof of concept (`extensions/cognify-ai`), test path, and prototype findings (#8).
- `Architecture/PROJECT_COGNITION_MVP.md` — Project Cognition schema, MVP index inputs/outputs, refresh/invalidation, persistence, privacy/redaction rules, and the validation scenario (#9).
- `Guides/CREATE_A_PROJECT.md` and `Guides/ENVIRONMENTS.md` — user guides (S4-12): the project templates and **Cognify: New Project...**, then Check Environment, remediation, Dev Containers and troubleshooting. Linked from the Get Started walkthrough.
- `Guides/RUN_AND_PREVIEW.md` and `Guides/ASK_COGNIFY.md` — user guides (S5-15): running a project and its preview, with troubleshooting; and Explain, Guide Me and Fix It.
- `Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md` — Sprint 4 design note: S4-03 spike results (go), covering how Cognify finds and runs the bundled Dev Container CLI from the extension host, timings, the base-image choice (official slim images), and what remains to verify.
- `Architecture/COGNIFY_CHAT_PARTICIPANT_MIGRATION.md` — (Proposed, post-MVP) moving `@cognify` off upstream's deprecated chat participants: what the participant does today, the options (custom agents, extension prompts, an agent plugin), and the recommendation of custom agents plus prompts that pin them.
- `Architecture/COGNIFY_PET_DESIGN.md` — (Proposed, post-MVP) Cognify's own chat pet. It reuses upstream's pet service and coordinator, and replaces only the widget, through one factory line, with a three.js or Rive/PixiJS renderer. Includes the renderer choice by avatar format, the behavior scope, performance and accessibility requirements, the plan and the open questions.

## Current Execution Gate

Sprint 6 (MVP certification) is in progress (`Sprints/SPRINT_6_MVP_CERTIFICATION.md`; decisions D1–D8 approved on 2026-11-05):
- The `Cognify (package)` workflow builds and checks a Windows x64 user setup and a Linux x64 archive (S6-03, S6-04). The owner installed the Windows build and checked Run/Preview on the host and in a Dev Container (S6-01, passed 2026-11-07), and used every chat role with a GitHub Copilot sign-in (S6-02, passed 2026-11-08).
- CI builds the extension the way it ships (S6-16), runs the MVP scenario end to end (S6-06), and runs CodeQL and dependency audits (S6-05). The failure catalogs are complete (S6-07, S6-08).
- The certification report (`Quality/MVP_CERTIFICATION.md`, S6-11) recommends go once its three conditions are met; the baseline is frozen at `37a8101` (S6-13). Left: the owner's manual checks (S6-09), the go/no-go decision, then the `cognify-v0.1.0` pre-release (S6-12).

Sprints 0.5 to 5 are closed; each sprint document has its outcome. The next sprint is proposed: `Sprints/SPRINT_7_VISUAL_IDENTITY.md`. Keep `src/vs/**` changes narrow and recorded in `Governance/UPSTREAM_BASELINE.md`.
