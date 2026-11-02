// Resolves a colonized solar-system body's surface archetype from its astral-system
// astrophysics, and syncs FMG's map options (globe coordinates, climate, hydrographics)
// to it before the body's surface is materialized. See docs/plans/solar-system-colonization.md.
import type { Moon, Planet } from "@/model/physical/astral-system/planet";
import type { PlanetaryArchetype } from "@/types/planetary";
import { minmax } from "@/utils/number-utils";

type CelestialBody = Planet | Moon;

const TERRAN_ATMOSPHERES = ["Breathable", "Filterable"];
const VOLCANIC_TEMPERATURES = ["inferno", "extremely hot", "very hot"];
const COLD_TEMPERATURES = ["frigid", "extremely cold"];
const TITAN_ATMOSPHERES = ["Toxic", "Inert", "Crushing"];
const THICK_ATMOSPHERES = ["Crushing", "Toxic", "Corrosive"];

/** Earth's ~71% hydrographics maps to the default precipitation of 100 */
const EARTH_HYDROGRAPHICS = 71;
/** climate temperatures feed an Int8Array, so the derived values must stay in range */
const TEMPERATURE_LIMITS = { min: -120, max: 120 } as const;

/** Classify a planet or moon into the surface archetype its body materializes with */
export function resolveArchetype(body: CelestialBody): PlanetaryArchetype {
  if (body.HI === 1 || (body.hydrographics >= 25 && TERRAN_ATMOSPHERES.includes(body.atmosphere))) return "terran";
  if (VOLCANIC_TEMPERATURES.includes(body.temp) || body.atmosphere === "Corrosive") return "volcanic";
  if (COLD_TEMPERATURES.includes(body.temp) && body.hydrographics > 0 && TITAN_ATMOSPHERES.includes(body.atmosphere))
    return "titan";
  if (COLD_TEMPERATURES.includes(body.temp)) return "icy_moon";
  if (body.hydrographics === 0 && body.atmosphere === "Trace") return "lunar";
  return "martian";
}

/**
 * Configure the map options for a body's surface: full-globe coordinates, the archetype itself,
 * its hydrographics, pole-to-equator temperatures derived from the body's mean temperature, and
 * precipitation scaled from its hydrographics. Returns the resolved archetype.
 */
export function applyPlanetaryOptions(body: CelestialBody): PlanetaryArchetype {
  const archetype = resolveArchetype(body);
  const geography = options.map.geography;
  geography.archetype = archetype;
  geography.hydrographics = body.hydrographics;
  geography.coordinates = { latT: 180, latN: 90, latS: -90, lonT: 360, lonW: -180, lonE: 180 };

  // narrow delta under a thick atmosphere, wide under a trace one, moderate in between
  const tempC = Number(body.tempC);
  const base = Number.isFinite(tempC) ? Math.round(minmax(tempC, TEMPERATURE_LIMITS.min, TEMPERATURE_LIMITS.max)) : 0;
  let equator = base;
  let poles = base;
  if (THICK_ATMOSPHERES.includes(body.atmosphere)) {
    equator = base + 8;
    poles = base - 12;
  } else if (body.atmosphere === "Trace") {
    equator = base + 30;
    poles = base - 50;
  } else {
    equator = base + 18;
    poles = base - 28;
  }
  options.map.climate.temperature = {
    equator: minmax(equator, TEMPERATURE_LIMITS.min, TEMPERATURE_LIMITS.max),
    northPole: minmax(poles, TEMPERATURE_LIMITS.min, TEMPERATURE_LIMITS.max),
    southPole: minmax(poles, TEMPERATURE_LIMITS.min, TEMPERATURE_LIMITS.max)
  };

  const hydrographics = minmax(body.hydrographics, 0, 100);
  options.map.climate.precipitation =
    hydrographics === 0 && body.atmosphere === "Trace" ? 0 : Math.round((hydrographics / EARTH_HYDROGRAPHICS) * 100);

  return archetype;
}
