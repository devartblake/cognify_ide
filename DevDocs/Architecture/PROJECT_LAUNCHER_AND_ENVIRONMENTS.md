# Project Launcher and Environments: Design Note

- **Sprint:** 4 ([`SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](../Sprints/SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md)).
- **Status:** S4-03 spike done (2026-11-05). **Decision: go.** Managed local runs through the Dev Container CLI that the product bundles.
- **Decisions in force:** D1 (Flutter, web target only), D2 (bundled templates), D3 (edit on the host, run in the container; Docker required), D5 (remediation guides, never installs).

## 1. What the spike had to prove

1. The **bundled** `@devcontainers/cli` can be found and started from the **extension host** (`extensions/cognify-ai`), not only from upstream's agent host.
2. `devcontainer up` and `devcontainer exec` work on a preset, and how long they take.
3. What the presets' base images cost to download.

## 2. Findings

### 2.1 Finding the CLI
- **Packaged builds:** the CLI is at `<appRoot>/node_modules.asar.unpacked/@devcontainers/cli/devcontainer.js`. Upstream's build (`build/gulpfile.vscode.ts`) deliberately keeps `@devcontainers/cli` outside the node_modules ASAR, "so its bundled entrypoint must be available outside the ASAR".
- **Development builds:** the CLI is at `<appRoot>/node_modules/@devcontainers/cli/devcontainer.js`.
- **How the extension finds it:** it checks both locations under `vscode.env.appRoot`, the packaged one first (`resolveDevContainerCli` in `extensions/cognify-ai/src/environments/devContainerCli.ts`).
- **Version:** 0.88.0 at upstream `e5b6876`, the same copy upstream's Dev Container agent host uses (`getDevContainerCliPath`).

### 2.2 Running it from the extension host
- **How:** `spawn(process.execPath, [cli, ...args], { env: { …, ELECTRON_RUN_AS_NODE: '1' } })`, without a shell. In the extension host `process.execPath` is the Electron binary, and `ELECTRON_RUN_AS_NODE` makes it run as Node.
- **Proven by an integration test:** "the bundled CLI resolves under the app root and runs on the extension host's runtime" (`src/test-integration/environments.test.ts`) runs `devcontainer --version` that way and passes, in 392 ms.

### 2.3 `up` and `exec` on a preset

The test used a preset of `{ "image": "python:3.12-slim" }` on Linux (Docker 29.9.2), with the image already pulled. The integration test is opt-in locally with `COGNIFY_TEST_DOCKER=1`, and runs in CI.

| Step | Time |
|---|---|
| `devcontainer up` (container created) | 2.5 s |
| `devcontainer exec … python --version` | 0.7 s |
| `devcontainer up` again (reuses the same container) | 0.6 s |

`up` prints one JSON result line at the end, `{ outcome, containerId, remoteWorkspaceFolder, … }`. `parseDevContainerUpOutput` reads it and skips the log lines before it. The workspace is mounted at `/workspaces/<folder>`.

### 2.4 Image cost

Measured with a first pull in the development container. The times depend on the network; the sizes don't.

| Image | Size | First pull |
|---|---|---|
| `mcr.microsoft.com/devcontainers/python:3.12` | 2.4 GB | 28 s |
| `mcr.microsoft.com/devcontainers/typescript-node:22` | 2.9 GB | 31 s |
| `mcr.microsoft.com/devcontainers/dotnet:8.0` | 2.9 GB | 32 s |
| `python:3.12-slim` | 177 MB | 4 s |
| `node:22-bookworm-slim` | 326 MB | under 10 s |
| `mcr.microsoft.com/dotnet/sdk:8.0` | 1.2 GB | under 10 s (layers shared with the above) |
| `debian:bookworm-slim` | 113 MB | 2 s |

**Decision:** presets use the **official slim language images**, not the `devcontainers/*` images. Managed local only builds, tests and runs, so it doesn't need the extra tools in the `devcontainers/*` images (Docker-in-Docker helpers, zsh, a non-root `vscode` user), and the first download is 7–15 times smaller. The images are:
- **FastAPI:** `python:3.12-slim`.
- **Next.js:** `node:22-bookworm-slim`.
- **ASP.NET Core:** `mcr.microsoft.com/dotnet/sdk:8.0`.
- **Flutter web:** a short `Dockerfile` on `debian:bookworm-slim`. It installs the Flutter SDK from Google's release archive (`storage.googleapis.com/flutter_infra_release`, reachable), pinned to a release. There's no third-party Flutter image: the common one is on `ghcr.io`, and its download host is blocked in this environment. Trusting a vendor's own archive is also simpler.

### 2.5 Templates checked in their containers (S4-04)

Each template was rendered as "Demo App" and run through the bundled CLI: `devcontainer up` (the preset's `postCreateCommand` installs dependencies), then the template's checks with `devcontainer exec`.

| Template | `up` | Checks | Time |
|---|---|---|---|
| FastAPI | 20 s (`pip install -e '.[dev]'`) | `pytest` | 2 s |
| Next.js | 19 s (`npm install`) | `npm test`, `npm run build` | 8 s |
| ASP.NET Core | 10 s (`dotnet restore`) | `dotnet test` (xUnit v3 on the Microsoft Testing Platform) | 8 s |
| Flutter (web) | about 4 min the first time (image build: SDK download and `flutter precache --web`), then 3 s | `flutter test`, `flutter build web` | 48 s |

**Found and fixed in the template:** .NET 10's `dotnet test` no longer runs xUnit v3 through VSTest. The template adds `global.json` with `"test": { "runner": "Microsoft.Testing.Platform" }`, drops the VSTest packages, and adds `using Xunit;`.

**This sandbox, not the product:** this development container reaches the internet only through a TLS-intercepting proxy, so the check used a test-only overlay on the rendered copies (host network, proxy variables, the proxy's CA). Its proxy also refuses plain-HTTP `apt`, so the Flutter image was checked on `mcr.microsoft.com/devcontainers/base:bookworm`, which already has the tools, with `remoteUser: root`. The shipped Dockerfile installs those tools on `debian:bookworm-slim`. On GitHub's runners and users' machines, no overlay is needed.

### 2.6 Managed local, end to end (S4-07)

New Project created a FastAPI project with the Dev Container environment, then `ManagedEnvironment` (the code behind the `cognify` tasks) ran it with the bundled CLI, with the same sandbox overlay as §2.5:

| Step | Time |
|---|---|
| `up` (create, `pip install -e '.[dev]'`) | 19 s |
| `test` task: `exec … pytest` (2 passed) | 2.4 s |
| Stop (`docker stop`, found by the `devcontainer.local_folder` label) | 0.2 s |

**Found and fixed:** Starlette now deprecates `httpx` for its test client, so the FastAPI template depends on `httpx2` (2.16), and the tests run warning-free with `-W error`. Its preset also sets `PIP_ROOT_USER_ACTION=ignore` and `PIP_DISABLE_PIP_VERSION_CHECK=1`.

**Ports:** the CLI applies `appPort` (published as `127.0.0.1:<port>:<port>`, so only this machine can reach it) but not `forwardPorts`, which is an editor feature. Each preset sets both.

### 2.7 Preview in the integrated browser (S5-03)

Sprint 5's spike asked whether Cognify can show a running app inside the editor without building its own preview.

- **Opening it:** upstream's integrated browser (`src/vs/workbench/contrib/browserView`, desktop) registers `workbench.action.browser.open`, which takes a URL or `{ url, openToSide, reuseUrlFilter }`. Called from the extension host with a local HTTP server's URL, it opened the page in a tab beside the editor; a second call with `reuseUrlFilter: "http://localhost:<port>/**"` navigated the same tab instead of opening another (integration test, `src/test-integration/preview.test.ts`).
- **Web build:** upstream registers only a stub browser service there, so the command doesn't exist. `openPreview` then uses Simple Browser's `simpleBrowser.api.open`, and the system browser as the last resort.
- **Reload:** `workbench.browser.autoReloadOnFileChange` (default on) only reloads local `file://` pages, not an app on `localhost`. Dev servers with hot reload (Next.js, Flutter) don't need it; for FastAPI and ASP.NET Core, Run reloads the tab with `workbench.action.browser.reload` after a save (S5-06).
- **Decision D1: go.** The preview is upstream's integrated browser.

## 3. Design (confirmed by the spike)

- **One module, no `vscode` import:** `environments/devContainerCli.ts` resolves the CLI, runs it and parses its output, so it can be unit-tested with `node --test`.
- **Commands built on it (S4-07):**
  - **Start Environment:** `up --workspace-folder <project>`.
  - **Run Build/Test in Environment:** `exec --workspace-folder <project> <command>`, streamed to a Cognify terminal through `onOutput`.
  - **Stop:** `docker stop <containerId>`.
  - **Rebuild:** `up --remove-existing-container`.
- **No CLI:** if the build has no CLI, which shouldn't happen, managed local is reported as unavailable. Its plain `docker run` fallback (plan, S4-03) isn't needed.
- **Docker detection (S4-06):** `docker version --format '{{.Server.Version}}'` with a timeout. "The client is installed but the daemon isn't running" is reported separately from "Docker isn't installed", because the remediation differs.
- **The project records its environment (S4-05):** New Project writes `.cognify/project.json` with the template id, the chosen environment (`host` or `container`) and the template's commands, rendered with the project's names. Managed local (S4-07) and Project Cognition (S4-09) read it, so neither has to guess from the files.
- **No shells, no workspace code:** commands come from the template manifest, not from the workspace, and are passed as argument arrays.

## 4. Not verified yet

| Item | Where it gets verified |
|---|---|
| Windows (Docker Desktop, WSL 2) and macOS (Docker Desktop) | S4-01 Windows session; macOS by the owner when available |
| Packaged build: the CLI path under `node_modules.asar.unpacked` | Covered by the unit test of the path rules; confirm in the first packaged build |
| Podman (`docker` alias) | Best effort (D3); not tested |
| Flutter preset build time (SDK download, about 1 GB) | Done in S4-04: about 4 minutes the first time (§2.5) |

## 5. Notes on this development environment
- **Docker:** this cloud development container has the Docker client and daemon, but the daemon isn't started by default (`dockerd &`).
- **Network policy:** it blocks `pkg-containers.githubusercontent.com` (`ghcr.io` image layers) and `electronjs.org` (Electron headers for `pnpm install`). Neither limits the product; they only shape what can be tested here.
