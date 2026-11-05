# Moving `@cognify` Off Chat Participants

- **Status:** Proposed (2026-11-05), for a sprint after the MVP. No code changes until then (owner's decision; Sprint 6 adds no features).
- **Trigger:** **Customizations → Migrations** lists `@cognify` under "Replace Chat Participant". Upstream has deprecated chat participants and says the Copilot harness doesn't support them (`customizationMigrationDashboard.ts`). Its guidance tells users to "ask the extension publisher whether it provides an agent plugin, MCP server, or extension tools", and to "use a custom agent when the integration needs an ongoing specialist role".
- **Related:** [`AGENT_ROLES_AND_REUSE_MATRIX.md`](AGENT_ROLES_AND_REUSE_MATRIX.md), [`ADR-0001`](ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md), [`AI_PROVIDER_ROUTING_CONTRACT.md`](AI_PROVIDER_ROUTING_CONTRACT.md), `DevDocs/Quality/DEV_BUILD_VERIFICATION_2026-11-05.md` (branding item 7).

## What `@cognify` does today

`extensions/cognify-ai` contributes one chat participant, `cognify.roles` (`@cognify`), with four commands. `extension.ts` registers it, and `roles.ts` handles each request:

| Command | Role | What the handler adds beyond the prompt |
|---|---|---|
| `/review` | Reviewer | A role prompt (`rolePrompts.ts`) and routing on the Reviewer's model. |
| `/explain` | Tutor | The same, for the Tutor. |
| `/guide` | Tutor | Project context (`howToRun`, `howToTest` from the project model) injected into the prompt. |
| `/fix` | Coder | The same, for the Coder. |

For every command, the handler:
- **routes** through the Cognify router, which ranks vendors, applies the privacy gate, falls back, and enforces the cost limit;
- **audits** the request (`router.audit`) and records its outcome;
- ends the answer with a **"Why this provider?"** footer that links the route explanation;
- prints a help message when no command is given.

Other features depend on the participant:
- **Fix with Cognify, Explain with Cognify and Guide Me** (`beginnerModes.ts`) open Chat with `@cognify /fix|/explain|/guide …` queries.
- **The empty-chat welcome line** (#28) is a Cognify edit to upstream that reads `chatParticipants[].welcomeMessage`.

Already participant-free:
- **The four role personas** (Planner, Coder, Reviewer, Tester) are custom agents: `chatAgents`, `agents/*.agent.md`. Each runs on its role's Cognify model, so agent mode already goes through the router (S3-05).
- **The `cognify_projectModel` tool** (`languageModelTools`).
- **The `cognify` model provider** (`languageModelChatProviders`).

## Options

| Option | How | Keeps | Loses or costs |
|---|---|---|---|
| **A. Custom agents for the commands** | Add a **Cognify Tutor** agent (`/explain`, `/guide`) next to the existing Reviewer and Coder agents. Each agent's `model:` is its role's Cognify model, and it can call `cognify_projectModel`. | Routing, privacy and audit (they live in the model provider); project context (through the tool); upstream's supported path. | Commands become agents chosen in the agent picker, not `@cognify /cmd`. The "Why this provider?" footer and the no-command help come from the participant's handler, so they need another home (for example a provider-side audit link). `beginnerModes.ts` must open Chat with an agent and a prompt instead of a participant query. |
| **B. Prompt files or skills plus the agents** | Use A for the roles, and add reusable prompts (`/review`, `/explain`, `/guide`, `/fix`) contributed by the extension, each naming its agent. | A's benefits, plus familiar slash commands. | Depends on what upstream lets a built-in extension contribute (prompt files or skills, and whether they can pin an agent). Confirm against upstream's "Learn how to replace chat participants" guidance before choosing. |
| **C. Agent plugin** | Package the agents, prompts and tool as one agent plugin, as the migration guidance suggests. | One installable unit, matching upstream's direction. | The plugin format and how built-in extensions ship one need confirming. Possibly more than the MVP's built-in-only distribution needs. |
| **D. Keep the participant** | No change; hide the migration entry for built-in extensions with a narrow upstream edit. | Today's behavior. | Builds on a deprecated API; it breaks when the Copilot harness becomes the only chat path. Rejected as a long-term answer; the owner also chose not to hide the warning now. |

## Recommendation

**B, built on A.** Keep the roles as custom agents, since four of the five already are, and expose the commands as extension-contributed prompts that pin those agents. Do C later if upstream makes agent plugins the standard way to ship, because B's parts are what a plugin bundles.

### What has to move

1. **A Tutor agent** (`agents/tutor.agent.md`), using `rolePrompts.ts`'s Tutor text and the Tutor's Cognify model.
2. **Project context for `/guide` and `/fix`:** the agent instructions tell the model to call `cognify_projectModel` (`howToRun`, `howToTest`) rather than the handler injecting them. Check answer quality against the S5-07/S5-09 scenarios.
3. **"Why this provider?"** The audit already records each route in the provider. Expose the latest route through a command and a status-bar or chat-response link, instead of the participant's footer.
4. **Beginner modes:** `openChat` with the agent and the prompt, keeping the attached files and selection.
5. **The welcome line (#28):** move the text into the walkthrough or the agents' descriptions, then remove the upstream delta and its `UPSTREAM_BASELINE.md` entry.
6. **Remove `chatParticipants`** once every entry point works without it; the Migrations entry then disappears.

### Open questions

- Can a built-in extension contribute prompt files or skills that pin a custom agent, and does that work in the Copilot harness?
- Does upstream's agent plugin format apply to built-in extensions, or only to installed ones?
- Without a participant, how should Cognify show the route explanation inline, so routing stays visible to the user (a principle in ADR-0001)?

## Test impact

- Unit: `rolePrompts.test.ts` stays (the prompt text moves into agent files); `agentPersonas.test.ts` covers the Tutor agent.
- Integration: the role-command tests move from participant requests to agent requests with fake vendors. The MVP scenario test (S6-06) changes its `/guide` and `/fix` steps.
- Manual: the signed-in session (S6-02) repeats with the agents.
