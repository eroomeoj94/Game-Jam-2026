# Moth Fight Club build plan

Updated 19 November 2026. Initial review: 13 November against `MOTH_FIGHT_CLUB.md`.
Demo: Friday 27 November, afternoon. User availability: 15–25 hours for direction, playtesting, and demo preparation; AI handles implementation.
Status (19 November): a full match is playable in code — rounds, one moth and one action per turn, a timed move, majority scoring per lamp, round-based zappers, resting moths, victory and restart — on the 250 × 134 desk with seven lamps and four moths per team. The free-play weapon playground is still available with `?playground`. Nobody has playtested the match yet; that is next. Recommendations below are provisional until playtested.

## Where we left off (19 November)

Read this first when picking the project up in a new session.

**State of the build.** The page opens on a start screen, then a full hot-seat match. `npm run check` passes (102 tests, type check, formatting, production build). `npm run dev` runs it; add `?playground` for free play.

**How a match works now.**

- Mustard plays, then Teal, every round. On a team's turn each of its moths on the desk has one go, in any order: move for as long as you like, then one action (hold F to aim, release to fire) or a dance (P), which ends that go.
- Scoring (changed 20 November): when a team finishes its turn, the other team banks a point for every warm lamp where it still has more moths in the light. A lamp only pays if it survives the rival's reply. First to ten with the lead wins, checked when both teams have banked equally often (after Teal banks). The old rule, every lamp scoring at the end of the round, is still there as `MATCH.scoring = 'round'` and in the tuning panel.
- Bot playtests (20 November, scripted bots on the real rules and physics): under the old rule the team playing second won 15 of 20 matches between identical bots; under the new rule identical bots split 11–9 and 12–18, and a bot that avoids the hand beat one that ignores it from either seat. Matches last about five rounds.
- Each banked lamp shows a +1 and chimes; a win plays a fanfare and the winners dance until New match.
- Zap Switch (two per team) flips a lamp within 10 units into a bug zapper for the rest of that turn and the next one; each zapped moth costs its team a point and sits out the next round.
- Three giant people pace round the desk's three open sides whenever the world is running. In a match, at the start of each round the nearest one hangs a hand over the busiest lamp (the middle of the crowd under the warm lamp with the most moths); it comes down after both teams have played, just before scoring. A firecracker going off or a Bosh that lands draws the hanging hand to that spot instead, or summons one if none is hanging. Free play (`?playground`) keeps random smacks. Anyone between the camera and the desk turns see-through. A shadow and a blinking ring warn for 1.6 seconds; any moth still inside the ring when the hand lands is flung outwards, and nearby lamps swing. Hands favour the lamps' light. (This replaced the wind-up mouse on 19 November.)
- The desk is 90 × 48 with seven lamps and four moths per team.

**Where things live.** Rules: `src/game/match.ts`. Physics, weapons, dance and the giant hands: `src/game/world.ts` (models: `src/view/people.ts`, `src/view/hand.ts`; numbers: `HAZARD` and `PEOPLE`). Wiring, HUD and input: `src/application.ts`. Every tunable number: `src/config.ts` (`MATCH`, `BOARD_SCALE`, `HAZARD`, `BOSH`, `ZAP`, `DANCE`, `MOTH_LOOK`, `AUDIO`). Sounds and their Artlist sources: `public/sounds/README.md` (the audio files themselves are git-ignored).

**Not yet seen or heard by anyone.** One browser playtest was done before the last four batches of changes. Everything after it is covered by tests only and needs a look and a listen:

- the start screen and the narrower HUD (the active moth should sit right of centre, clear of the panel);
- the brighter board view;
- the giant hands in a real match: how often they land, whether 1.6 seconds is fair warning, and how they sound (seen once in the browser, not yet played against);
- how crowded the 90 × 48 desk feels now the props cleared for the mouse's track are back;
- the five dance routines;
- the louder, layered Bosh (check for distortion) and the background music level.

