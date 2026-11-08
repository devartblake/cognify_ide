# Cognify Updates and Signing: Design Note

- **Status:** Proposed (2026-11-08). Planned for `cognify-v0.2.0`, after the MVP release. Sprint 6's decision D2 put signing and automatic updates in v1.5; this note is that plan. Waiting on the owner's decisions U-D1 to U-D6.
- **Already done (S6-12):** every package the `Cognify (package)` workflow builds now comes with its SHA-256 checksum and an update record, so releases from `cognify-v0.1.0` on carry what an update server needs (see [Release outputs](#release-outputs-done-in-s6-12)).
- **Related:** [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md) (unsigned installer, no automatic updates, upstream's version number); [`SPRINT_6_MVP_CERTIFICATION.md`](../Sprints/SPRINT_6_MVP_CERTIFICATION.md) (D2, D3, S6-12); the roadmap's post-MVP row "Cognify version number".

## Goal

A user installs Cognify once and gets new releases without hunting for downloads: on Windows the app downloads and installs them, on Linux the system's package manager does. Every package is signed, so Windows and Linux trust it, and each release is published from CI the same way.

## What Cognify already has

Cognify inherits Code - OSS's update service (`src/vs/platform/update/electron-main/`). It isn't active because `product.json` has no `updateUrl`.

| Platform | Upstream's update service | What it needs |
|---|---|---|
| **Windows, user setup** (`updateService.win32.ts`) | Fully automatic: asks the update server, downloads the new setup, checks its `sha256hash`, and runs it with `/verysilent /update=…` in the background; the user sees **Restart to Update**. A mutex keeps two instances from installing at once. | An update server; signed installers. |
| **Linux, archive** (`updateService.linux.ts`) | Only says an update is available and opens `downloadUrl` or the update's URL; a tar archive can't replace itself. | Packages a package manager updates (`.deb`, `.rpm`), or Snap (`updateService.snap.ts`) or Flatpak, which update themselves. |
| **macOS** | Squirrel.Mac. | Not built yet (Sprint 6, D3). |

### The update protocol

The app requests `GET <updateUrl>/api/update/<platform>/<quality>/<commit>` (`createUpdateURL` in `abstractUpdateService.ts`), where:
- `platform` is `win32-x64-user` or `linux-x64` (later `linux-deb-x64` and others);
- `quality` is `stable` (later perhaps `insider` for a preview channel);
- `commit` is the running build's commit.

The server answers:
- **204 No Content** if that commit is the newest;
- **200** with an `IUpdate` record (`src/vs/platform/update/common/update.ts`) otherwise: `{ "version": "<commit>", "productVersion": "1.146.0", "timestamp": …, "url": "<download>", "sha256hash": "<sha256>" }`.

The request also carries `?u=none` and, for a background check, `bg=true`, plus a `User-Agent` with the OS version.

## Design

### 1. Releases on GitHub Releases

Each release is a tag on `main` (`cognify-v0.1.0`, `cognify-v0.2.0`…) with a GitHub Release holding:
- the packages;
- their `.sha256` files and `SHA256SUMS-<platform>.txt`;
- `update-<platform>.json`.

The package workflow gains a release mode (U-03): given a tag, it builds, checks, and attaches everything to a draft release that the owner publishes.

### 2. The update server

A small serverless function (U-D2), about 50 lines:

1. Read the latest *published* release from the GitHub API (cached for a few minutes) and its `update-<platform>.json` asset.
2. If the request's `commit` equals the record's `version`, answer 204; otherwise answer the record.
3. Answer 204 for an unknown platform or quality, so an unsupported install never breaks.

| Option | Cost | Notes |
|---|---|---|
| **Cloudflare Worker** (proposed) | Free tier is ample | Fast everywhere; a custom domain such as `update.cognify.dev` (U-D3). |
| Vercel or Netlify function | Free tier | Similar. |
| GitHub Pages | Free | Static only: can't answer 204 per commit, so it would need a change to the update service (an upstream edit). Not proposed. |

`product.json` gets `"updateUrl": "https://<domain>"` and `"quality": "stable"`. The `Cognify (package)` workflow currently sets `VSCODE_QUALITY: oss`, and a release build sets `stable` instead.

**Safety:**
- **HTTPS only.**
- **Checksum:** Windows checks the SHA-256 before it runs a setup. Signing (below) is the second check.
- **Halt:** a release can be stopped by unpublishing it, and the function then serves the previous one.
- **Staged rollout (optional, later):** answer the update to only a share of requests at first.

### 3. Windows

- **Signing (U-D1):** sign `Cognify.exe`, its native modules and the setup. The packaging step already runs `signtool` checks (it adds the Windows SDK to `PATH`).

  | Option | Cost (approximate, check current prices) | Notes |
  |---|---|---|
  | **Azure Trusted Signing** (proposed) | About $10 a month | A cloud service; needs identity validation of Theoretical Minds Technology; signs from GitHub Actions with a federated identity, so no key file is stored. Reputation with SmartScreen builds as the publisher's signed downloads grow. |
  | OV certificate on a hardware token or cloud HSM | About $200–400 a year | Works; key handling is harder in CI. |
  | EV certificate | Higher | No longer gives instant SmartScreen reputation, so it isn't worth the extra cost here. |

- **Updates:** with `updateUrl` set, the user setup updates itself as described. The upstream code that checks for a running setup and the "Admin in user setup" case stays as is.
- **System-wide setup:** not built; the user setup is enough for now.

### 4. Linux

| Option | Updates through | Effort | Proposed |
|---|---|---|---|
| **`.deb` and `.rpm` in an apt/dnf repository** | `apt upgrade`, `dnf upgrade`, and the desktop's software updater | Upstream's gulp tasks build both (`vscode-linux-x64-prepare-deb` then `-build-deb`, and the same for `rpm`); the repository can be static files on GitHub Pages or an R2/S3 bucket, signed with a Cognify GPG key. | **Yes** (U-D4) |
| Snap | The Snap Store | Upstream has the build and `updateService.snap.ts`; needs a store account and review. | Later |
| Flatpak (Flathub) | Flathub | A separate manifest, reviewed by Flathub; popular on many distributions. | Later |
| AppImage | AppImageUpdate | Not supported by the update service. | No |

The tar archive stays for people who want it. The update service only tells them a new release exists.

### 5. A Cognify version number

Today the app reports upstream's version (1.146.0), while releases are `cognify-v0.x`. The update record's `productVersion` is what the app shows in "Update available", so this is the moment to fix it (U-D5):
- **Proposed:** a `cognifyVersion` field in `product.json` (for example `0.2.0`), shown in **Help > About** and update messages beside the upstream version ("Cognify IDE 0.2.0, based on Code - OSS 1.146.0").
- **Mechanism:** the updater keeps comparing commits, so it doesn't depend on version order.
- **Cost:** this needs a small, recorded edit to the About dialog and update notifications (`UPSTREAM_BASELINE.md`).

## Release outputs (done in S6-12)

`scripts/cognify/release-manifest.mts` (logic in `build/cognify/releaseManifest.ts`, tested in `build/cognify/test/releaseManifest.test.ts`) runs in each job of `Cognify (package)` and writes, next to the packages:

| File | Contents |
|---|---|
| `<package>.sha256` | `<sha256>  <file name>`, so `sha256sum -c` (Linux) or `Get-FileHash` (Windows) can verify a download. |
| `SHA256SUMS-<platform>.txt` | Every package of that platform, one line each. |
| `update-<platform>.json` | The `IUpdate` record for the update package (the user setup on Windows, the archive on Linux): commit, product version, timestamp, SHA-256, file name, and, when the workflow's `release_tag` input is set, the release download URL. |

## Backlog

| ID | Item | Pri |
|---|---|---|
| U-01 | Windows signing in the package workflow (U-D1), including the native modules and the setup. | P0 |
| U-02 | The update server (U-D2, U-D3) with tests for 204, 200 and unknown platforms. | P0 |
| U-03 | Release mode for `Cognify (package)`: a tag input, `quality: stable`, and a draft GitHub Release with every package, checksum and update record. | P0 |
| U-04 | `updateUrl` and `quality` in `product.json`; the identity manifest updated; `--disable-updates` stays in the test launches. | P0 |
| U-05 | Linux `.deb` and `.rpm` in the package workflow, and a signed apt/dnf repository (U-D4). | P1 |
| U-06 | The Cognify version number (U-D5). | P1 |
| U-07 | An end-to-end update test: install release N, publish N+1 to a test channel, and check that Windows updates and Linux sees it. | P0 |
| U-08 | Docs: install and update guide, KNOWN_LIMITATIONS updated, a release runbook. | P1 |

## Decisions needed

| # | Decision | Proposed |
|---|---|---|
| U-D1 | Windows signing route | Azure Trusted Signing, after identity validation of Theoretical Minds Technology. |
| U-D2 | Update server host | A Cloudflare Worker. |
| U-D3 | Domain | A Cognify domain the owner controls, for example `update.<domain>`; the `workers.dev` address works until then. |
| U-D4 | Linux packaging | `.deb` and `.rpm` with an apt/dnf repository first; Flatpak or Snap later if users ask. |
| U-D5 | Version number | `cognifyVersion` beside the upstream version, starting at 0.2.0. |
| U-D6 | Channels | `stable` only at first; an `insider` channel later for pre-releases. |

## Risks

| Risk | Mitigation |
|---|---|
| A bad release reaches everyone automatically | Draft releases checked by the owner before publishing; unpublishing halts it; the end-to-end test (U-07); a staged rollout later. |
| A compromised build or signing identity | Signing from CI through a federated identity (no key file); pinned actions; the packaged-build checks; the update server serves only published releases. |
| SmartScreen still warns on new signed releases | Expected until reputation builds; documented. |
| Upstream changes the update protocol | It has been stable for years; the server is small and tested; imports are checked against `updateService.*.ts`. |
