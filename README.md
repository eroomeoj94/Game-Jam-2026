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

## The game

Two teams of four felt moths fight over six swinging lamps on a bedroom desk:
three over the desk, two over box lids in the back corners and one on top of a
book tower. The giants cannot reach the high ones.
Play one player against the computer or two players on one keyboard.

- On your turn each of your moths has one go: move, then one action (Wing Gust,
  Bosh, Zap Switch, Bottle-Cap Flick or Firecracker) or a dance.
- When you finish, your rival banks a point for every lamp where they still
  have more moths in the light, so a lamp only pays if it survives the reply.
- Each round one lamp, pulsing and starred on the scoreboard, pays double. A
  lamp that pays the same team twice running burns out for a round.
- A moth knocked off the desk misses its next round, then drops back in.
- A Zap Switch turns a lamp into a bug zapper; each moth caught in it costs its
  team a point and sits out a round.
- Each round a giant hand hangs over the busiest lamp and swats it after both
  teams have played. A firecracker or a Bosh that lands draws it elsewhere.
- First to ten wins.

Until you press a start button, two computers play a demo match behind the
title. Add `?playground` to the address for free play with every weapon, and
`?tune` to show the tuning panel during a match.

## Controls

- **Keyboard:** WASD or arrows move; Space hops and, held, flutters; 1–8 pick a
  moth; hold F to aim and charge, release to fire; Q / E change weapon; P dances
  and ends the go; V switches to the board view; H shows the controls; M mutes.
- **Mouse:** click a moth to pick it; drag to orbit; scroll to zoom.
- **PS5 controller:** left stick moves; Cross hops / flutters; L1 / R1 pick a
  moth; R2 or Square aims and fires; D-pad left / right changes weapon; Circle
  dances; right stick orbits; Triangle switches view. Controller support is
  tested with simulated input only, not yet with a real DualSense.

The game pauses while the window is not focused.

## The moth model

The moths are a wooden figure generated with Artlist's 3D tool, loaded from
`public/models/artlist/moth.glb`. If the file is missing the game draws its
built-in felt moths. The game cuts the wings, arms and legs away from the body
when it loads the model, so they can flap and swing.

The weapons are models too (`public/models/artlist/weapon-*.glb`), generated
with Meshy v7 in Artlist from the weapon icons and shrunk to about 0.6 MB each.
The moth whose go it is holds the selected weapon in its right hand, and
wears the boxing gloves one on each hand; without the files its hands stay
empty. The bottle cap and firecracker that fly are models as well
(`projectile-*.glb`), with plain shapes as the fallback.

The three giants are wooden figures as well (`giant-0.glb` to `giant-2.glb`),
each at its own height. They arrive as one solid piece, so the game cuts their
arms and legs away at load: the legs swing as they walk and an arm swings up
from the shoulder and stretches to smack the desk. Without the files the felt
giants are drawn instead.

## Mind Control

Each team has one Mind Control a match: a barrel ray gun (`weapon-mind.glb`)
that takes over a giant. Hold fire to aim: the view lifts to the whole desk,
the movement keys steer a purple target, and the weapon keys pick which giant
does it. Let go and that giant, glowing purple, slams the spot, replacing any
hand already hanging over the desk. Its own moths are flung too if they are
under it.

## Sound

The licensed Artlist sound files are not in this repository (see
`public/sounds/README.md`). Without them the game plays synthesised effects and
no music.

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
a URL subdirectory. Nothing publishes it automatically.

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
    movement.test.ts   Walking, collision, jump, flutter, and fall recovery
  input/
    player.ts         Keyboard controls and focus-safe input cleanup
    gamepad.ts        Standard gamepad mapping, dead zone, and button edges
    gamepad.test.ts   Controller mapping, drift, reconnect, and held controls
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
- Keyboard selection, camera-relative movement wiring, flutter meter updates,
  pointer selection versus dragging, and held-input cleanup.
- Controller movement/jump driving real physics, disconnection, shoulder-button
  selection, and camera-reset wiring.
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

The page now opens on a full match: rounds, turns, lamp scoring, zappers and
victory (rules in `src/game/match.ts`, values in `MATCH` in `src/config.ts`).
Add `?playground` to the address for the free-play weapon playground.

Next: playtest a match with two people and a PS5 controller, then tune move
time, match length and scoring before adding anything new.
