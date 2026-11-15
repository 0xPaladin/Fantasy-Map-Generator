/**
 * Pure army helpers for the Living World combined-arms model
 * (living-openciv-armies.md §5). No `pack`, no I/O — everything here takes the
 * regiment, roster or type table it needs as an argument.
 *
 * The `hp ↔ count` bridge at the bottom is the only place `ArmyBlock.hp` and
 * `battle.ts`'s absolute `count` meet. It maps every block onto
 * `BATTLE_STRENGTH` abstract men so `fill = hp` exactly and integer loss
 * quantisation can never make a small-`quantity` block immortal (§5.3).
 */

import { UNIT_TECH_DEVELOPMENT } from "@/data/living-eras";
import type { ResolvedRoster, UnitCategory, UnitType } from "@/data/roster-content";
import { type BattleTacticalOrder, categoryShares } from "@/model/battle/battle";
import type { Regiment } from "@/model/political/military-generator";
import type { ArmyBlock, ArmyUnit } from "@/types/battle";
import type { ArmyStance } from "@/types/living";

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

export function armyBlocks(regiment: Regiment): ArmyBlock[] {
  return regiment.units ?? [];
}

/** Slot count — the stack badge. */
export function armySlots(regiment: Regiment): number {
  return armyBlocks(regiment).length;
}

/** Mean capability 0..1 — the wounded tint and the HUD bar. */
export function armyHp(regiment: Regiment): number {
  const blocks = armyBlocks(regiment).filter(b => b.hp > 0);
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, b) => sum + b.hp, 0) / blocks.length;
}

/** Total capability in blocks — Σ hp. */
export function armyStrength(regiment: Regiment): number {
  return armyBlocks(regiment).reduce((sum, b) => sum + Math.max(0, b.hp), 0);
}

/** Nominal headcount mirror: `Σ round(hp × quantity)`. Display only. */
export function armyMen(regiment: Regiment, unitTypes?: Record<string, UnitType>): number {
  return armyBlocks(regiment).reduce(
    (sum, b) => sum + (b.hp > 0 ? Math.round(b.hp * (unitTypes?.[b.type]?.quantity ?? 100)) : 0),
    0
  );
}

export function armyIsEmpty(regiment: Regiment): boolean {
  return armyBlocks(regiment).every(b => b.hp <= 0);
}

/**
 * The block that leads the interim duel (Phase B): strongest by capability,
 * then experience, then type for determinism. Phase C's combined-arms battle
 * uses every block instead.
 */
export function armyLead(regiment: Regiment): ArmyBlock | undefined {
  return armyBlocks(regiment)
    .filter(b => b.hp > 0)
    .sort((a, b) => b.hp - a.hp || b.exp - a.exp || a.type.localeCompare(b.type))[0];
}

/** Interim per-block power: the battle engine's shape, scaled by hp and exp. */
export function blockPower(block: ArmyBlock, types: Record<string, UnitType>): number {
  const t = types[block.type];
  if (!t) return 0;
  const expMult = 0.85 + 0.03 * Math.max(0, Math.min(9, block.exp));
  return (t.attack + t.defense + t.charge / 2 + t.missile * 0.6) * expMult * Math.max(0, Math.min(1, block.hp));
}

/** Interim ranged test: the leading block carries missile power. */
export function armyIsRangedBlocks(regiment: Regiment, types: Record<string, UnitType>): boolean {
  const lead = armyLead(regiment);
  if (!lead) return false;
  return (types[lead.type]?.missile ?? 0) > 0;
}

/** Slowest block wins: cavalry 4, everything else 2 (no movement stat on UnitType). */
export function armySpeed(regiment: Regiment, types: Record<string, UnitType>): number {
  let speed = 4;
  let live = 0;
  for (const block of armyBlocks(regiment)) {
    if (block.hp <= 0) continue;
    live += 1;
    speed = Math.min(speed, types[block.type]?.category === "cavalry" ? 4 : 2);
  }
  return live > 0 ? speed : 2;
}

