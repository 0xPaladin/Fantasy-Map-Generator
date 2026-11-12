# Plan — Mobile burgs (drift-cities, wandering islands, living titans & roving hordes)

Updated: 2026-11-12. Inputs: `docs/plans/multi-realm.md` (the realm system mobile burgs build on), `docs/wiki/Non-land-burgs.md`.

Progress:
- Phase 1 — Data model, options & burg groups: ✅ done (2026-11-12)
- Phase 2 — Drift mode: seeded wander placement per realm: ✅ done (2026-11-12)
- Phase 3 — Integrity, markets, provinces & states for movers: pending
- Phase 4 — Journey-linked march mode (year-driven): pending
- Phase 5 — Rendering: moving icons, paths, headings: pending
- Phase 6 — Assistant operations & UI (editor, overview, creator, commands): pending
- Phase 7 — Autonomous mode (Living World tick + chronicle hooks): pending
- Phase 8 — Mover economy rules: pending
- Phase 9 — Verification, tests & docs: pending

Implementation notes:
- Phase 1 delivered: `Burg.titan` / `Burg.horde` realm flags (mutually exclusive with the other realm flags, like `flying`/`underdark`/`underwater`), the new realm kinds entered into `BurgRealm`,
  `getBurgRealm`, `isSurfaceBurg`, `isBurgInRealm`, `groundSlotOnPlacement`, `Burgs.add` and `Burgs.setRealm` (realm allow-list + titan/horde water-rejection; demotion hands the surface slot back,
  promotion back to surface validates the cell and the slot occupancy). Mobile fields on `Burg` (`mobile`, `mobility`, `journey`, `departedYear`, `heading`, `pausedAt` — additive, persisted in `.map`).
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
- `departedYear?: number` — lore year it set out (`march`, `live`).
- `heading?: number` — degrees, for titan/horde icon rotation (degrees, 0 = up/north).
- `pausedAt?: number` — lore year it halted (`march` stations the burg at a port like any other).

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

### Live (Phase 7, autonomous)

Living World tick (1 season = 1 tick, 4 ticks = 1 year): mobiles get a lightweight agenda —
`migrate` — evaluated per season:

- wander a few cells toward a plausible destination picked from a seeded shortlist (richest biome
  for a horde, most defensible coast for a war-isle, highest ground inland for a titan);
- no state expansion, no combat, no diplomacy — it's a migration, not an army;
- chronicle records "the titan passed" / "the isle came to anchor" as history events;
- a fast tick-rate avoids thrash: weight by "years since last move" like real-world breeding cycles.

Explicitly optional: maps without Living World don't pay for it.

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

- A **docked** mobile burg trades at its cell's market and pays poll tax; it is ordinary in
  every way (markets never found *at* it, realm rules apply for non-surface classes);
- A **moving** burg is outside the market grid: no `cells.market` membership, no poll tax, no
  production sold; it carries stock and buys nothing until it docks;
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

### Phase 3 — Integrity, restore, provinces, markets, states
- `isSessileSurfaceBurg` split; province seating skips mobiles
- integrity `mobile-consistency` rule; `burg-routes` exemption while moving
- restore rules (position match, pinning split by mobility state)
- market/tax dock rules; poll tax skipped while moving

### Phase 4 — March mode (junction with Journeys)
- journey `burgs`/`carrier` payload; migration destination resolution
- position from `departedYear` + transport speed; ETA for carriers; docking (`pausedAt`)
- path rendering reuse (Journeys layer + mobile-specific skin), frozen marker when docked
- chronicle events on arrival/departure

### Phase 5 — Rendering
- icon rotation by `heading` (titan/horde) — new transform in `draw-burg-icons.ts`
- "in transit" icon states; path-clause styling; label group spread for movers (avoid following text)

### Phase 6 — Assistant & UI
- assistant ops (`setMobile`, `setDepartureYear`, `setHeading`, `advanceMobile`, `togglePause`)
- editor row, overview chips, creator toggles
- map commands (`advance-map-year`, `pause-all-mobiles`)

### Phase 7 — Live mode (optional, Living World only)
- season tick evaluation; `migrate` agenda behaviour; chronicle coupling
- no-op when Living World is disabled

### Phase 8 — Mover economy rules
- titan trampling (optional: local development −10 on footfall cells, drama!)
- horde sells at markets on halt only; war-isle buys arms/food preferentially
- carried stock model (buys supplies at departure, sells what it makes on the road)

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
