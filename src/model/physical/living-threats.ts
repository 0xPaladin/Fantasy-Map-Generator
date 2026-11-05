// Living World Threats Engine: manages troubles, lairs, danger markers, and emergent sovereign ascension.
import { currentContent } from "@/conquest/content/store";
import { assignStateRoster } from "@/conquest/engine/common/content";
import type { ArmyBlock, ArmyUnit, UnitType } from "@/conquest/engine/common/types";
import { assetCheckDifficulties, valueModifier } from "@/conquest/engine/game/saves";
import type { Alignment } from "@/data/culture-traits";
import { convertDangerMarkerToRuins, createLairFromMarker, isDangerMarker } from "@/data/danger-markers";
import { getLairDef, instantiateLairUnits, isLairStateCapable } from "@/data/living-lairs";
import {
  BURG_TROUBLE_IDS,
  getTroubleDef,
  isTroubleStatePromotable,
  RESOURCE_TROUBLE_IDS,
  RUIN_TROUBLE_IDS,
  TROUBLE_CATALOG,
  type TroubleDef,
  troubleUnitMatchMultiplier
} from "@/data/living-troubles";
import { Factions } from "@/model/political/factions-generator";
import { Military } from "@/model/political/military-generator";
import { Names } from "@/model/society/names-generator";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure } from "@/types/history";
import type {
  CapacityLedger,
  LivingWorldState,
  ProvinceLair,
  ProvinceSimState,
  ProvinceTrouble,
  TroubleTheme,
  TroubleUnitRole
} from "@/types/living";
import type { Burg, Province, State } from "@/types/subdivided-pack";
import { createRng, type Rng } from "@/utils/rng";
import { Chronicle } from "./history-generator";

export interface ThreatHost {
  getState(): LivingWorldState;
  pushNews(
    living: LivingWorldState,
    news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
  ): void;
  recomputeStateCapacity(stateId: number): CapacityLedger;
}

let hostRef: ThreatHost | null = null;

export function setThreatHost(host: ThreatHost): void {
  hostRef = host;
}

function getHost(): ThreatHost {
  return hostRef ?? (globalThis as unknown as { Living: ThreatHost }).Living;
}

function rngFor(tag: string, id = 0, tick = 0): Rng {
  const living = getHost().getState();
  return createRng(`${living.seed}:living:${living.tick || tick}:${tag}:${id}`);
}

/** Synchronizes `pack.markers` danger pins with `living.activeLairs` */
export function syncDangerMarkers(living: LivingWorldState): void {
  if (!pack.markers) return;
  living.activeLairs ??= {};

  for (const marker of pack.markers) {
    if (!marker || marker.hidden || !isDangerMarker(marker)) continue;
    const key = `lair:${marker.i}`;
    if (!living.activeLairs[key]) {
      const provinceId = pack.cells?.province?.[marker.cell] ?? 0;
      const lair = createLairFromMarker(marker, provinceId);
      living.activeLairs[key] = lair;
      marker.threatId = key;

      if (provinceId && living.provinces?.[provinceId] && !living.provinces[provinceId].lair) {
        living.provinces[provinceId].lair = lair;
      }
    }
  }
}

