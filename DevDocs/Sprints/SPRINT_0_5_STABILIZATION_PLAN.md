# Sprint 0.5 Stabilization Plan

## Sprint Objective

Create a clean, current, reproducible Cognify development baseline after the latest VS Code OSS synchronization, without discarding upstream improvements or silently losing Cognify-specific governance/configuration work.

## Duration

2–3 focused development days.

## Current Status

Implementation is in progress on `feature/sprint0.5-stabilization`.

Completed implementation work:

- Reconciled Cognify `CODEOWNERS` so Microsoft upstream maintainers are not auto-requested by the downstream fork.
- Restored a Cognify-specific pull-request template with validation, security, AI-disclosure, upstream-reconciliation, and residual-risk sections.
- Preserved the current upstream Dependabot configuration intentionally rather than independently advancing the VS Code root dependency graph.
- Deferred the prior third-party AI PR-review workflow until its action provenance, permissions, secret handling, and immutable commit pin are reviewed.
- Added a formal upstream/downstream synchronization policy.
- Added a Sprint 0.5 reconciliation log.
- Added Windows/Native Watchdog/node-gyp baseline documentation.
- Added CI/security baseline documentation.

Remaining exit work is primarily validation on the developer workstation and PR/CI review of this branch.

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

Remaining:
- Review branch diff before merge and confirm no desired local-only Sprint 0 file remains uncommitted.

### Issue #4 — Establish upstream/downstream branch and sync policy

Priority: P0

Implemented:
- `DevDocs/Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md` defines branch roles, upstream remote, sync cadence, conflict handling, customization zones, validation gates, and MVP release freeze.

Remaining:
- Validate the documented remote names against the developer workstation and use the policy for the next real upstream import.

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
- [ ] Final branch-head local validation is recorded.
- [ ] Sprint 0.5 PR/CI review is green or accepted residual risk is documented.
- [ ] Issues #3, #4, and #5 are closed after the above validation.

## AI Assignment Exception

For Sprint 0.5 only, the previously defined separation of AI responsibilities is relaxed to accelerate stabilization. The developer remains accountable for every change regardless of which assistant produced or reviewed it.

The normal role boundaries return for Sprint 1 unless explicitly revised.

## Exit Gate

Do not begin broad Cognify source modifications in `src/vs/...` until Sprint 0.5 is complete. Sprint 1 should favor product/configuration and extension/customization seams before deep core modifications.
