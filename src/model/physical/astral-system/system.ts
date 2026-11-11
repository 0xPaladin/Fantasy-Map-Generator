// Ported from VerseEras game/js/world/generators/feral-system/astro/system.js (2026-10-25).
import { HI as calcHI } from "./astrophysics";
import { layoutPosition } from "./layout";
import { generatePlanet, type Moon, type Planet } from "./planet";
import { createRng } from "./rng";
import { type GenerateStarOptions, generateStar, type StarSummary } from "./stars";
import { clamp, rollDice } from "./util";

export interface PlanetarySummary {
  type: string;
  aAU: number;
  radiusRE: number;
}

export interface System {
  seed: string;
  star: StarSummary;
  planets: Planet[];
  HI: (number | number[])[][];
}

export interface GenerateSystemOptions {
  forceHabitable?: boolean;
  primaryType?: string;
  systemName?: string;
}

interface DiceRate {
  count: number;
  sides: number;
  add?: number;
}

interface TypeRates {
  small: DiceRate | null;
  giant: DiceRate | null;
}

/** Generate a full star system: primary (+ companions), planets, and moons. */
export function generateSystem(seed: string, opts: GenerateSystemOptions = {}): System {
  // The readout's chart owns the primary's class: force a main-sequence reading.
  const starOptions: GenerateStarOptions = {
    forceHabitable: !!opts.forceHabitable,
    forcedLumClass: "V"
  };
  if (opts.primaryType) starOptions.forcedType = opts.primaryType;

  const star = generateStar(createRng(`${seed}/star`), starOptions);

  const HI: (number | number[])[][] = [[], [], [], [], []];
  const basePlanetData = generateSystemPlanets(seed, star);

  const planets = basePlanetData.map((summary, i) => {
    const planet = generatePlanet(
      { seed, star },
      {
        i,
        classification: summary.type === "gas giant" ? "gas giant" : "rocky",
        orbit: summary.aAU,
        radius: (summary.radiusRE * 6371) / 1000
      }
    );

    planet.subtype = summary.type;

    // Kepler's 3rd law: P^2 = a^3 / M_total.
    const periodYears = Math.sqrt(planet.orbit ** 3 / Math.max(star.totalMass, 1e-6));
    planet.periodDays = +(periodYears * 365.25).toFixed(1);

    HI[planet.HI - 1].push(i);
    planet.moonHI.forEach((indices, hi) => {
      for (const moonIndex of indices) HI[hi].push([i, moonIndex]);
    });

    return planet;
  });

  if (opts.forceHabitable) {
    ensureHabitableWorld(seed, star, planets, HI);
  }

  // Layout: primary (au 0), companions, then planets sorted by orbit.
  let index = 0;
  star.primary.pos = layoutPosition(0, index);
  index += 1;

  star.companions.forEach(companion => {
    companion.pos = layoutPosition(companion.separationAU, index);
    index += 1;
  });

  planets
    .slice()
    .sort((a, b) => a.orbit - b.orbit)
    .forEach(planet => {
      planet.pos = layoutPosition(planet.orbit, index);
      index += 1;
    });

  return { seed, star, planets, HI };
}

