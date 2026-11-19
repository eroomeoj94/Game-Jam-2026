# Moth Fight Club build plan

Updated 17 November 2026. Initial review: 13 November against `MOTH_FIGHT_CLUB.md`.
Demo: Friday 27 November, afternoon. User availability: 15–25 hours for direction, playtesting, and demo preparation; AI handles implementation.
Status: weapon playground implemented on a 250 × 134 desk with seven lamps and four moths per team: Wing Gust, Bosh, Zap Switch (bug zapper), Bottle-Cap Flick and Firecracker, with aiming, charging, effects and sound. The turn/scoring loop is next. Recommendations below are provisional until playtested.

## Progress at 16 November

- [x] Project setup: TypeScript, Vite, Three.js, cannon-es, pinned dependencies, formatting, and test/build commands.
- [x] 3D bedroom desk, book platforms, two modelled felt-style moths, warm lighting, and shadows.
- [x] Physical swinging lamp, halo preview, camera orbit/zoom, camera reset, and scene reset.
- [x] Camera-relative walking, analog speed, grounded hopping, limited flutter, and landing refill.
- [x] Moth selection by click, buttons, keyboard, or controller; active-moth ring and flutter meter.
- [x] PS5 standard-mapped controls, stick dead zones, button-edge handling, and disconnect/focus-loss cleanup.
- [x] Playground fall detection and automatic recovery to a clear starting slot.
- [x] Stepped walking and flutter poses, independent of smooth physics and camera movement.
- [x] Automated validation: 30 passing tests across five files, TypeScript, formatting, and production build.
- [ ] Physical DualSense playtest and movement tuning.
- [x] **Weapon playground (17 November):** free play with a short cooldown. Hold to aim along the camera (and charge), release to fire; Q/E or D-pad to change weapon. Aim previews, projectile models, effects, `world.useWeapon`, and 27 weapon tests.
  - [x] Wing Gust: cone push on moths, swings lamps overhead.
  - [x] Bosh: big close-range punch on the nearest moth, with thump, spoken "Bosh!" (or `public/sounds/bosh.mp3`), pop-up and screen shake; mute with M.
  - [x] Zap Switch: flips the targeted lamp into a bug zapper; zapped moths cost their team a point, char, tumble and drop back in at a random spot.
  - [x] Bottle-Cap Flick and Firecracker: charged projectiles; ricochet knockback and fused radial blast.
  - [ ] Physical playtest of feel and tuning; limit to one action per turn once turns exist.
- [ ] Movement allowance per turn, handover, scoring, victory, and full match restart.
- [x] **Multiple lamps (16 November):** three lamps over the centre, left and right of the enlarged desk, each with its own light zone. Scoring rule decided 17 November (below).
- [ ] **Core loop (agreed 17 November; see `MOTH_FIGHT_CLUB.md` §3–5):**
  - [ ] Rounds: each team takes one turn per round; pick a moth, move, choose a weapon, fire or pass, resolve, hand over.
  - [ ] Scoring at the end of each round: one point per warm lamp to the team with the majority of moth centres in its light; ties, empty lights and zappers score nothing.
  - [ ] Lamp states: warm lamp and bug zapper, with distinct glow, halo and sound.
  - [ ] Zap Switch weapon: inverts a lamp for one round, two uses per team per match; zaps everyone already in its light.
  - [ ] Zapping: any moth centre inside a zapper's light is zapped; team loses one point; moth sits out the next round.
  - [ ] Zap launch comedy: freeze-frame flash, charred fur and smoke, tumbling flight, cartoon landing, puff back in at a random spot, "ZAPPED! −1" pop-up.
  - [ ] Weapon selection UI and controls (keyboard and PS5), aim along the camera, charge where relevant.
  - [ ] Score HUD showing each lamp's state and who holds it, with text/icons as well as colour.
  - [ ] Rule tests: majority, ties, zapper scoring nothing, zap penalty, resting moths, round order, victory.
