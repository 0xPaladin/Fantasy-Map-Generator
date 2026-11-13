// The Astral mapping: FMG's world read as a star map. Polities, sectors and star systems.
// The content (the name bases and their groups) lives in src/data/name-bases.ts; this module
// only reads it and applies it. See docs/wiki/Astral-Cartographer.md
import { createRng } from "./astral-system/rng";
import { generateStar, SPECTRAL_TABLE } from "./astral-system/stars";
import { pickWeighted } from "./astral-system/util";

export {
  ASTRAL_SETS,
  applyNaming,
  groupsOf,
  isAstralMap,
  pickFor,
  polityWordFor,
  SECTOR_WORDS,
  sectorWordFor
} from "./polity-naming";

export interface StarClass {
  /** the spectral class, as a letter */
  class: string;
  /** what the class is called in words */
  name: string;
}

/** What each spectral class is called in words */
const CLASS_NAMES: Record<string, string> = {
  O: "blue supergiant",
  B: "blue giant",
  A: "white star",
  F: "white-yellow star",
  G: "yellow dwarf",
  K: "orange dwarf",
  M: "red dwarf"
};

/** From this population up, the roll narrows to the habitable F/G/K band */
const CORE_POPULATION = 10_000;

/**
 * The star's class, rolled from the standard astro spectral distribution.
 *
 * The roll is seeded by the map seed and the burg id, so a system keeps its star across opens,
 * edits and save/load. Below the core population the roll is the standard distribution - a
 * red-dwarf galaxy with the exotic stars rare; at or above it, the roll narrows to the habitable
 * F/G/K pick. Crossing the threshold rerolls the star; an edit within a band changes nothing.
 * The chart styles no O group, so the fringe roll is the table minus O.
 */
/**
 * Whether a burg is a capital: state capital (burg.capital or state.capital)
 * or province capital (province.burg).
 */
export function isCapital(burg: { i: number; capital?: number; state?: number }): boolean {
  if (burg.capital) return true;
  if (typeof pack !== "undefined" && pack) {
    if (burg.state && pack.states?.[burg.state]?.capital === burg.i) return true;
    if (pack.states?.some(s => s?.i && !s.removed && s.capital === burg.i)) return true;
    if (pack.provinces?.some(p => p?.i && !p.removed && p.burg === burg.i && p.i > 0)) return true;
  }
  return false;
}

/**
 * Whether a burg is considered a core world or a capital (state or province).
 * Core worlds have population >= 10,000; capitals are polities' seats of government.
 */
export function isCoreOrCapital(burg: { i: number; population?: number; capital?: number; state?: number }): boolean {
  return peopleOf(burg) >= CORE_POPULATION || isCapital(burg);
}

/**
 * The star's class, rolled from the standard astro spectral distribution.
 *
 * The roll is seeded by the map seed and the burg id, so a system keeps its star across opens,
 * edits and save/load. For core worlds and state/province capitals, the system generation uses
 * forceHabitable: true without forcing a star type, rolling an F, G, or K star from the system seed.
 * Fringe worlds roll from the standard spectral distribution (minus O group).
 */
export function starClassFor(burg: { i: number; population?: number; capital?: number; state?: number }): StarClass {
  if (isCoreOrCapital(burg)) {
    const star = generateStar(createRng(`${options?.map?.seed ?? ""}/astral/system/${burg.i}/star`), {
      forceHabitable: true,
      forcedLumClass: "V"
    });
    const cls = star.primary.spectral;
    return { class: cls, name: CLASS_NAMES[cls] };
  }

  const rng = createRng(`${options?.map?.seed ?? ""}/astral/class/${burg.i}/fringe`);
  const fringe = SPECTRAL_TABLE.filter(star => star.type !== "O");
  const cls = pickWeighted(
    rng,
    fringe.map(star => star.type),
    fringe.map(star => star.weight)
  );
  return { class: cls, name: CLASS_NAMES[cls] };
}

/** How many people live in a system, in people */
export function peopleOf(burg: { population?: number }): number {
  const popUnits = options?.map?.units?.population;
  const scale = popUnits?.scale ?? 1000;
  const rate = popUnits?.urbanization?.rate ?? 0.1;
  return Math.round((burg.population ?? 0) * scale * rate);
}

/** The installations, in FMG's words and in ours */
export const TRAITS: Record<string, string> = {
  port: "shipyard",
  citadel: "bastion",
  plaza: "civic core",
  shanty: "drift",
  temple: "shrine",
  walls: "shielding"
};

/** The installations a system has, in our words */
export function systemTraits(burg: {
  port?: number;
  citadel?: number;
  plaza?: number;
  shanty?: number;
  temple?: number;
  walls?: number;
}): string[] {
  const traits: string[] = [];
  if (burg.port) traits.push(TRAITS.port);
  if (burg.citadel) traits.push(TRAITS.citadel);
  if (burg.plaza) traits.push(TRAITS.plaza);
  if (burg.shanty) traits.push(TRAITS.shanty);
  if (burg.temple) traits.push(TRAITS.temple);
  if (burg.walls) traits.push(TRAITS.walls);
  return traits;
}

export interface StarSystem {
  id: number;
  name: string;
  /** the system's place in the sector */
  x: number;
  y: number;
  /** the star's spectral class */
  class: string;
  /** what the class is called in words */
  className: string;
  /** the system's population, in people */
  population: number;
  /** the installations that make the system what it is */
  traits: string[];
  state: number;
  culture: number;
  capital: boolean;
  port: boolean;
}

/** One system, read from one burg */
export function toSystem(burg: (typeof pack.burgs)[number]): StarSystem {
  const population = peopleOf(burg);
  const { class: starType, name: className } = starClassFor(burg);
  return {
    id: burg.i,
    name: burg.name ?? "",
    x: burg.x,
    y: burg.y,
    class: starType,
    className,
    population,
    traits: systemTraits(burg),
    state: burg.state ?? 0,
    culture: burg.culture ?? 0,
    capital: !!burg.capital,
    port: !!burg.port
  };
}

/** Every system on the map, in burg order */
export function systemsOf(): StarSystem[] {
  return pack.burgs.filter(burg => burg?.i && !burg.removed).map(toSystem);
}

/** The map tooltip line for a system: its class, its traits, and the invitation */
export function systemTip(system: StarSystem): string {
  const traits = system.traits.join(", ");
  const installations = traits && traits.charAt(0).toUpperCase() + traits.slice(1);
  return `${system.class}-class ${system.className}${installations ? `. ${installations}` : ""}. Click to edit`;
}

declare global {
  var Astral: { systems: () => StarSystem[] };
}

window.Astral = { systems: systemsOf };
