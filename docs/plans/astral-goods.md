# Plan — Astral Goods: Sci-Fi Commodities & System-Level Resources

Updated: 2026-11-02. Inputs: [docs/astral/README.md](../astral/README.md),
[docs/domain/goods_schema.md](../domain/goods_schema.md),
[docs/domain/production_schema.md](../domain/production_schema.md),
[docs/domain/trade_schema.md](../domain/trade_schema.md),
*Stars Without Number: Suns of Gold* ("An Honest Day's Trade" reference).

## Goal

Standard maps populate resources across rural land cells (`biomeOutput` and cell-level resource
deposits) using a 54-item medieval/fantasy catalogue. In **Astral Cartographer**, star systems are
represented by burgs (`Burg`), while non-burg cells represent interstellar space, nebulae, and dust
lanes.

This plan introduces a sci-fi trade and resource model aligned with the *Suns of Gold* reference:

1. **System/Burg-Level Resources Only** — Resources exist and are produced strictly at the
   **burg/system level** (`burg.cell`). Province/cell-level rural biome harvesting and scattered
   non-burg resource deposits are eliminated when Astral Goods are active.
2. **8 World Types & 1d10 Trade Tables** — Every star system (`Burg`) has one of the 8 reference
   World Types (`Agricultural`, `Alien`, `Cosmopolitan`, `Decadent`, `Industrial`, `Primitive`,
   `Savage`, `Tyrannical`), deterministically derived from system traits (and overridable per
   system), governing its local resource rolls and cargo supply/demand modifiers.
3. **34 Standard Sci-Fi Commodities** — Measured in metric tons (`ton`), tagged with the 20
   reference Cargo Types and tech levels (`TL0`–`TL5`), and mapped into FMG's 5 demand categories
   (`food`, `utilities`, `construction`, `military`, `luxury`). `Colonial Survival Supplies` from
   the world trade tables is unified with `Colonial Supplies`.
4. **Optional Toggle in Goods Editor** — Switching between Fantasy Goods and Astral (Sci-Fi) Goods
   is an explicit, on-demand action available as a toggle/button in the **Goods Editor**
   (`src/controllers/economy/goods/goods-editor.ts`).

---

## Non-Negotiables

- **Zero `.map` save/load format changes.**
  - `options.map.goods` (map record 1) holds the active `Good[]` catalogue; before v1.157.0 it was `pack.goods` in slot 41.
  - `pack.cells.good` (slot 40, `Uint16Array`) stores the primary resource ID at `burg.cell` and
    stays `0` on all non-burg cells.
  - Explicit World Type overrides are stored as `world:<type>` entries in `burg.tags` (already
    serialized on every burg).
- **Deterministic.** A system's default World Type and its 1d10 Trade Table rolls are seeded by
  `${options.map.seed}/astral/world/${burg.i}` and `${options.map.seed}/astral/trade/${burg.i}` via
  `aleaPRNG`, producing identical results on every run.
- **Opt-in via Goods Editor.** Standard fantasy maps remain untouched unless the user activates
  Astral Goods in the Goods Editor (or restores Fantasy Goods via the same button).

---

## Reference Tables

### 1. The 8 World Types & 1d10 Trade Tables

In the reference rules, negative cargo modifiers indicate abundant local supply (cheap export /
high production efficiency), while positive modifiers indicate local scarcity and import appetite.

