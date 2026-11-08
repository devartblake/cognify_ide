# MVP Certification: Cognify IDE `cognify-v0.1.0`

- **Sprint 6, S6-11** ([`SPRINT_6_MVP_CERTIFICATION.md`](../Sprints/SPRINT_6_MVP_CERTIFICATION.md)). The evidence for each MVP capability, the gates' results, the failure catalogs, the manual checks and the known limits, and the owner's go/no-go decision (D7).
- **Status (2026-11-08):** **Draft, waiting on the owner.** All the automated evidence and both blocking owner checks (S6-01, S6-02) are in. Still open: the owed manual checks (S6-09), conditions C2 and C3 for go (C1 is met; below), and the owner's decision.
- **Certified upstream:** Code - OSS 1.146.0 at `37a8101` (frozen under D6; S6-13).
- **Installed build checked by the owner:** the user setup from package run [42148802762](https://github.com/devartblake/cognify_ide/actions/runs/42148802762) (`main` at `cbf8aa0`, 2026-11-06). Since then `dev` gained one code change, the 0-token footer fix (#104), and documentation, so **the release candidate is a new package** built after `dev` is promoted to `main` (condition C2).

## 1. Capabilities

The MVP column of the roadmap's capability matrix ([`REVISED_MVP_ROADMAP.md`](../Roadmap/REVISED_MVP_ROADMAP.md)). "CI" is the `Cognify (dev)` workflow on every pull request and push to `dev`; the test files are in `extensions/cognify-ai/src/`.

| Capability | MVP target | Automated evidence | Owner's check on Windows | Result |
|---|---|---|---|---|
| Cognify product identity | Yes | `check-product-identity.mts` (CI); the package checks (identity, app name, NLS overrides, publisher) in `Cognify (package)` | S6-01: installs and launches as *Cognify IDE*, data in `%APPDATA%\Cognify`, Settings > Apps lists Theoretical Minds Technology | **Pass** (limits: GitHub's sign-in page names "Visual Studio Code"; the app reports version 1.146.0) |
| Editor, language servers, debugger, terminal, source control | Inherit | Upstream's node unit tests (`test-node`) and the typecheck in CI | Used throughout S6-01 and S6-02 | **Pass** (inherited) |
| Provider integration (GPT, Gemini, Copilot) | Yes | Integration tests against fake `openai`, `gemini`, `copilot` and `ollama` vendors (`test-integration/routing.test.ts`) | S6-02: real Copilot sign-in; answers through Copilot's models, for example Claude Haiku 5.5 | **Pass.** Only Copilot was checked with a real account; the other vendors are checked through the same `vscode.lm` interface with fakes. |
| Cognify provider router | Basic | Router unit tests (`test/router.test.ts`) and 53 routing integration tests: capabilities, context size, pinning, privacy gate, deadline, vendor errors, cooldowns, settings, the audit trail | S6-02: **Why this provider?** shows the provider and attempts; the footer's input size is fixed in #104 | **Pass** |
| Cognify role agents | Core roles | Persona and prompt unit tests; the Planner → Coder → Reviewer → Tester role flow (`routing.test.ts`, S3-06) | S6-02: `/explain` (Tutor), `/guide` (Tutor), `/review` (Reviewer, handoff to Tester), `@cognify /fix` (Coder, proposes without editing) | **Pass** |
| Project Cognition | Basic semantic model | Project model unit tests (`test/projectModel.test.ts`, every template); the MVP scenario's `/guide` and `/fix` with project context (`test-integration/mvp.test.ts`) | S6-02: `/guide` used the project's `cognify: test` task and pytest | **Pass** (live `recentChanges` covered by unit tests only) |
| Local execution | Yes | The MVP scenario in CI: New Project (FastAPI, host), install, test and Run with real pip, pytest and uvicorn | S6-01: FastAPI project runs on the host | **Pass** |
| Dev Container managed-local mode | Yes | The Dev Container CLI integration test with Docker (`COGNIFY_TEST_DOCKER`, `environments.test.ts`); the CLI's location checked in the package | S6-01: uvicorn in `/workspaces/demo`, preview shows `{"message":"Hello from Demo"}` (Docker Desktop 4.96.3) | **Pass** |
| Run/Preview | Yes | `test-integration/run.test.ts`, `preview.test.ts` and the MVP scenario (port in use, never answers, crash, reuse of the preview tab) | S6-01: Run and preview on the host and in the Dev Container | **Pass** (limit: the preview doesn't reload by itself) |
| Learn mode (Explain, Guide Me, Fix It) | Basic | `test-integration/beginnerModes.test.ts` (including **Fix with Cognify**) and the MVP scenario | S6-02: all four commands | **Pass** (the lightbulb quick fix not tried by hand) |
| Onboarding (first-run walkthrough) | Part of Run/Preview + onboarding (Sprint 5) | `test-integration/onboarding.test.ts` | Seen after install (S6-01); a fresh first launch is in S6-09 | **Pass**, S6-09 pending |
| Cloud workspace, persistent publish, collaboration, marketplace | No | n/a | n/a | Out of scope, listed in [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md) |

## 2. Gates

| Gate | Evidence | Result |
|---|---|---|
| `Cognify (dev)` on `dev` | Run [42506893783](https://github.com/devartblake/cognify_ide/actions/runs/42506893783) (`6ed0fca`): typecheck, upstream node tests, eslint, cognify-ai unit tests (116, also on Windows), the shipped-build check (S6-16), integration tests (fake vendors, Docker, the MVP scenario), identity, upstream baseline, string inventory and NLS checks, build tests. No push to `dev` since 2026-11-05 has failed (three runs were cancelled when a newer push replaced them). | **Green** |
| `Cognify (security)` | Run [42506893736](https://github.com/devartblake/cognify_ide/actions/runs/42506893736): CodeQL on Cognify-owned code (fails on high or critical) and `pnpm audit` of cognify-ai's production dependencies. | **Green**, no open high or critical finding |
| Inherited dependency advisories | 1 critical and 10 high, all in upstream's dependencies, triaged in [`DEPENDENCY_ADVISORIES.md`](DEPENDENCY_ADVISORIES.md); not blocking under D7; mirror run #6 brought no fixes for them. | **Documented** |
| Secret scanning and push protection | Turned on by the owner on 2026-11-08 (Settings → Advanced Security: Secret Protection enabled, push protection on). | **On** (C1 met) |
| Open code-scanning alerts | 93 alerts were open, all from two stale CodeQL configurations (`/language:javascript-typescript`, `/language:rust`) left by upstream's own CodeQL workflow, which Cognify disabled with the other inherited workflows; their last scan was of an upstream commit (`a0a429cd`). The owner deleted both configurations on 2026-11-08 and the count dropped to **0**. Cognify's own configuration is `/cognify`. | **0 open** |
| `Cognify (package)` | Run [42148802762](https://github.com/devartblake/cognify_ide/actions/runs/42148802762) (`main` at `cbf8aa0`): Windows user setup (259 MB) and zip; Linux archive. All package checks pass, including the 150-character path limit (longest 117), and on Linux the launch check activates cognify-ai and Copilot. | **Green** for `cbf8aa0`; to rerun for the release candidate (C2) |

## 3. Failure scenarios

[`FAILURE_SCENARIOS.md`](FAILURE_SCENARIOS.md) catalogs 14 AI routing scenarios and 15 environment, New Project and Run scenarios, each with what the user sees and its test. Every one has a test in CI except an **untrusted workspace** (Restricted Mode): the integration tests run trusted, so it is covered by unit tests and the manual check in S6-09.

## 4. Manual checks (S6-09)

| Check | What to do | Expected | Result |
|---|---|---|---|
| Templates on the host | Create a Next.js, an ASP.NET Core and a Flutter project where the runtime is installed (FastAPI passed in S6-01); Run each. | The app answers and the preview opens. | Pending |
| Templates in a Dev Container | The same in a Dev Container (Docker Desktop). | The same, inside the container. | Pending (FastAPI passed in S6-01) |
| Flutter end to end | Create, test (`flutter test`) and Run a Flutter project. The first build is slow. | The web app opens in the preview. | Pending |
| Fresh first launch | With a new user data folder (or a fresh install), start Cognify IDE twice. | The Get Started walkthrough opens on the first start only. | Pending |
| Restricted Mode | Open a Cognify project and choose **Don't Trust**. | No ▶ Run in the status bar and no `cognify` tasks; Check Environment still works. | Pending |
| Fix with Cognify (optional) | On an error in the editor, open the lightbulb and choose **Fix with Cognify**. | Chat opens with the error attached; Cognify proposes a fix. | Pending (integration-tested) |

## 5. Known limits

Every limit found is in [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md) (reconciled in S6-10): an unsigned installer, no automatic updates, upstream's version number, Windows x64 only certified, the GitHub sign-in page's app name, AI only through a Copilot sign-in, typing `@cognify` before `/fix`, the "Review Migrations" notice, Flutter for the web only, no preview auto-reload, Restricted Mode, no cloud, English only, upstream's look, and the inherited advisories.

## 6. Go/no-go

The criteria are D7's: go when every P0 item is done, S6-01 and S6-02 pass, CI and the security gates are green with no open high or critical finding, and every known limitation is documented.

| Criterion | State |
|---|---|
| Every P0 item done | S6-01, S6-02, S6-03, S6-04, S6-05, S6-06, S6-07, S6-08, S6-10, S6-16 done; S6-11 is this report; S6-12 follows a go. |
| S6-01 and S6-02 pass | Passed (2026-11-07 and 2026-11-08). |
| CI and security gates green, no open high or critical finding | Green; no open code-scanning alert; inherited advisories documented (D7). |
| Known limitations documented | Done (S6-10). |

**Conditions before the release (S6-12):**

- **C1 (met 2026-11-08):** secret scanning and push protection are on, and no code-scanning alert is open.
- **C2:** promote `dev` to `main` (merge commit), dispatch `Cognify (package)` on `main`, and confirm it passes. The owner installs that user setup over the current one and checks that it launches and that a `@cognify` answer's footer shows a non-zero input size (#104).
- **C3:** the S6-09 checks are P1, so they don't block go under D7. Recommended before the release: at least **Restricted Mode** and a **fresh first launch**, which are quick; record the rest, or carry them into Sprint 7 with a reason.

**Recommendation: go**, once C2 is done (C1 is met) and C3 is either done or carried with a reason. Nothing found in Sprint 6 is open, and every capability the MVP promises was checked on the owner's Windows machine or by CI against the shipped build.

### Decision

| Date | Decision | By | Notes |
|---|---|---|---|
| | Go / no-go | Owner | |
