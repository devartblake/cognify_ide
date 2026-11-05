# Hard-Coded "VS Code" String Inventory (S2-17)

- **Next step:** [`REBRANDING_PLAN.md`](REBRANDING_PLAN.md).
- **Purpose:** list every place where the product calls itself "VS Code", and classify each one as **rename**, **reword** or **keep**. This feeds a later rebranding plan. No code changes are made here.
- **Source tree:** `dev` after the 2026-11-04 upstream import (Code OSS 1.146.0, upstream `4c32afe`).
- **Full list:** [`vs-code-string-inventory.csv`](vs-code-string-inventory.csv), one row per string, with its class, category, location, NLS key and text.

## Summary

**634 strings.** The sprint plan estimated about 300; the 2026-11-04 import added many, mostly in chat and the agent host.

The counts below are the inventory as maintained by `scripts/cognify/vscode-strings.mts` (**585 strings** after the S3-11 upstream import). Changes since S2-17:
- **R-02** reclassified one Copilot message from rename to reword (`github.copilot.viewsWelcome.switchToReleaseChannel`): it offers "VS Code Insiders", a channel Cognify doesn't have.
- **R-03** renamed the 16 model-facing literals (`R-model`) in source, so they left the inventory.
- **R-04** renamed 33 user-visible literals in source. It also reclassified three:
  - `SYNCED_CUSTOMIZATION_DISPLAY_NAME` ("VS Code Synced Data") and `STANDALONE_DISPLAY_NAME` became **keep** (`K-id`). They are plugin names that the window and the agent host match on, so a rename needs a coordinated migration.
  - The extension editor's "VS Code Release Notes" link became **reword** (`W-service`). Cognify has no `releaseNotesUrl`, so the link has nowhere to point.