| World Type | Supply Bonus (`-` Modifiers) | Import Demand (`+` Modifiers) | 1d10 Trade Table (Primary System Commodities) |
| :--- | :--- | :--- | :--- |
| **Agricultural** | `-2` Agricultural, `-1` Livestock | `+1` Biotech, `+2` Tool | 1. Clothing, 2. Drugs (Raw Materials), 3. Fine Liquor, 4. Housewares (Basic), 5. Livestock (Common), 6. Livestock (Gengineered), 7. Livestock (Luxury Pets), 8. Metawheat, 9. Native Artwork, 10. Tools (Basic Hand Tools) |
| **Alien** | `-2` Alien, `-1` Medical | `+1` Biotech, `+2` Cultural | 1. Clothing, 2. Drugs (Raw Materials), 3. Housewares (Postech), 4. Livestock (Common), 5. Livestock (Gengineered), 6. Metawheat, 7. Native Artwork, 8. Pretech Junk, 9. Small Arms (Energy), 10. Tools (Industrial) |
| **Cosmopolitan** | `-2` Cultural, `-1` Military | `+1` Luxury, `+2` Pretech | 1. Clothing, 2. Colonial Supplies, 3. Drugs (Recreational), 4. Exotic Jewels, 5. Housewares (Postech), 6. Medical Supplies (Postech), 7. Parts (Basic Industry), 8. Small Arms (Energy), 9. Small Arms (Projectile), 10. Fine Liquor |
| **Decadent** | `-2` Sapient, `-1` Biotech | `+1` Maltech, `+2` Luxury | 1. Clothing, 2. Drugs (Raw Materials), 3. Drugs (Recreational), 4. Exotic Jewels, 5. Fine Liquor, 6. Livestock (Gengineered), 7. Livestock (Luxury Pets), 8. Medical Supplies (Postech), 9. Slaves, 10. Tools (Medical Equipment) |
| **Industrial** | `-2` Consumer, `-1` Tool | `+1` Agricultural, `+2` Mineral | 1. Colonial Supplies, 2. Fusion Plants, 3. Housewares (Postech), 4. Native Artwork, 5. Parts (Basic Industry), 6. Postech Building Material, 7. Small Arms (Energy), 8. Small Arms (Projectile), 9. Tools (Basic Hand Tools), 10. Tools (Industrial) |
| **Primitive** | `-2` Agricultural, `-1` Livestock | `+1` Tool, `+2` Postech | 1. Clothing, 2. Drugs (Raw Materials), 3. Housewares (Basic), 4. Livestock (Common), 5. Metal Ingots (Common), 6. Metal Ingots (Rare Alloys), 7. Metawheat, 8. Native Artwork, 9. Slaves, 10. Tools (Basic Hand Tools) |
| **Savage** | `-2` Agricultural, `-1` Sapient | `+1` Tool, `+2` Military | 1. Drugs (Raw Materials), 2. Housewares (Basic), 3. Livestock (Common), 4. Metawheat, 5. Native Artwork, 6. Pretech Junk, 7. Slaves, 8. Small Arms (Projectile), 9. Tools (Basic Hand Tools), 10. Fine Liquor |
| **Tyrannical** | `-2` Mineral, `-1` Sapient | `+1` Military, `+2` Medical | 1. Drugs (Raw Materials), 2. Housewares (Basic), 3. Metal Ingots (Common), 4. Metal Ingots (Rare Alloys), 5. Parts (Basic Industry), 6. Postech Building Material, 7. Slaves, 8. Small Arms (Energy), 9. Small Arms (Projectile), 10. Tools (Industrial) |

### 2. The 34 Standard Commodities (`ASTRAL_GOODS_DATA`)

All commodities use `unit: "ton"`. Base credit prices (`500` to `400,000` cr) are scaled by
`1 / 500` so `good.value` spans `1` to `800`, preserving exact relative credit ratios while fitting
FMG's market and treasury arithmetic.

