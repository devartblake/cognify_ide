# Rebranding Plan: "VS Code" → Cognify

- **Status:** Accepted (2026-11-04). The owner accepted the proposed defaults in "Decisions" (Sprint 3, D2). Work is tracked as Sprint 3 items R-01 to R-06.
- **Input:** [`VS_CODE_STRING_INVENTORY.md`](VS_CODE_STRING_INVENTORY.md) and [`vs-code-string-inventory.csv`](vs-code-string-inventory.csv) (S2-17): 634 strings, of which 577 remain after R-05: 265 to rename and 29 to reword, all handled by the Phase 2 NLS table, and 283 to keep. R-02 moved one Copilot "VS Code Insiders" message to reword. R-03 and R-04 renamed 49 literals in source, and R-04 reclassified 3 more (see the inventory).
- **Builds on:** [`PRODUCT_IDENTITY_AND_BRANDING.md`](PRODUCT_IDENTITY_AND_BRANDING.md). The product identity in `product.json`, the data folders, the protocol, the icons and the first-run dialog are already Cognify (Sprint 1, S2-02).

## Goal

A packaged Cognify build never calls itself "VS Code" in its UI, its settings or the AI's description of itself. It still says "VS Code" where that is accurate: the extension platform, Microsoft products, identifiers.

### Constraints
- **Upstream syncs must stay cheap.** No sweeping edits across `src/vs/**`. Every source edit is recorded in `UPSTREAM_BASELINE.md`, as the sync policy requires.
- **Extension compatibility is untouched.** The `engines.vscode` field, the extension API, `vscode.*` identifiers, `X-VSCode-*` headers and the manifest schema keep their names.
- **Trademarks:** "Visual Studio Code" and "VS Code" are Microsoft trademarks. Cognify must not present itself under them, but may name them accurately. For example, "compatible with VS Code extensions" is fine.

### Non-goals
- Renaming internal identifiers, telemetry descriptions or logs: the 212 keep strings.
- Translated UI. Language packs are Microsoft's and translate the original strings. The owner decided on English only for now (R-06, Phase 5).

## How strings reach the UI

This section is what the design builds on.

- **Packaged builds:** `build/lib/compilation.ts` runs `nls()` (`build/lib/nls.ts`) only when building a product. It replaces each `localize()` message in the JavaScript with an index, and writes all English messages to `nls.messages.json` and `nls.messages.js`, with `nls.keys.json` and `nls.metadata.json` mapping each index to its file and key. At runtime, `src/vs/base/node/nls.ts` loads that file, or a language pack's translation of it.
- **Development builds** (`transpile-client`, `build-fast`) skip that step. The English text stays inline in `out/`, so an override applied to `nls.messages.json` doesn't show in `./scripts/code.sh`. R-06 adds an opt-in transpile step for this; see Phase 5.
- **Built-in extensions:** their `package.json` strings come from `package.nls.json`, which `build/lib/extensions.ts` copies into the packaged extension.
- **Literals** (string constants not passed to `localize`) never go through NLS, so they can only be changed in source.

## Phases

| Phase | What | Strings | Code touched | Size |
|---|---|---|---|---|
| **1. Tooling** ✅ (R-01) | Commit the inventory extractor and classifier as `scripts/cognify/vscode-strings.mts`. Add a check that **fails CI when a new user-visible "VS Code" string appears** that isn't in the inventory, so upstream imports can't reintroduce the name silently. | 0 | Cognify script and CI only | S |
| **2. NLS override layer** ✅ (R-02) | A build step after `nls()` that rewrites the rename-class messages in `nls.messages.json`/`.js`, plus the `package.nls.json` entries, from a reviewed table `build/cognify/nls-rebrand.json` (`file#key` → new English text). | 265 (256 keys) | One Cognify build file plus one hook in `compilation.ts`/`extensions.ts`, recorded in `UPSTREAM_BASELINE.md` | M |
| **3. Source edits** ✅ (R-03 model-facing, R-04 user-visible) | Rename the literals that the user or the model sees. Model-facing text comes first: `R-model`, 16 strings (done in R-03, worded "Cognify IDE"), including the agent system prompt "You are an AI assistant using Copilot SDK in VS Code" and tool descriptions such as "Runs a VS Code task". Then the 36 user-visible literals (`R-ui`, `R-settings`; R-04 renamed 33 and reclassified 3): the agent-host client title, the synced-data name, the walkthrough alt text, the editor playground. Use `productService.nameShort`/`nameLong` where a service is in reach, and a constant otherwise. | 52 | About 25 upstream files with narrow edits, listed in `UPSTREAM_BASELINE.md` | M |
| **4. Rewords** ✅ (R-05) | Apply the decisions below to the 104 reword strings: hide or disable a feature, retarget it, or replace its text through the Phase 2 table. | 104 | Mostly `product.json`, configuration defaults and the Phase 2 table | M |
| **5. Dev builds and languages** ✅ (R-06) | **Dev builds:** have `build-fast` apply the same table, so `code.sh` shows the rebranded text. **Languages:** decide whether Cognify ships its own language packs, or accepts that non-English UI keeps the translated "VS Code" until it does. | n/a | Build only | S–L |

Phases 1 and 2 have no product decisions and can start right away. Phase 3's model-facing edits matter most to the user experience: they decide whether the AI tells users it runs in VS Code.

