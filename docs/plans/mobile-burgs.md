# Plan — Mobile burgs (drift-cities, wandering islands, living titans & roving hordes)

Updated: 2026-11-12. Inputs: `docs/plans/multi-realm.md` (the realm system mobile burgs build on), `docs/wiki/Non-land-burgs.md`.

Progress:
- Phase 1 — Data model, options & burg groups: ✅ done (2026-11-12)
- Phase 2 — Drift mode: seeded wander placement per realm: ✅ done (2026-11-12)
- Phase 3 — Integrity, restore, provinces & states for movers: ✅ done (2026-11-12)
- Phase 4 — Journey-linked march mode (year-driven): ✅ done (2026-11-12)
- Phase 5 — Rendering: ✅ done (2026-11-12)
- Phase 6 — Assistant operations & UI: ✅ done (2026-11-12)
- Phase 7 — Autonomous mode (Living World tick + chronicle hooks): ✅ done (2026-11-12)
- Phase 8 — Mover economy rules: ✅ done (2026-11-12)
- Phase 9 — Verification, tests & docs: pending

Implementation notes:
- Phase 1 delivered: `Burg.titan` / `Burg.horde` realm flags (mutually exclusive with the other realm flags, like `flying`/`underdark`/`underwater`), the new realm kinds entered into `BurgRealm`,
  `getBurgRealm`, `isSurfaceBurg`, `isBurgInRealm`, `groundSlotOnPlacement`, `Burgs.add` and `Burgs.setRealm` (realm allow-list + titan/horde water-rejection; demotion hands the surface slot back,
  promotion back to surface validates the cell and the slot occupancy). Mobile fields on `Burg` (`mobile`, `mobility`, `journey`, `departedYear`, `heading`, `pausedAt`, `destination`, `carried` — additive, persisted in `.map`).
  New burg groups `titan_capital`/`titan_hold` and `horde_capital`/`horde_hold` (resolved before surface groups; the minor holds gate on `zoomThreshold: 1.5`), matching label groups with
  `zoom.min = 1.5`, `default-styles.json` icon + label styles (titan = warm amber, horde = terracotta), `Options → Realm networks` checkboxes `Titan burgs` / `Horde burgs` (default on, schema + model +
  imperative bindings), `.map` backfill of the new groups unconditionally and idempotently in `auto-update.ts`. Assistant context regenerated (`BurgRealm` type now includes both).
- User decisions taken into the design (2026-11-12): drift placement for all four realms in one phase; drift is seeded-random, march is the purposeful mode; titans are a realm concept like skyburg
  (titan capitals + subordinate burgs, can claim stationary surface neighbours); horde is a state of its own (zero land, like realm states); default 0–5 mobiles with 2 as the default; arrivals always
  write chronicle entries; drift mode first.
- Phase 2 delivered: wanderers generate on their own seeded stream (`seed:mobile`, restored after), placed after realm placement (phase after surface = never disturbs byte identity of surface or
  realm rolls). Round-robin across enabled archetypes; spacing enforced by the shared `realmTree` quadtree (mobiles and realm burgs keep each other apart). Per-archetype candidates/weighting: sky
  (any cell, `altitude` 50–500), underdark (mountain-weighted land, `-3000..-200`), underwater (shelves-weighted warm water, `-2000..-50`), titan (open-ground weighting favoring plains), horde
  (savanna/grassland-weighted, mountains avoided). Each wanderer is `capital: 0`, `state: 0`, `mobile: 1`, `mobility: "drift"`, with a `heading` roll. `Options → Realm networks` gained a `Mobile wanderers`
  slider (0–5, default 2) bound imperatively with a lock icon; `population.wanderers` in schema/defaults. Roads connect titans/hordes via `sortBurgsByFeature` (the road network passes through them;
  they are `capital: 0`, never hub-adjacent anchors, never ports). Scenario test pins placement determinism per seed.
