# Cognify Knowledge: Design Proposal

- **Status:** Proposed (2026-11-08). Not part of the MVP: under the roadmap's schedule control rule it is a **post-MVP candidate**, after Sprint 7 (visual identity). **K-D1 decided (owner, 2026-11-08): the K0 spike starts after Sprint 7.** K-D2 to K-D7 are still open, to be decided by the end of the spike.
- **What it is:** a knowledge feature inside Cognify IDE that does what Obsidian does well (plain markdown files you own, links, backlinks, canvases, database views) and adds what Obsidian, and the AI second-brain tools built on it, don't: an AI that **keeps the notes up to date**, links that **reach into the code**, notes that are **checked against the project**, and **rules the agents learn and you approve**.
- **Sources:** [`KNOWLEDGE_AND_MEMORY_REFERENCES.md`](../Research/KNOWLEDGE_AND_MEMORY_REFERENCES.md) (20 repositories and sites, and the owner's screen recording).
- **Builds on:** [`cognify_ide_architecture_competitive_strategy.md`](cognify_ide_architecture_competitive_strategy.md) (the earlier Obsidian strategy; see "Changes from the earlier strategy"), [`PROJECT_COGNITION_MVP.md`](PROJECT_COGNITION_MVP.md), [`ADR-0001`](ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md) and the [routing contract](AI_PROVIDER_ROUTING_CONTRACT.md).

## The idea in one paragraph

Obsidian is a very good place to *write* knowledge, and Karpathy's "LLM wiki" showed that an AI can *maintain* it: ingest sources, keep pages and cross-references current, and lint for contradictions. But in every tool reviewed, the knowledge floats free of the thing it describes: nothing notices when the code, the commands or the architecture change, so documentation rots. Cognify lives next to the code, the language servers, the tasks, Git and the project model. **Cognify Knowledge is a wiki that knows what it describes, and checks it.** A note can link to a function; the function shows its notes; when the code changes, the notes that depend on it are flagged; claims can carry a check that Cognify runs; and the agents' lessons become reviewed rules instead of lost chat.

## Where Obsidian stands, and where Cognify goes past it

Obsidian's capabilities and limits are taken from its help vault (references).

| Area | Obsidian today | Cognify Knowledge |
|---|---|---|
| Files | A vault is a folder of markdown; you own the files. | Same, and **Obsidian-compatible**: wikilinks, embeds, block references, properties, callouts, `.canvas` (JSON Canvas 1.0) and a subset of `.base`. A Cognify knowledge folder opens in Obsidian, and an Obsidian vault opens in Cognify. |
| Where knowledge lives | A separate vault, away from the code. | **In the repository**, versioned, branched and reviewed with the code it describes. Any folder can be a knowledge folder (`docs/`, `wiki/`), or a separate vault. |
| Links | Notes, headings and blocks. Links don't cross vaults. | Also **code**: `[[src/auth.ts#validateSession]]` links to a symbol, resolved through the language servers; `[[commit:a3b81f]]`, `[[task:test]]`, `[[test:...]]`. Symbols show their notes (CodeLens), and broken code links are reported. |
| AI | None in the app. The Web Clipper's Interpreter uses your own key, with no audit. Most AI comes from community plugins with full access to the vault. | **Built in and governed:** ingest, ask and lint as Cognify roles, through the router, the privacy gate (per-note privacy) and the audit log. Agents write only where you allow, and every change is a reviewable diff. |
| Keeping notes true | Nothing: notes rot silently. | **Verified knowledge:** claims carry checks (paths, symbols, commands, runnable snippets); lint re-checks them against the workspace and the project model, and stamps `last_verified`. Drift appears in the Problems panel. |
| Learning | Not applicable. | **Learned rules:** lessons from rejected fixes and review findings become proposed rules; you confirm them; the role agents follow them; rules that stop holding are retired. |
| Canvas | Manual boards in JSON Canvas. | The same format, plus **generated canvases** (an architecture map from the project model, a role-flow run like the "loop graph") whose nodes can be code symbols, with their verification state. |
| Database views | Bases (`.base`): table, cards, list, kanban, map. | A **Bases-compatible subset** first (table, list, kanban), over notes *and* the project model (packages, tasks, tests), so a view can list "ADRs whose code changed since they were verified". |
| Search | Lexical and regex; no semantic search in core. | Lexical + link graph + code search (Copilot's `#codebase` tool), merged; local semantic search later (K-D5). |
| Code | Highlighted code blocks; nothing runs. | Real editors, language servers and **runnable checks** in the project's environment (host or Dev Container), only in a trusted workspace. |
| Collaboration | Shared vaults sync changes but have no live co-editing; each collaborator needs a paid plan; no fine-grained permissions. | **Git first:** branches, pull requests and review for knowledge, free. Live co-editing isn't in this proposal (K-D7). |
| Extensions | Plugins can't be restricted to permissions. | VS Code's extension model, and agent writes limited by a per-folder policy. |

What Cognify won't try to match at first: Obsidian's mobile apps, Publish, Sync's end-to-end-encrypted service, and the breadth of its 10,000-plugin ecosystem.

## Principles

1. **File over app.** Plain markdown and open formats (JSON Canvas, Bases YAML) are the source of truth. Every index is derived and can be rebuilt (the pattern every reviewed project converged on).
2. **People own their notes; agents own their area.** Agents write only in the folders the policy allows (by default the wiki folder), and every write is a diff you can review, undo, and see in the audit log. Raw sources are never modified.
3. **Checked, not just written.** Wherever a claim can be checked against the workspace, it is, and the result is stored on the page (`last_verified`, `confidence`). "Can't be checked" is different from "wrong".
4. **Governed AI.** Every model call goes through the router, the privacy gate and the audit log (ADR-0001). Notes and clipped pages are untrusted input: they are delimited in prompts, and nothing in a note can make Cognify run a command.
5. **Deterministic first.** Linking, indexing, health scores, rule promotion and expiry work without a model; the model is used for writing and judgement.
6. **Cheap upstream imports.** Everything is in Cognify extensions (`cognify-ai`, or a new `cognify-knowledge`), using public VS Code APIs. No edits to `src/vs/**`.

## Features

### 1. Knowledge folders and Obsidian-compatible markdown (no AI)

- **Knowledge folder:** declared in `.cognify/knowledge.json` (folders, agent-writable folders, templates, privacy defaults). New Project can add a `docs/` knowledge folder to each template.
- **Editing:** VS Code's markdown editor and preview, extended with:
  - `[[` completion for notes, headings, blocks and code symbols;
  - go to definition, find references (backlinks) and rename for wikilinks, with links updated when a file moves (`workspace.onWillRenameFiles`);
  - embeds `![[...]]`, callouts and block references in the preview;
  - properties (YAML) with the types Obsidian uses.
- **Backlinks and outgoing links** views, unlinked mentions (including aliases), and a **local graph** view.
- **Templates:** a starting structure based on kepano-obsidian's categories and notes, plus Cognify templates: ADR, runbook, design note, project journal.
- **Agent skills:** the format skills from `kepano/obsidian-skills` (MIT), adapted, become context for the role agents so they write valid Obsidian-flavored markdown.

### 2. Code-anchored links

- **Syntax:** `[[path#Symbol]]` and `[[path#Class.method]]` for code symbols (resolved with `vscode.executeDocumentSymbolProvider` and workspace symbols); `[[path:42]]` for a line, as a fallback; `[[commit:<sha>]]`, `[[task:<name>]]` for the project's Cognify tasks.
- **In the code:** a CodeLens above a symbol, for example *"2 notes · ADR-003"*, opens them. Hovering shows the note's summary.
- **When code changes:** a link whose symbol disappears or moves is reported as a diagnostic on the note, with a quick fix to relink (the language servers' rename events aren't available to extensions, so this is detected on save and by lint).
- **In the project model:** Project Cognition gains a `knowledge` section (notes, links to code, verification state), so `@cognify` answers can cite the notes for the code in question.

### 3. The maintained wiki (Karpathy's pattern, as Cognify roles)

| Command | What it does |
|---|---|
| **`@cognify /ingest`** (or **Cognify: Ingest Source**) | Reads a source (a clipped page, a PDF, a file, a pull request, the current chat), discusses the key points, then proposes a summary page and updates to related pages, `index.md` and `log.md`, as **one reviewable change set**. |
| **`@cognify /ask`** | Answers from the wiki first (index → pages → code), with citations to pages and symbols; **File This Answer** saves a good answer as a page. |
| **`@cognify /lint`** | Health check: orphan pages, broken links, unresolved contradictions, stale claims, missing pages, gaps, and (unlike the others) **drift against the code** (feature 4). Shows a health score, and fixes are proposed, never applied silently. |

- **Pages** follow gbrain's shape: a current summary at the top ("compiled truth"), then an append-only timeline of what changed and why, and properties for `sources`, `confidence`, `last_verified` and `trust` (user-confirmed, agent-written, tool-observed, external).
- **The schema file** is the knowledge folder's `AGENTS.md`, written with the user and versioned, so the wiki's conventions are explicit.
- **Writes** are staged as a `WorkspaceEdit` with a preview (the refactor-preview UI), or applied directly in agent-writable folders if the user turns that on (K-D3). Each is recorded in the audit log with its sources, and can be undone as a unit.

### 4. Verified knowledge (the differentiator)

- **Automatic checks**, with no model and nothing run:
  - every path and code link resolves;
  - every command quoted in a note matches the project (`.cognify/project.json`, `package.json` scripts, the tasks);
  - every referenced dependency, port and setting exists;
  - for notes linked to code, whether the code changed since `last_verified` (from Git).
- **Explicit checks:** a fenced `cognify-check` block holds a command (for example `pytest tests/test_auth.py -q`) or an HTTP probe. They run only when the user asks (**Verify This Note**, **Verify Knowledge**), only in a trusted workspace, in the project's environment (host or Dev Container), as Cognify tasks, so the user sees exactly what runs. Never automatically from content an agent or a clipped page wrote.
- **Results:** stamped on the page (`last_verified`, `verified_by`, `confidence`), shown as a badge in the preview, and as diagnostics ("Architecture drift: `docs/adr/003-auth.md` refers to `users.v1`, changed in a3b81f").
- **In pull requests (later):** a check in the `Cognify (dev)` style that lists notes that a change makes stale.

### 5. Learned rules

From the "loop graph" recording and open-second-brain's rule lifecycle:

- **Signals:** a fix the user rejects or edits, a Reviewer finding, a failing check, or an explicit **Remember This**. Each becomes a proposed rule in `RULES.md` (or `.cognify/rules/`), with its evidence.
- **Lifecycle:** proposed → confirmed (by the user) → retired (stale, contradicted, superseded or rejected), decided by counting evidence, not by a model. Rules can be pinned.
- **Use:** confirmed rules go into the role agents' instructions for the project (the Coder, Reviewer and Tester), within the privacy gate; the footer says which rules applied.
- **Irreversible steps** (a database migration, deleting data, publishing) always stop for the user, as in the recording.

### 6. Capture and import

- **Clip a page:** **Cognify: Clip URL** uses Defuddle (MIT) in the extension host, with its third-party fallbacks off, and saves markdown with properties into the raw sources folder. The privacy gate decides whether the AI may read it; clipped text is marked untrusted.
- **Clipper templates** (from obsidian-clipper): choose a template by URL or schema.org type; AI fields go through the router, not a separate key.
- **Import:** an Obsidian vault opens as is. Notion, Evernote, Apple Notes, OneNote, Roam, Logseq and others reuse obsidian-importer's conversion layers (MIT), which don't need Obsidian.

### 7. Canvas and graph

- **Canvas:** a custom editor for `.canvas` (JSON Canvas 1.0), so boards made in Obsidian open in Cognify and the other way round. Cognify adds nodes for code symbols, tasks and verification state in namespaced fields (`cognify:*`) that other apps ignore.
- **Generated canvases:** **Map This Project** (packages, entry points, tasks and their notes, from Project Cognition); **Show This Run** (a role-flow run as a graph of steps, checks and handoffs, like the recording).
- **Graph:** notes, code files and their links, with filters and color groups; a WebGL renderer only if a large graph needs it.

### 8. Search

- **Lexical:** a local full-text index of the knowledge folders (a pure-JavaScript index in the extension, or SQLite FTS5 if a native module is accepted, K-D5), with Obsidian's operators (`path:`, `tag:`, `[property:value]`).
- **Graph and code:** results expanded through links and code links; code search through Copilot's `#codebase` tool, as Project Cognition already does.
- **Semantic (later):** embeddings through a provider the privacy gate allows (local first), stored with `{provider, model, dimensions}` so stale vectors are found; results merged by reciprocal-rank fusion.

## Architecture

```text
 Knowledge folders (markdown, .canvas, .base, RULES.md)      ← source of truth, in Git
        │ file watcher                      ▲ reviewable WorkspaceEdits
        ▼                                   │
 cognify-knowledge (extension host)        Role commands: /ingest /ask /lint, Remember This
  ├─ parser: links, embeds, blocks, properties, code links     │
  ├─ index (derived, workspace storage): notes, links, FTS, verification state
  ├─ resolvers: language servers (symbols), Git, Project Cognition, tasks
  ├─ verifier: automatic checks; explicit checks as tasks (trusted workspace only)
  ├─ rules: signals → proposed → confirmed → retired (deterministic)
  └─ views: backlinks, local graph, canvas editor, health, CodeLens, diagnostics
        │
 cognify-ai: router · privacy gate (per-note privacy) · audit log · role agents
```

- **Index storage:** the extension's workspace storage, like the project model (`PROJECT_COGNITION_MVP.md`, section 5). Never in settings sync or the cloud; **Clear Knowledge Index** rebuilds it from the files.
- **Privacy:** a note's `privacy:` property (`cloud`, `cloud-trusted`, `local-only`) feeds the privacy gate; a `local-only` note never reaches a cloud model. Secrets are detected as for any context.
- **Concurrency:** agent writes carry the revision they were based on and are refused if the file changed (gbrain, Baalda).

## Changes from the earlier strategy

[`cognify_ide_architecture_competitive_strategy.md`](cognify_ide_architecture_competitive_strategy.md) set the right goals (code-aware links, drift alerts, semantic links, an AI canvas). This proposal keeps them and changes how, to fit what Cognify is now:

| Earlier strategy | This proposal | Why |
|---|---|---|
| Tauri v2 or Code-OSS host, Rust sidecar | Code-OSS only; TypeScript in the extension host | Cognify ships on Code - OSS; a sidecar adds a native build per platform and an upstream-sync cost. |
| ONNX Runtime embeddings, `sqlite-vec`, in the first phases | Lexical + graph + code search first; embeddings later through the router | Native modules in a built-in extension cost packaging and Windows path work (S6-01); the privacy gate must decide where embeddings run. |
| `.cognify/index.db` in the repository | The index in workspace storage; only notes, canvases and rules in the repository | Keeps generated binaries out of Git and matches Project Cognition's persistence rules. |
| CodeMirror 6 or ProseMirror for notes | VS Code's markdown editor and preview, extended | Already in the product; no second editor to maintain. |
| tldraw for the canvas | JSON Canvas 1.0 with a Cognify editor | An open, MIT format that Obsidian reads; tldraw's SDK needs a license for production use (check current terms before choosing it). |
| HDBSCAN clusters, similarity > 0.78 | Not planned until semantic search exists | Depends on embeddings (K-D5). |
| Not covered | Maintained wiki, verified knowledge with runnable checks, learned rules, governed AI, Obsidian compatibility | From the references; these are what the reviewed tools lack. |

## Phasing

| Phase | Delivers | Size (estimate) |
|---|---|---|
| **K0 Spike** | Wikilinks, backlinks and code links over one knowledge folder in this repository's `DevDocs/`; measure index time and memory. | 2–3 days |
| **K1 Links** | Feature 1 and 2: Obsidian-compatible markdown, code links, CodeLens, rename-safe links, backlinks and local graph, templates. No AI. | ~1 sprint |
| **K2 Maintained wiki** | Feature 3: `/ingest`, `/ask`, `/lint` through the router, staged writes, audit, health score; clipping (feature 6, capture). | ~1 sprint |
| **K3 Verified knowledge and rules** | Features 4 and 5: automatic and explicit checks, drift diagnostics, `RULES.md` lifecycle in the role agents. | ~1 sprint |
| **K4 Canvas, views and import** | Feature 7, the Bases subset, importers, local search; semantic search if K-D5 allows. | 1–2 sprints |

Each phase ships on its own; K1 alone already gives developers something Obsidian doesn't (notes linked to live code).

## Decisions needed

| # | Decision | Proposed |
|---|---|---|
| K-D1 ✅ | **Scope and timing.** | **Decided 2026-11-08 (owner): start the K0 spike after Sprint 7.** The later phases (K1–K4) are planned from the spike's results, one phase per sprint. |
| K-D2 | **Where knowledge lives by default.** | In the repository (`docs/`), with separate vaults also supported. |
| K-D3 | **Agent writes.** | Staged for review by default; direct writes only in folders the user marks agent-writable. |
| K-D4 | **Runnable checks.** | Only on request, only in trusted workspaces, as visible tasks in the project's environment; never from agent-written or clipped content without the user's review. |
| K-D5 | **Search engine and embeddings.** | A pure-JavaScript index first; embeddings only through providers the privacy gate allows, local first. Revisit SQLite FTS5 or `sqlite-vec` if measurements need them. |
| K-D6 | **Compatibility target.** | Obsidian Flavored Markdown and JSON Canvas 1.0 fully; Bases as a subset. |
| K-D7 | **Live collaboration.** | Out of scope; Git-based review first. Revisit with the owner's team needs (Baalda shows it needs a server and a CRDT). |

## Risks

| Risk | Mitigation |
|---|---|
| Prompt injection through notes or clipped pages that steer an agent or a check | Untrusted content is delimited and labelled; checks run only on request; agents can't run commands from notes; trust tiers on every page. |
| The scope grows into "rebuild Obsidian" | The phases; each must ship on its own, and parity beyond the comparison table is out of scope. |
| Index cost on large repositories | Budgets as in Project Cognition; incremental updates from the file watcher; measured in K0. |
| Code links break on refactors the language server can't see | Lint and save-time detection with quick fixes; links by symbol path, not line, where possible. |
| Obsidian changes its formats | Follow the open specs (JSON Canvas is versioned); keep Cognify's additions namespaced. |
| Licensing of reused pieces | Reuse only MIT, 0BSD or Apache-2.0 code (Defuddle, importer layers, obsidian-skills, JSON Canvas) with notices in `ThirdPartyNotices.txt`; nothing from repositories without a license. |
