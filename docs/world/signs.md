# Signs

One drawing per current. A clan without a file here is not a clan. HUD pips, minimap blips, and later wall tags all tint these masters. Do not invent a second mark for the same current.

All of them are flat white glyphs on a transparent 256×256 canvas, in `viewer/signs/`.

| File | Who it belongs to | What it is |
|------|-------------------|------------|
| `mark-three.svg` | Pieter, Mo, and Jacob | Three short vertical ticks. A wall tag, not a wanted pip. |
| `heat-police.svg` | Antwerp local police | A sheriff badge: five-point star, ball tips, round centre. Police heat only. |
| `clan-hassidic.svg` | The diamond network | Star of David. That network only. |
| `clan-flemish.svg` | The dock families | An anchor. Port, trucks, routes. |
| `clan-arab.svg` | The street crews | A crescent. |

Police stars are the only heat the player can raise by what they do on the street. A clan sign appears on the meter only when a mission calls `startFactionPursuit({ clan, stars })`. Walking past someone, or fighting them, never selects a clan.
