# Cognify IDE

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="resources/cognify/brand/cognify-banner-dark.png">
    <img alt="Cognify IDE" src="resources/cognify/brand/cognify-wordmark-master.png" width="480">
  </picture>
</p>

Cognify IDE is an AI-native development environment built on the open-source [`Code - OSS`](https://github.com/microsoft/vscode) project (the MIT-licensed foundation of Visual Studio Code). It adds provider-neutral AI orchestration, role-based agents, and repository-aware reasoning ("Project Cognition") on top of the upstream editor, while keeping the downstream changes small enough to keep merging upstream improvements.

> Cognify IDE is an independent project. It is not affiliated with, sponsored by, or endorsed by Microsoft. "Visual Studio Code" and "VS Code" are trademarks of Microsoft Corporation; Cognify does not use Microsoft product branding.

## What Cognify does

- **Create a project** from a template (FastAPI, Next.js, ASP.NET Core, Flutter for the web), with a test, a README and a Dev Container: **Cognify: New Project...**
- **Build and run it** on your machine or in its Dev Container. Cognify checks which tools you have and shows how to install a missing one; it never installs anything itself.
- **Run and preview it** beside your code: **▶ Run** in the status bar.
- **Ask for help** in Chat with role commands: `@cognify /explain`, `/guide`, `/fix` and `/review`. Cognify routes each request to a suitable model, follows your privacy settings, and shows which model answered and why. It proposes changes; it doesn't edit your files or run commands by itself.

## Status

Cognify is in **MVP certification** (Sprint 6): the owner has installed the Windows build, run and previewed a project on the host and in a Dev Container, and used every chat role with a GitHub Copilot sign-in. The first release, `cognify-v0.1.0`, is a pre-release for Windows x64, published after the go/no-go review. Progress: [`SPRINT_6_MVP_CERTIFICATION.md`](DevDocs/Sprints/SPRINT_6_MVP_CERTIFICATION.md). Notable changes: [`CHANGELOG.md`](CHANGELOG.md).

## Install

- **Windows x64:** download the user setup (`CognifyUserSetup-x64-1.146.0-<commit>.exe`; the app's version is that of the Code - OSS it's built on) from the `cognify-v0.1.0` pre-release on the [Releases](https://github.com/devartblake/cognify_ide/releases) page once it is published. Until then, it is an artifact of the `Cognify (package)` workflow's runs. The installer isn't code-signed, so Windows SmartScreen warns: choose **More info**, then **Run anyway**. It installs for your user only, without administrator rights.
- **Linux x64:** the same workflow builds a `.tar.gz` archive. It's checked in CI, but not certified.
- **macOS:** not built yet.

## First steps

1. **Get started.** The first launch opens the **Get Started with Cognify IDE** walkthrough (reopen it from **Help > Welcome**).
2. **Create a project:** [Create a project](DevDocs/Guides/CREATE_A_PROJECT.md), and [Environments](DevDocs/Guides/ENVIRONMENTS.md) for your machine's tools and Dev Containers (Docker Desktop).
3. **Run it:** [Run and preview](DevDocs/Guides/RUN_AND_PREVIEW.md).
4. **Ask Cognify:** sign in to GitHub Copilot through Chat (**Cognify: Check AI Setup** shows what's missing), then see [Ask Cognify](DevDocs/Guides/ASK_COGNIFY.md).

All the user guides are listed in [`DevDocs/Guides/`](DevDocs/Guides/README.md).

## Known limitations

The MVP has limits: an unsigned Windows installer, AI only through a GitHub Copilot sign-in, Flutter for the web only, no automatic preview reload, no cloud workspaces, English only, and upstream's look. Each is explained, with what's planned, in [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Project documents

| Area | Where to look |
|---|---|
| Roadmap | [`DevDocs/Roadmap/REVISED_MVP_ROADMAP.md`](DevDocs/Roadmap/REVISED_MVP_ROADMAP.md) |
| Current sprint | [`DevDocs/Sprints/SPRINT_6_MVP_CERTIFICATION.md`](DevDocs/Sprints/SPRINT_6_MVP_CERTIFICATION.md); next, [`SPRINT_7_VISUAL_IDENTITY.md`](DevDocs/Sprints/SPRINT_7_VISUAL_IDENTITY.md) |
| All development documents | [`DevDocs/README.md`](DevDocs/README.md) |
| AI provider routing | [`extensions/cognify-ai/README.md`](extensions/cognify-ai/README.md), contract in [`DevDocs/Architecture/AI_PROVIDER_ROUTING_CONTRACT.md`](DevDocs/Architecture/AI_PROVIDER_ROUTING_CONTRACT.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Product identity and branding | [`DevDocs/Governance/PRODUCT_IDENTITY_AND_BRANDING.md`](DevDocs/Governance/PRODUCT_IDENTITY_AND_BRANDING.md), artwork in [`resources/cognify/brand/`](resources/cognify/brand/PROVENANCE.md) |
| Upstream sync policy | [`DevDocs/Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`](DevDocs/Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md) |
| CI and security | [`DevDocs/Quality/CI_AND_SECURITY_BASELINE.md`](DevDocs/Quality/CI_AND_SECURITY_BASELINE.md), failure catalogs in [`FAILURE_SCENARIOS.md`](DevDocs/Quality/FAILURE_SCENARIOS.md) |
| Issues | the [issue tracker](https://github.com/devartblake/cognify_ide/issues) |

## Building and Running from Source

Cognify builds the same way as `Code - OSS`. Use the Node.js version in [`.nvmrc`](.nvmrc) and the pnpm version pinned by `packageManager` in `package.json` (`corepack enable` installs it), then:

```bash
pnpm install
pnpm run watch          # incremental build; leave running
./scripts/code.sh      # desktop development build (Windows: .\scripts\code.bat)
./scripts/code-web.sh  # web development build (Windows: .\scripts\code-web.bat)
```

Platform prerequisites (C/C++ toolchain, Python, native-module dependencies) follow the upstream [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites) guide. Windows-specific notes are in [`DevDocs/Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md`](DevDocs/Environment/WINDOWS_BUILD_AND_NATIVE_WATCHDOG.md).

Validation gates used by CI (`Cognify (dev)`; `Cognify (security)` adds CodeQL and a dependency audit, and `Cognify (package)` checks the installable packages with `scripts/cognify/check-package.mts`):

```bash
pnpm run typecheck-client
pnpm run transpile-client && pnpm run test-node
pnpm exec eslint extensions/cognify-ai scripts/cognify build/cognify
(cd extensions/cognify-ai && pnpm run typecheck-test && pnpm test)
xvfb-run -a pnpm -C extensions/cognify-ai run test-shipped-build # Linux; omit xvfb-run on desktops
xvfb-run -a pnpm -C extensions/cognify-ai run test-integration
node scripts/cognify/check-product-identity.mts
node scripts/cognify/check-upstream-baseline.mts
node scripts/cognify/vscode-strings.mts
node scripts/cognify/nls-rebrand.mts
node --test 'build/cognify/test/*.test.ts'
```

## Relationship to Code - OSS

- Cognify tracks `microsoft/vscode` through a read-only mirror branch, `vendor/vscode-main`, updated weekly. Upstream updates are imported through quarantined `vendor/sync-*` branches and validated before reaching `dev`. `main` is Cognify's stable branch: it receives only promotions from `dev`, never Microsoft commits directly. See the [upstream sync policy](DevDocs/Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md).
- Cognify-specific changes are concentrated in documented customization zones (`product.json`, `DevDocs/`, Cognify workflows and scripts, and Cognify-owned extensions or contribution points) so upstream merges stay tractable.
- Bug reports for Cognify behavior belong in this repository's [issue tracker](https://github.com/devartblake/cognify_ide/issues). Issues that reproduce in unmodified `Code - OSS` should be reported upstream.

## Contributing

Work happens on feature branches that merge into `dev`. Pull requests use the Cognify [pull request template](.github/pull_request_template.md) and must pass the `Cognify (dev)` CI workflow. See [CONTRIBUTING.md](CONTRIBUTING.md) and the upstream [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) guide for coding guidelines.

## Code of Conduct

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/) inherited from the upstream repository.

## License

Cognify IDE is distributed under the [MIT](LICENSE.txt) license, the same license as the `Code - OSS` source it is derived from.

Copyright (c) Microsoft Corporation. All rights reserved. Portions copyright (c) Cognify IDE contributors.

Third-party notices are listed in [ThirdPartyNotices.txt](ThirdPartyNotices.txt).
