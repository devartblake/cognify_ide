# Cognify Pet: Design Note

- **Status:** Proposed (2026-11-04). Not part of the MVP: under the roadmap's schedule control rule it doesn't validate the product thesis or remove a blocker. It is a **v1.5 candidate**, preceded by an optional spike.
- **Owner input needed:** the avatar files and their format, a name, and the answers in "Open questions".
- **Related:** [`REBRANDING_PLAN.md`](../Governance/REBRANDING_PLAN.md) (decision D2 and R-05, which turned the VS Code pet off), [`REVISED_MVP_ROADMAP.md`](../Roadmap/REVISED_MVP_ROADMAP.md) ("Post-MVP backlog").

## Context

Upstream Code OSS has a chat "pet": **Blobby, the VS Code pet**. It's an optional pixel-art mascot that sits above the chat input.
- **You can play with it:** drag and throw it, bounce it, or make it hop with the keyboard.
- **It reacts to the agent:** it types, paints during image generation, claps for confirmations and sleeps when idle.
- **It has extras:** achievements, hats, color variants, and a jump game in the Agents window.

Because it uses Microsoft's mascot art, R-05 hid every way to turn it on. One constant gates them all: `CHAT_PET_AVAILABLE = false` in `chatPetService.ts`. The code is otherwise intact.

The owner wants a **Cognify pet** built from Cognify's own avatars, possibly in **3D** (three.js) or with a richer 2D renderer (PixiJS, Rive) than upstream's sprite sheets.

## Goals
- A Cognify character with the same role as Blobby: an optional, playful companion that reacts to what the agent is doing.
- **Rendered with a modern engine,** chosen to fit the avatar format: three.js for 3D models, Rive or PixiJS for 2D.
- **Cheap upstream syncs:** reuse upstream's pet plumbing, and keep Cognify's renderer in Cognify-owned files.
- **Accessibility and performance at least as good as upstream's:** one semantic button, reduced motion, no cost while hidden or off.

## Non-goals
- Shipping Microsoft's Blobby art.
- Full parity with Blobby's interactions in the first version (for example the jump game, the 40-plus states, hats).
- Drawing the pet from an extension. Extensions can't render into the chat input area.

## How upstream's pet is built

The pet is layered, and only the top layer knows how it is drawn.

```text
ChatPetService (chatPetService.ts, 610 lines)
  Enablement, persistence, achievements, color, size, position. Knows nothing about drawing.
        │
ChatPetWidgetService + ChatPetWidgetCoordinator (chatPetWidgetService.ts)
  Which window and which chat input host the pet. Moves it between hosts and windows.
  Creates the pet through ONE factory:
      host => instantiationService.createInstance(ChatPetWidget, host, undefined)
        │
        ▼  IChatPetWidgetInstance { setHost(host); dispose(); jumpGame? }
ChatPetWidget (chatPetWidget.ts, 4,021 lines)    ◄── the only part that draws
  Sprite sheets (22 states × Stable/Insiders, 96×96 frames), a DOM eye overlay,
  physics, drag and throw, gaze, reactions, the jump game.
```

Every pet gets an **`IChatPetWidgetHost`** with:
- `parent`, the element to render into;
- `dragBounds` and `movementBounds`;
- `model`, an observable of the live `IChatModel`, used to react to requests, tool calls and image generation;
- `hasInput` and `inputChanged`;
- the platform geometry for landing: `getPlatformTop`, `getPlatforms` and `onDidChangePlatform`;
- `transition` (`fall` or `teleport`), for moving between hosts.

## Proposed architecture

**Keep the service and the coordinator. Replace only the widget.**

1. **A new Cognify-owned widget,** `CognifyPetWidget`, implementing `IChatPetWidgetInstance`:
   - **Proposed location:** `src/vs/workbench/contrib/cognifyPet/browser/`. A Cognify folder, so upstream syncs never touch it.
   - **Responsibilities:** it owns a canvas inside `host.parent`, a **renderer adapter**, and a small **behavior state machine** driven by `host.model` and pointer and keyboard input.
2. **A renderer adapter,** so the engine is swappable and a spike can compare engines:

   ```ts
   interface ICognifyPetRenderer extends IDisposable {
   	load(canvas: HTMLCanvasElement): Promise<void>;   // lazy-loads the engine and assets
   	setState(state: CognifyPetState): void;             // idle | working | typing | celebrate | sleep | …
   	setFacing(direction: -1 | 1): void;
   	lookAt(x: number, y: number): void;                 // gaze, where the model supports it
   	resize(width: number, height: number, devicePixelRatio: number): void;
   	setPaused(paused: boolean): void;                   // hidden, asleep or reduced motion
   }
   ```

   Implementations: `ThreeJsPetRenderer` (glTF), `RivePetRenderer` (a `.riv` state machine) or `PixiPetRenderer`. One ships; the others exist only for the spike if needed.
3. **The upstream hooks.** Each is narrow, marked `Cognify`, and recorded in `UPSTREAM_BASELINE.md`:
   - **The factory line** in `ChatPetWidgetService` creates `CognifyPetWidget` instead of `ChatPetWidget`.
   - **`CHAT_PET_AVAILABLE`** becomes `true`, so the existing entry points (`/vscode-pet`, `/blobby`, the Agents-window "Pet" item) work again. A Cognify slash command (for example `/pet`) could replace them.
   - **The pet's 45 user-visible strings** move from `K-inactive` back to rename or reword. They are renamed through the R-02 NLS table (character name, "the Cognify pet"), so no source edit is needed.
4. **Reused unchanged:**
   - **`ChatPetService`:** enablement, storage, position, size and achievements, for the parts we keep.
   - **The coordinator:** one pet per window, following the focused chat.
   - **The host contract.**

