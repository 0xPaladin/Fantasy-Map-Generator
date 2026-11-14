# Plan — Astral Networks

Updated: 2026-11-14. Inputs: [Astral Cartographer](../wiki/Astral-Cartographer.md),
[astral-ui-overhaul.md](astral-ui-overhaul.md) (layer profiles and Tools), [data-model.md](../architecture/data-model.md)
(routes), [grid-sampling.md](../prd/grid-sampling.md) (Poisson-disc is explicitly out of scope for the Grid).

## Goal

A new Astral tool that places **networks** — wormholes, hyperspace lanes, communication relays — as an
evenly distributed set of nodes over a chosen part of the map. A network has a name, a kind, a placement
rule and, optionally, direct routes between its nodes. Those routes are ordinary entries in the Routes
store. The nodes and their routes are drawn together on their own **Networks** layer.

The tool answers one question: "put a network of N relay stations / wormhole mouths / lane beacons
across this region, evenly, and name it". It does not replace the Route Creator or the Systems editor.

## Non-negotiables

- **Map state, not a reading.** A network survives save and load; it is not derived from markers, burgs,
  routes or the Astral style.
- **Poisson-disc spacing.** Node centres are evenly spread by a minimum-distance rule, not by a grid or a
  naive random pick. The same network seed and scope give the same nodes.
- **Existing map geometry only.** Nodes sit on existing cells or burgs. No new graph, no new terrain.
- **Routes are real routes.** Every link is a `pack.routes` entry and is linked in `pack.cells.routes`, so
  the Routes store, route overview, export and economy see it. There is no parallel route store.
- **One layer owns both.** The `networks` layer draws the nodes and the network's links. The `routes` layer
  does not draw network links. This is what "their own layer" means in practice.
- **Standard view untouched.** The layer button exists only in Astral; leaving Astral restores the previous
  layer profile. Missing networks in old maps and old routes load unchanged.
- **No new assets.** Node glyphs come from the existing icon library; links use route paths and a style
  group. Strings go through `t()`.
- **Deterministic and repairable.** Nodes carry their own positions; links are found by `networkId`, never
  by route id, so `Routes.regenerate` renumbering cannot orphan a network.

## Decisions

### Where the data lives

`options.map.networks: Network[]`, saved inside the existing settings record. Reasons:

- The `.map` record layout is positional and history snapshots own records 58+. The settings record already
  travels with the map and already carries map state (`options.map.goods`, `eras`, `military`, `transports`).
- A new record would require shifting `FIRST_SNAPSHOT_RECORD` and a migration on every older map. This
  feature does not justify that break.
- `Options.randomize()` replaces `options.map` wholesale, so a new map starts with no networks, which is the
  expected behaviour.

The trade-off is documented in `data-model.md`: networks are map state that lives in the settings block.
If generators later need them in `pack`, that is a separate record-format change.

### How links survive route renumbering

A network does **not** store route ids. It stores its nodes; a route belongs to a network through
`Route.networkId`. `Networks.routesOf(id)` filters `pack.routes`. `Routes.regenerate` already copies locked
routes and renumbers them; the link stays attached because the field travels with the copied route.

### What a network is

New data module `src/data/astral-networks.ts`:

```ts
export const NETWORK_KINDS = ["wormhole", "hyperlane", "relay"] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

export type NetworkScope =
  | { kind: "any" }
  | { kind: "land" }
  | { kind: "burgs" }
  | { kind: "culture"; culture: number }
  | { kind: "state"; state: number };

export interface NetworkNode {
  cell: number;
  x: number;
  y: number;
  /** the burg the node sits on, for burgs-only networks */
  burg?: number;
}

export interface Network {
  i: number;
  name: string;
  kind: NetworkKind;
  scope: NetworkScope;
  seed: string;
  /** requested node count; the actual count is nodes.length */
  target: number;
  nodes: NetworkNode[];
  /** whether the network created direct routes */
  connect: boolean;
  /** whether the links join the economy, and their travel-cost multiplier */
  trade: { enabled: boolean; friction: number };
}
```

