import { least, quadtree, sum } from "d3";
import { POST_SCARCITY_DEVELOPMENT } from "@/data/development";
import type { ResolvedRoster, UnitType } from "@/data/roster-content";
import { currentContent } from "@/data/roster-store";
import { Accounts } from "@/model/economy/accounts";
import { Goods } from "@/model/economy/goods-generator";
import { Pack } from "@/model/graph/pack-generator";
import { Icons } from "@/model/icons";
import { stateEconomyModifiers } from "@/model/physical/living-rulers";
import { classifyAstralRegime } from "@/model/society/development-generator";
import type { ArmyBlock } from "@/types/battle";
import type { MilitaryUnit } from "@/types/military";
import { nth } from "@/utils/language-utils";
import { minmax, rn, si } from "@/utils/number-utils";
import { gauss, ra, rand } from "@/utils/probability-utils";
import { findAllInQuadtree } from "@/utils/quadtree";
import { requireName } from "@/utils/validation-utils";
import { ASTRAL_FLEET_UNIT_NAMES, isAstralMilitaryUnits } from "./military-units";
import { levies, type State } from "./states-generator";

export const UPKEEP_COST = 20; // military spending a day that keeps troops of power 1, a population point's worth
const MIN_UPKEEP = 0.05; // unpaid troops still fight, if barely
const EQUIPMENT = 0.365; // population points of troops equipped by a unit a day a state consumes of their goods
const REACH = 150; // how far a platoon joins a regiment of another landmass, map units
const REGIMENT_SIZE = 3; // regiment box height at the default style, map units; layout ignores the style
// what the unit's forces are raised by: a change of any calls for raising them anew
const RAISING = ["rural", "urban", "type", "separate", "biomes", "states", "cultures", "religions", "goods"] as const;

export interface Regiment {
  i: number;
  t?: number; // legacy total troops
  name: string;
  a: number; // total troops
  s?: number; // separate flag (for fleets)
  cell: number;
  x: number;
  y: number;
  bx: number; // base x (for movement)
  by: number; // base y (for movement)
  province?: number; // province id of birth
  u: Record<string, number>; // units composition (unitId -> count)
  unitOrigins?: Record<string, string>; // roster unit id -> the config unit that raised it
  composition?: Record<string, Record<string, number>>; // config unit -> roster unit id -> troops
  units?: ArmyBlock[]; // concrete roster unit blocks { type, hp, exp }
  rosterId?: string; // state's assigned roster identifier
  crew?: number[]; // attached figure ids (pack.history.figures): commanders of specialist units (unified-figures)
  n: number; // 0 = land regiment, 1 = naval fleet
  type?: string; // unit type
  icon: string;
  children?: Regiment[]; // merged regiments
  state: number;
  angle?: number;
  casualties?: Record<string, number>; // battle-screen: per-unit casualties while a battle is in progress
  survivors?: Record<string, number>; // battle-screen: per-unit survivors while a battle is in progress
  px?: number; // battle-screen: position before being moved into a battle, restored afterward
  py?: number;
  note?: string;
  hidden?: boolean;
  tags?: string[];
}

export type MilitaryCategory = "melee" | "ranged" | "cavalry" | "artillery" | "monster" | "spellcaster" | "naval";

export function getCategoryForUnit(unitId: string, unitTypes?: Record<string, UnitType>): MilitaryCategory {
  if (unitId === "fleet" || unitId === "naval") return "naval";
  if (unitTypes?.[unitId]) {
    const cat = unitTypes[unitId].category;
    if (cat === "cavalry") return "cavalry";
    if (cat === "artillery") return "artillery";
    if (cat === "ranged") return "ranged";
    if (cat === "monster") return "monster";
    if (cat === "spellcaster") return "spellcaster";
    return "melee";
  }
  if (/(mage|wizard|sorcerer|shaman|necromancer|priest|damsel|seer|caster|warlock|runesmith)/i.test(unitId))
    return "spellcaster";
  if (
    /(dragon|giant|troll|ogre|hydra|griffon|gryphon|hippogryph|pegasus|sphinx|mammoth|demon|daemon|abomination|treeman|varghulf|terrorgheist|monster|behemoth|stegadon|carnosaur)/i.test(
      unitId
    )
  )
    return "monster";
  if (/(horse|cavalry|rider|warg)/i.test(unitId)) return "cavalry";
  if (/(bow|archer|crossbow|missile|sling|dart)/i.test(unitId)) return "ranged";
  if (/(bombard|artillery|siege|catapult|trebuchet|ballista|bolt)/i.test(unitId)) return "artillery";
  if (/(ship|fleet|boat|vessel|galley|navy)/i.test(unitId)) return "naval";
  return "melee";
}

/**
 * Mirror the block composition into `reg.u` / `reg.a`. Both stay **headcount**
 * mirrors (`╬ú round(hp ├ù quantity)`), because the map badge, saves and the
 * editor all display men (living-openciv-armies.md ┬º5.4). Strength itself
 * lives on `ArmyBlock.hp`. The `fleet` pseudo-slot is skipped ΓÇö its ship count
 * survives in `reg.u` and is re-attached below.
 */
export function syncRegimentTotals(regiment: Regiment, unitTypes?: Record<string, UnitType>): void {
  if (regiment.units) {
    const fleetShips = regiment.n ? regiment.u?.fleet : undefined;
    const u: Record<string, number> = {};
    let total = 0;
    for (const slot of regiment.units) {
      if (slot.type === "fleet") continue;
      // Legacy saves carry count-based blocks; convert once, in place (┬º13.1).
      if (!Number.isFinite(slot.hp) || slot.hp <= 0) {
        const legacy = (slot as unknown as { count?: number }).count;
        slot.hp =
          legacy !== undefined && Number.isFinite(legacy)
            ? Math.min(1, legacy / (unitTypes?.[slot.type]?.quantity ?? 100))
            : slot.hp === 0
              ? 0
              : 1;
      }
      if (slot.hp <= 0) continue;
      const men = Math.round(slot.hp * (unitTypes?.[slot.type]?.quantity ?? 100));
      u[slot.type] = (u[slot.type] || 0) + men;
      total += men;
    }
    if (fleetShips) {
      u.fleet = fleetShips;
      total += fleetShips;
    }
    regiment.u = u;
    regiment.a = total;
  } else if (regiment.u) {
    regiment.a = sum(Object.values(regiment.u));
  }
}

/**
 * Rebuild `reg.units` from the `reg.u` men mirror ΓÇö the legacy-save path and
 * the editor's troop editor (living-openciv-armies.md ┬º13.1). New blocks are
 * whole (`hp = count / quantity`); the `"fleet"` pseudo-type is kept out of the
 * combat blocks and re-appended as the naval marker.
 */
export function reconcileRegimentBlocks(regiment: Regiment, unitTypes: Record<string, UnitType>, maxUnits = 20): void {
  const existingSlots = regiment.units ?? [];
  const expByType = new Map<string, number[]>();
  for (const s of existingSlots) {
    const list = expByType.get(s.type) ?? [];
    list.push(s.exp ?? 0);
    expByType.set(s.type, list);
  }

  const slots: ArmyBlock[] = [];
  for (const [typeId, totalMen] of Object.entries(regiment.u)) {
    if (typeId === "fleet" || totalMen <= 0) continue;
    const ut = unitTypes[typeId];
    const blockSize = ut && ut.quantity > 0 ? ut.quantity : 100;
    let remaining = totalMen;
    const expList = expByType.get(typeId) ?? [];
    let expIdx = 0;
    while (remaining > 0 && slots.length < maxUnits) {
      const count = Math.min(blockSize, remaining);
      const exp = expList[expIdx++] ?? 0;
      slots.push({ type: typeId, hp: count / blockSize, exp });
      remaining -= count;
    }
  }

  if (regiment.n && regiment.u.fleet) {
    slots.push({ type: "fleet", hp: 1, exp: 0 });
  }

  regiment.units = slots;
  syncRegimentTotals(regiment, unitTypes);
}

type RosterUnitCategory =
  | "melee"
  | "ranged"
  | "mounted"
  | "machinery"
  | "armored"
  | "naval"
  | "spellcaster"
  | "monster";

function astralTechPowerMultiplier(dev: number): number {
  if (dev >= POST_SCARCITY_DEVELOPMENT) return 2.0;
  if (dev >= 78) return 1.5;
  if (dev >= 54) return 1.25;
  if (dev >= 34) return 1.0;
  if (dev >= 24) return 0.85;
  return 0.6;
}

