# Run and Preview

Run a Cognify project and see the app inside the editor, on this machine or in its Dev Container.

## Run the project

- **Cognify: Run Project** from the Command Palette, **▶ Run** in the status bar, or the play button in the editor title.
- Cognify starts the project's `run` command, waits until the app answers on its port, then opens it in a browser tab beside your code.
- The status bar then shows the port, for example **🌐 :8000**. Click it to bring the preview back. Click **Stop** (the square beside it) to end the app.
- Running again while the app runs just reopens the preview.

| Template | Port | Updates after a change |
|---|---|---|
| FastAPI | 8000 | The server restarts on save (`--reload`); refresh the preview (Ctrl+R, Cmd+R on macOS). |
| Next.js | 3000 | Automatic: the dev server reloads the page. |
| ASP.NET Core | 5000 | `dotnet watch` applies changes on save, restarting the app when it must; refresh the preview. |
| Flutter (web) | 8080 | Restart the app; the first build takes a while. |

## On this machine or in the Dev Container

The project runs where you chose when you created it (see [Environments](ENVIRONMENTS.md)). In a Dev Container, Cognify starts the container first if needed. The app's port is published on `localhost` only, so the preview works the same way. **Stop** ends the app but leaves the container running; **Cognify: Stop Environment** stops the container.

## Where the preview opens

In the desktop app, the preview is VS Code's integrated browser, in a tab beside the editor. Where it isn't available, Cognify uses Simple Browser, and as a last resort your system browser.

## When something goes wrong

| What you see | What to do |
|---|---|
| **"Port … is already in use"** | Another app is using the port. Stop it (or choose **Open What Is Running** to see what it is), then run again. |
| **"… didn't answer on port … yet"** | The app may still be starting: the first run installs or compiles things. Wait, then choose **Open Preview Anyway**. If it keeps failing, look at the terminal for errors, or choose **Check Environment**. |
| **"… stopped before it was ready"** | The app crashed while starting. The terminal shows why. Select the error and ask **Fix with Cognify**, or `@cognify /fix` with the error pasted. |
| **The preview shows an old page** | Refresh it (Ctrl+R, Cmd+R on macOS). For Flutter, stop and run the app again after a change. |
| **No ▶ Run in the status bar** | Run needs `.cognify/project.json` at the root of an open folder, which New Project creates, and a trusted workspace. |
