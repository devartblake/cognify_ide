# Create a Project

Cognify IDE creates new projects from four built-in templates. Each one is a small, working app with a test, a README, and a Dev Container, using current releases of its framework.

## The templates

| Template | What you get | To build on your machine | Test | Run (port) |
|---|---|---|---|---|
| **FastAPI** | A Python web API with a health endpoint, tested with pytest and the FastAPI test client. | Python 3.10+ and pip | `pytest` | `uvicorn app.main:app --reload` (8000) |
| **Next.js** | A Next.js 16 and React 19 app in TypeScript, with a unit test that runs on Node's built-in test runner. | Node.js 20.9+ and npm | `npm test` | `npm run dev` (3000) |
| **ASP.NET Core** | A .NET 10 minimal API with an xUnit v3 test project. | .NET 10 SDK | `dotnet test` | `dotnet watch run --project src/<Name>` (5000) |
| **Flutter (web)** | A Flutter app for the web, with a widget test. Other Flutter targets aren't supported yet. | Flutter 3.24+ | `flutter test` | `flutter run -d web-server` (8080) |

You don't need these tools on your machine if Docker is installed: the project can build and run in its Dev Container instead (see [Environments](ENVIRONMENTS.md)).

## Create one

1. Run **Cognify: New Project...** from the Command Palette. You can also click **New Project** in the Explorer of an empty window, or in the **Get Started with Cognify IDE** walkthrough.
2. **Choose a template.** Each one says whether this machine is ready for it, or what it still needs.
3. **Name the project.** The name must start with a letter, and can use letters, digits, spaces, dots, dashes and underscores. The folder and the package names are derived from it: `My App` becomes the folder `my-app`, the C# project `MyApp`, and the Dart package `my_app`.
4. **Choose where to create it.** Cognify creates the project folder inside the folder you pick. It never writes into a folder that already has files.
5. **Choose where it builds and runs.** This question appears only when Docker is running.
   - **This Machine:** use the tools installed here.
   - **Dev Container:** use a container that has the tools. Recommended when this machine lacks some of them.
6. Cognify creates the files and opens the folder. If you chose this machine and a tool is still missing, it tells you which one first.

Cancelling at any step writes nothing.

## What's in the project

- The template's source code, a test, a `.gitignore`, and a README that explains how to build, test and run it, both in the Dev Container and on your machine.
- `.devcontainer/`: the Dev Container preset. It is written whichever environment you choose, so you can switch later.
- `.cognify/project.json`: which template the project came from, where it builds and runs, and its install, build, test and run commands. Cognify's tasks and its AI read this file. Commit it with the project.

## Next steps

- **Run it** and see it beside your code: **▶ Run** in the status bar (see [Run and preview](RUN_AND_PREVIEW.md)).
- Run the project's other commands with **Terminal > Run Task > cognify**, or with **Cognify: Run in Environment...** (see [Environments](ENVIRONMENTS.md)).
- **Ask Cognify** about it: `@cognify /guide` and `@cognify /fix` know how the project builds, runs and tests (see [Ask Cognify](ASK_COGNIFY.md)).