function isAstralUnitAllowed(unit: MilitaryUnit, dev: number, isBurg: boolean, isCapitalOrPort: boolean): boolean {
  if (ASTRAL_FLEET_UNIT_NAMES.has(unit.name) || unit.type === "naval") {
    if (dev < 34) return false;
    if (unit.name === "strike_wings") return true;
    if (dev < 54) return false;
    if (unit.name === "capital_ships") return dev >= 78 || (isBurg && isCapitalOrPort);
    return true;
  }
  return true;
}

function selectRosterUnitForCategory(
  category: RosterUnitCategory,
  roster: ResolvedRoster | undefined,
  isUrban: boolean,
  isCapital: boolean,
  walls = 0,
  hasTemple = false,
  options?: { isThrall?: boolean; astralHighTech?: boolean }
): string {
  if (category === "naval") return "fleet";
  if (!roster) {
    if (category === "melee") return "infantry";
    if (category === "ranged") return "archers";
    if (category === "mounted") return "cavalry";
    if (category === "machinery") return "artillery";
    if (category === "armored") return "infantry";
    if (category === "spellcaster") return "archers";
    if (category === "monster") return "infantry";
    return "infantry";
  }

  if (options?.isThrall) {
    if (category === "melee" && roster.garrison?.melee) return roster.garrison.melee;
    if (category === "ranged" && roster.garrison?.ranged) return roster.garrison.ranged;
  }

  const map = roster.regimentMap;
  const coreMelee = map?.infantry ?? roster.garrison?.melee ?? "infantry";
  const coreRanged = map?.archers ?? roster.garrison?.ranged ?? "archers";
  const coreCavalry = map?.cavalry ?? "cavalry";
  const coreArtillery = map?.artillery ?? "artillery";

  if (category === "spellcaster") {
    const caster = Object.values(roster.units).find(u => u.category === "spellcaster");
    if (caster) return caster.id;
    return coreRanged;
  }
  if (category === "monster" || category === "armored") {
    const monster = Object.values(roster.units).find(u => u.category === "monster");
    if (monster) return monster.id;
    return category === "armored" ? coreArtillery : coreMelee;
  }

  if (!isUrban) {
    if (category === "melee") return coreMelee;
    if (category === "ranged") return coreRanged;
    if (category === "mounted") return coreCavalry;
    if (category === "machinery") return coreArtillery;
  }

  // In burgs: allow elite / secondary / spellcaster / monster units
  const specialistChance = options?.astralHighTech ? 0.45 : 0.25;
  if (category === "melee") {
    if (roster.id === "commonBase" && isCapital && walls >= 2 && roster.units.balbenGuard) return "balbenGuard";
    if (roster.id === "dwarfBase" && walls >= 2 && roster.units.dwarf_slayer && Math.random() < 0.4)
      return "dwarf_slayer";
    if (roster.id === "orcBase" && (isCapital || walls >= 2) && roster.units.troll && Math.random() < 0.35)
      return "troll";
    if (roster.id === "commonBase" && roster.units.sword && Math.random() < 0.5) return "sword";

    // Capitals and temple burgs can spawn spellcasters or monsters if available in roster
    if (isCapital || hasTemple) {
      const caster = Object.values(roster.units).find(u => u.category === "spellcaster");
      if (caster && Math.random() < specialistChance) return caster.id;
    }
    if (isCapital || walls >= 2) {
      const monster = Object.values(roster.units).find(u => u.category === "monster");
      if (monster && Math.random() < specialistChance) return monster.id;
    }
    return coreMelee;
  }

  if (category === "ranged") {
    if (isCapital || hasTemple) {
      const caster = Object.values(roster.units).find(u => u.category === "spellcaster");
      if (caster && Math.random() < (options?.astralHighTech ? 0.35 : 0.2)) return caster.id;
    }
    return coreRanged;
  }
  if (category === "mounted") return coreCavalry;
  if (category === "machinery") return coreArtillery;

  return coreMelee;
}

interface Platoon {
  cell: number;
  a: number; // platoon army
  t: number; // total troops in platoon
  x: number;
  y: number;
  u: string; // unit type
  n: number; // naval unit flag
  s: number; // separate flag (for fleets)
  type: string; // unit type
  unitName: string; // the config unit's name, which its goods and equipment share are keyed by
  children?: Platoon[]; // merged platoons
}

class MilitaryModule {
  /** Raise every state's forces for a new map: the alerts follow the political situation */
  generate(): void {
    const states = this.livingStates();
    this.defineAlerts(states);
    this.raise(states);
  }

  /** Raise forces anew at the alerts set: of the states named, or of every state */
  regenerate(stateIds?: number[]): void {
    const states = this.livingStates(stateIds);
    if (states.some(state => state.alert === undefined)) this.defineAlerts(states, true);
    this.raise(states);
  }

  /** Raise the named units anew, and the levies their equipment leaves, in the states named or in all. Regiments keep all else: a platoon joins the nearest regiment of its province and landmass, those with none form new ones */
  raiseUnits(names: string[], stateIds?: number[]): void {
    const { cells } = pack;
    const roster = options.map.military.units;
    const raised = new Set(names);
    const levy = roster.find(unit => unit.type === "levies");
    if (levy && pack.deals?.length) raised.add(levy.name);
    const separate = new Set(roster.filter(unit => unit.separate).map(unit => unit.name));
    const featureOf = (cell: number, naval: number) => cells.f[naval && cells.h[cell] >= 20 ? cells.haven[cell] : cell];

    const states = this.livingStates(stateIds);
    const drafts = this.draft(states);
    const raisedKeys = new Set<string>();
    const keyOrigins = new Map<string, Set<string>>();
    for (const platoon of [...drafts.values()].flat()) {
      const origins = keyOrigins.get(platoon.u) ?? new Set<string>();
      origins.add(platoon.unitName);
      keyOrigins.set(platoon.u, origins);
    }
    for (const [key, origins] of keyOrigins) if ([...origins].every(origin => raised.has(origin))) raisedKeys.add(key);

    for (const state of states) {
      this.recompose(state, military => {
        const held = new Map(
          military.map(regiment => [
            regiment,
            new Set(
              regiment.composition
                ? Object.keys(regiment.composition)
                : Object.keys(regiment.u).map(key => regiment.unitOrigins?.[key] ?? key)
            )
          ])
        );
        for (const regiment of military) {
          if (regiment.composition) {
            for (const name of raised) {
              const group = regiment.composition[name];
              if (!group) continue;
              for (const [key, count] of Object.entries(group)) {
                const remaining = (regiment.u[key] ?? 0) - count;
                if (remaining > 0) regiment.u[key] = remaining;
                else delete regiment.u[key];
              }
              delete regiment.composition[name];
            }
            if (!Object.keys(regiment.composition).length) delete regiment.composition;
          } else
            for (const key of Object.keys(regiment.u)) {
              const origin = regiment.unitOrigins?.[key] ?? key;
              if (raised.has(origin) || raisedKeys.has(key)) delete regiment.u[key];
            }
        }
        const troops = (regiment: Regiment) => sum(Object.values(regiment.u));
        const platoons = drafts.get(state.i)!.filter(platoon => raised.has(platoon.unitName));
        const stray: Platoon[] = [];
        // separate units first, to their own regiments
        for (const platoon of platoons.sort((a, b) => b.s - a.s)) {
          const feature = featureOf(platoon.cell, platoon.n);
          const distance = (regiment: Regiment) => (regiment.bx - platoon.x) ** 2 + (regiment.by - platoon.y) ** 2;
          const province = this.provinceOf(state, platoon.cell);
          // in its province, on its landmass, or across the water as near as platoons merge
          const fits = (regiment: Regiment) =>
            regiment.n === platoon.n &&
            ((regiment.province ?? 0) === province ||
              featureOf(regiment.cell, regiment.n) === feature ||
              distance(regiment) < REACH ** 2) &&
            (regiment.composition
              ? Object.keys(regiment.composition)
              : Object.keys(regiment.u).map(key => regiment.unitOrigins?.[key] ?? key)
            ).every(origin => origin === platoon.unitName || (!platoon.s && !separate.has(origin)));
          const fitting = military.filter(fits);
          const local = fitting.filter(regiment => (regiment.province ?? 0) === province);
          const veterans = fitting.filter(regiment => held.get(regiment)!.has(platoon.unitName)); // had the unit before
          const localVeterans = veterans.filter(regiment => (regiment.province ?? 0) === province);
          const pool = localVeterans.length
            ? localVeterans
            : veterans.length
              ? veterans
              : local.length
                ? local
                : fitting;
          // regiments based at one point share its platoons
          const home = least(pool, (a, b) => troops(a) - troops(b) || distance(a) - distance(b));
          if (home) {
            home.u[platoon.u] = rn((home.u[platoon.u] || 0) + platoon.a, 3);
            if (home.composition) {
              home.composition[platoon.unitName] ??= {};
              const group = home.composition[platoon.unitName];
              group[platoon.u] = (group[platoon.u] ?? 0) + platoon.a;
            } else if (platoon.u !== platoon.unitName) {
              home.unitOrigins ??= {};
              home.unitOrigins[platoon.u] = platoon.unitName;
            }
          } else stray.push(platoon);
        }
        military.push(...this.form(stray, state, military));
      });
    }
  }

