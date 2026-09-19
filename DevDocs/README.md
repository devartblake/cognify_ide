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

## Current Direction

Cognify IDE is a downstream product based on VS Code OSS. The project will reuse the editor, terminal, SCM, LSP/DAP, extension platform, agent-host primitives, Dev Containers, browser workbench, and testing infrastructure wherever practical. Cognify-specific engineering will concentrate on product identity, AI orchestration, Project Cognition, hybrid local/container/cloud workflows, guided onboarding, and future preview/deployment features.

## Product Principle

> Extend upstream. Abstract vendors. Own the Cognify experience.

## Sprint 0.5 Source of Truth

Use these documents together:

- `Sprints/SPRINT_0_5_STABILIZATION_PLAN.md` — current status and exit gate.
- `Governance/SPRINT_0_5_RECONCILIATION_LOG.md` — what was restored, preserved, retired, or deferred after upstream sync.
- `Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` — how future Microsoft VS Code OSS updates enter Cognify.
- `Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md` — Windows/native dependency baseline.
- `Quality/CI_AND_SECURITY_BASELINE.md` — minimum validation and security posture.

## Current Execution Gate

Sprint 0.5 implementation is substantially complete on `feature/sprint0.5-stabilization`. Remaining work is final branch-head validation and PR/CI review. Do not begin broad Cognify `src/vs/...` product modifications until that gate is closed.
