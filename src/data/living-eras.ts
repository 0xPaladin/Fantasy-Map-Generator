// The Living World's era ladder: the stock development eras, nothing more.
// A polity's era is the stock era its population-weighted mean development
// falls in (Development.eras, configured per map).

import { Development } from "@/model/society/development-generator";

/** The map's development eras with their starting levels, oldest first. */
export function eras(): readonly { name: string; level: number }[] {
  return Development.eras;
}

/** Era index for a development level, 0 at the first era. */
export function eraIndex(development: number): number {
  return Development.getEraIndex(development);
}

/** Era name for a development level. */
export function eraName(development: number): string {
  return Development.getEra(development);
}

/** A development level at which a faction counts as settled enough to claim sovereignty. */
export const SOVEREIGN_DEVELOPMENT = 18; // the Iron Age band of the stock eras

/**
 * Frozen legacy thresholds: roster JSONs still name an OpenCiv tech per unit.
 * The tech tree is gone, so each id keeps the development level it used to
 * require; unit gating compares a polity's mean development against it.
 * Rosters gain explicit eras in a later phase, after which this table can go.
 */
export const UNIT_TECH_DEVELOPMENT: Readonly<Record<string, number>> = {
  pottery: 6,
  animal_husbandry: 8,
  archery: 9,
  mining: 9,
  sailing: 12,
  calendar: 12,
  writing: 13,
  trapping: 14,
  the_wheel: 15,
  masonry: 15,
  bronze_working: 16,
  optics: 18,
  horseback_riding: 20,
  mathematics: 21,
  construction: 21,
  philosophy: 24,
  drama_and_poetry: 24,
  currency: 25,
  engineering: 25,
  iron_working: 26,
  theology: 27,
  civil_service: 29,
  guilds: 30,
  metal_casting: 30,
  compass: 33,
  education: 34,
  chivalry: 36,
  machinery: 37,
  physics: 37,
  steel: 38,
  astronomy: 40,
  acoustics: 41,
  banking: 42,
  printing_press: 42,
  gunpowder: 43,
  navigation: 46,
  architecture: 49,
  economics: 51,
  metallurgy: 54,
  chemistry: 56,
  archaeology: 61,
  scientific_theory: 62,
  industrialization: 64,
  rifling: 65,
  military_science: 66,
  fertilizer: 67,
  biology: 71,
  electricity: 72,
  steam_power: 74,
  dynamite: 76,
  refrigeration: 80,
  radio: 80,
  railroad: 81,
  replaceable_parts: 81,
  flight: 81,
  plastics: 83,
  electronics: 83,
  ballistics: 83,
  combustion: 84,
  penicillin: 85,
  atomic_theory: 85,
  radar: 85,
  combined_arms: 86,
  ecology: 87,
  nuclear_fission: 88,
  computers: 88,
  rocketry: 88,
  telecommunications: 90,
  satellites: 91,
  advanced_ballistics: 91,
  mobile_tactics: 91,
  lasers: 92,
  robotics: 92,
  globalization: 94,
  particle_physics: 94,
  the_internet: 94,
  stealth: 95,
  nanotechnology: 95,
  nuclear_fusion: 95,
  future_tech: 98
};