| ID | Name | Credits | `value` | Min TL | Cargo Tags | Kind | Demand Coverage |
|---:|:---|---:|---:|:---:|:---|:---:|:---|
| 1 | Metawheat | 500 | 1 | TL0 | `common`, `agricultural`, `bulky`, `tl0` | Raw | `food: 3` |
| 2 | Metal Ingots, Common | 1,000 | 2 | TL1 | `common`, `mineral`, `bulky`, `tl1` | Raw | `construction: 2` |
| 3 | Livestock, Common | 2,000 | 4 | TL0 | `common`, `livestock`, `tl0` | Raw | `food: 2, utilities: 1` |
| 4 | Drugs, Raw Materials | 2,000 | 4 | TL0 | `agricultural`, `biotech`, `bulky`, `tl0` | Raw | `utilities: 1` |
| 5 | Metal Ingots, Rare Alloys | 5,000 | 10 | TL3 | `mineral`, `bulky`, `rare`, `tl3` | Raw | `construction: 3` |
| 6 | Livestock, Gengineered | 10,000 | 20 | TL0 | `livestock`, `biotech`, `tl0` | Raw | `food: 3, luxury: 1` |
| 7 | Native Artwork | 10,000 | 20 | TL0 | `cultural`, `luxury`, `tl0` | Raw | `luxury: 3` |
| 8 | Exotic Jewels | 25,000 | 50 | TL0 | `rare`, `mineral`, `luxury`, `compact`, `tl0` | Raw | `luxury: 4` |
| 9 | Livestock, Luxury Pets | 25,000 | 50 | TL0 | `livestock`, `luxury`, `tl0` | Raw | `luxury: 3` |
| 10 | Slaves | 25,000 | 50 | TL0 | `sapient`, `tl0` | Raw | `utilities: 2, construction: 1` |
| 11 | Pretech Junk | 50,000 | 100 | TL0 | `pretech`, `rare`, `tl0` | Raw | `construction: 2, luxury: 2` |
| 12 | Clothing | 1,000 | 2 | TL0 | `common`, `low-tech`, `cultural`, `tl0` | Mfg | `utilities: 2, luxury: 1` |
| 13 | Colonial Supplies | 1,000 | 2 | TL4 | `agricultural`, `survival`, `postech`, `tl4` | Mfg | `food: 2, utilities: 2` |
| 14 | Colonial Materials | 2,000 | 4 | TL4 | `survival`, `postech`, `common`, `tl4` | Mfg | `construction: 2, utilities: 1` |
| 15 | Housewares, Basic | 2,000 | 4 | TL1 | `low-tech`, `consumer`, `tl1` | Mfg | `utilities: 2` |
| 16 | Housewares, Postech | 5,000 | 10 | TL4 | `consumer`, `postech`, `tl4` | Mfg | `utilities: 3, luxury: 1` |
| 17 | Parts, Basic Industry | 5,000 | 10 | TL2 | `low-tech`, `tool`, `tl2` | Mfg | `construction: 3` |
| 18 | Small Arms, Projectile | 5,000 | 10 | TL3 | `military`, `low-tech`, `tl3` | Mfg | `military: 2` |
| 19 | Tools, Basic Hand Tools | 5,000 | 10 | TL1 | `low-tech`, `tool`, `tl1` | Mfg | `utilities: 2, construction: 1` |
| 20 | Fine Liquor | 10,000 | 20 | TL0 | `luxury`, `low-tech`, `compact`, `tl0` | Mfg | `luxury: 3, food: 1` |
| 21 | Fusion Plants | 10,000 | 20 | TL4 | `postech`, `tool`, `bulky`, `tl4` | Mfg | `construction: 4, utilities: 2` |
| 22 | Postech Building Material | 10,000 | 20 | TL2 | `tool`, `postech`, `bulky`, `tl2` | Mfg | `construction: 4` |
| 23 | Small Arms, Energy | 10,000 | 20 | TL4 | `military`, `postech`, `tl4` | Mfg | `military: 3` |
| 24 | Tools, Industrial | 10,000 | 20 | TL4 | `tool`, `postech`, `tl4` | Mfg | `construction: 3, utilities: 2` |
| 25 | Medical Supplies, Postech | 25,000 | 50 | TL4 | `medical`, `postech`, `compact`, `tl4` | Mfg | `utilities: 4` |
| 26 | Parts, Starship Maintenance | 25,000 | 50 | TL4 | `postech`, `astronautic`, `rare`, `tl4` | Mfg | `construction: 3, military: 2` |
| 27 | Tools, Astronautic | 25,000 | 50 | TL4 | `tool`, `postech`, `astronautic`, `tl4` | Mfg | `construction: 3, utilities: 2` |
| 28 | Drugs, Recreational | 50,000 | 100 | TL3 | `luxury`, `biotech`, `compact`, `tl3` | Mfg | `luxury: 4` |
| 29 | Housewares, Pretech | 50,000 | 100 | TL5 | `consumer`, `pretech`, `tl5` | Mfg | `luxury: 4, utilities: 2` |
| 30 | Tools, Medical Equipment | 50,000 | 100 | TL4 | `tool`, `postech`, `medical`, `tl4` | Mfg | `utilities: 4` |
| 31 | Parts, Pretech Industry | 100,000 | 200 | TL4 | `pretech`, `tool`, `tl4` | Mfg | `construction: 5, luxury: 2` |
| 32 | Small Arms, Pretech | 100,000 | 200 | TL5 | `military`, `pretech`, `tl5` | Mfg | `military: 5` |
| 33 | Medical Supplies, Pretech | 200,000 | 400 | TL5 | `medical`, `pretech`, `compact`, `tl5` | Mfg | `utilities: 5, luxury: 3` |
| 34 | Ghoul Immortality Tech | 400,000 | 800 | TL5 | `medical`, `maltech`, `compact`, `tl5` | Mfg | `luxury: 5, military: 2` |

