// The built-in "Sol System (Near-Future)" preset: a canonical colonized solar system for the
// Astral workflow, standing next to procedural generateSystem(seed) rolls. Archetypes are
// pinned here (plan §5.3) — Io is volcanic by tidal flexing and Callisto lunar by its ancient
// regolith even though the generic resolveArchetype() climate rules alone would classify some
// of these bodies differently. Surface materialization reads the pinned archetype for the
// heightmap template and the astro readouts for climate.
import type { Moon, Planet } from "@/model/physical/astral-system/planet";
import type { PlanetaryArchetype } from "@/types/planetary";

export interface SolPresetBody {
  id: string;
  name: string;
  kind: "planet" | "moon";
  parentId: string | null;
  archetype: PlanetaryArchetype | "gas_giant";
  colonizable: boolean;
  semiMajorAxisAU: number;
  eccentricity: number;
  angleDeg: number;
  periodDays: number;
  /** the astrophysics readouts the generators and the body inspector consume */
  astro: {
    seed: string;
    i: number;
    type: string;
    radius: number; // megameters, Earth = 6.371
    density: number; // g/cc
    color: string;
    HI: number;
    hydrographics: number;
    atmosphere: string;
    tempC: string;
    temp: string;
    g: string;
  };
}

export interface SolPreset {
  name: string;
  star: { name: string; spectral: string };
  bodies: SolPresetBody[];
}

const SOLAR = "sol";

