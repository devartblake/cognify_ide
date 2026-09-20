# Upstream Compatibility Baseline

## Purpose

This document is the human-readable compatibility manifest for Cognify IDE as a downstream fork of Microsoft VS Code OSS. It records the exact upstream state accepted into Cognify, the downstream integration point, and the checks required before a later Microsoft update can enter `dev`.

## Current Accepted Baseline

- Baseline recorded: **2026-09-19**
- Downstream integration branch: `dev`
- Downstream integration commit: `31984cabe6151be6af5aef19de9754113a848912`
- Imported Microsoft VS Code parent commit: `7aee1c3c4e8f3555050f6b41bd86e171f1456c45`
- Latest Microsoft `main` observed while recording this manifest: `832cf23c5887351668f61c8648eb9c2ec6ee7d23`
- Code OSS package version: **1.139.0**
- Node.js version from `.nvmrc`: **24.18.0**

The observed Microsoft `main` commit is informational. Cognify is certified against the **imported upstream commit**, not against whatever happens to be at Microsoft `main` later.

## Upstream Import Rule

Microsoft updates must not be merged directly into `dev` during normal Cognify development.

Required flow:

```text
microsoft/vscode
      |
      v
chore/upstream-vscode-sync-YYYY-MM-DD
      |
      +-- inspect upstream delta
      +-- resolve conflicts
      +-- run compatibility checks
      +-- run Cognify smoke gates
      +-- update this manifest
      |
      v
     dev
```

Emergency security fixes may use an expedited sync branch, but they still require an explicit compatibility record before entering `dev`.

## Cognify Customization Zones

These areas are expected to carry Cognify-specific changes and therefore need deliberate review during every upstream sync:

1. `DevDocs/**`
2. `product.json` and Cognify product/build metadata
3. `.github/CODEOWNERS`
4. `.github/pull_request_template.md`
5. Cognify-specific `.github/workflows/**`
6. future Cognify-owned built-in extensions/modules
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
8. Cognify identity smoke test once Sprint 1 branding lands
9. provider/agent registration smoke test once implemented
10. Project Cognition initialization smoke test once implemented
11. workflow/security configuration review
12. update upstream-baseline.json and this document
```

## Known Accepted Divergences

At this baseline, Cognify intentionally differs from Microsoft VS Code OSS in:

- downstream CODEOWNERS behavior;
- Cognify pull-request governance;
- DevDocs planning/governance structure;
- future Cognify product identity and branding;
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

`node scripts/cognify/check-upstream-baseline.mjs`

The guard verifies that the accepted upstream commit remains in history and that key runtime versions still match the recorded baseline.
