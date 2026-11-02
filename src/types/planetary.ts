// Surface archetypes bridging astral-system astrophysics (HI, hydrographics, atmosphere,
// temperature) and FMG's physical generators (heightmap template, biomes, rivers, lakes).
// The archetype lives on options.map.geography; when it is absent the map is terran and every
// generator behaves exactly like standard fantasy map generation.

export const PLANETARY_ARCHETYPES = ["terran", "lunar", "martian", "icy_moon", "titan", "volcanic"] as const;

export type PlanetaryArchetype = (typeof PLANETARY_ARCHETYPES)[number];

/** the heightmap template each archetype materializes with; terran keeps the standard globe template */
export const ARCHETYPE_HEIGHTMAP_TEMPLATES: Record<PlanetaryArchetype, string> = {
  terran: "globeWorld",
  lunar: "lunarWorld",
  martian: "martianWorld",
  icy_moon: "icyMoon",
  titan: "titanWorld",
  volcanic: "volcanicWorld"
};
