# Sound files

The game plays sound effects from `artlist/` when they are present, and falls
back to small synthesised sounds when they are not.

## Artlist sound effects (not in the repository)

These clips come from the Artlist sound-effect catalogue and are licensed to
the person who downloaded them under their Artlist plan. The repository is
public, so `artlist/` is git-ignored: do not commit these files. To play with
the full sound set, download each clip from Artlist (AAC, or MP3 for the
music) and save it in
`public/sounds/artlist/` under the file name shown.

| File             | Used for                                            | Artlist clip                                                                                                                                    |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `punch.aac`      | Bosh connecting; knock-backs from projectiles       | [Anime Action – Cartoonish Punch](https://artlist.io/sfx/track/anime-action---cartoonish-punch/99488)                                           |
| `slap.aac`       | A giant hand hitting the desk                       | [Fight – Punching Wood](https://artlist.io/sfx/track/fight---punching-wood/24787)                                                               |
| `swish.aac`      | Bosh missing                                        | [Total Transitions – Swipe Swish, Quick Dodge, Kung Fu](https://artlist.io/sfx/track/total-transitions---swipe-swish-quick-dodge-kung-fu/60804) |
| `whoosh.aac`     | Wing Gust; firecracker throw                        | [Air Motion – Short Airy Whoosh](https://artlist.io/sfx/track/air-motion---short-airy-whoosh/117173)                                            |
| `zap.aac`        | A moth getting zapped; a lamp turning into a zapper | [Electrified – Spark Zap](https://artlist.io/sfx/track/electrified---spark-zap/106234)                                                          |
| `zapper-hum.aac` | Loop while any lamp is a bug zapper                 | [Electric Shock – Humming Buzz, Low Pitch](https://artlist.io/sfx/track/electric-shock---humming-buzz-low-pitch/106243)                         |
| `switch.aac`     | Zap Switch flipping a lamp                          | [Home Alone – Lamp, Switch Click](https://artlist.io/sfx/track/home-alone---lamp-switch-click/44997)                                            |
| `bang.aac`       | Firecracker explosion                               | [Pyrotechnics Vol 2 – Short Bang](https://artlist.io/sfx/track/pyrotechnics-vol-2---short-bang/110724)                                          |
| `fuse.aac`       | Loop while a firecracker fuse burns                 | [Fire – Fuse, Dynamite, Burning, Sizzling](https://artlist.io/sfx/track/fire---fuse-dynamite-burning-sizzling/50385)                            |
| `pop.aac`        | Bottle-Cap Flick                                    | [Cartoon Elements – Bottle Pop](https://artlist.io/sfx/track/cartoon-elements---bottle-pop/69729)                                               |
| `flutter.aac`    | Loop while the active moth flutters                 | [Creatures of Darkness – Winged Insect Flutter](https://artlist.io/sfx/track/creatures-of-darkness---winged-insect-flutter/102378)              |
| `music.mp3`      | Background music on a loop (download as MP3)        | [Steven Beddall – Jellybean Heist](https://artlist.io/royalty-free-music/song/jellybean-heist/137223)                                           |
| `ambience.aac`   | Background: faint night crickets under the music    | [American Suburbs – Night Crickets](https://artlist.io/sfx/track/american-suburbs---night-crickets/110996)                                      |

Before hosting a public build that serves these files, confirm that your
Artlist licence covers use in a game.

## Announcer voice lines (not in the repository)

`artlist/voice/` holds 39 short announcer clips (four of them, the turn and win calls for
Purple and Ivory, added on 24 November 2026) ("Bosh!", "Zapped!", "Hot lamp!
Double points!", "Mustard wins!" and so on), generated on 23 November 2026 with
Artlist's voice-over tool: the "Hype" voice, British accent, with the
"Announcer" voice effect. They are saved in
the Artlist project "Moth Fight Club", folder "Announcer". The file names and
the moment each one plays are listed in `VOICE_LINES` in `src/audio/sfx.ts`.
The three burnt-out warnings (`burn-1` to `burn-3`: "WARNING! WARNING! That
lamp is BURNT OUT!", "LAMP DOWN! LAMP DOWN!", "OH NO! The bulb has BLOWN!")
were added later the same day with a wilder delivery, and interrupt any other
line. Without the clips the game has no announcer and falls back to the browser's
spoken "Bosh!".

## Moth voice lines (not in the repository)

`artlist/voice/moth/` holds 56 clips: what a moth says after a move or an
action. Four Artlist voices (Chipper, Pep, Boss and Tattle; files `a-`, `b-`,
`c-` and `d-`) each have two lines for every cue: `gust`, `bosh`, `zap`, `cap`,
`firecracker`, `dance` and `move`. A moth's number picks its voice. They were
generated on 23 November 2026 and are saved in the Artlist project "Moth Fight
Club", folder "Moth voices". See `MOTH_CUES` in `src/audio/sfx.ts`.

## Giants' voice lines (not in the repository)

`artlist/voice/giant/` holds 12 clips of the three people round the desk
grumbling at the moths: three lines each for the slam ("Bug off!", "Get out of
here, you pest!") and one for the wind-up. They were generated with Cartesia
Sonic 2 and its "Angry" emotion, using the Gravity and Professor voices; the
third giant is the cloned "Joe Moore" voice on MiniMax Speech 02 HD, also set
to angry, with seven extra silly slam lines (`2-slam-4` to `2-slam-10`). They are saved in the Artlist project "Moth Fight Club", folder "Giants".

Each giant also has three lines for being taken over by a Mind Control
(`0-mind-1` and so on), generated on 24 November 2026: the first two giants on
Cartesia Sonic 2 without the anger, and the Joe Moore voice saying "Go go Power
Rangers!", "Claude, give me an overview of how to smash these bugs." and "I am
being controlled by a moth. This is not in my job description."

## Optional recording

- `bosh.mp3` — the shout when a moth throws a Bosh. Without it, the browser's
  speech voice says "Bosh!". This file is not ignored: only add one you are
  free to publish.
