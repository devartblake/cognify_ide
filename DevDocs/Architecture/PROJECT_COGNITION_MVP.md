# Project Cognition: MVP Model and Indexing Boundaries

- **Issue:** #9 (Sprint 1, P1)
- **Related:** [ADR-0001](ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md), [routing contract](AI_PROVIDER_ROUTING_CONTRACT.md) (privacy gate, section 8), [agent roles](AGENT_ROLES_AND_REUSE_MATRIX.md)
- **Implementation target:** Sprint 2+, inside `extensions/cognify-ai` (no `src/vs/**` changes)
- **Status:** Implementation in progress (Sprint 3).
  - **S3-07, the indexer core, is in `extensions/cognify-ai/src/projectModel/`.** Built so far:
    - the schema (section 2);
    - parsers for `package.json`, pnpm and npm workspaces, `pyproject.toml`, `go.mod`, `Cargo.toml`, GitHub workflows and convention files;
    - the budgets (section 4);
    - storage in workspace storage (section 5);
    - the untrusted-workspace limits (section 5).

    It indexes this repository in under a second without truncation.
  - **S3-08, refresh, is built (section 4).**
    - Debounced (2 s) watchers on the input globs start after the first build.
    - A change reads only the changed files; a SHA-256 content hash makes same-content saves no-ops.
    - The model is re-assembled from cached fragments, re-deriving only the affected domain (`packages`, `ci` or `conventions`).
    - Workspace-folder changes rebuild.
    - New commands: **Show**, **Rebuild** and **Clear Project Model**.
    - Recent changes are read from Git at query time, so HEAD changes need no refresh.
    - After a window reload, the stored model has no fragments, so the first change triggers one full rebuild.
  - **S3-09, the `cognify_projectModel` tool, is built.**
    - Operations: `summary`, `package`, `howToTest`, `ciFor` and `recentChanges`, the last one through the Git extension API.
    - Answers are prompt-sized and redacted, cite evidence, and write a metadata-only log line.
    - The tool refuses while `cognify.privacy.localOnly` is on.
    - CI matching counts only change events (push, pull request, merge group) and applies branch and `paths` filters.
  - **Not built yet:**
    - the `services` and `apis` domains;
    - `.gitignore` and `.cognifyignore` exclusions (`files.exclude` and `search.exclude` are applied);
    - privacy-class propagation for confidential paths (section 6, rule 5), beyond the `localOnly` refusal.

## 1. Purpose and Positioning

Project Cognition lets Cognify answer **repository-level** questions ("what services exist, how do I build and test this, which CI runs on my change, what changed recently") that no single file or search hit answers.

It deliberately does **not** compete with what the platform already does well:

| Concern | Owner today | Project Cognition's role |
|---|---|---|
| Symbols, definitions, references, diagnostics | Language servers (`vscode.executeDocumentSymbolProvider`, `vscode.executeWorkspaceSymbolProvider`, `languages.getDiagnostics`) | **Consume on demand.** Never parse ASTs or duplicate language-server data. |
| "Find code about X" (semantic retrieval) | Copilot's workspace chunk/embedding index and GitHub code search, exposed as the public LM tool `copilot_searchCodebase` (`#codebase`) | **Delegate.** No Cognify embedding index in MVP. |
| Text and file search | `workspace.findFiles`, `copilot_findTextInFiles`, search service | **Consume.** |
| Changed files / git history | Git extension API (`getAPI(1)`: `repositories`, `state`, `log`, `diffWithHEAD`, `getMergeBase`) | **Consume** to build the recent-changes domain. |
| Tasks | `vscode.tasks.fetchTasks()` | **Consume** as build/test command evidence. |
| **Structural project model** (packages, services, dependencies, entry points, APIs, tests, CI, conventions) | Nothing in the platform builds this | **Own.** This is the Cognify index. |

So the MVP index is a small, deterministic, **manifest-driven structural model**, not a code-content index.

## 2. Schema (MVP)