The node count is the density control: the user asks for "about N nodes" and the Poisson-disc radius is
derived from it over the candidate area. Nothing else sets spacing.

Kind table:

| kind | label | glyph | default use |
|---|---|---|---|
| `wormhole` | Wormhole | 🌀 | rare long links, purple |
| `hyperlane` | Hyperspace lane | 🛸 | trade lane mesh, cyan |
| `relay` | Communication relay | 📡 | sparse chain, amber |

The glyph is stored as an icon reference by `Icons.reference`; kind labels and tips live beside the table.
A kind carries no geometry: it chooses the glyph, the default link style and the route group label.

New model `src/model/astral/networks.ts`, singleton `Networks`, reads and writes `options.map.networks`:

- `getAll()`, `get(id)`, `create(input)`, `remove(id)`.
- `regenerate(id, seed = generateSeed())` — deletes the network's routes, resamples nodes, reconnects.
- `setScope(id, scope, target)` and `setTarget(id, target)` — resample.
- `rename(id, name)`, `setKind(id, kind)` — presentation only.
- `setConnect(id, connect)` — removes or creates links without resampling.
- `routesOf(id)` — `pack.routes.filter(route => route.networkId === id)`.
- `ensureRouteGroup()` — makes sure `styles.routes.groups.networks` exists before the first
  `Routes.create`.

Ids follow the existing entity convention: start at 1, never reuse a removed id within a session.
The `networks` schema follows the goods pattern: `z.preprocess` drops an invalid network alone, so one
broken record never empties the whole set.

## Node placement

### Candidates

| scope | candidates |
|---|---|
| `any` | every cell; centre `pack.cells.p[cell]` |
| `land` | cells with `pack.cells.h[cell] >= 20` |
| `culture` | cells with `pack.cells.culture[cell] === culture` |
| `state` | cells with `pack.cells.state[cell] === state` |
| `burgs` | every burg with `i && !removed`; position `burg.x, burg.y`, `cell: burg.cell`, `burg: burg.i` |

If a chosen culture or state has no candidates, creation stops with a tip and no record is written.

### Poisson-disc selection

New `src/utils/poisson-disc.ts`:

- Move mbostock's `poissonDiscSampler` out of `relief-generator.ts` unchanged, so the relief preview keeps
  its exact points for a seeded random source.
- Add `poissonDiscSelect(candidates, { radius, random, wrapWidth? })`: Fisher–Yates shuffle, then accept a
  candidate only when no accepted point is closer than `radius`. A spatial hash keyed by `radius / √2`
  keeps it near-linear; the wrap-aware distance is `min(|dx|, width - |dx|)`.
- This is the constrained form of Poisson-disc: the candidate set is the allowed region, the accepted set
  keeps the minimum distance. It handles a culture that owns a handful of scattered cells better than
  sampling the map rectangle and rejecting most points.

Radius from the requested count:

- Cell scopes: `candidateArea = candidates.length × grid.spacing²`.
- Burgs: `candidateArea = options.map.graph.width × options.map.graph.height` (burgs are sparse; the
  target count bounds the result).
- `radius = sqrt(0.7 × candidateArea / target)`, clamped to `grid.spacing × 0.75` at the low end.
- The actual count may differ from `target`; the dialog shows `nodes.length` and the editor can re-roll.
- Accepted nodes are sorted by cell id, then by burg id, so node order and link topology are stable.

The seed is `generateSeed()` at creation and is stored. `regenerate` uses a fresh seed unless the caller
passes one; a test can pass a fixed seed.

### Direct routes

When `connect` is true:

1. Take the node points in node order.
2. `Routes.calculateUrquhartEdges(points, isWrapEnabled(), graphWidth())` gives an even mesh, the same
   approximation the generated road and sea networks use. Two nodes give one link; fewer than two give
   none.
3. For each edge, `Routes.create([[x1, y1], [x2, y2]], "networks")`.
4. Set `route.networkId = network.i`, `route.name = network.name`, `route.lock = true`.
5. `Layers.draw("networks", "routes", "goods", "trade")`.

