# Sprint 0.5 Reconciliation Log

## Purpose

Record Cognify-specific governance and setup decisions after synchronizing the fork with the current Microsoft VS Code OSS baseline. This log is intentionally requirement-based: upstream files are not restored wholesale; Cognify requirements are reapplied against the current structure.

## Baseline

- `main` and `dev` were synchronized before Sprint 0.5.
- Sprint 0.5 implementation branch: `feature/sprint0.5-stabilization`.
- Current repository remains a VS Code OSS downstream fork.

## Reconciled Items

### `.github/CODEOWNERS`

**Observed after upstream sync:** Microsoft VS Code maintainer accounts were configured as required owners for workflow, API, and lint-allowlist paths.

**Decision:** Replace downstream review ownership with Cognify maintainer ownership (`@devartblake`) while retaining explicit protection for high-risk paths.

**Reason:** Microsoft maintainers are upstream owners, not Cognify project reviewers. Automatically requesting them from the downstream fork would be inappropriate and would not provide reliable Cognify governance.

**Status:** Reapplied for Cognify.

### `.github/pull_request_template.md`

**Observed after upstream sync:** The repository reverted to the short Microsoft VS Code OSS PR guidance template.

**Decision:** Restore a Cognify-specific template with issue/sprint traceability, upstream-vs-Cognify classification, validation gates, security/dependency checks, DevDocs requirements, AI-assistance disclosure, and residual-risk notes.

**Status:** Reapplied for Cognify.

### `.github/dependabot.yml`

**Observed after upstream sync:** Current upstream configuration updates GitHub Actions weekly, Dev Containers weekly, and `@vscode/markdown-editor` in its extension directory daily.

**Decision:** Preserve the upstream configuration for Sprint 0.5 rather than introduce broad root dependency updates. VS Code root dependency changes are high-churn and should primarily arrive through upstream syncs. Dependabot security alerts/security updates should be enabled in repository settings where available; version-update expansion is deferred until Cognify owns additional standalone packages/extensions.

**Status:** Preserved intentionally.

### AI PR-review workflow

**Observed after upstream sync:** The previously discussed Cognify AI review workflow is not present at the expected `.github/workflows/ai_pr_review.yml` path.

**Decision:** Do not silently reintroduce an unpinned third-party Action during stabilization. External AI review Actions represent supply-chain and secret-exposure risk. For Sprint 0.5, AI-assisted review remains developer-invoked through approved tools. A dedicated workflow may be reintroduced later only after action provenance, permissions, secret handling, and pinned commit SHA are reviewed.

**Status:** Intentionally deferred; not a Sprint 0.5 blocker.

### Prior `/docs` planning material

**Observed after upstream sync:** Cognify planning material is now maintained under `DevDocs/`, separated from upstream documentation.

**Decision:** Treat `DevDocs/` as the development-planning source of truth. GitHub Wiki may contain developer-facing summaries, but architecture/sprint/governance decisions must be version-controlled here.

**Status:** Replaced by `DevDocs/` structure.

### AI quota fallback documentation

**Decision:** Simple provider rotation remains a development-team contingency, but Cognify product architecture will move toward provider routing based on task, availability, quota, privacy, latency, cost, and user preference. Any prior `fallback.md` content should be migrated only if still useful; it must not be treated as the final Cognify runtime design.

**Status:** Superseded conceptually by the AI provider/routing work planned for Sprint 1.

### Native Watchdog / node-gyp notes

**Decision:** Maintain reproducible Windows native-build guidance under `DevDocs/Environment/`. Wiki content may link to or summarize that file.

**Status:** Added as part of Sprint 0.5.

## Retired or Deferred Decisions

- Do not require Microsoft upstream maintainers as Cognify CODEOWNERS.
- Do not broadly auto-update the VS Code root dependency graph via Dependabot during MVP development.
- Do not run a third-party AI review Action with repository secrets until the action is security-reviewed and pinned.
- Do not create a parallel agent-host framework when the current VS Code agent infrastructure can be extended.

## Reconciliation Rule Going Forward

For any upstream conflict:

1. Preserve upstream security, performance, and compatibility improvements.
2. Restate the Cognify requirement behind the local change.
3. Reapply the smallest downstream change that satisfies that requirement.
4. Run focused validation.
5. Record the decision in the PR and, when architectural/governance-related, in `DevDocs`.

## Sprint 0.5 Residual Risk

- Full Windows build/launch validation must still be run on the developer workstation for the final branch head.
- GitHub-hosted workflows may expose upstream assumptions that are not cost-effective for every Cognify PR; CI optimization is allowed after the baseline is measured.
- AI PR-review automation remains deferred pending a supply-chain/security review.
