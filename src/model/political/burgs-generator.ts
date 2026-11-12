import Alea from "alea";
import { quadtree } from "d3";
import { CULTURE_TYPES, type CultureType, DEFAULT_CULTURE_TYPE } from "@/data/culture-types";
import type { Label } from "@/model/annotations/labels-generator";
import { Routes } from "@/model/economy/routes-generator";
import { Pack } from "@/model/graph/pack-generator";
import type { Point } from "@/model/graph/voronoi";
import { AUTO_BURG_LIMIT } from "@/model/options/options-schema";
import { NON_NAVIGABLE_LAKE_SUBTYPES } from "@/model/physical/features-generator";
import type { River } from "@/model/physical/river-generator";
import { Rivers } from "@/model/physical/river-generator";
import { Emblems } from "@/model/political/emblems-generator";
import type { Province } from "@/model/political/provinces-generator";
import { Development } from "@/model/society/development-generator";
import { Names } from "@/model/society/names-generator";
import { Population } from "@/model/society/population-generator";
import { Journeys } from "@/model/story/journeys/journeys-generator";
import { Transports } from "@/model/story/journeys/transports-generator";
import type { BurgGroup } from "@/types/burg-groups";
import type { BurgProduction } from "@/types/economy";
import type { Emblem } from "@/types/emblems";
import type { IconSet } from "@/types/icons";
import type { Journey } from "@/types/journey";
import { log } from "@/utils/logger";
import { minmax, normalize, rn } from "@/utils/number-utils";
import { each, gauss, P, ra, rand } from "@/utils/probability-utils";
import { safeParseJSON } from "@/utils/string-utils";
import { requireAdjustments, requireName, requireOneOf } from "@/utils/validation-utils";

const BUILDINGS = ["citadel", "plaza", "shanty", "temple", "walls"] as const;

/** the default burg style: white art with a dark outline */
const BURG_PAINT = { fill: "#ffffff", stroke: "#3e3e4b" };

/** name bases of subterranean peoples (Drow, Dwarven/Duergar, Goblin kin) and of aquatic peoples */
const SUBTERRANEAN_NAME_BASES = new Set(["DARKE", "DWARV", "GOBLI"]);
const AQUATIC_NAME_BASES = new Set(["MERFO"]);
const SUBTERRANEAN_MARKER_TYPES = new Set(["caves", "dungeons", "mines"]);

/** a random candidate, weightier ones likelier; undefined when candidates is empty */
function pickWeighted(candidates: number[], weightOf: (cell: number) => number): number | undefined {
  let total = 0;
  for (const cell of candidates) total += weightOf(cell);
  if (total <= 0) return undefined;
  let roll = Math.random() * total;
  for (const cell of candidates) {
    roll -= weightOf(cell);
    if (roll < 0) return cell;
  }
  return candidates[candidates.length - 1];
}

export const isAutoBurgLimit = (): boolean => options.generation.burgs.limit === AUTO_BURG_LIMIT;

export interface Burg {
  cell: number;
  x: number;
  y: number;
  i: number;
  state?: number;
  culture?: number;
  name?: string;
  feature?: number;
  capital?: number;
  lock?: boolean;
  port?: number;
  removed?: boolean;
  population?: number;
  type?: CultureType;
  coa?: Emblem;
  citadel?: number;
  plaza?: number;
  walls?: number;
  shanty?: number;
  temple?: number;
  group?: string;
  link?: string;
  MFCG?: string;
  production?: BurgProduction; // units of each good made in the last production run
  product?: number; // gross product from the last production run
  treasury?: number; // cash balance from the last economy run
  adjustments?: { name: string; value: number }[]; // income a day besides trade; negative for debts or upkeep. The user's, kept on regeneration
  pollTaxPaid?: number; // poll tax paid to its state in the last economy run
  label?: Label;
  note?: string;
  tags?: string[];
  flying?: 1;
  underdark?: 1;
  underwater?: 1;
  skyPort?: 1;
  underdarkGate?: 1;
  /** vertical offset in feet relative to the cell's surface: sky +50..+500, underdark -200..-3000, underwater -50..-2000 */
  altitude?: number;
  titan?: 1;
  horde?: 1;
  /** a mobile burg's in-flight state; see docs/plans/mobile-burgs.md */
  mobile?: 1;
  mobility?: "drift" | "march" | "live";
  journey?: number;
  departedYear?: number;
  heading?: number;
  pausedAt?: number;
}

/** the vertical layer a burg belongs to; see docs/plans/multi-realm.md */
export type BurgRealm = "surface" | "sky" | "underdark" | "underwater" | "titan" | "horde";
export type NonSurfaceRealm = Exclude<BurgRealm, "surface">;

export function getBurgRealm(
  b: Pick<Burg, "flying" | "underdark" | "underwater" | "titan" | "horde"> | undefined
): BurgRealm {
  if (!b) return "surface";
  if (b.flying) return "sky";
  if (b.underdark) return "underdark";
  if (b.underwater) return "underwater";
  if (b.titan) return "titan";
  if (b.horde) return "horde";
  return "surface";
}

export function isSurfaceBurg(
  b: Pick<Burg, "flying" | "underdark" | "underwater" | "titan" | "horde"> | undefined
): boolean {
  return getBurgRealm(b) === "surface";
}

export function isBurgInRealm(
  b: Pick<Burg, "flying" | "underdark" | "underwater" | "titan" | "horde"> | undefined,
  realm: BurgRealm
): boolean {
  return getBurgRealm(b) === realm;
}

/** value to write to `pack.cells.burg[cell]` when placing `burg` onto `cell`: the slot stays
 * reserved for the primary surface burg, so non-surface burgs never claim it */
export function groundSlotOnPlacement(
  currentSlot: number,
  burg: Pick<Burg, "i" | "flying" | "underdark" | "underwater" | "titan" | "horde">
): number {
  return isSurfaceBurg(burg) ? burg.i : currentSlot;
}

/** value to write to `pack.cells.burg[cell]` when removing/moving `removedBurgId` */
export function cellSlotAfterRemoval(currentSlot: number, removedBurgId: number): number {
  return currentSlot === removedBurgId ? 0 : currentSlot;
}

// A burg that could become a port on a given water body.
type PortCandidate = {
  burg: Burg;
  haven: number | null; // adjacent water cell for coastal ports; null for river ports
  portFeatureId: number; // the water/drain feature the port trades on
  landFeature: number; // the landmass the burg sits on
  preferred: boolean; // safe harbour, capital harbour, or river port — promoted unconditionally
};

class BurgModule {
  /** the burg icons (styled subdirectories included) and the port anchors, drawn around the anchor at
   * 10 user units per em, so a `size` of 1 draws the plain circle 1em wide */
  readonly iconSets = [
    { id: "burgs", group: "Settlements", em: 10, paint: BURG_PAINT },
    { id: "ports", group: "Settlements", em: 10, paint: BURG_PAINT }
  ] as const satisfies readonly IconSet[];

