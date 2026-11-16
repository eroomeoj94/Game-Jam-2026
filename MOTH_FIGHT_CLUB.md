# Moth Fight Club

Game design and build tracker · Updated 16 November 2026

**Status:** 3D movement playground implemented with keyboard and PS5 controls, selection, grounded hopping, limited flutter, and fall recovery. Full turn/scoring loop pending.

**Direction update, 13 November:** Following review of the first starter, use true 3D moths and a miniature bedroom in Three.js, with cannon-es physics. The handmade felt and stop-motion direction remains. This supersedes the earlier 2D sprite proposal.

**Pitch:** A turn-based physics brawler about handmade felt moths fighting over a swinging light bulb. Think Worms-style mischief on a miniature bedroom set.

**Demo:** Friday 27 November 2026, afternoon. Five minutes to explain and demonstrate the game.

Use this as the working document: check off completed tasks, record playtest findings, and update decisions as the game develops. The rules below are starting proposals, not promises to preserve mechanics that prove unfun.

## 1. The brief

- Theme: **A light in the dark**.
- Playable in a browser and smooth on an M1 Mac.
- AI assistance is allowed; game-jam work must not interfere with normal work or available work-account capacity.
- The game will be shared for colleagues to play afterwards.
- Suggested company stack: PixiJS for 2D, Three.js for 3D.
- Company support: #game-dev.
- Participant admin: add the video-game emoji to the organiser's thread.

## 2. Creative direction

### Agreed direction

- Moths compete for a lamp in a small, turn-based arena.
- Physical knockback, trick shots, and accidental chain reactions provide the comedy.
- Handmade felt characters with a scruffy, tactile puppet appearance, inspired by the feel of the Wombles.
- Stop-motion-style animation on a miniature bedroom set.
- A small, complete game suitable for a first game jam.

### Design principles

1. **The lamp changes the tactics.** Moving the light can be as useful as moving an opponent.
2. **Consequences are funny and readable.** Players should understand why a moth went flying.
3. **Every turn offers a useful choice.** Position, contest, attack, or prepare.
4. **A few polished interactions carry the game.** Expand only after a complete match works.

### The intended feeling

Tiny creatures treat an absurd dispute with complete seriousness. Warm light, fuzzy fabric, cardboard scenery, bead eyes, wire antennae, and overdramatic reactions give the game its personality.

Working names: Dusty, The Big Flap, Mothhew. Final names can wait.

## 3. Proposed match rules

### Arena and teams

- One 3D bedroom desk arena, with an elevated perspective camera showing the battlefield. Camera orbit is available in the scene study; gameplay camera behaviour is still to test.
- Two teams with two moths each. The earliest prototype uses one moth per team.
- A bulb hangs from a single physics constraint and carries a spherical scoring halo. Display its reach clearly on platforms and indicate which moth body centres count; the scene study currently shows its desk-plane cross-section.
- Books and other fixed props create reachable platforms and useful firing positions.
- The lamp remains attached and cannot break. Decorative scenery stays fixed initially.

### Winning

- First team to **three points** wins; tune this after playtesting.
- At the start of a team's turn, that team earns one point if a friendly moth is inside the halo and no enemy moth is inside it.
- Both teams present means contested: no point. An empty halo also gives no point.
- Two friendly moths do not score faster than one.
- Starting positions are outside the halo, so the opening turn awards no point.
- Score using moth body centres and a clear radius. Show a visible indicator when a moth counts as inside.
- Intended match duration: roughly three to five minutes; this is a target to test.

This scoring rule gives the opponent a response before a newly occupied position earns a point.

### Turn sequence

1. Check the incoming team's score and victory condition.
2. Return any of that team's fallen moths to its starting perch.
3. Select one friendly moth. Either moth may be chosen each turn initially.
4. Move using a limited movement/flight allowance.
5. Aim and use one gadget, or pass.
6. Let the physics resolve, then hand over to the other team.

The world pauses during selection and handover. Physics runs during movement and action resolution. After an action, wait for motion to settle, with a maximum resolution time so a swinging lamp cannot stall a match. Pause the resulting state for the next turn. Exact thresholds are implementation details to tune.

