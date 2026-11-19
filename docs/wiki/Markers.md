## Marker overview
Markers are icons on the map representing a point of interest, e.g. a battlefield, a bridge, an inn, etc. You can toggle the markers layer on or off using the button on the Layers tab or the <kbd>K</kbd> hotkey. The _Markers Overview_ (<kbd>Shift</kbd> + <kbd>K</kbd>) lists every marker, lets you filter and remove them, and exports them as a `.csv` file.

## Marker generation and editing
After map generation the markers are randomly generated according to a set of criteria (e.g. bridges can only appear on rivers), and you can add your own markers anywhere you want (<kbd>Shift</kbd> + <kbd>3</kbd>, or _Tools_ → _Add_ → _Marker_). Each randomly generated marker has a relevant note attached. Notes on both generated and manually added markers can be edited in the Notes editor, which supports rich text.

To edit a marker, click its icon. A small window with the marker properties appears, where you can change:

* **Type** — style changes apply to all markers of the same type. Leave it blank to make the marker unique
* **Icon** — any icon from the icon picker: a built-in icon, an emoji or short text, or a custom icon (a linked or uploaded image). See [Icons](https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Icons)
* **Size** — the marker element size in pixels and the icon size separately
* **Icon shift** — the icon offset by X and Y as a percentage; 50 centers the icon
* **Pin shape** and its **fill** and **stroke** colors
* **Icon colors** — fill and stroke for the parts of a built-in icon left uncolored; the arrow restores the icon's defaults. Emoji and custom icons keep their own colors
* **Impact** — the marker's daily economy (`🟡/day`) and provincial stability (`%`) adjustments for the province it belongs to; defaults come from the marker's type (and generated state, such as active vs. played-out mines or dormant vs. erupting volcanoes), and the reset button restores the default

The buttons at the bottom let you edit the legend, show all markers within a radius of this one, lock the marker so regeneration does not touch it, add another marker of the same type and remove the marker.

## Provincial economy and stability impact
Visible markers automatically adjust the economy and stability of the province they sit in:

* **Attribution**: Land markers apply to the province of their cell (`0` in unprovinced neutral land). Water markers (`pirates`, `sea-monsters`, `lake-monsters`) attribute to the nearest shore or sea-route endpoint province. Hidden markers have no impact.
* **Economy**: Shown under _Of which markers_ in the province's **Economy** dialog and folded into the province's **Taxes collected** and **Tax burden** without rolling up into the state's treasury.
* **Stability**: Shown under _Of which markers_ in the province and state **Stability** breakdowns, directly shifting provincial stability (and weighting into state stability).
* **Type defaults**: Trade and civic sites (such as merchant houses, guild halls, customs houses, active mines, fairs, portals, libraries, sacred sites, and jousts) contribute positive adjustments, while outlaws, monsters, rifts, disturbed burials, and erupting volcanoes drain provincial revenue and stability. Moving, hiding, re-typing, or deleting a marker updates its province immediately.

### Generation settings
The _Markers Overview_ and Tools -> Regenerate -> Markers open a settings dialog listing every marker type with its icon, a **multiplier** and the current count on the map. Set a multiplier to 0 to stop a type from being generated, or raise it to get more of them. Some types (disturbed burials, rifts, portals) are only generated when a fantasy culture set is used, i.e. their default multiplier is 0 otherwise.

## Special markers
There are special markers for dungeons, which link to Watabou's one-page dungeon generator (https://watabou.itch.io/one-page-dungeon).  These special markers show a preview in the notes.  In the notes editor, click on the <> button to show the HTML code used for the preview.  You can use the same text to generate your own previews to dungeons.  The text is below:

`<div>Undiscovered dungeon. See <a href="https://watabou.github.io/one-page-dungeon/?seed=573621350629" target="_blank" rel="noopener">One page dungeon</a></div>`
`<p><iframe src="https://watabou.github.io/one-page-dungeon/?seed=573621350629" sandbox="allow-scripts allow-same-origin"></iframe></p>`

Opening a newly generated dungeon marker's note also builds an alternate text profile: its name, size, quick ratings, treasure mix, inhabitant groups, themes, origin, area draft, dangers and rumors. The profile is generated on first open and cached on the marker, so a map only grows for dungeons whose notes were actually read. It is a prompt sheet, not a stat block, and stays editable in the HTML source view. Use the reroll button in the marker editor to rebuild a generated profile; on older maps it can also add a profile and, for dungeons, a name. Marker CSV and GeoJSON exports include the full profile without caching it. See [Dungeon generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Dungeon-generation) for the full procedure.

Ruins use the same lazy mechanism with their own profile: tier, original identity, fall, present state, sites, surface zones, ratings, inhabitants, treasure mix, secrets and rumors. An outpost or village is a single site; a town, city or fallen capital is a multi-site complex, and a few of its sites can hold inline sub-dungeons. Random ruins, history's fall markers and cleared Living World threats all get a profile. Use the same reroll button to build one for an older ruin; its short note and name stay as they are. See [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation) for the full procedure.