- Phase 6 delivered: assistant ops exposed and layer-mapped (`march`, `unmarch`, `setMobility`, `setHeading`, `setDepartureYear`, `advanceMobile`, `pauseMobile`, `resumeMobile`); the `setMobility`/`march` pair on the model switches between pinned / drift / march (marching auto-picks a journey when none is assigned). Burg Editor: under the Hub row a Mobility row with Pinned/Drift/March icons (greyed when off, like other feature icons) plus a `Ride` select (populated from `pack.journeys`, shown only in march mode). Burgs Overview: Titan and Horde realm filter chips; the creator's realm selector gains Titan and Horde. Map commands `advanceMapYear`, `pauseAllMobiles`, `resumeAllMobiles` with aliases. Assistant `redraw.ts` redraws `burgIcons`/`labels` on any burg mobility field change and on `Lore` year changes.
- Phase 7 delivered: `Burg.destination` (optional cell index the live wanderer walks toward; additive, persisted in `.map`, re-rolled each season until it lands). `Burgs.setMobility(id, "live")` clears journey/departedYear/pausedAt/destination and sets `mobile` + `mobility: "live"`. The Living World tick (`Living.tick`, 1 season = 1 tick) runs `stepMobileBurgs` after `stepRebellions`, before `stepEschaton`: no-op unless Living World mode is on. Each season a live burg whose realm can stand on `destination` is kept; otherwise one is picked from a seeded 48-cell shortlist (`rng("liveMobile", burgId)`; tick-seeded, so the pick is deterministic per season) — farthest standable cell wins (land for titans, hordes and underdark holds, waters for underwater, anywhere for sky). One greedy cell-graph hop per season toward it (neighbor with the smallest euclidean gap that also stands for the realm; hemmed-in burgs re-roll next season). Moves ride `Burgs.move` with a new `{ connect: false }` option so the map isn't littered with a fresh trail per cell; the road join happens once per wander, on arrival — like a marching burg docking. Arrival is chronicled (`deed` event with the burg as actor + `colonize` news entry, burg rests a season) and clears `destination`. All failures (blocked cell, no standable destination) swallowed to re-roll next season — the tick never dies. Burg Editor Mobility row gains a Live (`icon-compass`) toggle; icons carry `data-mobility="live"` with a green drop-shadow in `index.css`; `draw-burg-icons` emits the marker for `live`; `Burgs.setMobility` signature extended. 5 unit tests in `living-generator.test.ts` (one hop per season, realm ground rules, pinned/drift untouched, chronicled arrival + rest season, all-water titan no-op). Assistant context regenerated (`setMobility` type now `"pinned" | "drift" | "march" | "live"`).
- Phase 8 delivered: titan trampling — the live-hop footfall cell loses 10 development (`max(0, dev-10)`), diffusion kept inert in tests (seeded research emptied and re-seeding blocked); march/drift titans don't trample (positions are derived; scrubbing years must not grind the land). The **halt** contract: `Burgs.isOnTheRoad(burg)` — true only while a march rides an unfinished journey (paused counts as halted, docked as halted) or a live burg has a live `destination` (resting/re-rolling counts as halted); pinned and drift always halted. The production turn (`produce()`) keys off it: no poll tax and no market day for a burg on the road, `product`/`production` zeroed; a halted burg is an ordinary burg again. **Carried stock** (`Burg.carried?: Record<goodId, units>`): at the first full economy run after departure the burg loads the pack — cheapest stocked staples first at `quoteMarket` door prices, spending its treasury (marked even when it can't load, so no re-buy mid-wander; an empty pack still sets `carried`); at the first run after the halt it discharges — sells at 90% door, leaving the goods in the market at no centre margin, gaining the revenue back. A marketless halt keeps the pack; pinning mid-wander discharges like any halt (the pin can't strand the goods). "Sells what it makes on the road" approximates to the departure load only — a wanderer makes nothing mid-road; the sheet shows it as `Carried stock` in the Burg Economy Overview. The horde's halt rule falls out for free: a halted horde is an ordinary burg (trades normally, pays poll tax), and on the road it sells nothing. Not shipped: the war-isle preferential arms/food buy (no war-isle realm exists). Assistant context unchanged (no signature change). 14 new tests across the three suites: 3 `isOnTheRoad`, titan footfall and underwater-swim, and 6 carried-stock cases (cheapest-first load, one load per departure, pauper rides empty, halt discharge, wilderness halt keeps the pack, pinned mid-wander discharges).

## Goal

Let a burg **actually move**. Today a settlement is a fixed point on the map for its whole life;
this plan adds three ways for one to travel, in increasing order of ambition. All three reuse the
multi-realm machinery (domains, routes, journeys, integrity opt-outs, realm states) rather than
forking it.

The three archetypes, per the brief:

| Archetype | Realm today | What it is | Fiction |
|---|---|---|---|
| **Sky-city** | sky | a floating city that migrates | a drifting war-island of the high court |
| **Living island** | underwater | a surface-floating islet (real or mobile) | a submerged basalt leviathan; an isle that sails |
| **Land titan** | surface (new burg group) | a settlement carried on a colossus | the titan "Mount of the Elders" or the like |
| **Roving horde** | surface (new burg group) | a nomad host that picks up and moves on | a migratory confederation; a behemoth-driven wagon train |

Underlying property they share: they are settlements whose **position is a function of time or of
the seed**, not a fixed fact — a burg that existed at another place yesterday.

## Design pillars

1. **Determinism over simulation.** Mobile burgs are placed by the seeded generators, on their own
   stream (`seed:mobile`), like realms. Regenerating the same seed reproduces the same positions.
   Nothing drifts on its own unless Living World mode is explicitly on (Phase 7).
2. **Reuse, don't fork.** 
   - Paths, pathfinding, speeds, ETAs and the path editor all already exist as **Journeys**
     (domains `air`/`water`/`land` map onto `airroutes`/`undersearoutes`/`roads|trails|underdarkroutes`).
     A marching mobile burg is a journey segment the burg rides — never a second path format.
   - Realm rules (zero-surface-territory states, no cell slot, no province seat, zoom-gated icons)
     already make non-surface settlements citizens of everywhere and owners of nowhere; mobile
     burgs inherit that.
   - Integrity opt-outs already exist for "cannot pin the surface"; mobile burgs reuse them.
3. **Time is the map's lore year, not a new clock.** Position in March mode is
   `f(year − departedYear, speed)`, like journey durations — scrubbing the Legends timeline
   replays the migration, and saving a map needs just the departure year.
4. **A mobile burg is a burg.** It produces, sells, taxes and unlocks groups/icons/labels like any
   other settlement — mobility is a property, never a parallel settlement system.

## Data model

New optional fields on `Burg` (all additive; `.map` files backfill idempotently, like the realm
backfill — `VERSION` stays upstream-owned):

- `mobile?: 1` — the burg is mobile (by a mobility kind).
- `mobility?: "drift" | "march" | "live"` — how it moves:
  - `drift` — seeded wander: a new plausible cell each generation (simplest, deterministic);
  - `march` — travels a stored journey, position from the lore year (`departedYear`);
  - `live` — autonomous roaming driven by the Living World tick (Phase 7).
- `journey?: number` — id of the journey it rides (`march` only).
- `departedYear?: number` — lore year it set out (`march` only).
- `heading?: number` — degrees, for titan/horde icon rotation (degrees, 0 = up/north).
- `pausedAt?: number` — lore year it halted (`march` stations the burg at a port like any other).
- `destination?: number` — cell index a `live` wanderer walks toward (re-picked each season until it lands).
- `carried?: Record<number, number>` — goods the mobile burg bought at the dock it left and discharges at the halt it reaches (set at the first economy run after departure; cleared at halt).

Burg groups (new, zoom-gated like the realm minor holds):

- `titan` (capital: `titancity`), `horde` (capital: `horde_capital`) — surface realm archetypes;
- `drift_sky` — a flying war-isle group for sky mobiles;
- `drift_island` — a mobile atoll/seamount group for underwater mobiles (an isle that sails);
- labels: one label group per new burg group, same zoom gating rules (`zoom.min = 1.5`).

## Movement modes

### Drift (Phase 2, the core)

On map generation/regeneration, drifting burgs re-place to a plausible cell chosen on the
`seed:mobile` stream:

- **Sky mobiles** — any cell (sky rules), spaced from each other and from unique landmarks;
- **Island mobiles** — water cells on shelves/trenches (underwater rules); inside ports and at
  land edges they look like moored isles — when docked they draw as ordinary underwater capitals;
- **Titan mobiles** — inland cells, weighted to open plains (a colossus needs room to stride);
  `heading` re-rolled per generation ±30° for flavour;
- **Horde mobiles** — cells weighted to grassland/plains/steppe and near herd biomes.

Drift is deterministic per seed (a fresh map always shows the same mobiles in the same places).
They are ordinary burgs thereafter: they buy, sell, produce, pay poll tax, and regenerate like
anyone else. Movement per regenerate reads as "the titan walked through while the map was 
re-struck" — no persistent sim state, zero save format churn beyond the new flags.

### March (Phase 4, commanded)

A march burg rides a **Journey** with a mobile payload (`journey.burgs: number[]` or a single
`journey.carrier` link; one burg per journey to keep it simple):

- The journey path editor picks the route; transport picks the domain:
  `farel-trains`/wagon/caravan for a horde, `airship` for sky, `gale-borne`/seasteed for islands;
- speed comes from the transport definition (km/h) as for all journeys;
- position on the map is `f(year − departedYear, cumulative segment hours)` — an interpolation
  along the segment chain with the same point data journeys already render;
- **ETA** and the "leaves when" readout reuse the journey ETA math;
- docking (`pausedAt`): the burg halts its march and becomes an ordinary burg at that cell until
  the user or the lore year releases it;
- scrubbing the Legends timeline moves the burg — the burg's arrival is a chronicle event
  (`year`, burg id) so history actually records the migration.

A marching burg renders on the Journeys layer glide (like trade animation), frozen between
generators — position is recomputed from the lore year, never stored as a second source of truth.

### Live (Phase 7, autonomous) — shipped

Living World tick (1 season = 1 tick, 4 ticks = 1 year): each season a `mobility: "live"` burg takes one
cell-graph hop toward a far destination:

- the destination is picked from a seeded shortlist (48 sampled cells, `rng("liveMobile", burgId)` per
  season) — the farthest standable cell wins; land for titans/hordes/underdark holds, waters for
  underwater, anywhere for sky (per-archetype weighting like biome richness is a refinement, not the
  shipped behavior);
- a hemmed-in burg (no improving hop) or a blocked move clears the destination and re-rolls next season;
- no state expansion, no combat, no diplomacy — it's a migration, not an army;
- arrival writes the chronicle (`deed`, burg actor) and a `colonize` news item, the burg rests a season,
  and the road join happens once — on arrival, like a marching burg docking;
- maps without Living World never evaluate any of this.

See "Phase 7 delivered" in the Implementation notes for the exact mechanics.

## Mechanics by system

### Cell slots and occupancy

- A **docked** mobile burg owns `cells.burg[cell]` like a surface burg of its realm if it's
  surface-class, or shares like a realm burg if sky/underwater-class (the `groundSlotOnPlacement`
  rules already key off `isSurfaceBurg`).
- A **moving** mobile burg owns **no** cell — pathfinding, erosion pinning and slot rules all
  treat it as realm-class "in transit"; it never evicts a surface burg mid-stride.
- Transition `docked → moving → docked` re-evaluates on every arrival; the slot is taken/released
  with the same helper pair (`groundSlotOnPlacement`/`cellSlotAfterRemoval`).
- A marching surface-class burg never forces cells of other realms to change hands.

### Provinces

Mobile burgs are never province seats (they'd walk off with the province). Surface-class mobiles
are excluded from seating like realm burgs; `isSurfaceBurg` becomes
`isSessileSurfaceBurg` and the provinces seat picker uses it.

### States

- Realm-class mobiles belong to zero-surface-territory realm states that travel with them
  (already how realm states work — they don't own cells, they just exist);
- surface-class mobiles belong to the state whose cell they currently occupy; on arrival they're
  reassigned exactly like crews changing carriages. As a refinement (Phase 8, optional), a titan
  capital could found its own zero-land "Hoststate" that follows it everywhere, mirroring realm
  states.
- Locked mobiles keep their burg locked against regenerate; locked states keep them whatever cell
  they end up on.

### Markets, trade & tax

- A **halted** mobile burg trades at its cell's market and pays poll tax; it is ordinary in
  every way (markets never found *at* it, realm rules apply for non-surface classes);
- A **moving** burg is outside the market grid: no poll tax, no production sold; it carries stock
  (`Burg.carried` — bought cheapest-first at the dock it left) and buys nothing until docked;
- `Burgs.isOnTheRoad(burg)` is the shipped halt test (march paused or docked, live at rest; pinned/drift always halted);
- An island wharf (surface-class, at a port) docks and trades like a surface burg.

### Routes & integrity

- A moving burg is exempt from `burg-routes` (`on the route network`) while `moving` — it rides
  its own track;
- a docked titan whose trail leads nowhere gets the same `Routes.connect` catch-up as a fresh
  burg;
- `burg-positions` must pass on arrival;
- integrity gets a new check: `mobile-consistency` — `mobile: 1` without `mobility` or `journey`
  is valid drift, but a march without a `journey` or a departure before creation is a violation;
- the realm-route lock rules apply: air/undersea lanes re-generate on regenerate/restore from
  where the mobile burg happens to stand.

### Map restoration & erosion

- A docked surface-class mobile pins its land cell like any surface burg (applyHeights raises it);
- a moving mobile pins nothing (same as realm burgs);
- `restoreBurgs` matches mobile burgs by nearest position (they moved, possibly far); a migrant
  that crossed a water gap keeps its identity, its treasury, its population — the whole state is
  the burg;
- a docked titan on land that sank is protected (pinned); a moving titan is not — it loses cells
  under it but travels on.

### Determinism

- All wander/heading/destination rolls run on the `seed:mobile` stream;
- drift placement runs **after** surface placement and realm placement but **before** routes, so
  roads/links know where to terminate;
- `Burgs.regenerate()` re-drifts mobiles with the same seeded sub-stream derived from the map
  seed, so a regenerate's differences are visible, reproducible, and diffable in review.

## Options & UI

- Options → Map generation → **"Mobile settlements"** toggle (off by default) plus "wanderers per
  map" (0–5, default 2). Imperial "onwards!" fantasy without surprises on conservative maps;
- **Burg Editor**: new row `Mobility` — `Pinned | Drift | March | Live` + `Heading` (titan/horde)
  + `Departure / Arrive` (year) + `Journey…` (picker opens the journey editor on the carrier trip);
- **Burgs Overview**: chips `Drift`, `Marching`, `Live`, `Titan`, `Horde`;
- **Burg Creator**: new toggles per realm (existing pattern) — `Sky`, `Underdark`, `Underwater`,
  plus `Surface` for titans/hordes, then mobility radio row
- **Assistant operations**: `Burgs.setMobile(burgId, mobility, journey?)`, `Burgs.setDepartureYear`,
  `Burgs.setHeading`, `Burgs.advanceMobile(burgId, years)`, `Burgs.togglePause(burgId)`
- **Map commands** (Map tools): `advance-map-year [years]`, `pause-all-mobiles`, `set-course`
- **Chronicle/Legends**: arrivals and departures appear as history events (phase 7).

## Phases

### Phase 1 — Data model, options & groups
- `Burg` fields (`mobile`, `mobility`, `journey`, `departedYear`, `heading`, `pausedAt`)
- new burg groups & label groups (`titan`, `titancity`, `horde`, `horde_capital`, `drift_sky`,
  `drift_island`) with zoom gating (1.5)
- Options toggles + generation limiter, threaded through schema/defaults
- `.map` backfill stub (unconditional, idempotent)

### Phase 2 — Drift mode
- `Mobile` generator pass (own seeded stream): sky/island/titan/horde placement rules
- realm rules applied (no cell slot for sky/island, titan/horde keep surface slot when docked)
- ridge/biome weighting for titan/horde options; island drift on shelves
- determinism tests

### Phase 3 — Integrity, restore, provinces, markets, states ✅ done (2026-11-12)
- `mobile-consistency` integrity rule (new): a mobile burg carries a known mobility kind; a `march` references an existing journey; drift/live never carry `journey`/`departedYear`. Unit-tested.
- `burg-routes` exemption is NOT needed: titans/hordes ride the road network (`sortBurgsByFeature`), the rest are networked by their realms.
- restore: mobile burgs are realm-class — restore matches them by projection, they pin no land, keep their treasury and population; no change required.
- markets: wanderers never found markets (realm-class) and trade at their cell's market like other realm burgs; poll tax applies while docked — no change required.
- provinces/states: mobile burgs never seat provinces (realm-class; `isSurfaceBurg` gates the seat picker) and assign to the nearest same-realm state or the surface fallback (existing realm path) — no change required.
- `isSessileSurfaceBurg` split: dropped — no mobile burg is surface-class, so the realm guards cover the province path already.
- scenario test: a wanderer-enabled map passes every integrity rule.

- Note on `march` carrying total journeys: march mode (Phase 4) will exercise the `mobile-consistency` march path end-to-end; the rule is already in place and unit-tested for it.

### Phase 4 — March mode ✅ done (2026-11-12)
- march riders link via `Burg.journey` (the burg names its journey; no payload on the journey — simpler, same idea)
- position = `f(year − departedYear)`, one lore year = the transport's hoursPerDay of marching; frozen at `pausedAt`
- ETA via `Burgs.marchEta` (hours and years); docking at the journey's end; arrival connects the burg to the roads
- `Lore.setYear` re-stamps every riding burg (positions are derived, never stored)
- chronicle events on arrival/departure deferred to the hooks for the UI (Phase 6/7)
- path rendering reuse deferred to Phase 5

### Phase 5 — Rendering ✅ done (2026-11-12)
- burg icons rotate with the burg's `heading` (`rotate(<deg> <x> <y>)`) for mobile burgs
- marching burgs carry `data-mobility="march"` for CSS targeting; marching icons get a drop-shadow in `index.css`
- labels ride along with marching burgs (`anchor: [burg.x, burg.y]` rebuilt live on every `Layers.draw`)
- `Layers.draw("burgIcons", "labels")` after the lore year changes (Lore Editor + assistant proposals) so a marching burg visibly walks with the year
- icon rotation test pinned in the burg-icons test file

### Phase 6 — Assistant & UI ✅ done (2026-11-12)
- assistant ops (registered in `METHODS` + `redraw.ts` layers): `march`, `unmarch`, `setMobility`, `setHeading`, `setDepartureYear`, `advanceMobile`, `pauseMobile`, `resumeMobile`
- context regenerated; `BurgRealm` gains titan/horde there (should already show)
- editor: Mobility row (Pinned / Drift / March icons + `Ride` journey select visible only in march mode)
- Burgs Overview: Titan and Horde realm chips in the realm filter; the creator's realm selector gains Titan and Horde; validation list extended
- map commands: `advanceMapYear` (a millennium passes and every marching burg advances), `pauseAllMobiles`, `resumeAllMobiles`; omnibar-aliases for all three
- see Phase 6 implementation notes

### Phase 7 — Live mode (Living World only) ✅ done (2026-11-12)
- `stepMobileBurgs` in `Living.tick`: one cell-graph hop per season toward a seeded far destination (shortlist roll per season, tick-seeded)
- realm ground rules (land / waters / anywhere) enforced twice: by candidate filtering and by `Burgs.move` itself; blocked moves clear the destination and re-roll next season
- `{ connect: false }` option on `Burgs.move` — the road join happens once per wander, on arrival, mirroring march's dock behavior
- chronicle coupling: `deed` event with the burg as actor on arrival, plus a `colonize` news entry; the chronicle only records live wanderers when Living World mode is on
- editor: Mobility row's fourth toggle (`icon-compass` "Live"); icons carry `data-mobility="live"` (green drop-shadow)
- assistant: `setMobility` type extended with `"live"`; context regenerated
- 5 unit tests (one hop per season, realm ground rules, pinned/drift untouched, chronicled arrival and rest season, all-water titan stays put)
- no-op when Living World is disabled (the tick only runs under the Living World HUD)

### Phase 8 — Mover economy rules ✅ done (2026-11-12)
- titan trampling: the live-hop footfall cell scours 10 development (`max(0, dev − 10)`); march/drift don't trample (derived positions, scrub-unsafe)
- a burg on the road (`Burgs.isOnTheRoad`) is outside the market grid: no poll tax, no production sold, `product`/`production` zeroed — a halted burg (paused, docked or resting) is ordinary in every way, which IS the horde's halt rule
- carried stock (`Burg.carried`): bought cheapest-first at the dock it left (treasury spent through `quoteMarket` door prices), discharged at the halt (sells at the 90% door, no centre margin; a marketless halt keeps the pack)
- the war-isle preferential arms/food buy: not shipped — no war-isle realm exists
- trade carried through regeneration: `.map` persists `carried`; no backfill needed

### Phase 9 — Verification, tests & docs
- unit suite: drift determinism, slot discipline, dock transitions, integrity, ETA math
- scenario suite: regenerate stability, restore survival with a mobile crossing a water gap
- wiki page for mobile burgs + `Non-land-burgs.md` cross-reference; plan doc updated

## Open questions (resolved 2026-11-12)

1. **Form of release**: drift for all four realms in one phase — agreed.
2. **Wander direction**: drift re-places on its own seeded stream, anywhere plausible; purposeful,
   directed migration is march mode — agreed.
3. **Titan icon**: a shallow colossi silhouette (citadel on the shoulders) — agreed on direction;
   bespoke icon art is a Phase 5 task, not Phase 1.
4. **Titan ↔ realm relationship**: titan is a new realm concept like skyburg — titan capitals and
   subordinate titan burgs; titans also may claim stationary surface burgs it passes — agreed.
5. **March first or drift first**: drift first — agreed.
6. **Volatility budget**: default 2, cap 5 — agreed.
7. **Lore coupling**: arrivals/departures always write chronicle entries — agreed.
8. **Horde ownership**: the horde is a zero-land state of its own, like realm states — agreed.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Mobile burg breaks “every burg on roads” economy invariant | `moving` exemption + docked coupling to `Routes.connect` |
| Determinism breaks (visible diff every regenerate) | separate `seed:mobile` stream; placement before routes; tests pin byte-identity |
| Province/regen/restore bugs (like the locked-realm-state one we hit) | phases ship with unit + scenario coverage per sub-system, as with multi-realm |
| Scope creep (war with titans? titan breeding?) | Phase 7+ is explicitly optional; ecosystem issues live in the plan tracker |
| User surprise (settlement moved; map looks wrong) | opt-in toggle, default 0, labels/legend name the archetype |

## Out of scope

- Naval battles for war-isles; siege of moving cities; titan birth/death; horde absorption of
  towns it passes; sky-island economy different from sky rules (it stays sky-consumer-only).