`Routes.create` already rounds points, resolves the cell under each point, pushes the route and links
`pack.cells.routes`. The `networks` route group exists in the stock styles and is ensured on old maps.

When `connect` is false, the network keeps only its nodes. Turning it on later runs the same steps; turning
it off calls `Routes.remove(...routesOf(id).map(route => route.i))`.

## UI

### Entry points

- Tools → Add → **Networks**, astral-only (`#addNetwork`), dispatching the same action as the omnibar.
- Omnibar: `Add Network`, aliases `wormhole hyperspace lane relay communication network`.
- `Controllers.AstralNetworks` registry entry.

`AstralNetworks.open()` opens the manager dialog `astralNetworks`: a compact table of existing networks
(name, kind, placement, nodes, links), with Locate, Edit and Remove per row, and a **Create network** button.
Expected counts are small, so no pagination is needed; the existing editor-table helpers are reused.

`AstralNetworks.openEditor(id)` opens `astralNetworkEditor` with a create mode when `id` is absent. Fields:

- **Name** — required, trimmed.
- **Kind** — the three kinds above.
- **Placement** — Anywhere / Land / Star systems / Culture / State. A second select appears for Culture or
  State and lists non-removed cultures/states.
- **Nodes** — number input, default 24, range 2–120.
- **Connect with direct routes** — checkbox, default on. The tip names the Routes store and says the links
  are locked.
- **Trade** — checkbox "Use in trade", default on, and a **travel friction** number input (0–5, step 0.1,
  default 1) enabled with it. Friction multiplies the link's travel cost: below 1 is cheaper than a normal
  route of the same length, above 1 is slower. A network with trade off stays in the Routes store and on
  the map; the economy just ignores its links.
- Readout: `24 nodes, 37 links`.
- Buttons: Create/Save, Regenerate (fresh seed), Remove (confirmation, deletes its links too), Cancel.

Changing name or kind saves without resampling. Changing placement or node target asks to resample; Save
does it. The editor is positioned like the Route Editor (`left+10 top+10 of #map`) and shows the Networks
layer.

Clicking a node or a link on the map opens the same editor for that network through the generic click seam
(`GREAT_EDITORS.networks`, resolving the id with `target.closest("[data-network]")` so the links/nodes
nesting does not matter). The tooltip reads `name. Kind. N nodes. Click to edit` for nodes and
`name. Kind link. Click to edit` for links.

## Layer and renderer

New renderer `src/renderers/astral/draw-networks.ts`:

- `ViewportLayers.register({ id: "networks", render })`, like the systems layer.
- For every network, emit `<g id="network<i>" data-network="<i>">` with a links group then a nodes group.
- A link is `<path id="route<id>" d="<Routes.getPath(route)>">` plus a transparent wide hit path, drawn
  from routes where `networkId === network.i`; it uses `styles.networks.groups[kind].links`.
- A node is `<g data-node="<index>" data-cell="<cell>">`, with a ring and a glyph `<use>`; it uses
  `styles.networks.groups[kind].nodes` and the kind glyph. Nodes are culled against the viewport bounds;
  links are culled by their point bounds.
- `removeNetworks` clears the group. The layer's `font-size` follows a new `networks` zoom curve, modelled
  on `systems` (near natural), so glyph size tracks the chart.

Layer wiring:

- `src/renderers/layers.ts`: register `networks` directly after `routes`; draw/erase the renderer.
- `src/renderers/viewport/viewport.ts`: add `networks` to `ZOOM_CURVES`.
- `src/data/astral-layers.ts`: add `networks` to the `astral` and `systems` presets.
- `src/data/astral-layer-labels.ts`: add `networks` with the label **Networks** and shortcut `KeyO`.
  Standard `LAYER_TOGGLES` is unchanged.