/** Spawn an active provincial trouble */
export function spawnTrouble(
  provinceId: number,
  troubleId?: string,
  theme?: TroubleTheme,
  level?: number
): ProvinceTrouble | null {
  const province = pack.provinces?.[provinceId];
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim) return null;

  const rng = rngFor("trouble:seed", provinceId);
  const selectedTheme: TroubleTheme = theme ?? (rng.next() < 0.6 ? "burg" : "ruin");

  let def: TroubleDef;
  if (troubleId && TROUBLE_CATALOG[troubleId]) {
    def = TROUBLE_CATALOG[troubleId];
  } else {
    const table =
      selectedTheme === "burg" ? BURG_TROUBLE_IDS : selectedTheme === "ruin" ? RUIN_TROUBLE_IDS : RESOURCE_TROUBLE_IDS;
    const picked = table[rng.int(0, table.length - 1)];
    def = getTroubleDef(picked ?? "monsters");
  }

  const burgsInProv = pack.burgs?.filter(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === provinceId) ?? [];
  const burg = burgsInProv.length > 0 ? burgsInProv[rng.int(0, burgsInProv.length - 1)] : undefined;
  const burgId = selectedTheme === "burg" ? burg?.i : undefined;
  const cell = burg?.cell ?? province.center ?? 0;

  const trouble: ProvinceTrouble = {
    id: def.id,
    name: def.name,
    level: level ?? Math.max(1, Math.min(10, Math.round(10 - pSim.order / 10))),
    theme: selectedTheme,
    pool: def.pool,
    save: def.save,
    requiredRole: def.requiredRole,
    cell,
    burgId,
    seasonsUnchecked: 0
  };

  pSim.trouble = trouble;
  living.activeTroubles ??= {};
  living.activeTroubles[`trouble:${provinceId}`] = trouble;

  host.pushNews(living, {
    kind: "trouble",
    text: `${trouble.name} has emerged in ${province.name}!`,
    cell,
    burgId,
    provinceId
  });

  return trouble;
}

/** Send military or specialist units to quell a provincial trouble with a domain saving throw. */
export function resolveTrouble(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim?.trouble || pSim.lair) return false;

  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return false;

  const troubleDef = getTroubleDef(pSim.trouble.id);
  const unitTypes = Military.getUnitTypes();

  let bestUnit: ArmyBlock | null = null;
  let bestReg: Regiment | null = null;
  let bestMult = 3;
  let bestDisruption = 999;

  for (const reg of state.military ?? []) {
    for (const unit of reg.units ?? []) {
      if (unit.hp <= 0) continue;
      const uType = unitTypes[unit.type];
      const role: TroubleUnitRole = uType?.troubleRole ?? "military";
      const mult = troubleUnitMatchMultiplier(troubleDef, role);
      const dis = unit.disruption ?? 0;
      if (mult < bestMult || (mult === bestMult && dis < bestDisruption)) {
        bestMult = mult;
        bestDisruption = dis;
        bestUnit = unit;
        bestReg = reg;
      }
    }
  }

  const history = Chronicle.sync();
  history.figures ??= [];
  const figures = history.figures;
  const commander = bestReg?.crew ? figures.find(f => f && f.i === bestReg?.crew && f.death === undefined) : undefined;

  const ledger = host.recomputeStateCapacity(stateId);
  const statVal = ledger[troubleDef.pool]?.gen ?? 10;
  const dc = assetCheckDifficulties[troubleDef.save];
  const mod = valueModifier(statVal);
  const rng = rngFor("trouble:resolve", provinceId);
  const roll = rng.d(20);
  const total = roll + mod;
  const success = total >= dc;

  if (bestUnit) {
    bestUnit.disruption = Math.min(100, (bestUnit.disruption ?? 0) + (success ? 10 * bestMult : 25 * bestMult));
  }

  const leaderVoice = commander ? `${commander.name} of the ${bestReg?.name ?? "Guard"}` : state.name;

  if (success) {
    quellTrouble(provinceId);
    pSim.order = Math.min(100, pSim.order + 15);
    pSim.stability += 2;
    host.pushNews(living, {
      kind: "trouble",
      text: `${leaderVoice} successfully quelled ${pSim.trouble?.name ?? "trouble"} in ${province.name}!`,
      cell: province.center,
      stateId,
      provinceId
    });
    return true;
  }

  pSim.order = Math.max(0, pSim.order - 10);
  pSim.trouble.level = Math.min(10, pSim.trouble.level + 1);

  if (roll <= 3 && pSim.order <= 20 && isTroubleStatePromotable(pSim.trouble.id)) {
    promoteTroubleToState(provinceId);
    return false;
  }

  host.pushNews(living, {
    kind: "trouble",
    text: `${leaderVoice} failed to contain ${pSim.trouble.name} in ${province.name}.`,
    cell: province.center,
    stateId,
    provinceId
  });
  return false;
}

