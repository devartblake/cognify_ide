# Cognify IDE GitHub Issue Map

This file maps the revised technical baseline to executable GitHub issues.

## Sprint 0.5 — Stabilization

| Order | Issue | Priority | Outcome | Status (2026-11-04) |
|---|---|---:|---|---|
| 1 | #3 — Reconcile Cognify-specific changes after upstream VS Code sync | P0 | Recover or consciously retire Sprint 0 governance/configuration changes without rolling back upstream. | ✅ Closed (#10) |
| 2 | #4 — Establish upstream/downstream branch and sync policy | P0 | Define repeatable VS Code OSS import strategy and customization boundaries. | ✅ Closed (#10) |
| 3 | #5 — Baseline Windows build, test, and security gates | P0 | Produce a reproducible technical baseline and document Native Watchdog/node-gyp requirements. | ✅ Closed (#10); Windows check continues as S2-01 |

### Sprint 0.5 Exit Gate

Do not begin broad Cognify product implementation until #3–#5 are complete or residual risks are explicitly accepted and documented.

## Sprint 1 — Product Identity + AI Foundation

| Order | Issue | Priority | Outcome | Status (2026-11-08) |
|---|---|---:|---|---|
| 1 | #6 — Establish Cognify product identity and branding baseline | P0 | Development build launches as Cognify IDE with isolated identifiers and correct attribution. | ✅ Closed (2026-11-05) after the Windows dev-build launch; the installed build was checked in Sprint 6 (S6-01) |
| 2 | #7 — Define Cognify AI provider abstraction and routing contract | P0 | Vendor-neutral AI architecture for GPT, Gemini, Copilot, and future providers. | ✅ Closed (#13); implemented in Sprint 2 (#20–#24) |
| 3 | #8 — Prototype Cognify agent roles on current VS Code agent host | P1 | Prove Cognify can extend upstream agent infrastructure instead of duplicating it. | ✅ Closed (2026-11-08): `@cognify /review`, `/explain`, `/guide` and `/fix` verified end to end on the installed build with a Copilot sign-in (S6-02) |
| 4 | #9 — Define Project Cognition MVP model and indexing boundaries | P1 | Implementable semantic project-understanding design for later Sprint 3 development. | ✅ Closed (#15); implementation in Sprint 3 |

## Sprint 2 — AI Provider Architecture

Sprint 2 items are tracked by ID (`S2-01` … `S2-17`) in [`SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](../Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md#progress), not as separate GitHub issues. Pull requests reference those IDs. The two Sprint 1 issues that waited on hands-on checks are closed: #6 after the Windows dev-build launch, and #8 after the signed-in session (S6-02). Later sprints are tracked by item ID in their sprint documents.

Pull requests into `dev` do not auto-close issues ("Closes #N" only acts on the default branch). Close issues by hand, with an evidence comment, once their acceptance criteria are verified.

## Dependency Map

```text
#3 Reconciliation -----+
                       +--> Sprint 0.5 Exit --> #6 Product Identity
#4 Sync Policy --------+                         |
                       |                         +--> #7 AI Provider Contract
#5 Technical Baseline -+                                  |
                                                          +--> #8 Agent Role PoC
                                                          |
                                                          +--> #9 Project Cognition Model
```

## AI Work Allocation

| Work Type | Primary | Secondary | Fallback |
|---|---|---|---|
| PM artifacts / architecture / acceptance criteria | GPT | Gemini | Bolt |
| In-repository implementation / targeted fixes | Copilot | GPT | Gemini |
| Independent architecture/config review | Gemini | GPT | Bolt |
| CI/config contingency during quota limits | Bolt | Gemini | GPT |

## Backlog Rules

- Every implementation PR references its issue.
- Acceptance criteria must be verified before issue closure.
- AI output is not acceptance evidence; build/test/runtime validation is.
- New MVP scope requires PM/stakeholder review and must satisfy the MVP schedule-control rule.
- Upstream VS Code work should not be copied into Cognify-specific code unless there is a documented product requirement.

## Next Planned Issue Set

After Sprint 1, the next issue group should cover:

- provider adapter implementation and routing;
- Project Cognition prototype;
- Cognify project launcher;
- local runtime detection;
- managed-local Dev Container presets;
- Run/Preview workflow;
- beginner Explain / Guide Me / Fix It UX;
- MVP certification and Windows packaging.