### Movement and falls

- Walk, hop, and briefly flutter. Moths cannot fly indefinitely.
- Start with a movement allowance rather than a stressful real-time turn timer.
- A moth that falls off the desk is out until its team's next turn.
- Falling costs position; there are no health bars in the initial design.
- A returning moth cannot produce a surprise point because scoring happens before respawning.

### Starting controls to test

- Click a moth to select it.
- WASD or arrows to move across the desk relative to the camera; 1/2 selects a moth.
- Space to hop; hold briefly for limited flutter.
- PS5: left stick to move, Cross to hop/hold flutter, L1/R1 to select, right stick to orbit, Triangle to reset the view.
- Click a gadget button, aim with the pointer, then drag/release to set shot power where relevant.
- On-screen Pass, Restart, and Mute controls.

Show the available controls on screen. Final bindings depend on the first playtest, including a laptop trackpad check.

## 4. Gadgets

| Gadget | Behaviour | Build priority |
| --- | --- | --- |
| Wing Gust | Short-range cone pushes moths and the lamp. Unlimited use, one action per turn. | First playable |
| Bottle-Cap Launcher | Precise projectile with strong knockback and possible ricochets. | Core build |
| Firecracker | Bouncing projectile with a short fuse and radial knockback. Affects both teams. | Core build |
| Decoy Glow | Temporary lure applies a visible physical pull to nearby moths. It never awards points. | Stretch |

Start with unlimited gadget use while testing their basic behaviour. Add limited charges to powerful gadgets only if playtests show a need; display remaining charges clearly. Decoy duration and strength remain undecided.

Do not add an aiming guide that promises an exact landing position when collisions or lamp movement can change it. A short initial trajectory guide is sufficient.

## 5. What makes the lamp interesting

The halo follows the physical bulb. Players can push an enemy away, swing the bulb towards a teammate, or enter the halo simply to deny a point.

Build the arena around a modest, reachable swing range. The main tuning question is whether moving the lamp creates understandable opportunities without making scoring feel arbitrary.

Example: a firecracker misses its intended target but knocks the bulb towards a waiting teammate, turning a failed attack into a steal.

## 6. Visual and audio direction

### Characters

- Fuzzy felt bodies, layered wings, visible stitches, bead eyes, and wire antennae.
- Mustard/rust and teal/purple are initial team colour ideas.
- Different wing markings and a team icon distinguish teams without relying only on colour.
- Chunky silhouettes and expressive poses matter more than fine detail.
- Use original character designs with the handmade feel of the reference.

### Animation

- Use modelled 3D puppet parts with felt-like materials, visible stitches, and short instanced fibres. Step the wing and body poses while keeping physics and camera smooth.
- Start by changing poses at approximately 10 frames per second; test within an 8–12 range.
- Keep input handling and physics independent of the stepped animation.
- Begin with idle, movement/flutter, attack, hit/tumble, and celebration poses.
- Avoid randomly shaking the whole image. Deliberate holds, pose changes, and small imperfections should create the handmade effect.
- Show smooth, readable aiming and UI even while the characters animate in steps.

### Arena and light

- One background, a desk surface, a few book platforms, and the swinging bulb.
- Warm amber glow against cool, dark surroundings.
- Dim areas remain readable; darkness should not conceal the controls or essential terrain.
- Use warm light from the bulb, cool room fill, and one shadow-casting spotlight. Keep pixel ratio and shadow-map size bounded, and check the result on M1 hardware.
- Choose the moth's on-screen size before generating final assets so fuzzy details survive at gameplay scale.

### Sound

- Small wing flutters, fabric thumps, cork pops, a lamp rattle, and a scoring chime.
- A subtle room ambience can come later.
- Start audio after the player's Start interaction and provide a mute button.
- Keep the source and licence of any downloaded assets in an asset log.

## 7. Scope and completion criteria

### First playable: prove the game loop