- **R-05** applied the owner's decisions (`REBRANDING_PLAN.md`, "Decisions") to every reword string.
  - **26 reworded through the NLS table:** the issue reporter, the Git docs welcome text, the Dev Tunnel and remote-connection details, the web walkthrough titles, the video-tutorial text, the progress-animation help, the codicon background, the Copilot Insiders message and the web marketplace message. They stay in the inventory as reword, and the R-02 check requires an override for each.
  - **8 literals edited in source:** the issue reporter's version fields, the extension performance-issue template, the CLI and server messages, and the built-in extension changelog notice. They left the inventory.
  - **69 reclassified as keep:**
    - `K-inactive` (52): text that only features Cognify turns off can show. That is the 45 chat-pet strings (the pet can't be turned on), the newsletter, Remote Tunnels and Insiders/Stable switching.
    - `K-msproduct` (9): text that names Microsoft's product accurately. That is the GitHub "vscode.dev" commands, the progress-animation and icon-color descriptions of the VS Code mark (shown only when a user opts in to Draw), and the SSH installer, which downloads Microsoft's VS Code CLI.
    - `K-ecosystem` (5): Copilot's VS Code help, kept by decision.
    - `K-id` (3): two `"VS Code for Web"` NLS *keys* whose message is `"{0} for the Web"` with the product name, and the OAuth redirect URIs.
- **S3-11, the upstream import of 2026-11-04 (`e5b6876`), added 12 strings and removed 4:**
  - **7 renamed through the NLS table:** the new Extensions section of the Agents window. There, "VS Code" means the main editor window, so in Cognify it reads "Cognify IDE": "Installing one here also installs it in Cognify IDE".
  - **2 reworded:** the remote-connection details moved to `remoteConnectionsSharing.ts`. Their R-05 overrides were re-keyed, with unchanged text.
  - **3 kept:** new identifiers (`K-id`).

| Class | Count | Meaning |
|---|---|---|
| **Rename** | 272 | The text means "this app". Replace "VS Code" with the product name ("Cognify" or "Cognify IDE"). |
| **Reword** | 28 | A name swap isn't enough. The text points to a Microsoft service, artwork or channel that Cognify doesn't have, so it needs new wording, a different target, or removal. All 28 are reworded by the NLS table (R-05). |
| **Keep** | 285 | Not shown to users (identifiers, telemetry, logs), or correctly about VS Code (the extension platform, other Microsoft apps). |

| Source | Rename | Reword | Keep | Total |
|---|---|---|---|---|
| Localized strings in `src/vs` (`localize`/`localize2`) | 215 | 19 | 93 | 327 |
| Built-in extensions' `package.nls.json` | 57 | 9 | 8 | 74 |
| Other string literals in `src/vs` | 0 | 0 | 184 | 184 |
| **Total** | **272** | **28** | **285** | **585** |

Literals are counted separately because renaming them means editing source, not an NLS override (see "How to rename" below).

## Categories

| Category | Class | Count | What it covers | Example |
|---|---|---|---|---|
| `R-ui` | Rename | 150 | Messages, labels and help text about the running app. | "Please restart VS Code before reinstalling {0}." · "Open in VS Code" (Agents window) · "Switching a profile requires reloading VS Code." |
| `R-settings` | Rename | 65 | Setting and schema descriptions about the running app. | "Whether the user is prompted when VS Code closes with a running task." · "Let VS Code detect which renderer will give the best experience." |
| `R-ext` | Rename | 43 | Built-in extension text (`package.nls.json`). | "Traces the communication between VS Code and the CSS language server." · "NPM support for VS Code" |
| `R-model` | Rename | 0 (16 renamed in R-03) | Text sent to the language model: tool descriptions, the agent system prompt, generated instructions. It isn't shown in the UI, but it makes the AI describe the app as VS Code. | "You are an AI assistant using Copilot SDK in VS Code." · "Runs a VS Code task." |
| `R-theme` | Rename | 14 | Theme and icon-theme labels and descriptions. Theme IDs stay the same. | "Monokai theme for Visual Studio Code" · "Seti (Visual Studio Code)" |
| `W-artwork` | Reword | 3 (51 reclassified in R-05) | The chat pet ("Blobby, the VS Code pet": 45 strings), the VS Code mark in the chat progress "Draw" animation, icon colors, and the codicon background pattern. The strings follow whatever happens to the artwork. | "The VS Code pet woke up" · "Tie the VS Code mark with fast parabolic ribbon motion…" |
| `W-service` | Reword | 16 | Microsoft services and channels: vscode.dev, VS Code for the Web, Insiders and Stable switching, Remote Tunnels and Dev Tunnels, the newsletter, video tutorials, `aka.ms` docs links. | "Signup for the VS Code Newsletter" · "Open in vscode.dev" · "Press the reload button to switch to the Insiders version of VS Code." |
| `W-issues` | Reword | 9 | Issue reporter: it offers "Visual Studio Code" as the target, and its templates and version fields assume Microsoft's tracker. | "I acknowledge that my VS Code version is not updated…" |
| `W-copilot` | Reword | 0 (kept in R-05) | GitHub Copilot's help about VS Code itself: the `@vscode` participant and the VS Code API reference tool. Decide together with the Copilot strategy (Sprint 2 decision **a**). | "Ask questions about VS Code" · "Get VS Code API References" |
| `W-cli` | Reword | 0 | The `code` CLI and server binaries, which Cognify ships under its own name. | "Command is only available in WSL or inside a Visual Studio Code terminal." |
| `K-id` | Keep | 86 | Identifiers and protocol values: command and context IDs, `X-VSCode-*` headers, URI schemes, OSC sequences, OAuth redirect URIs, the marketplace user agent, theme IDs. | `sessions.openInVSCode` · `X-VSCode-AppVersion` · `https://vscode.dev/redirect` |
| `K-telemetry` | Keep | 55 | Telemetry and GDPR classification text. It is never shown, and Cognify sends no telemetry. | "The error message. VS Code telemetry scrubs file paths…" |
| `K-ecosystem` | Keep | 41 | VS Code as the extension platform: the extension manifest schema (`engines.vscode`, gallery fields), the extension API, VS Code-format agent and skill files, VS Code test controllers and input variables. | "For VS Code extensions, specifies the VS Code version that the extension is compatible with." |
| `K-log` | Keep | 33 | Logs, developer diagnostics, translator comments, comments in generated files. | "Starting VS Code" (debug log) · `/* VS Code injected style */` |
| `K-msproduct` | Keep | 15 | Correct names of other Microsoft products: recognizing an installed VS Code or Insiders, and the "VS Code Speech" extension. | "Would you like to install 'VS Code Speech' extension from 'Microsoft'?" |
| `K-dup` | Keep | 3 | Template literals that embed a localized string already counted. | |
| `K-inactive` | Keep | 52 | Shown only by features Cognify turns off (R-05): the chat pet, which can't be turned on; the newsletter; Remote Tunnels; Insiders/Stable switching. Revisit if one is turned on. | "The VS Code pet woke up" · "Signup for the VS Code Newsletter" |

## Where the strings are

The areas with the most strings, by file location (the rest are in the CSV):

| Area | Rename | Reword | Keep | Notes |
|---|---|---|---|---|
| `workbench/contrib/chat` | 82 | 57 | 16 | Most rewords are the chat pet and the progress-animation artwork. |
| `platform/agentHost` | 39 | 1 | 52 | Mostly telemetry and protocol; the renames are agent-host messages and setting descriptions. |
| `workbench/contrib/welcomeGettingStarted` | 18 | 3 | 0 | The walkthroughs: "Get started with VS Code", "Setup VS Code", and image alt text. |
| `workbench/contrib/extensions` | 15 | 2 | 1 | Install and reload prompts. |
| `extensions/copilot` | 11 | 4 | 0 | Copilot setting descriptions ("Requires VS Code reload"). |
| `workbench/browser` | 12 | 1 | 1 | Help menu, policy diagnostics, the window-title `${appName}` example. |
| `workbench/contrib/issue` | 0 | 13 | 0 | The whole issue reporter needs a Cognify target. |
| `extensions/typescript-language-features` | 12 | 0 | 0 | Settings and the Node.js walkthrough. |
| `workbench/contrib/terminal` | 11 | 0 | 0 | Terminal setting descriptions. |
| `extensions/theme-*` (12 extensions) | 14 | 0 | 0 | One line each. |
| `extensions/git`, `extensions/github` | 4 | 10 | 0 | Source Control welcome text with VS Code docs links; vscode.dev commands. |

## How to rename

- **Use the product name, not a literal.** `IProductService.nameShort`/`nameLong` already carry "Cognify"/"Cognify IDE", and "Cognify Dev"/"Cognify IDE Dev" in development builds (`product.json`, Sprint 1). The first-run dialog (#12) shows the pattern: a `{0}` placeholder filled from the product service.
- **Don't edit the 265 localized and `package.nls.json` renames in place** (implemented in R-02, see `REBRANDING_PLAN.md`). That would scatter hundreds of edits over upstream files and conflict on every import. Use an **NLS override layer** instead: a build step that rewrites the rename-class messages, by NLS key, in the generated message bundles (`nls.messages.json` and the extensions' `package.nls.json`). This is how language packs work, so upstream files stay untouched and new upstream strings show up as unclassified in the next inventory.
- **The 52 renamed literals need source edits** (done: 16 model-facing in R-03, 33 user-visible in R-04; the other 3 were reclassified), because they aren't in the NLS bundles. Model-facing text (`R-model`, 16) is the most valuable of these: it is what the AI says about the app. Group the edits in a few files, and record them in `UPSTREAM_BASELINE.md` as divergences.
- **Rewords need product decisions first:**
  - **Chat pet and progress animation:** replace the artwork, or turn the features off by default.
  - **Issue reporter:** point it at `devartblake/cognify_ide` (`product.json` `reportIssueUrl` covers part of this).
  - **Microsoft services:** hide or remove the vscode.dev, Insiders, Remote Tunnels and newsletter entries. Most are already inactive without Microsoft's `product.json` keys.
  - **Copilot help participant:** goes with the Copilot strategy.
  - **CLI and server names:** go with packaging.
- **Leave the keep class alone.** Changing identifiers, headers or the extension manifest schema would break extension compatibility and upstream merges for no visible gain.

## Method

- **`src/vs` (excluding `test/` folders and `*.test.ts`):** every string literal, template or `localize`/`localize2` message matching `VS ?Code`, `Visual Studio Code` or `vscode.dev`, found by walking the TypeScript syntax tree. Comments aren't string literals, so they aren't counted.
- **Built-in extensions:** every `package.nls.json` message with the same patterns. Extension source code (`extensions/*/src`) isn't included; it is mostly Microsoft's own extensions talking to VS Code APIs.
- **Walkthrough media:** the Markdown and SVG files under `welcomeGettingStarted` and `welcomeWalkthrough` have no matches.
- **Classification:** ordered rules on file area and wording, plus hand-checked overrides. The CSV `category` column records the rule that applied. Treat individual rows as a starting point for the rebranding plan, not a final decision.
- **Re-run after each upstream import:** the extractor and the classification rules are in `scripts/cognify/vscode-strings.mts` (R-01).
  - **Default mode** compares the source tree with the CSV. Rows are matched by source, file, key and text, plus an occurrence number for repeats, so line moves aren't drift. It **fails CI** on a new user-visible string (rename or reword), and only warns about new keep-class strings or rows that disappeared.
  - **`--write`** regenerates the CSV, sorted. It keeps the class of every row the CSV already has, so hand reviews survive, and classifies only new rows.
  - **Port check:** run on the S2-17 tree, the script reproduces this inventory exactly (634 rows: 318 rename, 104 reword, 212 keep, before the R-02 reclassification), and its rules agree with the S2-17 classification on every row.