/** Io-class tidal heating keeps the surface molten regardless of insolation */
export const SOL_SYSTEM_PRESET: SolPreset = {
  name: "Sol System (Near-Future)",
  star: { name: "Sol", spectral: "G" },
  bodies: [
    {
      id: "mercury",
      name: "Mercury",
      kind: "planet",
      parentId: null,
      archetype: "lunar",
      colonizable: true,
      semiMajorAxisAU: 0.387,
      eccentricity: 0.206,
      angleDeg: 0,
      periodDays: 88,
      astro: {
        seed: `${SOLAR}/mercury`,
        i: 0,
        type: "rocky",
        radius: 2.44,
        density: 5.43,
        color: "#9c9a92",
        HI: 4,
        hydrographics: 0,
        atmosphere: "Trace",
        tempC: "167.0",
        temp: "extremely hot",
        g: "0.38"
      }
    },
    {
      id: "venus",
      name: "Venus",
      kind: "planet",
      parentId: null,
      archetype: "volcanic",
      colonizable: true,
      semiMajorAxisAU: 0.723,
      eccentricity: 0.007,
      angleDeg: 137,
      periodDays: 224.7,
      astro: {
        seed: `${SOLAR}/venus`,
        i: 1,
        type: "rocky",
        radius: 6.05,
        density: 5.24,
        color: "#e6c9a3",
        HI: 5,
        hydrographics: 0,
        atmosphere: "Corrosive",
        tempC: "464.0",
        temp: "inferno",
        g: "0.90"
      }
    },
    {
      id: "earth",
      name: "Earth",
      kind: "planet",
      parentId: null,
      archetype: "terran",
      colonizable: true,
      semiMajorAxisAU: 1.0,
      eccentricity: 0.017,
      angleDeg: 275,
      periodDays: 365.25,
      astro: {
        seed: `${SOLAR}/earth`,
        i: 2,
        type: "rocky",
        radius: 6.371,
        density: 5.51,
        color: "#3b6fb5",
        HI: 1,
        hydrographics: 71,
        atmosphere: "Breathable",
        tempC: "15.0",
        temp: "temperate",
        g: "1.00"
      }
    },
    {
      id: "luna",
      name: "Luna",
      kind: "moon",
      parentId: "earth",
      archetype: "lunar",
      colonizable: true,
      semiMajorAxisAU: 0.00257,
      eccentricity: 0.055,
      angleDeg: 45,
      periodDays: 27.32,
      astro: {
        seed: `${SOLAR}/luna`,
        i: 0,
        type: "rocky",
        radius: 1.737,
        density: 3.34,
        color: "#b5b4bc",
        HI: 4,
        hydrographics: 0,
        atmosphere: "Trace",
        tempC: "-23.0",
        temp: "cold",
        g: "0.17"
      }
    },
    {
      id: "mars",
      name: "Mars",
      kind: "planet",
      parentId: null,
      archetype: "martian",
      colonizable: true,
      semiMajorAxisAU: 1.524,
      eccentricity: 0.093,
      angleDeg: 52,
      periodDays: 687,
      astro: {
        seed: `${SOLAR}/mars`,
        i: 3,
        type: "rocky",
        radius: 3.39,
        density: 3.93,
        color: "#c16641",
        HI: 3,
        hydrographics: 0,
        atmosphere: "Inert",
        tempC: "-63.0",
        temp: "extremely cold",
        g: "0.38"
      }
    },
    {
      id: "ceres",
      name: "Ceres",
      kind: "planet",
      parentId: null,
      archetype: "lunar",
      colonizable: true,
      semiMajorAxisAU: 2.766,
      eccentricity: 0.076,
      angleDeg: 190,
      periodDays: 1680,
      astro: {
        seed: `${SOLAR}/ceres`,
        i: 4,
        type: "rocky",
        radius: 0.47,
        density: 2.16,
        color: "#8c8b90",
        HI: 4,
        hydrographics: 0,
        atmosphere: "Trace",
        tempC: "-105.0",
        temp: "extremely cold",
        g: "0.03"
      }
    },
    {
      id: "jupiter",
      name: "Jupiter",
      kind: "planet",
      parentId: null,
      archetype: "gas_giant",
      colonizable: false,
      semiMajorAxisAU: 5.204,
      eccentricity: 0.049,
      angleDeg: 327,
      periodDays: 4333,
      astro: {
        seed: `${SOLAR}/jupiter`,
        i: 5,
        type: "gas giant",
        radius: 69.9,
        density: 1.33,
        color: "#d8ca9d",
        HI: 5,
        hydrographics: 0,
        atmosphere: "Crushing",
        tempC: "-110.0",
        temp: "extremely cold",
        g: "2.53"
      }
    },
    {
      id: "io",
      name: "Io",
      kind: "moon",
      parentId: "jupiter",
      archetype: "volcanic",
      colonizable: true,
      semiMajorAxisAU: 0.00282,
      eccentricity: 0.004,
      angleDeg: 90,
      periodDays: 1.77,
      astro: {
        seed: `${SOLAR}/io`,
        i: 0,
        type: "rocky",
        radius: 1.822,
        density: 3.53,
        color: "#d4b838",
        HI: 4,
        hydrographics: 0,
        atmosphere: "Trace",
        tempC: "-143.0",
        temp: "extremely cold",
        g: "0.18"
      }
    },
    {
      id: "europa",
      name: "Europa",
      kind: "moon",
      parentId: "jupiter",
      archetype: "icy_moon",
      colonizable: true,
      semiMajorAxisAU: 0.00449,
      eccentricity: 0.009,
      angleDeg: 200,
      periodDays: 3.55,
      astro: {
        seed: `${SOLAR}/europa`,
        i: 1,
        type: "rocky",
        radius: 1.561,
        density: 3.01,
        color: "#d8e8f0",
        HI: 3,
        hydrographics: 90,
        atmosphere: "Trace",
        tempC: "-160.0",
        temp: "frigid",
        g: "0.13"
      }
    },
    {
      id: "ganymede",
      name: "Ganymede",
      kind: "moon",
      parentId: "jupiter",
      archetype: "icy_moon",
      colonizable: true,
      semiMajorAxisAU: 0.00716,
      eccentricity: 0.001,
      angleDeg: 310,
      periodDays: 7.15,
      astro: {
        seed: `${SOLAR}/ganymede`,
        i: 2,
        type: "rocky",
        radius: 2.634,
        density: 1.94,
        color: "#9bb8c9",
        HI: 3,
        hydrographics: 50,
        atmosphere: "Trace",
        tempC: "-163.0",
        temp: "frigid",
        g: "0.15"
      }
    },
    {
      id: "callisto",
      name: "Callisto",
      kind: "moon",
      parentId: "jupiter",
      archetype: "lunar",
      colonizable: true,
      semiMajorAxisAU: 0.0126,
      eccentricity: 0.007,
      angleDeg: 60,
      periodDays: 16.69,
      astro: {
        seed: `${SOLAR}/callisto`,
        i: 3,
        type: "rocky",
        radius: 2.41,
        density: 1.83,
        color: "#8c8b90",
        HI: 4,
        hydrographics: 0,
        atmosphere: "Trace",
        tempC: "-139.0",
        temp: "extremely cold",
        g: "0.13"
      }
    },
    {
      id: "saturn",
      name: "Saturn",
      kind: "planet",
      parentId: null,
      archetype: "gas_giant",
      colonizable: false,
      semiMajorAxisAU: 9.58,
      eccentricity: 0.057,
      angleDeg: 105,
      periodDays: 10759,
      astro: {
        seed: `${SOLAR}/saturn`,
        i: 6,
        type: "gas giant",
        radius: 58.2,
        density: 0.69,
        color: "#e3d3a0",
        HI: 5,
        hydrographics: 0,
        atmosphere: "Crushing",
        tempC: "-140.0",
        temp: "extremely cold",
        g: "1.06"
      }
    },
    {
      id: "titan",
      name: "Titan",
      kind: "moon",
      parentId: "saturn",
      archetype: "titan",
      colonizable: true,
      semiMajorAxisAU: 0.00817,
      eccentricity: 0.029,
      angleDeg: 145,
      periodDays: 15.95,
      astro: {
        seed: `${SOLAR}/titan`,
        i: 0,
        type: "rocky",
        radius: 2.575,
        density: 1.88,
        color: "#7a5c38",
        HI: 3,
        hydrographics: 45,
        atmosphere: "Inert",
        tempC: "-179.0",
        temp: "frigid",
        g: "0.14"
      }
    },
    {
      id: "enceladus",
      name: "Enceladus",
      kind: "moon",
      parentId: "saturn",
      archetype: "icy_moon",
      colonizable: true,
      semiMajorAxisAU: 0.00159,
      eccentricity: 0.005,
      angleDeg: 255,
      periodDays: 1.37,
      astro: {
        seed: `${SOLAR}/enceladus`,
        i: 1,
        type: "rocky",
        radius: 0.252,
        density: 1.61,
        color: "#d8e8f0",
        HI: 3,
        hydrographics: 90,
        atmosphere: "Trace",
        tempC: "-198.0",
        temp: "frigid",
        g: "0.01"
      }
    }
  ]
};