- [x] Browser project opens and runs locally.
- [x] A simple desk and platforms support two placeholder moths.
- [x] Movement, collisions, and falling implemented and code-tested; physical-controller feel still needs testing.
- [ ] A hanging bulb can be pushed and its halo follows it.
- [ ] Players alternate turns on the same keyboard.
- [ ] Wing Gust can move the other moth and the lamp.
- [ ] Contested/uncontested scoring is visible and correct.
- [ ] A match ends and can restart without reloading the page.

**Exit test:** Two people can play a complete match with simple shapes and enjoy at least one tactical or funny moment.

### Core jam build

- [ ] Two moths per team and clear active-moth selection.
- [ ] Bottle-Cap Launcher and Firecracker.
- [ ] One balanced arena with accessible routes from both spawns.
- [ ] Felt artwork and stepped character animation.
- [ ] Start screen with a brief explanation and visible controls.
- [ ] Turn indicator, score, halo status, win screen, restart, and mute.
- [ ] Local multiplayer is complete.
- [ ] Simple computer opponent, if core physics and rules are stable in time.
- [ ] A hosted browser build opens from a shared link.
- [ ] Actual M1 Mac performance and laptop controls checked.
- [ ] Five-minute demo rehearsed.

The computer opponent is a priority after local play works because colleagues may open the link alone. If it is cut, explicitly label the game as two-player local play and make the demo use that mode. A first bot can choose a moth, move towards the halo, and gust nearby opponents; it does not need to calculate perfect trick shots.

### Stretch ideas

- [ ] Decoy Glow.
- [ ] A small number of loose props.
- [ ] Additional moth reactions and cosmetic variation.
- [ ] Second arena or a sudden-death rule if playtesting justifies it.

### Deferred beyond this jam

Online multiplayer, accounts, progression systems, destructible terrain, a level editor, full 3D fur, and large gadget collections.

## 8. Tools and beginner essentials

Recommended starting stack; confirm installed versions when creating the project:

| Tool | What it does for this game |
| --- | --- |
| TypeScript | Holds the rules, controls, and game state; catches many mistakes during development. |
| Three.js | Draws the 3D bedroom, moth models, lighting, shadows, and animation. |
| cannon-es | Handles 3D bodies, collisions, knockback, and the lamp constraint. |
| Vite | Runs the local development build and packages files for browser hosting. |
| Node.js and npm | Run the development tools and install project libraries. |
| Git | Keeps recoverable checkpoints of working versions. |