**Open questions for playtesting.** Teal always plays last, so Teal gets the final say on who is under the hand and where a noise drags it; watch whether that is too strong. Dancing does not count as noise (it would punish every pass). With no move limit a player can wait for a lamp to swing or for a hand to clear a lamp; bring back `MATCH.moveSeconds` if that is abused. Bosh now launches moths far enough to leave the small desk often. First to ten may be too short or too long now that every moth moves each turn.

**Not built.** Solo opponent, hosting. The demo is Friday 27 November.

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
- [x] Movement allowance per turn, handover, scoring, victory, and full match restart (19 November).
- [x] **Multiple lamps (16 November):** three lamps over the centre, left and right of the enlarged desk, each with its own light zone. Scoring rule decided 17 November (below).
- [x] **Core loop (19 November; `game/match.ts`, rules tunable in `MATCH` and the tuning panel):**
  - [x] Rounds: each team takes one turn per round; the first turn alternates each round. Pick one moth, move for up to six seconds, then one action or a pass.
  - [x] The world is frozen while planning, aiming and showing the score; it runs during movement and for 2.5 seconds of resolution (longer while projectiles or zapped moths are in flight, capped at six seconds).
  - [x] Scoring at the end of each round: one point per warm lamp to the team with the majority of moth centres in its light; ties, empty lights and zappers score nothing. First to ten with the lead wins.
  - [x] Zap Switch: two per team per match; the zapper stays live for the two turns after it is flipped. A zapped moth costs its team a point (scores can go negative).
  - [x] A zapped or fallen moth sits out the next full round, then drops back in at the start of its team's turn.
  - [x] Score HUD: score line, a chip per lamp (team icon, `=` tied, `·` empty, `⚡` zapper), move meter, turn banner, Pass (P / Circle) and New match.
  - [x] Rule tests: turn order, legal actions, majority, ties, zappers, zap penalty, resting moths and victory, plus three end-to-end match smoke tests.
  - [x] Playtest feedback (19 November): no move limit by default (`MATCH.moveSeconds = 0`; a turn's move ends when the player aims or passes), desk halved to 125 × 67 (`BOARD_SCALE` in `config.ts`), and brighter self-lit moths with a team-coloured ring under each.
  - [x] Playtest feedback (19 November): a team's turn now gives every one of its moths on the desk one go (a move and an action, in any order) before play passes across, so a rival cannot immediately undo a single move. Passing is a dance (five routines), and background music replaces the bare cricket ambience.
  - [x] Browser playtest fixes (19 November): narrow HUD with the control hints behind a Controls (H) toggle and the moth framed right of centre; teams always play in the same order; tuning panel starts collapsed; Zap Switch needs the lamp within 14 units and a zapper lasts one further turn; moths start just outside a lamp's light, spread around the desk; title and rules moved to a start screen; brighter board view; a "Paused" notice when the window loses focus; a go ends as soon as everything is still (0.8 s minimum).
  - [x] Giant hands (19 November): the wind-up mouse below is gone; huge felt hands on sleeved arms slam the desk at random instead (`HAZARD` in `config.ts`, 'Giant hands' in the tuning panel).
  - [x] Smaller desk and a moving hazard (19 November, mouse since replaced): desk reduced to 90 × 48 (`BOARD_SCALE` 0.36). A wind-up mouse runs an oval track through the light of every outer lamp whenever the world is running, and boots any moth standing on the desk in its path (moths perched on props are safe). A gust, Bosh or firecracker landing beside it startles it into reversing at speed.
  - [ ] Playtest: move time, match length, first-to-ten, the two-in-a-row turn at each round change, and whether one moth per turn is enough.
  - [ ] Not built yet: scoring chime, win celebration, and a solo opponent.
- [x] **Larger teams and desk (17 November):** four moths per team (keys 1–8), desk enlarged to 250 × 134 (20× the area) with seven lamps, clusters of perches under each, seeded scatter between them, and faster walking. Only the three lamps nearest the camera cast shadows. Every moth in the team has a go each turn (19 November).
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