/** Decide how many planets a system has, and their rough type/orbit/radius. */
export function generateSystemPlanets(seed: string, star: StarSummary): PlanetarySummary[] {
  const primaryType = star.primary.spectral;
  const companionSepAU = star.multiplicity === 1 ? null : star.companions[0].separationAU;
  const orbits = star.orbits;

  const rand = createRng(`${seed}/planets`);
  const type = (primaryType || "G").toUpperCase().charAt(0);

  const baseRates: Record<string, TypeRates> = {
    M: { small: { count: 2, sides: 4 }, giant: { count: 1, sides: 3, add: -2 } },
    K: { small: { count: 2, sides: 3 }, giant: { count: 1, sides: 2 } },
    G: { small: { count: 1, sides: 4, add: 1 }, giant: { count: 1, sides: 3 } },
    F: { small: { count: 1, sides: 3, add: -1 }, giant: { count: 1, sides: 4 } },
    A: { small: { count: 1, sides: 3, add: -1 }, giant: { count: 1, sides: 4 } },
    B: { small: null, giant: { count: 1, sides: 3, add: -1 } },
    O: { small: null, giant: { count: 1, sides: 3, add: -1 } }
  };

  const rates = baseRates[type] || baseRates.G;

  let suppression = 1.0;
  if (companionSepAU != null && companionSepAU > 0) {
    if (companionSepAU < 10) suppression = 0.08;
    else if (companionSepAU < 50) suppression = 0.25;
    else if (companionSepAU < 100) suppression = 0.42;
    else if (companionSepAU < 500) suppression = 0.7;
    else if (companionSepAU < 1500) suppression = 0.88;
  }

  let smallRate = (rates.small ? rollDice(rand, rates.small) : 0) * suppression;
  let giantRate = (rates.giant ? rollDice(rand, rates.giant) : 0) * suppression;

  const maxPlanets = 10;
  const planets: PlanetarySummary[] = [];

  while (smallRate > 0 && planets.length < maxPlanets) {
    const wiggle = rand.range(0.85, 1);
    const aAU = wiggle * orbits[planets.length];
    let radiusRE = 0.6 + rand.next() * 2.4;
    if (rand.chance(0.18)) radiusRE = 2.8 + rand.next() * 2.5;
    planets.push({
      type: radiusRE < 1.6 ? "rocky" : radiusRE < 3.5 ? "super-Earth/sub-Neptune" : "Neptune-like",
      aAU: +aAU.toFixed(3),
      radiusRE: +radiusRE.toFixed(2)
    });
    smallRate -= 1;
  }

  while (giantRate > 0 && planets.length < maxPlanets) {
    const wiggle = rand.range(0.85, 1);
    const aAU = wiggle * orbits[planets.length];
    let radiusRE = 8 + rand.next() * 6;
    if (aAU < 1 && rand.chance(0.4)) radiusRE += 2 + rand.next() * 4;
    planets.push({
      type: "gas giant",
      aAU: +aAU.toFixed(3),
      radiusRE: +radiusRE.toFixed(1)
    });
    giantRate -= 1;
  }

  return planets;
}

/**
 * When forceHabitable is active, guarantee there is at least one HI 1 ('earthlike') world:
 * - If a gas giant naturally sits closest to the habitable zone, give it an earthlike moon.
 * - Otherwise, configure the closest rocky planet as an earthlike world.
 */