---

## Implementation Phases

### Phase 1 — Data Layer & World Types (`src/data/astral-goods.ts` & `src/model/physical/astral-naming.ts`)

1. **`src/data/astral-goods.ts` (New Module)**:
   - Define `AstralWorldType`:
     `"Agricultural" | "Alien" | "Cosmopolitan" | "Decadent" | "Industrial" | "Primitive" | "Savage" | "Tyrannical"`.
   - Define `ASTRAL_WORLD_TYPES: Record<AstralWorldType, AstralWorldTypeSpec>` containing:
     - `name`, `summary`, `modifiers: Record<string, number>` (the exact cargo tag modifiers from the reference), `tradeTable: number[]` (10 good IDs per world type), and `troubles: string[]` (the 1d6 trouble table for lore/tooltips).
   - Define `ASTRAL_GOODS_DATA: Good[]` with the 34 commodities above, including icons, colors, recipes linking raw inputs to manufactured tiers, and empty `biomeOutput: {}` (since cells do not harvest rural biome resources).
2. **`src/model/physical/astral-naming.ts`**:
   - Add `worldTypeFor(burg: Burg): AstralWorldType`:
     - Checks `burg.tags` for an explicit `world:<type>` tag first.
     - Otherwise, uses `aleaPRNG("${options.map.seed}/astral/world/${burg.i}")` to pick a weighted World Type based on system population (`peopleOf(burg)`), star class (`starClassFor(burg)`), installations (`port`, `citadel`, `plaza`, `walls`, `shanty`, `temple`), and `capital`.
   - Add `setWorldTypeFor(burg: Burg, worldType: AstralWorldType | null)` to set or clear the `world:<type>` tag on `burg.tags`.
   - Add `tradeGoodsFor(burg: Burg): [number, number]` which rolls 1d10 twice on the system's World Type `tradeTable` (seeded by `${options.map.seed}/astral/trade/${burg.i}`) to return the system's two primary trade-table commodities.

### Phase 2 — System/Burg-Level Resource & Production Pipeline

1. **`src/model/economy/goods-generator.ts`**:
   - Add `isAstralCatalogue(): boolean` (detects if `options.map.goods` is the Astral catalogue by checking for `Metawheat` / `astronautic` / `postech` tags).
   - Update `GoodsModule.generate()`:
     - When `isAstralCatalogue()` is true, zero out `this.cells.good = new Uint16Array(this.cells.i.length)`.
     - Skip the cell terrain/biome placement loop.
     - Iterate over active burgs (`burg.i && !burg.removed`), obtain `tradeGoodsFor(burg)[0]` (or respect an existing valid good ID if manually placed), and set `this.cells.good[burg.cell] = goodId`.