- [x] **Larger teams and desk (17 November):** four moths per team (keys 1–8), desk enlarged to 250 × 134 (20× the area) with seven lamps, clusters of perches under each, seeded scatter between them, and faster walking. Only the three lamps nearest the camera cast shadows. Still to decide: how many moths move per turn.
- [ ] **Performance check:** about 1,000 meshes plus three shadow passes on the large desk; merge static scenery if the M1 check is slow.
- [x] **Moths visible in board view (17 November):** team-coloured numbered pins above each moth in the board view; the active moth's pin is larger, a zapped moth's turns violet, and clicking a pin selects that moth.
- [ ] **Later — bigger lamp nudge/swing (playtest 16 November):** lamp movement is hard to see from the board view at the new scale. Increase nudge strength (and later gust force on the lamp) so swings read clearly.
- [ ] Additional moths/gadgets, solo opponent, sound, hosting, and release checks.

The movement portion of phase 2 is complete. A complete one-versus-one match is
still pending. Current free walking, landing refill, and automatic respawns are
playground rules; the proposed match rules below have not yet been implemented.
Controller tests use simulated input, and the application tests replace the GPU
renderer. They do not establish actual DualSense compatibility, visual behaviour,
or M1 performance. The build succeeds with Vite's existing bundle-size warning.

## Recommendation

Build the smallest complete version of the lamp-control game first. Preserve the moving light, readable knockback, felt characters, and a dependable match/restart loop. Target the full original core with AI implementing it: two moths per team, Wing Gust, Bottle-Cap Launcher, Firecracker, felt visuals, sound, and a basic bot.

The earlier 20-hour implementation budget confused AI implementation effort with the user's available time. It is superseded. Keep the milestone sequence and protect 25–26 November for playtesting, browser checks, fixes, and rehearsal; measure scope against working builds and feedback rather than those hour estimates.

One moth per team, Wing Gust, one arena, felt artwork, and local multiplayer remain the fallback if the full core is not reliable or fun in time. Decoy Glow, loose props, and additional arenas remain stretch work; online play stays out of scope.

## Review findings

The concept is coherent: one physical object is both a tactical target and the objective. Health-free falls keep the rules small, and the handmade look can be achieved with a few strong poses. The original document also correctly separates stepped character animation from physics. The user has since requested true 3D presentation: use modelled felt-style moths in a miniature bedroom, with full 3D physics.

The important gaps are behavioural, not additional features:

- **Scoring needs a predictable snapshot.** A lamp that never settles cannot determine the turn length. Players need to see the exact halo state that will be used for the next score check.
- **Aiming and waiting currently have ambiguous effects.** If physics runs while a player thinks, waiting becomes an unmetered way to move the lamp. Movement allowance alone does not solve this.
- **Two moths can create permanent contests.** A spare moth parked in the halo may remove useful choices. Prove one-versus-one first, then test whether a second moth improves it.
- **The halo must intersect useful terrain.** A technically correct pendulum can still spend most of its time beyond reach. Design the platforms, tether length, and halo radius together.
- **A returning moth needs a legal spawn.** Specify what happens when its perch is occupied, rather than spawning overlapping bodies.
- **A bot has a movement problem before it has an aiming problem.** A small set of authored routes between platforms is safer than expecting “move towards the halo” to navigate gaps.
- **The original cut list does not protect enough time.** Cutting already-optional stretch ideas will not rescue a late core. Projectile count, team size, and solo mode need explicit cut points.

## Rules to prototype first

Keep the document's first-to-three scoring, centre-based halo membership, score-before-respawn order, and one gadget action per turn. Use the following defaults to close the implementation gaps; numeric values are tuning seeds.

