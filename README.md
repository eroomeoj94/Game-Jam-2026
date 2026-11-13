# Moth Fight Club

A browser game about handmade moths fighting over a swinging light bulb.
Built for the **A light in the dark** game jam, with a demo on 27 November 2026.

## Run locally

Use Node **22.22.0** (recorded in `.nvmrc`) and npm. If you use nvm, run `nvm use` first.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`.
Stop the server with Ctrl+C. No credentials, backend, or environment variables are needed.

## Current state

The starter is now a full 3D miniature bedroom: a wooden desk, book platforms,
handmade-style moth models with stitched wings and boxing gloves, and a swinging
bulb that casts warm light and shadows. Drag to rotate the camera, scroll to zoom,
and use **Reset view** to return to the opening camera. **Nudge the lamp** tests
the physical pendulum in both horizontal axes; **Reset scene** recreates the world.
The desk ring is a preview of the proposed spherical halo at desk height; scoring
is not implemented. Decorative mug, pencil, and spool are visual props only.

This is a setup experiment, not a playable match yet. Movement, turns, scoring,
gadgets, final artwork, audio, and the computer opponent are still to come.

## Commands

- `npm run dev` — start the local development server with hot reload.
- `npm run typecheck` — check TypeScript without generating files.
- `npm test` — run all physics and application tests once.
- `npm run test:smoke` — run the high-level application and physics smoke tests.
- `npm run test:watch` — rerun tests while editing.
- `npm run build` — type-check and produce the static game in `dist/`.
- `npm run preview` — serve the existing production build locally.
- `npm run format` — format source and configuration files.
- `npm run check` — check formatting, run tests, type-check, and build.

The production build uses relative asset paths so it can also be hosted beneath
a URL subdirectory. Hosting has not been configured or deployed yet.

## Project layout

```text
src/
  config.ts           Arena geometry and simulation constants
  main.ts             Browser entry point and startup error message
  application.ts      Application lifecycle, fixed-step loop, setup controls
  application.smoke.test.ts  App startup, controls, reset, clock, and cleanup checks
  game/
    world.ts          cannon-es 3D physics behind a small interface
    world.test.ts     Real-physics checks for tether, terrain, and fresh worlds
    world.smoke.test.ts  Ten simulated minutes of repeated lamp nudges
  view/
    scene.ts          Three.js room, lighting, camera, and rendering
    moth.ts           Modelled puppets and stepped pose animation
    materials.ts      Original procedural felt and wood textures
  style.css           Page layout and HTML controls
```

Three.js handles rendering; cannon-es handles full 3D physics. Coordinates use
Y for height and X/Z for the desk plane. One application loop advances physics
at fixed 60 Hz, caps catch-up after slow frames, and discards stale time after a
hidden tab. Character poses update at 10 Hz independently of camera and physics.

The canvas resizes to its container. Pixel ratio is capped at 1.5 and only the
bulb's spotlight casts shadows, using a 1024px map. The fibre details are instanced
geometry. These are performance precautions, not an M1 benchmark.

All models and textures are generated locally by the code; there are no downloaded
art assets, fonts, or sounds. Procedural felt is an initial material treatment,
with final character polish still to come.

## Smoke tests

Run `npm run test:smoke` before sharing a build. It covers:

- Startup using the shipped HTML, enabled controls, and one animation loop.
- 100 cycles of ten nudges followed by reset, checking the fresh state each time.
- A one-minute frame gap, capped so the game cannot try to simulate the whole gap.
- Hidden-tab pause/resume without a physics or animation jump.
- Camera-reset wiring and repeated teardown/remount without duplicate handlers.
- A missing-control failure before scene resources or an animation loop are created.
- Ten simulated minutes of repeated nudges, checking finite positions, the lamp
  tether, and moths remaining supported by the desk.

Application tests use Happy DOM and a controlled animation clock. They run the
real application and cannon-es physics, replacing only the GPU-facing scene with
a test double. They cannot verify shaders, WebGL context recovery, visual camera
movement, resizing, GPU resource leaks, or actual M1 performance. Browser and
playtest checks remain necessary for those. All smoke tests also run in `npm test`
and `npm run check`.

## Design and next step

See [the original design](MOTH_FIGHT_CLUB.md) and [the build plan](BUILD_PLAN.md).
AI handles implementation; the user's 15–25 hours are for direction, playtesting,
and demo preparation. The presentation has changed to 3D following the original thread and user feedback.
The target remains the full core described in the design,
with scope cuts available if testing or stability requires them.

Next: add controllable movement, hop/flutter, and Wing Gust, then complete a
one-versus-one match before expanding the roster and gadgets.
