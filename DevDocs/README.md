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
- `Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md` — Sprint 3 plan and progress (in progress since 2026-11-04): personas routed through a Cognify model provider, router tool-call support, the Project Cognition MVP (indexer, `cognify_projectModel` tool, validation on this repository), rebranding R-01 to R-06, and the Sprint 2 carry-overs.
- `Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md` — Sprint 2 plan, item status and sprint review (closed 2026-11-04; S2-01 and S2-04 carry over).
- `../CHANGELOG.md` — notable changes per sprint and pull request; `../extensions/cognify-ai/CHANGELOG.md` for the AI extension.
- `Governance/SPRINT_0_5_RECONCILIATION_LOG.md` — what was restored, preserved, retired, or deferred after upstream sync.
- `Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` — how future Microsoft VS Code OSS updates enter Cognify.
- `Governance/UPSTREAM_BASELINE.md` — exact accepted upstream/downstream compatibility record.
- `Governance/REBRANDING_PLAN.md` — how to stop the product calling itself "VS Code": an NLS override layer for localized strings, narrow source edits for model-facing and other literals, the owner's decisions for the rewords, and Sprint 3 items R-01 to R-06 (R-01 to R-05 done or in review).
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

## Current Execution Gate

Sprint 0.5 closed on 2026-11-03 (#10 and #11 merged into `dev`; the `Cognify (dev)` workflow gates every PR). Sprint 1 delivered the provider contract (#7, closed) and the Project Cognition design (#9, closed). Sprint 2 (AI provider architecture) closed on 2026-11-04. It delivered the routing layer, the audit trail, `/explain`, the role personas, the upstream import (Code OSS 1.146.0, pnpm; #33), the "VS Code" string inventory and the rebranding plan. Product identity (#6) and agent roles (#8) stay open for two hands-on checks that carry over to Sprint 3: S2-01 (Windows) and S2-04 (Copilot-signed-in build). Sprint 3 is in progress (`Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md`); the owner approved decisions D1–D3 on 2026-11-04.
- **Done:**
  - the Cognify model provider and tool calls through the router (S3-03, S3-04);
  - personas on Cognify's models (S3-05) and the scripted role flow (S3-06);
  - the project model, its `cognify_projectModel` tool, validation and incremental refresh (S3-07 to S3-10);
  - the "VS Code" string check (R-01), the NLS override layer (R-02), and the model-facing and UI renames (R-03, R-04).
- **In review:** R-05.
- **Still open:**
  - the owner's hands-on checks (S3-01, S3-02);
  - the upstream import and promotion (S3-11, S3-12);
  - R-06. See `Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md` (Sprint Review) and `Backlog/GITHUB_ISSUE_MAP.md`. Keep `src/vs/**` changes narrow and recorded in `Governance/UPSTREAM_BASELINE.md`.
