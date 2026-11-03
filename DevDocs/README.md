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

- `Sprints/SPRINT_0_5_STABILIZATION_PLAN.md` — current status and exit gate.
- `Governance/SPRINT_0_5_RECONCILIATION_LOG.md` — what was restored, preserved, retired, or deferred after upstream sync.
- `Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` — how future Microsoft VS Code OSS updates enter Cognify.
- `Governance/UPSTREAM_BASELINE.md` — exact accepted upstream/downstream compatibility record.
- `Governance/upstream-baseline.json` — machine-readable compatibility manifest.
- `Governance/PRODUCT_IDENTITY_AND_BRANDING.md` — Cognify identifiers, downstream identity delta, and branding asset requirements (#6).
- `Governance/product-identity.json` — machine-readable identity manifest checked by `scripts/cognify/check-product-identity.mjs`.
- `Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md` — Windows/native dependency baseline.
- `Quality/CI_AND_SECURITY_BASELINE.md` — minimum validation and security posture.
- `Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md` — decision to route over `vscode.lm` providers instead of a Cognify-owned provider SDK (#7).
- `Architecture/AI_PROVIDER_ROUTING_CONTRACT.md` — provider capability model, normalized request/result/error, routing policy, role map, fallback, privacy, and audit contract (#7).

## Current Execution Gate

Sprint 0.5 closed on 2026-11-03 (#10 and #11 merged into `dev`; the `Cognify (dev)` workflow gates every PR). Sprint 1 is in progress: product identity (#6), AI provider contract (#7), agent roles (#8), and Project Cognition (#9). Keep `src/vs/**` changes narrow and recorded in `Governance/UPSTREAM_BASELINE.md`.