  /** Replace the roster; `origins` names the unit each new one was, null for an added one. Regiments follow the renames and lose the removed units' troops. Returns the units whose forces are raised differently now */
  setRoster(units: MilitaryUnit[], origins: (string | null)[]): string[] {
    const previous = options.map.military.units;
    const renamed = new Map<string, string>(); // by the old name
    const stale: string[] = [];
    units.forEach((unit, index) => {
      const old = previous.find(({ name }) => name === origins[index]);
      if (old) renamed.set(old.name, unit.name);
      const changed = old
        ? RAISING.some(key => JSON.stringify(old[key]) !== JSON.stringify(unit[key]))
        : +unit.rural > 0 || +unit.urban > 0;
      if (changed) stale.push(unit.name);
    });
    const removed = new Set(previous.map(({ name }) => name).filter(name => !renamed.has(name)));

    options.map.military.units = units;
    for (const state of pack.states ?? []) {
      if (!state.military?.length) continue;
      const military = state.military;
      const emblemed = military.filter(regiment => regiment.icon === this.getEmblem(regiment, previous));
      const manned = military.filter(regiment => regiment.a);
      for (const regiment of military) {
        if (regiment.composition) {
          const nextComposition: Record<string, Record<string, number>> = {};
          let dropped = false;
          for (const [origin, group] of Object.entries(regiment.composition)) {
            if (removed.has(origin)) {
              dropped = true;
              continue;
            }
            const newOrigin = renamed.get(origin) ?? origin;
            nextComposition[newOrigin] ??= {};
            const nextGroup = nextComposition[newOrigin];
            for (const [key, points] of Object.entries(group)) nextGroup[key] = (nextGroup[key] ?? 0) + points;
          }
          const next: Record<string, number> = {};
          for (const group of Object.values(nextComposition))
            for (const [key, points] of Object.entries(group)) next[key] = (next[key] ?? 0) + points;
          const nextOrigins: Record<string, string> = {};
          for (const [origin, group] of Object.entries(nextComposition)) {
            const keys = Object.keys(group);
            if (keys.length === 1) nextOrigins[keys[0]] = origin;
          }
          regiment.composition = Object.keys(nextComposition).length ? nextComposition : undefined;
          regiment.u = next;
          if (Object.keys(nextOrigins).length) regiment.unitOrigins = nextOrigins;
          else delete regiment.unitOrigins;
          if (dropped) {
            const exactU = { ...regiment.u };
            const exactA = sum(Object.values(exactU));
            reconcileRegimentBlocks(regiment, this.getUnitTypes());
            regiment.u = exactU;
            regiment.a = exactA;
          }
        } else {
          const next: Record<string, number> = {};
          const nextOrigins: Record<string, string> = {};
          let dropped = false;
          for (const [key, points] of Object.entries(regiment.u)) {
            const origin = regiment.unitOrigins?.[key] ?? key;
            if (removed.has(origin)) {
              dropped = true;
              continue;
            }
            const newOrigin = renamed.get(origin) ?? origin;
            const newKey = origin === key ? newOrigin : key;
            next[newKey] = (next[newKey] || 0) + points;
            if (origin !== key) nextOrigins[newKey] = newOrigin;
          }
          regiment.u = next;
          if (Object.keys(nextOrigins).length) regiment.unitOrigins = nextOrigins;
          else delete regiment.unitOrigins;
          if (dropped) reconcileRegimentBlocks(regiment, this.getUnitTypes());
          else if (regiment.units)
            for (const block of regiment.units) block.type = renamed.get(block.type) ?? block.type;
        }
      }
      state.military = military.filter(regiment => regiment.a || !manned.includes(regiment));
      for (const regiment of emblemed) if (state.military.includes(regiment)) regiment.icon = this.getEmblem(regiment);
    }
    return stale;
  }

  /** Define the war alerts of the states, from the fork's political formula */
  private defineAlerts(states: State[], onlyMissing = false): void {
    const valid = pack.states.filter(s => s.i && !s.removed);
    const expn = sum(valid.map(s => s.expansionism)); // total expansion
    const area = sum(valid.map(s => s.area)); // total area
    const rate = {
      Ally: -0.2,
      Friendly: -0.1,
      Neutral: 0,
      Suspicion: 0.1,
      Enemy: 1,
      Unknown: 0,
      Rival: 0.5,
      Vassal: 0.5,
      Suzerain: -0.5
    };

    for (const s of states) {
      if (onlyMissing && s.alert !== undefined) continue;
      const d = s.diplomacy!;
      const expansionRate = minmax(s.expansionism / expn / (s.area! / area), 0.25, 4); // how much state expansionism is realized
      const diplomacyRate = d.some(d => d === "Enemy")
        ? 3
        : d.some(d => d === "Rival")
          ? 2
          : d.some(d => d === "Suspicion")
            ? 1.5
            : 1; // peacefulness
      const neighborsRateRaw = s
        .neighbors!.map(n => (n ? pack.states[n].diplomacy![s.i] : "Suspicion"))
        .reduce((s, r) => s + rate[r as keyof typeof rate], 0.5);
      const neighborsRate = minmax(neighborsRateRaw, 0.5, 3); // neighbors rate
      s.alert = minmax(rn(expansionRate * diplomacyRate * neighborsRate, 2), 1, 20); // alert rate (area modifier)
    }
  }

  private raise(states: State[]): void {
    const drafts = this.draft(states);
    for (const state of states) state.military = this.form(drafts.get(state.i)!, state);
  }

  /** Runs a change of a state's regiments' troops: those on their default emblem follow it, those it empties are disbanded */
  private recompose(state: State, change: (military: Regiment[]) => void): void {
    state.military ??= [];
    const military = state.military;
    const before = new Map(military.map(regiment => [regiment, JSON.stringify(regiment.u)]));
    const emblemed = military.filter(regiment => regiment.icon === this.getEmblem(regiment));
    const manned = military.filter(regiment => regiment.a);
    change(military);
    const unitTypes = this.getUnitTypes();
    for (const regiment of military) {
      if (before.get(regiment) === JSON.stringify(regiment.u) || !before.has(regiment)) continue;
      const exactU = { ...regiment.u };
      const exactA = sum(Object.values(exactU));
      reconcileRegimentBlocks(regiment, unitTypes);
      regiment.u = exactU; // partial updates keep the headcount; blocks are capped for battle
      regiment.a = exactA;
    }
    state.military = military.filter(regiment => regiment.a || !manned.includes(regiment));
    for (const regiment of emblemed) if (state.military.includes(regiment)) regiment.icon = this.getEmblem(regiment);
  }

