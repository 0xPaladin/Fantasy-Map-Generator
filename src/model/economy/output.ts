import { sum } from "d3";
import { DEFAULT_CULTURE_TYPE } from "@/data/culture-types";
import type { Zone } from "@/model/political/zones-generator";
import { Development } from "@/model/society/development-generator";
import type { Good } from "@/types/economy";
import { rn } from "@/utils/number-utils";
import { Goods } from "./goods-generator";

const RURAL_OUTPUT_FACTOR = 0.9;
export const DEPOSIT_RICHNESS = 2.2; // units a day per population point of its cell, on a map of DEPOSIT_MAP_CELLS
const DEPOSIT_MAP_CELLS = 5000; // deposit counts are per map, so their yield grows with the map's cells
const DEPOSIT_MAX_POPULATION = 10; // a deposit's yield stops growing past this population
const PRODUCTIVITY_START = 30; // development past this makes more of every good
const PILLAGED_OUTPUT = 0.25; // pillaged land loses most of its commercial output

// Living World Builder improvements boost the goods their land grows (docs/plans/upstream-economy-alignment.md §3.1)
const IMPROVEMENT_GOODS: Record<string, readonly string[]> = {
  farm: ["Grain", "Wine", "Olives", "Dates", "Hemp", "Sugar", "Tea", "Tobacco"],
  pasture: ["Cattle", "Wool", "Horses", "Camels", "Cheese", "Leather"],
  mine: ["Iron", "Copper", "Tin", "Silver", "Gold", "Coal", "Salt", "Saltpeter", "Gemstones"],
  quarry: ["Stone", "Marble", "Clay", "White sand"],
  plantation: ["Silk", "Spices", "Dyes", "Incense", "Sugar", "Tea", "Tobacco", "Wine", "Olives"],
  camp: ["Game", "Furs", "Ivory", "Honey", "Amber"],
  lumber_mill: ["Wood", "Mahogany", "Tar"],
  fishing_boats: ["Fish", "Pearls", "Blubber"]
};
const IMPROVEMENT_BOOST: Record<string, number> = {
  farm: 0.35,
  pasture: 0.35,
  mine: 0.4,
  quarry: 0.4,
  plantation: 0.4,
  camp: 0.4,
  lumber_mill: 0.4,
  fishing_boats: 0.4
};
const IMPROVEMENT_TECH_BOOST: Record<string, readonly string[]> = {
  farm: ["civil_service", "fertilizer"],
  pasture: ["fertilizer"],
  mine: ["chemistry", "dynamite"]
};
const IMPROVEMENT_TECH_EXTRA: Record<string, number> = { farm: 0.15, pasture: 0.15, mine: 0.2 };
export const TRADING_POST_EARNINGS = 1.2; // a trading post lifts rural earnings in its cell by a fifth

/** What the land yields at the map's people and good rules: rural output, deposits and their multipliers */
class OutputModule {
  private zoneCellSets: Map<number, Set<number>> | null = null; // lazy zoneId -> cells lookup, built only when a good uses zone multipliers
  private zoneCellSetsSource: Zone[] | null = null;

  forgetZones(): void {
    this.zoneCellSets = null;
  }

  /** Each cell's rural output a day, units by good id */
  getRural(): Record<number, number>[] {
    const biomes = Goods.getBiomesProduction();
    return Array.from(pack.cells.i, cellId => this.getCell(cellId, biomes));
  }

  /** The land cell whose people work a cell's output: its own, or a shore cell of the same market */
  getWorkingCell(cellId: number): number {
    const { c, h, market } = pack.cells;
    if (h[cellId] >= 20) return cellId;
    const shore = c[cellId].filter(neighbor => h[neighbor] >= 20);
    return shore.find(neighbor => market[neighbor] === market[cellId]) ?? shore[0] ?? cellId;
  }

  ofCell(cellId: number): Record<number, number> {
    return this.getCell(cellId, Goods.getBiomesProduction());
  }

  private getCell(cellId: number, biomes: ReturnType<typeof Goods.getBiomesProduction>): Record<number, number> {
    const produced: Record<number, number> = {};

    const modifier = (good: Good) => this.getModifiers(good, cellId);
    const add = (goodId: number, amount: number) => {
      produced[goodId] = rn((produced[goodId] || 0) + amount * RURAL_OUTPUT_FACTOR, 2);
    };

    const pop = this.getCellPopulation(cellId);
    if (pop > 0) {
      for (const { goodId, production } of biomes[pack.cells.biome[cellId]] || []) {
        const good = Goods.get(goodId);
        if (good) add(goodId, pop * production * modifier(good));
      }

      const deposit = Goods.get(pack.cells.good[cellId]);
      if (deposit) produced[deposit.i] = rn((produced[deposit.i] || 0) + this.getDeposit(deposit, cellId), 2);
    }

    return produced;
  }