/**
 * Convert pre-hp blocks in place (§13.1): a block carrying `count` but no
 * finite `hp` becomes `hp = count / quantity`; `fleet` slots are dropped.
 */
export function migrateArmyBlocks(regiment: Regiment, types?: Record<string, UnitType>): void {
  if (!regiment.units) return;
  const migrated: ArmyBlock[] = [];
  for (const block of regiment.units) {
    if (block.type === "fleet") continue;
    let hp = block.hp;
    if (!Number.isFinite(hp)) {
      const legacy = (block as unknown as { count?: number }).count;
      const quantity = types?.[block.type]?.quantity ?? 100;
      hp = legacy !== undefined && Number.isFinite(legacy) ? Math.min(1, legacy / Math.max(1, quantity)) : 1;
    }
    if (hp > 0) migrated.push({ ...block, hp: Math.min(1, hp) });
  }
  regiment.units = migrated;
}

/** Combat regiments hold roster blocks; utility regiments never do (§11). */
export function armyIsUtility(regiment: Regiment): boolean {
  return isCivilianUnit((regiment.type ?? "").toLowerCase());
}

export function armyIsCombat(regiment: Regiment): boolean {
  return !armyIsUtility(regiment);
}

/** Utility unit ids that keep `UnitSimState` (living-openciv-armies.md §6.5). */
export const CIVILIAN_UNIT_IDS = [
  "settler",
  "builder",
  "work_boat",
  "caravan",
  "cargo_ship",
  "missionary",
  "inquisitor",
  "great_prophet"
] as const;

export function isCivilianUnit(id: string): boolean {
  return (CIVILIAN_UNIT_IDS as readonly string[]).includes(id);
}

/**
 * Clamp, prune and cap a regiment's blocks in place. `hp <= 0` is pruned,
 * `hp > 1` clamped, unknown types dropped, and the `fleet` pseudo-type kept
 * (it is a marker, never handed to `battle.ts`).
 */
export function normalizeArmy(regiment: Regiment, maxSlots: number, knownTypes?: Record<string, UnitType>): void {
  const units = regiment.units ?? [];
  const pruned: ArmyBlock[] = [];
  for (const block of units) {
    if (block.hp <= 0) continue;
    if (block.type !== "fleet" && knownTypes && !knownTypes[block.type]) continue;
    if (pruned.length >= maxSlots) break;
    pruned.push({ ...block, hp: Math.min(1, block.hp), exp: Math.min(9, Math.max(0, block.exp ?? 0)) });
  }
  pruned.sort((a, b) => b.hp - a.hp || a.type.localeCompare(b.type));
  regiment.units = pruned;
}

// ---------------------------------------------------------------------------
// Era gating — a unit opens at a development level; no roster JSON needs edits.
// ---------------------------------------------------------------------------

/** Development each upkeep rank opens at, per category (0 = always available). */
const CATEGORY_DEVELOPMENT_LADDER: Record<UnitCategory, readonly number[]> = {
  melee: [0, 0, 16, 26, 38, 43, 65, 81],
  ranged: [0, 9, 21, 37, 43, 65, 83],
  cavalry: [0, 20, 20, 36, 66, 84, 91],
  artillery: [0, 21, 25, 37, 56, 76, 88],
  monster: [0, 0, 16, 26, 38, 0],
  spellcaster: [0, 13, 24, 27, 34, 40]
};

/**
 * The development level at which `unit` opens: its frozen `requiredTech`
 * threshold, else the category ladder entry at its upkeep rank, else 0.
 */
export function requiredDevelopmentFor(unit: UnitType, roster: ResolvedRoster): number {
  if (unit.requiredTech !== undefined) return UNIT_TECH_DEVELOPMENT[unit.requiredTech] ?? 0;
  const peers = Object.values(roster.units)
    .filter(u => u.category === unit.category && u.requiredTech === undefined)
    .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id));
  const ladder = CATEGORY_DEVELOPMENT_LADDER[unit.category] ?? [];
  const rank = peers.findIndex(u => u.id === unit.id);
  if (rank < 0) return 0;
  return ladder[Math.min(rank, ladder.length - 1)] ?? 0;
}