  /** The platoons each state's cells and burgs raise, by state: those it cannot equip turned to levies */
  private draft(valid: State[]): Map<number, Platoon[]> {
    const { cells, states } = pack;
    const { p } = cells;
    const stateModifier = {
      melee: {
        Nomadic: 0.5,
        Highland: 1.2,
        Lake: 1,
        Naval: 0.7,
        Hunting: 1.2,
        River: 1.1
      },
      ranged: {
        Nomadic: 0.9,
        Highland: 1.3,
        Lake: 1,
        Naval: 0.8,
        Hunting: 2,
        River: 0.8
      },
      mounted: {
        Nomadic: 2.3,
        Highland: 0.6,
        Lake: 0.7,
        Naval: 0.3,
        Hunting: 0.7,
        River: 0.8
      },
      machinery: {
        Nomadic: 0.8,
        Highland: 1.4,
        Lake: 1.1,
        Naval: 1.4,
        Hunting: 0.4,
        River: 1.1
      },
      naval: {
        Nomadic: 0.5,
        Highland: 0.5,
        Lake: 1.2,
        Naval: 1.8,
        Hunting: 0.7,
        River: 1.2
      },
      armored: {
        Nomadic: 1,
        Highland: 0.5,
        Lake: 1,
        Naval: 1,
        Hunting: 0.7,
        River: 1.1
      },
      aviation: {
        Nomadic: 0.5,
        Highland: 0.5,
        Lake: 1.2,
        Naval: 1.2,
        Hunting: 0.6,
        River: 1.2
      },
      magical: {
        Nomadic: 1,
        Highland: 2,
        Lake: 1,
        Naval: 1,
        Hunting: 1,
        River: 1
      }
    };

    const cellTypeModifier = {
      nomadic: {
        melee: 0.2,
        ranged: 0.5,
        mounted: 3,
        machinery: 0.4,
        naval: 0.3,
        armored: 1.6,
        aviation: 1,
        magical: 0.5
      },
      wetland: {
        melee: 0.8,
        ranged: 2,
        mounted: 0.3,
        machinery: 1.2,
        naval: 1.0,
        armored: 0.2,
        aviation: 0.5,
        magical: 0.5
      },
      highland: {
        melee: 1.2,
        ranged: 1.6,
        mounted: 0.3,
        machinery: 3,
        naval: 1.0,
        armored: 0.8,
        aviation: 0.3,
        magical: 2
      }
    };

    const burgTypeModifier = {
      nomadic: {
        melee: 0.3,
        ranged: 0.8,
        mounted: 3,
        machinery: 0.4,
        naval: 1.0,
        armored: 1.6,
        aviation: 1,
        magical: 0.5
      },
      wetland: {
        melee: 1,
        ranged: 1.6,
        mounted: 0.2,
        machinery: 1.2,
        naval: 1.0,
        armored: 0.2,
        aviation: 0.5,
        magical: 0.5
      },
      highland: {
        melee: 1.2,
        ranged: 2,
        mounted: 0.3,
        machinery: 3,
        naval: 1.0,
        armored: 0.8,
        aviation: 0.3,
        magical: 2
      }
    };

    const astralMode = isAstralMilitaryUnits(options.map.military?.units);
    // per state: the unit modifiers and the platoons that merge into its regiments
    const drafts = new Map<
      number,
      {
        modifiers: Record<string, number>;
        platoons: Platoon[];
        roster: ResolvedRoster | undefined;
        regime: string | null;
      }
    >();
    valid.forEach(s => {
      const draft = {
        modifiers: {} as Record<string, number>,
        platoons: [] as Platoon[],
        roster: this.getRoster(s),
        regime: astralMode ? classifyAstralRegime(pack.cultures?.[s.culture ?? 0]) : null
      };
      drafts.set(s.i, draft);
      // apply overall state modifiers for unit types based on state features
      for (const unit of options.map.military.units) {
        if (!stateModifier[unit.type as keyof typeof stateModifier]) continue;

        let modifier =
          stateModifier[unit.type as keyof typeof stateModifier][
            s.type as keyof (typeof stateModifier)[keyof typeof stateModifier]
          ] || 1;
        if (unit.type === "mounted" && s.formName?.includes("Horde")) modifier *= 2;
        else if (unit.type === "naval" && s.form === "Republic") modifier *= 1.2;
        draft.modifiers[unit.name] = modifier * (s.alert ?? 1);
      }
    });

    const getType = (cell: number) => {
      if ([1, 2, 3, 4].includes(cells.biome[cell])) return "nomadic";
      if ([7, 8, 9, 12].includes(cells.biome[cell])) return "wetland";
      if (cells.h[cell] >= 70) return "highland";
      return "generic";
    };

    function passUnitLimits(unit: MilitaryUnit, biome: number, state: number, culture: number, religion: number) {
      if (unit.biomes && !unit.biomes.includes(biome)) return false;
      if (unit.states && !unit.states.includes(state)) return false;
      if (unit.cultures && !unit.cultures.includes(culture)) return false;
      if (unit.religions && !unit.religions.includes(religion)) return false;
      return true;
    }

    // rural cells
    for (const i of cells.i) {
      if (!cells.pop[i]) continue;

      const biome = cells.biome[i];
      const state = cells.state[i];
      const culture = cells.culture[i];
      const religion = cells.religion[i];

      const stateObj = states[state];
      const draft = drafts.get(state);
      if (!state || stateObj.removed || !draft) continue;

      let modifier = cells.pop[i] / 100; // basic rural army in percentages
      if (culture !== stateObj.culture) modifier = stateObj.form === "Union" ? modifier / 1.2 : modifier / 2; // non-dominant culture
      if (religion !== cells.religion[stateObj.center])
        modifier = stateObj.form === "Theocracy" ? modifier / 2.2 : modifier / 1.4; // non-dominant religion
      if (cells.f[i] !== cells.f[stateObj.center])
        modifier = stateObj.type === "Naval" ? modifier / 1.2 : modifier / 1.8; // different landmass
      const type = getType(i);
      const cellDev = cells.development?.[i] ?? 0;
      const isThrallCell =
        astralMode && (draft.regime === "ancientBimodal" || draft.regime === "xothianScourge") && cellDev <= 32;
      if (astralMode) {
        if (isThrallCell) modifier *= 1.3;
        else if (draft.regime === "postScarcity" || cellDev >= POST_SCARCITY_DEVELOPMENT) modifier *= 0.65;
      }

      for (const unit of options.map.military.units) {
        const perc = +unit.rural;
        if (Number.isNaN(perc) || perc <= 0 || !draft.modifiers[unit.name]) continue;
        if (!passUnitLimits(unit, biome, state, culture, religion)) continue;
        if (astralMode) {
          if (!isAstralUnitAllowed(unit, cellDev, false, false)) continue;
        } else if (unit.type === "naval" && !cells.haven[i]) {
          continue; // only near-ocean cells create naval units in standard mode
        }

        const cellTypeMod =
          type === "generic"
            ? 1
            : cellTypeModifier[type as keyof typeof cellTypeModifier][
                unit.type as keyof (typeof cellTypeModifier)[keyof typeof cellTypeModifier]
              ]; // cell specific modifier
        const army = modifier * perc * cellTypeMod; // rural cell army
        const total = rn(army * draft.modifiers[unit.name] * options.map.units.population.scale); // total troops
        if (!total) continue;

        let [x, y] = p[i];
        let n = 0;

        // place naval/fleet units to sea or orbital anchorage
        const isFleet = unit.type === "naval" || (astralMode && ASTRAL_FLEET_UNIT_NAMES.has(unit.name));
        if (isFleet) {
          const haven = cells.haven[i];
          if (unit.type === "naval" && haven) [x, y] = p[haven];
          n = 1;
        }

        const rosterUnitName = selectRosterUnitForCategory(
          unit.type as RosterUnitCategory,
          draft.roster,
          false,
          false,
          0,
          false,
          { isThrall: isThrallCell }
        );

        draft.platoons.push({
          cell: i,
          a: total,
          t: total,
          x,
          y,
          u: rosterUnitName,
          n,
          s: unit.separate,
          type: unit.type,
          unitName: unit.name
        });
      }
    }

    // burgs
    for (const b of pack.burgs) {
      if (!b.i || b.removed || !b.state || !b.population) continue;

      const biome = cells.biome[b.cell];
      const state = b.state;
      const culture = b.culture;
      const religion = cells.religion[b.cell];

      const stateObj = states[state];
      const draft = drafts.get(state);
      if (!draft) continue;
      let m = (b.population * options.map.units.population.urbanization.rate) / 100; // basic urban army in percentages
      if (b.capital) m *= 1.2; // capital has household troops
      if (culture !== stateObj.culture) m = stateObj.form === "Union" ? m / 1.2 : m / 2; // non-dominant culture
      if (religion !== cells.religion[stateObj.center]) m = stateObj.form === "Theocracy" ? m / 2.2 : m / 1.4; // non-dominant religion
      if (cells.f[b.cell] !== cells.f[stateObj.center]) m = stateObj.type === "Naval" ? m / 1.2 : m / 1.8; // different landmass
      const type = getType(b.cell);
      const cellDev = cells.development?.[b.cell] ?? 0;
      if (astralMode && (draft.regime === "postScarcity" || cellDev >= POST_SCARCITY_DEVELOPMENT)) {
        m *= 0.65;
      }

      for (const unit of options.map.military.units) {
        const perc = +unit.urban;
        if (Number.isNaN(perc) || perc <= 0 || !draft.modifiers[unit.name]) continue;
        if (!passUnitLimits(unit, biome, state, culture!, religion)) continue;
        if (astralMode) {
          if (!isAstralUnitAllowed(unit, cellDev, true, Boolean(b.capital || b.port))) continue;
        } else if (unit.type === "naval" && (!b.port || !cells.haven[b.cell])) {
          continue; // only ports create naval units in standard mode
        }

        const mod =
          type === "generic"
            ? 1
            : burgTypeModifier[type as keyof typeof burgTypeModifier][
                unit.type as keyof (typeof burgTypeModifier)[keyof typeof burgTypeModifier]
              ]; // cell specific modifier
        const army = m * perc * mod; // urban cell army
        const total = rn(army * draft.modifiers[unit.name] * options.map.units.population.scale); // total troops
        if (!total) continue;

        let [x, y] = p[b.cell];
        let n = 0;

        // place naval/fleet units to sea or orbital anchorage
        const isFleet = unit.type === "naval" || (astralMode && ASTRAL_FLEET_UNIT_NAMES.has(unit.name));
        if (isFleet) {
          const haven = cells.haven[b.cell];
          if (unit.type === "naval" && haven) [x, y] = p[haven];
          n = 1;
        }

        const rosterUnitName = selectRosterUnitForCategory(
          unit.type as RosterUnitCategory,
          draft.roster,
          true,
          Boolean(b.capital),
          b.walls || 0,
          Boolean(b.temple),
          { astralHighTech: astralMode && cellDev >= 78 }
        );

        draft.platoons.push({
          cell: b.cell,
          a: total,
          t: total,
          x,
          y,
          u: rosterUnitName,
          n,
          s: unit.separate,
          type: unit.type,
          unitName: unit.name
        });
      }
    }

    Pack.markChanged(); // burgs may have changed hands since the run
    // conscripts the state cannot equip with their unit's goods serve as levies where they were raised
    const levyUnit = options.map.military.units.find(unit => unit.type === "levies");
    for (const [stateId, draft] of drafts) {
      const levyName = levyUnit ? selectRosterUnitForCategory("melee", draft.roster, false, false) : undefined;
      const demand: Record<string, number> = {};
      for (const platoon of draft.platoons)
        demand[platoon.unitName] = (demand[platoon.unitName] || 0) + platoon.a / options.map.units.population.scale;
      const equipped = this.getEquipped(stateId, demand);
      const raised = new Map<number, Platoon>(); // levies by cell
      for (const platoon of draft.platoons) {
        const share = equipped[platoon.unitName] ?? 1;
        if (share >= 1) continue;
        const unequipped = rn(platoon.a - platoon.a * share, 3);
        platoon.a = platoon.t = rn(platoon.a - unequipped, 3);
        if (!levyName || !unequipped || !levyUnit) continue;
        const levy = raised.get(platoon.cell);
        if (levy) levy.a = levy.t = rn(levy.a + unequipped, 3);
        else {
          const [x, y] = p[platoon.cell];
          raised.set(platoon.cell, {
            cell: platoon.cell,
            a: unequipped,
            t: unequipped,
            x,
            y,
            u: levyName,
            n: 0,
            s: levyUnit.separate,
            type: levyUnit.type,
            unitName: levyUnit.name
          });
        }
      }
      draft.platoons = draft.platoons.filter(platoon => platoon.a).concat([...raised.values()]);
    }

    return new Map([...drafts].map(([stateId, draft]) => [stateId, draft.platoons]));
  }

