## Mobile burgs
The generator's default settlements are fixed points on the map: generate a town, and it stands there for the life of the map. This fork adds the alternative: settlements that **move**. Sky-cities drift on the winds, walking titans stride the plains, roving hordes pick up and walk on, and (under the Living World) wanderers that pick a far destination and march to it one cell at a time.

## The archetypes

| Archetype | Realm today | What it is |
|---|---|---|
| **Walking titan** | Titan | a settlement carried on a colossus; it strides the open land, and the land it sets down on is scarred (see trampling below) |
| **Roving horde** | Horde | a migratory confederation; it hauls what it can carry, sells only when it halts, and walks on |
| **Drifting sky-city** | Sky | a floating settlement that wanders on the winds |
| **Walking isle** | Underwater | a benthic islet that sails the shelves |
| **Roving hold** | Underdark | a subterranean settlement that relocates through the tunnels |

Underlying property they share: they are settlements whose **position is a function of time or of the seed**, not a fixed fact.

## The four ways to move

Every burg has a **Mobility** setting in the Burg Editor (under the Hub row) and in the Assistant:

- **Pinned** — the burg stays where it stands. The default.
- **Drift** — the burg wanders when the map is generated: the generator re-places mobile burgs on their own seeded stream, so a regenerate's layout is reproducible for the same seed. Drift is the simplest way to have living migrations baked into a map.
- **March** — the burg **rides a journey** (see the Journeys page). Its place along the route is derived from the lore year: one lore year is a day's worth of marching at the transport's pace. It freezes at a halt until you resume it, and it docks at the journey's end. Assistant operations: `Burgs.march`, `Burgs.unmarch`, `Burgs.setDepartureYear`, `Burgs.advanceMobile`, `Burgs.pauseMobile`, `Burgs.resumeMobile`.
- **Live** — the **Living World** tick moves the burg one cell per season toward a seeded far destination. A migration, not an army: no state expansion, no combat, no diplomacy. It needs Living World mode; maps without it never evaluate this.

Only realm burgs can ride a journey — a surface burg owns the cell it stands on. Live mode works for any burg (a walking surface town is legal; it takes and releases its cell slot as it goes), though Titans, Hordes and the other realm wanderers are the natural walkers.

## How mobile burgs get onto a map

- **Drift placement** — new maps generated with the feature carry wanderers, placed on their own seeded stream so the surface map stays byte-identical with or without them. `Options → Map generation → Realm networks → Mobile wanderers` sets how many (0–5, default 2).
- **Burg Creator** — found a wanderer directly with the Titan or Horde realms selected.
- **Burg Editor** — pick any burg and switch it to Drift, March or Live from the Mobility row.
- **Assistant** — `Burgs.setMobility(burgId, "drift" | "march" | "live")` toggles any burg into a wanderer.

## Rendering

- Mobile icons rotate with the burg's `heading` (titans and hordes face where they walk).
- Marching burgs carry `data-mobility="march"` with a warm drop-shadow; live ones carry `data-mobility="live"` with a green one. Labels ride along.
- A **Ride** select in the Burg Editor (visible in March mode only) picks which journey a marching burg rides.

## The economy on the road

- **A burg on the road is outside the market grid**: no poll tax, no production sold. The cell it walks past never hosts its market day.
- **A halted burg is ordinary**: it trades at its cell's market, pays poll tax, produces as usual.
- **Carried stock** — a mobile burg that sets out loads the pack from its dock: it buys whatever the market stocks most cheaply at the door price, spending its treasury. Wherever it halts it discharges the pack, selling at the door price and collecting the revenue. A halt in the wilderness keeps the pack until a market opens. This is the horde's and the sky-caravan's whole economy.
- **Titan trampling** — a walking titan scours the land it sets down on: the cell's Development drops by 10, to a floor of 0. March and drift positions are derived, so they never wear the land; only a titan that actually walks (Live) tramples.

## Regenerating, restoring, and integrity

- Wanderers are placed before routes are built (roads terminate at titan and horde cells — they ride the network), and nothing else in the surface generation depends on where they landed, for the same seed.
- The `cell-burgs` and `burg-cells` integrity rules are realm-aware: a realm-class burg never owns a `cells.burg` slot. Marching a surface burg onto a journey is refused by the model, so a surface burg can never wander off its slot by riding one; Live mode routes surface burgs through `Burgs.move`, which takes and releases the slot properly.
- **Regenerating burgs** (_Tools → Regenerate: Burgs_) re-rolls the map around kept burgs: a wanderer survives a regenerate only while it is locked. An unlocked wanderer is dropped; a locked wanderer keeps its cell, its identity and its treasury.
- **Map restoration** (heightmap edits, submap, resample) projects every burg: a wanderer whose land sank under the sea is re-seated on the nearest cell — identity, population and treasury intact.
- `.map` files save mobile fields (`mobile`, `mobility`, `journey`, `departedYear`, `pausedAt`, `heading`, `destination`, `carried`) additively; maps from before mobility existed load without backfill. Older versions simply see these as ordinary burgs.

## Living World integration

Under the Living World, the season tick marches live wanderers one cell per season:

- Each season, a wanderer whose far destination still stands for its realm keeps it; otherwise one is picked from a seeded shortlist (the farthest standable cell — land for titans/hordes/underdark holds, water for underwater, anywhere for sky).
- A hemmed-in burg re-rolls its destination next season.
- On arrival, the chronicle records it (`deed` event with the burg as actor), the burg rests one season, and its road join happens once — on arrival, like a marching burg docking.
- Maps without Living World never evaluate any of this.

## Related

- [Non-land burgs](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Non-land-burgs) — the sky, underdark and underwater settlements mobile burgs ride upon
- [Journeys](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Journeys) — the route network a marching burg rides
- [Living World](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Living-World) — the tick that drives Live wanderers
- [History](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/History) — the chronicle where arrivals are recorded
