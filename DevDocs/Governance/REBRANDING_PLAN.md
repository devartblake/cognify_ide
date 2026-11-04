# Rebranding Plan: "VS Code" → Cognify

- **Status:** Accepted (2026-11-04). The owner accepted the proposed defaults in "Decisions" (Sprint 3, D2). Work is tracked as Sprint 3 items R-01 to R-06.
- **Input:** [`VS_CODE_STRING_INVENTORY.md`](VS_CODE_STRING_INVENTORY.md) and [`vs-code-string-inventory.csv`](vs-code-string-inventory.csv) (S2-17): 634 strings, 318 to rename, 104 to reword, 212 to keep.
- **Builds on:** [`PRODUCT_IDENTITY_AND_BRANDING.md`](PRODUCT_IDENTITY_AND_BRANDING.md). The product identity in `product.json`, the data folders, the protocol, the icons and the first-run dialog are already Cognify (Sprint 1, S2-02).

## Goal

A packaged Cognify build never calls itself "VS Code" in its UI, its settings or the AI's description of itself. It still says "VS Code" where that is accurate: the extension platform, Microsoft products, identifiers.

### Constraints
- **Upstream syncs must stay cheap.** No sweeping edits across `src/vs/**`. Every source edit is recorded in `UPSTREAM_BASELINE.md`, as the sync policy requires.
- **Extension compatibility is untouched.** The `engines.vscode` field, the extension API, `vscode.*` identifiers, `X-VSCode-*` headers and the manifest schema keep their names.
- **Trademarks:** "Visual Studio Code" and "VS Code" are Microsoft trademarks. Cognify must not present itself under them, but may name them accurately. For example, "compatible with VS Code extensions" is fine.

### Non-goals
- Renaming internal identifiers, telemetry descriptions or logs: the 212 keep strings.
- Translated UI. Language packs are Microsoft's and translate the original strings (see Phase 5).

## How strings reach the UI

This section is what the design builds on.

- **Packaged builds:** `build/lib/compilation.ts` runs `nls()` (`build/lib/nls.ts`) only when building a product. It replaces each `localize()` message in the JavaScript with an index, and writes all English messages to `nls.messages.json` and `nls.messages.js`, with `nls.keys.json` and `nls.metadata.json` mapping each index to its file and key. At runtime, `src/vs/base/node/nls.ts` loads that file, or a language pack's translation of it.
- **Development builds** (`transpile-client`, `build-fast`) skip that step. The English text stays inline in `out/`, so an override applied to `nls.messages.json` doesn't show in `./scripts/code.sh`.
- **Built-in extensions:** their `package.json` strings come from `package.nls.json`, which `build/lib/extensions.ts` copies into the packaged extension.
- **Literals** (string constants not passed to `localize`) never go through NLS, so they can only be changed in source.

## Phases

| Phase | What | Strings | Code touched | Size |
|---|---|---|---|---|
| **1. Tooling** ✅ (R-01) | Commit the inventory extractor and classifier as `scripts/cognify/vscode-strings.mts`. Add a check that **fails CI when a new user-visible "VS Code" string appears** that isn't in the inventory, so upstream imports can't reintroduce the name silently. | 0 | Cognify script and CI only | S |
| **2. NLS override layer** | A build step after `nls()` that rewrites the rename-class messages in `nls.messages.json`/`.js`, plus the `package.nls.json` entries, from a reviewed table `build/cognify/nls-rebrand.json` (`file#key` → new English text). | 266 | One Cognify build file plus one hook in `compilation.ts`/`extensions.ts`, recorded in `UPSTREAM_BASELINE.md` | M |
| **3. Source edits** | Rename the literals that the user or the model sees. Model-facing text comes first: `R-model`, 16 strings, including the agent system prompt "You are an AI assistant using Copilot SDK in VS Code" and tool descriptions such as "Runs a VS Code task". Then the 36 user-visible literals (`R-ui`, `R-settings`): the agent-host client title, the synced-data name, the walkthrough alt text, the editor playground. Use `productService.nameShort`/`nameLong` where a service is in reach, and a constant otherwise. | 52 | About 25 upstream files with narrow edits, listed in `UPSTREAM_BASELINE.md` | M |
| **4. Rewords** | Apply the decisions below to the 104 reword strings: hide or disable a feature, retarget it, or replace its text through the Phase 2 table. | 104 | Mostly `product.json`, configuration defaults and the Phase 2 table | M |
| **5. Dev builds and languages** | **Dev builds:** have `build-fast` apply the same table, so `code.sh` shows the rebranded text. **Languages:** decide whether Cognify ships its own language packs, or accepts that non-English UI keeps the translated "VS Code" until it does. | n/a | Build only | S–L |

