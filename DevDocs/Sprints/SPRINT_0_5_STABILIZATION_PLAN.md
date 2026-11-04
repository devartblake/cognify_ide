# Sprint 0.5 Stabilization Plan

## Sprint Objective

Create a clean, current, reproducible Cognify development baseline after the latest VS Code OSS synchronization, without discarding upstream improvements or silently losing Cognify-specific governance/configuration work.

## Duration

2–3 focused development days.

## Current Status

**Closed (2026-11-03).** The work merged into `dev` in #10, with branch-head validation recorded in the PR and accepted residual risks R1–R4. #11 added the `Cognify (dev)` CI. Issues #3, #4 and #5 are closed. The remaining Windows hands-on check (residual risk R1: a plain `npm install` and a dev-build launch on the Windows reference machine) is tracked as S2-01 in `SPRINT_2_AI_PROVIDER_ARCHITECTURE.md`.

The rest of this document is the record of the stabilization work.

Completed implementation work:

- Reconciled Cognify `CODEOWNERS` so Microsoft upstream maintainers are not auto-requested by the downstream fork.
- Restored a Cognify-specific pull-request template with validation, security, AI-disclosure, upstream-reconciliation, and residual-risk sections.
- Preserved the current upstream Dependabot configuration intentionally rather than independently advancing the VS Code root dependency graph.
- Deferred the prior third-party AI PR-review workflow until its action provenance, permissions, secret handling, and immutable commit pin are reviewed.
- Added a formal upstream/downstream synchronization policy.
- Added a Sprint 0.5 reconciliation log.
- Added Windows/Native Watchdog/node-gyp baseline documentation.
- Added CI/security baseline documentation.

Exit validation was completed in #10 (see Exit Gate below).

## Entry State

- `dev` and `main` are synchronized to the same current VS Code OSS baseline.
- The project builds locally.
- Prior Cognify Sprint 0 customizations were partially overwritten by upstream sync and required intentional reconciliation.

## Backlog

### Issue #3 — Reconcile Cognify-specific changes after upstream sync

Priority: P0

Implemented:
- Inventory/reconciliation decisions captured in `DevDocs/Governance/SPRINT_0_5_RECONCILIATION_LOG.md`.
- `.github/CODEOWNERS` reconciled.
- `.github/pull_request_template.md` reconciled.
- `.github/dependabot.yml` intentionally preserved with documented rationale.
- AI PR-review workflow explicitly deferred pending security review.
- `DevDocs/` established as the version-controlled planning source of truth.

Status: ✅ Closed (#10).

### Issue #4 — Establish upstream/downstream branch and sync policy

Priority: P0

Implemented:
- `DevDocs/Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` defines branch roles, upstream remote, sync cadence, conflict handling, customization zones, validation gates, and MVP release freeze.

Status: ✅ Closed (#10). Applying the policy to the next real upstream import is tracked as S2-16 (sync dry run).

### Issue #5 — Baseline Windows build, test, and security gates

Priority: P0

Implemented:
- `DevDocs/Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md` defines current Node/toolchain prerequisites and native build troubleshooting.
- `DevDocs/Quality/CI_AND_SECURITY_BASELINE.md` defines practical local/PR/security gates.

Developer validation required:
- `npm install`
- `npm run watch`
- desktop launch (`./scripts/code` or platform equivalent)
- web launch when required (`./scripts/code-web`)
- `npm run typecheck-client`
- `npm run test-node`

If a selected gate fails for an upstream/transient reason, capture the exact failure and classify it as blocking or accepted residual risk.

## Definition of Done

Sprint 0.5 is complete when:

- [x] Current `dev` is the approved upstream-aligned Cognify integration baseline entering stabilization.
- [x] Cognify-specific governance changes are reconciled in the implementation branch.
- [x] Upstream sync process is documented.
- [x] Windows local build prerequisites are documented.
- [x] Native Watchdog/node-gyp setup is documented.
- [x] Test/security gates are documented.
- [x] `DevDocs` is committed and acts as the source of truth for development planning.
- [x] Final branch-head local validation is recorded (#10, "Validation Results (2026-11-03)").
- [x] Sprint 0.5 PR/CI review is green or accepted residual risk is documented (#10 residual risks R1–R4; `Cognify (dev)` CI green).
- [x] Issues #3, #4, and #5 are closed after the above validation.

## AI Assignment Exception

For Sprint 0.5 only, the previously defined separation of AI responsibilities is relaxed to accelerate stabilization. The developer remains accountable for every change regardless of which assistant produced or reviewed it.

The normal role boundaries return for Sprint 1 unless explicitly revised.

## Exit Gate

Do not begin broad Cognify source modifications in `src/vs/...` until Sprint 0.5 is complete. Sprint 1 should favor product/configuration and extension/customization seams before deep core modifications.