  /** Merges a state's platoons into regiments, numbered and named after the `existing` ones */
  private form(platoons: Platoon[], s: State, existing: Regiment[] = []): Regiment[] {
    if (!platoons.length) return [];
    const expected = 6 * options.map.units.population.scale; // expected regiment size
    const first = Math.max(-1, ...existing.map(({ i }) => i)) + 1;
    const { cells } = pack;
    const stateProvIds = (s.provinces ?? []).filter(
      provId => provId && pack.provinces?.[provId] && !pack.provinces[provId].removed
    );
    const capitalProvId =
      cells.province?.[s.center] && stateProvIds.includes(cells.province[s.center])
        ? cells.province[s.center]
        : stateProvIds[0] || 0;

    const byProvince = new Map<number, Platoon[]>();
    for (const platoon of platoons) {
      let provId = cells.province?.[platoon.cell] || 0;
      if ((!provId || !stateProvIds.includes(provId)) && capitalProvId) provId = capitalProvId;
      if (!byProvince.has(provId)) byProvince.set(provId, []);
      byProvince.get(provId)!.push(platoon);
    }

    const sortedProvIds = Array.from(byProvince.keys()).sort((a, b) => {
      if (a === capitalProvId) return -1;
      if (b === capitalProvId) return 1;
      return a - b;
    });

    const regiments: Regiment[] = [];
    for (const provId of sortedProvIds) {
      const provPlatoons = byProvince.get(provId) ?? [];
      regiments.push(...this.createRegimentsForProvince(provPlatoons, s, provId, first + regiments.length, expected));
    }

    for (const regiment of regiments) {
      regiment.name = this.getName(regiment, [...existing, ...regiments]);
      regiment.icon = this.getEmblem(regiment);
      this.generateNote(regiment, s);
    }
    return regiments;
  }

  private createRegimentsForProvince(
    nodes: Platoon[],
    s: State,
    provId: number,
    first: number,
    expected: number
  ): Regiment[] {
    const { cells } = pack;
    const { p } = cells;
    const mergeable = (n0: { s: number; u: string }, n1: { s: number; u: string }) => (!n0.s && !n1.s) || n0.u === n1.u; // check if regiments can be merged
    if (!nodes.length) return [];
    nodes.sort((a, b) => a.a - b.a); // form regiments starting from cells with fewest troops
    const tree = quadtree(
      nodes,
      d => d.x,
      d => d.y
    );

    // add n0 to n1's ultimate parent
    const merge = (n0: Platoon, n1: Platoon) => {
      if (!n1.children) n1.children = [n0];
      else n1.children.push(n0);
      if (n0.children)
        n0.children.forEach(n => {
          n1.children!.push(n);
        });
      n1.t += n0.t;
      n0.t = 0;
    };

    nodes.forEach(node => {
      tree.remove(node);
      const overlap = tree.find(node.x, node.y, 20);
      if (overlap?.t && mergeable(node, overlap)) {
        merge(node, overlap);
        return;
      }
      if (node.t > expected) return;
      const r = (expected - node.t) / (node.s ? 40 : 20); // search radius
      const candidates = findAllInQuadtree(node.x, node.y, r, tree);
      for (const c of candidates) {
        if (c.t < expected && mergeable(node, c)) {
          merge(node, c);
          break;
        }
      }
    });

    // parse regiments data
    const unitTypes = this.getUnitTypes();
    const prov = provId && pack.provinces ? pack.provinces[provId] : undefined;
    const capitalCell = prov ? prov.center : s.center;
    const [capX, capY] = p[capitalCell];
    const provBurg =
      prov?.burg && pack.burgs
        ? pack.burgs[prov.burg]
        : cells.burg?.[capitalCell] && pack.burgs
          ? pack.burgs[cells.burg[capitalCell]]
          : undefined;

    const surviving = nodes.filter(n => n.t).sort((a, b) => b.t - a.t);
    const landCount = surviving.filter(n => !n.n).length;
    const fleetCount = surviving.filter(n => n.n).length;
    let landIdx = 0;
    let fleetIdx = 0;

    const regiments: Regiment[] = surviving.map((r, i) => {
      const u: Record<string, number> = {};
      u[r.u] = r.a;
      const unitOrigins: Record<string, string> = {};
      const composition: Record<string, Record<string, number>> = {};
      const addComposition = (platoon: Platoon) => {
        if (platoon.u !== platoon.unitName) unitOrigins[platoon.u] = platoon.unitName;
        composition[platoon.unitName] ??= {};
        const group = composition[platoon.unitName];
        group[platoon.u] = (group[platoon.u] ?? 0) + platoon.a;
        platoon.children?.forEach(addComposition);
      };
      addComposition(r);
      (r.children ?? []).forEach(n => {
        u[n.u] = (u[n.u] ?? 0) + n.a;
      });

      let regCell = capitalCell;
      let regBx = capX;
      let regBy = capY;
      let regX = capX;
      let regY = capY;

      if (!r.n) {
        if (landIdx > 0) {
          const angle = ((landIdx - 1) * (2 * Math.PI)) / Math.max(landCount - 1, 1);
          regX = rn(capX + Math.cos(angle) * 10, 2);
          regY = rn(capY + Math.sin(angle) * 10, 2);
        }
        landIdx++;
      } else {
        let havenCell = provBurg?.port && cells.haven?.[provBurg.cell] ? cells.haven[provBurg.cell] : 0;
        if (!havenCell && provId && pack.burgs) {
          const portBurg = pack.burgs.find(
            b => b?.i && !b.removed && cells.province?.[b.cell] === provId && b.port && cells.haven?.[b.cell]
          );
          if (portBurg) havenCell = cells.haven[portBurg.cell];
        }
        if (havenCell && u.fleet) {
          regCell = havenCell;
          regBx = p[havenCell][0];
          regBy = p[havenCell][1];
          regX = rn(regBx + fleetIdx * 6, 2);
          regY = rn(regBy + fleetIdx * 6, 2);
        } else {
          regCell = r.cell;
          regBx = r.x;
          regBy = r.y;
          const angle = (fleetIdx * (2 * Math.PI)) / Math.max(fleetCount, 1);
          regX = rn(regBx + Math.cos(angle) * 10, 2);
          regY = rn(regBy + Math.sin(angle) * 10, 2);
        }
        fleetIdx++;
      }

      const reg: Regiment = {
        i: first + i,
        a: r.t,
        cell: regCell,
        x: regX,
        y: regY,
        bx: regBx,
        by: regBy,
        u,
        unitOrigins: Object.keys(unitOrigins).length ? unitOrigins : undefined,
        composition: Object.keys(composition).length ? composition : undefined,
        rosterId: s.rosterId,
        n: r.n,
        name: "",
        icon: "",
        state: s.i,
        province: provId || undefined,
        tags: []
      };
      const exactU = { ...reg.u };
      const exactA = sum(Object.values(exactU));
      reconcileRegimentBlocks(reg, unitTypes);
      reg.u = exactU;
      reg.a = exactA;
      return reg;
    });

    return regiments;
  }

