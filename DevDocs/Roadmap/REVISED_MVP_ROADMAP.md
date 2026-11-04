# Cognify IDE Revised MVP Roadmap

## Goal

Deliver a credible Cognify IDE MVP by leveraging the current VS Code OSS platform and concentrating engineering effort on Cognify-specific differentiation rather than rebuilding upstream capabilities.

## Planning Model

Target execution window: **7 weeks**, with a **2-week management reserve** for a solo developer using AI assistance.

Planning range: **7–9 weeks** after Sprint 0.5 stabilization.

## Release Sequence

### Sprint 0.5 — Repository Stabilization (2–3 focused days)

- Reconcile Cognify-specific Sprint 0 changes after upstream sync.
- Establish upstream/downstream synchronization policy.
- Confirm Windows build/test/security baseline.
- Recover/retire prior PR, CODEOWNERS, Dependabot, AI-review, and documentation customizations.

### Sprint 1 — Product Identity + AI Foundation (1 week)

- Rebrand product/runtime identity to Cognify IDE.
- Establish safe, isolated customization points.
- Define provider-neutral AI contract.
- Prototype Cognify role-based agent behavior on current VS Code agent host.
- Define Project Cognition MVP schema.

### Sprint 2 — Cognify AI Provider Architecture (1.5 weeks)

✅ **Closed 2026-11-04.** The review and carry-overs are in [`SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`](../Sprints/SPRINT_2_AI_PROVIDER_ARCHITECTURE.md#sprint-review-2026-11-04). S2-01, S2-04 and the rebranding items R-01 to R-06 move to Sprint 3.


- Implement provider adapter abstraction.
- Add basic routing for GPT, Gemini, and Copilot.
- Normalize availability/quota/errors.
- Add audit metadata for provider, role, and task handoff.
- Preserve user override for preferred provider where practical.

### Sprint 3 — Agent Orchestration + Project Cognition MVP (1.5 weeks)

In progress since 2026-11-04; plan and progress: [`SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md`](../Sprints/SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md). Also carries the Sprint 2 hands-on checks (S2-01, S2-04) and the rebranding items R-01 to R-06 ([`REBRANDING_PLAN.md`](../Governance/REBRANDING_PLAN.md)).

- ✅ Implement Planner/Coder/Reviewer/Tester role flow for a limited scenario (S3-05, S3-06).
- ✅ Build lightweight project semantic summary/index (S3-07, S3-09).
- ✅ Add refresh/invalidation behavior (S3-08).
- ✅ Validate repository-aware questions (S3-10). The live Git fact needs the owner's signed-in check (S3-02).
- Rebranding: R-01 to R-05 done, R-06 in review.

### Sprint 4 — Project Launcher + Environments (1 week)

- Add guided project creation UX.
- Support a small template set: Next.js, FastAPI, ASP.NET Core, Flutter or another approved fourth template.
- Detect host runtimes.
- Add Managed Local execution using Dev Container presets.
- Provide guided remediation when required runtime tooling is missing.

### Sprint 5 — Run/Preview + Onboarding (1 week)

- Add Cognify Run/Preview workflow for supported template classes.
- Add basic beginner interaction modes: Explain / Guide Me / Fix It.
- Add first-run onboarding and project-context initialization.
- Keep persistent cloud hosting out of MVP.

### Sprint 6 — MVP Certification (1 week)

- Windows packaging/development-distribution validation.
- Build, smoke, targeted unit, and security gates.
- AI routing failure scenarios.
- Runtime-detection failure scenarios.
- Documentation/status reconciliation.
- MVP go/no-go review.

## Post-MVP Backlog (v1.5 candidates)

These items are proposed but outside the MVP, under the schedule control rule below. They can be scheduled after Sprint 6, or earlier as an optional spike if capacity allows.

| Item | Summary | Design | Before it can start |
|---|---|---|---|
| **Cognify pet** | Cognify's own chat companion, replacing upstream's VS Code pet (Blobby), which R-05 turned off. It is rendered with three.js (3D models) or Rive/PixiJS (2D art). Upstream's pet service and placement are reused, and only the widget is replaced, through the one factory line. **Spike:** 2–3 days. **v1:** about one sprint. | [`COGNIFY_PET_DESIGN.md`](../Architecture/COGNIFY_PET_DESIGN.md) | The owner supplies the avatar files and format, a name, and answers to the note's open questions. |

## MVP Capability Matrix

| Capability | MVP | v1.5 | v2+ |
|---|---:|---:|---:|
| Cognify product identity | Yes | Improve | Improve |
| VS Code editor/LSP/DAP/terminal/SCM | Inherit | Inherit | Inherit |
| GPT/Gemini/Copilot provider integration | Yes | Expand | Expand |
| Cognify provider router | Basic | Cost/privacy/latency-aware | Policy/enterprise aware |
| Cognify role agents | Core roles | Expanded | Multi-agent automation |
| Project Cognition | Basic semantic model | Deeper graph/history | Organization-level cognition |
| Local execution | Yes | Yes | Yes |
| Dev Container managed-local mode | Yes | Yes | Yes |
| Cloud workspace | No | Yes | Scale |
| Run/Preview | Yes | Yes | Yes |
| Persistent publish/deployment | No | Yes | Expand providers |
| Learn mode | Basic | Expand | Education/team variants |
| Real-time collaboration | No | Experimental | Yes |
| Shared terminal/debug | No | No/experimental | Yes |
| Community marketplace | No | No | Later |
| Cognify pet (chat companion) | No (optional spike) | Yes | Role-aware poses, accessories |

## Key Product Differentiators

1. **Hybrid execution** rather than cloud-only or local-only development.
2. **Provider-neutral intelligence** rather than dependency on one AI vendor.
3. **Project Cognition** rather than simple file retrieval.
4. **Role-aware agent orchestration** rather than undifferentiated chat.
5. **Professional + beginner modes** without turning the IDE into a simplified learning sandbox.

## Schedule Control Rule

New features do not enter the MVP unless they either:

- directly validate the Cognify product thesis; or
- remove a blocker to building, running, testing, or demonstrating the MVP.

All other features are deferred to v1.5+.
