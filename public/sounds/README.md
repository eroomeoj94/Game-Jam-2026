# Sound files

The game plays sound effects from `artlist/` when they are present, and falls
back to small synthesised sounds when they are not.

## Artlist sound effects (not in the repository)

These clips come from the Artlist sound-effect catalogue and are licensed to
the person who downloaded them under their Artlist plan. The repository is
public, so `artlist/` is git-ignored: do not commit these files. To play with
the full sound set, download each clip from Artlist (AAC) and save it in
`public/sounds/artlist/` under the file name shown.

| File             | Used for                                            | Artlist clip                                                                                                                                    |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `punch.aac`      | Bosh connecting; knock-backs from projectiles       | [Anime Action – Cartoonish Punch](https://artlist.io/sfx/track/anime-action---cartoonish-punch/99488)                                           |
| `swish.aac`      | Bosh missing                                        | [Total Transitions – Swipe Swish, Quick Dodge, Kung Fu](https://artlist.io/sfx/track/total-transitions---swipe-swish-quick-dodge-kung-fu/60804) |
| `whoosh.aac`     | Wing Gust; firecracker throw                        | [Air Motion – Short Airy Whoosh](https://artlist.io/sfx/track/air-motion---short-airy-whoosh/117173)                                            |
| `zap.aac`        | A moth getting zapped; a lamp turning into a zapper | [Electrified – Spark Zap](https://artlist.io/sfx/track/electrified---spark-zap/106234)                                                          |
| `zapper-hum.aac` | Loop while any lamp is a bug zapper                 | [Electric Shock – Humming Buzz, Low Pitch](https://artlist.io/sfx/track/electric-shock---humming-buzz-low-pitch/106243)                         |
| `switch.aac`     | Zap Switch flipping a lamp                          | [Home Alone – Lamp, Switch Click](https://artlist.io/sfx/track/home-alone---lamp-switch-click/44997)                                            |
| `bang.aac`       | Firecracker explosion                               | [Pyrotechnics Vol 2 – Short Bang](https://artlist.io/sfx/track/pyrotechnics-vol-2---short-bang/110724)                                          |
| `fuse.aac`       | Loop while a firecracker fuse burns                 | [Fire – Fuse, Dynamite, Burning, Sizzling](https://artlist.io/sfx/track/fire---fuse-dynamite-burning-sizzling/50385)                            |
| `pop.aac`        | Bottle-Cap Flick                                    | [Cartoon Elements – Bottle Pop](https://artlist.io/sfx/track/cartoon-elements---bottle-pop/69729)                                               |
| `flutter.aac`    | Loop while the active moth flutters                 | [Creatures of Darkness – Winged Insect Flutter](https://artlist.io/sfx/track/creatures-of-darkness---winged-insect-flutter/102378)              |
| `ambience.aac`   | Background: night room tone with crickets           | [American Suburbs – Night Crickets](https://artlist.io/sfx/track/american-suburbs---night-crickets/110996)                                      |

Before hosting a public build that serves these files, confirm that your
Artlist licence covers use in a game.

## Optional recording

- `bosh.mp3` — the shout when a moth throws a Bosh. Without it, the browser's
  speech voice says "Bosh!". This file is not ignored: only add one you are
  free to publish.
