# Hard-Coded "VS Code" String Inventory (S2-17)

- **Next step:** [`REBRANDING_PLAN.md`](REBRANDING_PLAN.md).
- **Purpose:** list every place where the product calls itself "VS Code", and classify each one as **rename**, **reword** or **keep**. This feeds a later rebranding plan. No code changes are made here.
- **Source tree:** `dev` after the 2026-11-04 upstream import (Code OSS 1.146.0, upstream `4c32afe`).
- **Full list:** [`vs-code-string-inventory.csv`](vs-code-string-inventory.csv), one row per string, with its class, category, location, NLS key and text.

## Summary

**634 strings.** The sprint plan estimated about 300; the 2026-11-04 import added many, mostly in chat and the agent host.

| Class | Count | Meaning |
|---|---|---|
| **Rename** | 318 | The text means "this app". Replace "VS Code" with the product name ("Cognify" or "Cognify IDE"). |
| **Reword** | 104 | A name swap isn't enough. The text points to a Microsoft service, artwork or channel that Cognify doesn't have, so it needs new wording, a different target, or removal. |
| **Keep** | 212 | Not shown to users (identifiers, telemetry, logs), or correctly about VS Code (the extension platform, other Microsoft apps). |

| Source | Rename | Reword | Keep | Total |
|---|---|---|---|---|
| Localized strings in `src/vs` (`localize`/`localize2`) | 208 | 80 | 33 | 321 |
| Built-in extensions' `package.nls.json` | 58 | 14 | 2 | 74 |
| Other string literals in `src/vs` | 52 | 10 | 177 | 239 |
| **Total** | **318** | **104** | **212** | **634** |

Literals are counted separately because renaming them means editing source, not an NLS override (see "How to rename" below).

## Categories

| Category | Class | Count | What it covers | Example |
|---|---|---|---|---|
| `R-ui` | Rename | 179 | Messages, labels and help text about the running app. | "Please restart VS Code before reinstalling {0}." · "Open in VS Code" (Agents window) · "Switching a profile requires reloading VS Code." |
| `R-settings` | Rename | 65 | Setting and schema descriptions about the running app. | "Whether the user is prompted when VS Code closes with a running task." · "Let VS Code detect which renderer will give the best experience." |
| `R-ext` | Rename | 44 | Built-in extension text (`package.nls.json`). | "Traces the communication between VS Code and the CSS language server." · "NPM support for VS Code" |
| `R-model` | Rename | 16 | Text sent to the language model: tool descriptions, the agent system prompt, generated instructions. It isn't shown in the UI, but it makes the AI describe the app as VS Code. | "You are an AI assistant using Copilot SDK in VS Code." · "Runs a VS Code task." |
| `R-theme` | Rename | 14 | Theme and icon-theme labels and descriptions. Theme IDs stay the same. | "Monokai theme for Visual Studio Code" · "Seti (Visual Studio Code)" |
| `W-artwork` | Reword | 54 | The chat pet ("Blobby, the VS Code pet": 45 strings), the VS Code mark in the chat progress "Draw" animation, icon colors, and the codicon background pattern. The strings follow whatever happens to the artwork. | "The VS Code pet woke up" · "Tie the VS Code mark with fast parabolic ribbon motion…" |
| `W-service` | Reword | 27 | Microsoft services and channels: vscode.dev, VS Code for the Web, Insiders and Stable switching, Remote Tunnels and Dev Tunnels, the newsletter, video tutorials, `aka.ms` docs links. | "Signup for the VS Code Newsletter" · "Open in vscode.dev" · "Press the reload button to switch to the Insiders version of VS Code." |
| `W-issues` | Reword | 14 | Issue reporter: it offers "Visual Studio Code" as the target, and its templates and version fields assume Microsoft's tracker. | "I acknowledge that my VS Code version is not updated…" |
| `W-copilot` | Reword | 5 | GitHub Copilot's help about VS Code itself: the `@vscode` participant and the VS Code API reference tool. Decide together with the Copilot strategy (Sprint 2 decision **a**). | "Ask questions about VS Code" · "Get VS Code API References" |
| `W-cli` | Reword | 4 | The `code` CLI and server binaries, which Cognify ships under its own name. | "Command is only available in WSL or inside a Visual Studio Code terminal." |
| `K-id` | Keep | 79 | Identifiers and protocol values: command and context IDs, `X-VSCode-*` headers, URI schemes, OSC sequences, OAuth redirect URIs, the marketplace user agent, theme IDs. | `sessions.openInVSCode` · `X-VSCode-AppVersion` · `https://vscode.dev/redirect` |
| `K-telemetry` | Keep | 55 | Telemetry and GDPR classification text. It is never shown, and Cognify sends no telemetry. | "The error message. VS Code telemetry scrubs file paths…" |
| `K-ecosystem` | Keep | 36 | VS Code as the extension platform: the extension manifest schema (`engines.vscode`, gallery fields), the extension API, VS Code-format agent and skill files, VS Code test controllers and input variables. | "For VS Code extensions, specifies the VS Code version that the extension is compatible with." |
| `K-log` | Keep | 33 | Logs, developer diagnostics, translator comments, comments in generated files. | "Starting VS Code" (debug log) · `/* VS Code injected style */` |
| `K-msproduct` | Keep | 6 | Correct names of other Microsoft products: recognizing an installed VS Code or Insiders, and the "VS Code Speech" extension. | "Would you like to install 'VS Code Speech' extension from 'Microsoft'?" |
| `K-dup` | Keep | 3 | Template literals that embed a localized string already counted. | |

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
- **Don't edit the 266 localized and `package.nls.json` renames in place.** That would scatter hundreds of edits over upstream files and conflict on every import. Use an **NLS override layer** instead: a build step that rewrites the rename-class messages, by NLS key, in the generated message bundles (`nls.messages.json` and the extensions' `package.nls.json`). This is how language packs work, so upstream files stay untouched and new upstream strings show up as unclassified in the next inventory.
- **The 52 renamed literals need source edits**, because they aren't in the NLS bundles. Model-facing text (`R-model`, 16) is the most valuable of these: it is what the AI says about the app. Group the edits in a few files, and record them in `UPSTREAM_BASELINE.md` as divergences.
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
- **Re-run after each upstream import:** the extractor is a short TypeScript-API script. Keeping it, with the classification rules, under `scripts/cognify/` is a follow-up for the rebranding plan, so new upstream strings can be diffed against this baseline.
