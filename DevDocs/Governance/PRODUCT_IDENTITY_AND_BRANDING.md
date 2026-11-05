# Product Identity and Branding

Issue: #6 — Establish Cognify product identity and branding baseline (Sprint 1, P0).

## Purpose

Record the Cognify product identity, the exact downstream delta it requires against `Code - OSS`, and the branding assets still needed. The machine-readable source of truth is [`product-identity.json`](product-identity.json); [`scripts/cognify/check-product-identity.mts`](../../scripts/cognify/check-product-identity.mts) verifies it in CI (`Cognify (dev)` workflow) and after every upstream sync.

## Identity Decisions

| Concern | Code - OSS value | Cognify value |
|---|---|---|
| Product name (short / long) | `Code - OSS` / `Code - OSS` | `Cognify` / `Cognify IDE` |
| Application / CLI name | `code-oss` | `cognify` |
| User data folder | `.vscode-oss` | `.cognify` |
| Shared data folder | `.vscode-oss-shared` | `.cognify-shared` |
| URL protocol | `code-oss://` | `cognify://` |
| Server application / data folder | `code-server-oss` / `.vscode-server-oss` | `cognify-server` / `.cognify-server` |
| Tunnel application | `code-tunnel-oss` | `cognify-tunnel` |
| Windows install dir / name | `Microsoft Code OSS` | `Cognify IDE` |
| Windows registry value | `CodeOSS` | `CognifyIDE` |
| Windows AppUserModelID | `Microsoft.CodeOSS` | `TheoreticalMindsTech.Cognify` |
| Windows mutexes | `vscodeoss`, `vscodeoss-tunnel*` | `cognify`, `cognify-tunnel*` |
| Windows installer AppIds (x64/arm64, system/user) | upstream GUIDs | new GUIDs (see manifest) |
| Windows shell menu label | `C&ode - OSS` | `C&ognify` |
| Windows Start tile name | `Code - OSS` | `Cognify` |
| macOS bundle identifier | `com.visualstudio.code.oss` | `com.theoreticalmindstech.cognify` |
| macOS configuration profile UUIDs | upstream UUIDs | new UUIDs (see manifest) |
| Linux desktop name / icon name | `com.visualstudio.CodeOSS` / `code-oss` | `com.theoreticalmindstech.cognify` / `cognify` |
| Issue reporting URL | `microsoft/vscode/issues/new` | `devartblake/cognify_ide/issues/new` |
| License URL | `microsoft/vscode` `LICENSE.txt` | `devartblake/cognify_ide` `LICENSE.txt` (same MIT text) |
| Web app manifest name | `Code - OSS` | `Cognify IDE` / `Cognify` |

Reverse-DNS namespace: `com.theoreticalmindstech.cognify`.

Because the data folder, protocol, mutexes, and installer IDs all differ, Cognify can be installed and run side by side with Code - OSS or VS Code without sharing settings, extensions, single-instance locks, or URL handlers.

Development builds keep their data apart from Code - OSS source builds too: user data goes to `cognify-dev` under the platform config directory (e.g. `~/.config/cognify-dev`, `%APPDATA%\cognify-dev`; set in `userDataPath.ts`), and extensions to `~/.cognify-dev/extensions`.

Development builds read the executable name from `product.json`, so the dev Electron binary becomes `.build/electron/cognify` (Linux), `.build/electron/Cognify.exe` (Windows), and `.build/electron/Cognify IDE.app/Contents/MacOS/Cognify` (macOS). `build/lib/preLaunch.ts` (run by `./scripts/code.sh` / `code.bat`) detects the missing renamed executable and re-downloads Electron automatically on first launch.

## Downstream Delta (files touched)

| File | Ownership | Change |
|---|---|---|
| `product.json` | Customization zone | Identity fields above. Copilot/GitHub integration keys (`defaultChatAgent`, `trustedExtensionAuthAccess`, `builtInExtensions`) are unchanged. |
| `src/vs/platform/product/common/product.ts` | Upstream-owned (narrow edit) | Out-of-sources fallback identity used by `./scripts/code-web` (`Cognify Dev`). |
| `resources/win32/VisualElementsManifest.xml` | Upstream-owned (narrow edit) | Start-tile `ShortDisplayName`. Not templated by the build. |
| `resources/server/manifest.json` | Upstream-owned (narrow edit) | Web app (PWA) `name` / `short_name`. |
| `scripts/code.sh` | Upstream-owned (narrow edit) | WSL path now reads `nameShort` from `product.json` (previously hard-coded `Code - OSS.exe`). |
| `src/vs/platform/environment/node/userDataPath.ts` | Upstream-owned (narrow edit) | Dev (`VSCODE_DEV`) user-data folder `code-oss-dev` → `cognify-dev`. |
| `src/vs/workbench/contrib/welcomeOnboarding/browser/onboardingVariationA.ts` | Upstream-owned (narrow edit) | First-run dialog title, aria label, and command-palette tip use `product.nameLong`/`nameShort` instead of hard-coded "VS Code". |
| `build/lib/preLaunch.ts` | Upstream-owned (narrow edit) | Electron is re-fetched when the executable named by `product.json` is missing, so the rename takes effect without deleting `.build/electron` by hand. |
| `.vscode/launch.json` | Upstream-owned (narrow edit) | Unit/smoke-test debug configurations point at the renamed Electron binary. |
| `README.md` | Customization zone | Cognify positioning with VS Code OSS / MIT attribution and trademark disclaimer. |
| `DevDocs/Governance/product-identity.json`, `scripts/cognify/check-product-identity.mts`, `.github/workflows/cognify-dev.yml` | Cognify-owned | Identity manifest, smoke check, and CI step. |