function ensureHabitableWorld(seed: string, star: StarSummary, planets: Planet[], HI: (number | number[])[][]): void {
  if (HI[0].length > 0) return; // already has an earthlike planet or moon

  const rng = createRng(`${seed}/earthlike`);
  const targetInsolation = +rng.range(1.15, 1.35).toFixed(2);
  const targetAU = +Math.sqrt(star.luminosity / targetInsolation).toFixed(3);

  if (planets.length === 0) {
    const base = generatePlanet(
      { seed, star, orbits: [targetAU] },
      { i: 0, classification: "rocky", orbit: targetAU, radius: 6.371 }
    );
    base.subtype = "rocky";
    base.orbit = targetAU;
    base.insolation = targetInsolation;
    base.radius = 6371;
    base.density = 5.51;
    base.hydrographics = 71;
    base.atmosphere = "Breathable";
    base.color = "#3a75a4";
    const hab = calcHI(base.insolation, base.radius, base.density, base.hydrographics, base.atmosphere);
    Object.assign(base, hab);
    base.HI = 1;
    base.description = "earthlike";
    const periodYears = Math.sqrt(base.orbit ** 3 / Math.max(star.totalMass, 1e-6));
    base.periodDays = +(periodYears * 365.25).toFixed(1);
    planets.push(base);
    HI[0].push(0);
    return;
  }

  // Find the planet closest to the habitable orbit
  let closestIndex = 0;
  let closestDist = Math.abs(planets[0].orbit - targetAU);
  for (let i = 1; i < planets.length; i += 1) {
    const dist = Math.abs(planets[i].orbit - targetAU);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  }

  const closest = planets[closestIndex];

  // Nudge orbit safely within neighbor bounds to align insolation with the habitable zone
  const prevOrbit = closestIndex > 0 ? planets[closestIndex - 1].orbit : 0;
  const nextOrbit = closestIndex < planets.length - 1 ? planets[closestIndex + 1].orbit : Infinity;
  const minBound = prevOrbit > 0 ? prevOrbit * 1.15 : targetAU * 0.7;
  const maxBound = Number.isFinite(nextOrbit) ? nextOrbit * 0.85 : targetAU * 1.4;
  closest.orbit = +clamp(targetAU, minBound, maxBound).toFixed(3);
  closest.insolation = +(star.luminosity / Math.max(closest.orbit, 1e-6) ** 2).toFixed(3);
  closest.minorAxis = +Math.sqrt(closest.orbit ** 2 * (1 - closest.eccentricity ** 2)).toFixed(3);
  const periodYears = Math.sqrt(closest.orbit ** 3 / Math.max(star.totalMass, 1e-6));
  closest.periodDays = +(periodYears * 365.25).toFixed(1);

  // Clear existing HI entries for this planet and its moons
  for (let h = 0; h < 5; h += 1) {
    HI[h] = HI[h].filter(entry => (typeof entry === "number" ? entry !== closestIndex : entry[0] !== closestIndex));
  }

  if (closest.type === "gas giant") {
    // Gas giant closest to habitable zone -> Earthlike Moon!
    let moon: Moon;
    if (closest.moons.length === 0) {
      const moonOrbit = 15;
      moon = {
        parentSeed: closest.seed,
        seed: `${closest.seed}/0`,
        i: 0,
        orbit: moonOrbit,
        eccentricity: 0.01,
        minorAxis: moonOrbit,
        insolation: closest.insolation,
        rmin: 10,
        rmax: 30,
        kind: "moon",
        type: "rocky",
        color: "#45739c",
        radius: 5800,
        density: 5.4,
        hydrographics: 65,
        atmosphere: "Breathable",
        pos: layoutPosition(moonOrbit, 0),
        HI: 1,
        description: "earthlike",
        g: "0.93",
        albedo: 0.2,
        tempC: "14.2",
        temp: "temperate"
      };
      closest.moons.push(moon);
      closest.orbits.push(moonOrbit);
    } else {
      moon = closest.moons[0];
    }

    moon.type = "rocky";
    moon.insolation = closest.insolation;
    moon.radius = 5800;
    moon.density = 5.4;
    moon.hydrographics = 65;
    moon.atmosphere = "Breathable";
    moon.color = "#45739c";
    const hab = calcHI(moon.insolation, moon.radius, moon.density, moon.hydrographics, moon.atmosphere);
    Object.assign(moon, hab);
    moon.HI = 1;
    moon.description = "earthlike";

    // Keep gas giant itself in its habitability bucket
    if (closest.HI >= 1 && closest.HI <= 5) {
      HI[closest.HI - 1].push(closestIndex);
    }
    // Rebuild moonHI and update system HI
    closest.moonHI = [[], [], [], [], []];
    closest.moons.forEach((m, mIdx) => {
      closest.moonHI[m.HI - 1].push(mIdx);
      HI[m.HI - 1].push([closestIndex, mIdx]);
    });
  } else {
    // Rocky planet closest to habitable zone -> Earthlike Planet!
    closest.type = "rocky";
    closest.subtype = "rocky";
    closest.radius = 6371;
    closest.density = 5.51;
    closest.hydrographics = 71;
    closest.atmosphere = "Breathable";
    closest.color = "#3a75a4";
    const hab = calcHI(closest.insolation, closest.radius, closest.density, closest.hydrographics, closest.atmosphere);
    Object.assign(closest, hab);
    closest.HI = 1;
    closest.description = "earthlike";

    HI[0].push(closestIndex);
    closest.moons.forEach((m, mIdx) => {
      if (m.HI >= 1 && m.HI <= 5) {
        HI[m.HI - 1].push([closestIndex, mIdx]);
      }
    });
  }
}
