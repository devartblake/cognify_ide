# Known Limitations

What Cognify IDE doesn't do yet, or does differently from what you might expect, in the MVP (`cognify-v0.1.0`). Each item says why and what's planned. Sprint 6 completes this list for the release (S6-10, [`DevDocs/Sprints/SPRINT_6_MVP_CERTIFICATION.md`](DevDocs/Sprints/SPRINT_6_MVP_CERTIFICATION.md)).

## Installing

- **The Windows installer isn't code-signed.** Windows SmartScreen warns when you run it; choose **More info → Run anyway**. Signing and automatic updates are planned for v1.5 (Sprint 6 decision D2).
- **Windows x64 is the only certified platform.** A Linux x64 archive is built and checked in CI. macOS isn't built yet: it needs signing and notarization to be usable (D3).

## Signing in and AI

- **The GitHub sign-in page says "Authorize Visual Studio Code", not Cognify IDE.** Cognify's GitHub sign-in uses the same GitHub OAuth app as VS Code, so GitHub shows that app's name. It stays that way for the MVP because GitHub Copilot, which Cognify's AI features use, accepts sign-ins only from apps GitHub has approved, and a Cognify-registered app very likely wouldn't be. After the MVP: register a "Cognify IDE" OAuth app and test whether Copilot accepts it; then either apply to GitHub for Copilot access or offer AI through Cognify's other model providers (OpenAI, Gemini, Anthropic, Ollama) with a Cognify sign-in. The owner chose this on 2026-11-06 (option A).
- **AI chat needs a GitHub Copilot sign-in.** Cognify's roles (`@cognify /review`, `/explain`, `/guide`, `/fix`) use Copilot's models. Until you sign in through Chat, a new profile keeps the built-in Copilot extension turned off (upstream's behavior), and **Cognify: Check AI Setup** says what's missing. The Copilot chat panel shows Copilot's own name and look.
- **Chat says "1 customization needs an update to keep working. Review Migrations".** The customization is Cognify's own `@cognify`: VS Code has deprecated extension chat participants and flags each one. `@cognify` keeps working; close the notice with **×**, and don't remove or replace `@cognify`, since Cognify's roles (`/review`, `/explain`, `/guide`, `/fix`) run through it. Moving `@cognify` to the newer mechanisms is planned after the MVP ([`COGNIFY_CHAT_PARTICIPANT_MIGRATION.md`](DevDocs/Architecture/COGNIFY_CHAT_PARTICIPANT_MIGRATION.md)).

## Projects, Run and Preview

- **Flutter projects target the web only.** The Flutter template builds and runs a Flutter web app; mobile and desktop targets aren't set up.
- **The preview doesn't reload by itself.** After you save, FastAPI and ASP.NET Core restart or hot-reload the app and Next.js reloads its page, but the preview tab needs a refresh (**Ctrl+R**). Flutter's web server needs a restart. See [Run and preview](DevDocs/Guides/RUN_AND_PREVIEW.md).
- **In Restricted Mode** (a folder you haven't trusted), Cognify doesn't offer Run or the project's tasks, and Project Cognition reads only manifests and workflows. Trust the folder to use them.
- **No cloud workspaces or deployment.** Projects run on your machine or in a local Dev Container (Docker Desktop). Cloud workspaces and publishing are v1.5 candidates.

## Product

- **English only.** Cognify's own text is in English; translations aren't shipped.
- **It looks like VS Code.** Cognify uses upstream's default theme and layout. A Cognify visual identity (theme, icons, start page and a few workbench changes) is planned for after the MVP: [`DevDocs/Sprints/SPRINT_7_VISUAL_IDENTITY.md`](DevDocs/Sprints/SPRINT_7_VISUAL_IDENTITY.md).
- **Some dependencies inherited from VS Code have published security advisories** (1 critical, 10 high, at the certified upstream commit). Each is triaged, with where it's used and Cognify's assessment of the exposure, in [`DevDocs/Quality/DEPENDENCY_ADVISORIES.md`](DevDocs/Quality/DEPENDENCY_ADVISORIES.md). They're fixed by taking upstream's updates (decision D7).