### Phase 2 design notes
- **Implemented in R-02:**
  - **Table:** `build/cognify/nls-rebrand.json`, 256 entries, one per `<module>#<key>`. A key that upstream reuses with the same message, such as `restartCode`, counts once, so 265 inventory rows need 256 entries.
  - **Code:** `build/cognify/nlsRebrand.ts`.
  - **Hooks:** three narrow, commented edits in upstream build files, recorded in `UPSTREAM_BASELINE.md`.
    - `build/next/nls-plugin.ts` (`finalizeNLS`, used for packaged builds) and `build/lib/nls.ts` (the gulp pipeline) apply the table to `nls.messages.json`/`.js`. `nls.metadata.json` and `nls.keys.json` keep upstream's English, so translation tooling and language packs see the original strings.
    - `build/lib/extensions.ts` (`minifyExtensionResources`) applies it to every packaged built-in extension's `package.nls.json`.
  - **Maintenance:** `node scripts/cognify/nls-rebrand.mts` (a CI step). The check fails if:
    - a rename-class inventory message has no entry;
    - an entry isn't rename class;
    - an entry's `from` no longer matches the source;
    - an override still says "VS Code" or changes the placeholders.

    `--write` adds draft entries for new rename-class messages, which name the product in place of VS Code and must be reviewed. It drops entries that are no longer rename class, and never rewrites a reviewed entry.
  - **Build check:** `--bundle <dir>` checks a build's `nls.messages.json` against the table.
- **Table format:** `{ "<module path>#<nls key>": { "from": "<upstream English>", "to": "<new English message>" } }`. The new text must keep the same `{0}` placeholders; the build step checks them and fails on a mismatch.
- **Why exact text, not a regex:** a reviewer sees every changed string, and grammar such as "a"/"an" or "VS Code's" stays correct.
- **When upstream changes a message:** the build step compares the current English message with the one the table was written against, which it records. If they differ, the build fails and names the key. A stale override is never applied silently.
- **The product name:** the table holds "Cognify IDE", the product's long name (`nameLong`), as the owner chose in R-02. Development builds already add "Dev" through `product.ts`, and most of these messages say "the app" rather than the build quality, so no runtime placeholder is needed.
- **Validation:** `node scripts/cognify/nls-rebrand.mts --bundle <build output>` loads a build's `nls.keys.json` and `nls.messages.json`, and fails unless every table entry for a module in that build carries the override. The plan first put this in `check-product-identity.mts`; it lives with the table instead.

### Phase 5 (R-06): dev builds and languages
- **Dev builds, opt-in (owner's choice):**
  - **Default:** development builds keep upstream's English, so unit tests (which run against `out/`) and upstream syncs are unaffected. Upstream tests assert upstream's English: always-on rebranding failed 4 node tests that CI runs.
  - **To preview the rebranded UI:** `COGNIFY_DEV_REBRAND=1 pnpm run transpile-client`, then `./scripts/code.sh`. Switching the flag needs a full transpile, because `build-fast` doesn't track environment variables.
  - **How it works:** `build/next/transpile.ts`, used by `transpile-client`, `build-fast` and watch, calls `rebrandDevSource` (`build/cognify/nlsRebrand.ts`). It overrides `localize`/`localize2` messages in each module's TypeScript, by key, before esbuild runs.
  - **Stale entries:** a stale entry only warns there. CI's table check fails on it.
  - **Checked:** with the flag on, all 216 core (`vs/…`) entries are in `out/`. With it off, `out/` keeps upstream's text.
  - **Limit:** in development, built-in extensions are loaded from `extensions/<name>/` with their own `package.nls.json`, so their 66 overrides apply only to packaged builds (R-02).
- **Languages, English only for now (owner's choice):** the overrides are English. Microsoft's language packs translate the original strings, so a non-English UI still says "VS Code" in its own language. Revisit after the MVP if Cognify has users who need it. The options then are Cognify language packs, which would mean about 280 translated messages per language, or blocking Microsoft's.

## Decisions

The owner accepted these defaults on 2026-11-04 (Sprint 3, decision D2). R-05 applied them:

- **Chat pet:**
  - Every way to turn it on is hidden: `/vscode-pet`, `/blobby`, Customize Blobby, the Agents-window "Pet" menu item, and the developer reset commands.
  - So is its accessibility help.
  - One constant gates all of these: `CHAT_PET_AVAILABLE` in `chatPetService.ts`.
  - Its strings are reclassified `K-inactive`.
- **Progress animation:** `cognify-ai` contributes `configurationDefaults: { "chat.persistentProgress": "drawMonochromeNoIcon" }`. Draw is still available for a user who chooses it, and the help texts say what the Cognify default is. This needs no upstream edit.
- **Issue reporter:**
  - Its text says "Cognify IDE" and "Cognify IDE version" through the table, plus 3 literal edits.
  - "A VS Code extension" becomes "An extension".
- **Newsletter, tunnels, Insiders/Stable:** reclassified `K-inactive`. The Dev Tunnel setting and the remote-connection details say "Cognify IDE" through the table, and keep vscode.dev/agents, which is accurate.
- **vscode.dev and the web:**
  - The GitHub commands are reclassified `K-msproduct`.
  - The web walkthrough already appears only when `isWeb`, so it shows only in a Cognify web build. Its titles are reworded.
- **Copilot help:** reclassified `K-ecosystem`.
- **CLI and server:** the server CLI messages say "Cognify IDE". The SSH agent host's "Installing VS Code CLI" message is accurate and stays, because it downloads Microsoft's CLI from `update.code.visualstudio.com`. Whether Cognify should install Microsoft's CLI on remote machines is a separate product question.
- **Docs and videos:** the Git welcome text says "in Cognify IDE [read the VS Code docs]". The video step says "the key features Cognify IDE shares with VS Code".
- **Release-notes link (from R-04):** the built-in extension changelog points to Cognify's `CHANGELOG.md`.

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