/** Quell and clear a provincial trouble */
export function quellTrouble(provinceId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces?.[provinceId];
  if (!pSim?.trouble) return false;

  pSim.trouble = null;
  if (living.activeTroubles) {
    delete living.activeTroubles[`trouble:${provinceId}`];
  }
  return true;
}

/** Escalate a festering trouble into a physical armed lair */
export function metastasizeTroubleToLair(provinceId: number, lairId?: string): ProvinceLair | null {
  const province = pack.provinces?.[provinceId];
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim?.trouble) return null;

  const t = pSim.trouble;
  const tDef = getTroubleDef(t.id);
  const chosenLairId = lairId ?? tDef.metastasizesToLair ?? "brigand_camp";
  const cell = t.cell ?? province.center ?? 0;
  const level = Math.max(1, Math.min(10, t.level));

  quellTrouble(provinceId);
  return spawnLair(provinceId, chosenLairId, level, cell);
}

/** Spawn an armed lair within a province or wilderness */
export function spawnLair(provinceId: number, lairId?: string, level?: number, cell?: number): ProvinceLair | null {
  const province = pack.provinces?.[provinceId];
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim) return null;

  const chosenId = lairId ?? "bandit_camp";
  const def = getLairDef(chosenId);
  const resolvedCell = cell ?? province.center ?? 0;
  const lairLevel = level ?? 1;

  const unitTypes = Military.getUnitTypes();
  const defenders = instantiateLairUnits(def.defenderUnits, unitTypes);
  const raidUnits = instantiateLairUnits(def.raidUnits, unitTypes);

  const lair: ProvinceLair = {
    id: def.id,
    name: def.name,
    level: lairLevel,
    cell: resolvedCell,
    burgId: pSim.trouble?.burgId,
    provinceId,
    defenders,
    raidUnits,
    seasonsActive: 0
  };

  pSim.lair = lair;
  living.activeLairs ??= {};
  living.activeLairs[`prov_lair:${provinceId}`] = lair;

  host.pushNews(living, {
    kind: "lair",
    text: `A ${lair.name} has entrenched itself in ${province.name}!`,
    cell: resolvedCell,
    provinceId
  });

  return lair;
}

/** Assault an active lair with state military */
export function assaultLair(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  const lair = pSim?.lair;
  if (!lair) return false;

  const state = pack.states[stateId];
  if (!state?.i || state.removed) return false;

  const rng = rngFor("lair:assault", provinceId);
  const power = (state.military ?? []).reduce((acc, reg) => acc + (reg.a ?? 0), 0);
  const needed = lair.level * 150;

  if (power >= needed || rng.d(20) + Math.round(power / 50) >= 14 + lair.level) {
    clearLair(lair, state.name);
    host.pushNews(living, {
      kind: "lair",
      text: `${state.name} legions assaulted and destroyed ${lair.name} in ${province.name}!`,
      cell: lair.cell,
      stateId,
      provinceId
    });
    return true;
  }

  lair.level = Math.min(10, lair.level + 1);
  pSim.order = Math.max(0, pSim.order - 10);
  host.pushNews(living, {
    kind: "lair",
    text: `${state.name} assault on ${lair.name} was repulsed with heavy losses!`,
    cell: lair.cell,
    stateId,
    provinceId
  });
  return false;
}

/** Send guild adventurers or mercenaries to clear a lair */
export function sendAdventurersToLair(stateId: number, provinceId: number): boolean {
  return assaultLair(stateId, provinceId);
}

