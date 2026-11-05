## OpenConquest (retired)

_OpenConquest: Atlas Invictus_ was a separate turn-based campaign engine. It has been **retired** and folded into the [Living World](Living-World.md): there is now one seasonal simulation, one tick and one history.

What moved:

- **Battles and sieges** — the combined-arms Lanchester engine, rosters, magic and tactical orders live in [`src/model/battle/`](https://github.com/0xPaladin/Fantasy-Map-Generator/tree/master/src/model/battle). See [Battle Engine](Battle-Engine.md).
- **Armies** — every state still fields its roster's culture-unique units as `ArmyBlock`s, but the Living World now owns recruitment, upkeep, movement, stances and capture policies.
- **Goals** — the separate campaign AI is gone. States and factions pursue **agendas** (`conquer`, `raid`, `defend`, `develop`, `build`, ...), and armies march on those goals.
- **Diplomacy** — treaties layer on FMG's native diplomacy matrix; war and peace stay on the map's own relations.
- **Construction** — the campaign's separate building economy is gone. Buildings, wonders and trouble work orders run through each city's production queue.

There is no Conquest view mode, no `openconquest` command, and no campaign lifecycle menu. Open the **Living World** from _Options → Tools_ or the omnibar and step a season.