- `src/model/styles/styles-schema.ts` + `default-styles.json` + `public/styles/astral.json` +
  `public/styles/astralSchematic.json`: add a `networks` section:

  ```ts
  networks: z.strictObject({
    groups: z.record(
      z.string(),
      z.strictObject({
        nodes: z.strictObject({
          attrs: z.strictObject({ opacity, ...fillGroup, ...strokeGroup, filter }),
          options: z.strictObject({ size: number({ label: t("Size"), range: [0.2, 3], step: 0.05 }) })
        }),
        links: z.strictObject({
          attrs: z.strictObject({ opacity, ...strokeGroup, filter })
        })
      })
    )
  })
  ```

  Default groups: `wormhole` (violet, dashed), `hyperlane` (cyan), `relay` (amber, fine dashes).
- `src/controllers/style/elements.ts`: add a `networks` group source, so the style editor lists the kinds and
  their counts.

The `networks` route group in `styles.routes.groups` is a neutral dashed line, added to the defaults. Old
maps get it through `Networks.ensureRouteGroup()` cloning `airroutes` (or the first route group), because
`Routes.create` requires a known group.

## Routes integration

- `Route` gains `networkId?: number`; JSON records stay backward compatible.
- `drawRoutes` skips routes with a `networkId`, so a network link is never drawn twice. `getRouteBox` falls
  back to the route's point bounds when the route is not in the routes scene.
- `RouteEditor.open` checks `networkId` and opens the Network editor instead, with the tip
  "This route belongs to a network; edit it from the Networks tool". The route is still listed in the Routes
  Overview (group `networks`), and the overview's locate works through the point-bounds fallback.
- Network routes are created locked; `Routes.regenerate` keeps them. Both route and network mutations redraw
  `networks` as well as `routes`/`goods`/`trade`.
- `MapRepair.repair()` gains `repairNetworks()`: clear a `networkId` with no matching network; drop nodes
  whose cell or burg no longer exists; keep a network with fewer than two nodes (it is still editable).
  `pack.cells.routes` reconciliation stays in `repairRoutes`.

Network links are ordinary routes, so `TradeRoutes` and the trade animation would treat them as links
between cells. Each network decides:

- `trade.enabled === false` — `TradeRoutes.buildGraph` skips every link of that network. The routes still
  exist, render and export; they are simply not part of the economy.
- `trade.enabled === true` — each link costs `length × network.trade.friction`. A wormhole at 0.2 is a real
  shortcut; a relay lane at 2 is a slow, low-volume path. The animation and market prices read the same
  adjusted graph.

`TradeRoutes.buildGraph` builds a small `Map<routeId, { enabled, friction }>` from `options.map.networks`
once per graph build; no per-link lookups through the network list.

## Files

### New

```
src/data/astral-networks.ts          kinds, scope labels, glyphs
src/model/astral/networks.ts         the Network model, sampling, route links
src/utils/poisson-disc.ts            extracted sampler + constrained selector
src/renderers/astral/draw-networks.ts
src/controllers/astral-networks.ts   manager and editor dialogs
src/model/astral/networks.test.ts
src/utils/poisson-disc.test.ts
src/renderers/astral/draw-networks.test.ts
tests/e2e/astral-networks.spec.ts
docs/plans/astral-networks.md
```

### Modified

```
src/model/options/options-schema.ts         map.networks schema, default []
src/model/options/options-model.ts          default networks: []
src/model/economy/routes-generator.ts        Route.networkId, bounded route box helper if shared
src/model/economy/trade-routes.ts            network trade enable/friction in the route graph
src/renderers/draw-routes.ts                 skip network routes, point-bounds fallback
src/services/io/map-repair.ts                repairNetworks
src/renderers/layers.ts                      networks layer
src/renderers/viewport/viewport.ts           networks zoom curve
src/model/styles/styles-schema.ts            networks style section
src/model/styles/default-styles.json         networks defaults + routes.groups.networks
public/styles/astral.json                    networks section
public/styles/astralSchematic.json           networks section
src/data/astral-layers.ts                    astral/systems presets
src/data/astral-layer-labels.ts              Networks button
src/app/chrome/tabs/tools-tab.ts             Add → Networks
src/app/map-commands.ts                      addNetwork command
src/controllers/index.ts                     AstralNetworks registry entry
src/ui/map/viewbox-events.ts                 GREAT_EDITORS.networks
src/ui/map/map-tooltip.ts                    network node/link tip
src/controllers/economy/routes/route-editor.ts    redirect network routes
src/controllers/economy/routes/routes-overview.ts redraw networks on removal
src/controllers/style/elements.ts            networks group entries
docs/architecture/data-model.md              Networks section, Route.networkId
docs/architecture/configuration.md           options.map.networks note
docs/wiki/Astral-Cartographer.md             Networks section and roadmap
src/locales/en.json                          extracted strings (then all locales)
```