/** Remove an active lair marker or convert to ruins */
function removeLairMarker(markerId?: number, victorName?: string): void {
  if (markerId === undefined || !pack.markers) return;
  if (pack.history?.living?.activeLairs) delete pack.history.living.activeLairs[`lair:${markerId}`];
  const marker = pack.markers[markerId];
  if (!marker) return;
  if (isDangerMarker(marker)) {
    convertDangerMarkerToRuins(marker, victorName);
  } else {
    marker.hidden = true;
  }
}

/** Clears a defeated lair: converts marker to ruins, prunes activeLairs, updates province */
export function clearLair(lair: ProvinceLair, victorName?: string): void {
  const host = getHost();
  const living = host.getState();
  removeLairMarker(lair.markerId, victorName);

  if (living.activeLairs) {
    if (lair.markerId !== undefined) {
      delete living.activeLairs[`lair:${lair.markerId}`];
    }
    delete living.activeLairs[`prov_lair:${lair.provinceId}`];
  }

  if (lair.provinceId && living.provinces[lair.provinceId]) {
    const pSim = living.provinces[lair.provinceId]!;
    if (pSim.lair === lair || pSim.lair?.markerId === lair.markerId) {
      const nextLair = living.activeLairs
        ? Object.values(living.activeLairs).find(l => l.provinceId === lair.provinceId)
        : null;
      pSim.lair = nextLair ?? null;
    }
    pSim.order = Math.min(100, pSim.order + 15);
    pSim.stability += 2;
  }
}

/** Smite a lair directly (god mode / sandbox) */
export function smiteLair(provinceId: number): boolean {
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces?.[provinceId];
  if (!pSim?.lair) return false;
  clearLair(pSim.lair, "Divine Wrath");
  return true;
}

/** Promote a trouble directly to an emergent state */
export function promoteTroubleToState(provinceId: number, burgId?: number): number | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  const trouble = pSim?.trouble;
  if (!trouble || !isTroubleStatePromotable(trouble.id)) return null;

  const tDef = getTroubleDef(trouble.id);
  const lairId = tDef.metastasizesToLair ?? "brigand_camp";
  const lairDef = getLairDef(lairId);
  const unitTypes = Military.getUnitTypes();
  const scale = Math.max(1, Math.min(2, Math.round(trouble.level / 5)));
  const templates = lairDef.defenderUnits.map(t => ({ ...t, count: Math.max(1, Math.round(t.count * scale)) }));
  const units = instantiateLairUnits(templates, unitTypes);
  const originCell = trouble.cell || province.center || pack.states[province.state]?.center || 0;

  return spawnEmergentState({
    province,
    pSim,
    living,
    originKind: "trouble",
    originName: trouble.name,
    originCell,
    requestedBurgId: burgId ?? trouble.burgId,
    rosterId: lairDef.stateRosterId,
    stateForm: tDef.stateForm ?? lairDef.stateForm,
    alignment: lairDef.defaultAlignment,
    units
  });
}