/** Next unit in the same category by upkeep rank — the derived upgrade target. */
export function nextRosterUnitInCategory(roster: ResolvedRoster, id: string): UnitType | undefined {
  const unit = roster.units[id];
  if (!unit) return undefined;
  const peers = Object.values(roster.units)
    .filter(u => u.category === unit.category)
    .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id));
  const rank = peers.findIndex(u => u.id === id);
  return rank >= 0 ? peers[rank + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Equipment goods (docs/plans/upstream-economy-alignment.md §4.1) — the trade
// goods a unit's block needs equipped; shortfalls demote the block to levies.
// ---------------------------------------------------------------------------

const HEAVY_RANK = 3; // from here up a category's units are armored: metal as well as arms

/** A unit's rank among its roster's same-category units, cheapest first. */
export function categoryRank(unit: UnitType, roster: ResolvedRoster): number {
  const peers = Object.values(roster.units)
    .filter(u => u.category === unit.category)
    .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id));
  return peers.findIndex(u => u.id === unit.id);
}

/** Upstream trade goods a roster unit's block needs equipped; `[]` is a levy-tier unit. */
export function getUnitRequiredGoods(unit: UnitType, roster: ResolvedRoster): string[] {
  const rank = categoryRank(unit, roster);
  switch (unit.category) {
    case "melee":
      return rank === 0 ? [] : rank >= HEAVY_RANK ? ["Arms", "Iron"] : ["Arms"];
    case "ranged":
      return rank === 0 ? [] : ["Arms"];
    case "cavalry":
      return rank >= HEAVY_RANK ? ["Horses", "Harnesses", "Arms"] : ["Horses", "Harnesses"];
    case "artillery":
      return requiredDevelopmentFor(unit, roster) >= 43 ? ["Artillery", "Gunpowder"] : ["Wood", "Ropes", "Iron"];
    case "monster":
      return ["Gemstones"];
    case "spellcaster":
      return ["Incense", "Books"];
  }
}

/** The plain levy a realm's unequipped block falls back to: its cheapest melee, else ranged, else any unit. */
export function levyUnitFor(roster: ResolvedRoster): UnitType | undefined {
  const byRank = (category: UnitCategory) =>
    Object.values(roster.units)
      .filter(u => u.category === category)
      .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id));
  return (
    byRank("melee")[0] ?? byRank("ranged")[0] ?? Object.values(roster.units).sort((a, b) => a.upkeep - b.upkeep)[0]
  );
}

/** First recruitable unit of `category` a people at `development` can field. */
export function pickRosterUnit(
  roster: ResolvedRoster,
  category: UnitCategory,
  development: number
): UnitType | undefined {
  return Object.values(roster.units)
    .filter(
      u =>
        u.category === category && roster.recruitable.includes(u.id) && development >= requiredDevelopmentFor(u, roster)
    )
    .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id))[0];
}

/** Map a retired Civ `UnitCombatClass` onto a roster unit (legacy-save migration, §13.1). */
export function matchRosterUnitByCategory(roster: ResolvedRoster, combatClass: string): UnitType | undefined {
  const table: Record<string, UnitCategory> = {
    recon: "cavalry",
    melee: "melee",
    gunpowder: "ranged",
    mounted: "cavalry",
    armor: "cavalry",
    ranged: "ranged",
    siege: "artillery",
    naval_melee: "melee",
    naval_ranged: "ranged",
    submarine: "ranged",
    fighter: "ranged",
    bomber: "artillery",
    helicopter: "cavalry",
    carrier: "artillery",
    civilian: "melee"
  };
  const category = table[combatClass];
  if (!category) return undefined;
  return Object.values(roster.units)
    .filter(u => u.category === category && roster.recruitable.includes(u.id))
    .sort((a, b) => a.upkeep - b.upkeep || a.id.localeCompare(b.id))[0];
}

