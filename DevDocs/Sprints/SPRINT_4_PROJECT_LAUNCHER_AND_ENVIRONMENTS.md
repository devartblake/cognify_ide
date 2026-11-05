# Sprint 4: Project Launcher and Environments

- **Status:** In progress (started 2026-11-05). The owner approved decisions D1–D5 as proposed on 2026-11-05. See [Progress](#progress).
- **Duration:** 1 week (about 5 working days), per `REVISED_MVP_ROADMAP.md`.
- **Inputs:**
  - [`REVISED_MVP_ROADMAP.md`](../Roadmap/REVISED_MVP_ROADMAP.md), Sprint 4: guided project creation, a small template set, host runtime detection, managed local execution with Dev Container presets, and guided remediation;
  - [`SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md`](SPRINT_3_AGENT_ORCHESTRATION_AND_PROJECT_COGNITION.md): Sprint 3's exit state and its carry-overs;
  - [`PROJECT_COGNITION_MVP.md`](../Architecture/PROJECT_COGNITION_MVP.md): the project model a new project feeds into;
  - [`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`](../Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md): the import and promotion every sprint.

## Sprint Goal

A user can **start a supported project from Cognify in a few steps and run it**, whether or not their machine already has the right tools:
- pick a template;
- see which runtimes the host has, and what is missing;
- create the project, either on the host or in a **managed local** Dev Container;
- get clear, safe guidance when something required is missing.

Running and previewing the app inside the editor comes in Sprint 5. This sprint makes sure the project and its environment are ready for it.

## Progress

| ID | State | Pull request | Notes |
|---|---|---|---|
| S4-01, S4-02 | Waiting on the owner | n/a | Hands-on checks, carried over from S3-01 and S3-02 (D4). |
| S4-03 | Done | #62 | **Go.** The bundled `@devcontainers/cli` resolves under `vscode.env.appRoot` (packaged: `node_modules.asar.unpacked`; development: `node_modules`) and runs from the extension host through `process.execPath` with `ELECTRON_RUN_AS_NODE` (integration test). On a `python:3.12-slim` preset: cold `up` 2.5 s, `exec` 0.7 s, warm `up` 0.6 s. Presets will use the official slim images (113 MB–1.2 GB) rather than the `devcontainers/*` images (2.4–2.9 GB); Flutter uses a Dockerfile on `debian:bookworm-slim` with Google's SDK archive. Findings: [`PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](../Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md). The Docker test runs in CI (`COGNIFY_TEST_DOCKER=1`). |
| S4-04 | Done | #63 | **Four templates** in `extensions/cognify-ai/templates/`: FastAPI, Next.js, ASP.NET Core and Flutter (web, D1). Each is a manifest plus files, with versions pinned to current releases (Next 16.4.5, React 19.3.1, FastAPI 0.162, .NET 10, xUnit v3, Flutter 3.47.9), current LTS runtimes (Python 3.13, Node 24, .NET 10), and a slim-image Dev Container preset that installs dependencies on creation and turns off framework telemetry. `environments/templates.ts` loads and validates templates, derives the name forms (npm, Python, C#, Dart), renders placeholders (failing on unknown ones), and writes a project only into a new or empty folder, checking every path first. **All four checked in their Dev Containers** through the bundled CLI: FastAPI (`pytest`), Next.js (`npm test` and `npm run build`), ASP.NET Core (`dotnet test`) and Flutter (`flutter test` and `flutter build web`) pass. This check found and fixed two ASP.NET Core issues: .NET 10 needs `global.json` to opt into the Microsoft Testing Platform for xUnit v3, and xUnit v3 needs `using Xunit;`. Unit tests (6) pin the rendered output with a snapshot. Project Cognition answers `howToTest` for FastAPI and Next.js; ASP.NET Core and Flutter need S4-09. |
| S4-06 | Done | #63 | `environments/runtimes.ts` probes Git, Node.js, npm, pnpm, Python, pip, uv, the .NET SDK, Flutter, Dart and Docker in parallel. It runs only fixed version commands, with a 3 s timeout and no shell (`cmd.exe` only for Windows `.cmd` shims, with fixed arguments), with Python fallbacks (`python3`, `python`, `py -3`). Docker reports "installed but not running" separately. `checkRequirements` compares versions numerically, and optional requirements never block. **Cognify: Check Environment** shows runtimes and per-template readiness (host and Dev Container), and logs metadata only. Tests: 4 unit (found, missing, outdated, timed out, permission denied, Docker stopped), and 1 integration test through the API with a fake host. |
| S4-05 | Done | #64 | **Cognify: New Project...** asks for the template (each shows whether this machine is ready), the name, the parent folder and, when Docker and the bundled CLI are available, the environment (this machine or a Dev Container, recommended when the host lacks tools). The flow (`environments/newProject.ts`) writes nothing until the last answer, and refuses a project folder that already has files before asking for the environment. It writes the template's files, its Dev Container preset either way, and `.cognify/project.json` (template, environment and rendered commands; S4-07 and S4-09 read it). If the chosen host still lacks tools, a dialog names them before opening the folder. Entry points: the command, the Explorer's empty-window welcome view, and the **Get Started with Cognify IDE** walkthrough (New Project, Check Environment, Check AI Setup). Tests: 4 unit (both environments, cancelling at each step writes nothing, folder not empty), and 1 integration test through `CognifyAiApi.createProject` with a fake host. |
| S4-07 | Done | #65 | **Managed local.** The template's commands (install, build, test, run) from `.cognify/project.json` are tasks of type `cognify`. In a Dev Container project they run through the bundled CLI: `up` (create or reuse), then `exec` with the template's arguments, streamed to the task terminal; closing the terminal cancels. In a host project they run through the shell, with each argument quoted as a whole. **Start**, **Stop** and **Rebuild Environment**, and **Run in Environment...**. Stop finds the containers by the CLI's `devcontainer.local_folder` label. A transient image-download failure (TLS or I/O timeout, reset, rate limit) is retried once; permanent ones aren't. Trusted workspaces only. Presets gain `appPort`, which the CLI publishes on `127.0.0.1` only, so `run` is reachable from this machine. **Manual check (Linux, Docker 29.9.2):** New Project created a FastAPI project in a Dev Container; `up` took 19 s (with `pip install`), `pytest` in the container passed in 2.4 s, and Stop stopped it in 0.2 s. It found Starlette's deprecation of `httpx` for its test client, so the FastAPI template now uses `httpx2` and quiets pip's root and version notices. Tests: 5 unit (fake CLI and Docker), 1 integration test that runs a `cognify` task through a fake CLI. |
| S4-08 | In review | | **Guided remediation (D5).** In **Check Environment**, picking a missing, outdated, stopped or failing tool (or a template that needs one) shows how to fix it: **Open in Terminal** types the command into a new terminal without pressing Enter, **Copy Command**, **Open the Install Page** (the tool's official page), **Use a Dev Container Instead** (when Docker is running and the bundled CLI is present; never for Docker itself), and **Re-check**. Commands come from `environments/remediation.ts`: winget on Windows, Homebrew on macOS, apt on Debian and Ubuntu, and only the link where no single command fits (for example Node.js on Linux, whose vendor setup pipes a script into a shell). A stopped Docker gets "start" guidance (`sudo systemctl start docker` on Linux). Each choice is logged as metadata. Tests: 3 unit (guidance for every tool on every OS, states, and no piped or chained commands). |
| S4-09 to S4-12 | Not started | | S4-09: the launcher already writes `.cognify/project.json`; Project Cognition doesn't read it yet. |

## Starting Point (Sprint 3 exit)

| Area | State | Gap this sprint closes |
|---|---|---|
| Project creation | Only upstream's **Open Folder** and **Clone Repository**. Upstream has no project templates, and Copilot no longer contributes a `/new` scaffolding command. | The whole launcher: templates, a guided flow, entry points. |
| Runtime detection | Nothing user-facing. Upstream has `findExecutable` (`src/vs/base/node/processes.ts`); Project Cognition detects *manifests*, not installed tools. | Detect the host's runtimes and match them against each template's requirements. |
| Containers | **Upstream bundles the open-source Dev Container CLI**, `@devcontainers/cli` 0.88.0 (MIT), in `package.json` and `remote/package.json`. Its new Dev Container agent host (`src/vs/platform/agentHost/node/devContainerAgentHostService.ts`) drives `devcontainer up` and Docker. Microsoft's *Dev Containers extension* is proprietary and licensed only for Microsoft's products, so Cognify can't ship or depend on it. | Managed local execution through the bundled CLI, with Cognify-owned presets. |
| Project Cognition | Indexes manifests, CI and conventions; the `cognify_projectModel` tool answers how to build and test. | A new project is understood right away. Optionally, record its template and environment (S4-09). |
| Sprint 3 carry-overs | S3-01 (Windows build) and S3-02 (signed-in session) wait on the owner. | Carried over as S4-01 and S4-02 (D4). |

## Key design: Cognify-owned launcher, upstream's container CLI

**Everything new lives in `extensions/cognify-ai`, with no `src/vs/**` edits.** The launcher, the templates, runtime detection and remediation are extension code built on stable APIs: commands, `QuickPick`, walkthroughs, tasks, terminals and `vscode.env.appRoot`.

1. **Templates are data.** Each template is a folder in the extension: a manifest plus files. The manifest declares:
   - an id, a name and a description;
   - **requirements**: runtimes, minimum versions, and which ones are optional;
   - the files to write, with simple `{{name}}` substitution;
   - its `.devcontainer/devcontainer.json` **preset**;
   - its build, test and run commands, which Sprint 5's Run/Preview will use.

   Templates are pure data, so they can be unit-tested without the editor, and CI can check that each one generates the same files every time.
2. **Runtime detection is a pure probe.** It runs only known executables, such as `node --version`, `python3 --version`, `dotnet --list-sdks`, `flutter --version`, `docker version` and `git --version`, each with a timeout. It **never runs workspace code**, and the results are cached for the session. Requirements are matched with version ranges.
3. **Managed local means editing on the host and running in a container.**
   - The extension finds the **bundled** CLI under `vscode.env.appRoot`, at `node_modules/@devcontainers/cli/devcontainer.js`, and runs it with the extension host's Node (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`).
   - It uses `devcontainer up --workspace-folder <project>` to create or start the container, and `devcontainer exec` to run the template's commands inside it, shown in a Cognify terminal.
   - Full "reopen in container", with a remote extension host inside the container, is **out of scope**. It needs a remote-server resolver that Cognify doesn't ship.
4. **Remediation guides; it never installs silently.**
   - For a missing or outdated runtime, it shows per-OS guidance: winget on Windows, Homebrew on macOS, the distribution's packages or the vendor installer on Linux, and the official link.
   - The install command is copyable, or can be pre-filled in a terminal for the user to run.
   - When Docker is available, it offers **"Use a Dev Container instead"**.
   - Re-check refreshes the result.
5. **Entry points:**
   - the **Cognify: New Project…** command;
   - a contributed walkthrough, "Start a Cognify project", on the Welcome page;
   - the Cognify AI setup view.

   **Cognify: Check Environment** shows the runtime report on its own.

**The S4-03 spike has to prove two things first:**
- that the bundled CLI can be started from the **extension host**, in development and packaged builds, on Linux, macOS and Windows (Docker Desktop and WSL);
- how long a cold `devcontainer up` takes for each preset's image.

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

### A. Sprint 3 carry-overs (owner)
| ID | Item | Pri | Acceptance | Closes |
|---|---|---|---|---|
| S4-01 | **Windows dev build** (was S3-01 and S2-01): `pnpm install` with Node 24.22.1, then `.\scripts\code.bat`. | P0 | Launches as *Cognify IDE Dev*; user data in `%APPDATA%\cognify-dev`; `.build\electron\Cognify.exe` exists. | #6 |
| S4-02 | **Signed-in session** (was S3-02 and S2-04): `@cognify /review` and `/explain`, the four personas on Cognify models and the role flow in the Chat UI, "Why this provider?", and the project model's live `recentChanges` Git call. | P0 | Results recorded in `AGENT_ROLES_AND_REUSE_MATRIX.md` and `PROJECT_COGNITION_MVP.md` §7. | #8 |

### B. Project launcher
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S4-03 | **Spike: the Dev Container CLI from the extension host.** Find and start the bundled CLI, run `devcontainer up` and `exec` on one preset, detect Docker, and measure cold and warm start times. Record the findings in a short design note (`PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`). | P0 | A go/no-go, with timings. If no-go: managed local falls back to `docker run` with the preset's image, or moves to Sprint 5. |
| S4-04 | **Template model and the four templates (D1, D2).** The manifest schema, generation with substitution, and four Cognify-owned templates with pinned versions, each with a `.devcontainer` preset and build, test and run commands. | P0 | Unit tests generate each template into a temporary folder and compare it with a snapshot. Generated projects pass Project Cognition's `howToTest`. |
| S4-05 | **New Project flow.** **Cognify: New Project…** walks through template, name and location, then environment: the host (when its requirements are met) or managed local (when Docker is available). It shows the runtime check, creates the files, and opens the folder. Also: the walkthrough, and the setup-view entry. | P0 | Integration test (fake file system and a fake runtime probe) for both environments. Cancelling at any step writes nothing. It refuses to write into a folder that isn't empty. |

### C. Environments
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S4-06 | **Runtime detection** and **Cognify: Check Environment**: probes for git, Node and pnpm or npm, Python and uv or pip, .NET SDK, Flutter and Dart (D1), and Docker or Podman, with versions. Matched against each template's requirements. | P0 | Unit tests with a fake process runner, covering found, missing, too old, timed out and permission denied. No workspace code runs. Each probe has a timeout of 3 s or less, and all probes run in parallel. |
| S4-07 | **Managed local execution (D3).** For a project with a preset: **Start Environment** (`devcontainer up`), **Run Build/Test in Environment** (`devcontainer exec`, streamed to a terminal) and **Stop** or **Rebuild Environment**. The template's commands are exposed as tasks of type `cognify`. | P0 (after the S4-03 go) | Integration test with a fake CLI runner. A manual check on Linux with Docker: a FastAPI project builds and tests in its container. |
| S4-08 | **Guided remediation (D5).** For each missing or outdated requirement: per-OS guidance, a copyable command, "Open in Terminal" (pre-filled, never run automatically), the official link, "Use a Dev Container instead" when Docker is present, and **Re-check**. | P1 | Unit tests for guidance selection by OS and runtime. Nothing installs without an explicit user action in a terminal. |
| S4-09 | **Project Cognition knows the environment.** The launcher writes `.cognify/project.json` (template id, environment, commands). The project model reads it, and the `cognify_projectModel` tool's `howToTest` and new `howToRun` prefer the template's commands, with the right environment. | P2 | Unit tests. The validation scenario (§7) still passes. |

### D. Upstream and engineering
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S4-10 | **Sprint upstream import:** ask the owner to run the mirror, then `vendor/sync-YYYY-MM-DD`, the post-sync gates, and a merge into `dev` with a merge commit. Re-check that the inherited Microsoft workflows are still disabled. | P1 | The baseline manifest is updated. The R-01 and R-02 checks pass. |
| S4-11 | **Promotion at sprint end:** `dev` → `main` with a merge commit. | P1 | `dev` survives. |
| S4-12 | **User guide:** "Create a project" and "Environments" pages in `DevDocs/` (or the README), with the template list, requirements and troubleshooting. | P1 | Linked from the walkthrough. |

## Decisions needed

The owner approved all five as proposed on 2026-11-05. D1: Flutter, web target only.

| # | Decision | Proposed | Why it matters |
|---|---|---|---|
| D1 ✅ | **The fourth template.** The roadmap lists Next.js, FastAPI and ASP.NET Core, plus Flutter "or another approved fourth template". | **Flutter, web target only, for the MVP.** The Flutter SDK and Dart work in a Dev Container. Android and iOS toolchains (SDKs, emulators, Xcode) are out of scope. The alternative is an **Express (Node) API**, which is cheaper and fully container-friendly. | Flutter's toolchain is the heaviest by far. Mobile targets can't run in a Linux container. |
| D2 ✅ | **Bundled templates or official generators** (`create-next-app`, `dotnet new`, `flutter create`, …). | **Bundled, Cognify-owned skeletons for the MVP:** pinned, offline, deterministic, and testable in CI. Revisit "use the official generator when the runtime is present" for v1.5. | Generators need the runtime and the network, change without notice, and can't be snapshot-tested. Bundled skeletons go stale, so they need a refresh step each sprint. |
| D3 ✅ | **Scope of managed local.** | **Edit on the host, run in the container,** with the bundled `@devcontainers/cli` (`up`, `exec`, `stop`). **Docker is required** (Docker Desktop on macOS and Windows); Podman is best effort. No "reopen in container" (remote extension host) in the MVP. | It keeps everything in the extension, with no proprietary Microsoft extension and no remote-server resolver. |
| D4 ✅ | **Closing Sprint 3.** | **Close Sprint 3 at the S3-12 promotion,** and carry S3-01 and S3-02 into Sprint 4 as S4-01 and S4-02, as was done at the end of Sprint 2. | It keeps the sprint record honest while the hands-on checks wait. |
| D5 ✅ | **Remediation policy.** | **Guide, never install silently:** copyable commands and pre-filled terminals that the user runs, official links, and the Dev Container alternative. No package-manager or elevated actions from the extension. | Installing tools changes the user's machine. It needs consent, often admin rights, and is OS-specific. |

## Suggested sequence

| Day | Work |
|---|---|
| 1 | S4-03 spike (go/no-go). The S4-04 manifest schema and the first template (FastAPI). |
| 2 | S4-06 runtime detection. S4-04 templates two and three (Next.js, ASP.NET Core). |
| 3 | S4-05 New Project flow. S4-04 template four (D1). |
| 4 | S4-07 managed local. S4-08 remediation. |
| 5 | S4-12 guide, S4-10 upstream import, buffer, S4-02 hands-on session, sprint review, S4-11 promotion. |

## Sprint Definition of Done

- [ ] From **Cognify: New Project…**, each of the four templates can be created on the host (when its requirements are met) or with a managed-local environment (when Docker is present). Integration tests cover both paths.
- [ ] **Cognify: Check Environment** reports found, missing and outdated runtimes against the templates' requirements, without running workspace code (tested).
- [ ] At least one template builds and tests inside its Dev Container through the bundled CLI (a manual check, recorded).
- [ ] Remediation never installs anything without an explicit user action (tested).
- [ ] #6 and #8 closed (S4-01, S4-02), or carried over again with a reason.
- [ ] `Cognify (dev)` CI green. No `src/vs/**` change, or any change recorded in `UPSTREAM_BASELINE.md`. The user guide is linked from the walkthrough.

## Out of scope

- **Run/Preview inside the editor, and beginner modes:** Sprint 5.
- **"Reopen in container",** with an extension host inside the container.
- **Cloud workspaces and hosted environments:** v1.5.
- **Android and iOS toolchains,** emulators and simulators.
- **Installing runtimes automatically,** or with elevation.
- **Templates fetched from a registry or marketplace.**
- **The Cognify pet:** a post-MVP backlog item ([`COGNIFY_PET_DESIGN.md`](../Architecture/COGNIFY_PET_DESIGN.md)).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The bundled CLI can't be started from the extension host, or its path differs between dev and packaged builds | Managed local slips | S4-03 runs on day 1. The fallback is plain `docker run` with the preset's image. |
| No Docker on the user's machine (common on Windows and macOS without Docker Desktop) | Managed local isn't available | Detect it and explain clearly. The host path still works when the runtimes are installed. Remediation shows how to get Docker. |
| Large first pull of container images (several hundred MB per preset) | A slow first run | Show progress from the CLI's output. Keep presets on shared base images. Document a pre-pull. |
| Flutter's toolchain size and scope (D1) | The fourth template slips | Web target only, or swap in the Express alternative. |
| Bundled templates going stale (D2) | Outdated dependencies in new projects | Pin versions. Add a short "refresh templates" step to each sprint's upstream-import checklist. |
| Windows paths, WSL and Docker Desktop differences | Failures only on Windows | Include in the S4-01 Windows session. Test path handling on all three platforms. |
| One week for six product items | Not everything finishes | Commit to the P0s (S4-03 to S4-07). S4-08 and S4-12 are next; S4-09 is stretch. |
