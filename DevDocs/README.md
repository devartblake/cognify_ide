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

## Sprint 0.5 Source of Truth

Use these documents together:

- `Sprints/SPRINT_0_5_STABILIZATION_PLAN.md` — Sprint 0.5 status and exit gate (closed).
- `Sprints/SPRINT_1_PRODUCT_IDENTITY_AND_AI_FOUNDATION.md` — Sprint 1 plan (#6–#9).
- `Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md` — Sprint 3 plan, progress and outcome (closed 2026-11-05): personas routed through a Cognify model provider, router tool-call support, the Project Cognition MVP (indexer, `cognify_projectModel` tool, validation on this repository), rebranding R-01 to R-06, and the Sprint 2 carry-overs.
- `Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md` — Sprint 4 plan, progress and outcome (closed 2026-11-05; decisions D1–D5 approved; S4-01 and S4-02 carried over): the Cognify project launcher with four templates, host runtime detection, managed local execution through upstream's bundled Dev Container CLI, guided remediation, and the Sprint 3 carry-overs.
- `Sprints/SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md` — Sprint 5 plan and progress (since 2026-11-05; decisions D1–D7 approved; S5-03 to S5-09, S5-11 to S5-13 and S5-15 done, the promotion S5-14 done in #81): Run/Preview through the `cognify: run` task and upstream's integrated browser, the beginner modes Explain, Guide Me and Fix It, first-run onboarding, project-context initialization on open, and the Sprint 4 carry-overs.
- `Sprints/SPRINT_6_MVP_CERTIFICATION.md` — Sprint 6 plan (proposed 2026-11-05; waiting on decisions D1–D8): MVP certification with a CI-built Windows package, packaged-build and security gates, failure-scenario catalogs, the owner's Windows and signed-in checks (now blocking), documentation reconciliation, the certification report and go/no-go, and the `cognify-v0.1.0` release.
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
- `Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md` — (Accepted, with implementation amendments) decision to route over `vscode.lm` providers instead of a Cognify-owned provider SDK (#7).
- `Architecture/AI_PROVIDER_ROUTING_CONTRACT.md` — provider capability model, normalized request/result/error, routing policy, role map, fallback, privacy, and audit contract (#7).
- `Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md` — role map, reuse-vs-customization matrix, Reviewer role proof of concept (`extensions/cognify-ai`), test path, and prototype findings (#8).
- `Architecture/PROJECT_COGNITION_MVP.md` — Project Cognition schema, MVP index inputs/outputs, refresh/invalidation, persistence, privacy/redaction rules, and the validation scenario (#9).
- `Guides/CREATE_A_PROJECT.md` and `Guides/ENVIRONMENTS.md` — user guides (S4-12): the project templates and **Cognify: New Project...**, then Check Environment, remediation, Dev Containers and troubleshooting. Linked from the Get Started walkthrough.
- `Guides/RUN_AND_PREVIEW.md` and `Guides/ASK_COGNIFY.md` — user guides (S5-15): running a project and its preview, with troubleshooting; and Explain, Guide Me and Fix It.
- `Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md` — Sprint 4 design note: S4-03 spike results (go), covering how Cognify finds and runs the bundled Dev Container CLI from the extension host, timings, the base-image choice (official slim images), and what remains to verify.
- `Architecture/COGNIFY_PET_DESIGN.md` — (Proposed, post-MVP) Cognify's own chat pet. It reuses upstream's pet service and coordinator, and replaces only the widget, through one factory line, with a three.js or Rive/PixiJS renderer. Includes the renderer choice by avatar format, the behavior scope, performance and accessibility requirements, the plan and the open questions.

## Current Execution Gate

Sprint 0.5 closed on 2026-11-03 (#10 and #11 merged into `dev`; the `Cognify (dev)` workflow gates every PR). Sprint 1 delivered the provider contract (#7, closed) and the Project Cognition design (#9, closed). Sprint 2 (AI provider architecture) closed on 2026-11-04. It delivered the routing layer, the audit trail, `/explain`, the role personas, the upstream import (Code OSS 1.146.0, pnpm; #33), the "VS Code" string inventory and the rebranding plan. Product identity (#6) and agent roles (#8) stay open for two hands-on checks that carry over to Sprint 3: S2-01 (Windows) and S2-04 (Copilot-signed-in build). Sprint 3 closed on 2026-11-05 (`Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md`) and was promoted to `main` in #60. It delivered:
- the Cognify model provider and tool calls through the router (S3-03, S3-04);
- personas on Cognify's models (S3-05) and the scripted role flow (S3-06);
- the project model, its `cognify_projectModel` tool, validation and incremental refresh (S3-07 to S3-10);
- the rebranding, R-01 to R-06;
- the upstream import at `e5b6876` (S3-11).

Sprint 4 (`Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`) has delivered the project launcher, runtime detection, managed local Dev Containers, remediation, Project Cognition's knowledge of new projects, and the user guide (S4-03 to S4-10 and S4-12). The upstream import (`e934a7a`) is merged, and `dev` is promoted to `main` (S4-11, #71). Only the owner's hands-on checks, S4-01 and S4-02, are still open.

See `Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md` (Sprint Review) and `Backlog/GITHUB_ISSUE_MAP.md`. Keep `src/vs/**` changes narrow and recorded in `Governance/UPSTREAM_BASELINE.md`.
