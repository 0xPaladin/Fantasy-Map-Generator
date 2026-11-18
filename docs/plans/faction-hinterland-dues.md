# Plan — Faction Hinterland Dues: Rural Reach for Burg-less Nodes

**Status:** Delivered
**Goal:** Burg-less (wilderness) faction nodes stop being structurally bankrupt. A wilderness HQ/outpost collects **hinterland dues** from peopled rural cells within a **cell radius** — a cut of the rural economy's `earned`, scaled by node influence and the primary revenue-rate lever. The dues are a diversion of existing rural flows (like graft), not new money, and each rural cell pays only the **nearest burg-less node across all factions**, so reach never stacks.

---

## 1. What exists today (audit)

| Piece | State |
|---|---|
| Income source (`factionUpstreamIncome`, `living-faction-economy.ts:275`) | Reads the host burg/state/market only |
| Wilderness in a state | State-side lines work (retainers, court/admin spending); every burg-product line is 0 (guild dues, offerings, bounties, tribute) |
| Wilderness outside any state | `hostStateId = 0` → no lines → `return NONE` (`:315`): zero income while still paying per-head expenses and upkeep |
| Rural economy | `Prosperity.getRuralCell(cell).earned` gives each peopled cell's share of its market's rural earnings after a run; `Output.getRural()`/`pack.cells.pop`/`pack.cells.burg` are all available |
| Reach logic | None; suppression uses direct adjacency, corruption uses decima distance |

---

## 2. Locked decisions

1. **Radius in cell hops, not map distance.** Voronoi cells are uniformly spaced per map, so hops are density-independent and need no `getDecima()` scaling. HQ reach **5** hops; an outpost's reach **2 + tier** (3/4/5). Only non-pillaged nodes **without `burgId`** collect.
2. **Only peopled rural cells pay**: `cells.pop > 0` and no `cells.burg` — burg cells already pay through their host lines.
3. **Nearest node wins, across factions.** For each eligible cell, compare hop distance to every active faction's burg-less nodes; nearest claims it; ties go to higher influence, then lower faction id. No cell pays two factions.
4. **Dues = Σ earned × (primary rate % ) × node influence factor** (`0.5 + influence/100`, as every other line). This reuses the existing `primary` rate lever and its category defaults (commercial 20%, underworld 25%, martial/religious/political 5%, adventuring 3%) — the actual wild archetypes (dread host, cult) sit at a modest 5%.
5. **One line, category flavor**: `HINTERLAND_LABELS` → commercial "Hinterland dues", underworld "Rural extortion", martial "Forage & tribute", religious "Rural tithes", political "Rural levies", adventuring "Patrol fees". Added outside the host-state gate, so wildlands factions earn it; burg-hosted nodes never get the line.
6. **No save fields, no new state.** Derived per economy run from `pack.cells` + `Prosperity`; recomputed on demand (wilderness nodes are rare, so the BFS is trivial).

---

## 3. Implementation

**Files:** `src/model/physical/living-faction-economy.ts`, test `living-faction-economy.test.ts`

1. `HINTERLAND_RADIUS = { hq: 5, outpost: 2 }`, `HINTERLAND_LABELS`, and `hinterlandEarned(node)`:
   - guard `pack.cells.c`, `pop`, and `pack.factions`;
   - collect candidates from `pack.factions` (active, non-pillaged, `!burgId`), BFS each within its radius over `cells.c`;
   - sum `Prosperity.getRuralCell(cell)?.earned ?? 0` for cells this node wins (try/catch for stripped packs, as in `computeFactionEconomy`).
2. In `factionUpstreamIncome`, after the category switch and **outside** the host-state gate: if `!node.burgId`, push the dues line (`rateKey: "primary"`, `rate: rates.primary`) when the node has any reach at all. Existing charter tithe, burden and `hostProduct` logic then applies unchanged.
3. Tests (mock `Prosperity.getRuralCell`):
   - wilderness HQ earns dues from peopled rural cells in reach, and a burg-hosted node gets no dues line;
   - a wildlands node with no host state still earns (no `NONE`);
   - nearest node claims cells (two factions in one valley split by distance, ties by influence);
   - influence scales dues; pillaged nodes and unpeopled/burg cells pay nothing.

**Exit:** a wildland HQ shows `dayBalance` lines and positive income; `grep -r "nodeScale" src/` stays clean (unrelated); suites green.

---

## 4. Docs

- `docs/wiki/Factions.md` *Means of Income*: a **Hinterland dues** bullet under the table (reach, nearest-node rule, category labels, primary lever).
- No `data-model.md` change: no serialized fields.

### 4.1 Delivery notes

- `hinterlandEarned(node)` in `living-faction-economy.ts`: BFS over `cells.c` from every active faction's burg-less, non-pillaged nodes (HQ radius 5; outpost `2 + tier`), matching the queried node by **node identity**; each peopled, burg-less cell pays the node that reaches it first (ties by influence, then faction id). Earned values come from `Prosperity.getRuralCell(cell).earned` with the usual `try/catch` for stripped packs.
- The dues line is pushed in `factionUpstreamIncome` outside the host-state gate, so wildland factions now earn instead of returning `NONE`; burg-hosted nodes never get the line. `rateKey: "primary"` keeps the ledger lever and the Exaction Burden working unchanged, and the charter tithe applies to dues like any other gross line.
- Tests: a line of cells with two rival wild HQs (nearest-wins incl. the two-hop tie), wildland income with no state, influence scaling, burg-cell exclusion, pillaged nodes, and no dues line on burg-hosted nodes. No save-schema changes; existing calibers untouched.