  /** Units a day, capped by people; more on bigger maps, as their deposits are as few */
  getDeposit(good: Good, cellId: number): number {
    const pop = Math.min(this.getCellPopulation(cellId), DEPOSIT_MAX_POPULATION);
    const mapScale = pack.cells.i.length / DEPOSIT_MAP_CELLS;
    return pop * DEPOSIT_RICHNESS * mapScale * this.getModifiers(good, cellId);
  }

  /** A land cell's people, or a water cell's from the land around it */
  private getCellPopulation(cellId: number): number {
    const { cells } = pack;
    if (cells.h[cellId] >= 20) return cells.pop[cellId];
    return sum(cells.c[cellId].map(c => cells.pop[c])) || 0;
  }

  /** Multipliers and development on the good at the cell; 0 beyond its technology */
  getModifiers(good: Good, cellId: number): number {
    return this.getBaseModifiers(good, cellId) * this.getSimMultiplier(good, cellId);
  }

  /** Living World Builder improvements and pillage on the cell; 1 without a simulation */
  getSimMultiplier(good: Good, cellId: number): number {
    const sim = pack.history?.living;
    if (!sim?.enabled) return 1;
    const cell = sim.cells?.[cellId];
    if (cell?.pillaged) return PILLAGED_OUTPUT;

    const improvement = cell?.improvement;
    if (!improvement) return 1;
    const names = IMPROVEMENT_GOODS[improvement];
    let boost = names?.includes(good.name) ? (IMPROVEMENT_BOOST[improvement] ?? 0) : 0;
    if (boost > 0) {
      const techs = sim.states?.[pack.cells.state[cellId]]?.researchedTechs ?? [];
      if ((IMPROVEMENT_TECH_BOOST[improvement] ?? []).some(tech => techs.includes(tech))) {
        boost += IMPROVEMENT_TECH_EXTRA[improvement] ?? 0;
      }
    }
    return 1 + boost;
  }

  /** Rural earnings multiplier on a cell: a trading post sells the produce better */
  getSimEarningsMultiplier(cellId: number): number {
    const cell = pack.history?.living?.cells?.[cellId];
    return cell?.improvement === "trading_post" && !cell.pillaged ? TRADING_POST_EARNINGS : 1;
  }

  /** Multipliers and development on the good at the cell; 0 beyond its technology */
  private getBaseModifiers(good: Good, cellId: number): number {
    const development = Development.ofCell(cellId);
    if (good.development && development < good.development) return 0; // beyond the cell's technology
    const productivity = Math.max(1, development / PRODUCTIVITY_START);
    const mult = good.multipliers;
    if (!mult) return productivity;

    const biomeId = pack.cells.biome[cellId];
    const cultureId = pack.cells.culture[cellId];
    const stateId = pack.cells.state[cellId];
    const religionId = pack.cells.religion[cellId];

    const burgId = pack.cells.burg[cellId];
    const cultureType = (burgId ? pack.burgs[burgId]?.type : pack.cultures[cultureId]?.type) ?? DEFAULT_CULTURE_TYPE;

    let modifier =
      (mult.cultureType?.[cultureType] ?? 1) *
      (mult.culture?.[cultureId] ?? 1) *
      (mult.state?.[stateId] ?? 1) *
      (mult.religion?.[religionId] ?? 1) *
      (mult.biome?.[biomeId] ?? 1);

    if (mult.zone) {
      const zoneCellSets = this.getZoneCellSets();
      for (const zoneIdStr in mult.zone) {
        const value = mult.zone[+zoneIdStr];
        if (value === undefined || value === 1) continue;
        if (zoneCellSets.get(+zoneIdStr)?.has(cellId)) modifier *= value;
      }
    }

    return modifier * productivity;
  }

  private getZoneCellSets(): Map<number, Set<number>> {
    const zones = pack.zones || [];
    if (this.zoneCellSets && this.zoneCellSetsSource === zones) return this.zoneCellSets;

    const sets = new Map<number, Set<number>>();
    for (const zone of zones) sets.set(zone.i, new Set(zone.cells));
    this.zoneCellSets = sets;
    this.zoneCellSetsSource = zones;
    return sets;
  }
}

export const Output = new OutputModule();
