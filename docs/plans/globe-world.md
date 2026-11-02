# Plan — Globe world: full-globe heightmaps, seam-wrapped sea routes, globe view

Updated: 2026-10-31. Inputs:
[barrulus globeWorld heightmap design](https://github.com/barrulus/Fantasy-Map-Generator/blob/main/docs/superpowers/specs/2026-06-01-globe-world-heightmap-design.md),
[barrulus seam-wrapping routes plan](https://github.com/barrulus/Fantasy-Map-Generator/blob/main/docs/superpowers/plans/2026-06-02-seam-wrapping-routes.md),
`docs/domain/3d-view.md`.

## Goal

Make a 360°-longitude map behave as a globe instead of a flat rectangle:

1. A heightmap template that leaves the left/right edges as ocean, so the
   antimeridian seam is invisible when the map is wrapped on a sphere.
2. Sea routes that can cross that seam instead of detouring across the whole map.
3. A 3D globe view that wraps the rendered map onto a sphere (already present —
   verify and document only).

## Current state in this fork

| Piece | Status | Where |
| --- | --- | --- |
| `lonT = min((w/h) × latT, 360)` | ✅ present | `src/model/physical/coordinates.ts` |
| 3D globe view (`newGlobe`, `updateGlobeTexure`, `SphereGeometry`) | ✅ present (newer refactor than barrulus) | `src/renderers/view-3d-renderer.ts` |
| Globe/mesh/standard switch | ✅ present | `src/renderers/view-mode.ts` |
| `Power` heightmap tool | ❌ missing | `src/model/physical/heightmap-generator.ts` |
| `globeWorld` template | ❌ missing | `src/data/heightmap-templates.ts` |
| Seam-wrapped routes | ❌ missing | `src/model/economy/routes-generator.ts` |

So the work is **Phase 1 + 2 + 3**; Phase 4 is verification/docs.

## Non-goals

- No toroidal Voronoi generation (cells still stop at the map edge).
- No air routes / sky burgs — this fork has no air-domain routes, so only sea
  routes wrap.
- No new persisted fields: route points stay in `[0, graph.width]`.
- Globe rendering is presentation-only and must never mutate map data.

---

## Phase 1 — `Power` heightmap tool

**File:** `src/model/physical/heightmap-generator.ts`

The tool is a one-line exposure of the existing `modify(..., power)` branch —
`modify` already does `(h - 20) ** power + 20` for land.

1. Add `"Power"` to the `Tool` union (line 11).
2. Add a branch in `addStep`, after `Multiply`:

```ts
if (tool === "Power") {
  this.modify(a3, 0, 1, +a2); // syntax: Power <exponent> <range>
  return;
}
```

**Acceptance:** a template line `Power 0.9 land` compiles, and a land cell at
`h=60` lands near `h=38`; `Power 0.9 all` compresses water too.

---

## Phase 2 — `globeWorld` template

**File:** `src/data/heightmap-templates.ts`

Append the template (same shape as barrulus, matching this fork's indentation):

```ts
const globeWorld = `Hill 1 60-70 22-38 20-80
  Hill 1 60-70 62-78 20-80
  Hill 4-5 15-25 20-80 15-85
  Smooth 2 0 0 0
  Multiply 0.35 land 0 0
  Range 2-3 60-75 25-75 25-75
  Smooth 2 0 0 0
  Mask 2 0 0 0
  Smooth 3 0 0 0`;
```

Register it as id 14 (next free id; do not renumber existing templates):

```ts
globeWorld: { id: 14, name: t("Globe World"), template: globeWorld, probability: 5 }
```

Why it works: hills are constrained to 20–80% X, and `Mask 2` halves heights at
the left/right edges (`h × (1 + distance) / 2`, `distance = 0` at the frame), so
edge residuals fall below the `h < 20` ocean threshold.

**Acceptance:** generating `globeWorld` at several seeds leaves the first/last
~2% of columns as water; the rendered map wrapped on the globe shows no vertical
seam line.

---

## Phase 3 — Seam-wrapped sea routes

**Files:** `src/model/economy/routes-generator.ts`,
`src/model/economy/routes-generator.test.ts`.

Everything is gated on the map covering a full globe:
`options.map.geography.coordinates.lonT === 360`. On any other map behavior is
unchanged. Unlike barrulus there is **no `findPath` heuristic change needed**:
this fork's `findPath` is plain Dijkstra (`FlatQueue`, no goal argument), so only
the adjacency and cost need to wrap.

### 3.1 Wrap helpers

Add near the top of `routes-generator.ts`:

```ts
const isWrapEnabled = (): boolean => options.map.geography.coordinates?.lonT === 360;
const graphWidth = (): number => options.map.graph.width;

export function wrapDeltaX(dx: number, width: number): number {
  const abs = Math.abs(dx);
  return Math.min(abs, width - abs);
}

export function wrapDistanceSquared(a: Point, b: Point, wrap: boolean, width: number): number {
  const dx = wrap ? wrapDeltaX(a[0] - b[0], width) : a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}
```

### 3.2 Toroidal Urquhart graph

Change `calculateUrquhartEdges(points)` to
`calculateUrquhartEdges(points, wrap = false, width = 0)`. When
`wrap && width > 0`, delegate to a new `calculateWrapUrquhartEdges`:

- duplicate every point at `x ± width` (ghost copies), remember `realOf`;
- run the existing Delaunay/Urquhart pass on the augmented set;
- map each kept edge back through `realOf`, drop self-loops, dedupe by index pair.

This makes ports near opposite frame edges pair with each other. Use it in
`generateSeaRoutes` only (roads/trails never wrap).

### 3.3 Seam-augmented sea adjacency

Add `private buildSeaAdjacency(): number[][]`:

- collect water cells with `x <= grid.spacing` (west) and `x >= width - grid.spacing` (east);
- sort east cells by `y`, binary-search the nearest latitude for each west cell;
- shallow-copy `pack.cells.c`, add bidirectional links on the edge cells only;
- never mutate `pack.cells.c`.

`findPathSegments` gets an optional `seaAdjacency` and builds a temporary graph:

```ts
const wrap = isWater && isWrapEnabled() && !!seaAdjacency;
const graph = wrap ? { ...pack, cells: { ...pack.cells, c: seaAdjacency } } : pack;
const pathCells = findPath(start, isExit, getCost, graph);
```

Build it once in `generate(...)`/`createRoutesData` and thread it through
`generateSeaRoutes`; the public `findWaterPath` may take an optional adjacency for
consistent editing behavior.

### 3.4 Wrap-aware water cost

In `getWaterPathCost`, replace the distance term:

```ts
const distanceCost = wrapDistanceSquared(
  pack.cells.p[current],
  pack.cells.p[next],
  isWrapEnabled(),
  graphWidth()
);
```

Leave `getLandPathCost` unchanged — land routes never wrap.

### 3.5 Seam-split rendering (`getPath`)

Add `hasSeamCrossing(points)` (any `|dx| > width / 2`) and `splitAtSeam(points)`:

- at each crossing, interpolate the crossing latitude, end the run at the frame
  edge (`x = width` if moving west→east, else `0`), and start the next run at the
  opposite edge;
- `getPath` renders each run with the existing curve generator and joins with a
  space instead of drawing one horizontal streak.

### 3.6 Wrapped length (`getLength`)

`getLength` currently uses `curveLength(points, curve)`. For a seam-crossing
route, sum `sqrt(wrapDistanceSquared(...))` per segment instead, so the overview
reports the short circumnavigation distance, not a near-full-map-width length.

---

## Phase 4 — Globe view: verify, don't rebuild

The globe renderer already exists in this fork and is a newer refactor than
barrulus's (`sceneBuild` guard, `setMapImageSource`, `OrbitControls` wrapper).
Verify:

- Equirectangular canvas is `resolutionScale × resolutionScale/2`.
- `world = coordinates.latT > 179`; partial maps are offset by `dx`/`dy` and
  filled with the cloud texture.
- `SphereGeometry(1, 64, 64)` + `MeshBasicMaterial`, starfield background,
  orbit controls, auto-rotate slider.
- Leaving Globe mode disposes geometry/material/texture and returns to Standard.

Only add a regression test or docs note if a check fails.

---

## Phase 5 — Tests, docs, verification

### Automated

- `routes-generator.test.ts`
  - `wrapDeltaX` / `wrapDistanceSquared` / `isWrapEnabled` gate (lonT 360 vs 359.9).
  - toroidal Urquhart connects `[5,50]` and `[95,50]` only when wrap is on.
  - `buildSeaAdjacency` links west/east water cells and leaves land/`pack.cells.c` untouched.
  - `getPath` splits a seam-crossing route into two `M` sub-paths; a normal route stays one path.
  - `getLength` of `[[980,300],[20,300]]` with `width=1000` is ~40, not ~960.
- Heightmap: add a small test for `Power` (or a template smoke test that
  `fromTemplate("globeWorld")` returns edge water at a fixed seed).
- Run `npm test` and `npx tsc --noEmit`.

### Manual

1. Generate a 2:1 map with `latT = 180` (confirm `lonT = 360` in World
   Configurator). Pick `Globe World`.
2. Open Globe view: no visible seam, continents wrap cleanly.
3. Enable Routes: sea lanes near opposite edges render as two stubs meeting the
   frame edges, not a horizontal line; Routes Overview shows a short length.
4. Generate a regional map (`lonT ≠ 360`): routes and lengths are unchanged.

### Docs / housekeeping

- Reference this plan from `docs/domain/3d-view.md` if the globe section needs a
  full-globe note.
- If the new template name is translatable, run `npm run extract-strings` and
  update locales.

## Risks / decisions

- **Per-feature sea routes.** This fork groups ports by feature and runs Urquhart
  per feature, so wrapping only helps a landmass that spans the seam. If cross-
  seam trade between separate features is wanted, that is a separate change to
  global port pairing.
- **No A\* heuristic.** Dijkstra correctness does not depend on the heuristic, so
  skipping `wrapWidth` is safe and keeps the diff smaller.
- **`graphWidth` source.** `pack.cells.p` is in graph space, so use
  `options.map.graph.width` (there is no `graphWidth` global here).
- **Template id.** Add id 14; never renumber existing ids because saved maps and
  the heightmap editor key off them.
- **Order of work.** Phase 1 → 2 is independent and shippable alone. Phase 3 is
  the larger, riskier change and can land separately.