  /** The province a platoon belongs to, with the state's capital province as the fallback */
  private provinceOf(state: State, cell: number): number {
    const stateProvIds = (state.provinces ?? []).filter(
      provId => provId && pack.provinces?.[provId] && !pack.provinces[provId].removed
    );
    const capitalProvId =
      pack.cells.province?.[state.center] && stateProvIds.includes(pack.cells.province[state.center])
        ? pack.cells.province[state.center]
        : stateProvIds[0] || 0;
    const provId = pack.cells.province?.[cell] || 0;
    return !provId || !stateProvIds.includes(provId) ? capitalProvId : provId;
  }

  getDefaultOptions() {
    const units = [
      {
        icon: "ΓÜö∩╕Å",
        name: "infantry",
        rural: 0.25,
        urban: 0.2,
        crew: 1,
        power: 1,
        type: "melee",
        separate: 0
      },
      {
        icon: "≡ƒÅ╣",
        name: "archers",
        rural: 0.12,
        urban: 0.2,
        crew: 1,
        power: 1,
        type: "ranged",
        separate: 0
      },
      {
        icon: "≡ƒÉ┤",
        name: "cavalry",
        rural: 0.12,
        urban: 0.03,
        crew: 2,
        power: 2,
        type: "mounted",
        separate: 0
      },
      {
        icon: "≡ƒÆú",
        name: "artillery",
        rural: 0,
        urban: 0.03,
        crew: 8,
        power: 12,
        type: "machinery",
        separate: 0
      },
      {
        icon: "≡ƒîè",
        name: "fleet",
        rural: 0,
        urban: 0.015,
        crew: 100,
        power: 50,
        type: "naval",
        separate: 1
      }
    ];
    return units.map(unit => ({ ...unit, icon: Icons.glyph(unit.icon) }));
  }

  getRoster(polity: { rosterId?: string; stateRosterId?: string }): ResolvedRoster | undefined {
    try {
      const content = currentContent()?.content;
      if (!content) return undefined;
      const rosterId = polity.rosterId || polity.stateRosterId || content.defaultRoster || "commonBase";
      return content.rosters[rosterId] || content.rosters[content.defaultRoster] || Object.values(content.rosters)[0];
    } catch {
      return undefined;
    }
  }

  getUnitTypes(): Record<string, UnitType> {
    try {
      const content = currentContent()?.content;
      return content?.unitTypes ?? {};
    } catch {
      return {};
    }
  }

  getCategory(unitId: string): MilitaryCategory {
    return getCategoryForUnit(unitId, this.getUnitTypes());
  }

  getCategoryCount(reg: Regiment, cat: MilitaryCategory): number {
    let count = 0;
    const unitTypes = this.getUnitTypes();
    for (const [unitId, men] of Object.entries(reg.u ?? {})) {
      if (getCategoryForUnit(unitId, unitTypes) === cat) {
        count += men;
      }
    }
    return count;
  }

  getName(r: Regiment, regiments: Regiment[]) {
    const cells = pack.cells;
    const provId = r.province ?? cells.province?.[r.cell] ?? 0;
    const prov = provId && pack.provinces ? pack.provinces[provId] : undefined;
    const proper = prov
      ? prov.name
      : pack.states?.[r.state]?.name || (cells.burg?.[r.cell] && pack.burgs?.[cells.burg[r.cell]]?.name) || null;
    const number = nth(
      regiments.filter(
        reg => reg.n === r.n && (reg.province ?? cells.province?.[reg.cell] ?? 0) === provId && reg.i < r.i
      ).length + 1
    );
    let form = r.n ? "Fleet" : "Regiment";
    if (isAstralMilitaryUnits(options.map.military?.units)) {
      if (r.n) {
        const sorted = Object.entries(r.u ?? {}).sort((a, b) => b[1] - a[1]);
        const mainCat = sorted.length ? this.getCategory(sorted[0][0]) : "naval";
        if (mainCat === "monster") form = "Capital Armada";
        else if (mainCat === "artillery") form = "Cruiser Squadron";
        else if (mainCat === "cavalry") form = "Strike Flotilla";
        else form = "Void Fleet";
      } else {
        const state = pack.states?.[r.state];
        const regime = state ? classifyAstralRegime(pack.cultures?.[state.culture ?? 0]) : "standardSciFi";
        if (regime === "postScarcity") form = "Sentinel Cohort";
        else if (regime === "ancientBimodal") form = "Thrall Legion";
        else if (regime === "xothianScourge") form = "Brood-Host";
        else form = "Defense Garrison";
      }
    }
    return `${number}${proper ? ` (${proper}) ` : ` `}${form}`;
  }

  /** Troops a headcount stands for; the fork stores troops, not population points */
  getTroops(troops = 0): number {
    return Math.ceil(rn(troops, 3));
  }

  /** Share of each unit's conscripts what the state consumes of its goods equips; 1 with no goods or before the run */
  getEquipped(stateId: number, demand: Record<string, number>): Record<string, number> {
    const units = options.map.military.units;
    const consumed = Accounts.getConsumption(stateId);
    const goodsOf = (unit: MilitaryUnit) => (unit.goods ?? []).flatMap(goodId => Goods.get(goodId) ?? []);
    const needing = (goodId: number) => sum(units, unit => (unit.goods?.includes(goodId) ? demand[unit.name] || 0 : 0));

    const equipped: Record<string, number> = {};
    for (const unit of units) {
      const troops = demand[unit.name] || 0;
      const goods = goodsOf(unit);
      if (!troops || !goods.length || !pack.deals?.length) {
        equipped[unit.name] = 1;
        continue;
      }
      const kits = sum(goods, good => {
        const stock = (consumed[good.i] || 0) * EQUIPMENT * (good.demandCoverage?.military || 1);
        return (stock * troops) / needing(good.i);
      });
      equipped[unit.name] = Math.min(1, kits / troops);
    }
    return equipped;
  }

  /** A state's upkeep, 0 (powerless) to 1 (fully kept); 1 before the run or levying nothing */
  getUpkeep(stateId: number): number {
    const state = pack.states[stateId];
    if (!state || !levies(state) || !pack.deals?.length) return 1;
    if (!options.map.units?.population || !options.map.military?.units) return 1; // a stripped table cannot measure upkeep
    const need = this.getUpkeepNeed(stateId);
    return need ? Math.min(1, state.economy.spent.military / need) : 1;
  }

  /** The military spending a day that keeps a state's forces in full */
  getUpkeepNeed(stateId: number): number {
    return this.getNominalPower(stateId) * UPKEEP_COST;
  }

  /** How strongly a state's forces fight for their upkeep: it multiplies their power in battle */
  getBattleUpkeep(stateId: number): number {
    return Math.max(MIN_UPKEEP, this.getUpkeep(stateId));
  }