1. **Turn order:** score the incoming team once; end immediately if it wins; otherwise respawn its fallen moths, select, move, aim, resolve, and hand over. A team scores only on its own incoming turn. Show “hold until your next turn” in the instructions.
2. **Paused planning:** selection, aiming, and handover freeze the entire simulation, including velocities and projectile timers. Preserve velocity for the next simulation phase. Rendering and UI continue.
3. **Movement:** propose one short movement window, initially four seconds of simulation after the first movement input. The window advances even if the player stops pressing keys; allow finishing early. Hop and limited flutter share a visible flight reserve. This is a deliberate change from a purely distance/energy allowance: it prevents unlimited waiting for a favourable lamp swing. There is no timer while selecting or aiming. If players find this stressful, revisit the movement model before adding gadgets.
4. **Aim transition:** finishing movement disables movement input and lets bodies settle briefly, with a hard cap, before freezing the aim state. Midair aiming at that cap is allowed initially; check whether it feels understandable. No movement after committing to aim. Lock the selected moth once movement starts.
5. **Action resolution:** initially simulate a fixed two-second interval after gust or pass, then freeze and score from that state. This replaces the proposed settle-or-timeout rule for the first experiment so shot timing has a consistent consequence. Show a short resolving indicator. Later, shorten quiet intervals only if doing so does not make lamp scoring unpredictable. Projectiles must expire or detonate within the resolution policy; introduce that policy with the projectile, not afterwards.
6. **Falls:** crossing the arena bounds removes the moth immediately from physics, selection, and scoring. If the active moth falls during movement, skip its gadget and resolve the turn. At respawn, choose the first clear position from a small authored set on its team's perch; if none is clear, keep it fallen until its next turn and show why. Make perch geometry spacious enough that this is exceptional.
7. **Halo feedback:** use the same distance calculation for scoring and the visible membership indicator, including the exact edge. Distinguish empty, controlled, and contested states with text/icons as well as colour. The decorative glow can be softer than the precise scoring ring.
8. **Pass and restart:** pass still advances the resolution interval. Restart constructs a fresh match, clearing bodies, timers, input, selection, effects, and scores.

Watch for indefinite contests, first-player advantage, and winning by parking a moth. Fix terrain, reach, gust strength, and halo size before adding a new victory rule. Test opening turns with both sides starting first.

## Technical approach

Use TypeScript, Three.js, cannon-es, and Vite. Use ordinary HTML/CSS for the start screen, score, instructions, and buttons. Three.js renders a perspective miniature bedroom with modelled moths, procedural felt, and warm shadow-casting light. The arena uses X/Z for the desk and Y for height. The camera resizes with the viewport, and pointer selection uses raycasting. Movement is relative to the camera; mouse drag and the controller's right stick orbit the scene. Playtest that mapping before finalising the match camera.

The repository was empty at review time. Setup now includes Node v22.22.0 in `.nvmrc`, TypeScript, Vite, Three.js, cannon-es, Vitest, and Prettier with exact direct dependency versions and an npm lockfile. See `package.json` for installed versions and commands. The source design is preserved in `MOTH_FIGHT_CLUB.md`.

Modules implemented so far and the next planned additions:

- `application.ts`: implemented; owns lifecycle, fixed-step timing, input wiring, selection, HUD updates, and cleanup.
- `game/match.ts`: planned; will own match state, legal commands, phase transitions, scoring, respawn ordering, and victory. The caller will submit commands and receive a view of the match plus events such as scored, hit, and won.
- `game/world.ts`: owns cannon-es bodies, the tether, collision/ground checks, bounds, simulation stepping, and spatial queries. Physics engine objects stay inside this module; other modules use moth IDs and positions. Restart replaces the world cleanly.
- `game/gadgets.ts`: planned; implement gust first, then projectile behaviour. Keep force calculation and targeting rules here so the UI and bot do not duplicate them.
- `view/scene.ts`: renders the match and plays visual reactions. It does not award points or move physics bodies. Character pose changes run at about 10 Hz while aiming and rendering remain smooth.
- `input/player.ts` and `input/gamepad.ts`: implemented; translate keyboard and standard gamepad input into movement commands, with held-input cleanup. `input/bot.ts` is planned and must obey the same match budgets when added.
- `config.ts`: holds the small set of tunable movement, force, halo, scoring, and timing values. Keep arena geometry and spawn/route positions together in an arena definition.

