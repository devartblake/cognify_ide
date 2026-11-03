# Upstream Sync and Customization Policy

## Purpose

Cognify IDE is a downstream product of Microsoft VS Code OSS. This policy minimizes merge debt, protects Cognify-specific work, and keeps upstream security/performance improvements flowing into the product.

## Branch Roles

- `main` — approved stable Cognify integration baseline.
- `dev` — active integration branch for Cognify development; must remain close to `main` and current approved upstream baseline.
- `feature/<scope>` — feature work from `dev`.
- `fix/<scope>` — defect repair from `dev`.
- `chore/<scope>` — maintenance/governance/upstream-sync work from `dev`.

All routine Microsoft imports must use a dedicated branch such as `chore/upstream-vscode-sync-YYYY-MM-DD`. Do not merge `microsoft/vscode` directly into `dev` during normal Cognify development. The sync branch is the quarantine layer where conflicts, build breakage, and Cognify regression risk are resolved before integration.

## Upstream Model

Recommended remotes:

```bash
git remote -v
git remote add upstream https://github.com/microsoft/vscode.git
git fetch upstream --tags
```

Do not directly develop Cognify features against an upstream branch. Import upstream into a dedicated Cognify sync branch, resolve conflicts there, run validation, update `DevDocs/Governance/UPSTREAM_BASELINE.md` and `upstream-baseline.json`, then merge through the normal review path.

## Compatibility Manifest

The authoritative accepted-upstream record is maintained in:

- `DevDocs/Governance/UPSTREAM_BASELINE.md`
- `DevDocs/Governance/upstream-baseline.json`

Every accepted Microsoft import must record the exact imported upstream commit, the resulting Cognify `dev` baseline, runtime versions, known divergences, and required smoke gates. A local guard is available via:

```bash
node scripts/cognify/check-upstream-baseline.mjs
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
9. `node scripts/cognify/check-upstream-baseline.mjs` passes after the compatibility manifest is intentionally updated
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