/** Ascend an ambitious faction into an emergent sovereign state. */
export function ascendFactionToState(factionId: number, targetBurgId?: number): number | null {
  const faction = pack.factions?.[factionId];
  if (!faction || faction.removed) return null;

  const host = getHost();
  const living = host.getState();
  const targetBurg = targetBurgId
    ? pack.burgs?.[targetBurgId]
    : faction.hq.burgId
      ? pack.burgs?.[faction.hq.burgId]
      : undefined;
  const targetCell = targetBurg?.cell ?? faction.hq.cell;
  const provinceId = faction.hq.provinceId ?? pack.cells?.province?.[targetCell] ?? 0;
  const province = provinceId ? pack.provinces?.[provinceId] : undefined;
  const pSim = provinceId ? living.provinces?.[provinceId] : undefined;

  const units: ArmyUnit[] = [];
  for (const reg of faction.military ?? []) {
    for (const [uType, count] of Object.entries(reg.u ?? {})) {
      units.push({ type: uType as UnitType, count });
    }
  }
  if (units.length === 0) {
    units.push({ type: "spear", count: 60 }, { type: "archers", count: 40 });
  }

  const dummyProv = {
    i: provinceId,
    name: "Frontier",
    state: targetBurg?.state ?? 0,
    center: targetCell
  } as Province;
  const dummyPSim = { order: 50, stability: 1 } as ProvinceSimState;

  const newStateId = spawnEmergentState({
    province: province ?? dummyProv,
    pSim: pSim ?? dummyPSim,
    living,
    originKind: "faction",
    originName: faction.name,
    originCell: targetCell,
    requestedBurgId: targetBurg?.i,
    markerId: faction.hq.markerId,
    rosterId: faction.stateRosterId,
    stateForm: faction.stateForm,
    alignment: faction.alignment,
    units
  });

  if (newStateId !== null) {
    const newState = pack.states?.[newStateId];
    if (newState) {
      newState.name = faction.name;
      newState.formName = faction.stateForm;
      newState.fullName = faction.stateForm ? `${faction.stateForm} of ${newState.name}` : faction.name;
      newState.color = faction.color;
      newState.treasury = faction.treasury;
      newState.researchedTechs = [...faction.researchedTechs];
      newState.military = [...(faction.military ?? [])];

      if (faction.leaderId) {
        const sSim = living.states?.[newStateId];
        if (sSim) sSim.rulerId = faction.leaderId;
      }
    }

    faction.allegiance = "state_arm";
    faction.patronStateId = newStateId;
    faction.sovereignAmbition = false;
    faction.stateRelations[newStateId] = "Ally";
    Factions.recomputeScale(faction);

    host.pushNews(living, {
      kind: "faction",
      text: `${faction.name} has proclaimed sovereign independence, founding ${newState?.fullName ?? "a new realm"}!`,
      cell: targetCell,
      stateId: newStateId,
      burgId: targetBurg?.i
    });
  }

  return newStateId;
}

/** Ascend an eligible entrenched lair into an emergent sovereign state. */
export function ascendLairToState(provinceId: number, burgId?: number): number | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  const lair = pSim?.lair;
  if (!lair || !isLairStateCapable(lair.id)) return null;

  const lairDef = getLairDef(lair.id);
  const unitTypes = Military.getUnitTypes();
  let units = [...lair.defenders, ...lair.raidUnits].filter(u => u.count > 0).map(u => ({ ...u }));
  if (units.length === 0) {
    units = instantiateLairUnits(lairDef.defenderUnits, unitTypes);
  }
  const originCell = lair.cell || province.center || pack.states[province.state]?.center || 0;

  const stateId = spawnEmergentState({
    province,
    pSim,
    living,
    originKind: "lair",
    originName: lair.name,
    originCell,
    requestedBurgId: burgId ?? lair.burgId,
    markerId: lair.markerId,
    rosterId: lairDef.stateRosterId,
    stateForm: lairDef.stateForm,
    alignment: lairDef.defaultAlignment,
    units
  });

  if (stateId !== null) {
    const faction = pack.factions?.find(
      f => f && f.i > 0 && !f.removed && lair.markerId !== undefined && f.hq?.markerId === lair.markerId
    );
    if (faction) {
      faction.allegiance = "state_arm";
      faction.patronStateId = stateId;
      faction.sovereignAmbition = false;
      faction.stateRelations[stateId] = "Ally";
      Factions.recomputeScale(faction);
    }
  }

  return stateId;
}

