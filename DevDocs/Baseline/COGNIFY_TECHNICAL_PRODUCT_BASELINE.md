# Cognify IDE Technical Product Baseline

## 1. Purpose

This baseline establishes the current technical state, architectural boundaries, MVP product thesis, and reuse-vs-build decisions for Cognify IDE after synchronizing the `dev` branch with the latest VS Code OSS source.

## 2. Current Repository Baseline

- `dev` is synchronized with `main` and currently matches the latest imported VS Code OSS baseline.
- The root `package.json` reports `code-oss-dev` version `1.138.0`.
- Current VS Code OSS infrastructure already includes modern agent-host, Copilot SDK/CLI, Dev Containers, sandbox runtime, browser workbench, MCP-oriented configuration, test runners, and extensive CI workflows.
- `product.json` still identifies the application as `Code - OSS`, so Cognify product identity work has not yet been completed.

## 3. Important Reconciliation Finding

The upstream synchronization restored several Microsoft-default governance files. The current `dev` branch should therefore be treated as technically current but not yet fully reconciled with prior Cognify Sprint 0 customization work.

Observed items requiring review:

- `.github/CODEOWNERS` currently contains upstream Microsoft ownership rules rather than a Cognify ownership policy.
- `.github/pull_request_template.md` currently contains the Microsoft VS Code OSS PR guidance rather than the previously planned Cognify-specific AI/quality checklist.
- `.github/dependabot.yml` contains the current upstream VS Code OSS dependency-update policy; Cognify-specific security policy should extend it rather than blindly replace it.
- The previously discussed `ai_pr_review.yml` is not present at the expected `.github/workflows/ai_pr_review.yml` path on current `dev` and must be reconciled before declaring Sprint 0 governance complete.
- The previously discussed root `/docs` directory is not present in the synchronized branch. Cognify-specific development documentation will now live under `/DevDocs` to reduce conflict with upstream documentation.

## 4. Product Thesis

Cognify IDE will not compete by rebuilding VS Code internals. It will differentiate through an intelligent orchestration and project-understanding layer above the proven OSS editor platform.

Core thesis:

> Extend upstream. Abstract vendors. Own the Cognify experience.

Cognify should own:

1. Product identity and branded developer experience.
2. AI provider abstraction and task routing.
3. Role-based Cognify agents.
4. Project Cognition: a persistent semantic understanding of the repository and its architecture.
5. Hybrid execution choices: local, managed local/dev-container, and later cloud workspaces.
6. Guided creation, onboarding, preview, and deployment workflows.

## 5. Reuse vs. Build Matrix

| Capability | Decision | Notes |
|---|---|---|
| Monaco/editor workbench | Reuse | Do not fork unless a product requirement cannot be met through supported workbench extension points. |
| File explorer | Reuse | Extend only where Cognify needs project intelligence overlays. |
| Integrated terminal | Reuse | Add environment/provisioning affordances instead of replacing terminal infrastructure. |
| Git/SCM | Reuse | Add Cognify workflows on top of existing SCM. |
| LSP/DAP | Reuse | Language/debug infrastructure remains upstream-owned. |
| Extension model | Reuse | Prefer built-in extensions/contributions over deep core patches. |
| Agent host/chat sessions | Reuse and extend | Cognify roles and provider routing should sit on existing agent primitives. |
| Dev Containers | Reuse | Becomes the first managed-local environment foundation. |
| Browser workbench | Reuse | Foundation for later browser/cloud workspace mode. |
| AI provider routing | Build | Cognify-owned vendor-neutral abstraction. |
| Project Cognition | Build | Cognify-owned semantic project model. |
| Product branding/identity | Build | Required for independent distribution. |
| Beginner/Learn mode | Build on chat/commands | Explain / Guide Me / Fix It interaction model. |
| Cloud workspace control plane | Defer to v1.5 | Do not burden MVP with a full Replit-class PaaS. |
| Real-time CRDT collaboration | Defer to v2 | High complexity; not required to validate MVP thesis. |

## 6. Cognify Cognitive Runtime

The long-term architecture should expose one Cognify experience while routing execution to appropriate providers and capabilities.

```text
User Intent
   |
   v
Cognify Task Planner
   |
   +-- context / privacy / quota / cost / latency / capability
   |
   v
Provider Router
   +-- GPT
   +-- Gemini
   +-- Copilot
   +-- future local/private models
   |
   v
Cognify Role Agent
   +-- Planner
   +-- Coder
   +-- Reviewer
   +-- Tester
   +-- DevOps
   +-- Tutor
   |
   v
Validation / Build / Test / Proposed Change
```

## 7. Project Cognition MVP

Project Cognition should initially model only information that materially improves coding decisions:

- repository structure and packages;
- architecture/service boundaries;
- dependency graph;
- application entry points;
- APIs and major interfaces;
- test locations and test relationships;
- CI/build commands;
- project conventions/instructions;
- recent code changes relevant to the active task.

The MVP must not attempt to replace LSP indexes or duplicate every symbol. It should consume existing VS Code/language tooling where possible and persist only Cognify-specific semantic summaries/relationships.

## 8. MVP Environment Strategy

MVP execution modes:

- **Local** — use host runtimes, SDKs, CLI tools, Docker, and local filesystem.
- **Managed Local** — Cognify Dev Container presets provide consistent runtimes without requiring manual framework setup.
- **Cloud** — architecture-ready but deferred to v1.5 except for experiments.

## 9. MVP Non-Goals

The following are intentionally excluded from the first MVP certification:

- full production hosting platform;
- multi-region cloud execution;
- live CRDT multiuser editing;
- shared terminals/debugger sessions;
- community project marketplace;
- broad education LMS functionality.

## 10. Technical Gate to Sprint 1

Sprint 1 may begin only after:

- Cognify-specific Sprint 0 configuration loss/replacement is reconciled;
- Windows build is reproducible;
- Native Watchdog/node-gyp setup is documented;
- upstream/downstream sync policy is committed;
- security/test gates are documented;
- `DevDocs` becomes the authoritative development-plan location.
