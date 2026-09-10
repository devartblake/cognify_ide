# CI and Security Baseline

## Purpose

Define the minimum continuous-integration and security posture required before Sprint 1 feature work begins.

## Principles

1. Reuse upstream VS Code OSS validation where practical.
2. Avoid duplicating expensive checks without a Cognify-specific reason.
3. Keep Cognify-specific checks isolated and clearly named.
4. Treat workflow dependencies as supply-chain dependencies.
5. Never expose provider/API secrets to untrusted pull requests.

## Existing Upstream CI Surface

The repository currently carries upstream workflows for Linux, Windows, macOS, CLI, Monaco, node-modules, telemetry, and other current VS Code validation. Cognify should preserve these unless a documented cost or compatibility decision replaces a check.

## Sprint 0.5 Required Local Gates

Run the smallest practical validation set needed to prove the baseline is usable:

```powershell
npm install
npm run watch
npm run typecheck-client
npm run test-node
```

Where a command is prohibitively expensive or an upstream transient defect blocks completion, record the exact failure and classify it as blocking or accepted residual risk.

For focused changes, prefer the narrowest upstream-supported test command that exercises the modified area.

## Launch Smoke Gates

- Desktop development launcher starts successfully.
- Web development launcher starts when web scope is affected.
- No startup crash occurs because of native dependency or product configuration changes.

## Pull Request Gates

At minimum, Cognify PRs should require:

- clean merge base against `dev`;
- relevant compile/typecheck;
- focused tests for modified behavior;
- workflow/security review when `.github/workflows/**`, actions, dependencies, or secrets usage changes;
- updated `DevDocs` when architecture/process/setup changes.

Full upstream matrix execution on every Cognify PR may be optimized later after CI duration/cost is measured.

## Dependabot Policy

The current upstream `.github/dependabot.yml` is retained for Sprint 0.5.

Current intent:

- GitHub Actions dependency updates: weekly.
- Dev Container dependency updates: weekly.
- Upstream-maintained markdown editor package update path: retained.

Root VS Code dependencies should normally be updated through upstream synchronization, not broad independent downstream Dependabot version PRs, because independently advancing the root dependency graph can increase fork divergence.

Dependabot security alerts and security updates should be enabled in repository settings when available. Those settings complement, rather than replace, `dependabot.yml` version-update configuration.

## AI PR Review Policy

The previous external AI review workflow is not restored during Sprint 0.5.

Reason:

- third-party Actions execute inside repository CI;
- an Action that receives an OpenAI or other provider secret becomes part of the credential trust boundary;
- tags such as `@v2` or `latest` are mutable unless pinned to a reviewed commit SHA;
- pull-request event handling must avoid exposing secrets to untrusted forked PR code.

Before reintroducing an automated AI reviewer:

- [ ] verify repository/action provenance;
- [ ] review `action.yml` and runtime dependencies;
- [ ] pin `uses:` to a full commit SHA;
- [ ] grant minimum GitHub permissions;
- [ ] ensure secrets are unavailable to untrusted fork PR execution;
- [ ] test comment-only behavior on a controlled PR;
- [ ] document provider cost/quota behavior.

Until then, GPT, Gemini, and Copilot may be used interactively for review, with the developer accountable for final approval.

## CodeQL / Static Analysis

The current upstream tree includes CodeQL configuration/workflow support. Cognify should prefer retaining upstream CodeQL coverage where it executes successfully rather than layering an additional duplicate scanner.

If future Cognify-owned backend/cloud services are added outside the core VS Code tree, evaluate service-specific scanning separately (CodeQL, language-native analyzers, container scanning, and secret scanning as appropriate).

## Secret Management

- Never commit AI provider keys or tokens.
- GitHub Actions secrets must only be referenced by workflows whose trust boundary has been reviewed.
- Prefer environment-variable names in documentation and `.env.example`; never put real values in examples.
- Rotate any credential that is accidentally printed in logs or committed.

## Native Dependency Security

Native Node modules increase build and supply-chain risk. For updates affecting `@vscode/native-watchdog`, Electron-native modules, or node-gyp toolchains:

- use upstream-pinned versions where practical;
- verify source/package provenance;
- rebuild in a known toolchain;
- record compiler/toolchain changes in the PR.

## Sprint 0.5 Exit Criteria

- [ ] Build/install succeeds on the primary Windows workstation.
- [ ] `npm run watch` is green/stable.
- [ ] selected typecheck/test gates are run or residual failures documented.
- [ ] Cognify PR governance template is present.
- [ ] Cognify CODEOWNERS is present.
- [ ] Dependabot configuration is intentionally preserved/reconciled.
- [ ] no unreviewed third-party workflow receives AI provider secrets.
- [ ] Native Watchdog build requirements are documented.
