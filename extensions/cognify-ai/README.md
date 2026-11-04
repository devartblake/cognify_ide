# Cognify AI

Built-in extension that provides Cognify's role-based AI assistance. It routes each task to a suitable language model from the providers available through `vscode.lm` (Copilot, bring-your-own-key vendors, local models) and records which provider answered and why.

Cognify owns routing **policy**, not transport. It doesn't call provider APIs itself (see [ADR-0001](../../DevDocs/Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md)). The behavior is specified in the [AI provider routing contract](../../DevDocs/Architecture/AI_PROVIDER_ROUTING_CONTRACT.md).

## Using it

In Chat, use one of the role commands:

| Command | Role | Task | Use it for |
|---|---|---|---|
| `@cognify /review` | Reviewer | `review` | Reviewing attached or selected code for bugs, security problems and missing edge cases. Add instructions after the command, for example `@cognify /review focus on error handling`. |
| `@cognify /explain` | Tutor | `explain` | Explaining attached or selected code, or answering a programming question. Examples: `@cognify /explain how does this work?`, or `@cognify /explain what is a closure?` with nothing attached. |

Attach files with `#`, or select code first; without either, the active editor's file is used. Both commands go through the same router, privacy gate, footer and audit trail. Only the role, the task and the prompt differ. The task decides the provider order: `review` prefers Gemini, then GPT, then Copilot; `explain` prefers Copilot, then Gemini, then GPT.

The response footer shows:
- the role and task;
- the provider that answered;
- any fallbacks, and models that were skipped (with the reason);
- a **Why this provider?** link. It opens the full route explanation for that response, built from its audit record: the reason, each attempt with its error kind, matching rule and duration, the skipped models with reasons, the privacy class, and the input size.

Every routed request is recorded in a per-workspace audit trail (the last 200 requests). The trail is metadata only: task, role, privacy class, the provider that answered, attempts with error kinds and durations, skipped models, and the reason. For agent-mode requests, it also keeps the number of tools offered and the names of the tools called. It never holds prompt, code, response or provider error text, nor tool arguments or results. The "Why this provider?" explanation shows the tool calls too.

- `Cognify: Show AI Routing Log` shows the records as live log lines.
- `Cognify: Export AI Routing Log` saves them as JSON.
- `Cognify: Clear AI Routing Log` deletes them.

### Cognify role models

The extension registers its own language models, under the vendor `cognify` (**Cognify (routed by task)** in the model picker): **Cognify · Planner**, **Cognify · Coder**, **Cognify · Reviewer** and **Cognify · Tester**.

A request to one of them doesn't go to a fixed model. Cognify routes it by the role's task, like `@cognify` commands:
- the privacy gate, which also scans tool results, such as file contents read by a tool;
- your provider settings;
- fallback before the first response part;
- the routing deadline;
- an audit record.

Agent mode keeps running the tool loop. Cognify forwards the tools to the chosen model, and streams its text and tool calls back. Only models that support tool calling are used when tools are present, so a `local-only` request with tools fails if your only local model can't call tools.

The models advertise a fixed 128K context. Each request is still checked against the real model's limit before it is sent.

### Project Cognition

Cognify builds a structural model of the open workspace, from manifests and configuration only:
- packages and their scripts;
- dependencies;
- entry points;
- test suites;
- CI pipelines;
- conventions.

It is built on first use, never at startup. After that, file watchers keep it current. A change to a manifest, workflow or convention file re-reads only that file and re-derives only its part of the model, after 2 s of quiet. Use **Cognify: Show Project Model** to see it, **Rebuild Project Model** to rebuild it, and **Clear Project Model** to delete it. It is stored in this extension's workspace storage only, and never contains file contents, secrets or environment values; CI commands are stored with credentials redacted. Indexing never runs anything. In untrusted workspaces it reads manifests and workflows only.

The **`cognify_projectModel`** tool answers questions from the model. In chat, attach it with `#projectModel`; agents reference it as `vscode.cognify-ai/projectModel`, and the four Cognify personas use it.

| Operation | Answers |
|---|---|
| `summary` | Packages, CI pipelines and conventions. |
| `package` (`path`) | Scripts, dependencies and entry points of the package containing `path`. |
| `howToTest` (`path`, `branch`) | How to build and test that package, with the workspace's package manager, and which CI runs for it. |
| `ciFor` (`paths`, `branch`) | The pipelines that run on a change to `paths`. Only push, pull-request and merge-group triggers count, with their branch and `paths` filters applied. With `branch`, it also names the pipelines that run only on other branches. Steps that mention the package are listed first. |
| `recentChanges` (`path`) | Commits since the merge base with `dev` or `main`, only those touching `path` when given, plus uncommitted files mapped to packages. Uses the built-in Git extension. |

