# Agent Roles and Reuse Matrix

- **Issue:** #8 (Sprint 1, P1): prototype Cognify agent roles on the current VS Code agent host
- **Depends on:** [ADR-0001](ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md), [AI provider routing contract](AI_PROVIDER_ROUTING_CONTRACT.md)
- **Prototype:** `extensions/cognify-ai` (Cognify-owned built-in extension)

## 1. MVP Role Map

| Role | Tasks (contract section 3) | Primary provider (contract section 5) | Handoff to | Typical tools |
|---|---|---|---|---|
| Planner | `architecture`, `requirements` | GPT | Coder | read, search, web |
| Coder | `edit`, `implement`, `refactor` | Copilot | Reviewer | read, edit, search, execute |
| Reviewer | `review` | Gemini | Tester | read, search |
| Tester | `test` | Copilot | Reviewer | read, edit, execute |
| DevOps | `config` | Gemini | none | read, edit, execute |
| Tutor | `explain` | Copilot | none | read, search |

Each task belongs to exactly one role (enforced by a unit test). Roles never pick a model themselves: they pass `task` and `role` to the router.

## 2. Reuse vs. Customization Matrix

Rule: reuse an upstream primitive unless it can't express the requirement (Sprint 1 architecture rule).

| Requirement | Upstream primitive | Decision | Notes |
|---|---|---|---|
| Role persona (instructions, tool limits) | Custom agents (`.agent.md`: `description`, `tools`, `model`, `agents`, `hooks`), contributed via `contributes.chatAgents` (no proposed API) | **Reuse** (Sprint 2) | Each role becomes an `.agent.md` shipped by `cognify-ai`. `tools:` gives per-role tool restriction for free. **Done (S2-14):** `extensions/cognify-ai/agents/` holds Planner, Coder, Reviewer and Tester. |
| Role-to-role handoff | `.agent.md` `handoffs: [{ agent, label, prompt, send?, model? }]` | **Reuse** | Native handoff buttons. The handoff may switch model. Cognify's `handoffTo` in the role map is the source of truth for generating these. **Done (S2-14):** the handoffs are written by hand and a unit test checks them against `ROLES`. |
| Model fallback per role | `.agent.md` `model: [A, B]` (first available wins) | **Reuse for personas; extend for routing** | Static list by display name, no error-aware fallback. Error/quota-aware routing stays in the Cognify router (ADR-0001). |
| Delegation to specialists | Subagents (`agent` tool, `agents:` allow-list, `disable-model-invocation`) | **Reuse** | Planner can delegate to Coder/Tester as subagents without Cognify orchestration code. |
| Task-aware provider routing + traceability | none (chat uses the picker model) | **Customize** (Cognify extension) | `@cognify` participant + `router.ts`; returns trace metadata. |
| Chat surface for roles | Chat participants (`vscode.chat.createChatParticipant`, `contributes.chatParticipants`, stable) | **Reuse** | `@cognify` with role commands. No workbench changes. |
| Tools | `vscode.lm.registerTool`, MCP servers, built-in tool sets | **Reuse** | No Cognify tool framework. Cognify-specific tools (e.g. Project Cognition queries, #9) register as normal LM tools. |
| Lifecycle policy (pre/post tool use) | Agent `hooks` (`PreToolUse`, `PostToolUse`) | **Reuse** | For DevOps/Tester guardrails (e.g. block `execute` outside the workspace). |
| Long-running/background agents | Agent host (`src/vs/platform/agentHost/**`), chat sessions (`contributes.chatSessions`) | **Defer** | Not needed for MVP roles. Revisit for autonomous multi-step runs. |
| Model registry / adapters | `vscode.lm` + Copilot BYOK providers | **Reuse** | Per ADR-0001. |

Net Cognify code for roles in MVP: one extension. Personas and handoffs are **data** (`.agent.md`), and only routing and traceability are **code**.

## 3. Proof of Concept: Reviewer Role

`extensions/cognify-ai` contributes the `@cognify` chat participant with `/review`:

1. **Collect** review material: attached `#` references (files/selections, capped at 60k characters each and 150k in total), otherwise the active editor selection or file.
2. **Route** (`src/router.ts`, a vscode-independent subset of the contract): `vscode.lm.selectChatModels()` → `rankCandidates(models, 'review', { minInputTokens, coolingDown })` (Gemini, then GPT, then Copilot, then other vendors) → `routeWithFallback` (at most 3 attempts; advances only on fallback-eligible errors; content-filter blocks, invalid requests and cancellation stop immediately).
3. **Stream** the winning model's answer. A failure after streaming starts is surfaced, never silently re-routed.
4. **Trace**: every response ends with a footer, e.g. *Cognify · role **Reviewer** · task `review` · served by **GPT** (`openai`) · outcome `fallback-success` · Fallbacks: gemini: rate-limited · Suggested handoff: **Tester***, and returns `ChatResult.metadata.cognify`:

```json
{
  "requestId": "cgn-…", "role": "reviewer", "task": "review",
  "outcome": "fallback-success",
  "servedBy": { "vendor": "openai", "modelId": "…", "modelName": "…" },
  "attempts": [ { "vendor": "gemini", "modelId": "…", "durationMs": 812, "errorKind": "rate-limited" },
                { "vendor": "openai", "modelId": "…", "durationMs": 2310 } ],
  "reason": "openai served the request after gemini (rate-limited).",
  "estimatedInputTokens": 5321,
  "handoff": { "toRole": "tester", "task": "test" }
}
```

5. **Audit**: the same record (metadata only: no prompt, code, or response text) goes to the **Cognify AI** log output channel (`Cognify: Show AI Routing Log`).
6. **Cooldowns**: vendors that fail with `rate-limited` (30 s), `quota-exhausted` (60 min), or `unavailable` (60 s, doubling per repeat up to 15 min) rank last for that window. A retry hint in the provider's error replaces the default. Cooldowns are kept in `globalState`, so they survive a reload (S2-07).
7. **Settings**: the `cognify.ai.*` settings (preferred vendor, pinned model, disabled vendors, cost limit) apply to the next request without a reload (S2-08; routing contract section 6).
8. **Privacy gate**: before routing, the request is classed `cloud`, `cloud-trusted` or `local-only`. Credentials or sensitive files in the context force `local-only`. The class is never relaxed (S2-09; routing contract section 8).

Try it (signed-in dev build): open a file or select code, then run `@cognify /review focus on error handling` in Chat.

## 4. Test Path

| Level | What | How |
|---|---|---|
| Unit | Role map, ranking and candidate selection (capabilities, context size, pin, privacy-blocked and disabled vendors, cost limit), the privacy gate (credential and sensitive-file detection, class strictness), per-vendor error tables (including credential redaction), retry hints, cooldown backoff, fallback loop and deadline: covers contract scenarios 1, 2, 5, 7 and 8 plus edge cases | `cd extensions/cognify-ai && pnpm run typecheck-test && pnpm test` (`node --test`, TypeScript type stripping; `src/` is ESM via `src/package.json`). Runs in the `Cognify (dev)` CI workflow. |
| Build | Extension compiles with the repo toolchain and bundles | `pnpm run gulp compile-extension:cognify-ai`, `node extensions/cognify-ai/esbuild.mts` |
| Integration (CI) | Router against real `vscode.lm` calls in an Electron extension host, with fake vendors (`gemini`, `openai`, `copilot`, `ollama`) from `test-fixtures/fake-lm`. Covers contract scenarios 1 to 8, the privacy gate (credentials, sensitive files, confidential workspaces, workspace settings unable to relax privacy), the routing deadline, Copilot-shaped quota/throttling/content-filter errors, cooldowns persisting across router instances, settings changing routing without a reload, all-vendors-failing, and failure after the first fragment | `cd extensions/cognify-ai && xvfb-run -a pnpm run test-integration` (Linux; run without `xvfb-run` on desktops). Runs in the `Cognify (dev)` workflow. |
| Manual | `@cognify /review` end to end with real providers | Signed-in dev build (see the finding below). |

## 5. Findings from the Prototype

1. **Chat is gated on Copilot for model selection.** When the request has no user-selected model, `ExtHostChatAgents2.getModelForRequest` falls back to the default model, and `getDefaultLanguageModel` only considers the `copilot` vendor. In this build the model picker offers only "Sign in to use Copilot" until the user signs in, even when another vendor (verified with a fake `LanguageModelChatProvider`) has registered models. Consequence: **any** chat participant, including `@cognify`, which routes on its own, fails with "Language model unavailable" before its handler runs unless Copilot is signed in or a model is selected. `vscode.lm.selectChatModels()` itself does not have this restriction. Options for Sprint 2, in order of preference:
   - (a) accept Copilot sign-in as an MVP prerequisite;
   - (b) offer non-chat entry points (commands/code actions) that call the router directly;
   - (c) a narrow upstream change so the default-model fallback considers any user-selectable model. This would be an `src/vs/**` edit recorded in `UPSTREAM_BASELINE.md`.
   **Decision (2026-11-03): option (a).** Sprint 2 treats a Copilot sign-in as an MVP prerequisite for chat-based Cognify roles. Sprint 2 work:
   - Surface the prerequisite *before* the user hits the generic "Language model unavailable" error. The participant handler never runs in that case, so it can't explain the problem itself. Use the participant description, a `chatViewsWelcome` entry shown when no model is available, and a `Cognify: Check AI Setup` command.
   - Document the prerequisite in the README and onboarding.
   - Verify `@cognify /review` end to end on a signed-in build, which closes the remaining #8 criterion.

   **Implemented (S2-03):** three places, each pointing to Copilot's own sign-in flow (`workbench.action.chat.triggerSetup`):
   - **Participant description:** the `@cognify` description names the requirement.
   - **Activation warning:** typing `@cognify` activates the extension even when Chat then refuses the request, so activation is the earliest point Cognify can speak. If no Copilot model appears within 5 s of activation, a one-time warning appears.
   - **`Cognify: Check AI Setup` command.**

   A Copilot model in `vscode.lm` is the signal that Copilot is signed in, because Copilot only registers models once it has a token.

   **Chat-panel welcome line (#28).** It's implemented through a small, additive core seam rather than `chatViewsWelcome` (see below):
   - **Field:** `chatParticipants[].welcomeMessage`, honored for built-in extensions only, and recorded in `UPSTREAM_BASELINE.md`.
   - **Placement:** the empty chat shows Cognify's line below Copilot's content. It's static, so it appears before the extension activates.
   - **What it never touches:** the chat input, Copilot's sign-in prompt, or the chat-setup flow. It is also hidden while the anonymous sign-in terms are shown.
   - **Check AI Setup link:** the line links to Check AI Setup. Running that command cancels the first-use warning, so the user doesn't get two notifications.

   **Why not a `chatViewsWelcome` entry, as originally planned:** the extension point needs the `chatParticipantPrivate` proposal. More importantly, while its `when` clause matches, the entry **replaces** the chat view's welcome. It also changes how the chat-setup agent handles errors (`chatSetupContributions.ts` drops its panel agents on an unresolvable error when any welcome entry matches). A Cognify entry shown to signed-out users would therefore hide Copilot's own sign-in welcome, the one thing they need. Revisit if the welcome registry gains a way to add content without replacing it.

   Options (b) and (c) stay open as later provider-neutrality work.
2. **Participant invocation ignores the picker model.** `@cognify` routes by role; the model chosen in the picker isn't used for role commands. That matches ADR-0001 ("explicit picker choice wins only for non-role chat"), but the UI should show this, and the footer already does.
3. **Cross-extension model access** may prompt the user for consent the first time `@cognify` uses another extension's models (standard `vscode.lm` behavior); `justification` is provided.

## 6. Acceptance Criteria Status (#8)

- [x] Reuse-vs-customization matrix is documented (section 2).
- [~] One Cognify role can be invoked in the development build: `@cognify /review` (and, since S2-13, `@cognify /explain`) registers and activates on invocation (`onChatParticipant:cognify.roles`). A full response needs a model the chat UI will dispatch with (finding 1). Verify on a Copilot-signed-in dev build.
- [x] Role output is traceable to provider and task context: footer, `ChatResult.metadata.cognify`, and the audit log.
- [x] No unnecessary fork of chat/agent plumbing: extension-only, using stable APIs (`chatParticipants`, `vscode.lm`); no `src/vs/**` changes.
- [x] Relevant test path is identified and focused tests are added (section 4).
