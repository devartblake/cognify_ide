# Upstream Sync Dry Run: 2026-11-04 (S2-16)

- **Purpose:** rehearse the quarantined import flow (`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`, "Branch Model") before a real import. Find where upstream now collides with Cognify, and what an import will cost.
- **Result:** **Not clean, so no import was merged.** The baseline manifest is unchanged.

| | |
|---|---|
| microsoft/vscode `main` | `dd554ae2e6b` (2026-11-04) |
| Cognify `dev` | `f645e2327bb` (after #29) |
| Merge base (last import) | `7aee1c3c4e8` (2026-09-19), as recorded in `upstream-baseline.json` |
| Upstream change since the merge base | 9,495 files |
| Cognify change since the merge base | 108 files |
| Changed on both sides | 15 files |
| Trial merge | **3 conflicted files** |

The trial merge ran locally on a throwaway `vendor/sync-2026-11-04` branch and was aborted. Nothing was pushed. The new workflow `cognify-upstream-mirror.yml` reproduces the same report in its job summary.

## Blocking finding: upstream moved from npm to pnpm

Microsoft's `main` now uses **pnpm**:

| Upstream change | Cognify impact |
|---|---|
| `"packageManager": "pnpm@12.16.0"` and `pnpm-lock.yaml`; `package-lock.json` removed | `Cognify (dev)` CI runs `npm ci`. It must switch to `pnpm install --frozen-lockfile`, using upstream's `.github/actions/setup-pnpm`. |
| A single root `pnpm-workspace.yaml` lists every built-in extension; `build/npm/dirs.ts` has `workspaceMembers` | `extensions/cognify-ai` must join the workspace. Its `package-lock.json` goes; its `node_modules` caching and its scripts need checking. |
| Root scripts are now run with `pnpm run …` | README, `CI_AND_SECURITY_BASELINE.md`, the cognify-ai README and `test-integration.sh` say `npm run`. |
| `.nvmrc` 24.18.0 → 24.22.1 | Update the runtime record in `UPSTREAM_BASELINE.md` and `upstream-baseline.json`; `check-upstream-baseline.mts` will flag the change. |

So the first real import is a **migration sprint item**, not a routine merge. Plan: a `vendor/sync-…` branch that takes upstream's pnpm setup, then ports Cognify's CI, `cognify-ai` and docs to pnpm in the same PR, so `dev` never sits half-migrated.

## Conflicts (3)

| File | Cognify side | Upstream side | Resolution |
|---|---|---|---|
| `.github/CODEOWNERS` | Cognify maintainers own Cognify paths; Microsoft reviewers aren't auto-requested (Sprint 0.5) | New Microsoft owner entries (workflows, quick input, JS allowlist) | **Keep Cognify's file.** Microsoft's owners don't apply downstream. Upstream's new entries are ownership metadata, not behavior. |
| `build/lib/preLaunch.ts` | Skip re-downloading Electron when the right version and the product-named executable are already installed (#12) | `shouldDownloadElectron()` in `electronVersion.ts` does **the same check**, version plus product-named executable, and runs through pnpm | **Take upstream.** Cognify's change is now redundant, so this divergence disappears. |
| `src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts` | Import of `getParticipantWelcomeMessages` (#28) | Import of `UserSelectedTools` | **Union of both imports.** It's a one-line conflict; the rest of the #28 seam merged cleanly. |

## Changed on both sides, merged without conflict (re-validate)

`.github/copilot-instructions.md`, `.vscode/launch.json`, `build/gulpfile.extensions.ts`, `build/npm/dirs.ts`, `eslint.config.js`, `product.json`, `scripts/code.sh`, `chatParticipant.contribution.ts`, `chatViewWelcomeController.ts`, `chatViewWelcome.css`, `chatAgents.ts`, `onboardingVariationA.ts`.

Each needs a check after the import:
- **`product.json`:** re-run `check-product-identity.mts`. Upstream may have added keys that need Cognify values.
- **`build/npm/dirs.ts` and `build/gulpfile.extensions.ts`:** `cognify-ai` must still be registered, now as a pnpm workspace member.
- **`eslint.config.js`:** the Cognify header rule (#16) must survive.
- **The chat files:** re-run `ChatAgents › participant welcome messages`, and look at the chat panel (#28).

## Recommendation

1. Merge the branch model and mirror workflow (this PR). Finish the owner setup steps in the policy, then run the mirror workflow once.
2. Add a Sprint 3 item, **"Upstream import with pnpm migration"**. It is the import plus porting Cognify's CI, `cognify-ai` and docs to pnpm, validated with the full post-sync gate list, including Windows.
3. Until then, keep `dev` on the 2026-09-19 baseline. The mirror and the weekly dry-run summary show how far upstream has moved.

## Outcome: import prepared on `vendor/sync-2026-11-04`

The recommendation was carried out the same day. The import branch merges the mirror at `4c32afe` (2026-11-04) into `dev`, as three reviewable commits:

1. **The merge**, with the three conflicts resolved as listed above.
2. **The pnpm port:**
   - `cognify-ai` added to `pnpm-workspace.yaml`;
   - a lockfile importer entry, generated with `pnpm install --lockfile-only`; it passes the supply-chain policy check;
   - the extension's `package-lock.json` removed;
   - `typeRoots` dropped from the `cognify-ai` and fake-lm tsconfigs, as upstream did for its extensions;
   - the `Cognify (dev)` workflow switched to `setup-pnpm` and `pnpm install --frozen-lockfile`.
3. **The manifest and docs:** Code OSS 1.146.0, Node 24.22.1, Electron 43.8.6, pnpm 12.16.0; npm commands in Cognify docs replaced with pnpm.

Validation on the merged tree, in a Linux container with Node 24.22.1 and pnpm 12.16.0:

| Gate | Result |
|---|---|
| `pnpm install --frozen-lockfile` | ✅ The container can't download Electron headers, so it ran with `--ignore-scripts`, then upstream's `postinstall.ts` built native modules against local Node headers. CI runners can download the headers. |
| `pnpm run typecheck-client` | ✅ 0 errors |
| `pnpm run transpile-client` | ✅ |
| `test-node` | ✅ **31,392 passing, 0 failing** (229 pending). `tunnelProxy.test.ts` was left out because it needs IPv6 loopback, which this container's kernel lacks; GitHub runners have it. |
| `ChatAgents › participant welcome messages` (the #28 seam) | ✅ |
| eslint (Cognify paths) | ✅ |
| `cognify-ai` typecheck-test + unit tests | ✅ 56 passing |
| `cognify-ai` integration tests on Electron 43.8.6 | ✅ 34 passing; the downloaded executable is named `cognify` |
| `check-product-identity.mts` | ✅ |
| `check-upstream-baseline.mts` | ✅ after the manifest update |

Still to verify before merging into `dev`: CI on the PR, which includes a real Electron-header install, and a desktop launch on Windows (S2-01).
