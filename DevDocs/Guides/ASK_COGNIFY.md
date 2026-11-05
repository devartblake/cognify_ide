# Ask Cognify

Cognify's chat roles help while you work. They are for beginners and everyone else: use as much or as little as you like. They need a GitHub Copilot sign-in (see **Cognify: Check AI Setup**).

## Explain

Ask what code or an error means.

- Right-click in the editor and choose **Explain with Cognify**: it explains the selection, the current line, or the error under the cursor.
- Or ask in Chat: `@cognify /explain what is a closure?`, with code selected or attached with `#`.

## Guide Me

Get small, numbered steps toward something you want to do.

- `@cognify /guide add a page that lists users`, or **Cognify: Guide Me...** from the Command Palette.
- Cognify uses what it knows about your project, such as how it runs and tests, and says where to click and what to type.
- It shows commands for you to run. It never runs them itself.
- If your goal isn't clear, it asks one question first.

## Fix It

Have an error explained and a fix proposed.

- On an error in the editor, open the light bulb (or press `Ctrl+.`, `Cmd+.` on macOS) and choose **Fix with Cognify**. Cognify attaches the code around the error.
- When a project command such as `test` fails, Cognify offers **Fix with Cognify**. Paste the error from the terminal into the message it starts.
- Or ask in Chat: `@cognify /fix` followed by the problem.

Cognify explains the error in a sentence or two, then proposes the smallest change as a code block. **You decide:** apply it with Chat's **Apply** button, or not. Cognify never changes your files or runs commands by itself.

## Privacy

Every request goes through Cognify's router, which follows your privacy settings (`cognify.privacy.localOnly`, `cognify.privacy.confidentialWorkspace`) and records which model answered and why: run **Cognify: Show AI Routing Log** to see it. Guide Me and Fix It include what Cognify knows about the project's build, run and test commands, never your files' contents unless you attach or select them.
