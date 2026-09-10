# Sprint 1 — Product Identity and AI Foundation

## Sprint Goal

Create the first recognizably Cognify-specific product layer on top of the current VS Code OSS baseline while proving that Cognify can reuse upstream agent-host capabilities and remain AI-provider neutral.

## Duration

1 focused week after Sprint 0.5 exit criteria are met.

## Backlog

### Issue #6 — Establish Cognify product identity and branding baseline

Priority: P0

Deliverables:
- Update `product.json` naming/application identifiers for Cognify.
- Define Cognify data directories, URL protocol, Windows names/IDs, and future macOS/Linux identifiers.
- Replace upstream product/reporting URLs where Cognify needs ownership.
- Update top-level README to describe Cognify while preserving VS Code OSS/MIT attribution.
- Define branding asset requirements.

Acceptance focus:
- Cognify launches under its own identity.
- Cognify does not collide with Code - OSS application/data/protocol identifiers.
- Build remains green.

### Issue #7 — Define Cognify AI provider abstraction and routing contract

Priority: P0

Deliverables:
- Provider capability interface.
- Normalized request/result/error model.
- Basic routing inputs: task, quota/availability, user preference, privacy, latency, and future cost controls.
- Explicit provider roles for GPT, Gemini, and Copilot.
- Updated quota/fallback strategy based on routing rather than ad-hoc prompt repetition.

MVP provider roles:
- GPT: architecture, cross-file reasoning, requirements, complex code/problem analysis.
- Copilot: in-editor edits, localized implementation, tests, refactors, VS Code-native workflow.
- Gemini: independent technical review, alternate reasoning, structured/configuration assistance, quota fallback.
- Bolt: contingency/fallback only; not part of the primary runtime architecture unless later justified.

### Issue #8 — Prototype Cognify agent roles on current VS Code agent host

Priority: P1

Deliverables:
- Role map: Planner, Coder, Reviewer, Tester, DevOps, Tutor.
- Reuse-vs-customization assessment for current VS Code agent-host/session primitives.
- One working Cognify role proof of concept.
- Traceability metadata: task, role, provider, result state.

Architecture rule:

Do not create a parallel chat/agent framework if current upstream primitives can support the requirement.

### Issue #9 — Define Project Cognition MVP model and indexing boundaries

Priority: P1

Deliverables:
- Semantic project schema.
- Data sources and refresh triggers.
- Privacy/context-export rules.
- A single validation scenario for repository-aware reasoning.

Initial semantic domains:
- structure/packages;
- services/components;
- dependencies;
- entry points;
- APIs/interfaces;
- tests;
- build/CI;
- project conventions;
- relevant recent changes.

## Suggested Daily Sequence

### Day 1
- Complete product identity design decisions.
- Create exact `product.json` change manifest.
- Define upstream-safe customization boundaries.

### Day 2
- Implement and validate Windows Cognify identity.
- Update README/attribution.
- Run build/smoke gate.

### Day 3
- Define AI provider interface and routing contract.
- Update AI handoff/fallback documentation.

### Day 4
- Map existing agent-host primitives.
- Implement one Cognify role PoC.

### Day 5
- Define Project Cognition schema/boundaries.
- Run Sprint review: build + identity + AI architecture + role PoC + cognition design.

## Sprint Definition of Done

- [ ] Issue #6 acceptance criteria complete.
- [ ] Issue #7 architecture accepted and documented.
- [ ] Issue #8 has a functioning limited role PoC or a documented upstream blocker.
- [ ] Issue #9 establishes an implementable MVP model.
- [ ] Windows development build remains green.
- [ ] No secrets are committed.
- [ ] DevDocs and GitHub issues reflect actual state.
- [ ] New Cognify changes are isolated sufficiently to permit future upstream sync.

## Deferred From Sprint 1

- full multi-provider production routing;
- cloud workspace control plane;
- template launcher implementation;
- persistent preview/deploy hosting;
- real-time collaboration;
- production-grade Project Cognition graph/database.
