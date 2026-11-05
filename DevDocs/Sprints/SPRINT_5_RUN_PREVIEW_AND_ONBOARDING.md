# Sprint 5: Run/Preview and Onboarding

- **Status:** In progress (started 2026-11-05). The owner approved decisions D1–D7 as proposed on 2026-11-05. See [Progress](#progress).
- **Duration:** 1 week (about 5 working days), per `REVISED_MVP_ROADMAP.md`.
- **Inputs:**
  - [`REVISED_MVP_ROADMAP.md`](../Roadmap/REVISED_MVP_ROADMAP.md), Sprint 5: a Run/Preview workflow for the supported template classes, the beginner modes Explain / Guide Me / Fix It, first-run onboarding and project-context initialization, and no persistent cloud hosting;
  - [`SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](SPRINT_4_PROJECT_LAUNCHER_AND_ENVIRONMENTS.md): Sprint 4's exit state and its carry-overs;
  - [`PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](../Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md): managed local, the `cognify` tasks and the presets' ports;
  - [`PROJECT_COGNITION_MVP.md`](../Architecture/PROJECT_COGNITION_MVP.md): the project model that onboarding initializes;
  - [`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`](../Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md): the import and promotion every sprint.

## Sprint Goal

A beginner can create a project, press **Run**, and see the app in a preview inside the editor, on this machine or in its Dev Container. When something is unclear or broken, they can ask Cognify to **Explain** it, **Guide** them through a task step by step, or **Fix** it, and Cognify already knows the project when they first open it.

Cloud hosting and publishing stay out of the MVP.

## Progress

| ID | State | Pull request | Notes |
|---|---|---|---|
| S5-01, S5-02 | Waiting on the owner | n/a | Hands-on checks, carried over from S4-01 and S4-02 (D7). |
| S5-03 | In review | | **Go (D1).** From the extension host, `workbench.action.browser.open` with `{ url, openToSide: true, reuseUrlFilter }` opens a local app in upstream's integrated browser beside the editor, and a second call for the same origin reuses and navigates that tab (integration test with a local HTTP server). In the web build upstream registers only a stub browser service, so the command doesn't exist and `openPreview` falls back to Simple Browser, then the system browser. **Finding:** the integrated browser's auto-reload (`workbench.browser.autoReloadOnFileChange`) applies to local `file://` pages only, not to an app on `localhost`, so S5-06 reloads with `workbench.action.browser.reload` after a save for servers that don't hot-reload. Details: [`PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`](../Architecture/PROJECT_LAUNCHER_AND_ENVIRONMENTS.md) §2.7. |
| S5-04 to S5-16 | Not started | | |

## Starting Point (Sprint 4 exit)

| Area | State | Gap this sprint closes |
|---|---|---|
| Running a project | Each Cognify project has a `run` command, exposed as the `cognify: run` task on the host or in the Dev Container. Presets publish the app's port on `127.0.0.1` (`appPort`). The user has to start the task, notice the port, and open a browser. | One **Run** action that starts the app, waits for its port and opens the preview, plus a visible running state and **Stop**. |
| Preview | **Upstream's integrated browser** (`src/vs/workbench/contrib/browserView`, desktop) opens a URL in an editor tab through `workbench.action.browser.open`. It can open `localhost` links itself (`workbench.browser.openLocalhostLinks`), reload when files change (`workbench.browser.autoReloadOnFileChange`), and send page elements to chat. The **Simple Browser** extension (`simpleBrowser.api.open`) is the fallback, and already delegates to the integrated browser when it exists. | Cognify uses them; it doesn't build its own preview. |
| Beginner modes | `@cognify /explain` (the Tutor role) and `/review` exist. The four personas (Planner, Coder, Reviewer, Tester) run on Cognify models. There is no step-by-step guide and no "fix this error" entry point. | **Guide Me** and **Fix It**, with entry points where beginners are: the editor, errors, and failed tasks. |
| Onboarding | The **Get Started with Cognify IDE** walkthrough (New Project, Check Environment, Check AI Setup) and the Explorer's empty-window entry exist. Upstream's first-run onboarding dialog names Cognify IDE (R-03). Nothing opens the Cognify walkthrough on first launch. | A first-run path into the walkthrough, and the Run/Preview and beginner-mode steps. |
| Project context | The project model is built **on first use** (the first `cognify_projectModel` call or Show Project Model), never at startup. | Optionally build it when a trusted folder opens, so the first question is fast and the project's commands are known (D6). |
| Sprint 4 carry-overs | S4-01 (Windows build) and S4-02 (signed-in session) wait on the owner. | Carried over as S5-01 and S5-02 (D7). |

## Key design: reuse upstream's browser, run through the `cognify` tasks

```text
Cognify: Run Project / ▶ in the status bar
   │
   ├── the `cognify: run` task (host: shell; Dev Container: devcontainer exec)  ← S4-07
   │      output in the task terminal; Stop terminates it
   │
   ├── wait for the template's port on 127.0.0.1 (TCP connect, then HTTP), with a timeout
   │
   └── open http://localhost:<port>
          desktop: upstream's integrated browser (workbench.action.browser.open)
          otherwise: Simple Browser, or the system browser (D1)
```

- **Ports come from the project file.** New Project writes the template's `ports` into `.cognify/project.json` (a small schema addition, `version` stays 1 with an optional field), so Run doesn't guess. Projects without ports run without a preview.
- **No new process model:** Run is the existing `cognify: run` task, started as a background task, so the terminal, Stop, and the Dev Container path are the ones S4-07 tested.
- **Fix It never edits silently:** it proposes a change through Chat's edit flow, and the user accepts or rejects it (D3).
- **Everything in `extensions/cognify-ai`:** no `src/vs/**` change is expected. Any that turns out to be needed is recorded in `UPSTREAM_BASELINE.md`.

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

### A. Sprint 4 carry-overs (owner)
| ID | Item | Pri | Acceptance | Closes |
|---|---|---|---|---|
| S5-01 | **Windows dev build** (was S4-01, S3-01 and S2-01): `pnpm install` with Node 24.22.1, then `.\scripts\code.bat`. Now also: New Project and Check Environment on Windows, with Docker Desktop if available. | P0 | Launches as *Cognify IDE Dev*; user data in `%APPDATA%\cognify-dev`; a FastAPI project builds and tests on the host or in its Dev Container. | #6 |
| S5-02 | **Signed-in session** (was S4-02, S3-02 and S2-04): `@cognify /review` and `/explain`, the personas and role flow in the Chat UI, "Why this provider?", the live `recentChanges` call, and this sprint's Guide Me and Fix It. | P0 | Results recorded in `AGENT_ROLES_AND_REUSE_MATRIX.md`. | #8 |

### B. Run and preview
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S5-03 | **Spike: the integrated browser from the extension.** Open `http://localhost:<port>` with `workbench.action.browser.open` from the extension host, check auto-reload on file change and "send element to chat", and confirm the fallback (Simple Browser, or `env.openExternal`) in the web build and where the integrated browser is off. Record in the design note. | P0 | A go/no-go for D1, with the command and settings that work, in `PROJECT_LAUNCHER_AND_ENVIRONMENTS.md`. |
| S5-04 | **Cognify: Run Project.** Starts the `cognify: run` task (background), waits for the project's port (TCP, then an HTTP response; 60 s for containers, 30 s on the host, configurable), then opens the preview. One run per project; running again focuses the preview. If the port never opens, show the task output and offer **Check Environment**. New Project writes `ports` into `.cognify/project.json`. | P0 | Integration test with a fake task and a local HTTP server: the preview opens at the right URL, and a port that never opens reports the failure. A manual check per template (FastAPI on the host, Next.js in a Dev Container at least). |
| S5-05 | **Running state and Stop.** A status-bar item: **▶ Run** when stopped, **● Running on :<port>** (click to open the preview) with **Stop** when running. Stop ends the task; in a Dev Container the container keeps running (Stop Environment stops it). The editor title gets a Run button for Cognify projects. | P0 | Integration test of the state changes: start, port ready, stop, and the task ending by itself. |
| S5-06 | **Preview polish.** Reload on save through upstream's setting when the dev server doesn't hot-reload (FastAPI, ASP.NET Core); a "Preview" link in the task terminal; the Flutter `web-server` device's slower start. | P1 | A manual check per template, recorded. |

### C. Beginner modes
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S5-07 | **Guide Me:** `@cognify /guide <goal>` (and **Cognify: Guide Me…**). The Tutor role answers with numbered steps sized for a beginner, grounded in the project model (how to run, test, where files are), one step at a time, with a "Next step" follow-up. It never runs commands; it shows them. | P0 | Unit tests of the prompt assembly (the project's commands are included, nothing else from the workspace); an integration test with a fake model through the participant. |
| S5-08 | **Fix It:** a quick fix **Fix with Cognify** on errors (diagnostics), **Cognify: Fix This** on a failed `cognify` task, and `@cognify /fix`. The Coder role gets the error, the code around it and the project's commands, and proposes an edit through Chat's edit flow, which the user accepts or rejects (D3). | P0 | Integration test: a diagnostic produces the code action, which opens Chat with the right request; no file changes until the user accepts. |
| S5-09 | **Explain entry points:** **Explain with Cognify** in the editor context menu and on hover over an error, using the existing `/explain`. | P1 | Integration test that the commands open Chat with the selection or the diagnostic attached. |
| S5-10 | **Beginner wording (D4):** `cognify.ai.explanationLevel` (`beginner` or `standard`) adjusts the Tutor and Guide prompts (shorter sentences, no unexplained jargon, one concept at a time). | P2 | Unit tests of the prompt variants. |

### D. Onboarding and project context
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S5-11 | **First-run onboarding (D5).** On the first launch, open the **Get Started with Cognify IDE** walkthrough. Add steps for **Run and preview** and **Ask Cognify** (Explain, Guide Me, Fix It), and mark steps done from their commands. | P0 | Integration test that the walkthrough contributes the new steps and completion events; a manual first-launch check with a fresh user-data folder. |
| S5-12 | **Project-context initialization (D6).** When a trusted folder opens, build the project model in the background after the window is idle, within the existing budgets, and show a one-line, dismissible note for Cognify projects ("Cognify knows how to run and test this project"). Off with `cognify.projectModel.indexOnOpen`. Untrusted folders keep the manifest-only, on-demand behavior. | P1 | Integration test: opening a fixture folder builds the model once; the setting turns it off; untrusted folders aren't indexed on open. Startup time unchanged (measured). |

### E. Upstream and engineering
| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S5-13 | **Sprint upstream import:** ask the owner to run the mirror, then `vendor/sync-YYYY-MM-DD`, the post-sync gates, and a merge into `dev` with a merge commit. Re-check that the inherited Microsoft workflows are still disabled, since an import can add workflows. Refresh the templates' pinned versions if a framework released. | P1 | The baseline manifest is updated. The R-01 and R-02 checks pass. |
| S5-14 | **Promotion at sprint end:** `dev` → `main` with a merge commit. | P1 | `dev` survives. |
| S5-15 | **User guide:** "Run and preview" and "Ask Cognify" pages in `DevDocs/Guides/`, linked from the walkthrough. | P1 | Linked from the new walkthrough steps. |
| S5-16 | **Harden the S3-08 watcher test.** It lost a file event in some local runs during S4-09 (no event within 15 s). Find the cause, or make the wait robust without hiding a real loss. | P2 | Ten local runs in a row pass. |

## Decisions needed

The owner approved all seven as proposed on 2026-11-05.

| # | Decision | Proposed | Why it matters |
|---|---|---|---|
| D1 ✅ | **The preview surface.** | **Upstream's integrated browser** (`workbench.action.browser.open`) on desktop, falling back to Simple Browser, then the system browser. Confirmed by the S5-03 spike. | It already has reload on change, devtools and "send element to chat". Building a Cognify preview would duplicate it. |
| D2 ✅ | **How Run starts the app.** | **The existing `cognify: run` task,** in the background, with a port probe. One run per project. Stop ends the task; the Dev Container keeps running until Stop Environment. | One process model (S4-07), already tested on both environments. |
| D3 ✅ | **What Fix It may do.** | **Propose, never apply:** the edit goes through Chat's edit flow and the user accepts or rejects it. No commands run. | Beginners can't judge a silent change. The router's privacy gate and audit apply as for any request. |
| D4 ✅ | **A separate "learning mode".** | **No global mode in the MVP.** Explain, Guide Me and Fix It are commands available to everyone. A `cognify.ai.explanationLevel` setting (P2) tunes the wording. | The roadmap's principle: professional and beginner modes without turning the IDE into a sandbox. |
| D5 ✅ | **First-run onboarding.** | **Open the Cognify walkthrough on first launch,** after upstream's first-run dialog (already rebranded), not instead of it. | Upstream's dialog handles theme and sign-in choices that Cognify would otherwise have to rebuild. |
| D6 ✅ | **Index on open.** | **On by default for trusted folders,** in the background after idle, within the existing budgets, with `cognify.projectModel.indexOnOpen` to turn it off. | It makes the first answer fast and lets Run and Guide Me know the project at once. It reads only manifests and config, as today. |
| D7 ✅ | **Closing Sprint 4.** | **Close Sprint 4 at the S4-11 promotion (#71),** and carry S4-01 and S4-02 into Sprint 5 as S5-01 and S5-02, as at the end of Sprints 2 and 3. | It keeps the sprint record honest while the hands-on checks wait. |

## Suggested sequence

| Day | Work |
|---|---|
| 1 | S5-03 spike (go/no-go for D1). S5-04 port probe and `ports` in the project file. |
| 2 | S5-04 Run Project and S5-05 running state. Manual checks on FastAPI (host) and Next.js (Dev Container). |
| 3 | S5-07 Guide Me. S5-08 Fix It. |
| 4 | S5-11 first-run onboarding. S5-12 index on open. S5-09 Explain entry points. |
| 5 | S5-15 guide, S5-13 upstream import, buffer, S5-02 hands-on session, sprint review, S5-14 promotion. |

## Sprint Definition of Done

- [ ] **Cognify: Run Project** starts each template's app and opens the preview inside the editor, on the host and in a Dev Container (integration tests, plus a recorded manual check per template).
- [ ] The running state is visible, and **Stop** ends the app (tested).
- [ ] **Guide Me** and **Fix It** work through `@cognify` and their editor entry points. Fix It changes no file until the user accepts (tested).
- [ ] A first launch opens the Cognify walkthrough, which includes Run and the beginner modes (tested and checked by hand).
- [ ] Opening a trusted folder builds the project model in the background, unless turned off (tested), with no measurable startup cost.
- [ ] #6 and #8 closed (S5-01, S5-02), or carried over again with a reason.
- [ ] `Cognify (dev)` CI green. No `src/vs/**` change, or any change recorded in `UPSTREAM_BASELINE.md`. The user guide is linked from the walkthrough.

## Out of scope

- **Persistent cloud hosting, publishing and deployment:** v1.5, per the roadmap.
- **Sharing a preview outside this machine** (tunnels, port forwarding to the internet).
- **Mobile previews** (Android and iOS emulators and simulators), consistent with Sprint 4's D1.
- **A Cognify-built browser or preview engine** (D1).
- **Fix It running commands or applying edits on its own** (D3).
- **A separate learning-mode UI** (D4).
- **The Cognify pet:** a post-MVP backlog item ([`COGNIFY_PET_DESIGN.md`](../Architecture/COGNIFY_PET_DESIGN.md)).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `workbench.action.browser.open` isn't usable from an extension, or only on desktop | The preview opens outside the editor | S5-03 runs on day 1. Simple Browser and the system browser are the fallbacks. |
| Dev servers bind to a port late (Flutter's `web-server`, first Next.js compile) | The preview opens to an error page | Probe TCP and then HTTP, with generous timeouts per template, and reload once the server answers. |
| Ports already in use on the host (another app on 3000 or 8000) | Run fails, or the preview shows the wrong app | Detect the port in use before starting and say which; let the user pick another (later: rewrite the port in the run command). |
| Chat's edit flow needs Copilot's sign-in (S2 finding: Chat dispatches participant requests only with Copilot) | Fix It and Guide Me need Copilot | The same requirement and messaging as the other roles. Covered by S5-02. |
| Indexing on open costs startup time in large repositories | A slower first window | Start after idle, within the existing budgets (10 s, 5,000 files), off by setting. Measure on this repository. |
| Upstream's first-run onboarding changes between imports | The walkthrough opens at the wrong time | Rely on the walkthrough contribution and a first-launch flag of Cognify's own, not on upstream's internals. |
| One week for nine product items | Not everything finishes | Commit to the P0s (S5-03 to S5-05, S5-07, S5-08, S5-11). S5-09, S5-12 and S5-15 are next; S5-06, S5-10 and S5-16 are stretch. |
