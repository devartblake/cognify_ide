# Sprint 7: Cognify Visual Identity

- **Status:** Proposed (2026-11-06). Starts after the MVP release (Sprint 6, `cognify-v0.1.0`). Waiting on the owner's brand inputs (S7-01) and decisions D1–D6 below.
- **Duration:** 1–2 weeks, depending on how much workbench change the owner chooses (D4).
- **Why:** the owner wants Cognify to have its own UI and UX, not a VS Code look-alike. The installed MVP launches as Cognify IDE with Cognify icons, but the theme, layout, start page and most of the chrome are upstream's defaults.
- **Inputs:**
  - [`PRODUCT_IDENTITY_AND_BRANDING.md`](../Governance/PRODUCT_IDENTITY_AND_BRANDING.md) and `resources/cognify/brand/` (icon, wordmark, banner);
  - the repository's design guidance: `.github/instructions/design-philosophy.instructions.md` (feelings, principles, moves) and `design-tokens.instructions.md` (the size, spacing and radius ramps);
  - [`UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md`](../Governance/UPSTREAM_SYNC_AND_CUSTOMIZATION_POLICY.md): every edit to upstream files costs effort at each import.

## Sprint Goal

Cognify looks and feels like its own product from the first launch, through its own colours, type, icons, start experience and a few deliberate layout choices, without making upstream imports expensive.

## Starting Point

| Area | Today | Gap |
|---|---|---|
| Identity | Name, icons, installer, publisher (Theoretical Minds Technology), wordmark and banner are Cognify's. | None at this level. |
| Colour and type | Upstream's default theme (Dark Modern) and fonts. | A Cognify colour system and themes. |
| Icons in the UI | Upstream's codicons in the activity bar, views and toolbars. | A Cognify product icon theme, at least for the most visible icons. |
| Layout | Upstream's defaults: activity bar on the left, Chat on the right, panel at the bottom. | Cognify defaults for a beginner-first workflow. |
| Start experience | Upstream's Welcome page with the Cognify walkthrough. | A Cognify start page: New Project, recent projects, Run, Ask Cognify. |
| Chat | Copilot's chat panel and branding; `@cognify` answers inside it. | Cognify styling where Cognify owns the surface. Copilot's own UI stays Copilot's. |

## Key design: change the look in layers, cheapest first

```text
1. Design system     colours, type, spacing, radius, motion, iconography (a spec, no code)
2. Themes            Cognify Dark and Light colour themes, a product icon theme       ← an extension
3. Defaults          default theme, fonts, layout and settings                         ← product settings
4. Start experience  a Cognify start page and walkthrough                              ← an extension
5. Workbench         a few targeted changes to upstream UI, each one decided by the owner ← upstream edits
```

- **Layers 1–4 don't touch upstream code.** Themes and the start page live in Cognify extensions, and defaults are product configuration. They survive imports, and they change most of what a user sees.
- **Layer 5 is the expensive one.** Every change edits upstream files and can conflict at each import. Each one is marked `Cognify`, recorded in `UPSTREAM_BASELINE.md`, and limited by a budget the owner sets (D4).
- **The design system comes first,** so the themes, icons and start page share one language. It uses the repository's design vocabulary: name the feeling, the principle, then the move.

## Backlog

Priorities: **P0** must ship for the sprint goal, **P1** should ship, **P2** stretch.