Use one application loop, with fixed physics steps initially at 60 Hz. Do not start an independent physics loop. Clamp accumulated time, cap catch-up work, and discard stale accumulated time when returning from a hidden tab. Clear held controls on focus loss. Start with simple collision shapes and upright moth bodies; animated artwork can tumble without making locomotion unstable.

No general game engine, entity framework, level editor, or elaborate dependency abstraction is needed. Extract more modules only when actual behaviour calls for them.

Technical references:

- [Three.js documentation](https://threejs.org/docs/) for the 3D renderer, camera, materials, and lights.
- [Vite setup requirements](https://vite.dev/guide/) for supported Node minimums.
- [cannon-es](https://github.com/pmndrs/cannon-es) for 3D bodies, collisions, and the lamp distance constraint.

## Build sequence

These dates are milestone targets, not guarantees. AI builds and verifies the implementation; the user reviews playable builds and decides what feels right. When a milestone slips, remove later scope before consuming the release window.

### 1. Setup and physics experiment — 13–15 November

Setup complete: dependencies, scripts, strict TypeScript, starter rendering, tethered lamp, reset, and physics tests. Movement, hop/flutter, selection, flight feedback, and playground respawns are now implemented. Debug gust, hosting, and physical-controller/browser playtesting remain.

- [x] Create the Vite/TypeScript application with Three.js, cannon-es, type checking, and tests.
- [x] Build the desk, two reachable book platforms, two moth models, hanging bulb, and halo preview.
- [x] Implement movement, grounded hop, limited flutter, and debug lamp nudge.
- [ ] Add Wing Gust; the debug lamp nudge is not an attack.
- [x] Produce a local production bundle.
- [ ] Select a static host and publish a test build.

**Exit:** both moths can reach the halo, the lamp swings when pushed, and the movement feels controllable. If the physics is unreliable, simplify shapes, speeds, and terrain before continuing.

### 2. Complete one-versus-one match — 16–18 November

- [x] Complete the movement foundation, input controls, selection, flight feedback, and playground recovery.
- [ ] Implement the phase sequence, movement allowance, and pause/resolution policy.
- [ ] Add Wing Gust aiming and knockback, plus pass.
- [ ] Add halo membership, contested scoring, victory, and match restart.
- [ ] Change playground recovery to score-before-respawn at the start of the relevant team's turn.
- [ ] Add rule tests for turns, scoring, legal actions, and victory.
- [ ] Publish the complete greybox and have someone play without coaching.

**Exit:** two people can complete and restart a match, explain the point awards, and deliberately use the moving lamp. Record match duration and one satisfying or funny moment. If this gate has not passed by 18 November, drop projectile and second-moth work.

### 3. Make it recognisably Moth Fight Club — 19–21 November

Partly started ahead of schedule: modelled moths with team colours and markings,
procedural felt/wood, the bedroom set, lighting/shadows, active selection, and
stepped idle/walk/flutter poses are implemented. Final visual polish, additional
reactions, sound effects, and mute remain pending.

- Choose the final gameplay size of a moth before making detailed assets.
- Make one reusable felt moth with team palettes, distinct markings, and a small pose set; reuse its parts for both teams.
- Add one bedroom background, book/platform artwork aligned to collision shapes, lamp art, and a warm glow.
- Add concise instructions, clear active selection, two or three sound effects, and mute. Log asset provenance.

**Exit:** players can distinguish teams and halo membership at laptop size, and the handmade character reads during play. Reduce pose count before compromising readability.

### 4. Give solo visitors someone to play — 21–23 November

- Use authored platform waypoints and simple movement recipes.
- Prefer denying an imminent point, otherwise approach a useful halo position; gust a useful nearby target, otherwise pass.
- Add a progress timeout so a stuck bot ends its turn. Prefer reliability over clever shots.

**Exit:** a person can finish a match against the bot without intervention. If this is not reliable before the feature freeze, remove solo mode from the release and clearly label local two-player play.

### 5. Complete the core roster and gadgets — 22–24 November

- First add two moths per team, selection feedback, distinct respawn slots, and tests for single-point team scoring. Keep one-versus-one if contests become static or selection is confusing.
- Then add Bottle-Cap Launcher with bounded speed, lifetime, and modest ricochets. Verify collisions at its maximum allowed speed and clean up the projectile before handover.
- Add Firecracker using the same projectile lifecycle, with a short simulation-time fuse and radial knockback that affects both teams and the lamp.
- Keep the aiming preview short; it should indicate initial direction, not promise a landing point.

**Exit:** the extra moths and gadgets create useful choices without confusing scoring or delaying handover. These are part of the target build, but cut Firecracker first, then Bottle-Cap Launcher and second moths if needed to protect a reliable release. Feature freeze remains 25 November.

### 6. Release and rehearse — 24–26 November

- Run a fresh-player playtest and fix the biggest comprehension or control issue.
- Check the busiest action on an actual M1 Mac, Chrome and Safari, and a laptop trackpad.
- Check hosted production assets, sound unlock, mute, resize, focus loss, background-tab return, and repeated restart.
- Freeze features on 25 November. Prepare a reliable lamp-swing demonstration, rehearse the five-minute slot, and capture a short backup recording.
- On 27 November, check the shared link and demo machine; avoid feature changes.

**Exit:** a newcomer completes a match, the hosted link works, and the presentation fits five minutes. The final share page states whether the build supports solo or local two-player play.

## Verification worth spending time on

Automate the rules that can silently make a match unfair:

- Empty halo and contested halo award nothing; only the incoming team can score.
- Two friendly moths award one point, not two; fallen moths never count.
- Exact halo-edge membership matches the UI; scoring happens once per incoming turn.
- Scoring precedes respawning; reaching three ends the match before further actions.
- Wrong-team, wrong-phase, and duplicate action commands are rejected.
- A continuously swinging lamp cannot block handover; paused phases advance neither physics nor gadget timers.
- Falling during movement, blocked respawn, and restart produce valid states.

Use real cannon-es simulation in a few small checks for gust knockback, the lamp tether, projectile cleanup if added, and removal of out-of-bounds bodies. Assert useful outcomes with tolerances, rather than exact trajectories. Tests cannot establish fun, readable motion, trackpad usability, or actual M1 performance: those require play.

## 3D presentation decision — 13 November

The flat 2D starter did not match the user's intended feel. Replaced PixiJS and
Matter.js with Three.js and cannon-es, including true 3D pendulum motion, a
perspective camera with orbit controls, modelled moths, procedural felt and wood,
a bedroom desk set, warm lighting, and shadows. The source brief is the linked
Classic Game Adaptations for Jam conversation; its handmade stop-motion direction
remains, while its proposed 2D implementation is superseded.

The movement playground now includes camera-relative desk movement, grounded
jump/flutter, moth selection, and fall bounds. Full match rules remain pending.

## Movement milestone — 16 November

- Implemented camera-relative keyboard and standard-mapped PS5 input: left stick
  moves, Cross hops/holds flutter, L1/R1 selects, right stick orbits, Triangle
  resets the view. Keyboard/mouse alternatives remain available.
- Added grounded contact checks, normalized diagonal speed, analog walking,
  limited airborne flutter, landing refill, and clear-spawn fall recovery.
- Added active-moth feedback, a flutter meter, and stepped walk/flutter poses.
- The playground permits free walking and returns fallen moths automatically.
  Match-phase movement allowances and next-turn respawns remain separate work.
- Code tests cover book landings, collisions, fall recovery, energy exhaustion,
  keyboard/gamepad wiring, controller drift/disconnection, and input cleanup.
  A real DualSense and gameplay feel still need hands-on testing.

## Immediate next work

Playtest the movement playground with the PS5 controller. Then implement Wing Gust and the complete one-versus-one match, including the proposed movement window, fixed resolution, scoring, and next-turn respawn rules. Test whether lamp control feels fair and deliberate before adding more gadgets.
