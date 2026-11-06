# Inherited Dependency Advisories

- **Sprint 6, S6-05 and decision D7** ([`SPRINT_6_MVP_CERTIFICATION.md`](../Sprints/SPRINT_6_MVP_CERTIFICATION.md)). Recorded 2026-11-05 on the certified upstream commit `37a8101`.
- **What this covers:** `pnpm audit --prod` on the whole product lists 1 critical and 10 high advisories. All of them are in dependencies Cognify inherits from upstream Code - OSS; Cognify's own code and the cognify-ai extension's dependencies have none (the `Cognify (security)` gates).
- **The owner's decision (D7, 2026-11-05):** these don't block the MVP. Each is recorded here with where it is used and Cognify's assessment of the exposure. The fix is to take upstream's dependency updates through the normal import: the owner runs the mirror workflow, and if upstream has updated a package, Cognify imports it as a security-only import, which the release freeze (D6) allows. Cognify doesn't override upstream's versions itself (no `pnpm` overrides): that would diverge from upstream and could break the extensions that use them.
- **Kept current:** the `Cognify (security)` workflow also runs a report-only audit of the whole product (it doesn't fail), so a new advisory shows up in its weekly run and on every pull request.

## Advisories

The assessments are Cognify's reading of how upstream uses each package; they are not upstream's or the package authors'.

| Severity | Package (version) | Advisory | Fixed in | Where Cognify ships it | Exposure (Cognify's assessment) |
|---|---|---|---|---|---|
| Critical | dompurify (3.4.16) | [GHSA-cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7): `SAFE_FOR_TEMPLATES` bypass in shadow-root content with DOM output modes | 3.4.17 | The Markdown extension's notebook renderer (`extensions/markdown-language-features/notebook/index.ts`) | Low. The renderer calls `DOMPurify.sanitize` with string output and without `SAFE_FOR_TEMPLATES`, so the conditions the advisory describes don't apply. |
| High | dompurify (3.4.16) | [GHSA-mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr): `IN_PLACE` with a hook that removes nodes | 3.4.17 | Same | Low. The renderer uses neither `IN_PLACE` nor hooks. |
| High | markdown-it (14.3.2) | [GHSA-gfr2-rv44-r23c](https://github.com/advisories/GHSA-gfr2-rv44-r23c): quadratic-time rendering of a crafted link reference definition | 14.3.3 | The Markdown preview and notebook renderer | Low to moderate. A crafted Markdown file can make the preview slow; it doesn't run code. |
| High | image-size (1.0.2) | [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr): infinite loop on a crafted ICNS image | 2.0.3 | Emmet's **Update Image Size** | Low. Only when the user runs that command on a crafted `.icns` image; it hangs the extension host. |
| High | zod (3.25.76, 4.4.3) | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): memory exhaustion validating oversized constrained collections | 4.6.6 | `@vscode/sandbox-runtime`; `@vscode/web-editors` in the Markdown and Mermaid extensions | Low. The inputs it validates come from the product's own components. |
| High | @azure/msal-node (5.4.0) | [GHSA-xcx6-jx8p-x3h5](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5): authorization code flow may disclose parameters to an attacker-controlled endpoint | 7.1.0 | The Microsoft Authentication extension | Low for the MVP. Cognify's AI features sign in with GitHub (Copilot); this runs only if the user signs in with a Microsoft account. |
| High | undici (7.29.1) | [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx): TLS certificate validation bypass when TLS options are dropped in `Agent` | 7.30.1 | The product's proxy support (`@vscode/proxy-agent`, which the extension host uses for network requests) | Moderate. The most relevant one: it depends on how requests are configured, which is upstream's code. First in line for an upstream fix. |
| High | undici (7.29.1) | [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26): cache poisoning and cross-user disclosure through cross-origin redirects | 7.30.1 | Same | Low. A single-user desktop app. |
| High | undici (7.29.1) | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c): denial of service through excessive content encodings | 7.30.1 | Same | Low to moderate. A malicious server can fail a request. |
| High | undici (7.29.1) | [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm): denial of service through TLS 1.2 renegotiation | 7.30.1 | Same | Low to moderate. Same. |
| High | follow-redirects (1.16.1) | [GHSA-mrwp-f3q8-3g9p](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p): custom credentials can follow redirects | 1.16.2 | `axios` in `@microsoft/dev-tunnels-*` (Remote Tunnels); also the smoke tests, which don't ship | Low for the MVP. Remote Tunnels isn't part of the MVP scenario. |

## Upstream check

| Date | Mirror | Upstream commit | Result |
|---|---|---|---|
| 2026-11-05 | Run #6 | `9b428f8` (114 commits after `37a8101`) | **No change.** Upstream's lockfile has the same versions of all seven packages. None of the 114 commits is a security fix (the only dependency changes are a CodeQL action bump and `@vscode/diff`), so there is nothing to import under the release freeze (D6), and the certified commit stays `37a8101`. |

## Next steps

1. Check again at each mirror run (the owner runs the workflow), and at the go/no-go review. For each package upstream has updated by then, propose a security-only import (D6) and re-run the audit.
2. Whatever remains at the go/no-go review goes into the certification report (S6-11) and `KNOWN_LIMITATIONS.md` (S6-10), with these assessments.