| ID | Item | Pri | Acceptance |
|---|---|---|---|
| S7-01 | **Brand inputs (owner):** logo variants, brand colours if any, three to five words for how Cognify should feel, and two or three products whose look the owner likes or dislikes. | P0 | Recorded in the design spec. |
| S7-02 | **Design direction:** two or three directions (palette, type, density, shape), each as a short spec with mock-ups of the workbench, start page and chat. The owner picks one (D1). | P0 | `DevDocs/Design/COGNIFY_VISUAL_IDENTITY.md` records the chosen direction. |
| S7-03 | **Design tokens:** the palette for dark, light and high contrast; type scale and fonts; radius, spacing and motion choices within the existing ramps; mapped to VS Code's theme colour keys. | P0 | The token table in the spec; every colour pair used for text meets WCAG AA contrast. |
| S7-04 | **Cognify Dark and Light themes** in a `theme-cognify` built-in extension, and the default theme for new users. High-contrast variants follow from the tokens. | P0 | Shipped and the default; a contrast check passes; screenshots of the main views are recorded. |
| S7-05 | **Product icon theme:** Cognify icons for the activity bar, the most visible view and toolbar icons, and the status bar. The rest fall back to codicons. | P1 | The icon theme is the default; the replaced icons are listed. |
| S7-06 | **Default layout and settings** for a beginner-first workflow (D3): for example where Chat and Explorer sit, what the status bar shows, font family and size. A bundled font must be OFL- or MIT-licensed (D5). | P1 | Defaults set in product configuration; a fresh profile shows them. |
| S7-07 | **Cognify start page:** New Project, open recent, Run, Ask Cognify, and the guides, in Cognify's look. Replaces upstream's Welcome page as the startup editor. | P1 | It opens on first launch and from Help; the first-run walkthrough (S5-11) still works. |
| S7-08 | **Chat styling** where Cognify owns the output: the `@cognify` response footer, role badges, and Check AI Setup. Copilot's own panel and branding are unchanged. | P2 | Screenshots before and after. |
| S7-09 | **Targeted workbench changes** within the budget (D4), for example the title bar and command center, or the activity bar's shape. Each is approved by the owner, marked `Cognify`, and recorded in `UPSTREAM_BASELINE.md` with its expected import cost. | P2 | Each change listed with its approval and files. |
| S7-10 | **Visual checks:** screenshots of the main surfaces in dark, light and high contrast from the packaged build, kept as a reference; accessibility checks for contrast, focus indicators and high contrast. | P0 | Screenshots in the sprint record; no accessibility regression. |
| S7-11 | **Docs:** a short Cognify brand and UI guide (tokens, how to add a themed surface), README screenshots, CHANGELOG. | P1 | Published in `DevDocs/Design/`. |
| S7-12 | **Promotion and package:** promote to `main`, build the packages, and the owner installs and reviews the result. | P0 | The owner signs off on the installed look. |

## Decisions needed

| # | Decision | Proposed | Why it matters |
|---|---|---|---|
| D1 | **Design direction.** | The owner picks one of the directions from S7-02. | Everything else follows from it. |
| D2 | **Where to design.** | Mock-ups in Figma if the owner uses it; otherwise as images and a written spec in `DevDocs/Design/`. | Figma makes review and iteration easier; either works. |
| D3 | **Default layout.** | Keep upstream's layout model, and change only the defaults that serve beginners (decided in S7-02). | Layout changes are cheap as defaults and expensive as code. |
| D4 | **Workbench change budget.** | At most three targeted upstream UI changes this sprint, each approved by the owner. | It keeps upstream imports affordable. |
| D5 | **Fonts.** | Use system fonts, or bundle an OFL-licensed font only if the design needs it. | Licensing, and package size. |
| D6 | **Timing.** | After the MVP release (`cognify-v0.1.0`), as the first post-MVP sprint; released as `cognify-v0.2.0`. | Sprint 6's schedule control rule: no new features before certification. |

## Suggested sequence

| Step | Work |
|---|---|
| 1 | S7-01 brand inputs; S7-02 directions; owner picks (D1). |
| 2 | S7-03 tokens; S7-04 themes; S7-10 contrast checks. |
| 3 | S7-05 icons; S7-06 defaults; S7-07 start page. |
| 4 | S7-09 workbench changes within the budget; S7-08 chat styling. |
| 5 | S7-10 screenshots from the package; S7-11 docs; S7-12 promotion and owner review. |

## Sprint Definition of Done

- [ ] The owner chose a design direction, recorded in the spec (D1).
- [ ] Cognify Dark and Light are the default themes, with WCAG AA contrast (S7-04).
- [ ] A fresh install shows Cognify's themes, defaults and start page (S7-04, S7-06, S7-07).
- [ ] Every upstream UI change is approved, marked `Cognify` and recorded (S7-09).
- [ ] Screenshots and accessibility checks are recorded from the packaged build (S7-10).
- [ ] The owner signs off on the installed look (S7-12).

## Out of scope

- **Copilot's own UI and branding** in its chat panel: it is GitHub's extension and product.
- **The GitHub sign-in page's app name:** that is a GitHub OAuth app question, recorded in [`KNOWN_LIMITATIONS.md`](../../KNOWN_LIMITATIONS.md) with its follow-up.
- **A rewrite of the workbench layout system**, or forking upstream's UI components.
- **The Cognify pet** (a separate post-MVP item in the roadmap).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Upstream changes theme colour keys or UI structure | Themes look wrong after an import; workbench edits conflict | Themes rely on documented colour keys; workbench changes are few, marked and recorded; S7-10's screenshots are compared after each import. |
| Contrast or focus regressions | Accessibility problems | Tokens checked for WCAG AA; high-contrast themes kept; S7-10. |
| Scope grows into a redesign of everything | The sprint doesn't end | The layers and the workbench budget (D4); anything else goes to a later sprint. |
| Extensions' own UI (Copilot, built-ins) doesn't follow the new look | An inconsistent first impression | Themes cover what colour keys can; anything else is listed in the spec as known. |
