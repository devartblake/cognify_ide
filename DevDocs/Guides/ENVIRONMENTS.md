# Environments

A Cognify project builds, tests and runs in one of two places. You choose when you create it, and `.cognify/project.json` records the choice.

- **This machine:** the project uses the tools installed here. **Cognify: Check Environment** shows what's installed.
- **Dev Container:** the project uses a container that has its tools. You still edit the files on this machine; only the commands run in the container. This needs Docker.

## Check your tools

**Cognify: Check Environment** looks for Git, Node.js, npm, pnpm, Python, pip, uv, the .NET SDK, Flutter, Dart and Docker, and shows each version. For each template, it shows whether this machine can build it, and whether it can run in a Dev Container. It only runs each tool's version command, with a short timeout, and never runs anything from your workspace.

### Fix a missing or outdated tool

Pick the tool, or a template that needs one, in **Check Environment**. Cognify shows:

- **Open in Terminal:** types the install command into a new terminal. It doesn't run it: check the command, then press Enter.
- **Copy Command:** copies the install command.
- **Open the Install Page:** the tool's official install instructions.
- **Use a Dev Container Instead:** when Docker is running, create the project with a Dev Container, which comes with the tools.
- **Re-check:** look for the tools again after you install one.

The commands use winget on Windows, Homebrew on macOS, and apt on Debian and Ubuntu. Where no single command fits most machines, for example Node.js on Linux, Cognify links to the official instructions instead. **Cognify never installs anything itself.**

## Dev Containers

Cognify runs Dev Containers with the open-source Dev Container CLI that ships with Cognify IDE. You don't need any extension.

**What you need:** Docker. On Windows and macOS, that's Docker Desktop, and it must be running. On Linux, Docker Engine, with your user allowed to run `docker`.

**Commands:**

| Command | What it does |
|---|---|
| **Cognify: Start Environment** | Creates the container, or starts the existing one. The first start downloads the image and installs the project's dependencies, which can take a few minutes (Flutter's image takes the longest). |
| **Cognify: Run in Environment...** | Runs the project's install, build, test or run command. For a Dev Container project it starts the container if needed, then runs the command inside it. |
| **Cognify: Stop Environment** | Stops the project's container. Its state is kept for the next start. |
| **Cognify: Rebuild Environment** | Removes the container and creates it again from the preset, for example after you change `.devcontainer/`. |

The project's commands are also tasks: **Terminal > Run Task > cognify** lists `install`, `build`, `test` and `run`. Closing a task's terminal stops the command.

**Ports:** when the app runs in the container, its port is published on `localhost` only (8000 for FastAPI, 3000 for Next.js, 5000 for ASP.NET Core, 8080 for Flutter), so open `http://localhost:<port>` in your browser.

These commands only work in a trusted workspace.

## Troubleshooting

| Problem | What to do |
|---|---|
| **Check Environment says Docker is "Installed, but not running"** | Start Docker Desktop, or on Linux run `sudo systemctl start docker`, then **Re-check**. |
| **"Dev Containers need Docker running"** | Install Docker (Check Environment shows how), or build on this machine instead. |
| **The first start fails while downloading the image** | Cognify retries once when the download fails with a network error. If it fails again, check your connection or proxy, then run **Start Environment** again. |
| **A command fails in the container after you changed `.devcontainer/`** | Run **Cognify: Rebuild Environment**. |
| **A tool is installed, but Check Environment doesn't find it** | Make sure it's on your `PATH`, restart Cognify IDE so it picks up the new `PATH`, then **Re-check**. |
| **The app runs in the container, but the browser can't reach it** | The app must listen on `0.0.0.0` inside the container; the templates' run commands do. Use the port from the table above. |
| **The tasks don't appear** | They need `.cognify/project.json` at the root of an open folder, and a trusted workspace. |
