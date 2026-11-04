# Upstream Sync and Customization Policy

## Purpose

Cognify IDE is a downstream product of Microsoft VS Code OSS. This policy minimizes merge debt, protects Cognify-specific work, and keeps upstream security/performance improvements flowing into the product.

## Branch Model

Cognify's own branches never track Microsoft directly. Microsoft's code reaches Cognify only through a mirror branch and a reviewed quarantine branch.

```text
microsoft/vscode main
        │  weekly fast-forward (cognify-upstream-mirror.yml)
        ▼
vendor/vscode-main ──────────────┐   read-only mirror; never committed to
                                 │ merge
dev ──► vendor/sync-YYYY-MM-DD ◄─┘   quarantine: resolve, run the post-sync gates
 ▲               │
 └── PR ─────────┘                   reviewed import into dev
 │
 ├── feature/* fix/* chore/* docs/*  Cognify work, PRs into dev
 │
 └── PR (promotion) ──► main         Cognify stable; never receives Microsoft commits directly
```

| Branch | Role | Who updates it |
|---|---|---|
| `vendor/vscode-main` | Exact mirror of microsoft/vscode `main`. Fast-forward only. Never commit, merge or open PRs against it. | `.github/workflows/cognify-upstream-mirror.yml` only |
| `vendor/sync-YYYY-MM-DD` | Quarantine for one import: created from `dev`, then `vendor/vscode-main` (or a chosen commit on it) is merged in. Conflicts, build breakage and Cognify regressions are fixed here. | A maintainer; merged into `dev` by PR |
| `dev` | Cognify integration branch. Every feature PR targets it. | PRs only |
| `feature/*`, `fix/*`, `chore/*`, `docs/*` | Work branches from `dev`. | Contributors |
| `main` | Cognify stable baseline: the last promoted, validated state of `dev`. It is disconnected from Microsoft: no "Sync fork", no upstream merges. | Promotion PRs from `dev` only |
| `release/*`, tags `cognify-v*` | Release branches and tags, cut from `main` (from the MVP release freeze on). | Release owner |
| `archive/*` | Frozen snapshots kept for history. | None |

`main` and `dev` must never be updated from `microsoft/vscode`, from the GitHub "Sync fork" button, or from `vendor/vscode-main` directly.

### Importing upstream changes

1. **Check.** The mirror workflow runs every Monday, and can be started by hand. It fast-forwards `vendor/vscode-main`, then trial-merges it into `dev` without pushing. Its job summary lists the conflicts and every file changed on both sides.
2. **Decide.** Import only when the sync cadence below calls for it. Pick the mirror commit to import: the tip, or a known-good earlier commit.
3. **Quarantine.**

   ```bash
   git fetch origin dev vendor/vscode-main
   git switch -c vendor/sync-$(date -u +%F) origin/dev
   git merge --no-ff origin/vendor/vscode-main   # or a chosen commit on it
   ```

   Resolve conflicts using the reconciliation rules below. Run the post-sync validation. Update `UPSTREAM_BASELINE.md` and `upstream-baseline.json` (imported commit, divergences).
4. **Review.** Open a PR from `vendor/sync-…` into `dev`. Merge it with a **merge commit, never a squash**, so the imported upstream history stays intact and the next sync has the right merge base.
5. **Never** merge `microsoft/vscode` or `vendor/vscode-main` straight into `dev` or `main`.

### Promoting `dev` to `main`

`main` advances only by a promotion PR from `dev`, such as at the end of a sprint or before a release. The first promotion was #31 (2026-11-04).

- The `Cognify (dev)` CI must be green on `dev`, and the sprint's hands-on checks recorded.
- Merge with a **merge commit** (not a squash) so `main` keeps `dev`'s history.
- Then tag `cognify-v<version>` on `main` if it's a release.
- After the merge, confirm `dev` still exists (`git ls-remote --heads origin dev`). If auto-delete removed it, which shouldn't happen once step 4's ruleset is in place, recreate it from `main`'s tip: `git push origin origin/main:refs/heads/dev`. The promotion's merge commit contains all of `dev`, so nothing is lost.