Answers cite the files they come from, mark inferred facts, are redacted, and stay prompt-sized. Each call writes a metadata-only line to the Cognify AI log: operation, packages, size, and whether anything was redacted.

While `cognify.privacy.localOnly` is on, the tool refuses. It can't tell which model will read its answer, and no local model can call tools.

See [`PROJECT_COGNITION_MVP.md`](../../DevDocs/Architecture/PROJECT_COGNITION_MVP.md).

### Role personas (agents)

The extension also contributes four custom agents, which appear in the Chat view's agent picker: **Cognify Planner**, **Cognify Coder**, **Cognify Reviewer** and **Cognify Tester**. They are plain data files in `agents/*.agent.md`, contributed through `contributes.chatAgents`. Each sets the role's instructions and tools, and a handoff button to the next role in the role map:

| Agent | Tools | Handoff button |
|---|---|---|
| Cognify Planner | `search`, `read`, `projectModel` (read-only) | **Implement the Plan** → Cognify Coder |
| Cognify Coder | `search`, `read`, `edit`, `execute`, `projectModel` | **Review the Changes** → Cognify Reviewer |
| Cognify Reviewer | `search`, `read`, `projectModel` (read-only) | **Write Tests** → Cognify Tester |
| Cognify Tester | `search`, `read`, `edit`, `execute`, `projectModel` | **Review the Tests** → Cognify Reviewer |

Each persona runs on its role's Cognify model (`model: Cognify · Coder (cognify)`, and so on). So in agent mode, every request it sends goes through the Cognify router, just like `@cognify` commands:
- the task-based provider order;
- fallback;
- the privacy gate, which also scans tool results;
- the routing deadline;
- an audit record.

Agent mode has no Cognify footer, so open **Cognify: Show AI Routing Log** to see which provider served each request and why.

If no Cognify model is available, for example before Copilot is signed in, agent mode ignores the persona's model and uses the one chosen in the picker.

The `search` and `edit` tool sets are contributed by GitHub Copilot; without it they are ignored.

### Prerequisite: GitHub Copilot sign-in

Chat only runs `@cognify` requests once GitHub Copilot is signed in, even if other language models are available (Sprint 2 decision, see [`AGENT_ROLES_AND_REUSE_MATRIX.md`](../../DevDocs/Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md), finding 1). Without it, Chat reports "Language model unavailable" before Cognify can respond. Cognify points this out in four places:

