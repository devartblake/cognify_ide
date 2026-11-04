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

Every routed request is recorded in a per-workspace audit trail (the last 200 requests). The trail is metadata only: task, role, privacy class, the provider that answered, attempts with error kinds and durations, skipped models, and the reason. It never holds prompt, code, response or provider error text.

- `Cognify: Show AI Routing Log` shows the records as live log lines.
- `Cognify: Export AI Routing Log` saves them as JSON.
- `Cognify: Clear AI Routing Log` deletes them.

### Role personas (agents)

The extension also contributes four custom agents, which appear in the Chat view's agent picker: **Cognify Planner**, **Cognify Coder**, **Cognify Reviewer** and **Cognify Tester**. They are plain data files in `agents/*.agent.md`, contributed through `contributes.chatAgents`. Each sets the role's instructions and tools, and a handoff button to the next role in the role map:

| Agent | Tools | Handoff button |
|---|---|---|
| Cognify Planner | `search`, `read` (read-only) | **Implement the Plan** → Cognify Coder |
| Cognify Coder | `search`, `read`, `edit`, `execute` | **Review the Changes** → Cognify Reviewer |
| Cognify Reviewer | `search`, `read` (read-only) | **Write Tests** → Cognify Tester |
| Cognify Tester | `search`, `read`, `edit`, `execute` | **Review the Tests** → Cognify Reviewer |

The personas run in VS Code's agent mode with the model chosen in the model picker. They do **not** go through the Cognify router: no task-based provider order, no fallback, no privacy gate, no footer and no audit record. Use the `@cognify` commands when you need those. Routing the personas is part of the Sprint 3 role flow.

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