## Testing

- **`poisson-disc.test.ts`**: the extracted sampler still matches the relief generator's seeded points;
  `poissonDiscSelect` honours the minimum distance (with a small tolerance for the 2-decimal node
  rounding), returns only candidates, is deterministic for a seed, and wraps distances when asked.
- **`networks.test.ts`**:
  - Scope filters: land nodes have `h >= 20`; culture/state nodes carry the owner; burgs nodes are exactly
    burg cells.
  - `target` and radius: the actual count is reported; a large target on a small culture never exceeds the
    candidates; two runs with the same seed match.
  - Route links: `connect` creates `pack.routes` entries with `group === "networks"`, a `networkId`,
    `lock === true`, and `pack.cells.routes` links at both ends; `connect: false` creates none.
  - Removal and regeneration remove the old routes and leave unrelated routes untouched.
  - `Routes.regenerate` keeps network routes and their `networkId` after renumbering.
  - Trade: a disabled network's links are absent from `TradeRoutes.buildGraph`; friction multiplicatively
    changes the link cost; ordinary routes are untouched.
  - Schema: an old settings record without `networks` parses to `[]`; a bad scope entry is repaired.
- **`draw-networks.test.ts`**: nodes and links render in `#networks`; network routes are absent from
  `#routes`; culling drops off-screen nodes; a kind's style group is used; `removeNetworks` clears it.
  The map tooltip finds a node and a link through their `[data-network]` ancestor.
- **E2E `astral-networks.spec.ts`**: enter Astral, create a land network of ~12 nodes with routes, see the
  nodes and links in `#networks`, assert the Routes store entries and `pack.cells.routes`, toggle the
  Networks layer, click a node to reopen the editor, regenerate, remove the network and see its routes go,
  leave Astral and confirm the standard chart is unchanged.
- **Regression**: existing route, marker, style-preset, options-schema and save/load specs pass unchanged.
- Manual: create a culture-scoped and a burgs-only network on a wrapped map; save, reload, and confirm node
  positions, names, links and layer state.

## Risks and open questions

- **Two owners of the same geometry.** The links are routes but are not drawn by the routes layer. The route
  editor redirect is the contract that keeps this honest; every future route tool must respect `networkId`.
- **Trade impact.** Network links join the trade graph by default. Friction is a blunt multiplier on the
  link's length; it does not model capacity, tariffs or direction. That is enough for a wormhole shortcut
  and a relay backwater, and keeps the first version out of the market simulator.
- **Exact counts.** Poisson-disc thinning gives a minimum distance, not an exact requested count. The UI
  shows the actual count and offers Regenerate rather than promising a number.
- **Settings growth.** Networks live in the settings record. A map with hundreds of networks grows that
  record; the expected range (a handful of networks, tens of nodes) is far below the existing goods set.
- **Route id renumbering.** Avoided by not storing route ids. The link between a network and its routes is
  one integer field; tests cover `Routes.regenerate`.
- **Kind vocabulary.** Three kinds are enough for the astral register; adding a kind later is a data-table
  entry, a style group and a schema enum value.

## Out of scope

- Manual node placement, dragging, adding or deleting individual nodes.
- Node names, notes, or per-node metadata beyond cell/burg/position.
- Custom network kinds and a kinds editor.
- Links between different networks, or network hubs shared by several networks.
- Per-link trade settings, capacity or tariffs on network links, market generation, Living World or history
  hooks.
- 3D view and globe rendering.
- A network label layer or automatic network names.