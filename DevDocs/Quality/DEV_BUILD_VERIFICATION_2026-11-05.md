# Dev Build Verification: 2026-11-05

- **Purpose:** confirm that the Cognify IDE development build installs, compiles and works on Windows, so the remaining branding work starts from a known-good build.
- **Scope:** the development build (`pnpm run watch` + `scripts\code.bat`) on Windows x64. The packaged build is certified separately in Sprint 6 (`MVP_CERTIFICATION.md`, S6-03/S6-04/S6-11).
- **Commit:** `3863b50df17` on `main` (upstream baseline `37a8101`).
- **Recommendation:** **Ready for sign-off once the fixes are merged.** The first pass found defects B1–B4, including a blocker: a clean build shipped a Cognify AI extension that failed to activate (B1). All four are fixed in the working tree, and checked as described in [Fixes](#fixes). Sign off with the checklist after the fixes reach `main` and CI is green.

## Summary

| Area | Result | Notes |
|---|---|---|
| Toolchain and dependency install | ✅ Pass | After three machine fixes, listed below. |
| Compile (type check, watch build) | ✅ Pass | `typecheck-client`: 0 errors. |
| CI gate parity (`Cognify (dev)`) | ✅ Pass after fixes | Node unit tests: 31,618 pass. cognify-ai unit tests: 115 of 115 after the fixes; 4 of 112 failed before them (B3). |
| Launch and core functionality | ✅ Pass after fixes | New Project created a Next.js project end to end. The first pass needed B1's generated file deleted by hand; after the fix, all four templates show "Ready on this machine" (B2). |
| Product identity and branding | ✅ Pass | Identity, string and NLS checks pass. Open branding items are listed below. |

## Environment

| Item | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26300, x64 |
| Node.js | 24.22.1 (required by `.nvmrc`; 24.20.0 fails the preinstall check) |
| pnpm | 12.16.0 (pinned in `package.json`) |
| Python | 3.13 (needed by node-gyp) |
| C++ toolchain | Visual Studio 2022 Community, MSVC v143, with Spectre-mitigated libraries; Windows SDK 10.0.26100 |
| Git | `core.autocrlf=true` (Git for Windows default) |

### Machine setup needed before `pnpm install` succeeded

These were missing on the test machine. None is a product defect, but `Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md` should list each one:

1. **Node 24.22.1.** `winget upgrade` installs Node 26, which the preinstall check rejects. Use `winget install --id OpenJS.NodeJS.LTS --version 24.22.1`.
2. **pnpm without admin rights.** `corepack enable` fails with `EPERM` under `C:\Program Files\nodejs`. `npm install -g pnpm@12.16.0 --allow-scripts=pnpm` works without admin.
3. **Visual Studio components.** You need the Spectre-mitigated libraries (`Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre`, otherwise `MSB8040`) and a Windows 10/11 SDK (otherwise node-gyp reports "missing any Windows SDK").

A first `pnpm install` took about 24 minutes, mostly linking about 2,000 packages; later installs are incremental.

## Build

| Step | Command | Result |
|---|---|---|
| Dependencies | `pnpm install` | ✅ Exit 0. All native modules built: `@vscode/deviceid`, `@parcel/watcher`, `node-pty`, `@vscode/spdlog`. `@vscode/fs-copyfile` builds only on macOS. The installed lockfile matches `pnpm-lock.yaml` at this commit. |
| Type check | `pnpm run typecheck-client` | ✅ Exit 0, 26 s |
| Dev build | `pnpm run watch` | ✅ Running; `out/` and `extensions/*/out/` up to date |

## CI gate parity

The same steps as `.github/workflows/cognify-dev.yml`, run locally on Windows:

| Gate | Command | Result |
|---|---|---|
| Node unit tests | `pnpm run test-node` | ✅ 31,618 passing, 224 pending, 455 s. The first run had 20 failures, all in upstream's agent host (`sessionPermissions.test`, `agentHostTestDirectories.test`), because the test shell's `TEMP` was an 8.3 short path (for example `C:\Users\ABCDEF~1\…`). Re-run with the normal long-path `TEMP`, both files pass (168 passing, 0 failing). Environmental, not a defect. |
| Lint, Cognify-owned code | `pnpm exec eslint extensions/cognify-ai scripts/cognify build/cognify` | ✅ Pass |
| cognify-ai test type check | `pnpm -C extensions/cognify-ai run typecheck-test` | ✅ Pass |
| cognify-ai unit tests | `pnpm -C extensions/cognify-ai test` | ✅ 115 of 115 after the fixes. Before them: 108 of 112, with 4 failing on a Windows checkout (B3). |
| Product identity | `node scripts/cognify/check-product-identity.mts` | ✅ Pass |
| Upstream baseline | `node scripts/cognify/check-upstream-baseline.mts` | ✅ Pass. Warns that upstream `main` has moved past the recorded `37a8101`; that's expected under the Sprint 6 release freeze. |
| "VS Code" string drift | `node scripts/cognify/vscode-strings.mts` | ✅ Pass: 585 strings (272 rename, 28 reword, 285 keep), none new. |
| NLS rebrand table | `node scripts/cognify/nls-rebrand.mts` | ✅ Pass: 289 messages covered (263 rename, 26 reword), all current. |
| NLS rebrand build tests | `node --test 'build/cognify/test/*.test.ts'` | ✅ 6 of 6 pass |
| cognify-ai integration tests | `pnpm -C extensions/cognify-ai run test-integration` | Not run on Windows. The script is bash/xvfb, so CI on Linux covers it. |

## Functional smoke test

Launched with the repository's `launch` skill: an isolated throwaway profile, an empty workspace folder, workspace trust disabled, and no Copilot sign-in.

| # | Check | Result |
|---|---|---|
| 1 | The window opens and renders | ✅ Window title "Cognify IDE Dev". The Cognify product icon and the Get Started with Cognify IDE walkthrough show; no broken layout. |
| 2 | Cognify AI activates | ✅ No activation error in `exthost.log`, but only after B1's generated file was deleted. |
| 3 | **New Project** opens the template picker | ✅ All four templates appear (ASP.NET Core, FastAPI, Flutter (web), Next.js), each with a runtime status. |
| 4 | Project name validation | ✅ An empty name is rejected with the naming rule. |
| 5 | Location and environment choice | ✅ Shows "Choose Where to Create the Project", then This Machine (Ready) or Dev Container. |
| 6 | Project created (Next.js, This Machine) | ✅ Files written, including `.cognify/project.json` and `.devcontainer/devcontainer.json`. A new Cognify window opens on the project with the **Run** action. |
| 7 | Runtime detection | ❌ → ✅ FastAPI showed "Needs Python 3.10+" with Python 3.13 installed (B2). After the fix, all four templates show "Ready on this machine". |
| 8 | Errors in the smoke run's logs | ✅ No Cognify errors. Only known upstream messages remain: agent-host `agentHostManagement` channel timeouts, MCP "policy-context-unavailable", and remote tunnels not configured. |

Not covered here: Run/Preview, Dev Containers, and signed-in AI (`@cognify` commands). Those are S6-01, S6-02 and S6-09.

## Defects found

| ID | Severity | Defect | Effect | Proposed fix |
|---|---|---|---|---|
| **B1** | **Blocker** | `extensions/cognify-ai/src/package.json` (`"type": "module"`, added in S2-15 so `node --test` runs the sources as ES modules) is copied into `out/` by the extensions build: `build/gulpfile.extensions.ts` passes every non-TypeScript file in `src/` through. Node then loads the CommonJS `out/extension.js` as an ES module. | Cognify AI fails to activate with `ReferenceError: exports is not defined in ES module scope`. Every Cognify command is missing: New Project reports `command 'cognify.newProject' not found`, and no `cognify` model provider is registered. Recurs after every clean build. The file's comment says the build ignores it, which is true only of the esbuild bundle. | Keep the change inside the extension: drop `src/package.json` and run the unit tests as ES modules another way, for example `.mts` test files. Add a check that `out/` contains no `package.json`. The packaged build needs checking for the same problem (S6-04). |
| **B2** | High | The Python probe tries `python3`, then `python`, then `py -3`, but moves on only when a command is missing (`ENOENT`). On Windows, `python3` is usually the Microsoft Store placeholder ("App execution alias"), which runs and exits with an error, so the probe stops with an error status (`extensions/cognify-ai/src/environments/runtimes.ts`, `probe`). | On a typical Windows machine with Python installed, FastAPI shows "Needs Python 3.10+". That is the MVP scenario's host template (S6-01). | Treat a probe that fails without a version as "try the next command", as pip already does, and add a unit test for the Store placeholder. |
| **B3** | Medium | With `core.autocrlf=true`, Windows checkouts have CRLF line endings in `extensions/cognify-ai/agents/*.agent.md` and `templates/**`. CI runs on Linux, so it doesn't catch this. | Four unit tests fail on Windows: three in `agentPersonas.test.ts`, whose frontmatter regex only accepts LF, and the template snapshot in `templates.test.ts`, whose content hashes differ. New projects created from a Windows checkout get CRLF files, including the Flutter `Dockerfile`'s `\` line continuations, which haven't been checked in a container. | Add `.gitattributes` rules: `extensions/cognify-ai/templates/** text eol=lf` and `extensions/cognify-ai/agents/*.md text eol=lf`. Optionally accept `\r?\n` in the test regex. |
| **B4** | Medium | Found while fixing B3. `loadTemplates` copies every file in a template's folder. On the test machine, an editor's .NET restore had created `bin/` and `obj/` inside `templates/aspnetcore/files/` (28 files, ignored by git). | New ASP.NET Core projects, and any package built from such a checkout, would include those generated files. CI's clean checkouts are unaffected. | Skip build and dependency output folders when loading templates. |

## Fixes

All four defects are fixed in the working tree (not yet committed). Details are in `extensions/cognify-ai/CHANGELOG.md`, under Fixed.

| ID | Fix | Checked by |
|---|---|---|
| B1 | `extensions/cognify-ai/src/package.json` removed. `pnpm test` adds `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` (Node detects the ES-module syntax), and `tsconfig.test.json` uses `esnext`/`bundler`. | New `buildOutput.test.ts`. `gulp compile-extension:cognify-ai` produces no `out/package.json`. `out/extension.js` loads as CommonJS (the only missing module is `vscode`, which exists only in the app). |
| B2 | `probe` (`environments/runtimes.ts`) treats exit code 9009 like a missing command, and tries the next command after any failure without a version. | A new unit test using the Store placeholder's real output. In the app, FastAPI shows "Ready on this machine". |
| B3 | `.gitattributes`: `templates/**` and `agents/**` are `text=auto eol=lf`. Existing checkouts get LF after re-checking out those files. The persona test also accepts CRLF. | All four tests pass. No CRLF left in the working tree under `templates/` or `agents/`. |
| B4 | `loadTemplates` skips `bin`, `obj`, `node_modules`, `.dart_tool`, `__pycache__`, `.venv`, `.next` and `.pytest_cache`. | A new unit test. The template snapshot matches on this checkout, which still has the stray `obj/` folders. |

After the fixes: cognify-ai unit tests 115 of 115, test type check, ESLint on Cognify-owned code, and the identity, baseline, string and NLS checks all pass.

## Branding status

**Done and checked by CI:** product identity (`product.json`, data folders, protocol, executable `Cognify.exe`), all branding artwork (including, since this report, the Agents-window icon and the small icon's dark-background plate), the "VS Code" string inventory and drift check, the NLS override table for packaged builds, and the model-facing and user-visible literal renames (R-01 to R-06).

**Open items found, and how each was resolved (owner decisions on 2026-11-05):**

| # | Item | Outcome |
|---|---|---|
| 1 | Dev builds show upstream text by default, for example the Welcome page's "Get started with VS Code" walkthrough. | **Kept as designed (owner).** Dev builds apply the rebrand table only with `COGNIFY_DEV_REBRAND=1 pnpm run transpile-client` (R-06), because upstream's unit tests assert upstream's English. Branding reviews of a dev build use the flag; S6-04 checks the packaged build. |
| 2 | Built-in extensions' 66 overrides apply only to packaged builds. | **Kept as designed.** Dev builds load `extensions/<name>/package.nls.json` directly; S6-04 checks the packaged build. |
| 3 | The Agents-window icon `resources/win32/sessions.ico` was Microsoft's Agents artwork. It ships in Windows packages (`build/gulpfile.vscode.ts`) and is the Agents window's taskbar and jump-list icon. | ✅ **Replaced.** A pale "C" with the cyan/violet `</>` on a navy plate, generated by `generate_assets.py` and chosen by the owner from three candidates. The identity check now fails if the upstream file returns. |
| 4 | The small icon's navy "C" had low contrast on dark taskbars and title bars. | ✅ **Fixed.** The 16–32 px frames of `code.ico` and `favicon.ico` put the icon on a pale plate, which reads on dark and light (an `.ico` can't switch with the theme). Chosen by the owner from three rendered candidates; frames of 48 px and up are unchanged. |
| 5 | Non-English UI still says "VS Code". | **Kept (owner):** English only for the MVP. |
| 6 | The Welcome page tagline "Editing evolved" is upstream's. | **Kept (owner).** It doesn't name VS Code. |
| 7 | `@cognify` is flagged under **Customizations → Migrations** as a deprecated chat participant. | **Planned, no change now (owner).** Design note: [`COGNIFY_CHAT_PARTICIPANT_MIGRATION.md`](../Architecture/COGNIFY_CHAT_PARTICIPANT_MIGRATION.md), recommending custom agents plus extension-contributed prompts after the MVP. |
| 8 | The `launch` skill's Windows cleanup helper only stopped `Code - OSS.exe`, so it left Cognify instances running. | ✅ **Fixed.** It reads the executable name from `product.json` (`Cognify.exe`). Checked: it stopped all 9 processes of a test instance. Recorded in `UPSTREAM_BASELINE.md`. The default source profile `.vscode-oss-dev` is unchanged, because it matches the repository's `.vscode/launch.json`. |

## Sign-off checklist

Re-run after B1 is fixed:

- [ ] `pnpm install` succeeds on a clean checkout (Windows).
- [ ] `pnpm run typecheck-client` has no errors.
- [ ] A clean `pnpm run compile` leaves no `extensions/cognify-ai/out/package.json` (B1).
- [ ] All CI gates in the table above pass on Windows, including `test-node` and the cognify-ai unit tests (B3).
- [ ] The dev app launches as "Cognify IDE Dev" and Cognify AI activates with no error in `exthost.log`.
- [ ] New Project creates a project from each template on the host where its runtime is installed, and FastAPI is detected as Ready when Python 3.10+ is installed (B2).
- [ ] With `COGNIFY_DEV_REBRAND=1`, the Welcome page and walkthroughs show no rename-class "VS Code" text.

| Role | Name | Decision | Date |
|---|---|---|---|
| Owner | | ☐ Approved ☐ Not approved | |
| Reviewer | | ☐ Approved ☐ Not approved | |

## Reproducing this report

```powershell
node --version                      # v24.22.1
pnpm install
pnpm run typecheck-client
pnpm run watch                      # leave running
node scripts/cognify/check-product-identity.mts
node scripts/cognify/check-upstream-baseline.mts
node scripts/cognify/vscode-strings.mts
node scripts/cognify/nls-rebrand.mts
node --test 'build/cognify/test/*.test.ts'
pnpm exec eslint extensions/cognify-ai scripts/cognify build/cognify
pnpm -C extensions/cognify-ai run typecheck-test
pnpm -C extensions/cognify-ai test
pnpm run test-node
.\scripts\code.bat                  # then Cognify: New Project...
```

Logs for a dev run are under `%APPDATA%\cognify-dev\logs\<session>\`; Cognify AI's activation is in `window1\exthost\exthost.log`.
