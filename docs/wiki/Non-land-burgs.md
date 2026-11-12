## Non-land burgs
The generator's default settlements stand on the map's real land. This fork adds three **realm networks** that live off the land altogether: floating **skyburgs** above the surface, subterranean **holds** in the deep earth, and benthic **underwater cities** under the waves. Each is a complete settlement system — its own people, its own states, its own trade routes, its own money — but it owns **no land**.

### The three realms

| Realm | Settlements | Where they settle | Altitude |
|---|---|---|---|
| **Sky** | `skyheart` (capital), `skyhold` (minor) | any cell | +50 to +500 ft above the surface |
| **Underdark** | `underdark_capital`, `underdark_hold` | land cells, preferring mountains and hills; subterranean culture bases (Dark Folk, Dwarves, Goblins) and subterranean markers make better tunneling grounds | −200 to −3,000 ft below the surface |
| **Underwater** | `underwater_capital`, `underwater_settlement` | water cells, preferring the continental shelves in warm and temperate seas; aquatic culture bases, or the nearest Naval culture otherwise | −50 to −2,000 ft below the waves |

Sky settlements are always drawn; the minor holds of the Underdark and the Underwater realms are thin at world zoom, so their icons gate on `zoomThreshold` (**1.5**) and appear once you zoom in — capitals and skyholds show at any zoom.

### Enabling the realms
_Options_ → _Map generation_ → **Realm networks** adds a checkbox trio, all on by default for new maps:

- **Sky burgs** — floating settlements above the surface, skyports and air routes
- **Underdark burgs** — subterranean settlements below the surface, underdark gates and tunnel routes
- **Underwater burgs** — benthic settlements in the water, undersea routes

The realm networks are baked into generation, so they only affect the **next** map you generate, never the one you have open. Maps generated before the networks existed load fine — the missing realm burg groups, label groups and route/icon/label styles are backfilled when the map is opened.

### What the realms get
- **Their own states with zero surface territory.** Every realm capital founds a state. A realm state owns no cells and has no provinces — its `pole` is its capital's position, and its realm's burgs belong to it. Realm burgs join the nearest realm state of the same realm; they never join a surface state.
- **Their own routes.** Three dedicated route groups, not drawn by the surface road builders and never sharing the surface pathfinding discounts:
  - **`airroutes`** — point-to-point lanes between skyburgs and their ground skyports. No pathfinding, the flight ignores terrain; lanes connect each skyburg to the trade network through at least one skyport, up to two skyport-to-skyport trunk lines keep the ground hubs meshed, and long lanes arc off-axis (the renderer curves them).
  - **`underdarkroutes`** — Urquhart links from every hold to the gate-connected component of the network, tunnelled through the bedrock: mountains (`h ≥ 50`) are ideal, plain ground is costlier, rivers are expensive to pierce, open abyss (`t < −1`) is impassable — the abyssal crust cannot be tunnelled. A shallow under-strait is possible but very costly.
  - **`undersearoutes`** — Urquhart links between underwater burgs and the coastal ports they trade through, swum across the shelves and trenches; land blocks a passage wherever the port endpoints do not stand.
- **Their own economy.** Realm burgs live off their realm, not the land below them:
  - **Skyburgs** are consumers — they make nothing and buy everything they need. Their food, luxury and other goods come from the market of the cell they float over, if any.
  - **Underdark holds** cannot raise what no cave supplies (no wood, mahogany, cattle, sheep or horses). Their harvests are weighted for the deep earth: ore and minerals (×1.8), ritual and educational goods (×1.3), and fungi (a ×0.4 food staple). Mining is ×1.25 better over mountain roots or mineral riches.
  - **Underwater cities** cannot raise what grows nowhere but the surface. They harvest aquatic goods (×1.8), farm kelp for food (×0.5), work vents for ore and minerals (×0.6) and favor luxuries (×1.2).
- **Their own labels, icons and legend entries.** Realm burgs use the realm label groups, their capitals and holds draw with realm icons, and the layer presets, styles and zoom gating come with the map. Regenerating the map keeps locked realm burgs; unlocked realm burgs are re-rolled each regeneration, on their own seeded stream, so the surface map stays identical for the same seed.

### What they do not get
- **No cell slot.** `pack.cells.burg` is reserved for surface burgs. A skyhold floating above a road town does not displace it: the slot keeps pointing at the surface burg. Realm burgs are never ports, never own cells, and hold no provinces.
- **No market of their own.** Markets are never founded at realm burgs — the surface market of the cell they stand on governs their trade, exactly like any surface burg. A realm burg whose cell joins no market takes part in no market, and that is a state a realm settlement can legitimately be in.
- **No sea routes or surface roads.** Surface route generation, posthouse connections and the shared connections discount map ignore realm burgs entirely.

### Working with them
- **Burg Editor** — the **Realm** row toggles Sky/Underdark/Underwater, mutually exclusive; the **Hub** row toggles **Skyport** (a surface burg serving as a ground airfield) and **Underdark Gate** (a surface burg serving as a subterranean entrance), both surface-only. The **Altitude** field shows `+250 ft above surface`, `1,200 ft below ground` or `400 ft below sea level` and is editable inline; zero clears it. A realm capital cannot change realm, and so its toggles are locked until you make another burg the capital.
- **Burgs Overview** — realm and hub filter chips (`Surface`, `Sky`, `Underdark`, `Underwater`, `Skyport`, `Underdark Gate`) narrow the list; the add-burg button carries a realm selector so new burgs can be founded in any realm.
- **Assistant** — `Burgs.setRealm` / `setSkyPort` / `setUnderdarkGate` / `setAltitude` adjust a realm settlement; `Burgs.add(x, y, realm)` founds one directly (`realm` is `surface` by default).
- **Removing one** — a realm burg can be removed like any non-capital burg from its editor. A realm capital cannot be removed; make another realm burg the capital first.

### Map files and old maps
Realm settlements existed before the current `VERSION`, and they are not gated on it: when a map from before the realm networks was generated, the missing realm burg groups, burg label groups and route/icon/label styles are backfilled into the map on load, in place. It is a no-op for maps the fork generated itself.
