# Moth Fight Club build plan

Reviewed 13 November 2026 against the supplied `MOTH_FIGHT_CLUB.md`.
Demo: Friday 27 November, afternoon. User availability: 15–25 hours for direction, playtesting, and demo preparation; AI handles implementation.
Status: project setup and 3D starter physics scene implemented; playable greybox is next. Recommendations below are provisional until playtested.

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

Use TypeScript, Three.js, cannon-es, and Vite. Use ordinary HTML/CSS for the start screen, score, instructions, and buttons. Three.js renders a perspective miniature bedroom with modelled moths, procedural felt, and warm shadow-casting light. The arena uses X/Z for the desk and Y for height. Resize the camera with the viewport; future aiming should raycast into the scene. Camera orbit is available in the scene study; settle the gameplay camera and movement mapping in the greybox.

The repository was empty at review time. Setup now includes Node v22.22.0 in `.nvmrc`, TypeScript, Vite, Three.js, cannon-es, Vitest, and Prettier with exact direct dependency versions and an npm lockfile. See `package.json` for installed versions and commands. The source design is preserved in `MOTH_FIGHT_CLUB.md`.

Start with a few modules whose interfaces hide the complicated rules:

- `game/match.ts`: owns match state, legal commands, phase transitions, scoring, respawn ordering, and victory. The caller submits commands and receives a view of the match plus events such as scored, hit, and won.
- `game/world.ts`: owns cannon-es bodies, the tether, collision/ground checks, bounds, simulation stepping, and spatial queries. Physics engine objects stay inside this module; other modules use moth IDs and positions. Restart replaces the world cleanly.
- `game/gadgets.ts`: implements gust first, then projectile behaviour if time permits. Keep force calculation and targeting rules here so the UI and bot do not duplicate them.
- `view/scene.ts`: renders the match and plays visual reactions. It does not award points or move physics bodies. Character pose changes run at about 10 Hz while aiming and rendering remain smooth.
- `input/player.ts`, later `input/bot.ts`: produce the same legal match commands. The bot must obey the same movement and action budgets.
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

Setup complete: dependencies, scripts, strict TypeScript, starter rendering, tethered lamp, reset, and physics tests. Movement, hop/flutter, debug gust, hosting, and browser playtesting remain for this milestone.

- Create the minimal Vite/TypeScript application; install Three.js and cannon-es, type checking, and a small test runner for game rules.
- Draw a desk, two reachable platforms, two moth shapes, a hanging bulb, and its scoring ring.
- Implement basic movement, grounded hop, limited flutter, and a debug gust.
- Build the production bundle. Select a static host and publish a blank/greybox build as soon as practical; retain a local production build for the demo backup.

**Exit:** both moths can reach the halo, the lamp swings when pushed, and the movement feels controllable. If the physics is unreliable, simplify shapes, speeds, and terrain before continuing.

### 2. Complete one-versus-one match — 16–18 November

- Implement the phase sequence and the proposed pause/resolution policy.
- Add gust aiming, pass, scoring feedback, falls, respawns, victory, and restart.
- Add the essential rule tests and a few physics integration checks described below.
- Publish this complete greybox and have someone play without coaching.

**Exit:** two people can complete and restart a match, explain the point awards, and deliberately use the moving lamp. Record match duration and one satisfying or funny moment. If this gate has not passed by 18 November, drop projectile and second-moth work.

### 3. Make it recognisably Moth Fight Club — 19–21 November

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

The next playable prototype must define camera-relative desk movement, grounded
jump/flutter, 3D gust aiming, spherical halo membership, and fall bounds. Full
match rules are still pending; the current scene is a visual/physics study.

## Immediate next work

Implement milestone 1, then continue directly into the complete one-versus-one match. The first major decision is whether the bounded movement and fixed resolution windows make lamp control feel fair and deliberate. Settle that with the greybox before spending time on additional gadgets or final artwork.