Three.js provides the 3D renderer: [Three.js documentation](https://threejs.org/docs/). Vite provides the development server and production build: [Vite guide](https://vite.dev/guide/). cannon-es supplies the 3D physics: [cannon-es](https://github.com/pmndrs/cannon-es).

Use a currently supported Node.js LTS version compatible with the chosen tooling. Check the current Vite requirements during setup. Pin the installed dependencies with a lockfile once the project works.

### What you personally need to start

- [ ] A project folder/repository and an editor you are comfortable with.
- [ ] Node.js/npm and Git available; the development setup can be checked for you.
- [ ] A browser for development and access to an M1 Mac for testing.
- [ ] A realistic allowance of game-jam sessions around work.
- [ ] A colleague willing to try an early build without coaching.
- [ ] A hosting destination selected before the final day; any suitable static web host can serve the packaged game.

You do not need finished artwork, paid asset packs, a backend, or prior game-engine experience to start. Begin with circles, rectangles, and a lamp on a line.

### Five concepts worth knowing

- **Sprite:** An image used for a character or prop.
- **Physics body:** The simple shape that collides with things; it can differ from the artwork.
- **Game loop:** Repeated updates that advance the simulation and draw the screen.
- **Game state:** Which phase the game is in, such as selecting, moving, resolving, or game over.
- **Playtest:** Watching someone play to learn whether the game is understandable and enjoyable.

## 9. Suggested schedule

This is a sequence of milestones, not an assumption that every day is available. Reduce scope when a milestone slips.

| Dates | Intended result |
| --- | --- |
| 13–15 November | Set up the project; build movement, platforms, and a pushable lamp with placeholder shapes. |
| 16–18 November | Finish turns, scoring, gust, falls, and restart. Play a complete local match. |
| 19–21 November | Add the other core gadgets and second moths. Tune the arena; integrate a first felt character. |
| 22–24 November | Complete the visual treatment and sound. Add a simple bot if the core is stable. Publish a test build. |
| 25–26 November | Test on M1 hardware, fix confusing or broken behaviour, freeze features, rehearse. |
| 27 November | Check the shared link and demo setup; present in the afternoon. |

If the first complete match is late, cut the decoy, loose props, and extra cosmetics first. Keep the moving lamp, clear scoring, handmade appearance, and dependable restart.

## 10. Playtest and technical checks

### Questions for a first-time player

- Can they explain how to win after the opening instructions?
- Can they tell which moth is active and whether the lamp is contested?
- Can they deliberately move towards the lamp and use a gadget?
- Do they understand why a point was awarded?
- Is there an obvious dominant strategy or an unreachable position?
- Does the match produce interesting decisions before it becomes repetitive?
- Do they want to play again?

### Checks before sharing

- [ ] Both teams can score, contest, fall, respawn, and win correctly.
- [ ] An endlessly swinging object cannot prevent a turn ending.
- [ ] A moth outside the arena cannot remain stuck indefinitely.
- [ ] Restart resets scores, turns, gadgets, physics objects, and input.
- [ ] Controls work with a trackpad and do not scroll the page unexpectedly.
- [ ] The canvas fits the intended laptop screen and remains legible when resized.
- [ ] Returning from a background tab does not cause a large physics jump.
- [ ] Sound starts after interaction; mute works.
- [ ] Performance is checked on an actual M1 Mac during the busiest action. Aim for smooth rendering, ideally around 60 fps; stepped character poses are intentional and separate.
- [ ] Test Chrome and Safari on the target Mac and record any limitation.
- [ ] The production build works from its hosted link, including textures and sounds.
- [ ] A new player completes a match without developer intervention.

## 11. Five-minute demo outline

- **0:00–0:30:** Pitch and theme: moths competing for the only light in a dark bedroom.
- **0:30–1:00:** Show the felt characters; explain turns and holding the halo.
- **1:00–3:30:** Play a short match. Demonstrate knockback and moving the lamp.
- **3:30–4:15:** Highlight the handmade animation and one amusing interaction.
- **4:15–5:00:** Finish or restart cleanly, share the link, and explain how colleagues can play.

Keep a short backup recording in case the live demo has a technical problem. Prepare a reliable opening position that makes the swinging-lamp mechanic easy to show.

## 12. Decision and progress log

| Date | Decision or finding | Status |
| --- | --- | --- |
| 13 November | Focus on Moth Fight Club. | Agreed |
| 13 November | Felt puppet characters and a stop-motion-style miniature world. | Agreed |
| 13 November | Replace the initial 2D starter with modelled 3D felt-style puppets and a miniature bedroom, using Three.js and cannon-es. | User requested; scene study implemented |
| 13 November | Two moths per team; first to three points; score at start of own turn. | Proposed; playtest |
| 13 November | One arena, local play first, simple bot after the core works. | Proposed build order |

### Current next task

Movement and the 3D scene are implemented. The playground currently refills flutter on landing and returns fallen moths automatically; the match rules above will replace those unlimited-practice behaviours where needed. Playtest the PS5 controls, then add Wing Gust and the turn/scoring loop.

**Complete the first playable greybox:** one moth per team, simple platforms, a hanging lamp, movement, Wing Gust, alternating turns, scoring, and restart. A greybox is the game made with simple shapes before final art.

### Playtest notes

Duplicate this entry for each session:

- Date/build:
- Tester and device/browser:
- What they understood immediately:
- Where they got stuck:
- Funniest or most satisfying moment:
- Match length:
- Most important change to make next:

### Asset log

| Asset | Source / creation method | Licence or usage notes | Status |
| --- | --- | --- | --- |
| Moth puppet | TBD | TBD | Needed after greybox |
| Bedroom arena | TBD | TBD | Needed after greybox |
| Lamp and props | TBD | TBD | Needed after greybox |
| Sound effects | TBD | TBD | Needed for polish |