/** Build the Planet/Moon-shaped astro record the generators and inspector read from a preset row */
export function presetAstro(body: SolPresetBody): Planet | Moon {
  return {
    parentSeed: SOLAR,
    seed: body.astro.seed,
    i: body.astro.i,
    orbit: body.semiMajorAxisAU,
    eccentricity: body.eccentricity,
    minorAxis: body.semiMajorAxisAU * Math.sqrt(1 - body.eccentricity ** 2),
    insolation: 1 / body.semiMajorAxisAU ** 2,
    rmin: 0.2,
    rmax: body.kind === "moon" ? 40 * body.astro.radius : 4,
    kind: body.kind,
    type: body.astro.type,
    subtype: body.astro.type,
    radius: body.astro.radius < 50 ? body.astro.radius * 1000 : body.astro.radius,
    density: body.astro.density,
    hydrographics: body.astro.hydrographics,
    atmosphere: body.astro.atmosphere,
    color: body.astro.color,
    orbits: [],
    moons: [],
    moonHI: [[], [], [], [], []],
    periodDays: body.periodDays,
    HI: body.astro.HI,
    description: body.archetype,
    g: body.astro.g,
    albedo: 0.3,
    tempC: body.astro.tempC,
    temp: body.astro.temp
  } as unknown as Planet | Moon;
}