### Renderer options

The choice depends on the avatar format. A flat 2D image can't become a convincing 3D character.

| Avatar format | Renderer | How states work | Notes |
|---|---|---|---|
| **3D model**, glTF 2.0 / GLB, rigged, with animation clips | **three.js** (MIT) | One clip per state. `AnimationMixer` cross-fades between them, and a head or eye bone turns toward the cursor. | Mixamo can rig humanoid models and supply clips. Budget: GLB ≤ 1.5 MB, ≤ 15k triangles, textures ≤ 1024² (KTX2 if needed). |
| **2D illustrations**, animated | **Rive** (runtime MIT) | A Rive state machine with inputs (`isWorking`, `isTyping`, `isSleeping`, `poke`). Designers own the animation; code only sets inputs. | The best quality for the effort with 2D art. The runtime is WASM: the desktop content security policy already allows it, but the web build needs checking. |
| **2D images** with effects | **PixiJS** (MIT), optionally with Spine | Sprites, filters, particles, squash and stretch in code. | Lighter than three.js, and a step up from DOM sprites. |

**Recommendation:** decide once the avatar format is known. **three.js** if Cognify has, or will commission, 3D models. **Rive** for 2D character art.

### Behavior scope

| State | Trigger | v1 | Later |
|---|---|---|---|
| idle (breathe, blink, look around) | no activity | ✅ | |
| look at cursor | pointer near the pet | ✅ (3D: head turn) | |
| working | a request is running (`host.model`) | ✅ | |
| typing | a response is streaming | ✅ | |
| celebrate | a request succeeded | ✅ | |
| worry | a request failed or was cancelled | ✅ | |
| needs you (wave or clap) | a confirmation or approval is pending (bounded, as upstream) | ✅ | |
| sleep, then wake | idle for N minutes; wakes on interaction | ✅ | |
| drag and drop, landing on the input | pointer drag; `getPlatformTop` | ✅ | throw physics, bounces |
| painting | image generation | | ✅ |
| dizzy, splat, respawn | rapid facing, fall past the input | | ✅ |
| achievements, hats, colors | `ChatPetService` | (unchanged achievements only) | Cognify accessories |
| jump game | Agents window | | maybe never |

## Cross-cutting requirements
- **Performance:**
  - Render only while the pet is visible.
  - Cap at 30 fps while idle and 60 fps while animating, and stop the render loop while asleep or while the document is hidden.
  - Use one WebGL context per window, and dispose GPU resources when the pet is turned off or moves away.
  - Target under 2% CPU while idle.
- **Startup:** load nothing at launch. Load the engine with `importAMDNodeModule` (the KaTeX and xterm-addon precedent), and load assets on first enable.
- **Accessibility:** keep upstream's contract. The pet is one semantic button, and the canvas is `aria-hidden`. Keyboard actions match pointer ones. Reduced motion shows a still pose and keeps the state changes. Accessibility help describes the Cognify pet.
- **Security and privacy:**
  - Assets ship with the product, loaded through `FileAccess`. Nothing is fetched remotely.
  - No telemetry. Cognify sends none.
  - The pet reads only coarse chat state (running, failed, waiting for confirmation), never message content.
- **Dependencies:**
  - Add the chosen engine to `package.json` and `ThirdPartyNotices`.
  - Verify its ESM or AMD loading in both the dev (`out/`) and packaged builds, and the web build's content security policy.
  - Pin exact versions.
- **Upstream sync:**
  - Cognify's widget lives in Cognify-owned files.
  - The hooks are the factory line and the constant.
  - If upstream changes `IChatPetWidgetHost` or `IChatPetWidgetInstance`, the type check fails at our widget. That is the signal to adapt.
- **Tests:**
  - Unit tests for the behavior state machine: chat-model signals in, states out.
  - A renderer fake, through the adapter, so tests need no WebGL.
  - One integration check that the factory creates the Cognify widget when it's enabled.

## Plan
1. **Spike (2–3 days, optional before v1.5):**
   - Render the avatar in the chat input through the factory seam, with the chosen engine.
   - Switch idle, working and sleep from `host.model`.
   - Measure CPU and GPU while idle, the bundle size and the load time.
   - Exit: a go or no-go and the engine choice, recorded here.
2. **v1 (about one sprint):**
   - Everything marked v1 above.
   - The text renamed through the NLS table.
   - Accessibility, tests and docs.
3. **Later:** throw physics, painting, Cognify accessories, and seasonal or role-specific poses (for example the pet reflecting the active Cognify role: Planner, Coder, Reviewer or Tester).

## Open questions (owner)
1. **Avatars:** what format are they (2D images, illustrations, or 3D models), and where are they? Commit them to `resources/cognify/pet/`. If 3D models don't exist, should Cognify commission them, or go 2D with Rive?
2. **Name:** what is the character's name? It replaces "Blobby" and "the VS Code pet".
3. **Achievements:** keep upstream's achievements (the names are reworded), or drop them in v1?
4. **Default:** should the pet stay off by default, like upstream's, or be suggested during onboarding (Sprint 5)?

## Risks
| Risk | Mitigation |
|---|---|
| GPU or battery cost of an always-on canvas | Pause rules and frame caps (above); measure in the spike. |
| Bundle size (three.js is about 600 KB minified) | Lazy-load on enable; tree-shake to the modules used. |
| Upstream reworks the pet interfaces | Cognify's widget is small and typed against them, so the type check flags the break. Keep the sprite widget as a fallback. |
| Asset production is the real bottleneck | Start with 3 or 4 states, and let the renderer adapter map missing states to the nearest one. |
