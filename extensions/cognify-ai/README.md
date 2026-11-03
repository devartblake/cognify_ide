# Cognify AI

Built-in extension that provides Cognify's role-based AI assistance. It routes each task to a suitable language model from the providers available through `vscode.lm` (Copilot, bring-your-own-key vendors, local models) and records which provider answered and why.

Cognify owns routing **policy**, not transport. It doesn't call provider APIs itself (see [ADR-0001](../../DevDocs/Architecture/ADR-0001-AI-PROVIDER-ABSTRACTION-AND-ROUTING.md)). The behavior is specified in the [AI provider routing contract](../../DevDocs/Architecture/AI_PROVIDER_ROUTING_CONTRACT.md).

## Using it

In Chat, run `@cognify /review`. Attach files with `#` or select code first, then add any instructions, for example `@cognify /review focus on error handling`.

The response footer shows:
- the role and task;
- the provider that answered;
- any fallbacks, and models that were skipped (with the reason).

`Cognify: Show AI Routing Log` opens the audit log. It records metadata only: no prompt, code, or response text.

Chat-based roles need a Copilot sign-in for now (Sprint 2 decision, see [`AGENT_ROLES_AND_REUSE_MATRIX.md`](../../DevDocs/Architecture/AGENT_ROLES_AND_REUSE_MATRIX.md)).

## Settings

| Setting | Default | Description |
|---|---|---|
| `cognify.ai.preferredVendor` | `""` | Vendor to try first for every task (`copilot`, `openai`, `gemini`, `anthropic`, `ollama`, …). |
| `cognify.ai.pinnedModel` | `""` | Exact model id to use for every task. |
| `cognify.ai.fallbackWhenPinned` | `false` | When the pinned model fails, fall back to other models. |
| `cognify.ai.disabledVendors` | `[]` | Vendors that never receive a request. User-level only. |
| `cognify.ai.trustedVendors` | `[]` | Vendors trusted with sensitive content, for the privacy gate (in progress). User-level only. |
| `cognify.ai.maxCostTier` | `premium` | Most expensive tier allowed: `free` (local) < `included` (Copilot) < `metered` (your own API keys) < `premium`. User-level only. |

Changes apply to the next request. "User-level only" settings are application-scoped, so a repository's workspace settings cannot change them.

## How routing works

1. **Discover models.** Drop disabled vendors, and models above the cost limit.
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
| `src/router.ts` | Pure routing logic with no `vscode` import: role map, candidate selection, error tables, cooldown policy, fallback loop. |
| `src/routing.ts` | `CognifyRouter`: `vscode.lm` discovery, token counting, settings, persistence, first-fragment acceptance. |
| `src/extension.ts` | The `@cognify` chat participant, trace metadata and audit log. `activate` returns `CognifyAiApi { router }`. |
| `test-fixtures/fake-lm/` | Test-only fake `vscode.lm` vendors (not packaged). |

## Testing

```bash
cd extensions/cognify-ai
npm run typecheck-test && npm test          # unit tests (node --test)
xvfb-run -a npm run test-integration        # extension-host tests with fake vendors (Linux; omit xvfb-run on desktops)
```

The integration tests need a transpiled client (`npm run transpile-client`) and Electron (`npm run electron`) at the repository root. Both suites run in the `Cognify (dev)` CI workflow.

Changes are listed in [`CHANGELOG.md`](CHANGELOG.md).
