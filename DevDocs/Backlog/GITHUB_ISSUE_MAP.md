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

| Order | Issue | Priority | Outcome | Status (2026-11-03) |
|---|---|---:|---|---|
| 1 | #6 — Establish Cognify product identity and branding baseline | P0 | Development build launches as Cognify IDE with isolated identifiers and correct attribution. | Open: Windows launch check (S2-01, carried into Sprint 3) remains; identity and artwork merged (#12, #18, #19) |
| 2 | #7 — Define Cognify AI provider abstraction and routing contract | P0 | Vendor-neutral AI architecture for GPT, Gemini, Copilot, and future providers. | ✅ Closed (#13); implemented in Sprint 2 (#20–#24) |
| 3 | #8 — Prototype Cognify agent roles on current VS Code agent host | P1 | Prove Cognify can extend upstream agent infrastructure instead of duplicating it. | Open: end-to-end run on a signed-in build (S2-04, carried into Sprint 3) remains; sign-in UX done (S2-03, #26, #28); `/explain` and the role personas added (#35, #36) |
| 4 | #9 — Define Project Cognition MVP model and indexing boundaries | P1 | Implementable semantic project-understanding design for later Sprint 3 development. | ✅ Closed (#15); implementation in Sprint 3 |

## Sprint 2 — AI Provider Architecture

Sprint 2 items are tracked by ID (`S2-01` … `S2-17`) in [`SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](../Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md#progress), not as separate GitHub issues. Pull requests reference those IDs. The two open Sprint 1 issues close when their Sprint 2 items finish: #6 with S2-01, and #8 with S2-03 and S2-04.

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