Caves, disturbed burials and necropolises also carry lazy profiles, but keep their own identities: a cave is a natural survey with an optional lair draft, a disturbed burial is an active undead hazard with grave goods, and a necropolis is a tiered city of the dead with a few capped tomb sub-dungeons. History fall markers and cleared threats are wired in too; cleared sites still become ruins. Use the same reroll button to build a profile for an older marker. See [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation) for the full procedure.


You can create an image preview using the <> button and text similar to this:

`<p>Ruins of an ancient city. Untold riches may lie within.</p>`
`<p>&nbsp;</p>`
`<img src="https://upload.wikimedia.org/wikipedia/commons/4/43/Peru_Machu_Picchu_Sunrise.jpg" alt="Machu Picchu at sunrise" width="150" height="200" />`


You can also make a clickable link with an image preview:

`<p>Ruins of an ancient city. Untold riches may lie within.</p>`
`<p>&nbsp;</p>`
`<a href="https://yourwebsitehere.com">`
`<img src="https://upload.wikimedia.org/wikipedia/commons/4/43/Peru_Machu_Picchu_Sunrise.jpg" alt="Machu Picchu at sunrise" width="150" height="200" />`
`</a>`


## Marker criteria
Criteria and types of randomly added markers are defined in the generator and can change between versions. The current generator includes the following types:

* Battlefields: These are areas within a state that have a noticeable population, found in mid-elevation regions.
* Bridges: These are found in cities located near rivers, especially where the river is not close to the ocean and the water flow is significant. The busier a city's trade, the likelier its bridge.
* Brigands: Roads with high activity, usually where there’s a strong cultural presence, may attract outlaws. They favor roads of busy markets through poor land.
* Canoes: These appear in regions with rivers, representing local watercraft.
* Circuses: Found in cultural areas with developed roads, particularly near or around sea level.
* Dances: These events take place in towns with a moderately sized population.
* Dungeons: Isolated and sparsely populated regions often feature these hidden or abandoned places.
* Hill Monsters: These creatures are found in highland areas where there is some population present.
* Hot Springs: Located in elevated regions, these natural thermal baths are found in hilly or mountainous areas.
* Inns: These rest stops appear along busy roads in well-populated areas, more often in busy markets.
* Jousts: Held in larger towns, especially in places with a robust population.
* Lake Monsters: Found in freshwater lakes, representing mythical creatures.
* Lighthouses: These are positioned along coastlines with good access to the sea and a large number of water routes.
* Migrations: These occur in sparsely populated midland regions where people or animals move.
* Mines: Found in towns on an ore or mineral deposit, far more often on valuable ones such as gold, silver or gemstones. A town that extracts nothing from its deposit has an old, played-out mine.
* Mirage: Seen in hot desert regions, these are illusions caused by extreme heat and light conditions.
* Pirates: Found on the open sea along major shipping routes, representing maritime outlaws. They favor routes between busy markets.
* Portals: These mystical gateways appear in the oldest towns.
* Rifts: Occur in sparsely populated biomes that are still somewhat habitable, representing splits in the earth.
* Ruins: Found in mid-elevation cultural areas, these represent remnants of past civilizations. Each ruin carries a generated profile; see [Ruin generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Ruin-generation).
* Sacred Forests: These appear in cultural regions with temperate forests, believed to be places of natural reverence.
* Sacred Mountains: Found in high mountain regions, close to cultural areas, these are considered spiritually important.
* Sacred Palm Groves: Found in desert regions with cultural significance and some population, connected by roads.
* Sacred Pineries: These are located in cultural areas within boreal forests.
* Sea Monsters: Mythical creatures found in the ocean along busy sea routes.
* Statues: These monuments appear in low to mid-elevation regions.
* Volcanoes: Found in very high mountain regions, representing active or dormant volcanic activity.
* Waterfalls: Located in hilly or mountainous areas with rivers, especially where there’s a sharp drop in terrain nearby.
* Water sources: cells above height 30 that have a river.
* Libraries: burgs with a culture and a noticeable population.
* Fairs: small burgs, more often those trading many goods.
* Customs houses: at most one where a road crosses into a state the other trades with under tariffs, more often on the borders with the most tariffs.
* Guild halls: burgs famed for a manufactured good, placed before mines so a mining town can keep its guild. A burg is famed when it leads the good's makers across the world and in its state, and the good is a real part of its work.
* Merchant houses: market centers, more often those whose market margin earns the most.
* Caves: populated cells at height 50 and above. Each cave carries a generated survey; see [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation).
* Disturbed burials: populated land cells. Fantasy culture sets only. Each carries a generated burial profile; see [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation).
* Necropolises: land cells with almost no population. Each carries a generated necropolis profile; see [Underground site generation](https://github.com/0xPaladin/Fantasy-Map-Generator/wiki/Underground-site-generation).
* Encounters: populated land cells.
* Party: a single movable marker placed in a burg, meant to track the current location of an adventuring party.