/** Core emergent state engine: creates an independent state from trouble, lair or faction */
function spawnEmergentState(opts: {
  province: Province;
  pSim: ProvinceSimState;
  living: LivingWorldState;
  originKind: "trouble" | "lair" | "faction";
  originName: string;
  originCell: number;
  requestedBurgId?: number;
  markerId?: number;
  rosterId?: string;
  stateForm?: string;
  alignment?: Alignment;
  units: ArmyUnit[];
}): number | null {
  const { province, pSim, living, originKind, originName, originCell, requestedBurgId, markerId } = opts;
  const oldOwnerId = province.state ?? 0;
  const oldOwner = oldOwnerId ? pack.states[oldOwnerId] : undefined;
  const rng = rngFor(`emergent:${originKind}`, province.i, living.tick);

  const capital = resolveEmergentCapital(province, originKind, originCell, rng, requestedBurgId);
  if (!capital) return null;

  const culture =
    capital.culture ?? pack.cells.culture?.[capital.cell] ?? oldOwner?.culture ?? pack.states[1]?.culture ?? 0;
  const baseName = Names.getState(capital.name ?? Names.getCulture(culture), culture);
  const fullName = opts.stateForm ? `${opts.stateForm} of ${capital.name ?? baseName}` : baseName;

  const { content } = currentContent();
  const availableRosters = new Set(Object.keys(content.rosters));
  const resolvedRosterId =
    opts.rosterId && opts.rosterId !== "local" && availableRosters.has(opts.rosterId)
      ? opts.rosterId
      : assignStateRoster({ culture, type: "Generic" }, pack.cultures);

  const newStateId = pack.states.length;
  const relations: string[] = [];
  for (const other of pack.states) {
    if (!other) continue;
    if (!other.i || other.removed) {
      relations[other.i] = "x";
      continue;
    }
    const relation = other.i === oldOwnerId ? "Enemy" : "Neutral";
    other.diplomacy ??= [];
    other.diplomacy[newStateId] = relation;
    relations[other.i] = relation;
  }
  relations[newStateId] = "x";

  const color = emergentStateColor(opts.rosterId, opts.alignment, oldOwner?.color);
  const newState: State = {
    i: newStateId,
    name: baseName,
    formName: opts.stateForm,
    fullName,
    diplomacy: relations,
    provinces: [],
    color,
    expansionism: 0.8,
    capital: capital.i,
    type: "Generic",
    center: capital.cell,
    culture,
    rosterId: resolvedRosterId,
    military: [],
    coa: oldOwner?.coa ?? ({} as State["coa"]),
    salesTax: oldOwner?.salesTax ?? 0,
    pollTax: oldOwner?.pollTax ?? 0,
    landTax: oldOwner?.landTax ?? 0,
    tariffs: oldOwner?.tariffs ?? 0
  };

  pack.states.push(newState);

  // Transfer territory
  capital.state = newStateId;
  pack.cells.state[capital.cell] = newStateId;
  if (province.i && province.state === oldOwnerId) {
    province.state = newStateId;
    pSim.order = 60;
    pSim.stability = 3;
    for (let c = 0; c < pack.cells.i.length; c++) {
      if (pack.cells.province?.[c] === province.i) {
        pack.cells.state[c] = newStateId;
      }
    }
  }

  // Ruler setup
  const history = Chronicle.sync();
  history.figures ??= [];
  const figures = history.figures;
  const rulerIndex = figures.length;
  const rulerName = Names.getBase(culture);
  const ruler: HistoricalFigure = {
    i: rulerIndex,
    name: rulerName,
    birth: (options.map?.lore?.calendar?.year ?? 1000) - 30,
    culture,
    alignment: opts.alignment ?? "neutral",
    roles: [
      { type: "ruler", target: { kind: "state", id: newStateId }, from: options.map?.lore?.calendar?.year ?? 1000 }
    ]
  };
  figures.push(ruler);

  living.states ??= {};
  living.states[newStateId] = {
    stateId: newStateId,
    unravel: 10,
    warExhaustion: 0,
    treasury: 100,
    rulerId: rulerIndex,
    unravelHoldSeasons: 4,
    capacity: {
      m: { gen: 30, load: 15 },
      w: { gen: 30, load: 15 },
      c: { gen: 30, load: 15 },
      s: { gen: 30, load: 15 }
    }
  };

  // Convert marker if originated from lair
  if (markerId !== undefined && pack.markers?.[markerId]) {
    pack.markers[markerId].hidden = true;
  }

  pSim.trouble = null;
  pSim.lair = null;

  const host = getHost();
  host.pushNews(living, {
    kind: "emergent_state",
    text: `${originName} has declared sovereign independence as ${fullName} under ${rulerName}!`,
    cell: capital.cell,
    stateId: newStateId,
    burgId: capital.i
  });

  return newStateId;
}

