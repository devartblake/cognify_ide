# Sprint 6: MVP Certification

- **Status:** In progress (started 2026-11-05). The owner approved decisions D1–D8 as proposed on 2026-11-05. Sprint 5 is closed (D1). See [Progress](#progress).
- **Revised (2026-11-05):** after the owner's [dev-build verification](../Quality/DEV_BUILD_VERIFICATION_2026-11-05.md): S6-01 is narrowed to what the dev build didn't cover, and a P0 gate (S6-16) builds the extension the way it ships and checks that it activates. #6 is closed.
- **Duration:** 1 week (about 5 working days), per `REVISED_MVP_ROADMAP.md`.
- **Inputs:**
  - [`REVISED_MVP_ROADMAP.md`](../Roadmap/REVISED_MVP_ROADMAP.md), Sprint 6: Windows packaging and development-distribution validation; build, smoke, targeted unit and security gates; AI routing and runtime-detection failure scenarios; documentation and status reconciliation; the MVP go/no-go review;
  - the roadmap's **MVP Capability Matrix** and **Schedule Control Rule** (no new features unless they validate the thesis or unblock the MVP);
  - [`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`](../Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md), **Release Freeze**: record the exact upstream commit, stop non-critical imports, run the full validation suite, tag a release baseline after acceptance;
  - [`SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md`](SPRINT_5_RUN_PREVIEW_AND_ONBOARDING.md): Sprint 5's exit state and its carry-overs;
  - [`CI_AND_SECURITY_BASELINE.md`](../Quality/CI_AND_SECURITY_BASELINE.md).

## Sprint Goal

Decide, with evidence, whether Cognify IDE is an MVP: a Windows build that a person can install and use to create a project, run and preview it on the host or in a Dev Container, and get routed, traceable AI help, with every MVP capability backed by a test or a recorded check, the known limits written down, and a tagged release baseline if the answer is go.

No new features. Anything found is fixed only if it blocks an MVP capability; everything else becomes a v1.5 backlog item.

## Progress

| ID | State | Pull request | Notes |
|---|---|---|---|
| S6-01, S6-02 | Waiting on the owner | n/a | Blocking for go (D1). S6-01 needs the S6-03 package, and the Windows publisher name (still "Microsoft Corporation" in the installer and file properties; the owner chooses the replacement). |
| S6-16 | Done | #88 | **Shipped-build check.** `Cognify (dev)` builds cognify-ai with the dev build's gulp task and with the product's packaging (`build/cognify/packageExtension.ts`) and activates each in Electron (`src/test-smoke`); putting B1 back makes it fail. A `windows-latest` job runs the extension's unit tests (under 2 minutes). **Found:** the product build minified the templates' JSON files, so a Next.js project created from an installed build got a one-line `package.json` and `tsconfig.json`; fixed in `minifyExtensionResources`. |
| S6-03, S6-04 | Done, Windows run pending | #90 | **`Cognify (package)`** (manual dispatch): Windows x64 user setup and zip, Linux x64 tar.gz, unsigned, kept 30 days. `scripts/cognify/check-package.mts` checks the identity, NLS overrides, cognify-ai's bundle, agents and unchanged templates, and the Dev Container CLI outside the ASAR, and with `--launch` starts the installed app and runs the smoke test. Verified with a local Linux product build (7 min, 1.8 GB unpacked): all checks and the launch pass. **Found:** packaging stripped the built-in Copilot extension's `@github/copilot`, so the product build failed; fixed in `packageCopilotExtensionStream` (upstream ships a prebuilt Copilot VSIX instead). The workflow's first CI run, and the Windows job's first run at all, follow the next promotion to `main` (manual dispatch needs it on the default branch). |
| S6-05 | Done, owner settings pending | #89 | **`Cognify (security)`**: CodeQL on Cognify-owned code, failing on high or critical findings, and `pnpm audit` of cognify-ai's production dependencies (clean). The first CodeQL run found a high-rated ReDoS in `scripts/cognify/vscode-strings.mts`, fixed. **Owner:** turn on secret scanning and push protection. **Open (D7):** the whole product's production dependencies, all inherited from upstream, have 1 critical and 10 high advisories; how they count for go is the owner's decision. |
| S6-06 to S6-13 | Not started | | |
| S6-14, S6-15 | Not started | | Stretch. |

## Starting Point (Sprint 5 exit)

| Area | State | Gap this sprint closes |
|---|---|---|
| MVP capabilities | Every row of the capability matrix marked "Yes" or "Basic" has shipped to `main` (Sprints 1–5): identity, provider routing with privacy and audit, the role agents, Project Cognition, local and Dev Container execution, Run/Preview, and the beginner modes. | Evidence per capability in one certification report. |
| Windows | The owner built and launched the **dev build** on Windows 11 x64 on 2026-11-05 ([report](../Quality/DEV_BUILD_VERIFICATION_2026-11-05.md)): it launches as Cognify IDE, the CI gates pass locally, and New Project worked end to end. That pass found four defects (B1–B4), fixed and promoted in #84. B1 was a blocker CI missed: the extension failed to activate when built with the gulp task that produces the shipped output, while CI compiles it with `tsc`. Not yet checked on Windows: an installed package, Run/Preview, and Dev Containers. Upstream's packaging tasks (`build/gulpfile.vscode.win32.ts`, `build/win32/code.iss`) are unchanged and unused. | A Windows package built in CI, installed and checked by the owner; CI that builds the extension the way it ships. |
| Signed-in AI | Never checked with a real Copilot sign-in (S2-04 → … → S5-02). Every AI test uses fake vendors. | One recorded session through the MVP scenario. |
| CI and security | `Cognify (dev)` runs typecheck, unit, integration (with Docker), the identity, baseline, string and NLS checks. Upstream's CodeQL workflow is disabled with the other inherited workflows, so no static analysis runs. | A Cognify-scoped CodeQL job, a dependency check, and secret scanning. |
| Failure scenarios | Many are tested (fake vendors: rate limits, quota, deadline, privacy; runtimes: missing, outdated, timeout, permission denied; Run: port in use, never answers, crash), but there is no catalog, and some are untested. | One catalog, each scenario linked to its test or check; gaps filled. |
| Manual checks owed | Run on each template (host and Dev Container), a fresh first launch, and Flutter end to end. | Done and recorded. |
| Open issues | #6 (identity) closed on 2026-11-05 after the dev-build launch. #8 (agent roles) stays open only for the signed-in check. | #8 closed, or carried with a reason. |

## Key design: certify the packaged build, not the dev build

```text
Cognify (package) workflow, manual dispatch (S6-03)
   windows-latest: install → compile → gulp vscode-win32-x64(-min) → user-setup (Inno, unsigned) + zip
   ubuntu-latest:  same for linux-x64 (archive), then a launch smoke under xvfb
        │
        ├── artifacts: CognifyUserSetup-x64-<ver>.exe, Cognify-win32-x64-<ver>.zip, linux tar.gz
        │
        └── packaged-build checks (S6-04): identity, NLS overrides applied, cognify-ai present,
            templates + @devcontainers/cli under node_modules.asar.unpacked
```

- **The owner installs the CI artifact** (S6-01) instead of building on Windows, which has blocked four sprints. Building from source on Windows stays a documented, secondary path.
- **Unsigned for the MVP (D2):** SmartScreen will warn; the guide says how to proceed. Code signing is v1.5.
- **Certification evidence lives in one report** (`DevDocs/Quality/MVP_CERTIFICATION.md`): each MVP capability, how it is verified (test name, CI job, or recorded manual check), and the result.

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

### A. Owner checks (now blocking, D1)
| ID | Item | Pri | Acceptance | Closes |
|---|---|---|---|---|
| S6-01 | **Windows install, Run/Preview and Dev Containers** (was S5-01 … S2-01; narrowed after the dev-build verification, which already covered launch, identity and New Project): install the CI-built user setup (S6-03) and launch it; create a FastAPI project, then Run it and open the preview on the host; with Docker Desktop, reopen it in its Dev Container and Run and preview it there. | P0 | The installed build launches as *Cognify IDE* with user data under `%APPDATA%\Cognify`; Run and preview work on the host and in the Dev Container; recorded in the certification report. | — |
| S6-02 | **Signed-in session** (was S5-02 … S2-04): with a Copilot sign-in, `@cognify /review`, `/explain`, `/guide` and `/fix` (including the quick fix), the personas and role flow, "Why this provider?", and the project model's live `recentChanges`. | P0 | Results recorded in `AGENT_ROLES_AND_REUSE_MATRIX.md` and the certification report. | #8 |

### B. Distribution
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S6-03 | **`Cognify (package)` workflow** (manual dispatch): Windows x64 user setup and zip, Linux x64 archive, as workflow artifacts, built from `main` with upstream's gulp tasks. Unsigned (D2). | P0 | A run produces the three artifacts; their names and sizes are recorded. |
| S6-04 | **Packaged-build checks:** a script run on the Linux artifact (and on Windows in S6-01): product name and identifiers, NLS overrides applied ("Cognify IDE" where the inventory says rename), the cognify-ai extension and its templates present, `@devcontainers/cli` at `node_modules.asar.unpacked`, and a headless launch that activates Cognify. | P0 | The script passes in the package workflow. |

### C. Gates
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S6-16 | **Shipped-build gate in CI** (added after B1): in `Cognify (dev)`, build cognify-ai with the gulp task the product build uses (`compile-extension:cognify-ai`), check its output (CommonJS, no `package.json` under `out/`, templates present), and run an activation smoke against that output: the extension activates and registers its commands and chat participant. Also run cognify-ai's unit tests on a `windows-latest` job, so Windows-only defects such as B2 and B3 fail CI. | P0 | Both run on PRs to `dev` and `main`; reverting the B1 fix makes the gate fail. |
| S6-05 | **Security gates (D4):** a Cognify CodeQL job (JavaScript/TypeScript) on Cognify-owned paths (`extensions/cognify-ai`, `scripts/cognify`, `build/cognify`); `pnpm audit --prod` for cognify-ai's dependencies; GitHub secret scanning and push protection on (owner setting). Findings triaged: fix, or record why not. | P0 | The jobs run on PRs to `dev` and `main`; no open high or critical finding. |
| S6-06 | **MVP scenario test:** one integration test through the API, end to end with fake vendors: New Project (FastAPI, host) → Run → preview opened → `/guide` and `/fix` answered with the project context → Stop. | P0 | Passes in CI. |
| S6-07 | **AI routing failure scenarios:** a catalog (no models, Copilot not signed in, all vendors failing, rate limit and quota, deadline, cancellation, a failure mid-stream, local-only with no local model, confidential workspace, pinned model failing), each linked to its test; tests added for any gap. | P0 | Every scenario has a test or a recorded reason. |
| S6-08 | **Environment failure scenarios:** the same for runtimes (missing, outdated, timeout, permission denied, Docker stopped or absent), Dev Containers (no CLI, image download failing, `up` failing), Run (port in use, never answers, crashes), New Project (folder not empty, cancel), and an untrusted workspace. | P0 | Every scenario has a test or a recorded reason. |
| S6-09 | **Owed manual checks:** Run on each template on the host where its runtime is present and in its Dev Container; a fresh first launch (walkthrough opens once); Flutter end to end. | P1 | Recorded in the certification report. |

### D. Documentation, review and release
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S6-10 | **Documentation and status reconciliation:** README (what Cognify is, install, first steps, limitations), the roadmap and sprint docs, the guides index, `KNOWN_LIMITATIONS.md` (for example: unsigned build, Copilot needed for chat, Flutter web only, no preview auto-reload, no cloud), the CHANGELOG's release section, and issue #8. | P0 | No doc contradicts the shipped behavior; every open item has a home. |
| S6-11 | **MVP certification report and go/no-go review:** `DevDocs/Quality/MVP_CERTIFICATION.md` with the evidence per capability, the gates' results, the failure catalogs, the manual checks, and the known limits. The owner decides go or no-go (D7). | P0 | The decision is recorded in the report. |
| S6-12 | **Release (on go):** promote `dev` to `main` (merge commit), tag `cognify-v0.1.0` and the release baseline on `main` (D5), and publish a GitHub pre-release with the S6-03 artifacts and the CHANGELOG section. | P0 | The tag and the pre-release exist. |
| S6-13 | **Release freeze (D6):** no upstream import this sprint unless it fixes a security issue; the certified upstream commit is `37a8101`. | P1 | The baseline manifest names the certified commit. |

### E. Carried stretch items
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S6-14 | Beginner wording setting (was S5-10). | P2 | As planned in Sprint 5. |
| S6-15 | Harden the S3-08 watcher test (was S5-16). | P2 | Ten local runs in a row pass. |

## Decisions needed

The owner approved all eight as proposed on 2026-11-05.

| # | Decision | Proposed | Why it matters |
|---|---|---|---|
| D1 ✅ | **Closing Sprint 5, and the owner checks.** | **Close Sprint 5 at the S5-14 promotion.** Carry S5-01 and S5-02 into Sprint 6 as S6-01 and S6-02, and make them **blocking for go**: the MVP can't be certified without a Windows launch and a signed-in session. | They have carried over four sprints; certification is where they stop moving. |
| D2 ✅ | **Windows distribution form.** | **Unsigned x64 user setup (Inno) and a zip, built by a manual-dispatch CI workflow.** Code signing and auto-update are v1.5. | Building from source on Windows has blocked the check since Sprint 2; a CI artifact removes that dependency. |
| D3 ✅ | **Certified platforms.** | **Windows x64 is the certified MVP platform.** Linux x64 is built and smoke-tested in CI; macOS is not built. | The roadmap and #6 are Windows-first; macOS needs signing and notarization to be usable. |
| D4 ✅ | **Security gates.** | **A Cognify-scoped CodeQL job, `pnpm audit --prod` for cognify-ai, and GitHub secret scanning with push protection** (the owner turns it on in settings). Upstream's CodeQL workflow stays disabled. | Cognify-owned code has had no static analysis since the inherited workflows were disabled. |
| D5 ✅ | **Version and tags.** | **`cognify-v0.1.0`** for the MVP, with a `release-baseline-2026-11` tag on the same commit; the CHANGELOG gets a `0.1.0` section. The product's Code OSS version (1.146.0) stays, for extension compatibility. | A stable name to install, report against, and roll back to. |
| D6 ✅ | **Release freeze.** | **No upstream import in Sprint 6** unless it fixes a security issue; the certified upstream is `37a8101`. | Certification must test what ships. |
| D7 ✅ | **Go/no-go criteria.** | **Go** when every P0 item is done, S6-01 and S6-02 pass, CI and the security gates are green with no open high or critical finding, and every known limitation is documented. The owner decides. | An explicit bar keeps the review short. |
| D8 ✅ | **What a no-go means.** | **Fix only the blocking findings in a short Sprint 6b** (up to a week), then review again; nothing else enters. | It keeps scope from growing at the finish line. |

## Suggested sequence

| Day | Work |
|---|---|
| 1 | S6-16 shipped-build gate. S6-03 package workflow, S6-04 packaged-build checks. S6-05 security gates. |
| 2 | S6-07 and S6-08 failure catalogs and missing tests. S6-06 MVP scenario test. |
| 3 | S6-01 Windows install (owner), S6-02 signed-in session (owner), S6-09 manual checks. Fix blockers. |
| 4 | S6-10 documentation reconciliation, `KNOWN_LIMITATIONS.md`. S6-11 certification report. |
| 5 | Go/no-go review (D7). On go: S6-12 promotion, tag and pre-release. |

## Sprint Definition of Done

- [ ] A Windows x64 package built in CI installs and passes the MVP scenario on the owner's machine (S6-01).
- [ ] A signed-in session passes the AI part of the MVP scenario (S6-02).
- [ ] The packaged build passes its checks in CI (S6-04), and the MVP scenario test passes (S6-06).
- [ ] CI builds cognify-ai the way it ships and checks that it activates, and runs its unit tests on Windows (S6-16).
- [ ] CodeQL, the dependency audit and secret scanning run, with no open high or critical finding (S6-05).
- [ ] Both failure catalogs are complete, each scenario linked to a test or a recorded reason (S6-07, S6-08).
- [ ] The certification report records the evidence and the owner's go/no-go decision (S6-11).
- [ ] On go: `cognify-v0.1.0` is tagged on `main` and published as a pre-release with the packages (S6-12).
- [x] #6 closed (2026-11-05).
- [ ] #8 closed.

## Out of scope

- **New features** (Schedule Control Rule), including the Cognify pet and cloud workspaces.
- **Code signing, notarization and auto-update:** v1.5.
- **macOS packages** (D3).
- **Upstream imports** other than security fixes (D6).
- **Marketplace publication** of the extension; it ships built in.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Upstream's Windows packaging needs secrets or Microsoft-only steps (signing, ESRP) | The package workflow fails | Run the unsigned path only; drop signing steps; fall back to the zip if the Inno setup step needs more. |
| The packaged build behaves differently from the dev build (asar paths, NLS, built-in extension packaging) | Features break only after install | S6-04 checks the package itself; S6-01 runs the scenario on it. |
| CI builds the extension differently from the product build (B1: `tsc` in CI, gulp in the product) | A defect only the shipped build has passes CI | S6-16 builds with the product's gulp task and activates the result. |
| The owner checks slip again | No certification | They are blocking (D1); the package removes the build step; the session can be scheduled for day 3. |
| CodeQL reports many findings in inherited code | Noise, slow triage | Scope to Cognify-owned paths (D4). |
| A blocking defect found late | Release slips | D8: a short Sprint 6b for blockers only. |
| GitHub-hosted Windows runners are slow for a full build | Long feedback | Manual dispatch, cache `node_modules` and the Electron download; build only x64. |