  /**
   * Battle upkeep through Living World seasons: a funded treasury holds the
   * line (0.5 at worst), but a bankrupt state's underfunded forces melt toward
   * `MIN_UPKEEP`.
   */
  getLivingBattleUpkeep(stateId: number): number {
    const upkeep = this.getUpkeep(stateId) * stateEconomyModifiers(stateId).upkeep; // ┬º5.2: a martial ruler keeps troops keen
    const funded = Number(pack.states[stateId]?.economy?.treasury ?? 0) > 0;
    return funded ? minmax(upkeep, 0.5, 1.15) : Math.max(MIN_UPKEEP, upkeep);
  }

  /**
   * Spare equipment kits of a trade good (┬º4.3): a day's consumption scaled by
   * `EQUIPMENT` and military coverage, minus every fielded block whose type
   * needs the good. `Infinity` before the run or where the good is not traded.
   */
  getEquipmentSpare(stateId: number, goodName: string, requires: (typeId: string) => boolean): number {
    if (!pack.deals?.length) return Infinity;
    const good = options.map.goods?.find(entry => entry.name === goodName);
    if (!good) return Infinity; // the good is not traded on this map: no gate
    const consumed = Accounts.getConsumption(stateId)[good.i] || 0;
    const kits = consumed * EQUIPMENT * (good.demandCoverage?.military || 1);
    const fielded = sum(pack.states[stateId]?.military ?? [], regiment =>
      sum(regiment.units ?? [], block => (block.hp > 0 && requires(block.type) ? 1 : 0))
    );
    return kits - fielded;
  }

  /** The state's forces' battle power: troops ├ù unit power ├ù battle upkeep */
  getPower(stateId: number): number {
    return this.getNominalPower(stateId) * this.getBattleUpkeep(stateId);
  }

  /** A regiment's battle power: troops ├ù unit power ├ù its state's battle upkeep */
  getRegimentPower(regiment: Regiment): number {
    return this.getTroopsPower(regiment) * this.getBattleUpkeep(regiment.state);
  }

  private getNominalPower(stateId: number): number {
    return sum(pack.states[stateId]?.military ?? [], regiment => this.getTroopsPower(regiment));
  }

  /** Unit power over the regiment's headcount, read as population points the way the budget counts */
  private getTroopsPower(regiment: Regiment): number {
    const scale = options.map.units.population.scale || 1;
    const units = options.map.military.units;
    const astralMode = isAstralMilitaryUnits(units);
    const techMult = astralMode ? astralTechPowerMultiplier(pack.cells?.development?.[regiment.cell] ?? 54) : 1;

    return (
      sum(Object.entries(regiment.u ?? {}), ([unitKey, count]) => {
        if (!count) return 0;
        let matched = units.find(u => u.name === unitKey);
        if (!matched) {
          const cat = this.getCategory(unitKey);
          matched = units.find(u => {
            if (cat === "spellcaster")
              return u.type === "magical" || u.name === "spellcasters" || u.type === "ranged" || u.name === "archers";
            if (cat === "monster")
              return u.type === "armored" || u.name === "monsters" || u.type === "melee" || u.name === "infantry";
            if (cat === "melee") return u.type === "melee" || u.name === "infantry";
            if (cat === "ranged") return u.type === "ranged" || u.name === "archers";
            if (cat === "cavalry") return u.type === "mounted" || u.name === "cavalry";
            if (cat === "artillery") return u.type === "machinery" || u.name === "artillery";
            if (cat === "naval") return u.type === "naval" || u.name === "fleet";
            return false;
          });
        }
        return (count / scale) * (+(matched?.power ?? 1) || 0);
      }) * techMult
    );
  }

  // utilize si function to make regiment total text fit regiment box
  getTotal(reg: Regiment) {
    return reg.a > (reg.n ? 999 : 99999) ? si(reg.a) : reg.a;
  }

  generateNote(r: Regiment, s: State) {
    const cells = pack.cells;
    const provId = r.province ?? cells.province?.[r.cell] ?? 0;
    const prov = provId && pack.provinces ? pack.provinces[provId] : undefined;
    const base =
      cells.burg?.[r.cell] && pack.burgs?.[cells.burg[r.cell]]
        ? pack.burgs[cells.burg[r.cell]].name
        : prov?.burg && pack.burgs?.[prov.burg]
          ? pack.burgs[prov.burg].name
          : prov
            ? prov.fullName
            : null;
    const isAstral = isAstralMilitaryUnits(options.map.military?.units);
    const station = base ? `${r.name} is ${r.n ? (isAstral ? "docked at" : "based") : "stationed"} in ${base}. ` : "";

    const composition = r.a
      ? Object.keys(r.u)
          .map(t => `ΓÇö ${t}: ${r.u[t as keyof typeof r.u]}`)
          .join("\r\n")
      : null;
    const cal = options.map.lore?.calendar ?? { year: 1000, era: "AE", eraShort: "AE" };
    const label = isAstral && r.n ? "Fleet" : "Regiment";
    const troops = composition ? `\r\n\r\n${label} composition in ${cal.year} ${cal.eraShort}:\r\n${composition}.` : "";

    const campaign = s.campaigns ? ra(s.campaigns) : null;
    const year = campaign
      ? rand(campaign.start, campaign.end || cal.year)
      : gauss(cal.year - 100, 150, 1, cal.year - 6);
    const conflict = campaign ? ` during the ${campaign.name}` : "";
    r.note = `${label} was ${isAstral && r.n ? "commissioned" : "formed"} in ${year} ${cal.era}${conflict}. ${station}${troops}`;
  }

  /** Rename a regiment, addressed by its state and its own id */
  rename(stateId: number, regimentId: number, name: string): void {
    this.living(stateId, regimentId).name = requireName(name);
  }

  /** Disband a regiment, addressed by its state and its own id */
  remove(stateId: number, regimentId: number): void {
    const regiment = this.living(stateId, regimentId);
    const military = pack.states[stateId].military!;
    military.splice(military.indexOf(regiment), 1);
  }

  /** Raise an empty regiment of a state at a map point, a fleet on water; returns its id */
  add(stateId: number, x: number, y: number): number {
    const state = pack.states[stateId];
    if (!stateId || !state || state.removed) throw new Error(`State ${stateId} does not exist`);
    const cell = Pack.requireCell(x, y);
    const [cx, cy] = pack.cells.p[cell];
    state.military ??= [];
    const military = state.military;
    const i = military.length ? Math.max(...military.map(regiment => regiment.i)) + 1 : 0;
    const provId = pack.cells.province?.[cell] || undefined;
    const regiment: Regiment = {
      a: 0,
      cell,
      province: provId,
      i,
      n: +(pack.cells.h[cell] < 20),
      u: {},
      x: cx,
      y: cy,
      bx: cx,
      by: cy,
      state: stateId,
      icon: Icons.glyph("≡ƒ¢í∩╕Å"),
      name: "",
      t: 0,
      s: 0,
      type: "",
      tags: []
    };
    regiment.name = this.getName(regiment, military);
    military.push(regiment);
    this.generateNote(regiment, state);
    return i;
  }

  /** Set a regiment's troops by unit name, such as { spear: 800, archers: 200 }; the total and blocks follow */
  setUnits(stateId: number, regimentId: number, units: Record<string, number>): void {
    const regiment = this.living(stateId, regimentId);
    if (typeof units !== "object" || units === null || Array.isArray(units))
      throw new Error("Units are an object of unit names and troop numbers");
    for (const [name, count] of Object.entries(units)) {
      if (typeof count !== "number" || !Number.isFinite(count) || count < 0)
        throw new Error(`The number of ${name} must be a non-negative number`);
    }
    regiment.u = { ...units };
    delete regiment.unitOrigins;
    delete regiment.composition;
    const exactU = { ...regiment.u };
    const exactA = sum(Object.values(exactU));
    reconcileRegimentBlocks(regiment, this.getUnitTypes());
    regiment.u = exactU;
    regiment.a = exactA;
  }

  /** Set a regiment's explicit unit slots directly */
  setUnitSlots(stateId: number, regimentId: number, slots: ArmyBlock[]): void {
    const regiment = this.living(stateId, regimentId);
    regiment.units = slots.map(s => ({ ...s }));
    delete regiment.unitOrigins;
    delete regiment.composition;
    syncRegimentTotals(regiment, this.getUnitTypes());
  }