2. **`src/model/economy/production-generator.ts`**:
   - In the astral output path (`Output.getAstralModifiers`, formerly `getCellProduction`):
     - When `Goods.isAstralCatalogue()` is true, return `{}` for any cell without a burg (`!this.cells.burg[cellId]`).
     - For `burg.cell`, scale output of `this.cells.good[cellId]` by system population (reflecting the PDF's *1 ton per 5,000 inhabitants* capacity rule).
   - In `createBurgProductionState(burg, ...)`:
     - When `Goods.isAstralCatalogue()` is true, pre-seed both rolled 1d10 Trade Table commodities (`tradeGoodsFor(burg)`) into the system's local production state, even if a Trade Table entry is a manufactured commodity (so an `Industrial` world rolling `Fusion Plants` or `Tools, Industrial` produces it locally).
   - In `getModifiers(good, cellId)`:
     - When `Goods.isAstralCatalogue()` is true and `cellId` has a burg, apply a **World Type Modifier** computed from `ASTRAL_WORLD_TYPES[worldTypeFor(burg)]`:
       - Negative cargo-tag modifiers (abundant local supply, e.g. `-2` or `-1`) boost production (`1.6x` for `-2`, `1.3x` for `-1`).
       - Presence on the world's 1d10 Trade Table grants a `1.35x` specialization multiplier.
       - `Primitive` and `Savage` worlds penalize `postech`/`pretech` manufacturing (`0.2x`), except for `Pretech Junk` salvage.
3. **`src/model/economy/markets-generator.ts`**:
   - In `collectRuralProduction()`:
     - When `Goods.isAstralCatalogue()` is true, skip iterating rural non-burg cells and only collect system-level resource output at `burg.cell` into the system's market hub.

### Phase 3 — Renderer & Astral Layer Toggles

1. **`src/renderers/draw-goods.ts`**:
   - When `Goods.isAstralCatalogue()` is true, skip `buildCellProduction()` (no province/cell heatmap fills) and render `#goodsIcons` and `#goodsBurgs` plates cleanly at the star systems.
2. **`src/data/astral-layer-labels.ts`**:
   - Add `toggleGoods` (*"Cargo"*), `toggleMarkets` (*"Markets"*), and `toggleTrade` (*"Trade"*) to `ASTRAL_LAYER_TOGGLES` so economy layers are accessible directly from the Astral View sidebar.

### Phase 4 — Goods Editor Toggle & System UI Integration

1. **`src/controllers/economy/goods/goods-editor.ts`**:
   - Add a mode toggle button `#goodsAstralToggle` in `renderFooter()` (`#goodsBottom`):
     - Displays **Astral Goods** (`icon-rocket`) when Fantasy goods are active, or **Fantasy Goods** (`icon-globe`) when Astral goods are active.
     - Clicking prompts for confirmation, replaces `options.map.goods` with `structuredClone(ASTRAL_GOODS_DATA)` (or `GOODS_DATA`), prunes stale state tariffs, invokes `Goods.generate()` and `Production.regenerate()`, and refreshes the table and visible economy layers.
   - Update `enterResourceAssignMode()` / `changeResourceOnCellClick()`:
     - When `Goods.isAstralCatalogue()` is true, clicking on the map snaps to the star system (`pack.cells.burg[cellId]` or the nearest burg to the cursor) and sets `pack.cells.good[burg.cell]`, ensuring resources are never placed on empty space cells.
2. **`src/controllers/astral-system-editor.ts` & `src/controllers/astral-systems.ts`**:
   - Display the system's **World Type** (with an inline selector in the System Editor to override `worldTypeFor(burg)`) and its local Trade Table commodities.
3. **`docs/astral/README.md`**:
   - Document the Astral Goods catalogue, the 8 World Types, and the system-level resource architecture.
