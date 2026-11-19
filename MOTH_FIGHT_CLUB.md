# Moth Fight Club

Game design and build tracker · Updated 17 November 2026

**Status:** 3D movement playground implemented with keyboard and PS5 controls, selection, grounded hopping, limited flutter, and fall recovery. Full turn/scoring loop pending.

**Direction update, 13 November:** Following review of the first starter, use true 3D moths and a miniature bedroom in Three.js, with cannon-es physics. The handmade felt and stop-motion direction remains. This supersedes the earlier 2D sprite proposal.

**Pitch:** A turn-based artillery-style physics brawler about handmade felt moths fighting over swinging lamps, where any lamp can be flipped into a bug zapper. Pick a moth, pick a weapon, and knock rivals out of the light or into the zap.

**Core loop update, 17 November:** Teams score each round for every lamp whose light they hold by majority. A weapon can invert a lamp into a bug zapper: anyone in its light is zapped, losing their team a point and launching them comically across the desk before they drop back in at a random spot. Pushing enemies into a zapper is the central trick shot.

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

- One 3D bedroom desk arena (currently 250 × 134) with no team bases: moths drop in at random clear spots and respawn the same way. A shoulder camera follows the active moth; a board view shows the whole desk.
- Two teams of **four to five moths** each. The current build has one moth per team; extra moths come with the turn system.
- **Three hanging lamps** by default (centre, left and right), each on a physics cord with its own spherical light zone. Display each zone's reach clearly on the desk.
- Books and other fixed props create reachable perches and firing positions.
- Lamps stay attached and cannot break. Scenery stays fixed initially.

### Lamps and zappers

Each lamp is in one of two states:

| State | Look | Effect |
| --- | --- | --- |
| **Warm lamp** (default) | Warm orange glow | Scores for the team holding its light at the end of each round. |
| **Bug zapper** | Cold violet glow, buzz and crackle | Any moth whose body centre is inside its light zone is zapped, from either team. It never scores. |

- A weapon (working name **Zap Switch**) inverts one lamp into a zapper. It uses the turn's action, each team has **two per match**, and the zapper lasts **one full round** before turning back into a warm lamp. These numbers are starting values to playtest.
- Inverting a lamp immediately zaps every moth already in its light, friend or foe, so flipping a crowded lamp is the big play.
- While a lamp is a zapper, any moth that enters its light is zapped at once. This includes moths pushed in by gusts or projectiles, or caught by the zapper swinging on its cord.
- Zappers do **not** pull moths towards them. Revisit after playtesting.

### Getting zapped

- The zapped moth's team **loses one point**. Scores can drop, so a single good push can swing the lead.
- The moth is launched comically: a violet flash with a brief freeze-frame, charred fur and a smoke trail, a tumbling flight across the desk, a cartoon landing, then a puff as it drops back in at a random clear spot.
- A zapped moth sits out the next round, the same as a moth that falls off the desk.
- A launched moth that hits another moth can zap it too (rare and memorable; optional for the first build).

### Winning

- **Each round, both teams take one turn.** At the end of the round, each warm lamp awards **one point** to the team with more moths inside its light.
- A tie inside a lamp's light, or an empty light, awards nothing for that lamp. A zapper awards nothing.
- More moths do not score more than one point per lamp: holding the majority is what counts.
- Score using moth body centres and each lamp's radius. Show which team holds each lamp, and whether it is contested, with text or icons as well as colour.
- Target score and match length are to tune. Starting proposal: first to **ten points**, aiming for roughly five to eight minutes.
- Starting positions are outside every light, so the first round can only score if a team reaches a lamp during it.

### Turn sequence

1. Return the incoming team's moths that sat out the last round at random clear spots.
2. Select one friendly moth. Any non-resting moth may be chosen.
3. Move using a limited movement allowance.
4. Choose a weapon, aim, and fire, or pass.
5. Let physics resolve, then hand over to the other team.
6. After both teams have played, end the round: score warm lamps, count down zapper durations, and check for victory.

The world pauses during selection, aiming and handover. Physics runs during movement and action resolution, with a maximum resolution time so a swinging lamp cannot stall a match. Exact thresholds are implementation details to tune.

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

## 4. Weapons

Worms-style: choose a weapon each turn, each with a distinct job. All names are working names, and all designs are original bedroom objects and moth tricks.

| Weapon | Behaviour | Build priority |
| --- | --- | --- |
| Wing Gust | Short-range cone pushes moths and swings lamps overhead. Unlimited. Physics implemented 17 November, controls pending. | First playable |
| Zap Switch | Inverts one lamp into a bug zapper for one round. Two per team per match. | First playable |
| Bottle-Cap Flick | Fairly straight shot with strong knockback; ricochets off books. | Core build |
| Firecracker | Lobbed, bouncy, short fuse, radial blast that affects both teams and the lamps. | Core build |
| Thread Swing | Fire a thread at a lamp cord and swing across the desk. | Stretch |
| Thumbtack | Placed trap that launches the next moth to step on it. | Stretch |
| Sticky Note | Moth standing on it cannot be pushed; a counter to zapper plays. | Stretch |
| Draught from the window | Per-turn wind that affects projectiles and fluttering moths. | Stretch |

Aiming: aim along the camera's view, tilt up or down for arcing shots, hold to charge power where relevant, release to fire. Do not add a guide that promises an exact landing position when collisions or lamp movement can change it; a short initial trajectory guide is enough.

Start with unlimited use for basic weapons while testing; limit powerful ones and show remaining uses clearly.

## 5. What makes the lamp interesting

Each light zone follows its physical bulb. Players can push an enemy out of the light, swing a lamp towards their own moths, crowd a lamp to take the majority, or flip a crowded lamp into a zapper.

The best-scoring position is also the most exposed one: the more moths a team stacks under a lamp, the more a Zap Switch costs them. Swinging a zapper into a crowd on its cord is the signature moment to show in the demo.

Example: a firecracker misses its target but swings a zapper into two waiting enemies, turning a failed shot into a double zap.

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
| 13 November | Two moths per team; first to three points; score at start of own turn. | Superseded 17 November |
| 13 November | One arena, local play first, simple bot after the core works. | Proposed build order |
| 16 November | Desk enlarged; three lamps with larger light zones; teams of four to five moths proposed. | Implemented (lamps, desk); teams pending |
| 17 November | Worms-style weapon choice each turn. Score one point per warm lamp held by majority at the end of each round. Zap Switch inverts a lamp into a bug zapper for a round; zapped moths cost their team a point and are launched comically back to base. No zapper pull for now. | Agreed; replaces "first to three" and start-of-turn scoring |
| 19 November | Remove team bases. Moths drop in and respawn at random clear spots across the desk, away from lamp light and props. | Agreed |

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
| Sound effects and night ambience | Artlist sound-effect catalogue, 11 clips listed in `public/sounds/README.md`; synthesised fallbacks in code | Licensed to the downloader's Artlist plan; git-ignored because the repository is public. Confirm the licence covers a hosted game before publishing. | In use locally, 17 November |
