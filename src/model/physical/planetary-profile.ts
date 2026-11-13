// Resolves a colonized solar-system body's surface archetype from its astral-system
// astrophysics, and syncs FMG's map options (globe coordinates, climate, hydrographics)
// to it before the body's surface is materialized. See docs/plans/solar-system-colonization.md.
import type { Moon, Planet } from "@/model/physical/astral-system/planet";
import { getKmInDistanceUnit } from "@/model/units";
import { ARCHETYPE_HEIGHTMAP_TEMPLATES, type PlanetaryArchetype } from "@/types/planetary";
import { minmax, rn } from "@/utils/number-utils";

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

/** Astronomical radius of a body in kilometers, normalizing megameters if needed */
export function getRadiusKm(body: CelestialBody | { radius?: number } | { astro?: { radius?: number } }): number {
  const r = (body as { astro?: { radius?: number } })?.astro?.radius ?? (body as { radius?: number })?.radius;
  if (typeof r !== "number" || r <= 0) return 6371;
  return r < 50 ? r * 1000 : r;
}

/**
 * Compute the distance scale (units per pixel) for a full-globe equirectangular map
 * of a body with a given radius in kilometers.
 *
 * For a full globe (mapSize = 100), pole-to-pole meridian = graphHeight px = π * radiusKm.
 */
export function computePlanetaryDistanceScale(radiusKm: number, graphHeight: number, kmPerUnit: number): number {
  if (graphHeight <= 0) return 3;
  const effectiveKmPerUnit = kmPerUnit > 0 ? kmPerUnit : 1;
  const meridianInUnits = (Math.PI * radiusKm) / effectiveKmPerUnit;
  const scale = meridianInUnits / graphHeight;
  return rn(Math.max(scale, 0.01), 2);
}

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
 * Configure the map options for a body's surface: full-globe coordinates, distance scale, the archetype itself,
 * its heightmap template, hydrographics, pole-to-equator temperatures derived from the body's mean temperature, and
 * precipitation scaled from its hydrographics. Returns the resolved archetype.
 */
export function applyPlanetaryOptions(body: CelestialBody): PlanetaryArchetype {
  const archetype = resolveArchetype(body);
  const geography = options.map.geography;
  geography.archetype = archetype;
  geography.hydrographics = body.hydrographics;
  geography.mapSize = 100;
  geography.latitude = 50;
  geography.longitude = 50;
  geography.coordinates = { latT: 180, latN: 90, latS: -90, lonT: 360, lonW: -180, lonE: 180 };

  options.generation.template = ARCHETYPE_HEIGHTMAP_TEMPLATES[archetype];
  options.generation.geography = { mapSize: 100, latitude: 50, longitude: 50 };
  options.map.extents = "whole";
  options.map.astral = false;

  const radiusKm = getRadiusKm(body);
  const graphHeight = options.map.graph?.height || 640;
  const kmPerUnit = getKmInDistanceUnit();
  options.map.units.distance.scale = computePlanetaryDistanceScale(radiusKm, graphHeight, kmPerUnit);

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
