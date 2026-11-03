# Cognify Brand Assets: Provenance

| File | Description | Source | License |
|---|---|---|---|
| `cognify-icon-master.png` | Product icon master, 1254 × 1254 RGBA, transparent background | Supplied by the Cognify IDE project owner (devartblake), 2026-11-03 | Cognify IDE brand artwork. Owned by the project; **not** covered by the repository's MIT license |
| `cognify-wordmark-master.png` | "Cognify IDE" wordmark, 2172 × 724 RGBA, dark text for light backgrounds | Supplied by the project owner, 2026-11-03 | Same as above |
| `cognify-wordmark-light.png` | Wordmark with white "Cognify" text for dark backgrounds | Generated from `cognify-wordmark-master.png` by `generate_assets.py` | Same as above |
| `generate_assets.py` | Regenerates the product icon files from the masters | Cognify IDE contributors | MIT |

## Generated files

`generate_assets.py` writes these files at their existing paths and sizes. They replace the upstream Code - OSS artwork, and `scripts/cognify/check-product-identity.mts` fails if any of them still matches the upstream file:

- `resources/win32/code.ico` (16, 24, 32, 48, 64, 128, 256), `code_150x150.png`, `code_70x70.png`
- `resources/win32/inno-big-{100…250}.bmp`, `inno-small-{100…250}.bmp` (installer wizard images: icon centered on white)
- `resources/darwin/code.icns` (16–512 @1x/@2x)
- `resources/linux/code.png` (1024)
- `resources/server/code-192.png`, `code-512.png`, `favicon.ico` (16–64)

## Still needed from the designer

1. **Simplified small-size icon** (`cognify-icon-small.png`): flat "C" + `</>` without glow or fine traces, legible at 16–32 px. `generate_assets.py` uses it automatically for sizes ≤ 32 px when the file exists.
2. **SVG source** for the workbench product icon (`src/vs/workbench/browser/media/code-icon.svg`) and the empty-editor watermarks (`letterpress-{light,dark,hcLight,hcDark}.svg`), including a monochrome version for high-contrast themes.
3. Optional: an Agents-window icon to replace `resources/win32/sessions.ico` (still upstream; see `PRODUCT_IDENTITY_AND_BRANDING.md`).