  generate() {
    const { cells } = pack;

    let burgs: Burg[] = [0 as unknown as Burg]; // burgs array
    cells.burg = new Uint16Array(cells.i.length);

    const populatedCells = cells.i.filter(i => cells.s[i] > 0 && cells.culture[i]);
    if (!populatedCells.length) {
      log.error("There is no populated cells with culture assigned. Cannot generate states");
      pack.burgs = burgs;
      return burgs;
    }

    let burgsQuadtree = quadtree();

    const generateCapitals = () => {
      const randomize = (score: number) => score * (0.5 + Math.random() * 0.5);
      const score = new Int16Array(cells.s.map(randomize));
      const sorted = populatedCells.sort((a, b) => score[b] - score[a]);

      const capitalsNumber = getCapitalsNumber();
      let spacing = (options.map.graph.width + options.map.graph.height) / 2 / capitalsNumber; // min distance between capitals

      for (let i = 0; burgs.length <= capitalsNumber; i++) {
        const cell = sorted[i];
        const [x, y] = cells.p[cell];

        if (burgsQuadtree.find(x, y, spacing) === undefined) {
          burgs.push({ cell, x, y, i: burgs.length });
          burgsQuadtree.add([x, y]);
        }

        // reset if all cells were checked
        if (i === sorted.length - 1) {
          log.warn("Cannot place capitals with current spacing. Trying again with reduced spacing");
          burgsQuadtree = quadtree();
          i = -1;
          burgs = [0 as unknown as Burg];
          spacing /= 1.2;
        }
      }

      burgs.forEach((burg, burgId) => {
        if (!burgId) return;
        burg.i = burgId;
        burg.state = burgId;
        burg.culture = cells.culture[burg.cell];
        burg.name = Names.getCultureShort(burg.culture);
        burg.feature = cells.f[burg.cell];
        burg.capital = 1;
        burg.tags = [];
        cells.burg[burg.cell] = burgId;
      });
    };

    const generateTowns = () => {
      const randomize = (score: number) => score * gauss(1, 3, 0, 20, 3);
      const score = new Int16Array(cells.s.map(randomize));
      const sorted = populatedCells.sort((a, b) => score[b] - score[a]);

      const burgsNumber = getTownsNumber();
      let spacing = (options.map.graph.width + options.map.graph.height) / 150 / (burgsNumber ** 0.7 / 66); // min distance between town

      for (let added = 0; added < burgsNumber && spacing > 1; ) {
        for (let i = 0; added < burgsNumber && i < sorted.length; i++) {
          if (cells.burg[sorted[i]]) continue;
          const cell = sorted[i];
          const [x, y] = cells.p[cell];

          const minSpacing = spacing * gauss(1, 0.3, 0.2, 2, 2); // randomize to make placement not uniform
          if (burgsQuadtree.find(x, y, minSpacing) !== undefined) continue; // to close to existing burg

          const burgId = burgs.length;
          const culture = cells.culture[cell];
          const name = Names.getCulture(culture);
          const feature = cells.f[cell];
          burgs.push({
            cell,
            x,
            y,
            i: burgId,
            state: 0,
            culture,
            name,
            feature,
            capital: 0,
            tags: []
          });
          added++;
          cells.burg[cell] = burgId;
        }

        spacing *= 0.5;
      }
    };

    generateCapitals();
    generateTowns();

    /** spacing tree for non-surface burgs; unlike surface burgs they may share cells freely */
    const realmTree = quadtree<[number, number]>();

    const realmFlagOf = (
      realm: NonSurfaceRealm
    ):
      | Pick<Burg, "flying">
      | Pick<Burg, "underdark">
      | Pick<Burg, "underwater">
      | Pick<Burg, "titan">
      | Pick<Burg, "horde"> =>
      realm === "sky"
        ? { flying: 1 }
        : realm === "underdark"
          ? { underdark: 1 }
          : realm === "underwater"
            ? { underwater: 1 }
            : realm === "titan"
              ? { titan: 1 }
              : { horde: 1 };

    const addRealmBurg = (
      cell: number,
      realm: "sky" | "underdark" | "underwater",
      capital: boolean,
      altitude: number,
      culture?: number
    ) => {
      const burgId = burgs.length;
      const cultureId = culture ?? cells.culture[cell];
      const [x, y] = cells.p[cell];
      burgs.push({
        cell,
        x,
        y,
        i: burgId,
        state: 0,
        culture: cultureId,
        name: Names.getCulture(cultureId),
        feature: cells.f[cell],
        capital: capital ? 1 : 0,
        tags: [],
        ...realmFlagOf(realm),
        altitude
      });
      realmTree.add([x, y]);
    };

    /** a weighted candidate far enough from the realm burgs already placed */
    const pickWeightedSpaced = (
      candidates: number[],
      weightOf: (cell: number) => number,
      spacing: number
    ): number | undefined => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const cell = pickWeighted(candidates, weightOf);
        if (cell === undefined) return undefined;
        const [x, y] = cells.p[cell];
        if (realmTree.find(x, y, spacing) === undefined) return cell;
      }
      return undefined;
    };

    const placeRealmBurgs = (
      realm: "sky" | "underdark" | "underwater",
      candidates: number[],
      weightOf: (cell: number) => number,
      count: number,
      capitals: number,
      altitudeOf: () => number,
      cultureOf?: (cell: number) => number
    ) => {
      const span = options.map.graph.width + options.map.graph.height;
      for (let placed = 0; placed < capitals; placed++) {
        const cell = pickWeightedSpaced(candidates, weightOf, span / 2 / (capitals * 3));
        if (cell === undefined) break;
        addRealmBurg(cell, realm, true, altitudeOf(), cultureOf?.(cell));
      }
      for (let placed = 0; placed < count - capitals; placed++) {
        const cell = pickWeightedSpaced(candidates, weightOf, span / 20);
        if (cell === undefined) break;
        addRealmBurg(cell, realm, false, altitudeOf(), cultureOf?.(cell));
      }
    };

    const generateSkyBurgs = () => {
      if (!options.map.population.skyBurgs) return;
      const baseCount = Math.max(1, Math.round(cells.i.length / 2500));
      const count = rand(baseCount, baseCount * 2);
      const capitals = Math.min(2, Math.max(1, Math.floor(count / 3)));
      placeRealmBurgs(
        "sky",
        cells.i,
        () => 1,
        count,
        capitals,
        () => rand(5, 50) * 10
      );
    };

    const generateUnderdarkBurgs = () => {
      if (!options.map.population.underdarkBurgs) return;
      const landCells = cells.i.filter(cell => cells.h[cell] >= 20);
      if (!landCells.length) return;
      const baseCount = Math.max(1, Math.round(landCells.length / 2000));
      const count = rand(baseCount, baseCount * 2);
      const capitals = Math.min(2, Math.max(1, Math.floor(count / 3)));

      // mountain roots and subterranean peoples make the best tunneling grounds
      const weightOf = (cell: number) => {
        let weight = 1;
        if (cells.h[cell] >= 70) weight *= 5;
        else if (cells.h[cell] >= 50) weight *= 3;
        if (SUBTERRANEAN_NAME_BASES.has(pack.cultures[cells.culture[cell]]?.base)) weight *= 2;
        // markers are generated after burgs, so the bonus applies when burgs are re-generated on an existing map
        if (pack.markers?.some(marker => marker.cell === cell && SUBTERRANEAN_MARKER_TYPES.has(marker.type)))
          weight *= 2;
        return weight;
      };

      placeRealmBurgs("underdark", landCells, weightOf, count, capitals, () => -rand(20, 300) * 10);
    };

    const generateUnderwaterBurgs = () => {
      if (!options.map.population.underwaterBurgs) return;
      const waterCells = cells.i.filter(cell => cells.h[cell] < 20);
      if (!waterCells.length) return;
      const baseCount = Math.max(1, Math.round(waterCells.length / 2500));
      const count = rand(baseCount, baseCount * 2);
      const capitals = Math.min(2, Math.max(1, Math.floor(count / 3)));

      // continental shelves in warm and temperate waters are the livable benthic grounds
      const weightOf = (cell: number) => {
        let weight = 1;
        if (cells.t[cell] === -1 || cells.t[cell] === -2) weight *= 3;
        const temp = grid.cells.temp[cells.g[cell]];
        if (temp >= 5) weight *= 1.5;
        else if (temp <= 0) weight *= 0.5;
        return weight;
      };

      placeRealmBurgs(
        "underwater",
        waterCells,
        weightOf,
        count,
        capitals,
        () => -rand(5, 200) * 10,
        cell => this.getUnderwaterCulture(cell)
      );
    };

    /** wandering settlements: drifting sky-cities, living islands, walking titans and roving hordes */
    const generateMobileBurgs = () => {
      const wanderers = options.map.population.wanderers;
      if (!wanderers) return;
      const span = options.map.graph.width + options.map.graph.height;
      const landCells = cells.i.filter(cell => cells.h[cell] >= 20);
      const waterCells = cells.i.filter(cell => cells.h[cell] < 20);
      const enabled: NonSurfaceRealm[] = [];
      if (options.map.population.skyBurgs) enabled.push("sky");
      if (options.map.population.underdarkBurgs && landCells.length) enabled.push("underdark");
      if (options.map.population.underwaterBurgs && waterCells.length) enabled.push("underwater");
      if (options.map.population.titanBurgs && landCells.length) enabled.push("titan");
      if (options.map.population.hordeBurgs && landCells.length) enabled.push("horde");
      if (!enabled.length) return;

      const specOf = (realm: NonSurfaceRealm) => {
        switch (realm) {
          case "sky":
            return { candidates: cells.i, weightOf: () => 1, altitudeOf: () => rand(5, 50) * 10 };
          case "underdark":
            return {
              candidates: landCells,
              weightOf: (cell: number) => (cells.h[cell] >= 70 ? 5 : cells.h[cell] >= 50 ? 3 : 1),
              altitudeOf: () => -rand(20, 300) * 10
            };
          case "underwater":
            return {
              candidates: waterCells,
              weightOf: (cell: number) =>
                (cells.t[cell] === -1 || cells.t[cell] === -2 ? 3 : 1) *
                (grid.cells.temp[cells.g[cell]] >= 5 ? 1.5 : grid.cells.temp[cells.g[cell]] <= 0 ? 0.5 : 1),
              altitudeOf: () => -rand(5, 200) * 10
            };
          case "titan":
            // open plains; the highest peaks are no place to stride
            return {
              candidates: landCells,
              weightOf: (cell: number) => (cells.h[cell] < 50 ? 3 : cells.h[cell] >= 70 ? 0.4 : 1),
              altitudeOf: () => 0
            };
          default: {
            // savanna and grassland; mountains are too steep to march a host through
            const weightOf = (cell: number) => {
              const biome = cells.biome[cell];
              let weight = 1;
              if (biome === 3) weight *= 3;
              else if (biome === 4) weight *= 2.5;
              if (cells.h[cell] >= 50) weight *= 0.3;
              return weight;
            };
            return { candidates: landCells, weightOf, altitudeOf: () => 0 };
          }
        }
      };

      const originalRandom = Math.random;
      Math.random = Alea(`${options.map.seed}:mobile`);
      try {
        for (let index = 0; index < wanderers; index++) {
          const realm = enabled[index % enabled.length];
          const { candidates, weightOf, altitudeOf } = specOf(realm);
          const cell = pickWeightedSpaced(candidates, weightOf, span / 20);
          if (cell === undefined) continue;
          const cultureId = cells.culture[cell];
          const [x, y] = cells.p[cell];
          const burgId = burgs.length;
          burgs.push({
            cell,
            x,
            y,
            i: burgId,
            state: 0,
            culture: cultureId,
            name: Names.getCulture(cultureId),
            feature: cells.f[cell],
            capital: 0,
            tags: [],
            ...realmFlagOf(realm),
            mobile: 1,
            mobility: "drift",
            altitude: altitudeOf(),
            heading: rn(Math.random() * 360)
          });
          realmTree.add([x, y]);
        }
      } finally {
        Math.random = originalRandom;
      }
    };

    // realm burgs roll on their own seeded stream: the surface map's rolls stay untouched
    const originalRandom = Math.random;
    Math.random = Alea(`${options.map.seed}:realms`);
    try {
      generateSkyBurgs();
      generateUnderdarkBurgs();
      generateUnderwaterBurgs();
    } finally {
      Math.random = originalRandom;
    }
    generateMobileBurgs();

    pack.burgs = burgs;
    this.assignPorts();

    function getCapitalsNumber() {
      let number = options.generation.states.limit;

      if (populatedCells.length < number * 10) {
        number = Math.floor(populatedCells.length / 10);
        log.warn(`Not enough populated cells. Generating only ${number} capitals/states`);
      }

      return number;
    }

    function getTownsNumber() {
      if (isAutoBurgLimit()) return rn(populatedCells.length / 5 / (grid.points.length / 10000) ** 0.8);
      return Math.min(options.generation.burgs.limit, populatedCells.length);
    }
  }

  getType(cellId: number, port?: number): CultureType {
    const { cells, features } = pack;

    if (port) return "Naval";

    const haven = cells.haven[cellId];
    if (haven !== undefined && features[cells.f[haven]].type === "lake") return "Lake";

    if (cells.h[cellId] > 60) return "Highland";

    if (cells.r[cellId] && cells.fl[cellId] >= 100) return "River";

    const biome = cells.biome[cellId];
    const population = cells.pop[cellId];
    if (!cells.burg[cellId] || population <= 5) {
      if (population < 5 && [1, 2, 3, 4].includes(biome)) return "Nomadic";
      if (biome > 4 && biome < 10) return "Hunting";
    }

    return DEFAULT_CULTURE_TYPE;
  }

  // Assign port feature ids to burgs and position them appropriately
  assignPorts() {
    const { cells, burgs } = pack;
    const riversById = new Map(pack.rivers.map(river => [river.i, river]));
    for (const burg of burgs) {
      if (burg.i && !burg.lock) delete burg.port;
    }

    const candidatesByWater = this.collectPortCandidates(burgs);
    for (const candidates of candidatesByWater.values()) {
      if (!candidates.length) continue;
      for (const candidate of this.selectPorts(candidates)) {
        this.promoteToPort(candidate, riversById);
      }
    }

    // Shift non-port river burgs slightly toward the bank
    for (const burg of burgs) {
      if (!burg.i || burg.lock || burg.port || !isSurfaceBurg(burg) || !cells.r[burg.cell]) continue;
      const [x, y] = this.shiftTowardsRiverBank(burg.cell, riversById);
      burg.x = x;
      burg.y = y;
    }
  }

  // Collect every burg that could host a port, grouped by the water body
  private collectPortCandidates(burgs: Burg[]): Map<number, PortCandidate[]> {
    const { cells } = pack;
    const temp = grid.cells.temp;

    const byWater = new Map<number, PortCandidate[]>();
    const addCandidate = (candidate: PortCandidate) => {
      if (!byWater.has(candidate.portFeatureId)) byWater.set(candidate.portFeatureId, []);
      byWater.get(candidate.portFeatureId)!.push(candidate);
    };

    for (const burg of burgs) {
      if (!burg.i || burg.lock || !isSurfaceBurg(burg)) continue; // realm burgs are never ports
      const haven = cells.haven[burg.cell];
      const landFeature = cells.f[burg.cell];

      if (haven) {
        // sea/lake port candidate
        const harbor = cells.harbor[burg.cell];
        if (!harbor) continue; // not actually adjacent to water
        const featureId = cells.f[haven];
        const feature = pack.features[featureId];
        if (!feature || feature.cells <= 1) continue; // no navigable water body
        if (NON_NAVIGABLE_LAKE_SUBTYPES.has(feature.subtype)) continue;
        if (temp[cells.g[burg.cell]] <= 0) continue; // frozen

        const portFeatureId =
          feature.type === "lake" && feature.outlet
            ? (Rivers.resolveLakeDrainFeature(featureId) ?? featureId)
            : featureId;
        const preferred = (harbor && Boolean(burg.capital)) || harbor === 1; // safe harbour or capital
        addCandidate({ burg, haven, portFeatureId, landFeature, preferred });
      } else {
        // river port candidate
        if (!Rivers.isNavigable(burg.cell)) continue;
        const portFeatureId = Rivers.resolveDrainFeature(burg.cell);
        if (!portFeatureId) continue;
        addCandidate({ burg, haven: null, portFeatureId, landFeature, preferred: true });
      }
    }

    return byWater;
  }

  private selectPorts(candidates: PortCandidate[]): PortCandidate[] {
    const { cells } = pack;
    const rank = (candidate: PortCandidate) =>
      (candidate.burg.capital ? -1000 : 0) + (candidate.haven !== null ? cells.harbor[candidate.burg.cell] : 0);

    const promoted = new Set<PortCandidate>();
    for (const c of candidates) if (c.preferred) promoted.add(c);

    const byLand = new Map<number, PortCandidate[]>();
    for (const c of candidates) {
      if (!byLand.has(c.landFeature)) byLand.set(c.landFeature, []);
      byLand.get(c.landFeature)!.push(c);
    }
    for (const group of byLand.values()) {
      if (group.some(c => promoted.has(c))) continue; // landmass already has a port here
      promoted.add(group.reduce((best, c) => (rank(c) < rank(best) ? c : best)));
    }

    if (promoted.size < 2) {
      const rest = candidates.filter(c => !promoted.has(c)).sort((a, b) => rank(a) - rank(b));
      for (const c of rest) {
        promoted.add(c);
        if (promoted.size >= 2) break;
      }
    }

    if (promoted.size < 2) return []; // a sea route needs two endpoints; a lone port is useless

    return [...promoted];
  }

  private promoteToPort(candidate: PortCandidate, riversById: Map<number, River>): void {
    const { burg, haven, portFeatureId } = candidate;
    burg.port = portFeatureId;
    const [x, y] =
      haven !== null ? this.getCloseToEdgePoint(burg.cell, haven) : this.shiftTowardsRiverBank(burg.cell, riversById);
    burg.x = x;
    burg.y = y;
  }

  private getCloseToEdgePoint(cell1: number, cell2: number): [number, number] {
    const { cells, vertices } = pack;
    const [x0, y0] = cells.p[cell1];
    const commonVertices = cells.v[cell1].filter((vertex: number) =>
      vertices.c[vertex].some((c: number) => c === cell2)
    );
    const [x1, y1] = vertices.p[commonVertices[0]];
    const [x2, y2] = vertices.p[commonVertices[1]];
    const xEdge = (x1 + x2) / 2;
    const yEdge = (y1 + y2) / 2;
    return [rn(x0 + 0.95 * (xEdge - x0), 2), rn(y0 + 0.95 * (yEdge - y0), 2)];
  }

  // Move a river burg off the river centerline onto a bank
  private shiftTowardsRiverBank(cellId: number, riversById: Map<number, River>): Point {
    const { cells } = pack;
    const [x, y] = cells.p[cellId];
    const shift = Math.min(cells.fl[cellId] / 200, 0.6);

    const tangent = this.getRiverTangent(cellId, riversById);
    if (!tangent) {
      // No usable course (single-cell river, or cell missing from river path): nudge on axes
      const xShifted = cellId % 2 ? x + shift : x - shift;
      const yShifted = cells.r[cellId] % 2 ? y + shift : y - shift;
      return this.withinCell(cellId, [rn(xShifted, 2), rn(yShifted, 2)]);
    }

    // Perpendicular to the course
    const [tx, ty] = tangent;
    const length = Math.hypot(tx, ty);
    const side = cellId % 2 ? 1 : -1;
    const xShifted = x + (-ty / length) * shift * side;
    const yShifted = y + (tx / length) * shift * side;
    return this.withinCell(cellId, [rn(xShifted, 2), rn(yShifted, 2)]);
  }

  // a shift past the edge of a tiny cell would put the burg in its neighbor: it stays at the centre then
  private withinCell(cellId: number, point: Point): Point {
    const [x, y] = pack.cells.p[cellId];
    return Pack.findCell(...point) === cellId ? point : [x, y];
  }

  // Local river course direction at a cell
  private getRiverTangent(cellId: number, riversById: Map<number, River>): Point | null {
    const { cells } = pack;
    const river = riversById.get(cells.r[cellId]);
    if (!river) return null;

    const idx = river.cells.indexOf(cellId);
    if (idx === -1) return null;

    const prevCell = river.cells[idx - 1];
    const nextCell = river.cells[idx + 1];
    const from = prevCell !== undefined && prevCell >= 0 ? cells.p[prevCell] : cells.p[cellId];
    const to = nextCell !== undefined && nextCell >= 0 ? cells.p[nextCell] : cells.p[cellId];

    const tx = to[0] - from[0];
    const ty = to[1] - from[1];
    if (tx === 0 && ty === 0) return null;
    return [tx, ty];
  }

  private definePopulation(burg: Burg) {
    // realm burgs live off their realm, not the land's cell score
    if (burg.flying) {
      burg.population = rn(burg.capital ? rand(1, 10) : rand(1, 5), 3);
      return;
    }
    if (burg.underdark) {
      burg.population = rn(burg.capital ? rand(5, 25) : rand(1, 12), 3);
      return;
    }
    if (burg.underwater) {
      burg.population = rn(burg.capital ? rand(4, 20) : rand(1, 10), 3);
      return;
    }

    const cellId = burg.cell;
    let population = pack.cells.s[cellId] / 5;
    if (burg.capital) population *= 1.5;
    const connectivityRate = Routes.getConnectivityRate(cellId);
    if (connectivityRate) population *= connectivityRate;
    population *= gauss(1, 1, 0.25, 4, 5); // randomize
    population += (((burg.i as number) % 100) - (cellId % 100)) / 1000; // unround
    burg.population = rn(Math.max(population, 0.01), 3);
  }

  private defineEmblem(burg: Burg) {
    burg.type = this.getType(burg.cell, burg.port);

    const state = pack.states[burg.state as number];
    const stateCOA = state.coa;

    let kinship = 0.25;
    if (burg.capital) kinship += 0.1;
    else if (burg.port) kinship -= 0.1;
    if (burg.culture !== state.culture) kinship -= 0.25;

    const type = burg.capital && P(0.2) ? "Capital" : burg.type === "Generic" ? "City" : burg.type;
    burg.coa = Emblems.generate(stateCOA, kinship, null, type);
    burg.coa.shield = Emblems.getShield(burg.culture!, burg.state!);
  }

  private defineFeatures(burg: Burg) {
    // realm burgs never take a port and keep their realm's building profile
    if (burg.flying) {
      burg.citadel = Number(burg.capital);
      burg.walls = 0;
      burg.plaza = Number(P(0.5));
      burg.temple = Number(P(0.5));
      burg.shanty = 0;
      return;
    }
    if (burg.underdark) {
      burg.citadel = Number(P(0.8));
      burg.walls = Number(P(0.85));
      burg.plaza = Number(P(0.6));
      burg.temple = Number(P(0.7));
      burg.shanty = 0;
      return;
    }
    if (burg.underwater) {
      burg.citadel = Number(P(0.6));
      burg.walls = Number(P(0.4));
      burg.plaza = Number(P(0.7));
      burg.temple = Number(P(0.6));
      burg.shanty = 0;
      return;
    }

    const pop = burg.population as number;
    burg.citadel = Number(burg.capital || (pop > 50 && P(0.75)) || (pop > 15 && P(0.5)) || P(0.1));
    burg.walls = Number(burg.capital || pop > 30 || (pop > 20 && P(0.75)) || (pop > 10 && P(0.5)) || P(0.1));
    burg.shanty = Number(pop > 60 || (pop > 40 && P(0.75)) || (pop > 20 && burg.walls && P(0.4)));
    const religion = pack.cells.religion[burg.cell] as number;
    const theocracy = pack.states[burg.state as number].form === "Theocracy";
    burg.temple = Number(
      (religion && theocracy && P(0.5)) || pop > 50 || (pop > 35 && P(0.75)) || (pop > 20 && P(0.5))
    );
  }

  /** burg assignment needs a named, ordered group and a default to fall back on: a value persisted
   * by an older build can satisfy neither and still parse */
  parseStoredGroups(stored: string | null): BurgGroup[] {
    const parsed = stored ? safeParseJSON(stored) : null;
    const groups: BurgGroup[] = Array.isArray(parsed)
      ? parsed.filter(group => typeof group?.name === "string" && typeof group?.order === "number")
      : [];
    if (!groups.length) return this.getDefaultGroups();

    this.ensureDefaultGroup(groups);
    return groups;
  }

  /** `defineGroup` assigns every burg to the default group first: without one it assigns none */
  ensureDefaultGroup(groups: BurgGroup[]): void {
    if (groups.length && !groups.some(group => group.isDefault)) groups[0].isDefault = true;
  }

  getDefaultGroups(): BurgGroup[] {
    return [
      // realm groups resolve first: a realm capital carries `capital` too and would
      // otherwise match the surface `capital` group; see docs/plans/multi-realm.md
      {
        name: "skyheart",
        active: true,
        features: { flying: true, capital: true },
        order: 5
      },
      {
        name: "skyhold",
        active: true,
        features: { flying: true, capital: false },
        order: 6,
        zoomThreshold: 1.5
      },
      {
        name: "underdark_capital",
        active: true,
        features: { underdark: true, capital: true },
        order: 7
      },
      {
        name: "underdark_hold",
        active: true,
        features: { underdark: true, capital: false },
        order: 8,
        zoomThreshold: 1.5
      },
      {
        name: "underwater_capital",
        active: true,
        features: { underwater: true, capital: true },
        order: 9
      },
      {
        name: "underwater_settlement",
        active: true,
        features: { underwater: true, capital: false },
        order: 10,
        zoomThreshold: 1.5
      },
      {
        name: "titan_capital",
        active: true,
        features: { titan: true, capital: true },
        order: 11
      },
      {
        name: "titan_hold",
        active: true,
        features: { titan: true, capital: false },
        order: 12,
        zoomThreshold: 1.5
      },
      {
        name: "horde_capital",
        active: true,
        features: { horde: true, capital: true },
        order: 13
      },
      {
        name: "horde_hold",
        active: true,
        features: { horde: true, capital: false },
        order: 14,
        zoomThreshold: 1.5
      },
      {
        name: "capital",
        active: true,
        order: 9,
        features: { capital: true },
        preview: "watabou-city"
      },
      {
        name: "city",
        active: true,
        order: 8,
        percentile: 90,
        min: 5,
        preview: "watabou-city"
      },
      {
        name: "fort",
        active: true,
        features: { citadel: true, walls: false, plaza: false, port: false },
        order: 6,
        max: 1
      },
      {
        name: "monastery",
        active: true,
        features: { temple: true, walls: false, plaza: false, port: false },
        order: 5,
        max: 0.8
      },
      {
        name: "caravanserai",
        active: true,
        features: { port: false, plaza: true },
        order: 4,
        max: 0.8,
        biomes: [1, 2, 3]
      },
      {
        name: "trading_post",
        active: true,
        order: 3,
        features: { plaza: true },
        max: 0.8,
        biomes: [5, 6, 7, 8, 9, 10, 11, 12]
      },
      {
        name: "village",
        active: true,
        order: 2,
        min: 0.1,
        max: 2,
        preview: "watabou-village"
      },
      {
        name: "hamlet",
        active: true,
        order: 1,
        features: { plaza: false },
        max: 0.1,
        preview: "watabou-village"
      },
      {
        name: "town",
        active: true,
        order: 7,
        isDefault: true,
        preview: "watabou-city"
      }
    ];
  }

  /** burg groups can exist without a style entry (the Burg Groups editor, presets that don't
   * list them) - without one the renderer falls back to the default group and edits never persist */
  ensureBurgGroupStyles(): void {
    const { groups } = styles.burgIcons;
    const template = groups.town || Object.values(groups)[0];
    if (!template) return;
    for (const { name } of options.map.burgs.groups) {
      const entry = groups[name] ?? structuredClone(template);
      groups[name] = entry;
      entry.groups.icons ??= structuredClone(template.groups.icons);
      entry.groups.anchors ??= structuredClone(template.groups.anchors);
    }
  }

  defineGroup(burg: Burg, populations: number[]) {
    if (burg.lock && burg.group) {
      // locked burgs: don't change group if it still exists
      const group = options.map.burgs.groups.find(group => group.name === burg.group);
      if (group) return;
    }

    const defaultGroup = options.map.burgs.groups.find(g => g.isDefault);
    if (!defaultGroup) {
      log.error("No default group defined");
      return;
    }
    burg.group = defaultGroup.name;
    if (burg.label?.group) delete burg.label.group;

    for (const group of options.map.burgs.groups) {
      if (!group.active) continue;

      if (group.min) {
        const isFit = (burg.population as number) >= group.min;
        if (!isFit) continue;
      }

      if (group.max) {
        const isFit = (burg.population as number) <= group.max;
        if (!isFit) continue;
      }

      if (group.features) {
        const isFit = Object.entries(group.features as Record<string, boolean>).every(
          ([feature, value]) => Boolean(burg[feature as keyof Burg]) === value
        );
        if (!isFit) continue;
      }

      if (group.biomes) {
        const isFit = group.biomes.includes(pack.cells.biome[burg.cell]);
        if (!isFit) continue;
      }

      if (group.states) {
        const isFit = group.states.includes(burg.state ?? 0);
        if (!isFit) continue;
      }

      if (group.cultures) {
        const isFit = group.cultures.includes(burg.culture ?? 0);
        if (!isFit) continue;
      }

      if (group.religions) {
        const isFit = group.religions.includes(pack.cells.religion[burg.cell]);
        if (!isFit) continue;
      }

      if (group.percentile) {
        const index = populations.indexOf(burg.population as number);
        const isFit = index >= Math.floor((populations.length * group.percentile) / 100);
        if (!isFit) continue;
      }

      burg.group = group.name; // apply fitting group
      return;
    }
  }

  /** the realm burgs' own random stream, seeded per specification run */
  private realmRandom: () => number = Math.random;

  specify() {
    this.realmRandom = Alea(`${options.map.seed}:realm-specify`);
    pack.burgs.forEach(burg => {
      if (!burg.i || burg.removed || burg.lock) return;
      if (!isSurfaceBurg(burg)) {
        const originalRandom = Math.random;
        Math.random = this.realmRandom;
        try {
          this.definePopulation(burg);
          this.defineEmblem(burg);
          this.defineFeatures(burg);
        } finally {
          Math.random = originalRandom;
        }
        return;
      }
      this.definePopulation(burg);
      this.defineEmblem(burg);
      this.defineFeatures(burg);
    });

    const populations = pack.burgs
      .filter(b => b.i && !b.removed)
      .map(b => b.population as number)
      .sort((a: number, b: number) => a - b); // ascending

    pack.burgs.forEach(burg => {
      if (!burg.i || burg.removed) return;
      this.defineGroup(burg, populations);
    });
  }

  /** The realm hubs, assigned at burg generation so the realm routes can find them: surface
   *  capitals and spaced major cities double as ground airfields; every underdark hold marks its
   *  nearest surface burg — favoring mountain roots and capitals — as a gate */
  assignRealmHubs(): void {
    const originalRandom = Math.random;
    Math.random = Alea(`${options.map.seed}:realm-hubs`);
    try {
      this.specifySkyPorts();
      this.specifyUnderdarkGates();
    } finally {
      Math.random = originalRandom;
    }
  }

  private specifySkyPorts() {
    const minDist = Math.hypot(options.map.graph.width, options.map.graph.height) * 0.06;
    const tree = quadtree();
    for (const burg of pack.burgs) {
      if (!burg.i || burg.removed) continue;
      if (!burg.lock) delete burg.skyPort;
      if (burg.lock || !isSurfaceBurg(burg)) continue;
      const isCapital = Boolean(burg.capital);
      // population is assigned later in specify: the cell score is the same measure
      // (a burg of population 5 sits on a cell of score 25)
      if (!isCapital && (pack.cells.s[burg.cell] <= 25 || Math.random() > 0.35)) continue;
      if (!isCapital && tree.find(burg.x, burg.y, minDist) !== undefined) continue;
      burg.skyPort = 1;
      tree.add([burg.x, burg.y]);
    }
  }

  private specifyUnderdarkGates() {
    const { cells, burgs } = pack;
    const maxDist = Math.hypot(options.map.graph.width, options.map.graph.height) * 0.12;
    for (const burg of burgs) {
      if (burg.i && !burg.removed && !burg.lock) delete burg.underdarkGate;
    }

    const candidates = burgs.filter(burg => burg.i && !burg.removed && !burg.lock && isSurfaceBurg(burg));
    for (const hold of burgs) {
      if (!hold.i || hold.removed || !hold.underdark) continue;
      let best: Burg | undefined;
      let bestScore = Infinity;
      for (const gate of candidates) {
        const dist = Math.hypot(gate.x - hold.x, gate.y - hold.y);
        if (dist > maxDist) continue;
        const score = dist - (gate.capital ? maxDist : 0) - (cells.h[gate.cell] >= 50 ? maxDist / 2 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = gate;
        }
      }
      if (best) best.underdarkGate = 1;
    }
  }

  /** an aquatic culture when the set has one, else the coastal culture nearest to a water cell */
  private getUnderwaterCulture(cell: number): number {
    const { cells, cultures } = pack;
    const aquatic = cultures.filter(culture => AQUATIC_NAME_BASES.has(culture.base));
    if (aquatic.length) return ra(aquatic).i;

    const coastal = cultures.filter(culture => culture.type === "Naval");
    const pool = (coastal.length ? coastal : cultures).filter(culture => culture.center !== undefined);
    if (!pool.length) return cells.culture[cell];

    const [x, y] = cells.p[cell];
    let nearest = pool[0];
    let minDist = Infinity;
    for (const culture of pool) {
      const [cx, cy] = cells.p[culture.center as number];
      const dist = (cx - x) ** 2 + (cy - y) ** 2;
      if (dist < minDist) {
        minDist = dist;
        nearest = culture;
      }
    }
    return nearest.i;
  }

  private createWatabouCityLinks(burg: Burg) {
    const cells = pack.cells;
    const { i, name, population: burgPopulation, cell } = burg;
    const burgSeed = burg.MFCG || options.map.seed + String(burg.i).padStart(4, "0");

    const sizeRaw =
      2.13 *
      ((burgPopulation! * options.map.units.population.scale) / options.map.units.population.urbanization.density) **
        0.385;
    const size = minmax(Math.ceil(sizeRaw), 6, 100);
    const population = rn(
      burgPopulation! * options.map.units.population.scale * options.map.units.population.urbanization.rate
    );

    const coast = Number(Boolean(burg.port && cells.haven[cell])); // a river port inland has no coast
    const river = Number(Boolean(cells.r[cell]));
    const sea = (() => {
      if (!coast) return null;

      // calculate see direction: 0 = east, 0.5 = north, 1 = west, 1.5 = south
      const [x1, y1] = cells.p[cell];
      const [x2, y2] = cells.p[cells.haven[cell]];
      const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

      if (deg <= 0) return rn(normalize(Math.abs(deg), 0, 180), 2);
      return rn(2 - normalize(deg, 0, 180), 2);
    })();

    const arableBiomes = cells.r[cell] ? [1, 2, 3, 4, 5, 6, 7, 8] : [5, 6, 7, 8];
    const farms = +arableBiomes.includes(cells.biome[cell]);

    const citadel = Number(burg.citadel ?? 0);
    const urban_castle = Number(citadel && each(2)(i as number));

    const hub = Number(Routes.isCrossroad(cell));
    const walls = Number(burg.walls ?? 0);
    const plaza = Number(burg.plaza ?? 0);
    const temple = Number(burg.temple ?? 0);
    const shantytown = Number(burg.shanty ?? 0);

    const style = "natural";

    const url = new URL("https://watabou.github.io/city-generator/");
    url.search = new URLSearchParams({
      name: name || "",
      population: population.toString(),
      size: size.toString(),
      seed: burgSeed,
      river: river.toString(),
      coast: coast.toString(),
      farms: farms.toString(),
      citadel: citadel.toString(),
      urban_castle: urban_castle.toString(),
      hub: hub.toString(),
      plaza: plaza.toString(),
      greens: plaza ? "1" : "0",
      temple: temple.toString(),
      walls: walls.toString(),
      shantytown: shantytown.toString(),
      style
    }).toString();
    if (sea) url.searchParams.append("sea", sea.toString());

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  private createWatabouVillageLinks(burg: Burg) {
    const { cells, features } = pack;
    const { i, population, cell } = burg;

    const burgSeed = options.map.seed + String(i).padStart(4, "0");
    const pop = rn(population! * options.map.units.population.scale * options.map.units.population.urbanization.rate);
    const tags = [];

    if (cells.r[cell] && cells.haven[cell]) tags.push("estuary");
    else if (cells.haven[cell] && features[cells.f[cell]].cells === 1) tags.push("island,district");
    else if (burg.port && cells.haven[cell]) tags.push("coast");
    else if (cells.conf[cell]) tags.push("confluence");
    else if (cells.r[cell]) tags.push("river");
    else if (pop < 200 && each(4)(cell)) tags.push("pond");

    const connectivityRate = Routes.getConnectivityRate(cell);
    tags.push(connectivityRate > 1 ? "highway" : connectivityRate === 1 ? "dead end" : "isolated");

    const biome = cells.biome[cell];
    const arableBiomes = cells.r[cell] ? [1, 2, 3, 4, 5, 6, 7, 8] : [5, 6, 7, 8];
    if (!arableBiomes.includes(biome)) tags.push("uncultivated");
    else if (each(6)(cell)) tags.push("farmland");

    const temp = grid.cells.temp[cells.g[cell]];
    if (temp <= 0 || temp > 28 || (temp > 25 && each(3)(cell))) tags.push("no orchards");

    if (!burg.plaza) tags.push("no square");
    if (burg.walls) tags.push("palisade");

    if (pop < 100) tags.push("sparse");
    else if (pop > 300) tags.push("dense");

    const width = (() => {
      if (pop > 1500) return 1600;
      if (pop > 1000) return 1400;
      if (pop > 500) return 1000;
      if (pop > 200) return 800;
      if (pop > 100) return 600;
      return 400;
    })();
    const height = rn(width / 2.05);

    const style = (() => {
      if ([1, 2].includes(biome)) return "sand";
      if (temp <= 5 || [9, 10, 11].includes(biome)) return "snow";
      return "default";
    })();

    const url = new URL("https://watabou.github.io/village-generator/");
    url.search = new URLSearchParams({
      pop: pop.toString(),
      name: burg.name || "",
      seed: burgSeed,
      width: width.toString(),
      height: height.toString(),
      style,
      tags: tags.join(",")
    }).toString();

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  private createWatabouDwellingLinks(burg: Burg) {
    const burgSeed = options.map.seed + String(burg.i).padStart(4, "0");
    const pop = rn(
      burg.population! * options.map.units.population.scale * options.map.units.population.urbanization.rate
    );

    const tags = (() => {
      if (pop > 200) return ["large", "tall"];
      if (pop > 100) return ["large"];
      if (pop > 50) return ["tall"];
      if (pop > 20) return ["low"];
      return ["small"];
    })();

    const url = new URL("https://watabou.github.io/dwellings/");
    url.search = new URLSearchParams({
      pop: pop.toString(),
      name: "",
      seed: burgSeed,
      tags: tags.join(",")
    }).toString();

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  getPreview(burg: Burg): { link: string | null; preview: string | null } {
    const previewGeneratorsMap: Record<string, (burg: Burg) => { link: string | null; preview: string | null }> = {
      "watabou-city": (burg: Burg) => this.createWatabouCityLinks(burg),
      "watabou-village": (burg: Burg) => this.createWatabouVillageLinks(burg),
      "watabou-dwelling": (burg: Burg) => this.createWatabouDwellingLinks(burg)
    };
    if (burg.link) return { link: burg.link, preview: burg.link };

    const group = options.map.burgs.groups.find(group => group.name === burg.group);
    if (!group?.preview || !previewGeneratorsMap[group.preview]) return { link: null, preview: null };

    return previewGeneratorsMap[group.preview](burg);
  }

  /** Found a burg; realm defaults to surface */
  add(x: number, y: number, realm: BurgRealm = "surface"): number {
    const { cells } = pack;
    const cellId = Pack.requireCell(x, y);
    if (!["surface", "sky", "underdark", "underwater", "titan", "horde"].includes(realm))
      throw new Error(`Unknown realm: ${realm}. Expected surface, sky, underdark, underwater, titan or horde`);
    if (realm === "underwater" && cells.h[cellId] >= 20) throw new Error("An underwater burg cannot be placed on land");
    if (realm === "surface" && cells.h[cellId] < 20) throw new Error("A burg cannot be placed in the water");
    if (realm === "underdark" && cells.h[cellId] < 20) throw new Error("An underdark burg must tunnel under land");
    if ((realm === "titan" || realm === "horde") && cells.h[cellId] < 20)
      throw new Error(`A ${realm} cannot cross the sea; move it to land first`);
    // a realm burg never takes the surface cell's slot
    if (realm === "surface" && cells.burg[cellId])
      throw new Error(`Cell ${cellId} already has burg ${cells.burg[cellId]}`);

    const burgId = pack.burgs.length;
    const culture = cells.culture[cellId];
    const burg: Burg = {
      cell: cellId,
      x,
      y,
      i: burgId,
      state: realm === "surface" ? cells.state[cellId] : 0,
      culture,
      name: Names.getCulture(culture),
      feature: cells.f[cellId],
      capital: 0,
      port: 0,
      tags: [],
      ...(realm === "sky"
        ? { flying: 1 }
        : realm === "underdark"
          ? { underdark: 1 }
          : realm === "underwater"
            ? { underwater: 1 }
            : realm === "titan"
              ? { titan: 1 }
              : realm === "horde"
                ? { horde: 1 }
                : {})
    };
    this.definePopulation(burg);
    this.defineEmblem(burg);
    this.defineFeatures(burg);

    const populations = pack.burgs
      .filter(b => b.i && !b.removed)
      .map(b => b.population as number)
      .sort((a: number, b: number) => a - b); // ascending
    this.defineGroup(burg, populations);

    pack.burgs.push(burg);
    if (realm === "surface") {
      cells.burg[cellId] = burgId;
      Development.settle(cellId);
    }
    if (realm !== "surface") this.assignToRealmState(burg);
    Pack.markChanged();

    Routes.connect(cellId);
    return burgId;
  }

  regenerate(): void {
    const { cells, burgs, states, provinces } = pack;
    const { pop } = cells;
    Population.rankCells();
    cells.pop = pop; // only burgs are regenerated, rural population stays

    const newBurgs: Burg[] = [0 as unknown as Burg];
    const burgsTree = quadtree<[number, number]>();
    const oldCells = burgs.filter(burg => burg.i && !burg.removed).map(burg => burg.cell);
    const seatOf = new Map(provinces.filter(province => province.i && province.burg).map(p => [p.burg, p]));
    const newIds = new Map<number, number>();
    cells.burg = new Uint16Array(cells.i.length);
    // realm states survive regeneration only while their realm capital is kept (locked)
    const realmStates = states.filter(
      state => state.i && !state.removed && state.capital && !isSurfaceBurg(burgs[state.capital])
    );
    states
      .filter(state => state.i)
      .forEach(state => {
        state.capital = 0;
      });
    provinces
      .filter(province => province.i)
      .forEach(province => {
        province.burg = 0;
      });

    // locked burgs stay, renumbered
    for (const burg of burgs.filter(burg => burg.i && !burg.removed && burg.lock)) {
      const newId = newBurgs.length;
      newIds.set(burg.i!, newId);
      const seat = seatOf.get(burg.i!);
      if (seat) seat.burg = newId;
      burg.i = newId;
      newBurgs.push(burg);
      burgsTree.add([burg.x, burg.y]);
      cells.burg[burg.cell] = groundSlotOnPlacement(cells.burg[burg.cell], burg);

      if (burg.capital && burg.state !== undefined) {
        states[burg.state].capital = newId;
        states[burg.state].center = burg.cell;
      }
    }

    for (const market of pack.markets ?? []) market.centerBurgId = newIds.get(market.centerBurgId) ?? 0;

    const score = new Int16Array(cells.s.map(value => value * Math.random()));
    const sorted = cells.i.filter(i => score[i] > 0 && cells.culture[i]).sort((a, b) => score[b] - score[a]);
    const statesCount = states.filter(state => state.i && !state.removed).length;
    const burgsCount =
      (isAutoBurgLimit()
        ? rn(sorted.length / 5 / (grid.points.length / 10000) ** 0.8)
        : options.generation.burgs.limit) + statesCount;
    const spacing = (options.map.graph.width + options.map.graph.height) / 150 / (burgsCount ** 0.7 / 66);

    for (let index = 0; index < sorted.length && newBurgs.length < burgsCount; index++) {
      const id = newBurgs.length;
      const cell = sorted[index];
      const [x, y] = cells.p[cell];
      const minDistance = spacing * gauss(1, 0.3, 0.2, 2, 2);
      if (cells.burg[cell] || burgsTree.find(x, y, minDistance) !== undefined) continue; // a locked one can stand here

      const stateId = cells.state[cell];
      const capital = Number(Boolean(stateId && !states[stateId].capital));
      if (capital) {
        states[stateId].capital = id;
        states[stateId].center = cell;
      }

      const culture = cells.culture[cell];
      const name = Names.getCulture(culture);
      newBurgs.push({ cell, x, y, state: stateId, i: id, culture, name, capital, feature: cells.f[cell] });
      burgsTree.add([x, y]);
      cells.burg[cell] = id;
      Development.settle(cell);
    }

    pack.burgs = newBurgs;
    this.assignPorts();

    for (const state of realmStates) {
      const capital = state.capital ? newBurgs[state.capital] : undefined;
      if (!capital || capital.removed) state.removed = true;
    }

    states
      .filter(state => state.i && !state.removed && !state.capital)
      .forEach(state => {
        // a kept burg already on the center becomes the capital
        const burgId = cells.burg[state.center] || this.add(...cells.p[state.center]);
        state.capital = burgId;
        state.center = pack.burgs[burgId].cell;
        const burg = pack.burgs[burgId];
        burg.state = state.i;
        burg.capital = 1;
        this.changeGroup(burg, null);
      });

    for (const cell of oldCells) Development.vacate(cell); // land a dropped burg stood on alone
    this.specify();
    this.assignRealmHubs(); // the realm routes need the regenerated hub flags
    for (const province of provinces)
      if (province.i && !province.removed && !province.burg) this.seatProvince(province);
    Routes.regenerate();
  }

  /** A province takes the capital in its lands as its seat, or else its biggest burg, or none */
  seatProvince(province: Province): void {
    const { cells, burgs } = pack;
    let seat: Burg | undefined;
    for (const burg of burgs) {
      if (!burg.i || burg.removed || cells.province[burg.cell] !== province.i) continue;
      const rank = (Number(burg.capital) || 0) - (Number(seat?.capital) || 0);
      if (!seat || rank > 0 || (!rank && burg.population! > seat.population!)) seat = burg;
    }
    province.burg = seat?.i ?? 0;
    province.center = seat?.cell ?? cells.i.find(cell => cells.province[cell] === province.i) ?? province.center;
  }

  /** Ports on water that is gone stop being ports, as when rivers change */
  syncPorts(): void {
    for (const burg of pack.burgs) {
      if (burg.i && !burg.removed && burg.port) burg.port = this.getPortWater(burg.cell);
    }
  }

  changeGroup(burg: Burg, group: string | null = null) {
    if (group) {
      burg.group = group;
    } else {
      const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
      const populations = validBurgs.map(b => b.population as number).sort((a, b) => a - b);
      this.defineGroup(burg, populations);
    }
  }

  /** Rename a burg; its label text follows the name */
  rename(burgId: number, name: string): void {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) throw new Error(`Burg ${burgId} does not exist`);
    burg.name = requireName(name);
    if (burg.label?.text !== undefined) burg.label.text = burg.name;
  }

  /** Set a burg's population as shown in the Burg Editor, in people */
  setPopulation(burgId: number, people: number): void {
    const burg = this.living(burgId);
    const { scale, urbanization } = options.map.units.population;
    if (!Number.isFinite(people) || people < 0) throw new Error("The population must be a non-negative number");
    burg.population = rn(people / scale / urbanization.rate, 4);
    Pack.markChanged();
  }

  /** Move a burg to an existing burg group */
  setGroup(burgId: number, group: string): void {
    const names = options.map.burgs.groups.filter(({ removed }) => !removed).map(({ name }) => name);
    this.changeGroup(this.living(burgId), requireOneOf(group, names, "The group"));
  }

  /** Set a burg's culture type, which is about geography, not rank */
  setType(burgId: number, type: string): void {
    this.living(burgId).type = requireOneOf(type, CULTURE_TYPES, "The type");
  }

  /** Turn one of a burg's buildings on or off: citadel, plaza, shanty, temple or walls */
  setBuilding(burgId: number, building: string, present: boolean): void {
    const burg = this.living(burgId);
    const name = requireOneOf(building, BUILDINGS, "The building");
    if (name === "plaza" && !present && pack.markets?.some(market => market.centerBurgId === burgId))
      throw new Error(`Burg ${burgId} is a market center and keeps its plaza; remove the market first`);
    burg[name] = present ? 1 : 0;
  }

  /** Set the culture of a burg's people */
  setCulture(burgId: number, cultureId: number): void {
    const culture = pack.cultures[cultureId];
    if (!culture || culture.removed) throw new Error(`Culture ${cultureId} does not exist`);
    this.living(burgId).culture = cultureId;
  }

  /** Make a burg a port on the water body it faces or drains to, or stop it being one */
  setPort(burgId: number, port: boolean): void {
    const burg = this.living(burgId);
    if (!port) {
      burg.port = 0;
      return;
    }
    const water = this.getPortWater(burg.cell);
    if (!water) throw new Error(`Burg ${burgId} has no navigable water to be a port on`);
    burg.port = water;
  }

  /** The water body a burg at a cell trades by: the one it faces or drains to, or 0 */
  getPortWater(cell: number): number {
    const { cells, features } = pack;
    const haven = cells.haven[cell];
    const feature = haven ? features[cells.f[haven]] : undefined;
    const water = !haven
      ? Rivers.isNavigable(cell) && Rivers.resolveDrainFeature(cell)
      : feature?.type === "lake" && feature.outlet
        ? (Rivers.resolveLakeDrainFeature(feature.i) ?? feature.i)
        : cells.f[haven];
    return water || 0;
  }

  /** Make a burg the capital of the state it is in; the old capital becomes an ordinary burg */
  setCapital(burgId: number): void {
    const burg = this.living(burgId);
    const state = pack.states[burg.state ?? 0];
    if (!burg.state || !state || state.removed)
      throw new Error(`Burg ${burgId} is in neutral lands, which have no capital`);
    if (burg.capital) return;
    const old = pack.burgs[state.capital];
    state.capital = burgId;
    state.center = burg.cell;
    burg.capital = 1;
    this.changeGroup(burg);
    if (old?.i && old.i !== burgId) {
      old.capital = 0;
      this.changeGroup(old);
    }
  }

  /** Move a burg to a free land cell at a map point; a capital stays inside its state or province. A port trades by the water at its new place, if any */
  move(burgId: number, x: number, y: number): void {
    const burg = this.living(burgId);
    const { cells } = pack;
    const cell = Pack.requireCell(x, y);
    if (burg.underwater && cells.h[cell] >= 20) throw new Error("An underwater burg cannot be placed on land");
    if (!burg.flying && !burg.underwater && cells.h[cell] < 20) throw new Error("A burg cannot be placed in the water");
    // a non-surface burg may share its new cell with the surface burg holding the slot
    if (isSurfaceBurg(burg) && cells.burg[cell] && cells.burg[cell] !== burgId)
      throw new Error(`Cell ${cell} already has burg ${cells.burg[cell]}`);
    const state = isSurfaceBurg(burg) ? cells.state[cell] : (burg.state ?? 0);
    if (burg.capital && state !== burg.state) throw new Error("A capital cannot be moved into another state");
    const province = pack.provinces?.find(p => p.i && !p.removed && p.burg === burgId);
    if (province && cells.province[cell] !== province.i)
      throw new Error(`Burg ${burgId} is the capital of province ${province.i} and cannot leave it`);

    cells.burg[burg.cell] = cellSlotAfterRemoval(cells.burg[burg.cell], burgId);
    cells.burg[cell] = groundSlotOnPlacement(cells.burg[cell], burg);
    Development.vacate(burg.cell);
    if (isSurfaceBurg(burg)) Development.settle(cell);
    Object.assign(burg, { cell, state, x: rn(x, 2), y: rn(y, 2), feature: cells.f[cell] });
    Pack.markChanged();
    if (burg.capital) pack.states[state].center = cell;
    if (province) province.center = cell;
    // a market center takes its market along, any other burg joins the market of its new cell
    const centered = pack.markets?.find(market => market.centerBurgId === burgId);
    if (centered) cells.market[cell] = centered.i;
    if (burg.port) burg.port = this.getPortWater(cell); // a port moved inland stops being one
    if (!Routes.isConnected(cell)) Routes.connect(cell); // off the network it cannot trade
    if (burg.label) Object.assign(burg.label, { dx: 0, dy: 0, pathPoints: undefined }); // a custom path no longer fits
  }

  /** Set adjustments: named amounts a day besides trade in the map's currency, e.g. [{ name: "Rents", value: 12 }], negative for debts or upkeep. They replace its lines and take effect when production is regenerated */
  setAdjustments(burgId: number, adjustments: { name: string; value: number }[]): void {
    this.living(burgId).adjustments = requireAdjustments(adjustments);
  }

  /** Lock a burg so regeneration keeps it, or unlock it */
  setLocked(burgId: number, locked: boolean): void {
    const burg = this.living(burgId);
    if (locked) burg.lock = true;
    else delete burg.lock;
  }

  /** Set the URL of a burg's map preview: a generator link or an image. Empty restores the default preview */
  setLink(burgId: number, url: string): void {
    const burg = this.living(burgId);
    if (!url) {
      delete burg.link;
      return;
    }
    if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim()))
      throw new Error("The link must be an http(s) URL");
    burg.link = url.trim();
  }

  private living(burgId: number): Burg {
    const burg = pack.burgs[burgId];
    if (!burg || burg.removed) throw new Error(`Burg ${burgId} does not exist`);
    return burg;
  }

  /** Remove a burg that is neither a capital nor a market center */
  remove(burgId: number): void {
    const burg = this.living(burgId);
    if (burg.capital) throw new Error(`Burg ${burgId} is a capital; make another burg the capital first`);
    if (pack.markets?.some(market => market.centerBurgId === burgId))
      throw new Error(`Burg ${burgId} is a market center; remove the market first`);

    pack.cells.burg[burg.cell] = cellSlotAfterRemoval(pack.cells.burg[burg.cell], burgId);
    Development.vacate(burg.cell);
    burg.removed = true;
    delete burg.note;
    delete burg.coa;
    for (const province of pack.provinces ?? []) if (province.burg === burgId) province.burg = 0;
    if (pack.deals) pack.deals = pack.deals.filter(([dealBurg]) => dealBurg !== burgId); // its trade is gone too
  }

  /** Assign a non-surface burg to the nearest living realm state of its realm, or to the neutrals if none exists */
  private assignToRealmState(burg: Burg): void {
    const realm = getBurgRealm(burg);
    if (realm === "surface") return;
    let nearest = 0;
    let best = Infinity;
    for (const state of pack.states) {
      if (!state.i || state.removed) continue;
      const capital = pack.burgs[state.capital];
      if (!capital || getBurgRealm(capital) !== realm) continue;
      const dist = Math.hypot(capital.x - burg.x, capital.y - burg.y);
      if (dist < best) {
        best = dist;
        nearest = state.i;
      }
    }
    burg.state = nearest;
  }

  /** Set a burg's realm. A capital cannot change realm */
  setRealm(burgId: number, realm: string): void {
    const burg = this.living(burgId);
    const next = requireOneOf(
      realm,
      ["surface", "sky", "underdark", "underwater", "titan", "horde"],
      "The realm"
    ) as BurgRealm;
    if (burg.capital) throw new Error("A capital cannot change realm; make another burg the capital first");
    const previous = getBurgRealm(burg);
    if (next === previous) return;

    const { cells } = pack;
    if (["surface", "underdark", "titan", "horde"].includes(next) && cells.h[burg.cell] < 20) {
      const article = next === "underdark" ? "An underdark" : `A ${next}`;
      throw new Error(`${article} burg cannot be placed in the water; move it to land first`);
    }
    if (next === "underwater" && cells.h[burg.cell] >= 20) throw new Error("An underwater burg must live in the water");

    if (next === "surface") {
      const occupant = cells.burg[burg.cell];
      const occupantBurg = occupant ? pack.burgs[occupant] : undefined;
      if (occupantBurg && occupant !== burg.i && !occupantBurg.removed)
        throw new Error(`Cell ${burg.cell} already holds a surface burg; move or remove it first`);
      delete burg.flying;
      delete burg.underdark;
      delete burg.underwater;
      delete burg.titan;
      delete burg.horde;
      delete burg.altitude; // the surface has no vertical offset
      burg.state = cells.state[burg.cell];
      cells.burg[burg.cell] = burg.i;
    } else {
      delete burg.port; // realm burgs are never ports
      delete burg.skyPort; // skyports are surface-only hubs
      delete burg.underdarkGate; // gates are surface-only hubs
      if (cells.burg[burg.cell] === burg.i) cells.burg[burg.cell] = 0; // hand the slot back to the surface
      delete burg.flying;
      delete burg.underdark;
      delete burg.underwater;
      delete burg.titan;
      delete burg.horde;
      burg[
        next === "sky"
          ? "flying"
          : next === "underdark"
            ? "underdark"
            : next === "titan"
              ? "titan"
              : next === "horde"
                ? "horde"
                : "underwater"
      ] = 1;
      this.assignToRealmState(burg);
    }
    this.changeGroup(burg, null);
  }

  /** Set a surface burg as a ground airfield for air routes */
  setSkyPort(burgId: number, port: boolean): void {
    const burg = this.living(burgId);
    if (!isSurfaceBurg(burg)) throw new Error("Only a surface burg can be a skyport");
    if (port) burg.skyPort = 1;
    else delete burg.skyPort;
  }

  /** Set how the burg travels; pinned = off, drift = wanders when the map is regenerated, march = rides a journey */
  setMobility(burgId: number, mobility: "pinned" | "drift" | "march"): void {
    const burg = this.living(burgId);
    if (mobility === "pinned") {
      if (!burg.mobile) return;
      delete burg.mobile;
      delete burg.mobility;
      delete burg.journey;
      delete burg.departedYear;
      delete burg.pausedAt;
      return;
    }
    if (mobility === "drift") {
      delete burg.journey;
      delete burg.departedYear;
      delete burg.pausedAt;
      burg.mobile = 1;
      burg.mobility = "drift";
      return;
    }
    // march needs a journey; pick the first one when the burg has none yet
    if (burg.journey === undefined) {
      const first = (pack.journeys ?? []).find(journey => journey.i);
      if (!first) throw new Error("No journeys exist; create one in the Journeys editor first");
      burg.journey = first.i;
    }
    if (burg.departedYear === undefined) burg.departedYear = options.map.lore.calendar.year;
    burg.mobile = 1;
    burg.mobility = "march";
    this.applyMobile(burgId);
  }

  /** Set the burg's single heading in degrees; 0 clears it */
  setHeading(burgId: number, heading?: number): void {
    const burg = this.living(burgId);
    if (heading === undefined) {
      delete burg.heading;
      return;
    }
    if (typeof heading !== "number" || !Number.isFinite(heading))
      throw new Error("The heading must be a number of degrees");
    burg.heading = rn(heading, 1);
  }

  /** Set the year the burg set out; null re-stamps it to the current year */
  setDepartureYear(burgId: number, year: number | null): void {
    const burg = this.living(burgId);
    if (year === null) {
      delete burg.departedYear;
      return;
    }
    if (typeof year !== "number" || !Number.isFinite(year)) throw new Error("The departure year must be a number");
    burg.departedYear = Math.round(year);
    this.applyMobile(burgId);
  }

  /** Jump a riding burg ahead (or back) by a number of years along its journey */
  advanceMobile(burgId: number, years: number): void {
    const burg = this.living(burgId);
    if (typeof years !== "number" || !Number.isFinite(years))
      throw new Error("The years to advance by must be a number");
    burg.departedYear = (burg.departedYear ?? options.map.lore.calendar.year) - years;
    this.applyMobile(burgId);
  }

  /** Set a surface burg as an underdark entrance hub */
  setUnderdarkGate(burgId: number, gate: boolean): void {
    const burg = this.living(burgId);
    if (!isSurfaceBurg(burg)) throw new Error("Only a surface burg can be an underdark gate");
    if (gate) burg.underdarkGate = 1;
    else delete burg.underdarkGate;
  }

  /** Set a burg's vertical offset in feet; 0 clears it */
  setAltitude(burgId: number, altitude: number | null): void {
    const burg = this.living(burgId);
    if (altitude === null || altitude === 0) {
      delete burg.altitude;
      return;
    }
    if (typeof altitude !== "number" || !Number.isFinite(altitude)) throw new Error("The altitude must be a number");
    burg.altitude = rn(altitude, 1);
  }

  // --- Marching mechanics: a wandering burg rides a journey across the map; see docs/plans/mobile-burgs.md ---

  /** Put a burg onto a journey; its place along the road is stamped from the lore year */
  march(burgId: number, journeyId: number): void {
    const burg = this.living(burgId);
    const journey = this.requireJourney(journeyId);
    if (burg.capital) throw new Error("A capital cannot ride a journey");
    if (burg.lock) throw new Error("Unlock the burg first; a locked burg keeps its place");
    delete burg.pausedAt;
    if (burg.departedYear === undefined) burg.departedYear = options.map.lore.calendar.year;
    burg.journey = journey.i;
    burg.mobility = "march";
    burg.mobile = 1;
    this.applyMobile(burgId);
  }

  /** Take a burg off its journey; it stays wherever it stands */
  unmarch(burgId: number): void {
    const burg = this.living(burgId);
    if (!this.isMarching(burg)) throw new Error("The burg is not on a journey");
    delete burg.journey;
    delete burg.departedYear;
    delete burg.pausedAt;
    burg.mobility = "drift";
    this.applyMobile(burgId);
  }

  /** Whether a burg is currently riding a journey */
  isMarching(burg: Burg): boolean {
    return burg.mobility === "march" && burg.journey !== undefined;
  }

  /** Halt the march in place; the burg sits wherever it stood until resumed */
  pauseMobile(burgId: number): void {
    const burg = this.living(burgId);
    if (!this.isMarching(burg)) throw new Error("The burg is not on a journey");
    burg.pausedAt = options.map.lore.calendar.year;
  }

  /** Resume a paused march; the burg picks up the road where it stopped */
  resumeMobile(burgId: number): void {
    const burg = this.living(burgId);
    delete burg.pausedAt;
  }

  /** Hours of the journey yet to travel at the current lore year, and how many years that lasts */
  marchEta(burgId: number): { hoursRemaining: number; yearsRemaining: number; done: boolean } {
    const burg = this.living(burgId);
    if (!this.isMarching(burg)) throw new Error("The burg is not on a journey");
    const journey = this.requireJourney(burg.journey!);
    const totals = Journeys.getTotals(journey);
    const walked = this.distanceWalked(burg);
    const remainingDistance = Math.max(0, totals.totalDistance - walked);
    const averageSpeed = Math.max(totals.avgSpeed, 0.001);
    const hoursRemaining = remainingDistance / averageSpeed;
    return {
      hoursRemaining,
      yearsRemaining: this.avgHoursPerDay(journey) > 0 ? hoursRemaining / this.avgHoursPerDay(journey) : 0,
      done: remainingDistance <= 0
    };
  }

  /** Re-stamp every marching burg's cell and position for the current lore year */
  applyMobileAll(): void {
    for (const burg of pack.burgs) {
      if (burg.i && !burg.removed && this.isMarching(burg)) this.applyMobile(burg.i);
    }
  }

  /** Stamp the marching burg's cell, position and feature for the current lore year */
  applyMobile(burgId: number): void {
    const burg = this.living(burgId);
    if (!this.isMarching(burg)) return;
    const journey = this.requireJourney(burg.journey!);
    const totals = Journeys.getTotals(journey);
    const walked = this.distanceWalked(burg);
    const [x, y] = this.pointAlong(journey, walked);
    const cell = Pack.findCell(x, y) ?? burg.cell;
    Object.assign(burg, { x: rn(x, 2), y: rn(y, 2), cell, feature: pack.cells.f[cell] });
    // a walker that has arrived joins the roads like any fresh burg beside the road
    if (walked >= totals.totalDistance && !Routes.isConnected(cell)) Routes.connect(cell);
  }

  /** Map units the burg has marched since it set out, frozen at a pause if any */
  private distanceWalked(burg: Burg): number {
    const journey = this.requireJourney(burg.journey!);
    const totals = Journeys.getTotals(journey);
    if (burg.departedYear === undefined) return 0;
    const endYear =
      burg.pausedAt !== undefined
        ? Math.min(burg.pausedAt, options.map.lore.calendar.year)
        : options.map.lore.calendar.year;
    const elapsed = Math.max(0, endYear - burg.departedYear);
    return Math.min(elapsed * this.avgHoursPerDay(journey) * totals.avgSpeed, totals.totalDistance);
  }

  /** Where along the journey's polyline a burg is after covering `along` units */
  private pointAlong(journey: Journey, along: number): [number, number] {
    let remaining = Math.max(0, along);
    let last: [number, number] | undefined;
    for (const segment of journey.segments) {
      if (segment.visible === false) continue;
      for (const point of segment.points) {
        if (!last) {
          last = [point[0], point[1]];
          continue;
        }
        const leg = Math.hypot(point[0] - last[0], point[1] - last[1]);
        if (remaining <= leg) {
          const t = leg > 0 ? remaining / leg : 0;
          return [last[0] + (point[0] - last[0]) * t, last[1] + (point[1] - last[1]) * t];
        }
        remaining -= leg;
        last = [point[0], point[1]];
      }
    }
    return last ?? [0, 0];
  }

  /** Journey average daily travel hours over the moving segments; one year = a day of marching */
  private avgHoursPerDay(journey: Journey): number {
    let sum = 0;
    let count = 0;
    for (const segment of journey.segments) {
      if (segment.visible === false) continue;
      if (Transports.getDomain(segment.transport) === "stay") continue;
      sum += Transports.getHoursPerDay(segment.transport);
      count += 1;
    }
    return count ? sum / count : 1;
  }

  private requireJourney(journeyId: number): Journey {
    const journey = (pack.journeys ?? []).find(journey => journey.i === journeyId);
    if (!journey) throw new Error(`Journey ${journeyId} does not exist`);
    return journey;
  }
}

export const Burgs = new BurgModule();

export type BurgIconSetId = (typeof Burgs.iconSets)[number]["id"];
