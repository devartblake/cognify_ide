# Windows Build and Native Watchdog Baseline

## Purpose

Define the reproducible Windows development baseline for Cognify IDE while it remains downstream of VS Code OSS.

## Current Runtime Baseline

The repository `.nvmrc` is authoritative for Node.js. At the Sprint 0.5 baseline it specifies Node.js `24.18.0`.

Use the repository-selected package manager/workflow and avoid mixing lockfile strategies.

## Required Windows Tooling

- Windows 10/11 x64 development workstation.
- Git for Windows.
- Node.js matching `.nvmrc` (`24.18.0` at this baseline).
- npm supplied with the selected Node.js runtime.
- Python 3 available to `node-gyp`.
- Visual Studio 2022 or Build Tools 2022 with the **Desktop development with C++** workload.
- Windows SDK selected by the Visual Studio workload.

Recommended verification:

```powershell
node --version
npm --version
python --version
git --version
```

If multiple Visual Studio installations exist, use the Visual Studio Developer PowerShell/Developer Command Prompt when diagnosing native compilation.

## Repository Bootstrap

From a clean checkout:

```powershell
git checkout dev
git pull
npm install
```

For active development:

```powershell
npm run watch
```

Launch the desktop development build using the repository platform-appropriate script. In Git Bash/WSL-compatible shells this is commonly:

```bash
./scripts/code
```

Launch the web development target when required by scope using the current upstream script:

```bash
./scripts/code-web
```

The repository `package.json` explicitly treats `npm run web` as replaced by the current script-based launch path, so do not depend on the legacy `npm run web` workflow.

## `@vscode/native-watchdog` / `node-gyp`

`@vscode/native-watchdog` is a native dependency in the VS Code OSS dependency graph. Failure here usually indicates a toolchain or environment mismatch rather than a Cognify application-code defect.

### Required build chain

`node-gyp` needs all of the following to agree:

1. Supported Node.js version for the repository.
2. Python 3 discoverable by node-gyp.
3. MSBuild from Visual Studio/Build Tools.
4. MSVC C++ compiler toolset.
5. Windows SDK headers/libraries.

### Troubleshooting sequence

1. Confirm Node matches `.nvmrc`.
2. Confirm Python 3 resolves from the same terminal.
3. Open **Visual Studio Installer** and verify **Desktop development with C++** is installed.
4. Ensure an MSVC v143 toolset and a supported Windows SDK are present.
5. Close/reopen the terminal after Visual Studio workload changes.
6. Delete only the failed native package/build artifacts if necessary; avoid deleting lockfiles.
7. Re-run the repository installation command and capture the first native compiler error, not only the final npm failure.

Useful diagnostics:

```powershell
where.exe python
where.exe node
where.exe msbuild
npm config get python
```

When `msbuild` is not visible in a normal shell, retry from a Visual Studio Developer PowerShell before changing npm configuration.

## Do Not Use Legacy Windows Build Advice

Avoid old guidance that installs `windows-build-tools` globally or Python 2. Modern node-gyp uses current Python 3 and supported Visual Studio Build Tools. Installing obsolete global helper packages can make the environment less deterministic.

## Sprint 0.5 Validation Gate

A workstation passes the Windows baseline when:

- [ ] Node matches `.nvmrc`.
- [ ] `npm install` completes, including native dependencies.
- [ ] `npm run watch` reaches a stable watch state without compile failures.
- [ ] desktop development build launches.
- [ ] web development build launches when required by current testing scope.
- [ ] Native Watchdog no longer blocks dependency installation/build.

## Recording Failures

For future native-build failures, record:

- Node version
- Python version/path
- Visual Studio edition/version
- installed MSVC toolset
- Windows SDK version
- first compiler/node-gyp error
- whether the failure reproduces in Developer PowerShell

Keep machine-specific secrets and absolute personal paths out of committed logs.
