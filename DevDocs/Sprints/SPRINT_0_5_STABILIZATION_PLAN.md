# Sprint 0.5 Stabilization Plan

## Sprint Objective

Create a clean, current, reproducible Cognify development baseline after the latest VS Code OSS synchronization, without discarding upstream improvements or silently losing Cognify-specific governance/configuration work.

## Duration

2–3 focused development days.

## Entry State

- `dev` and `main` are synchronized to the same current VS Code OSS baseline.
- The project builds locally.
- Prior Cognify Sprint 0 customizations were partially overwritten by upstream sync and must be reconciled intentionally.

## Backlog

### Issue #3 — Reconcile Cognify-specific changes after upstream sync

Priority: P0

Tasks:
- Inventory prior Cognify changes.
- Compare current upstream-default governance files with prior project intent.
- Reapply only the customizations still required.
- Preserve upstream checks and owners where they remain useful.
- Document any consciously retired setup decisions.

Known reconciliation targets:
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`
- `.github/dependabot.yml`
- AI PR-review workflow
- prior `/docs` and AI fallback documentation
- Native Watchdog/node-gyp notes

### Issue #4 — Establish upstream/downstream branch and sync policy

Priority: P0

Tasks:
- Define branch roles.
- Define Microsoft upstream remote and import procedure.
- Define update cadence.
- Define conflict handling and rollback points.
- Identify Cognify-owned files/directories that require extra review during sync.

### Issue #5 — Baseline Windows build, test, and security gates

Priority: P0

Tasks:
- Verify `npm run watch`.
- Verify development launch through `./scripts/code` and web launch through the current upstream script.
- Capture Visual Studio Build Tools/node-gyp prerequisites.
- Select practical upstream-compatible test/typecheck/lint commands.
- Confirm Dependabot/security workflow responsibilities.
- Log minor non-blocking discrepancies rather than allowing them to delay the sprint indefinitely.

## Definition of Done

Sprint 0.5 is complete when:

- [ ] Current `dev` is the approved Cognify integration baseline.
- [ ] Cognify-specific governance changes are reconciled.
- [ ] Upstream sync process is documented.
- [ ] Windows local build is reproducible from documented prerequisites.
- [ ] Native Watchdog/node-gyp setup is documented.
- [ ] Test/security gates are documented.
- [ ] `DevDocs` is committed and acts as the source of truth for development planning.
- [ ] Issues #3, #4, and #5 are complete or have clearly documented accepted residual risk.

## AI Assignment

- **GPT** — PM artifacts, architecture decisions, reconciliation analysis, acceptance criteria.
- **Copilot** — in-repository code/config implementation and targeted fixes.
- **Gemini** — independent technical review, alternate implementation suggestions, structured configuration assistance.
- **Bolt** — fallback only when primary AI quota/availability becomes a constraint.

## Exit Gate

Do not begin broad Cognify source modifications in `src/vs/...` until Sprint 0.5 is complete. Sprint 1 should favor product/configuration and extension/customization seams before deep core modifications.
