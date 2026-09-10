# Cognify IDE DevDocs

This directory is the authoritative development documentation for Cognify IDE. It separates Cognify product decisions from the upstream VS Code OSS documentation so upstream synchronization remains manageable.

## Structure

- `Baseline/` — technical product baseline, architectural boundaries, current repository state.
- `Roadmap/` — MVP scope, phased roadmap, release sequencing.
- `Sprints/` — Sprint 0.5 stabilization and Sprint 1 execution plans.
- `Governance/` — upstream synchronization, customization, AI-agent, quality, and security policies.
- `Backlog/` — GitHub issue mapping and execution order.

## Current Direction

Cognify IDE is a downstream product based on VS Code OSS. The project will reuse the editor, terminal, SCM, LSP/DAP, extension platform, agent-host primitives, Dev Containers, browser workbench, and testing infrastructure wherever practical. Cognify-specific engineering will concentrate on product identity, AI orchestration, Project Cognition, hybrid local/container/cloud workflows, guided onboarding, and future preview/deployment features.

## Product Principle

> Extend upstream. Abstract vendors. Own the Cognify experience.

## Current Execution Gate

Before feature development begins, complete Sprint 0.5 to reconcile Cognify-specific setup changes after the latest upstream synchronization, confirm build/security/test baselines, and establish the ongoing upstream/downstream sync policy.