Normative shape for the Sprint 2 implementation. Every fact carries **evidence** (where it came from) and a **confidence**, so roles can cite sources and the UI can explain answers.

```ts
interface ProjectModel {
	readonly schemaVersion: 1;
	readonly generatedAt: string;                 // ISO timestamp
	readonly workspace: { readonly folders: readonly string[]; readonly vcs?: { readonly head: string; readonly branch?: string } };
	readonly packages: readonly PackageNode[];    // structure/packages
	readonly services: readonly ServiceNode[];    // services/components
	readonly dependencies: readonly DependencyEdge[];
	readonly entryPoints: readonly EntryPoint[];
	readonly apis: readonly ApiSurface[];
	readonly tests: readonly TestSuite[];
	readonly ci: readonly CiPipeline[];
	readonly conventions: readonly Convention[];
	readonly recentChanges: RecentChanges;
	readonly coverage: IndexCoverage;             // what was / wasn't indexed, and why
}

interface Evidence {
	readonly file: string;                        // workspace-relative path
	readonly line?: number;
	readonly source: 'manifest' | 'config' | 'workflow' | 'git' | 'task' | 'convention-file' | 'heuristic';
}

interface Fact { readonly evidence: readonly Evidence[]; readonly confidence: 'declared' | 'inferred' }

interface PackageNode extends Fact {
	readonly id: string;                          // stable: ecosystem + relative path
	readonly name: string;
	readonly path: string;                        // root folder
	readonly ecosystem: 'npm' | 'python' | 'go' | 'cargo' | 'dotnet' | 'maven' | 'gradle' | 'other';
	readonly scripts: Readonly<Record<string, string>>; // build/test/lint commands as declared (npm scripts, Makefile targets, …)
	readonly language?: string;
}

interface ServiceNode extends Fact {
	readonly id: string;
	readonly name: string;
	readonly packageId?: string;
	readonly kind: 'web' | 'worker' | 'cli' | 'library' | 'extension' | 'container' | 'unknown';
	readonly runtime?: { readonly dockerfile?: string; readonly compose?: string; readonly ports?: readonly number[] };
}

interface DependencyEdge extends Fact {
	readonly from: string;                        // PackageNode/ServiceNode id
	readonly to: string;                          // internal id, or `external:<ecosystem>:<name>`
	readonly kind: 'internal' | 'external';
	readonly scope: 'runtime' | 'dev' | 'peer' | 'build';
	readonly versionSpec?: string;
}

interface EntryPoint extends Fact {
	readonly packageId: string;
	readonly kind: 'main' | 'bin' | 'browser' | 'server' | 'extension-activation' | 'script';
	readonly target: string;                      // file path or command
}

interface ApiSurface extends Fact {
	readonly packageId: string;
	readonly kind: 'openapi' | 'graphql' | 'grpc' | 'exports' | 'http-routes' | 'vscode-contributes';
	readonly spec?: string;                       // spec file path when declared
	readonly summary: string;                     // e.g. "12 paths under /v1"; no file contents
}

interface TestSuite extends Fact {
	readonly packageId: string;
	readonly framework: string;                   // mocha, vitest, jest, node:test, pytest, go test, …
	readonly command: string;                     // how to run it, from scripts/tasks/CI
	readonly globs: readonly string[];            // where the tests live
}

interface CiPipeline extends Fact {
	readonly provider: 'github-actions' | 'azure-pipelines' | 'gitlab' | 'other';
	readonly file: string;
	readonly name: string;
	readonly triggers: readonly { readonly event: string; readonly branches?: readonly string[]; readonly paths?: readonly string[] }[];
	readonly jobs: readonly { readonly id: string; readonly runsOn?: string; readonly commands: readonly string[] }[];
}

interface Convention extends Fact {
	readonly kind: 'formatting' | 'lint' | 'naming' | 'branching' | 'commit' | 'pr-template' | 'agent-instructions' | 'codeowners';
	readonly summary: string;                     // e.g. "tabs, not spaces"; "PRs target dev"
}

interface RecentChanges {
	readonly since: string;                       // merge-base with the default/integration branch, or last N commits
	readonly commits: readonly { readonly sha: string; readonly subject: string; readonly date: string; readonly packagesTouched: readonly string[] }[];
	readonly workingTree: readonly { readonly path: string; readonly status: string; readonly packageId?: string }[];
}

interface IndexCoverage {
	readonly filesScanned: number;
	readonly truncated: boolean;                  // a budget was hit
	readonly skipped: readonly { readonly path: string; readonly reason: 'excluded' | 'secret-risk' | 'too-large' | 'binary' | 'budget' }[];
	readonly durationMs: number;
}
```