- **Chat panel welcome line:** shown in the empty chat, below Copilot's content, with a **Check AI Setup** link. It is contributed through `chatParticipants[].welcomeMessage`, and never replaces the chat input or Copilot's sign-in prompt.
- **Participant description:** the `@cognify` description in Chat names the requirement.
- **Warning when `@cognify` is first used:** if no Copilot model is available, a warning offers **Sign In to Copilot** (Copilot's own sign-in flow), **Check AI Setup**, and **Don't Show Again**.
- **`Cognify: Check AI Setup`** reports:
  - whether Chat can run `@cognify`;
  - each vendor with its number of models, and whether it's Copilot, local, or uses your API key;
  - disabled vendors and cooldowns;
  - the routing and privacy settings in effect.

  Cognify never reads API keys. A bring-your-own-key vendor appears only when its provider has a key configured.

## Settings

| Setting | Default | Description |
|---|---|---|
| `cognify.ai.preferredVendor` | `""` | Vendor to try first for every task (`copilot`, `openai`, `gemini`, `anthropic`, `ollama`, …). |
| `cognify.ai.pinnedModel` | `""` | Exact model id to use for every task. |
| `cognify.ai.fallbackWhenPinned` | `false` | When the pinned model fails, fall back to other models. |
| `cognify.ai.disabledVendors` | `[]` | Vendors that never receive a request. User-level only. |
| `cognify.ai.trustedVendors` | `[]` | Vendors that may receive content from confidential workspaces. User-level only. |
| `cognify.ai.maxCostTier` | `premium` | Most expensive tier allowed: `free` (local) < `included` (Copilot) < `metered` (your own API keys) < `premium`. User-level only. |

| `cognify.privacy.localOnly` | `false` | Send requests only to local models (Ollama). |
| `cognify.privacy.confidentialWorkspace` | `false` | Send this workspace's content only to local models and trusted vendors. |

Changes apply to the next request. "User-level only" settings are application-scoped, so a repository's workspace settings cannot change them. The `cognify.privacy.*` settings are on if they are on at any level, so a workspace can tighten privacy but never switch it off.

## Privacy gate

Before any provider is contacted, Cognify gives every request one of three privacy classes:

| Class | Sent to | When |
|---|---|---|
| `cloud` | any enabled vendor | Otherwise. |
| `cloud-trusted` | local models and vendors in `cognify.ai.trustedVendors` | The workspace is marked confidential. |
| `local-only` | local models only | `cognify.privacy.localOnly` is on, the request contains a credential (API keys, tokens, private keys, connection-string passwords, `.env` secrets), or a sensitive file (`.env`, `*.pem`, SSH keys, …) is attached. |

The class only ever gets stricter. If no allowed model is available, the request fails, and the footer says why. A vendor the class doesn't allow never receives the content, not even for a token count. The footer and audit log name the detector (for example `openai-key`), never the secret.

## How routing works

1. **Discover models.** Drop vendors the privacy class doesn't allow, disabled vendors, and models above the cost limit.
2. **Apply the pin**, if one is set.
3. **Filter by capability** (tool calling, image input).
4. **Check context size** with each provider's own token count.
5. **Rank.** Your preferred vendor comes first, then the task's default order. Vendors cooling down after an error go last.
6. **Try candidates in order**, up to 3 attempts within a 60 s deadline.

A response counts as accepted once its first fragment arrives. After that, a failure is reported rather than retried elsewhere.

**Error handling.** Errors are classified per vendor: quota, rate limit, auth, policy block, not found, unavailable, context too large, invalid request, or cancelled. Content-filter blocks are never routed to another vendor.

**Cooldowns.** These cooldowns are saved, so they survive a reload:

| Error | Cooldown |
|---|---|
| Rate limited | 30 s, or the provider's retry hint |
| Quota exhausted | 60 min |
| Unavailable | 60 s, doubling per repeat up to 15 min |

## Code layout

| Path | Contents |
|---|---|
| `src/privacy.ts` | Pure privacy gate: privacy classes, credential and sensitive-file detection. |
| `src/setup.ts`, `src/aiSetup.ts` | AI setup assessment (pure) and the `Check AI Setup` command and activation warning. |
| `src/audit.ts` | Pure audit records: field whitelist, bounded trail, export format and schema version. |
| `src/projectModel/` | Project Cognition (pure): the schema, the parsers (npm and pnpm, Python, Go, Cargo, GitHub workflows, conventions), a TOML subset reader, the indexer with budgets, and the tool's queries (`queries.ts`). |
| `src/projectModelTool.ts` | The `cognify_projectModel` tool, including recent changes from the Git extension. |
| `src/projectModelService.ts` | Builds, caches and stores the model for the open workspace. |
| `src/modelProvider.ts` | The `cognify` vendor's role models: routes agent-mode requests, with their tools, through the router. |
| `src/rolePrompts.ts`, `src/roles.ts` | The role-command table and prompts (pure), and the participant handler that runs every command through the router (`createRoleHandler`). |
| `src/routeExplanation.ts` | The "Why this provider?" footer link and the explanation dialog. |
| `src/router.ts` | Pure routing logic with no `vscode` import: role map, candidate selection, error tables, cooldown policy, fallback loop. |
| `src/routing.ts` | `CognifyRouter`: `vscode.lm` discovery, token counting, settings, persistence, first-fragment acceptance. |
| `src/extension.ts` | The `@cognify` chat participant, trace metadata and audit log. `activate` returns `CognifyAiApi { router }`. |
| `agents/*.agent.md` | The role personas (data only). `src/test/agentPersonas.test.ts` keeps their handoffs in step with the role map. |
| `test-fixtures/fake-lm/` | Test-only fake `vscode.lm` vendors (not packaged). |

## Testing

```bash
cd extensions/cognify-ai
pnpm run typecheck-test && pnpm test          # unit tests (node --test)
xvfb-run -a pnpm run test-integration        # extension-host tests with fake vendors (Linux; omit xvfb-run on desktops)
```

The unit tests run as ES modules (`src/package.json` sets `"type": "module"`); the extension itself still builds to CommonJS.

The integration tests need a transpiled client (`pnpm run transpile-client`) and Electron (`pnpm run electron`) at the repository root. Both suites run in the `Cognify (dev)` CI workflow.

Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).
