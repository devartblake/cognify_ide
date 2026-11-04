# Upstream Compatibility Baseline

## Purpose

This document is the human-readable compatibility manifest for Cognify IDE as a downstream fork of Microsoft VS Code OSS. It records the exact upstream state accepted into Cognify, the downstream integration point, and the checks required before a later Microsoft update can enter `dev`.

## Current Accepted Baseline

- Baseline recorded: **2026-11-04**, through `vendor/sync-2026-11-04` (the first import under the branch model). The previous baseline was 2026-09-19: upstream `7aee1c3`, Code OSS 1.139.0, Node 24.18.0, npm.
- Downstream integration branch: `dev`. The import branch starts from `dev` at `d151543cacb1e995df2a71a95cb8a8dfc82dcb66` and is merged by PR with a merge commit.
- Imported Microsoft VS Code commit: `4c32afe38baa636e3c29fd16c99169eaf87259b7` (the `vendor/vscode-main` mirror tip, 2026-11-04)
- Latest Microsoft `main` observed while recording this manifest: `4c32afe38baa636e3c29fd16c99169eaf87259b7`
- Code OSS package version: **1.146.0**
- Node.js version from `.nvmrc`: **24.22.1**
- Electron: **43.8.6**
- Package manager: **pnpm 12.16.0**. Upstream migrated from npm; see `UPSTREAM_SYNC_DRY_RUN_2026-11-04.md`.

The observed Microsoft `main` commit is informational. Cognify is certified against the **imported upstream commit**, not against whatever happens to be at Microsoft `main` later.

## Upstream Import Rule

Microsoft updates must not be merged directly into `dev` during normal Cognify development.

Required flow:

```text
microsoft/vscode main
      |
      v
vendor/vscode-main            (read-only mirror; .github/workflows/cognify-upstream-mirror.yml)
      |
      v
vendor/sync-YYYY-MM-DD        (from dev; see UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md, "Branch Model")
      |
      +-- inspect upstream delta
      +-- resolve conflicts
      +-- run compatibility checks
      +-- run Cognify smoke gates
      +-- update this manifest
      |
      v
     dev  ── promotion PR ──►  main   (Cognify stable; never takes Microsoft commits directly)
```

The latest rehearsal of this flow is recorded in `UPSTREAM_SYNC_DRY_RUN_2026-11-04.md`. It found that upstream moved to pnpm, so the next import includes a migration.

Emergency security fixes may use an expedited sync branch, but they still require an explicit compatibility record before entering `dev`.

## Cognify Customization Zones

These areas are expected to carry Cognify-specific changes and therefore need deliberate review during every upstream sync:

1. `DevDocs/**`
2. `product.json` and Cognify product/build metadata
3. `.github/CODEOWNERS`
4. `.github/pull_request_template.md`
5. Cognify-specific `.github/workflows/**`
6. Cognify-owned built-in extensions/modules (`extensions/cognify-ai`, registered by one line each in `build/gulpfile.extensions.ts` and `build/npm/dirs.ts`)
7. supported workbench/agent contribution points used by Cognify
8. deep `src/vs/**` changes only when an extension/contribution seam is insufficient

The long-term objective is to keep the Cognify delta small and concentrated in owned seams.

## Required Post-Sync Gates

Run after every Microsoft import before merging the sync branch into `dev`:

```text
1. npm install
2. npm run watch
3. desktop development launch
4. web development launch when in scope
5. npm run typecheck-client
6. npm run test-node
7. Native Watchdog/node-gyp verification on Windows
8. Cognify identity smoke test: node scripts/cognify/check-product-identity.mts
9. Cognify AI extension unit tests: `cd extensions/cognify-ai && npm test` (full provider/agent registration smoke test pending a fake-provider harness)
10. Project Cognition initialization smoke test once implemented
11. workflow/security configuration review
12. update upstream-baseline.json and this document
```

## Known Accepted Divergences

At this baseline, Cognify intentionally differs from Microsoft VS Code OSS in:

- downstream CODEOWNERS behavior;
- Cognify pull-request governance;
- DevDocs planning/governance structure;
- Cognify product identity (`product.json` identifiers plus narrow edits to `product.ts` web fallback, `VisualElementsManifest.xml`, `resources/server/manifest.json`, `scripts/code.sh` WSL path, and `.vscode/launch.json`; see `PRODUCT_IDENTITY_AND_BRANDING.md`);
- Cognify branding artwork (product icons and watermarks; see `resources/cognify/brand/PROVENANCE.md`);
- **chat participant welcome line** (#28). An optional `welcomeMessage` field on the `chatParticipants` contribution, honored for built-in extensions only. It is shown in its own slot in the empty-chat welcome, below the default agent's content, and not while the anonymous sign-in terms are shown. The files involved:
  - `chatParticipantContribTypes.ts`: the field;
  - `chatParticipant.contribution.ts`: the schema and the built-in-only check;
  - `chatAgents.ts`: the `IChatAgentData.welcomeMessage` field and the `getParticipantWelcomeMessages` helper;
  - `chatWidget.ts`: fills `participantMessage`;
  - `chatViewWelcomeController.ts`: renders `participantMessage` and compares it in `needsRerender`;
  - `chatViewWelcome.css`: one spacing rule.

  Every edit is additive and marked `Cognify` in a comment. On an upstream sync, keep the field and the rendering. If upstream gains a native way for participants to add welcome content, switch to it and drop this delta. The test is `ChatAgents › participant welcome messages` (`chatAgents.test.ts`);
- future AI-provider routing, agent orchestration, Project Cognition, and environment UX.

Upstream security, build, and platform behavior should otherwise be preserved wherever practical.

## Sprint 1 Requirement

Sprint 1 must treat this baseline as a compatibility contract.

Any change to `product.json`, application identifiers, built-in extensions, workbench contributions, agent-host integration, or build metadata must:

- identify whether the file is upstream-owned or Cognify-owned;
- record the smallest downstream delta;
- add or update a focused smoke check;
- update the manifest if compatibility assumptions change.

## Automation

The machine-readable companion is:

`DevDocs/Governance/upstream-baseline.json`

The local guard script is:

`node scripts/cognify/check-upstream-baseline.mts`

The guard verifies that the accepted upstream commit remains in history and that key runtime versions still match the recorded baseline.

The identity guard is:

`node scripts/cognify/check-product-identity.mts`

It verifies the Cognify identity recorded in `DevDocs/Governance/product-identity.json` and fails if an upstream sync reintroduces a Code - OSS identifier. Both guards run in the `Cognify (dev)` CI workflow.