Notes:

- **No source code bodies** are stored, only paths, names, declared commands, and short summaries.
- IDs are deterministic (ecosystem + relative path), so re-indexing produces stable diffs and caches stay valid.
- Every fact is either **declared** (read from a manifest/config) or **inferred** (heuristic). Roles must say "inferred" when citing an inferred fact.

## 3. MVP Index Inputs and Outputs

### Inputs (MVP)

| Domain | Inputs read | Parser |
|---|---|---|
| Packages, scripts, entry points | `package.json` (+ workspaces), `pyproject.toml`/`setup.cfg`, `go.mod`, `Cargo.toml`, `*.csproj`/`*.sln`, `pom.xml`, `build.gradle(.kts)`, `Makefile` targets | Structured parsers (JSON/TOML/XML); Makefile targets by regex (`inferred`) |
| Dependencies | The same manifests and workspace references; lockfiles **only** to resolve internal workspace links | Structured |
| Services | `Dockerfile*`, `docker-compose*.yml`, `devcontainer.json`, `Procfile`, and `package.json` `bin`/`main` | Structured/YAML; `kind` heuristics are `inferred` |
| APIs | `openapi*.{yml,yaml,json}`, `*.graphql`/`schema.graphql`, `*.proto`, `package.json` `exports`, VS Code `contributes` | Spec files summarized (path counts/operation names only) |
| Tests | Test scripts in manifests, `vscode.tasks.fetchTasks()` with test group, known config files (`vitest.config.*`, `jest.config.*`, `.mocharc*`, `pytest.ini`, …), CI test steps | Structured + `inferred` framework detection |
| CI | `.github/workflows/*.yml`, `azure-pipelines.yml`/`build/azure-pipelines/**`, `.gitlab-ci.yml` | YAML |
| Conventions | `.editorconfig`, linter/formatter configs, `.github/pull_request_template.md`, `CODEOWNERS`, `CONTRIBUTING.md`, agent-instruction files (`AGENTS.md`, `.github/copilot-instructions.md`, `.claude/CLAUDE.md`) | Short extracted summaries (headings and first-level rules), never full text |
| Recent changes | Git extension API: `getMergeBase(HEAD, <integration branch>)`, `log({ maxEntries: 50 })`, `state.workingTreeChanges` | API |

### Deferred (not indexed in MVP)

Source-file contents and embeddings (delegated to `copilot_searchCodebase`), call graphs, symbol tables (language servers), runtime traces, issue trackers, cloud resources, cross-repository graphs, and a persistent graph database (the roadmap lists "production-grade Project Cognition graph/database" as out of scope for Sprint 1).

### Outputs