### Repository setup (owner, one time)

These need repository admin rights in GitHub's settings, so they can't be done from a PR. Status as of 2026-11-04 is shown per step.

1. **Leave the fork network.** ⏳ *A GitHub Support request is open.* `devartblake/cognify_ide` is a GitHub fork of `microsoft/vscode`, which shows the "Sync fork" button on `main` and points pull requests at Microsoft by default.
   - The self-service **Settings → General → Danger Zone → "Leave fork network"** option is **not available for forks larger than 1 GB**, and Cognify carries the full VS Code history.
   - Instead, file a GitHub Support request at https://support.github.com/contact. Choose **Repository features**, with a subject like "Detach devartblake/cognify_ide from the microsoft/vscode fork network (repository over 1 GB)". Ask them to keep issues, PRs, Actions history and settings.
   - **Until it's detached:** never click **Sync fork**. When opening a PR in the GitHub UI, check that the base repository is `devartblake/cognify_ide`, because forks default to the parent.
   - Afterwards, upstream syncing runs only through `vendor/vscode-main`. Nothing in the branch model depends on the detach.
2. **Mirror token.** ✅ Add the repository secret `COGNIFY_UPSTREAM_SYNC_TOKEN`: a fine-grained token for this repository only, with Contents read/write and Workflows read/write. The default `GITHUB_TOKEN` can't push Microsoft's commits, because they change workflow files.
3. **Disable the inherited Microsoft workflows** ✅ before the first promotion into `main`. In **Actions → (workflow) → "…" → Disable workflow**, disable **every workflow except `Cognify (dev)` and `Cognify (upstream mirror)`**. As of 2026-11-04 that was 15 workflows, including `pr.yml`, `pr-node-modules.yml`, `pr-*-test.yml`, `copilot-setup-steps.yml`, `codeql.yml`, `component-fixtures.yml`, `monaco-editor.yml`, `chat-lib-package.yml`, `chat-perf.yml`, `sessions-e2e.yml`, `telemetry.yml` and `css-order-scan.yml`.
   - **After every upstream import, recheck the Actions list.** An import can add new Microsoft workflows, and those start out enabled.
   - They trigger on `main`, and several need Microsoft's self-hosted runners, so they would queue forever.
   - Disabling them in the UI leaves the files untouched, which keeps upstream syncs conflict-free.
4. **Branch protection (rulesets).** Settings → Rules → Rulesets:
   - **`main` and `dev`:** **Restrict deletions**, block force pushes, require a pull request (0 approvals for a single maintainer), and require the `Typecheck, Unit Tests & Baseline` status check. Bypass: repository admin.
   - **`vendor/vscode-main`:** restrict updates, restrict deletions, block force pushes. Bypass: repository admin, so that the mirror token, which acts as its owner, can push.
   - **`archive/*`:** restrict updates, restrict deletions. `archive/sprint0.5-pre-refresh-2026-09-19` was removed during the 2026-11-04 branch cleanup and restored from a local copy.
   - ⚠️ **"Restrict deletions" on `dev` is required, not optional.** With "Automatically delete head branches" on, GitHub deletes a PR's head branch after the merge, and a promotion PR's head *is* `dev`. That happened after #31: `dev` was deleted and had to be recreated from `main`. GitHub doesn't auto-delete branches that a ruleset protects.