  /** Set a state's war alert, the modifier of its forces (generated from 1 to 20): every regiment's troops scale with it */
  setAlert(stateId: number, alert: number): void {
    const state = pack.states[stateId];
    if (!stateId || !state || state.removed) throw new Error(`State ${stateId} does not exist`);
    if (typeof alert !== "number" || !(alert >= 0 && Number.isFinite(alert)))
      throw new Error("The alert must be a non-negative number");
    const previous = state.alert ?? 1;
    state.alert = rn(alert, 2);
    const change = previous ? state.alert / previous : 0; // the stored value, so the next change divides by it
    for (const regiment of state.military ?? []) {
      for (const unit of Object.keys(regiment.u)) regiment.u[unit] = rn(regiment.u[unit] * change);
      for (const group of Object.values(regiment.composition ?? {}))
        for (const unit of Object.keys(group)) group[unit] = rn(group[unit] * change);
      reconcileRegimentBlocks(regiment, this.getUnitTypes());
    }
  }

  /** Make a regiment a fleet or a land regiment */
  setNaval(stateId: number, regimentId: number, naval: boolean): void {
    this.living(stateId, regimentId).n = naval ? 1 : 0;
  }

  /** Set a regiment's icon: an emoji or an icon id */
  setIcon(stateId: number, regimentId: number, icon: string): void {
    this.living(stateId, regimentId).icon = Icons.reference(icon);
  }

  /** Move a regiment to a map point; its base stays */
  move(stateId: number, regimentId: number, x: number, y: number): void {
    const regiment = this.living(stateId, regimentId);
    Pack.requireCell(x, y);
    regiment.x = rn(x, 2);
    regiment.y = rn(y, 2);
  }

  /** Turn a regiment to an angle in degrees, from -180 to 180 */
  rotate(stateId: number, regimentId: number, angle: number): void {
    const regiment = this.living(stateId, regimentId);
    if (typeof angle !== "number" || !(angle >= -180 && angle <= 180))
      throw new Error("The angle must be a number from -180 to 180");
    regiment.angle = rn(angle, 2);
  }

  /** Move a regiment's base, where it is stationed, to a map point */
  setBase(stateId: number, regimentId: number, x: number, y: number): void {
    const regiment = this.living(stateId, regimentId);
    Pack.requireCell(x, y);
    regiment.bx = rn(x, 2);
    regiment.by = rn(y, 2);
  }

  /** Split a regiment in two halves; the new one stands just below. Returns its id */
  split(stateId: number, regimentId: number): number {
    const regiment = this.living(stateId, regimentId);
    const state = pack.states[stateId];
    const military = state.military!;
    const half = Object.fromEntries(Object.entries(regiment.u).map(([unit, count]) => [unit, Math.floor(count / 2)]));
    const a = sum(Object.values(half));
    if (!a) throw new Error(`Regiment ${stateId}-${regimentId} has too few troops to split`);
    regiment.u = Object.fromEntries(
      Object.entries(regiment.u).map(([unit, count]) => [unit, count - Math.floor(count / 2)])
    );
    const origins = regiment.unitOrigins ? { ...regiment.unitOrigins } : undefined;
    delete regiment.composition;
    const remainingU = { ...regiment.u };
    const remainingA = sum(Object.values(remainingU));
    reconcileRegimentBlocks(regiment, this.getUnitTypes());
    regiment.u = remainingU;
    regiment.a = remainingA;

    const shift = REGIMENT_SIZE * 2;
    let y = regiment.y + shift;
    while (military.some(other => other.x === regiment.x && other.y === y)) y += shift;
    const i = Math.max(...military.map(other => other.i)) + 1;
    const added: Regiment = {
      a,
      cell: regiment.cell,
      province: regiment.province,
      i,
      n: regiment.n,
      u: half,
      unitOrigins: origins,
      rosterId: regiment.rosterId,
      x: regiment.x,
      y,
      bx: regiment.bx,
      by: regiment.by,
      state: stateId,
      icon: regiment.icon,
      name: "",
      t: 0,
      s: 0,
      type: regiment.type,
      tags: [...(regiment.tags ?? [])]
    };
    const addedU = { ...added.u };
    const addedA = sum(Object.values(addedU));
    reconcileRegimentBlocks(added, this.getUnitTypes());
    added.u = addedU;
    added.a = addedA;
    added.name = this.getName(added, military);
    military.push(added);
    this.generateNote(added, state);
    return i;
  }

  /** Attach a regiment to another, of any state: its troops and note join the target and it is disbanded */
  attach(stateId: number, regimentId: number, targetStateId: number, targetId: number): void {
    const regiment = this.living(stateId, regimentId);
    const target = this.living(targetStateId, targetId);
    if (regiment === target) throw new Error("A regiment cannot attach to itself");
    for (const [unit, count] of Object.entries(regiment.u)) if (count) target.u[unit] = (target.u[unit] || 0) + count;
    if (regiment.composition && target.composition) {
      for (const [origin, group] of Object.entries(regiment.composition)) {
        target.composition[origin] ??= {};
        const targetGroup = target.composition[origin];
        for (const [unit, count] of Object.entries(group)) targetGroup[unit] = (targetGroup[unit] ?? 0) + count;
      }
    } else if (regiment.composition || target.composition) delete target.composition;
    if (regiment.unitOrigins) {
      target.unitOrigins ??= {};
      for (const unit of Object.keys(regiment.u)) target.unitOrigins[unit] = regiment.unitOrigins[unit] ?? unit;
    }
    reconcileRegimentBlocks(target, this.getUnitTypes());

    const { year, eraShort } = options.map.lore.calendar;
    const record = regiment.note ? ` Its record: ${regiment.note}` : "";
    const merger = `${regiment.name} merged into the regiment (${year} ${eraShort}).${record}`;
    target.note = target.note ? `${target.note}<br><br>${merger}` : merger;
    this.remove(stateId, regimentId);
  }

  private livingStates(only?: number[]): State[] {
    return pack.states.filter(state => state.i && !state.removed && (!only || only.includes(state.i)));
  }

  private living(stateId: number, regimentId: number): Regiment {
    const state = pack.states[stateId];
    const regiment = state && !state.removed ? state.military?.find(({ i }) => i === regimentId) : undefined;
    if (!regiment) throw new Error(`Regiment ${stateId}-${regimentId} does not exist`);
    return regiment;
  }

  // get default regiment emblem
  getEmblem(r: Regiment, roster = options.map.military.units) {
    if (!r.n && !Object.values(r.u).length) return Icons.glyph("≡ƒö░"); // "Newbie" regiment without troops
    const astralMode = isAstralMilitaryUnits(roster);
    if (
      !r.n &&
      pack.states[r.state]?.form === "Monarchy" &&
      pack.cells.burg[r.cell] &&
      pack.burgs[pack.cells.burg[r.cell]]?.capital
    )
      return Icons.glyph("≡ƒææ"); // "Royal" regiment based in capital
    const totals = new Map<string, number>();
    if (r.composition) {
      for (const [origin, group] of Object.entries(r.composition))
        totals.set(origin, (totals.get(origin) ?? 0) + sum(Object.values(group)));
    } else {
      for (const [key, count] of Object.entries(r.u)) {
        const origin = r.unitOrigins?.[key] ?? key;
        totals.set(origin, (totals.get(origin) ?? 0) + count);
      }
    }
    const sorted = [...totals].sort((a, b) => b[1] - a[1]);
    const mainUnit = sorted.length > 0 ? sorted[0][0] : undefined;
    if (!mainUnit) return Icons.glyph(r.n ? (astralMode ? "≡ƒÜÇ" : "≡ƒîè") : "ΓÜö∩╕Å");
    const unit = roster.find((u: { name: string; icon: string }) => u.name === mainUnit);
    if (unit) return unit.icon;
    const cat = this.getCategory(mainUnit);
    if (astralMode && r.n) {
      if (cat === "monster") return Icons.glyph("≡ƒ¬É");
      if (cat === "artillery") return Icons.glyph("≡ƒ¢░∩╕Å");
      if (cat === "cavalry") return Icons.glyph("≡ƒ¢╕");
      return Icons.glyph("≡ƒÜÇ");
    }
    if (cat === "spellcaster") return Icons.glyph("≡ƒö«");
    if (cat === "monster") return Icons.glyph("≡ƒÉë");
    if (cat === "cavalry") return Icons.glyph("≡ƒÉ┤");
    if (cat === "ranged") return Icons.glyph("≡ƒÅ╣");
    if (cat === "artillery") return Icons.glyph("≡ƒÆú");
    if (cat === "naval") return Icons.glyph("≡ƒîè");
    return Icons.glyph("ΓÜö∩╕Å");
  }
}

export const Military = new MilitaryModule();