## Intentionally Unchanged

- `COPILOT_INTEGRATION_ID = 'code-oss'` (`src/vs/platform/endpoint/common/licenseAgreement.ts` and the Copilot extension copy) is a service-side identifier; changing it breaks Copilot.
- `~/.vscode-oss-dev/extensions/control.json` (built-in extension control file for `--builtin`) is hard-coded in `build/lib/builtInExtensions.ts`, `build/builtin/browser-main.js`, and the extensions scanner. Writer and readers agree, so it keeps working; everything else in dev uses the Cognify folders below.
- Microsoft Azure Pipelines definitions under `build/azure-pipelines/**` and upstream `.github/workflows/pr*.yml` reference Code - OSS paths but do not run for this fork.
- Test fixtures and mocks that use `code-oss` values exercise upstream behavior and do not read `product.json`.

## Known Follow-ups

- Many UI strings outside the first-run dialog still say "VS Code" literally (walkthroughs such as "Get Started with VS Code for the Web", messages, and settings descriptions). Rebranding them touches hundreds of upstream strings, so it needs its own plan, ideally a localization-style override layer rather than edits scattered across `src/vs/**`. [`VS_CODE_STRING_INVENTORY.md`](VS_CODE_STRING_INVENTORY.md) (S2-17) lists all 634 and classifies them: 318 rename, 104 reword, 212 keep.
- Branding artwork: done (S2-02). On 2026-11-05 the small icon frames (16–32 px) gained a pale plate for contrast on dark taskbars and title bars, and the Agents-window icon was replaced (both generated by `generate_assets.py`, chosen by the owner from rendered candidates). Optional: a designer-drawn version of either.

## Branding Asset Requirements

Cognify ships its own artwork and must not reuse Microsoft Visual Studio Code branding. Each asset is replaced at the same path and size, so the build pipeline needs no changes. Masters, the generator (`resources/cognify/brand/generate_assets.py`) and provenance are in [`resources/cognify/brand/`](../../resources/cognify/brand/PROVENANCE.md).

| Asset | Path | Format / sizes | Status |
|---|---|---|---|
| Windows application icon | `resources/win32/code.ico` | ICO with 16, 24, 32, 48, 64, 128, 256 px | ✅ Cognify (16–32 px: the simplified flat icon on a pale plate, readable on dark and light taskbars) |
| Windows Start tiles | `resources/win32/code_150x150.png`, `code_70x70.png` | PNG 150×150, 70×70 (transparent) | ✅ Cognify |
| Windows installer art | `resources/win32/inno-big-*.bmp`, `inno-small-*.bmp` | BMP at 100–250% scale (sizes per existing files) | ✅ Cognify (icon on white) |
| macOS application icon | `resources/darwin/code.icns` | ICNS 16–1024 px | ✅ Cognify |
| Linux application icon | `resources/linux/code.png` | PNG 1024×1024 | ✅ Cognify |
| Web / server icons | `resources/server/code-192.png`, `code-512.png`, `favicon.ico` | PNG 192/512, ICO 16–64 | ✅ Cognify (now true 192/512 px; upstream shipped 1024 px under both names) |
| Workbench product icon | `src/vs/workbench/browser/media/code-icon.svg` | SVG | ✅ Cognify (traced from the flat icon) |
| Empty-editor watermark | `src/vs/workbench/browser/parts/editor/media/letterpress-{light,dark,hcLight,hcDark}.svg` | SVG, one per theme | ✅ Cognify silhouette with upstream per-theme styling |
| Agents window icon | `resources/win32/sessions.ico` | ICO 16–256 (9 frames, as upstream) | ✅ Cognify (pale "C" on a navy plate; replaces Microsoft's Agents artwork, which ships in Windows packages) |

Guidelines:

- Provide a monochrome variant for high-contrast themes and the letterpress watermark.
- Keep file names unchanged; document any new asset in this table.
- Record the license/provenance of every asset in the PR that adds it.

The identity check fails if any generated file reverts to its upstream content (`replacedBrandAssets` in `product-identity.json`).

## Verification

```bash
node scripts/cognify/check-product-identity.mts
```

The check verifies every `product.json` identity value, rejects any top-level identifier equal to a known Code - OSS value, and checks the web fallback, Windows tile name, and web app manifest. Update `product-identity.json` and `product.json` together when identity changes deliberately.