1. **`ProjectModel` JSON** in the extension's workspace storage (`context.storageUri/project-model.v1.json`). It's local only and never synced.
2. **LM tool `cognify_projectModel`** (`vscode.lm.registerTool`) with operations `summary`, `package(path)`, `howToTest(path)`, `ciFor(paths)` and `recentChanges()`. Every Cognify role (#8) and any agent mode can call it. Responses are sized for prompts (a few hundred tokens) and include evidence paths.
3. **Command** `Cognify: Show Project Model` (read-only view, for transparency and debugging).

## 4. Refresh and Invalidation

| Trigger | Scope of re-index | Notes |
|---|---|---|
| First use in a workspace (lazy, when a role or the tool needs it) | Full | Never at startup, so there's no startup cost |
| `FileSystemWatcher` on input globs (manifests, workflow files, convention files, spec files) | The affected domain + package | Debounced 2 s; batched |
| Git HEAD / branch change (`repository.state.onDidChange`) | `recentChanges` + packages whose manifests differ | Cheap: git API only |
| Workspace folders change | Full for added folders; drop removed ones | |
| Manual command `Cognify: Rebuild Project Model` | Full | |
| Schema version bump / extension update | Full | `schemaVersion` mismatch invalidates the cache |

Invalidation uses a **content hash per input file** (SHA-256 of bytes). A domain re-derives only when one of its input hashes changes. Budgets: max 5,000 candidate files scanned, 1 MB per file, 10 s wall time per full index. When a budget is hit, set `coverage.truncated = true` and record the skipped items. Indexing runs off the UI path and is cancellable.

## 5. Persistence Boundaries

- Stored **only** in `context.storageUri` (per workspace, per machine). Not in the repository, not in settings sync, not in the cloud.
- Holds paths, names, declared commands, and summaries. **No file contents, no secrets, no environment values.**
- Deleting the storage, or running `Cognify: Clear Project Model`, fully resets it.
- Untrusted workspaces (`workspace.isTrusted === false`): index **only** manifests and workflow files as plain data. Never run tasks or scripts to discover information (the indexer never executes anything in any mode).

## 6. Privacy and Context-Redaction Rules (provider-bound context)

These rules apply whenever Project Cognition output is sent to a model. They feed the routing contract's privacy gate (section 8).

1. **Respect exclusions.** Skip anything matched by `files.exclude`, `search.exclude`, `.gitignore`, and a Cognify-specific `.cognifyignore`. Excluded paths appear in `coverage.skipped` as `excluded` and are never sent.
2. **Secret-risk files are never read for content:** `.env*`, `*.pem`, `*.key`, `*.p12`, `id_*`, `*secret*`, `*credential*`, `.npmrc`/`.pypirc` (`auth` lines), `kubeconfig`. They are recorded only as `secret-risk` skips.
3. **Value redaction.** Before any output leaves the extension, environment-variable *values*, URLs with credentials (`https://user:pass@`), and token-shaped strings (the same patterns as the router's `sanitize`: `sk-…`, `AIza…`, `gh*_…`, `Bearer …`) are replaced with `[redacted]`. Variable *names* may remain (e.g. "requires `DATABASE_URL`").
4. **Minimum necessary context.** The tool returns only the slice relevant to the question (one package, one pipeline), not the whole model.
5. **Privacy class propagation.** If the answer includes any `inferred` fact derived from a file under a path the workspace marks confidential, the request is raised to `cloud-trusted`. A workspace setting `cognify.privacy.localOnly` forces `local-only` for every Project Cognition-backed request. The router then refuses cloud vendors rather than relaxing the class.
6. **Audit.** Each tool call writes a metadata-only record (operation, packages touched, byte count, redactions applied) next to the routing audit log. It never writes content.

## 7. Validation Scenario (selected for implementation)

**Question:** *"How do I build and test the package that contains the file I'm editing, and which CI workflow runs on my change?"*

This exercises packages, scripts, tests, CI triggers, and recent changes together, and has an objectively checkable answer. It is validated **on this repository**. Expected answer with the active file `extensions/cognify-ai/src/router.ts` on a branch targeting `dev`:

| Fact | Expected | Evidence |
|---|---|---|
| Package | `cognify-ai` (`extensions/cognify-ai`, a pnpm workspace member) | `extensions/cognify-ai/package.json` |
| Build | `pnpm run gulp compile-extension:cognify-ai` (repo toolchain) | `package.json` `vscode:prepublish`, `build/gulpfile.extensions.ts` |
| Test | `pnpm run typecheck-test && pnpm test` (node:test), then `pnpm run test-integration` | `extensions/cognify-ai/package.json` scripts |
| CI | `Cognify (dev)` → job `validate`, step "Cognify AI extension unit tests"; triggers: `pull_request` and `push` for `dev` and `main` | `.github/workflows/cognify-dev.yml` |
| Not CI | Upstream `pr.yml` doesn't run (triggers only on `main`/`release/*`) | `.github/workflows/pr.yml` |
| Recent changes | Commits since merge-base with `dev` that touched `extensions/cognify-ai/**` | git API |

Acceptance for the Sprint 2 implementation:

1. All six facts are correct, each with an evidence path.
2. `coverage.truncated` is `false` for this repository within the 10 s budget, or the budget is raised with justification.
3. The answer's provider-bound payload contains **no** file contents beyond manifest fields, and passes a redaction test that seeds a fake `sk-…` token in a workflow `env:` block.
4. Editing `.github/workflows/cognify-dev.yml` triggers re-derivation of the `ci` domain only (verified via audit metadata).

**Result (Sprint 3, S3-10).** The checks are unit tests in `extensions/cognify-ai/src/test/projectModel.test.ts`, run against this repository's real files. The question goes through `cognify_projectModel` `howToTest`, with `branch: dev`.

| # | Criterion | Status |
|---|---|---|
| 1 | Facts 1–5 | ✅ **Package:** `cognify-ai`, with its manifest as evidence. **Build:** `pnpm run vscode:prepublish`, which runs `compile-extension:cognify-ai`. **Test:** `pnpm test` (node:test) and `pnpm run test-integration`. **CI:** `Cognify (dev)`, job `validate`, step "Cognify AI extension unit tests", on pull_request and push to `dev` and `main`. **Not CI:** "Code OSS (`.github/workflows/pr.yml`): only main, release/*". |
| 1 | Fact 6, recent changes | ⏳ Built. `recentChanges` with `path` asks the Git extension for commits since the merge base with `dev` that touched the package; its formatting is unit tested. The integration harness runs without the Git extension, so the live call is checked by hand in S3-02. |
| 2 | Not truncated, within 10 s | ✅ Not truncated. Indexing this repository takes well under a second. |
| 3 | No file contents; seeded key redacted | ✅ A fake `sk-…` key is seeded into `cognify-dev.yml`, both in its `env:` and in a `run:` step. The workflow still parses, the key is in neither the model nor the answers, and no line of `router.ts` appears in an answer. |
| 4 | Editing the workflow re-derives `ci` only | ✅ S3-08. A unit test confirms one file is read and only `ci` changes. An integration test edits the workflow in the open workspace, and the watcher's refresh report names `ci` only. |

Getting criterion 1 right changed the tool:
- **Steps are ordered by relevance:** steps that mention the package come first, so the test step appears even in a 20-step job.
- **Missing pipelines are named:** `ciFor` and `howToTest` name the pipelines that would run on other branches, together with their branch filters.
- **`recentChanges` takes a `path`.**

## 8. Open Questions for Sprint 2

- Monorepo scale: this repository has 100+ `package.json` files. Do we need per-folder lazy indexing beyond the budgets above? **Answered in S3-07: no.** A full index of this repository reads its manifests, workflows and convention files in under a second (unit test). Budget cuts keep the shallowest files first, so the root and top-level packages survive truncation.
- Whether to also surface `ProjectModel` as a chat context provider (`contributes.chatContext`), so users can attach it with `#`, in addition to the LM tool.
- Copilot dependency: `copilot_searchCodebase` requires Copilot. Per the Sprint 2 decision to require Copilot sign-in (see `AGENT_ROLES_AND_REUSE_MATRIX.md`), this is acceptable for MVP. A local fallback (ripgrep plus model-side ranking) is deferred.

## 9. Acceptance Criteria Status (#9)

- [x] Project Cognition schema is documented (section 2).
- [x] MVP index inputs/outputs are explicit (section 3).
- [x] Refresh/invalidation strategy is documented (section 4).
- [x] Privacy/context redaction rules are documented (section 6).
- [x] One repository-question scenario is selected for later implementation validation (section 7).
