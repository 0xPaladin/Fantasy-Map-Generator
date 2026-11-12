# Plan — Unified Multi-Realm Settlements, States, Routes & Economy (`sky`, `underdark`, `underwater`)

Updated: 2026-11-10. Inputs:
- [barrulus skyburg zoom & toggle design](https://github.com/barrulus/Fantasy-Map-Generator/blob/main/docs/superpowers/specs/2026-06-01-skyburg-zoom-and-toggle-design.md)
- [barrulus skyburg overhaul design](https://github.com/barrulus/Fantasy-Map-Generator/blob/main/docs/superpowers/specs/2026-06-11-skyburg-overhaul-design.md)
- `docs/architecture/architecture.md`, `docs/architecture/data-model.md`

Progress:
- Phase 1 — Data Model, Options & Realm Helpers: ✅ done
- Phase 2 — Multi-Realm Burg Generation: ✅ done
- Phase 3 — Zero-Surface-Territory States, Provinces & Labels: ✅ done
- Phase 4 — Multi-Realm Route Networks: ✅ done
- Phase 5 — Multi-Realm Economy, Production & Markets: ✅ done
- Phase 6 — Map Integrity, Auto-Update Migration & Styling: ✅ done
- Phase 7 — UI Controllers, Editors & Assistant Operations: ✅ done
- Phase 8: pending

Implementation notes:
- Realm rolls run on their own seeded stream (`Math.random = Alea(seed + ":realms")`, restored after), so the
  surface map stays byte-identical to pre-realm generation for the same seed; `Burgs.specify()` re-seeds a
  `:realm-specify` stream per run for realm population, emblems, features and skyport picks
- Realm capitals carry `capital: 1` from Phase 2, so `States.createStates`, `expandStates` burg assignment,
  `getFreeBurgs` and `MapRestoration.restoreStates`/`restoreBurgs` already skip non-surface burgs; Phase 3
  replaces the interim skip in `createStates` with real realm states
- `applyHeights` only pins land under surface burgs, so underwater and skyburgs do not raise seafloors
- `map-integrity` `burg-cells`/`cell-burgs` rules are realm-aware (only surface burgs own cell slots)
- Phase 3 additionally: sequential state ids in `createStates`/`recreate` (realm burgs may outrank ground
  towns in id space); surface-only flood-fill seeds and a realm-isolated nearest-capital assignment in
  `expandStates`; realm burgs skipped by `Provinces.generate` and `LivingGenerator.applyBorderGrowth`;
  zero-cell realm state labels render at the capital's pole while its burg group is visible; realm states are
  carried into `recreate()` and `map-restoration` keeps them on the map with their realm capital, skips the
  surface succession loop when the lost capital was realm, and skips the clawback/state-assignment for
  non-surface burgs; `Burgs.regenerate` drops realm states whose locked capital did not survive; off-map
  markers are never placed (`addMarker` rejects out-of-bounds) — they were dropped on restore before, silently
  changing marker counts; `real-map.testing.ts` seeds the ambient stream like the app boots, making the
  scenario suite order-independent
- Phase 4 additionally: realm hub flags (`skyPort`/`underdarkGate`) are assigned by `Burgs.assignRealmHubs()`
  in a `realmHubs` pipeline step between burgs and states — `specify()` runs after routes, so the flags must
  exist before route generation (the cell score stands in for burg population, which specify assigns later);
  surface road/trail/sea builders skip realm burgs entirely and realm paths never enter the shared
  `connections` discount map; air lanes arc between far-apart cells so `route-steps` integrity only checks
  surface networks and `restoreRoutes` must not gap-fill their points; the journeys route-chain BFS gained
  an allowed-groups filter with a domain→groups registry (`airroutes`/`underdarkroutes`/`undersearoutes`
  resolve to their realm's mode)
- Phase 5 additionally: realm economies are a tag-based production layer in `production-generator` —
  skyburgs are consumer-only (imports only, no manufacture), underdark holds exclude surface sources
  (forestry/livestock) while mining ore/minerals ×1.8 (×1.25 more over mountain roots or mineral riches),
  farming fungi ×0.4 and crafting ×1.3 (ritual/educational goods too), underwater settlements harvest
  aquatic goods ×1.8, farm kelp ×0.5 and mine vents ×0.6. Markets never found at realm burgs; realm burgs
  trade through their portal hub's market (skyport/gate/coastal port, falling back to a realm capital's or
  the surface market below them). `transports-generator` needed no changes: its four domains already
  cover realm travel
- Phase 6 additionally: `VERSION` stays with upstream master (the fork ships the realm work ahead of the
  upstream release), so the older `.map` backfill in `auto-update.ts` runs unconditionally and idempotently
  — it adds the missing realm burg groups, burg label groups and realm route/icon/label styles to the
  loaded record; new maps are untouched. `map-repair` clears realm burgs from `cells.burg` cell slots on
  load (realm burgs never own a slot); `map-integrity` knows realm burgs are non-owning (phases 1–4). The
  realm route/icon/label styles ship as defaults; realm minor-hold icons gate on `zoomThreshold` (1.5,
  appearing on zoom-in) and `invokeActiveZooming` toggles them by scale; realm label groups exist in the
  label registry with `zoom.min = 1.5`, which also removes them from world-level label collision since
  label spread only sees visible groups
- Phase 7 additionally: Burg Editor gained a Realm row (sky/underdark/underwater icons, mutually exclusive
  toggles) and a Hub row (skyPort/underdarkGate, surface-only); the Altitude field shows `+X ft above
  surface` / `X ft below ground` / `X ft below sea level` (thousand separators) and is editable inline.
  Burgs Overview has realm + hub filter badge chips; its + button reads a realm selector beside it.
  Burg Creator arms realm-aware placement (`Burgs.add(x, y, realm)`), validating cell compatibility by
  realm. Options tab adds a "Realm networks" checkbox trio for new maps — imperative binding, not the
  `data-option` event path (checkboxes don't read `.value`). The Assistant can call
  `Burgs.setRealm/setSkyPort/setUnderdarkGate/setAltitude`; `Burgs.add` gains the realm argument; the
  realm layers (burgIcons, labels, emblems, population) draw on any realm change. The cached-instructions
  budget moved from 15,800 to 15,850 chars (the realm network genuinely needs the room; documented inline
  in context.test.ts). `Burgs.setRealm` assigns the nearest same-realm state by Euclidean distance, or
  neutrals if none exists; the realm burg never takes the surface cell's slot

---

## Goal

Extend the map generator from a single-surface settlement layer into a **unified four-realm vertical architecture**:

1. **Surface (`surface`)**: Standard land and coastal burgs, surface states, provinces, roads, trails, and sea routes.
2. **Sky (`sky` / `flying: 1`)**: Floating settlements above land or water (`+50 to +500 ft` above local surface), zero-surface-territory **Sky States**, ground **Skyport (`skyPort: 1`)** hubs, and point-to-point **Air Routes (`airroutes`)**.
3. **Underdark (`underdark: 1`)**: Subterranean settlements beneath land cells (`-200 to -3,000 ft` below surface, weighted toward mountain roots, highlands, and cave markers), zero-surface-territory **Underdark States**, surface **Underdark Gate (`underdarkGate: 1`)** entrance hubs, and A* subterranean **Underdark Routes (`underdarkroutes`)** that prefer solid bedrock and avoid deep oceans.
4. **Underwater (`underwater: 1`)**: Benthic/subsea settlements in water cells (`-50 to -2,000 ft` below sea level, weighted toward continental shelves and ocean trenches), zero-land-territory **Aquatic States**, coastal **Port (`port > 0`)** trade bridges, and water-cell A* **Undersea Routes (`undersearoutes`)**.

---

## Core Architectural Invariants

Because `pack.cells.burg` (Uint16Array) and `pack.cells.state` (Uint16Array) are flat 1-value-per-cell arrays, all three non-surface realms share four foundational invariants:

### 1. Non-Owning Cell Slots (`pack.cells.burg`)
- `pack.cells.burg[cell]` is strictly reserved for the primary **surface** burg in `cell`.
- Non-surface burgs (`!isSurfaceBurg(b)`) store their `b.cell` reference on the `Burg` object in `pack.burgs` and **never** write to `pack.cells.burg[cell]`.
- Multiple realms can coexist in the exact same Voronoi cell (e.g., a surface capital, an Underdark city directly beneath it, and a Skyhold floating above it).
- Removing or moving a non-surface burg only clears `pack.cells.burg[cell]` if `pack.cells.burg[cell] === burgId` (legacy/corrupt save healing).

### 2. Zero-Surface-Territory States (`pack.states` & `pack.cells.state`)
- `States.createStates()` assigns dense sequential state IDs (`i: states.length`) rather than `i: burg.i`, because non-surface capitals are generated after ground towns and have high `burg.i` indices.
- `States.expandStates()` only seeds the surface Dijkstra flood-fill queue for **surface** capitals (`isSurfaceBurg(capital)`).
- Non-surface states (`sky`, `underdark`, `underwater`) claim `0` surface land cells (`state.cells === 0`), set `state.pole = [capital.x, capital.y]`, and assign state ownership directly on their realm's `pack.burgs`.
- `Provinces.generate()` skips non-surface burgs and zero-cell states so non-surface realms never fracture surface province borders.
- `buildStateLabels()` in `src/renderers/labels/label-data.ts` renders zero-cell non-surface state labels horizontally at `state.pole` when their realm's burg groups are visible.

### 3. Feature-Driven Burg Groups & Zoom Tiering
- `Burg` retains explicit boolean flags (`flying?: 1`, `underdark?: 1`, `underwater?: 1`) so `burgGroup` feature matching (`features: Record<string, boolean>`) in `src/model/options/options-schema.ts` works without special-casing.
- Minor non-surface burg groups (`skyhold`, `underdark_hold`, `underwater_settlement`) default to `zoomThreshold: 1.5`, hiding at world overview zoom (`scale < 1.5`) and appearing on zoom-in, while realm capitals (`skyheart`, `underdark_capital`, `underwater_capital`) remain visible at all zoom levels.

### 4. Realm-Specific Route Networks & Cross-Realm Portal Hubs

| Realm | Burg Flag | Capital / Town Burg Groups | Surface Bridge Hub | Route Group | Pathfinding Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sky** | `flying: 1` | `skyheart` / `skyhold` | `skyPort: 1` (ground airfields) | `airroutes` | Toroidal/flat Urquhart graph (`calculateUrquhartEdges`); direct point-to-point splines ignoring terrain |
| **Underdark** | `underdark: 1` | `underdark_capital` / `underdark_hold` | `underdarkGate: 1` (surface mines, sinkholes, dwarven gates) | `underdarkroutes` | Urquhart graph + A* `findPath` with **inverted bedrock cost** (cheap under mountains `h >= 50`, costly under rivers, blocked under deep ocean `t < -1`) |
| **Underwater** | `underwater: 1` | `underwater_capital` / `underwater_settlement` | Existing coastal `port > 0` | `undersearoutes` | Urquhart graph + water-cell A* (`cells.h < 20`), routing across shelves/trenches without requiring surface `haven` cells |

---

## Current State in This Fork

| Component | Status | File |
| :--- | :--- | :--- |
| `calculateUrquhartEdges`, `calculateWrapUrquhartEdges`, `splitAtSeam` | ✅ present | `src/model/economy/routes-generator.ts` |
| `burgGroup` schema with `features: z.record(z.string(), z.boolean())` | ✅ present | `src/model/options/options-schema.ts` |
| `fitStateLabel` zero-cell fallback (`!cellsNumber` → horizontal point label) | ✅ present | `src/renderers/labels/fit-state-label.ts` |
| Fantasy/Underdark/Aquatic cultures in culture sets | ✅ present | `src/data/culture-sets.ts` |
| `BurgRealm` helpers (`flying`, `underdark`, `underwater`, `skyPort`, `underdarkGate`, `altitude`) | ✅ present | `src/model/political/burgs-generator.ts` |
| Multi-realm burg generation & cell-slot protection | ✅ present | `src/model/political/burgs-generator.ts` |
| Zero-surface-territory states (`sky`, `underdark`, `underwater`) | ✅ present | `src/model/political/states-generator.ts` |
| Multi-realm route networks (`airroutes`, `underdarkroutes`, `undersearoutes`) | ✅ present | `src/model/economy/routes-generator.ts` |
| Style schema, default styles & zoom threshold toggles | ✅ present | `src/model/styles/default-styles.json`, `draw-burg-icons.ts`, `labels-generator.ts`, `ui/map/zoom.ts` |
| Multi-realm production & cross-realm market linking | ✅ present | `src/model/economy/production-generator.ts`, `markets-generator.ts` |
| Style schema, default styles & zoom threshold toggles | ❌ missing | `src/model/styles/default-styles.json`, `draw-burg-icons.ts`, `draw-burg-labels.ts` |
| Editor controls (Burg Editor, Overview, Creator, Options, Assistant) | ✅ present | `src/controllers/political/burgs/*`, `options-tab.ts`, `assistant/*` |

---

## Phase 1 — Data Model, Options & Realm Helpers

**Files:**
- `src/model/political/burgs-generator.ts`
- `src/model/options/options-schema.ts`
- `src/model/options/default-options.ts`
- `src/data/culture-sets.ts`

### 1.1 `Burg` Interface & Realm Helpers (`src/model/political/burgs-generator.ts`)

Extend `Burg` with multi-realm fields:

```ts
export type BurgRealm = "surface" | "sky" | "underdark" | "underwater";

export interface Burg {
  // ... existing fields ...
  flying?: 1;
  underdark?: 1;
  underwater?: 1;
  skyPort?: 1;
  underdarkGate?: 1;
  /**
   * Vertical offset in feet relative to the cell's surface:
   * - Skyburgs: +50 to +500 ft above surface
   * - Underdark burgs: -200 to -3000 ft below ground
   * - Underwater burgs: -50 to -2000 ft below sea level
   */
  altitude?: number;
}

export function getBurgRealm(
  b: Pick<Burg, "flying" | "underdark" | "underwater"> | undefined,
): BurgRealm {
  if (!b) return "surface";
  if (b.flying) return "sky";
  if (b.underdark) return "underdark";
  if (b.underwater) return "underwater";
  return "surface";
}

export function isSurfaceBurg(
  b: Pick<Burg, "flying" | "underdark" | "underwater"> | undefined,
): boolean {
  return getBurgRealm(b) === "surface";
}

export function isBurgInRealm(
  b: Pick<Burg, "flying" | "underdark" | "underwater"> | undefined,
  realm: BurgRealm,
): boolean {
  return getBurgRealm(b) === realm;
}
```

### 1.2 Cell-Slot Helper Functions (`src/model/political/burgs-generator.ts`)

Add pure helpers used by generation, editing, assistant operations, and map integrity:

```ts
/** Value to write to `pack.cells.burg[cell]` when placing `burg` onto `cell`. */
export function groundSlotOnPlacement(
  currentSlot: number,
  burg: Pick<Burg, "i" | "flying" | "underdark" | "underwater">,
): number {
  return isSurfaceBurg(burg) ? burg.i : currentSlot;
}

/** Value to write to `pack.cells.burg[cell]` when removing/moving `removedBurgId`. */
export function cellSlotAfterRemoval(
  currentSlot: number,
  removedBurgId: number,
): number {
  return currentSlot === removedBurgId ? 0 : currentSlot;
}
```

### 1.3 Generation Options & Burg Groups (`src/model/options/options-schema.ts`, `default-options.ts`)

1. Add `zoomThreshold: z.number().min(0).optional()` to `burgGroup` in `options-schema.ts`.
2. Add generation toggles/counts under `options.map.population`:
   - `skyBurgs: z.boolean().default(true)`
   - `underdarkBurgs: z.boolean().default(true)`
   - `underwaterBurgs: z.boolean().default(true)`
3. Add default `burgGroups` in `default-options.ts` (before `city`/`town` so feature-matched realms resolve first):
   - `skyheart`: `{ name: "skyheart", active: true, isCapital: true, features: { flying: true }, order: 5 }`
   - `skyhold`: `{ name: "skyhold", active: true, isCapital: false, features: { flying: true }, order: 6, zoomThreshold: 1.5 }`
   - `underdark_capital`: `{ name: "underdark_capital", active: true, isCapital: true, features: { underdark: true }, order: 7 }`
   - `underdark_hold`: `{ name: "underdark_hold", active: true, isCapital: false, features: { underdark: true }, order: 8, zoomThreshold: 1.5 }`
   - `underwater_capital`: `{ name: "underwater_capital", active: true, isCapital: true, features: { underwater: true }, order: 9 }`
   - `underwater_settlement`: `{ name: "underwater_settlement", active: true, isCapital: false, features: { underwater: true }, order: 10, zoomThreshold: 1.5 }`

---

## Phase 2 — Multi-Realm Burg Generation

**File:** `src/model/political/burgs-generator.ts`

### 2.1 Realm Placement & Count Scaling

In `Burgs.generate()`, after surface capitals and towns are placed:

1. **Skyburgs (`generateSkyBurgs`)**:
   - Skip if `!options.map.population.skyBurgs`.
   - Count scales with cell density: `baseCount = Math.max(1, Math.round(cells.i.length / 2500))`, `count = rand(baseCount, baseCount * 2)`.
   - Valid across any cell (`cells.i`); `Math.min(2, Math.max(1, Math.floor(count / 3)))` become Sky capitals (`capital: 1`), spaced via `d3.quadtree`.
   - `altitude: rand(5, 50) * 10` (`+50 to +500 ft`).

2. **Underdark Burgs (`generateUnderdarkBurgs`)**:
   - Skip if `!options.map.population.underdarkBurgs`.
   - Candidate cells: land cells (`cells.h >= 20`), weighted by subterranean suitability:
     - High elevation/mountain root bonus (`cells.h >= 50` gets `3x` weight; `cells.h >= 70` gets `5x` weight).
     - Bonus if cell has a cave/mine/dungeon marker or subterranean culture (Drow, Dwarven, Duergar, Goblin).
   - Count: `baseCount = Math.max(1, Math.round(landCells.length / 2000))`, `count = rand(baseCount, baseCount * 2)`.
   - `1–2` capitals (`capital: 1`, `underdark: 1`), remainder towns (`capital: 0`, `underdark: 1`).
   - `altitude: -rand(20, 300) * 10` (`-200 to -3,000 ft`).

3. **Underwater Burgs (`generateUnderwaterBurgs`)**:
   - Skip if `!options.map.population.underwaterBurgs`.
   - Candidate cells: water cells (`cells.h < 20`), weighted toward continental shelves (`cells.t === -1 || cells.t === -2` get `3x` weight) and warm/temperate waters.
   - Count: `baseCount = Math.max(1, Math.round(waterCells.length / 2500))`, `count = rand(baseCount, baseCount * 2)`.
   - `1–2` capitals (`capital: 1`, `underwater: 1`), remainder towns (`capital: 0`, `underwater: 1`).
   - `altitude: -rand(5, 200) * 10` (`-50 to -2,000 ft`).
   - Culture selection prefers aquatic cultures if present in the active culture set, otherwise adapts the nearest coastal culture.

### 2.2 Cross-Realm Portal Hubs (`specifySkyPorts` & `specifyUnderdarkGates`)

In `Burgs.specify()`:
- **`specifySkyPorts()`**: Marks surface capitals and top-population surface cities (`!b.flying && isSurfaceBurg(b)`) as `skyPort: 1` (minimum spacing `Math.hypot(graphWidth, graphHeight) * 0.06`, ~35% of non-capital surface burgs with `population > 5`).
- **`specifyUnderdarkGates()`**: For each Underdark burg, finds the nearest surface land burg within `Math.hypot(graphWidth, graphHeight) * 0.12` (preferring mountain/hill surface burgs or capitals) and marks it `underdarkGate: 1`.
- **Underwater Bridges**: Reuses existing coastal `port > 0` surface burgs—no extra flag needed, as coastal ports naturally bridge surface roads/sea routes to `undersearoutes`.

### 2.3 Population & Feature Assignment (`defineBurgFeatures`)

- `flying: 1`: Never `port`, `walls: 0`, `plaza: P(0.5)`, `temple: P(0.5)`, `shanty: 0`, population `rand(1, 10)` (capitals) or `rand(1, 5)` (holds).
- `underdark: 1`: Never `port`, `citadel: P(0.8)`, `walls: P(0.85)`, `plaza: P(0.6)`, `temple: P(0.7)`, population `rand(5, 25)` (capitals) or `rand(1, 12)` (holds).
- `underwater: 1`: Never surface `port`, `citadel: P(0.6)`, `walls: P(0.4)`, `plaza: P(0.7)`, `temple: P(0.6)`, population `rand(4, 20)` (capitals) or `rand(1, 10)` (settlements).

---

## Phase 3 — Zero-Surface-Territory States, Provinces & Labels

**Files:**
- `src/model/political/states-generator.ts`
- `src/model/political/provinces-generator.ts`
- `src/model/physical/living-generator.ts`
- `src/renderers/labels/label-data.ts`

### 3.1 `States.createStates` & `States.expandStates` (`src/model/political/states-generator.ts`)

1. **Sequential State IDs**:
   - In `createStates()`, set `const stateId = states.length` (`i: stateId`) and assign `b.state = stateId` on the capital burg instead of assuming `state.i === burg.i`.
2. **Realm-Isolated State Assignment**:
   - In `expandStates()`:
     - Only push **surface** capitals (`isSurfaceBurg(pack.burgs[s.capital])`) into the surface cell flood-fill queue.
     - Assign **surface** non-capital burgs from `cells.state[b.cell]`.
     - For each non-surface realm (`"sky"`, `"underdark"`, `"underwater"`):
       - Collect active states whose capital belongs to that realm (`getBurgRealm(burgs[s.capital]) === realm`).
       - Assign non-capital burgs of the **same realm** to the nearest realm state (by Euclidean distance to the realm capital), or fallback to the nearest surface state if no state exists for that realm.
3. **Zero-Cell State Metadata & Poles**:
   - In `getPoles()`, for any active state with `!s.cells && s.capital`, set `s.pole = [burgs[s.capital].x, burgs[s.capital].y]`.
   - In `collectStatistics()`, preserve non-surface state `area: 0`, `cells: 0`, while summing `burgs` and `urban` population from its owned realm burgs.
   - In `States.setCells()`, only overwrite `b.state = cells.state[b.cell]` when `isSurfaceBurg(b)`.

### 3.2 `Provinces.generate` & `LivingGenerator` (`provinces-generator.ts`, `living-generator.ts`)

- In `Provinces.generate()`, skip states with `!s.cells` or `!isSurfaceBurg(burgs[s.capital])`, and filter `!isSurfaceBurg(b)` when seeding provinces from burgs.
- In `LivingGenerator`, ensure surface territory expansion only targets surface states (`s.cells > 0`), while allowing Underdark and Underwater burgs to participate in realm-appropriate threat/encounter hooks.

### 3.3 State Label Rendering (`src/renderers/labels/label-data.ts`)

In `buildStateLabels()`:
- Replace `if (fits && !state.cells) return undefined;` with a realm-visibility check:
  - If `!state.cells`, inspect `const capital = pack.burgs[state.capital]`.
  - If `!capital || isSurfaceBurg(capital)`, return `undefined`.
  - Check whether the capital's resolved `burgGroup` is active (`resolveBurgGroup(capital, burgGroups)?.active`); if active, allow `fitStateLabel` (which already returns a horizontal point label at `state.pole` when `cells === 0`) to emit the state label.

---

## Phase 4 — Multi-Realm Route Networks (`airroutes`, `underdarkroutes`, `undersearoutes`)

**Files:**
- `src/model/economy/routes-generator.ts`
- `src/model/story/journeys/journeys-generator.ts`

### 4.1 Air Routes (`buildAirLinks` in `src/model/economy/routes-generator.ts`)

1. Collect all active burgs where `b.flying || b.skyPort`.
2. Compute the Urquhart graph using `calculateWrapUrquhartEdges` (when `isWrapEnabled()`) or `calculateUrquhartEdges`.
3. Keep edges where at least one endpoint is `flying: 1`, plus up to 2 shortest `skyPort ↔ skyPort` trunk connections (`d <= maxSpan * 0.25`).
4. Ensure every `flying: 1` burg connects to at least one `skyPort: 1` ground hub so Skyburgs link into the surface trade network.
5. Emit route entries with `group: "airroutes"`, `feature: 0`, and `[x, y, cellId]` points (splitting seam-crossing edges with `splitAtSeam`).
6. Curve 3-point air routes in `Routes.getPath()` using `d3.curveCatmullRom.alpha(0.5)` with a perpendicular midpoint offset (`8%` of chord length).

### 4.2 Underdark Routes (`buildUnderdarkLinks` in `src/model/economy/routes-generator.ts`)

1. Collect all active burgs where `b.underdark || b.underdarkGate`.
2. Compute Urquhart edges across these nodes, keeping edges where at least one endpoint is `underdark: 1` and distance `<= maxSpan * 0.35`.
3. Ensure every `underdark: 1` burg links to its nearest `underdarkGate: 1` (or nearest Underdark neighbor connected to a gate).
4. Pathfind each edge using `findPath(startCell, endCell, getUnderdarkCellCost)`:
   - **Subterranean Cost Evaluator (`getUnderdarkCellCost`)**:
     - Deep ocean (`cells.h < 20 && cells.t < -1`): `Infinity` (impassable abyssal crust).
     - Shallow shelf water (`cells.h < 20 && cells.t === -1`): `120` (costly under-strait tunnel).
     - Mountain / Highland bedrock (`cells.h >= 50`): `10` (ideal solid stone for tunneling).
     - Standard land (`20 <= cells.h < 50`): `25`.
     - River / Lake cell (`cells.r[cell] > 0`): `+35` seepage/engineering penalty.
     - Existing `underdarkroutes` cell reuse discount: `× 0.5` (encourages shared great subterranean highways).
5. Emit route entries with `group: "underdarkroutes"`, `feature: 0`.

### 4.3 Undersea Routes (`buildUnderseaLinks` in `src/model/economy/routes-generator.ts`)

1. Collect all active `underwater: 1` burgs plus the nearest coastal `port > 0` surface burg for each Underwater burg (within `maxSpan * 0.2`).
2. Compute Urquhart edges (seam-aware when `isWrapEnabled()`).
3. Pathfind each edge through water cells (`cells.h < 20` or coastal `port` endpoint cell) using `findPath` with an aquatic cost function:
   - Land cells (`cells.h >= 20`, unless endpoint coastal port): `Infinity`.
   - Continental shelf (`cells.t === -1 || cells.t === -2`): `12`.
   - Deep ocean (`cells.t < -2`): `20`.
   - Existing `undersearoutes` cell reuse discount: `× 0.6`.
4. Emit route entries with `group: "undersearoutes"`, `feature: 0`.

### 4.4 Journeys Integration (`src/model/story/journeys/journeys-generator.ts`)

- Register `airroutes` (`mode: "air"`), `underdarkroutes` (`mode: "subterranean"`), and `undersearoutes` (`mode: "aquatic"`) in `Journeys` route-mode resolution so story journeys can traverse all three realms.

---

## Phase 5 — Multi-Realm Economy, Production & Markets

**Files:**
- `src/model/economy/production-generator.ts`
- `src/model/economy/markets-generator.ts`
- `src/model/economy/transports-generator.ts`

### 5.1 Realm-Specific Production (`src/model/economy/production-generator.ts`)

Update `calculateBurgProduction(burg, pack)`:
- **Sky (`burg.flying`)**: Consumer-only (`return {}`), importing food and goods from connected `skyPort` markets.
- **Underdark (`burg.underdark`)**:
  - Zero surface `forestry` or `livestock`.
  - Subterranean mushroom/fungal cultivation (`farming: 0.4 * popFactor`).
  - High subterranean `mining` (`1.8 * popFactor`, boosted further by mountain height `cells.h >= 50` or mineral resources).
  - Strong artisan `manufacturing` (`1.3 * popFactor`) and `alchemy`/`magic` output.
- **Underwater (`burg.underwater`)**:
  - Zero `forestry` or `livestock`.
  - Kelp/aquaculture (`farming: 0.5 * popFactor`) and rich marine harvesting (`fishing: 1.8 * popFactor`).
  - Vent/trench `mining` (`0.6 * popFactor`) and pearl/coral `luxury` goods.

### 5.2 Cross-Realm Market Attachment (`src/model/economy/markets-generator.ts`)

In `Markets.generate()`:
1. Surface markets form around capitals and major trade hubs as before.
2. Realm capitals (`flying`, `underdark`, `underwater` with `capital: 1`) can also anchor realm markets, or non-surface burgs attach to the market of their connected cross-realm portal hub:
   - `flying: 1` burgs attach to the market of their connected `skyPort` (or nearest `skyPort` within `maxDist`).
   - `underdark: 1` burgs attach to the market of their connected `underdarkGate` (or Underdark capital market).
   - `underwater: 1` burgs attach to the market of their connected coastal `port` (or Underwater capital market).

---

## Phase 6 — Map Integrity, Auto-Update Migration & Styling

**Files:**
- `src/model/map-integrity.ts`
- `src/services/io/auto-update.ts`
- `src/model/styles/default-styles.json`
- `src/model/styles/styles-schema.ts`
- `src/renderers/draw-burg-icons.ts`
- `src/renderers/draw-burg-labels.ts`
- `src/model/physical/labels-generator.ts`

### 6.1 Map Integrity & Load Migration (`map-integrity.ts`, `auto-update.ts`)

1. **`validateCellsBurg` (`map-integrity.ts`)**:
   - Only assign `cells.burg[b.cell] = b.i` when `isSurfaceBurg(b)`.
   - Clear `cells.burg[c] = 0` if the referenced burg is removed, missing, or non-surface (`!isSurfaceBurg(burgs[id])`).
2. **Map Migration (`src/services/io/auto-update.ts`)**:
   - Following FMG 2.0 rules, keep all `.map` version upgrades in `auto-update.ts`: backfill missing `burgGroups` (`skyheart`, `skyhold`, `underdark_capital`, `underdark_hold`, `underwater_capital`, `underwater_settlement`) and missing route/icon/label styles (`#airroutes`, `#underdarkroutes`, `#undersearoutes`) when upgrading older saved maps.

### 6.2 Default Styles & Zoom-Tier Visibility (`default-styles.json`, `draw-burg-icons.ts`, `draw-burg-labels.ts`)

1. **Route Styles (`default-styles.json`)**:
   - `#airroutes`: `{ "stroke": "#4fc3f7", "stroke-width": 0.45, "stroke-dasharray": "2 1.5", "stroke-linecap": "round", "opacity": 0.85 }`
   - `#underdarkroutes`: `{ "stroke": "#ab47bc", "stroke-width": 0.5, "stroke-dasharray": "1.2 1", "stroke-linecap": "round", "opacity": 0.85 }`
   - `#undersearoutes`: `{ "stroke": "#00acc1", "stroke-width": 0.45, "stroke-dasharray": "1.8 1.2", "stroke-linecap": "round", "opacity": 0.8 }`
2. **Burg Icon & Label Groups (`default-styles.json`)**:
   - `skyheart` / `skyhold`: Cyan/celestial accent (`#e1f5fe` / `#4fc3f7`).
   - `underdark_capital` / `underdark_hold`: Deep amethyst/obsidian accent (`#f3e5f5` / `#8e24aa`).
   - `underwater_capital` / `underwater_settlement`: Abyssal teal/aqua accent (`#e0f7fa` / `#00838f`).
3. **Zoom-Tier Filtering (`draw-burg-icons.ts`, `draw-burg-labels.ts`, `labels-generator.ts`)**:
   - Apply `data-zoom-threshold` on SVG groups whose `burgGroup.zoomThreshold > 0`.
   - Toggle visibility in `invokeActiveZooming()` when `scale >= threshold`.
   - Skip `zoomThreshold > 1` groups during world-level label collision (`labels-generator.ts`) so hidden minor holds do not displace state labels.

---

## Phase 7 — UI Controllers, Editors & Assistant Operations

**Files:**
- `src/controllers/political/burgs/burg-editor.ts`
- `src/controllers/political/burgs/burgs-overview.ts`
- `src/controllers/political/burgs/burg-creator.ts`
- `src/controllers/options-controller.ts`
- `src/controllers/assistant/operations.ts`
- `src/controllers/assistant/redraw.ts`
- `index.html`

1. **Burg Editor (`burg-editor.ts` & `index.html`)**:
   - Add realm toggles (`Flying / Skyburg`, `Underdark`, `Underwater`)—mutually exclusive with each other—and hub toggles (`Skyport`, `Underdark Gate`).
   - Display formatted vertical elevation/depth (`+250 ft above surface`, `-1,200 ft below ground`, `-400 ft below sea level`).
   - On relocation drag (`dragBurg`), update `cells.burg` via `cellSlotAfterRemoval` and `groundSlotOnPlacement` so dragging a non-surface burg over a surface city never overwrites the surface city's cell slot.
2. **Burgs Overview (`burgs-overview.ts`)**:
   - Add realm & hub filter badges (`Surface`, `Sky`, `Underdark`, `Underwater`, `Skyport`, `Underdark Gate`).
3. **Burg Creator (`burg-creator.ts`)**:
   - Allow placing a new burg into any realm (`Surface`, `Sky`, `Underdark`, `Underwater`), validating cell compatibility (e.g., `Underwater` requires `cells.h < 20`, `Surface`/`Underdark` require `cells.h >= 20`, `Sky` allows any cell).
4. **Options Controller (`options-controller.ts` & `index.html`)**:
   - Add checkboxes for `Sky Burgs`, `Underdark Burgs`, and `Underwater Burgs` in the Options tab.
5. **AI Assistant (`src/controllers/assistant/operations.ts`, `redraw.ts`)**:
   - Support `realm: "surface" | "sky" | "underdark" | "underwater"`, `skyPort`, `underdarkGate`, and `altitude` in `burg.add` and `burg.update`, using `groundSlotOnPlacement` and `cellSlotAfterRemoval`.

---

## Phase 8 — Verification & Unit Tests

**Files:**
- `src/model/political/burgs-generator.test.ts`
- `src/model/political/states-generator.test.ts`
- `src/model/economy/routes-generator.test.ts`
- `src/model/economy/production-generator.test.ts`
- `src/model/economy/markets-generator.test.ts`
- `src/model/map-integrity.test.ts`

1. **Cell-Slot Coexistence Tests**: Verify a Surface burg, a Skyburg, and an Underdark burg can occupy the same cell `c`, with `pack.cells.burg[c]` always equal to the Surface burg's ID across placement, relocation, removal, and `validateCellsBurg`.
2. **Zero-Surface-Territory State Tests**: Verify Sky, Underdark, and Underwater capitals create states with dense sequential IDs, `cells === 0`, valid `pole` coordinates, and `0` provinces, while retaining state ownership on their realm's burgs.
3. **Route Network Tests**:
   - Verify `airroutes` connect `flying: 1` burgs and `skyPort: 1` hubs.
   - Verify `underdarkroutes` prefer high-elevation cells (`h >= 50`), avoid deep ocean cells (`t < -1`), and connect `underdark: 1` burgs to `underdarkGate: 1` hubs.
   - Verify `undersearoutes` stay within water cells (`h < 20`) and coastal `port` endpoints.
4. **Economy & Market Tests**: Verify Skyburgs produce `{}` while Underdark burgs produce mining/fungal goods and Underwater burgs produce marine goods, and all three realms attach to markets via their portal hubs.
5. Run `npm run test` (Vitest) and `npm run lint` (Biome).
