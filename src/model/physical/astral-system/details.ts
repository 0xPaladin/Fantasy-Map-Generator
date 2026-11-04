// The generated system readout: the astro port mapped to dialog rows.

import { isCoreOrCapital, starClassFor } from "@/model/physical/astral-naming";
import type { Burg } from "@/model/political/burgs-generator";
import { starTypeData } from "./astrophysics";
import { type GenerateSystemOptions, generateSystem } from "./system";

export interface StarRow {
  role: string;
  spectral: string;
  luminosityClass: string | null;
  massSolar: number;
  luminositySolar: number;
  color: string;
  separationAU: number | null;
  periodYears: number | null;
  massRatio: number | null;
}

export interface MoonRow {
  name: string;
  type: string;
  orbitAU: number;
  radiusEarth: number;
  gravity: string;
  temperature: string;
  temperatureC: string;
  atmosphere: string;
  water: number;
  habitability: string;
  hi: number;
  color: string;
  periodDays: number;
  bodyId: string;
}

export interface PlanetRow {
  name: string;
  type: string;
  orbitAU: number;
  radiusEarth: number;
  gravity: string;
  temperature: string;
  temperatureC: string;
  atmosphere: string;
  water: number;
  habitability: string;
  hi: number;
  moons: string[];
  color: string;
  periodDays: number;
  bodyId?: string;
  moonRows?: MoonRow[];
}

export interface SystemDetails {
  stars: StarRow[];
  totalMassSolar: number;
  snowLineAU: number;
  planetCount: number;
  habitableCandidate: boolean;
  planets: PlanetRow[];
}

export interface SystemDetailsInput {
  seed: string;
  systemName: string;
  spectral?: string;
  forceHabitable?: boolean;
}

const ROMAN_TABLE: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"]
];

function toRoman(value: number): string {
  let remainder = value;
  let result = "";
  for (const [number, symbol] of ROMAN_TABLE) {
    while (remainder >= number) {
      result += symbol;
      remainder -= number;
    }
  }
  return result;
}

function toLetter(index: number): string {
  return String.fromCharCode(97 + (index % 26));
}

/** Generate and map one system, a pure function of its inputs. */
export function generateSystemDetails({ seed, systemName, spectral, forceHabitable }: SystemDetailsInput): SystemDetails {
  const options: GenerateSystemOptions = {};
  if (forceHabitable) options.forceHabitable = true;
  if (spectral) options.primaryType = starTypeData[spectral] ? spectral : "G";
  const system = generateSystem(seed, options);
  const { star } = system;
  const name = systemName.trim() || "System";

  const stars: StarRow[] = [
    {
      role: "Primary",
      spectral: star.primary.spectral,
      luminosityClass: star.primary.lumClass,
      massSolar: star.primary.mass,
      luminositySolar: star.primary.luminosity,
      color: starTypeData[star.primary.spectral]?.color ?? "rgb(255,255,255)",
      separationAU: null,
      periodYears: null,
      massRatio: null
    },
    ...star.companions.map((companion, index) => ({
      role: index === 0 ? "Secondary" : `Companion ${index + 2}`,
      spectral: companion.spectral,
      luminosityClass: null,
      massSolar: companion.mass,
      luminositySolar: starTypeData[companion.spectral]?.luminosity ?? 0,
      color: starTypeData[companion.spectral]?.color ?? "rgb(255,255,255)",
      separationAU: companion.separationAU,
      periodYears: companion.periodYears,
      massRatio: companion.massRatio
    }))
  ];

  const planets: PlanetRow[] = system.planets.map((planet, index) => {
    const planetName = `${name} ${toRoman(index + 1)}`;
    const moonRows: MoonRow[] = planet.moons
      .map((moon, moonIndex) => ({ moon, moonIndex }))
      .filter(({ moon }) => moon.HI === 1)
      .map(({ moon, moonIndex }) => {
        const moonName = `${planetName} ${toLetter(moonIndex)}`;
        const massSolar = (planet.density / 5.51) * (planet.radius / 6.371) ** 3 / 332946;
        const orbitAU = Math.max((moon.orbit * planet.radius) / 149598, 1e-8);
        const periodDays = +Math.max(365.25 * Math.sqrt(orbitAU ** 3 / Math.max(massSolar, 1e-12)), 0.01).toFixed(1);
        return {
          name: moonName,
          type: moon.type,
          orbitAU: planet.orbit,
          radiusEarth: +(moon.radius / 6371).toFixed(2),
          gravity: moon.g,
          temperature: moon.temp,
          temperatureC: moon.tempC,
          atmosphere: moon.atmosphere,
          water: moon.hydrographics,
          habitability: moon.description,
          hi: moon.HI,
          color: moon.color,
          periodDays,
          bodyId: `planet-${index}-moon-${moonIndex}`
        };
      });

    return {
      name: planetName,
      type: planet.subtype ?? planet.type,
      orbitAU: planet.orbit,
      radiusEarth: planet.radius / 6371,
      gravity: planet.g,
      temperature: planet.temp,
      temperatureC: planet.tempC,
      atmosphere: planet.atmosphere,
      water: planet.hydrographics,
      habitability: planet.description,
      hi: planet.HI,
      moons: planet.moons.map((_, moonIndex) => `${planetName} ${toLetter(moonIndex)}`),
      color: Array.isArray(planet.color) ? planet.color[0] : planet.color,
      periodDays: planet.periodDays ?? 0,
      bodyId: `planet-${index}`,
      moonRows: moonRows.length ? moonRows : undefined
    };
  });

  return {
    stars,
    totalMassSolar: star.totalMass,
    snowLineAU: 2.7 * Math.sqrt(star.luminosity),
    planetCount: system.planets.length,
    habitableCandidate: star.isHabitableCandidate,
    planets
  };
}

/** The readout for one burg, seeded by the map and the burg id. */
export function systemDetailsFor(
  burg: Pick<Burg, "i" | "name" | "population"> & Partial<Pick<Burg, "capital" | "state">>
): SystemDetails {
  const seed = `${options.map.seed}/astral/system/${burg.i}`;
  const systemName = burg.name ?? "";
  if (isCoreOrCapital(burg)) {
    return generateSystemDetails({
      seed,
      systemName,
      forceHabitable: true
    });
  }
  const { class: spectral } = starClassFor(burg);
  return generateSystemDetails({
    seed,
    systemName,
    spectral,
    forceHabitable: false
  });
}