// ---------------------------------------------------------------------------
// Tactical orders (§8.4) — pure in (side, types, stance); no die roll.
// ---------------------------------------------------------------------------

export function chooseOrder(
  side: ArmyBlock[],
  types: Record<string, UnitType>,
  stance: ArmyStance
): BattleTacticalOrder {
  const shares = categoryShares(toBattleUnits(side), toBattleTypes(types));
  if (stance === "encamp" || stance === "fortify") return "brace";
  if (stance === "ambush") return "skirmish";
  if (shares.cavalry > 0.4) return "charge";
  if (shares.ranged + shares.artillery + shares.spellcaster > 0.5) return "skirmish";
  if (shares.melee + shares.monster > 0.5) return "press";
  return "balanced";
}

// ---------------------------------------------------------------------------
// The bridge (§5.3) — the only place `hp` and `count` meet.
// ---------------------------------------------------------------------------

/**
 * Abstract strength of one full block inside `battle.ts`. Chosen so every
 * block has 0.1% resolution regardless of `quantity`: `applyLosses` works in
 * integer men, and with the authored `quantity` (1..240) a small block would
 * floor its losses to zero and become immortal (§5.3).
 */
export const BATTLE_STRENGTH = 1000;

/**
 * Block-vs-block bridge (§5.3). Both sides must share the scale; use this only
 * when **every** unit in the session comes from `ArmyBlock`s.
 */
export function toBattleUnits(units: ArmyBlock[]): ArmyUnit[] {
  return units
    .filter(u => u.hp > 0)
    .map(u => ({ type: u.type, count: Math.max(1, Math.round(u.hp * BATTLE_STRENGTH)), exp: u.exp }));
}

export function fromBattleUnits(units: ArmyUnit[]): ArmyBlock[] {
  return units
    .map(u => ({ type: u.type, hp: Math.min(1, Math.max(0, u.count / BATTLE_STRENGTH)), exp: u.exp }))
    .filter(u => u.hp > 0);
}

/**
 * Mixed bridge: blocks against count-based units (lair defenders, burg
 * garrisons, emergent-state hosts). Uses the unit's real `quantity`, so
 * `fill = count / men` still equals `hp`, and the counted side needs no
 * rescaling. Keep the type table unchanged when using this.
 */
export function toBattleUnitsMen(units: ArmyBlock[], types: Record<string, UnitType>): ArmyUnit[] {
  return units
    .filter(u => u.hp > 0)
    .map(u => ({
      type: u.type,
      count: Math.max(1, Math.round(u.hp * (types[u.type]?.quantity ?? 100))),
      exp: u.exp
    }));
}

export function fromBattleUnitsMen(units: ArmyUnit[], types: Record<string, UnitType>): ArmyBlock[] {
  return units
    .map(u => ({
      type: u.type,
      hp: Math.min(1, Math.max(0, u.count / (types[u.type]?.quantity ?? 100))),
      exp: u.exp
    }))
    .filter(u => u.hp > 0);
}

const scaledTypeCache = new WeakMap<Record<string, UnitType>, Record<string, UnitType>>();

/**
 * Shallow type-table copy with `men = BATTLE_STRENGTH`, for block-vs-block
 * sessions. Memoised by table identity: `Military.getUnitTypes()` returns the
 * content pack's stable object, and rebuilding 347 entries per odds query is
 * what made siege AI quadratic in earlier drafts.
 */
export function toBattleTypes(types: Record<string, UnitType>): Record<string, UnitType> {
  const cached = scaledTypeCache.get(types);
  if (cached) return cached;
  const scaled = Object.fromEntries(Object.entries(types).map(([id, t]) => [id, { ...t, men: BATTLE_STRENGTH }]));
  scaledTypeCache.set(types, scaled);
  return scaled;
}