function resolveEmergentCapital(
  province: Province,
  originKind: string,
  originCell: number,
  _rng: Rng,
  requestedBurgId?: number
): Burg | null {
  if (requestedBurgId && pack.burgs?.[requestedBurgId]) {
    return pack.burgs[requestedBurgId];
  }

  const localBurgs = pack.burgs?.filter(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === province.i) ?? [];

  if (originKind === "trouble" || localBurgs.length > 0) {
    const nonCap = localBurgs.find(b => !b.capital);
    return nonCap ?? localBurgs[0] ?? null;
  }

  // Wilderness lair: found a new capital settlement
  const cell = originCell || province.center || 0;
  pack.burgs ??= [{ i: 0 } as Burg];
  const burgIndex = pack.burgs.length;
  const culture = pack.cells.culture?.[cell] ?? province.culture ?? 1;
  const [x, y] = pack.cells.p?.[cell] ?? [0, 0];
  const newBurg: Burg = {
    i: burgIndex,
    name: Names.getBase(culture),
    cell,
    x,
    y,
    state: 0,
    culture,
    population: 4,
    capital: 1,
    walls: 1,
    plaza: 0,
    temple: 0,
    citadel: 1
  };
  pack.burgs.push(newBurg);
  return newBurg;
}

function emergentStateColor(rosterId?: string, alignment?: Alignment, oldColor?: string): string {
  if (rosterId === "undead" || alignment === "evil") return "#4a0404";
  if (rosterId === "greenskins") return "#2d5a27";
  if (rosterId === "elemental") return "#c2410c";
  if (rosterId === "demonic") return "#701a75";
  if (alignment === "lawful") return "#1e3a8a";
  if (alignment === "good") return "#047857";
  return oldColor ? "#d97706" : "#64748b";
}

/** Spawn a remnant rebel front when a state collapses or is annexed */
export function spawnRemnantFaction(fallenState: State, conquerorStateId?: number): Faction | null {
  if (!fallenState?.i) return null;

  const stateRelations: Record<number, "Enemy" | "Ally" | "Friendly" | "Neutral"> = {};
  if (conquerorStateId) {
    stateRelations[conquerorStateId] = "Enemy";
  }

  const remnant = Factions.add({
    name: `${fallenState.name} Restoration Front`,
    category: "political",
    type: "rebel_front",
    scale: "province",
    allegiance: "hostile",
    color: fallenState.color,
    culture: fallenState.culture,
    alignment: "chaotic",
    values: ["freedom", "justice"],
    expansionism: 1.2,
    expansionScope: "state",
    sovereignAmbition: true,
    stateForm: fallenState.formName || "Restored Republic",
    stateRosterId: fallenState.rosterId,
    hq: {
      cell: fallenState.center || 0,
      fortified: false,
      secrecy: 50,
      assets: ["safe_house", "muster_camp"]
    },
    treasury: 120,
    influence: 40,
    researchedTechs: fallenState.researchedTechs
      ? [...fallenState.researchedTechs]
      : ["pottery", "mining", "iron_working"],
    stateRelations
  });

  return remnant;
}

export const LivingThreats = {
  setHost: setThreatHost,
  syncDangerMarkers,
  spawnTrouble,
  resolveTrouble,
  quellTrouble,
  metastasizeTroubleToLair,
  spawnLair,
  assaultLair,
  sendAdventurersToLair,
  clearLair,
  smiteLair,
  promoteTroubleToState,
  ascendFactionToState,
  ascendLairToState,
  spawnRemnantFaction
};