Phases 1 and 2 have no product decisions and can start right away. Phase 3's model-facing edits matter most to the user experience: they decide whether the AI tells users it runs in VS Code.

### Phase 2 design notes
- **Table format:** `{ "<module path>#<nls key>": "<new English message>" }`. The new text must keep the same `{0}` placeholders; the build step checks the count and fails on a mismatch.
- **Why exact text, not a regex:** a reviewer sees every changed string, and grammar such as "a"/"an" or "VS Code's" stays correct.
- **When upstream changes a message:** the build step compares the current English message with the one the table was written against, which it records. If they differ, the build fails and names the key. A stale override is never applied silently.
- **The product name:** the table holds "Cognify". Development builds already add "Dev" through `product.ts`, and most of these messages say "the app" rather than the build quality, so no runtime placeholder is needed.
- **Validation:** extend `check-product-identity.mts` to load a packaged build's `nls.messages.json` and assert that no rename-class key still contains "VS Code".

## Decisions

The owner accepted these defaults on 2026-11-04 (Sprint 3, decision D2).

| Area | Strings | Today in Cognify | Proposed |
|---|---|---|---|
| **Chat pet** ("Blobby, the VS Code pet") | 45 | Off by default; users opt in with `/vscode-pet`. It uses Microsoft's mascot art. | Hide the `/vscode-pet` command and the pet's menu entries, so the mascot can't be turned on. Rename the strings to "chat pet" when Cognify has its own art. |
| **Progress "Draw" animation and VS Code icons** (the VS Code mark, its colors, the codicon background pattern) | 9 | `chat.progressAnimation` defaults to **Draw**, which animates the VS Code mark in every chat response. | Default to the style without the icon. The mark stays only if the user opts in. Describe the codicon pattern as "built-in icons". |
| **Issue reporter** | 14 | `reportIssueUrl` already points at `devartblake/cognify_ide`, but the dialog says "Visual Studio Code" and "VS Code Version" | Rename through the table ("Cognify", "Cognify version"). Keep the extension-issue path. |
| **Newsletter, Remote Tunnels, Insiders/Stable switching, Dev Tunnels** | 7 | **Mostly hidden already:** `product.json` has no `newsletterSignupUrl`, `tunnelApplicationConfig` or update URL. The remote agent host's Dev Tunnel setting description is still shown. | Newsletter, tunnels and channel switching: no change; rename their text through the table only if a feature is enabled later. Dev Tunnel setting: change "from VS Code" to "from Cognify" through the table. |
| **vscode.dev and VS Code for the Web** | 11 | `github` extension commands "Open in vscode.dev" and "Copy vscode.dev Link"; web walkthrough | Keep the GitHub commands; they name a real Microsoft service correctly. Change their class to keep. Hide the web walkthrough unless Cognify ships a web build. |
| **Copilot's VS Code help** (`@vscode`, VS Code API tool) | 5 | Shown when Copilot is installed | Leave as is. The help is about the VS Code extension API, which Cognify supports. Revisit with the Copilot strategy (Sprint 2 decision **a**). |
| **CLI and server names** | 4 | The binary is already `cognify` (`applicationName`) | Rename the text with the CLI ("Cognify terminal", "Cognify server"). |
| **VS Code docs and videos** (`aka.ms/vscode-*` links in the Git welcome views, the video-tutorials walkthrough step) | 9 | Point to Microsoft's docs and videos | Keep the links, because they are the most accurate material. Change "in VS Code" in the text to "in Cognify", using the table. |

## Proposed sprint placement

These are suggested as Sprint 3 items (R = rebranding). The roadmap's Sprint 3 goal stays agent orchestration and Project Cognition, so these are P1/P2.

| ID | Item | Pri | Acceptance |
|---|---|---|---|
| R-01 | Phase 1 tooling: inventory script and CI drift check | P1 | CI fails on a new unclassified user-visible "VS Code" string. Running the script on the current tree reproduces the S2-17 counts. |
| R-02 | Phase 2 NLS override layer and table for the 266 messages | P1 | A packaged build's `nls.messages.json` has no rename-class "VS Code". Upstream message changes fail the build by key. |
| R-03 | Phase 3 model-facing literals (16) | P1 | The agent's system prompt and tool descriptions name Cognify. Recorded in `UPSTREAM_BASELINE.md`. |
| R-04 | Phase 3 user-visible literals (36) | P2 | Recorded in `UPSTREAM_BASELINE.md`. |
| R-05 | Phase 4 rewords, after owner decisions | P2 | The decisions table is resolved, and each reword string is applied or reclassified. |
| R-06 | Phase 5 dev-build parity and language decision | P2 | `code.sh` shows the rebranded text. The language decision is recorded. |