5. **Default branch.** ✅ Keep `main`. After the first promotion it holds Cognify, and "Closes #N" in a promotion PR closes issues.
6. **Automatically delete head branches** ✅ (Settings → General), so merged PR branches don't pile up. Turn this on only together with the deletion protection in step 4; long-lived branches such as `dev` and `archive/*` must be protected.
7. **Run the mirror workflow once** ✅ by hand after it reaches the default branch. Scheduled runs only fire from the default branch. The first run (2026-11-04, [run 41756226477](https://github.com/devartblake/cognify_ide/actions/runs/41756226477)) created `vendor/vscode-main` at `077bec3` and reported the same 3 conflicts as the S2-16 dry run.

## Compatibility Manifest

The authoritative accepted-upstream record is maintained in:

- `DevDocs/Governance/UPSTREAM_BASELINE.md`
- `DevDocs/Governance/upstream-baseline.json`

Every accepted Microsoft import must record the exact imported upstream commit, the resulting Cognify `dev` baseline, runtime versions, known divergences, and required smoke gates. A local guard is available via:

```bash
node scripts/cognify/check-upstream-baseline.mts
```

A moving `upstream/main` is informational only; releases and feature work are certified against the recorded imported commit.

## Sync Cadence

- Check upstream weekly during active MVP development.
- Import only when the update materially improves security, build compatibility, agent infrastructure, Electron/runtime compatibility, or fixes a relevant defect.
- Avoid daily upstream churn during feature sprints unless a critical issue requires it.
- At MVP stabilization, freeze to a known upstream commit/tag for certification.

## Cognify Customization Zones

Prefer changes in this order:

1. `DevDocs/` and Cognify-owned documentation/configuration.
2. Product configuration (`product.json`, branding/build metadata).
3. Cognify-owned built-in extensions or isolated modules.
4. Supported workbench/agent contribution points.
5. Deep `src/vs/...` modifications only when requirements cannot be met safely through the preceding layers.

Each deep-core modification should have an architecture note explaining why an extension/contribution point was insufficient.

## Reconciliation Rules

When upstream modifies a Cognify-customized file:

1. Preserve upstream behavior/security fixes first.
2. Identify the Cognify requirement behind the prior change.
3. Reapply that requirement against the new upstream structure; do not mechanically restore an old file version.
4. Run focused tests for both upstream behavior and Cognify behavior.
5. Record the conflict/decision in the PR and relevant DevDocs.

## Governance Files

Files such as `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/dependabot.yml`, and workflows are high-conflict because upstream actively maintains them. Cognify should extend them conservatively.

Rules:

- Do not delete upstream security/test workflows simply to simplify Cognify CI.
- Add Cognify-specific workflows with distinct names where practical.
- Merge ownership requirements rather than replacing upstream CODEOWNERS blindly.
- Preserve upstream Dependabot ecosystems/schedules unless there is a documented reason to change them.
- Keep Cognify PR metadata/checklists concise so upstream PR-template changes can be reconciled easily.

## Required Post-Sync Validation

Minimum validation after an upstream import:

```text
1. npm dependency/install step succeeds
2. npm run watch reaches stable compile/watch state
3. desktop development launcher starts
4. web development launcher starts when in current scope
5. selected typecheck/lint/unit gate passes
6. Native Watchdog/node-gyp native dependency build is verified on Windows
7. Cognify identity/customization smoke checks pass once implemented
8. security/workflow configuration remains present and syntactically valid
9. `node scripts/cognify/check-upstream-baseline.mts` passes after the compatibility manifest is intentionally updated
```

## AI-Assisted Sync Rules

- GPT may produce reconciliation plans and architectural diffs but should not be treated as the final authority on upstream behavior.
- Copilot may apply targeted changes inside the repository and should run/inspect the relevant tests.
- Gemini should be used as an independent review path for complex conflicts or configuration decisions.
- Bolt remains a fallback for quota/availability; do not create a parallel implementation merely because another provider is available.

All AI-generated modifications remain developer-owned and require normal build/test validation.

## Release Freeze

Before MVP certification:

- record the exact VS Code OSS upstream commit/tag in the compatibility manifest;
- stop non-critical upstream imports;
- run the full approved Cognify MVP validation suite;
- create a release-baseline tag after acceptance.

## Decision Record

Cognify's strategic policy is:

> Extend upstream. Abstract vendors. Own the Cognify experience.

The fork exists to deliver Cognify-specific product value, not to independently maintain replacements for VS Code subsystems already maintained effectively upstream.
