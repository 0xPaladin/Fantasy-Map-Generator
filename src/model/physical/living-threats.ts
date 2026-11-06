// Living World Threats Engine: manages troubles, lairs, danger markers, and emergent sovereign ascension.
import { currentContent } from "@/data/roster-store";
import { assignStateRoster, type UnitType } from "@/data/roster-content";
import type { ArmyBlock, ArmyUnit } from "@/types/battle";
import { finalizeBattle, initBattleSession, stepBattleRound } from "@/model/battle/battle";
import {
  type Alignment,
  aggressiveTraits,
  drawVice,
  rollAlignment,
  rollFigureTraits,
  traitsRng
} from "@/data/culture-traits";
import { convertDangerMarkerToRuins, createLairFromMarker, isDangerMarker } from "@/data/danger-markers";
import {
  createProvinceLair,
  getLairDef,
  instantiateLairUnits,
  isLairStateCapable,
  LAIR_NATURE_IDS,
  pickLairForTrouble
} from "@/data/living-lairs";
import {
  BURG_FACTION_IDS,
  BURG_TROUBLE_IDS,
  getTroubleDef,
  getTroubleFactionType,
  RESOURCE_FACTION_IDS,
  RESOURCE_TROUBLE_IDS,
  RUIN_FACTION_IDS,
  RUIN_TROUBLE_IDS,
  TROUBLE_CATALOG,
  TROUBLE_TO_LAIR,
  troubleUnitMatchMultiplier
} from "@/data/living-troubles";
import { getFactionArchetype } from "@/data/factions-catalog";
import { fromBattleUnitsMen, toBattleUnitsMen } from "@/model/physical/living-armies";
import { Burgs } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import { Military, type Regiment, syncRegimentTotals } from "@/model/political/military-generator";
import { Names } from "@/model/society/names-generator";
import type { Faction } from "@/types/factions";
import type { HistoricalFigure, HistoryEventType, HistRef } from "@/types/history";
import type {
  LivingWorldState,
  ProvinceLair,
  ProvinceSimState,
  ProvinceTrouble,
  TroubleTheme,
  TroubleUnitRole
} from "@/types/living";
import type { Burg, Province, State } from "@/types/subdivided-pack";
import { minmax } from "@/utils/number-utils";
import { createRng, type Rng } from "@/utils/rng";
import { Chronicle } from "./history-generator";
import { syncBurgFlagsFromBuildings } from "./living-generator";
import { valueModifier } from "@/data/saves-helpers";

export interface ThreatHost {
  getState(): LivingWorldState;
  pushNews?(
    living: LivingWorldState,
    news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
  ): void;
  pushHistory?(type: HistoryEventType, actors: HistRef[], cell: number | undefined, text: string): void;
  relieveEschaton?(living: LivingWorldState, amount?: number): void;
  addBattleMarker?(burgOrCell: Burg | number, label?: string): void;
  fieldArmy?(state: State): Regiment | null;
  applyArmySurvivors?(state: State, regiment: Regiment, units: ArmyUnit[]): void;
  provinceCells?(provinceId: number): number[];
  recordGrudge?(stateId: number, burg: Burg, kind: string, reason: string, otherId?: number): void;
  findFigure?(figureId: number): HistoricalFigure | undefined;
  rng?(tag: string, id?: number, tick?: number): Rng;
  emergentTerritoryCells?(province: Province, capital: Burg, oldOwnerId: number): number[];
  transferCells?(stateId: number, cells: number[]): void;
  assignProvince?(stateId: number, cells: number[]): void;
  syncBurgs?(living: LivingWorldState): void;
  syncProvinces?(living: LivingWorldState): void;
  syncStates?(living: LivingWorldState): void;
  createRegiment?(state: State): Regiment;
  moveArmy?(regiment: Regiment, burg: Burg): void;
  ensureCommanders?(): void;
  recordClaim?(stateId: number, burg: Burg, heldByStateId: number): void;
  burgHinterland?(burg: Burg): number[];
}

let hostRef: ThreatHost | null = null;

export function setThreatHost(host: ThreatHost): void {
  hostRef = host;
}

function getHost(): ThreatHost {
  return hostRef ?? (globalThis as unknown as { Living: ThreatHost }).Living;
}

function getRng(tag: string, id = 0, salt = 0): Rng {
  const host = getHost();
  if (typeof host?.rng === "function") {
    return host.rng(tag, id, salt);
  }
  const living = host?.getState
    ? host.getState()
    : (globalThis as unknown as { Living?: { getState(): LivingWorldState } }).Living?.getState?.();
  const seed = living?.seed ?? "threats-seed";
  const tick = living?.tick ?? 1;
  return createRng(`${seed}:living:${tick}:${tag}:${id}`);
}

function pushNews(
  living: LivingWorldState,
  news: { kind: string; text: string; cell?: number; burgId?: number; stateId?: number; provinceId?: number }
): void {
  const host = getHost();
  if (typeof host?.pushNews === "function") {
    host.pushNews(living, news);
  }
}

function pushHistory(type: HistoryEventType, actors: HistRef[], cell: number | undefined, text: string): void {
  const host = getHost();
  if (typeof host?.pushHistory === "function") {
    host.pushHistory(type, actors, cell, text);
    return;
  }
  const history = Chronicle.sync();
  history.events ??= [];
  history.events.push({
    i: history.events.length,
    year: options?.map?.lore?.calendar?.year ?? 1000,
    type,
    actors,
    loc: cell,
    text
  });
}

function relieveEschaton(living: LivingWorldState, amount?: number): void {
  const host = getHost();
  if (typeof host?.relieveEschaton === "function") {
    host.relieveEschaton(living, amount);
  }
}

function addBattleMarker(burgOrCell: Burg | number, label?: string): void {
  const host = getHost();
  if (typeof host?.addBattleMarker === "function") {
    host.addBattleMarker(burgOrCell, label);
  }
}

function fieldArmy(state: State): Regiment | null {
  const host = getHost();
  if (typeof host?.fieldArmy === "function") {
    return host.fieldArmy(state);
  }
  return null;
}

function applyArmySurvivors(state: State, regiment: Regiment, units: ArmyUnit[]): void {
  const host = getHost();
  if (typeof host?.applyArmySurvivors === "function") {
    host.applyArmySurvivors(state, regiment, units);
  }
}

function getProvinceCells(provinceId: number): number[] {
  const host = getHost();
  if (typeof host?.provinceCells === "function") {
    return host.provinceCells(provinceId);
  }
  const cells: number[] = [];
  const provinces = pack.cells?.province;
  if (!provinces) return cells;
  for (let cell = 0; cell < provinces.length; cell++) {
    if (provinces[cell] === provinceId) cells.push(cell);
  }
  return cells;
}

function recordGrudge(stateId: number, burg: Burg, kind: string, reason: string, otherId?: number): void {
  const host = getHost();
  if (typeof host?.recordGrudge === "function") {
    host.recordGrudge(stateId, burg, kind, reason, otherId);
  }
}

function _findFigure(figureId: number): HistoricalFigure | undefined {
  const host = getHost();
  if (typeof host?.findFigure === "function") {
    return host.findFigure(figureId);
  }
  return Chronicle.sync()?.figures?.find?.(f => f.i === figureId);
}

function emergentTerritoryCells(province: Province, capital: Burg, oldOwnerId: number): number[] {
  const host = getHost();
  if (typeof host?.emergentTerritoryCells === "function") {
    return host.emergentTerritoryCells(province, capital, oldOwnerId);
  }
  const hinterland = typeof host?.burgHinterland === "function" ? host.burgHinterland(capital) : [];
  const cells = new Set<number>(hinterland);
  cells.add(capital.cell);

  const stateCenters = new Set<number>();
  const stateCapitalCells = new Set<number>();
  for (const s of pack.states ?? []) {
    if (!s?.i || s.removed) continue;
    if (s.center !== undefined) stateCenters.add(s.center);
    if (s.capital && pack.burgs[s.capital]) stateCapitalCells.add(pack.burgs[s.capital].cell);
  }

  for (const c of getProvinceCells(province.i)) {
    if (c === capital.cell) continue;
    if (stateCenters.has(c) || stateCapitalCells.has(c)) continue;
    const cellBurgId = pack.cells.burg?.[c];
    if (cellBurgId && pack.burgs[cellBurgId]?.capital) continue;
    if (!oldOwnerId || pack.cells.state?.[c] === oldOwnerId || pack.cells.state?.[c] === 0) {
      cells.add(c);
    }
  }
  return Array.from(cells);
}

function transferCells(stateId: number, cells: number[]): void {
  const host = getHost();
  if (typeof host?.transferCells === "function") {
    host.transferCells(stateId, cells);
    return;
  }
  for (const c of cells) {
    if (pack.cells.state) pack.cells.state[c] = stateId;
  }
}

function assignProvince(stateId: number, cells: number[]): void {
  const host = getHost();
  if (typeof host?.assignProvince === "function") {
    host.assignProvince(stateId, cells);
  }
}

function syncBurgs(living: LivingWorldState): void {
  const host = getHost();
  if (typeof host?.syncBurgs === "function") {
    host.syncBurgs(living);
  }
}

function syncProvinces(living: LivingWorldState): void {
  const host = getHost();
  if (typeof host?.syncProvinces === "function") {
    host.syncProvinces(living);
  }
}

function syncStates(living: LivingWorldState): void {
  const host = getHost();
  if (typeof host?.syncStates === "function") {
    host.syncStates(living);
  }
}

function createRegiment(state: State): Regiment {
  const host = getHost();
  if (typeof host?.createRegiment === "function") {
    return host.createRegiment(state);
  }
  const reg: Regiment = {
    i: (state.military ?? []).length,
    n: (state.military ?? []).length + 1,
    name: `1st Host of ${state.name}`,
    state: state.i,
    cell: state.center ?? 0,
    a: 0,
    u: {},
    units: [],
    crew: []
  };
  state.military = [...(state.military ?? []), reg];
  return reg;
}

function moveArmy(regiment: Regiment, burg: Burg): void {
  const host = getHost();
  if (typeof host?.moveArmy === "function") {
    host.moveArmy(regiment, burg);
    return;
  }
  regiment.cell = burg.cell;
  regiment.x = burg.x;
  regiment.y = burg.y;
}

function ensureCommanders(): void {
  const host = getHost();
  if (typeof host?.ensureCommanders === "function") {
    host.ensureCommanders();
  }
}

function recordClaim(stateId: number, burg: Burg, targetStateId: number): void {
  const host = getHost();
  if (typeof host?.recordClaim === "function") {
    host.recordClaim(stateId, burg, targetStateId);
  }
}

export function syncDangerMarkers(living: LivingWorldState): void {
  living.activeLairs ??= {};
  living.activeTroubles ??= {};

  const activeMarkerIds = new Set<number>();

  for (const marker of pack.markers ?? []) {
    if (marker.hidden || !isDangerMarker(marker)) {
      if (marker.threatId && living.activeLairs[marker.threatId]) {
        delete living.activeLairs[marker.threatId];
        delete marker.threatId;
      }
      continue;
    }

    activeMarkerIds.add(marker.i);
    const key = `lair:${marker.i}`;
    marker.threatId = key;

    let lair = living.activeLairs[key];
    if (!lair) {
      lair = createLairFromMarker(marker, Military.getUnitTypes());
      living.activeLairs[key] = lair;
    } else {
      lair.markerId = marker.i;
      lair.name = marker.name;
      lair.cell = marker.cell;
      lair.provinceId = pack.cells?.province?.[marker.cell] ?? 0;
    }

    if (lair.provinceId && living.provinces[lair.provinceId]) {
      const pSim = living.provinces[lair.provinceId]!;
      if (!pSim.lair || pSim.lair.level < lair.level) {
        pSim.lair = lair;
      }
    }
  }

  for (const [key, lair] of Object.entries(living.activeLairs)) {
    if (lair.markerId !== undefined && !activeMarkerIds.has(lair.markerId)) {
      delete living.activeLairs[key];
      if (lair.provinceId && living.provinces[lair.provinceId]?.lair?.markerId === lair.markerId) {
        living.provinces[lair.provinceId]!.lair = null;
      }
    }
  }
}

export function registerActiveLair(lair: ProvinceLair, markerId: number, provinceId: number): void {
  const living = getHost().getState();
  living.activeLairs ??= {};
  const key = `lair:${markerId}`;
  lair.markerId = markerId;
  lair.provinceId = provinceId;
  living.activeLairs[key] = lair;
  const marker = pack.markers?.[markerId];
  if (marker) marker.threatId = key;
}

export function addLairMarker(lair: ProvinceLair, cell: number): number {
  pack.markers ??= [];
  const markers = pack.markers;
  const [x, y] = pack.cells.p[cell] ?? [0, 0];
  const markerIndex = markers.length;
  const def = getLairDef(lair.id);
  markers.push({
    i: markerIndex,
    type: "dungeon",
    icon: def.markerIcon || "☠️",
    x,
    y,
    cell,
    name: `${lair.name} (Lair Lvl ${lair.level})`
  });
  return markerIndex;
}

export function removeLairMarker(markerId?: number, victorName?: string): void {
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

export function spawnTrouble(
  provinceId: number,
  troubleId?: string,
  theme?: TroubleTheme,
  level?: number
): ProvinceTrouble | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return null;

  const rng = getRng("trouble:spawn", provinceId, living.tick);

  let finalTheme = theme;
  if (!finalTheme) {
    const provCells = getProvinceCells(provinceId);
    const hasBurg = pack.burgs.some(b => b?.i && !b.removed && pack.cells.province?.[b.cell] === provinceId);
    const hasRuin = (pack.markers ?? []).some(
      m =>
        !m.hidden &&
        m.cell &&
        provCells.includes(m.cell) &&
        ["ruins", "cave", "dungeon", "battlefields", "volcano"].includes(m.type)
    );
    const hasResource = provCells.some(c => Boolean(pack.cells.good?.[c]));

    const candidates: TroubleTheme[] = [];
    if (hasBurg) candidates.push("burg", "burg");
    if (hasRuin) candidates.push("ruin", "ruin");
    if (hasResource) candidates.push("resource", "resource");
    if (candidates.length === 0) candidates.push("burg");
    finalTheme = rng.choice(candidates) ?? "burg";
  }

  // Spawn split: hazard trouble stays a provincial affliction; organizational
  // trouble takes root as a dangerous faction instead. An explicit ID is
  // honored: catalog IDs are hazards, anything else is a faction.
  const spawnFaction = troubleId
    ? !TROUBLE_CATALOG[troubleId]
    : rng.next() < (finalTheme === "ruin" ? 0.6 : finalTheme === "burg" ? 0.55 : 0.4);
  if (spawnFaction) {
    spawnDangerousFaction(provinceId, troubleId, finalTheme, level);
    return null;
  }

  let finalTroubleId = troubleId;
  if (!finalTroubleId) {
    const table =
      finalTheme === "burg" ? BURG_TROUBLE_IDS : finalTheme === "ruin" ? RUIN_TROUBLE_IDS : RESOURCE_TROUBLE_IDS;
    finalTroubleId = rng.choice(table) ?? "flooding";
  }

  const finalLevel = minmax(level ?? rng.d(4) + 1, 1, 10);
  const tDef = getTroubleDef(finalTroubleId);
  const cell = province.center ?? pack.states[province.state]?.center ?? 0;
  pSim.trouble = {
    id: finalTroubleId,
    name: tDef.name,
    theme: finalTheme,
    pool: tDef.pool,
    save: tDef.save,
    requiredRole: tDef.requiredRole,
    level: finalLevel,
    seasonsUnchecked: 0,
    cell
  };

  // Phase E: mint the civic response as a burg production action — the
  // province's major burg works the trouble off like any building asset.
  const major = pack.burgs.find(
    b => b?.i && !b.removed && b.state === province.state && pack.cells.province?.[b.cell] === provinceId && b.capital
  ) ?? pack.burgs.find(b => b?.i && !b.removed && b.state === province.state && pack.cells.province?.[b.cell] === provinceId);
  if (major) {
    const bSim = living.burgs[major.i];
    if (bSim) {
      bSim.productionQueue ??= [];
      if (!bSim.productionQueue.some(item => item.kind === "trouble" && item.id === finalTroubleId)) {
        bSim.productionQueue.push({ kind: "trouble", id: finalTroubleId });
      }
    }
  }

  pushNews(living, {
    kind: "trouble",
    text: `${tDef.name} arose in ${province.name}! (${finalTheme} trouble, level ${finalLevel})`,
    cell,
    stateId: province.state
  });

  return pSim.trouble ?? null;
}

/**
 * Spawn a dangerous faction from the trouble trigger: an organizational
 * trouble that took root as a first-class entry in `pack.factions` instead of
 * a provincial affliction. HQ anchors at the province's capital burg, then any
 * burg, then a danger marker, then a wilderness cell; military comes from the
 * matched lair template scaled by level.
 */
export function spawnDangerousFaction(
  provinceId: number,
  troubleId?: string,
  theme?: TroubleTheme,
  level?: number
): Faction | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return null;

  const rng = getRng("trouble:spawn-faction", provinceId, living.tick);
  const finalTheme = theme ?? (rng.next() > 0.5 ? "burg" : "ruin");

  let factionType: string;
  if (troubleId) {
    factionType = getTroubleFactionType(troubleId);
  } else {
    const table =
      finalTheme === "burg"
        ? BURG_FACTION_IDS
        : finalTheme === "ruin"
          ? RUIN_FACTION_IDS
          : RESOURCE_FACTION_IDS;
    factionType = rng.choice(table) ?? "brigand_raiders";
  }
  const arch = getFactionArchetype(factionType);
  if (!arch) return null;

  const finalLevel = minmax(level ?? rng.d(4) + 1, 1, 10);
  const lairDef = getLairDef(TROUBLE_TO_LAIR[factionType] ?? TROUBLE_TO_LAIR[troubleId ?? ""] ?? "aspiring_warlord");
  const scale = Math.max(1, Math.min(2, Math.round(finalLevel / 5)));
  const templates = lairDef.defenderUnits.map(t => ({ ...t, count: Math.max(1, Math.round(t.count * scale)) }));
  const unitTypes = Military.getUnitTypes();
  const armyUnits = instantiateLairUnits(templates, unitTypes);
  const u: Record<string, number> = {};
  for (const unit of armyUnits) u[unit.type] = (u[unit.type] ?? 0) + unit.count;

  // HQ: capital burg, then any burg in the province, then a danger marker, then wilderness.
  const major =
    pack.burgs.find(
      b =>
        b?.i && !b.removed && b.state === province.state && pack.cells.province?.[b.cell] === provinceId && b.capital
    ) ??
    pack.burgs.find(
      b => b?.i && !b.removed && b.state === province.state && pack.cells.province?.[b.cell] === provinceId
    );
  const marker = (pack.markers ?? []).find(
    m => !m.hidden && m.cell && pack.cells.province?.[m.cell] === provinceId && isDangerMarker(m.type)
  );
  const cell = major?.cell ?? marker?.cell ?? province.center ?? pack.states[province.state]?.center ?? 0;
  const [x, y] = pack.cells.p?.[cell] ?? [0, 0];

  const culture = pack.cells.culture?.[cell] ?? pack.states[province.state]?.culture ?? 1;
  const year = options?.map?.lore?.calendar?.year ?? 1000;
  const researchQueue = arch.desiredTechs.filter(t => t !== "pottery" && t !== "mining");

  const faction = Factions.add({
    name: arch.name,
    category: arch.category,
    type: arch.type,
    allegiance: arch.defaultAllegiance,
    color: undefined,
    icon: arch.markerIcon,
    culture,
    foundedYear: year,
    alignment: arch.defaultAlignment,
    values: [...arch.defaultValues],
    expansionism: 1.0,
    expansionScope: arch.defaultExpansionScope,
    sovereignAmbition: arch.sovereignAmbition,
    stateForm: arch.stateForm,
    stateRosterId: arch.stateRosterId,
    hq: {
      cell,
      burgId: major?.i,
      markerId: marker?.i,
      provinceId,
      maritime: lairDef.maritime,
      fortified: lairDef.fortified,
      secrecy: arch.defaultAllegiance === "clandestine" ? 50 : 0,
      assets: []
    },
    outposts: [],
    currentTechId: researchQueue[0] ?? null,
    researchQueue,
    researchedTechs: ["pottery", "mining"],
    treasury: 150,
    influence: 30,
    military: [
      {
        i: 1,
        name: `${arch.name} Garrison`,
        a: armyUnits.reduce((sum, unit) => sum + unit.count, 0),
        cell,
        x,
        y,
        bx: x,
        by: y,
        u,
        n: lairDef.maritime ? 1 : 0,
        state: 0,
        icon: arch.markerIcon
      }
    ],
    raidThreshold: lairDef.raidThreshold,
    stateRelations: province.state ? { [province.state]: "Enemy" } : {},
    factionRelations: {},
    seasonsActive: 0
  });

  pushNews(living, {
    kind: "faction",
    text: `${faction.name} has taken root in ${province.name}! (${finalTheme} threat, level ${finalLevel})`,
    cell,
    stateId: province.state,
    burgId: major?.i
  });
  host.pushHistory?.(
    "deed",
    [{ kind: "state", id: province.state ?? 0 }],
    cell,
    `${faction.name} arose in ${province.name}.`
  );

  return faction;
}

/**
 * One-time save migration (faction-trouble conversion Phase 1): legacy
 * organizational troubles and lairs become dangerous factions. Hazards pass
 * through untouched. Idempotent: converted fields are cleared.
 */
export function migrateLegacyThreats(living: LivingWorldState): void {
  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed) continue;
    const pSim = living.provinces[province.i];
    if (!pSim) continue;

    if (pSim.trouble && !TROUBLE_CATALOG[pSim.trouble.id]) {
      const trouble = pSim.trouble;
      pSim.trouble = null;
      spawnDangerousFaction(province.i, trouble.id, trouble.theme, trouble.level);
    }
    if (pSim.lair) {
      const lair = pSim.lair;
      pSim.lair = null;
      spawnDangerousFaction(province.i, lair.id, lair.theme, lair.level);
    }
  }
  if (living.activeLairs) {
    const lairs = Object.values(living.activeLairs);
    living.activeLairs = {};
    for (const lair of lairs) {
      if (lair.provinceId) spawnDangerousFaction(lair.provinceId, lair.id, lair.theme, lair.level);
    }
  }
}

export function quellTrouble(provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim?.trouble) return false;

  pSim.trouble = null;
  if (province.state && living.states[province.state]) {
  }
  pushNews(living, {
    kind: "trouble",
    text: `Trouble in ${province.name} was quelled.`,
    cell: province.center ?? 0,
    stateId: province.state
  });
  return true;
}

/** Hostile/clandestine faction with an HQ in a province, by military weight. */
function factionThreatInProvince(provinceId: number): Faction | null {
  const candidates = Factions.active().filter(faction => {
    if (faction.allegiance !== "hostile" && faction.allegiance !== "clandestine") return false;
    const provId =
      faction.hq.provinceId ??
      (faction.hq.burgId ? pack.cells.province?.[pack.burgs?.[faction.hq.burgId]?.cell ?? 0] : undefined) ??
      pack.cells?.province?.[faction.hq.cell];
    return provId === provinceId;
  });
  candidates.sort((a, b) => {
    const men = (f: Faction) => (f.military ?? []).reduce((s, r) => s + (r.units?.reduce((t, u) => t + (u.hp ?? 0), 0) ?? 0), 0);
    return men(b) - men(a);
  });
  return candidates[0] ?? null;
}

export function assaultFaction(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return false;

  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return false;

  const faction = factionThreatInProvince(provinceId);
  if (!faction) return false;

  const army = fieldArmy(state);
  if (!army) return false;

  const { config } = currentContent();
  const unitTypes = Military.getUnitTypes();
  const attackerUnits = toBattleUnitsMen(army.units ?? [], unitTypes);
  const factionReg = faction.military?.[0];
  const defenderUnits = toBattleUnitsMen((factionReg?.units ?? []).filter(u => u.hp > 0), unitTypes);

  if (attackerUnits.length === 0 || defenderUnits.length === 0) return false;

  const cell = faction.hq.cell;
  const session = initBattleSession({
    config,
    unitTypes,
    attacker: { factionId: stateId, armyId: null, units: attackerUnits },
    defender: { factionId: 0, armyId: null, units: defenderUnits },
    cell,
    regionId: provinceId,
    assault: faction.hq.fortified,
    modifiers: {
      walls: faction.hq.fortified ? 1 : 0,
      defenderEncamped: faction.hq.fortified,
      defenderAmbushed: false,
      attackerCrossedRiver: false,
      labels: [faction.hq.fortified ? `${faction.name} (fortified walls)` : faction.name]
    }
  });

  const rng = getRng("faction:assault", stateId * 1000 + provinceId, living.tick);
  while (session.status === "active" && session.round < config.battle.maxRounds) {
    stepBattleRound(session, rng.next);
  }
  const outcome = finalizeBattle(session, rng.next);

  applyArmySurvivors(state, army, outcome.attacker.units);
  addBattleMarker(cell, faction.name);

  const destroyFaction = () => {
    if (faction.hq.markerId !== undefined) convertDangerMarkerToRuins(faction.hq.markerId, state.name);
    Factions.remove(faction.i);
  };

  if (outcome.winner === "attacker") {
    const factionName = faction.name;
    destroyFaction();
    sSim.warExhaustion = Math.max(0, sSim.warExhaustion - 2);
    relieveEschaton(living);

    pushNews(living, {
      kind: "faction",
      text: `${state.name}'s army conquered and destroyed ${factionName} in ${province.name}!`,
      cell,
      stateId
    });
    pushHistory(
      "conquest",
      [{ kind: "state", id: stateId }],
      cell,
      `${state.name}'s legions conquered and dismantled ${factionName} in ${province.name}.`
    );
    return true;
  }

  // Heavy losses without a clean win still gut the faction's forces
  if (factionReg) {
    factionReg.units = fromBattleUnitsMen(outcome.defender.units, unitTypes);
    syncRegimentTotals(factionReg, unitTypes);
  }
  if (factionReg && factionReg.a <= 0) {
    const factionName = faction.name;
    destroyFaction();
    pushNews(living, {
      kind: "faction",
      text: `${state.name}'s army destroyed ${factionName} in ${province.name} at immense cost!`,
      cell,
      stateId
    });
    return true;
  }

  for (const u of army.units ?? []) {
    u.disruption = Math.min(3, (u.disruption ?? 0) + 1);
  }
  sSim.warExhaustion = Math.min(100, sSim.warExhaustion + 4);

  pushNews(living, {
    kind: "faction",
    text: `${state.name}'s assault on ${faction.name} was repulsed with heavy losses!`,
    cell,
    stateId
  });
  pushHistory(
    "battle",
    [{ kind: "state", id: stateId }],
    cell,
    `${state.name}'s expedition against ${faction.name} was repulsed.`
  );
  return false;
}

export function sendAdventurersToFaction(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return false;

  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return false;

  const faction = factionThreatInProvince(provinceId);
  if (!faction) return false;

  const history = Chronicle.sync();
  history.figures ??= [];

  let adventurer = history.figures.find(
    f => !f.death && f.roles.some(r => r.type === "adventurer" && r.target.kind === "state" && r.target.id === stateId)
  );

  const year = options.map?.lore?.calendar?.year ?? 1000;
  if (!adventurer) {
    const culture = state.culture ?? 0;
    const index = history.figures.length;
    const rng = traitsRng(living.seed, "adventurer", index + state.i * 500);
    const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    adventurer = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(22, 40),
      roles: [{ type: "adventurer", target: { kind: "state", id: state.i }, from: year }],
      alignment,
      virtues,
      vices
    };
    history.figures.push(adventurer);
  }

  const factionReg = faction.military?.[0];
  const unitTypes = Military.getUnitTypes();
  const traitBonus = (adventurer.virtues?.length ?? 0) - (adventurer.vices?.length ?? 0);
  const rng = getRng("adventurer:delve", stateId * 500 + provinceId, living.tick);
  const roll = rng.d(20);
  const domainMod = valueModifier(living.states[stateId]?.yieldsPerTurn?.gold ?? 0);
  const total = roll + domainMod + traitBonus;
  const dc = 14 + Math.ceil((factionReg?.a ?? 100) / 100);

  if (total >= dc) {
    if (faction.hq.markerId !== undefined) convertDangerMarkerToRuins(faction.hq.markerId, state.name);
    const factionName = faction.name;
    Factions.remove(faction.i);
    pSim.order = Math.min(100, pSim.order + 12);
    pSim.stability += 1;
    relieveEschaton(living);

    pushNews(living, {
      kind: "faction",
      text: `${adventurer.name} and their adventuring band purged ${factionName} in ${province.name}!`,
      cell: faction.hq.cell,
      stateId
    });
    pushHistory(
      "conquest",
      [
        { kind: "figure", id: adventurer.i },
        { kind: "state", id: stateId }
      ],
      faction.hq.cell,
      `${adventurer.name} and their adventuring band slew the master of ${factionName} in ${province.name}.`
    );
    return true;
  }

  if (total >= dc - 3) {
    const cut = factionReg?.units ?? [];
    for (const u of cut) {
      u.hp = Math.max(0.1, u.hp * (0.5 + rng.next() * 0.25));
    }
    if (factionReg) syncRegimentTotals(factionReg, unitTypes);

    pushNews(living, {
      kind: "faction",
      text: `${adventurer.name}'s band struck deep into ${faction.name}, culling defenders before withdrawing.`,
      cell: faction.hq.cell,
      stateId
    });
    return false;
  }

  if (rng.d(2) === 1) {
    adventurer.death = year;
    for (const role of adventurer.roles) {
      if (role.type === "adventurer" && role.to === undefined) role.to = year;
    }
  }
  faction.raidPending = true;

  pushNews(living, {
    kind: "faction",
    text: `${adventurer.name}'s delve into ${faction.name} failed disastrously!`,
    cell: faction.hq.cell,
    stateId
  });
  return false;
}

export function assaultLair(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim?.lair) return false;

  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return false;

  const army = fieldArmy(state);
  if (!army) return false;

  const lair = pSim.lair;
  const { config } = currentContent();
  const attackerUnits = toBattleUnitsMen(army.units ?? [], Military.getUnitTypes());
  const defenderUnits = lair.defenders.filter(u => u.count > 0).map(u => ({ ...u }));

  if (attackerUnits.length === 0) return false;

  const session = initBattleSession({
    config,
    unitTypes: Military.getUnitTypes(),
    attacker: { factionId: stateId, armyId: null, units: attackerUnits },
    defender: { factionId: 0, armyId: null, units: defenderUnits },
    cell: lair.cell,
    regionId: provinceId,
    assault: lair.fortified,
    modifiers: {
      walls: lair.fortified ? 1 : 0,
      defenderEncamped: lair.fortified,
      defenderAmbushed: false,
      attackerCrossedRiver: false,
      labels: [lair.fortified ? `${lair.name} (fortified walls)` : lair.name]
    }
  });

  const rng = getRng("lair:assault", stateId * 1000 + provinceId, living.tick);
  while (session.status === "active" && session.round < config.battle.maxRounds) {
    stepBattleRound(session, rng.next);
  }
  const outcome = finalizeBattle(session, rng.next);

  applyArmySurvivors(state, army, outcome.attacker.units);
  addBattleMarker(lair.cell, lair.name);

  if (outcome.winner === "attacker") {
    const lairName = lair.name;
    clearLair(lair, state.name);
    sSim.warExhaustion = Math.max(0, sSim.warExhaustion - 2);
    relieveEschaton(living);

    pushNews(living, {
      kind: "lair",
      text: `${state.name}'s army conquered and destroyed ${lairName} in ${province.name}!`,
      cell: lair.cell,
      stateId
    });
    pushHistory(
      "conquest",
      [{ kind: "state", id: stateId }],
      lair.cell,
      `${state.name}'s legions conquered and dismantled the ${lairName} in ${province.name}.`
    );
    return true;
  }

  lair.defenders = outcome.defender.units.filter(u => u.count > 0).map(u => ({ ...u }));
  if (lair.defenders.length === 0) {
    const lairName = lair.name;
    clearLair(lair, state.name);
    pushNews(living, {
      kind: "lair",
      text: `${state.name}'s army destroyed ${lairName} in ${province.name} at immense cost!`,
      cell: lair.cell,
      stateId
    });
    return true;
  }

  for (const u of army.units ?? []) {
    u.disruption = Math.min(3, (u.disruption ?? 0) + 1);
  }
  sSim.warExhaustion = Math.min(100, sSim.warExhaustion + 4);

  pushNews(living, {
    kind: "lair",
    text: `${state.name}'s assault on ${lair.name} was repulsed with heavy losses!`,
    cell: lair.cell,
    stateId
  });
  pushHistory(
    "battle",
    [{ kind: "state", id: stateId }],
    lair.cell,
    `${state.name}'s expedition against ${lair.name} was repulsed.`
  );
  return false;
}

export function sendAdventurersToLair(stateId: number, provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed || province.state !== stateId) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim?.lair) return false;

  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return false;

  const lair = pSim.lair;
  const history = Chronicle.sync();
  history.figures ??= [];

  let adventurer = history.figures.find(
    f => !f.death && f.roles.some(r => r.type === "adventurer" && r.target.kind === "state" && r.target.id === stateId)
  );

  const year = options.map?.lore?.calendar?.year ?? 1000;
  if (!adventurer) {
    const culture = state.culture ?? 0;
    const index = history.figures.length;
    const rng = traitsRng(living.seed, "adventurer", index + state.i * 500);
    const alignment = rollAlignment(rng, pack.cultures[culture]?.alignment);
    const { virtues, vices } = rollFigureTraits(rng, alignment);
    adventurer = {
      i: index,
      name: Names.getCulture(culture),
      culture,
      birth: year - rng.int(22, 40),
      roles: [{ type: "adventurer", target: { kind: "state", id: state.i }, from: year }],
      alignment,
      virtues,
      vices
    };
    history.figures.push(adventurer);
  }

  const traitBonus = (adventurer.virtues?.length ?? 0) - (adventurer.vices?.length ?? 0);
  const rng = getRng("adventurer:delve", stateId * 500 + provinceId, living.tick);
  const roll = rng.d(20);
  const domainMod = valueModifier(living.states[stateId]?.yieldsPerTurn?.gold ?? 0);
  const total = roll + domainMod + traitBonus;
  const dc = 14 + lair.level;

  if (total >= dc) {
    removeLairMarker(lair.markerId);
    const lairName = lair.name;
    pSim.lair = null;
    pSim.order = Math.min(100, pSim.order + 12);
    pSim.stability += 1;
    relieveEschaton(living);

    pushNews(living, {
      kind: "lair",
      text: `${adventurer.name} and their adventuring band purged ${lairName} in ${province.name}!`,
      cell: lair.cell,
      stateId
    });
    pushHistory(
      "conquest",
      [
        { kind: "figure", id: adventurer.i },
        { kind: "state", id: stateId }
      ],
      lair.cell,
      `${adventurer.name} and their adventuring band slew the master of ${lairName} in ${province.name}.`
    );
    return true;
  }

  if (total >= dc - 3) {
    for (const u of lair.defenders) {
      u.count = Math.max(1, Math.round(u.count * (0.5 + rng.next() * 0.25)));
    }
    lair.level = Math.max(4, lair.level - 1);

    pushNews(living, {
      kind: "lair",
      text: `${adventurer.name}'s band struck deep into ${lair.name}, culling defenders before withdrawing (reduced to level ${lair.level}).`,
      cell: lair.cell,
      stateId
    });
    return false;
  }

  if (rng.d(2) === 1) {
    adventurer.death = year;
    for (const role of adventurer.roles) {
      if (role.type === "adventurer" && role.to === undefined) role.to = year;
    }
  }
  lair.raidPending = true;

  pushNews(living, {
    kind: "lair",
    text: `${adventurer.name}'s delve into ${lair.name} failed disastrously!`,
    cell: lair.cell,
    stateId
  });
  return false;
}

export function metastasizeTroubleToLair(provinceId: number, lairId?: string): ProvinceLair | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return null;
  if (!pSim.trouble && !lairId) return null;

  const trouble = pSim.trouble;
  const rng = getRng("lair:metastasize", provinceId, living.tick);
  const chosenLairId = lairId ?? (trouble ? pickLairForTrouble(trouble.id, rng) : LAIR_NATURE_IDS[0]!);
  const originCell = trouble?.cell ?? province.center ?? pack.states[province.state]?.center ?? 0;
  const level = Math.max(3, Math.ceil((trouble?.level ?? 3) / 2));
  const theme = trouble?.theme ?? "ruin";

  const lair = createProvinceLair(chosenLairId, originCell, level, theme, trouble?.burgId, Military.getUnitTypes());
  const markerId = addLairMarker(lair, originCell);
  registerActiveLair(lair, markerId, provinceId);

  pSim.lair = lair;
  pSim.trouble = null;

  const lairDef = getLairDef(chosenLairId);
  pushNews(living, {
    kind: "lair",
    text: `Unchecked trouble in ${province.name} has festered into a ${lairDef.name}!`,
    cell: originCell,
    stateId: province.state
  });
  pushHistory(
    "collapse",
    [{ kind: "state", id: province.state }],
    originCell,
    `A ${lairDef.name} took root in ${province.name}, defying lawful authority.`
  );

  return lair;
}

export function spawnLair(provinceId: number, lairId?: string, level?: number, cell?: number): ProvinceLair | null {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return null;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim) return null;

  const rng = getRng("lair:spawn", provinceId, living.tick);
  const chosenLairId = lairId ?? rng.choice(LAIR_NATURE_IDS) ?? "ancient_evil";
  const originCell = cell ?? province.center ?? pack.states[province.state]?.center ?? 0;
  const finalLevel = minmax(level ?? 4 + rng.d(4), 4, 10);

  const lair = createProvinceLair(chosenLairId, originCell, finalLevel, "ruin", undefined, Military.getUnitTypes());
  const markerId = addLairMarker(lair, originCell);
  registerActiveLair(lair, markerId, provinceId);

  if (pSim.lair) {
    removeLairMarker(pSim.lair.markerId);
  }
  pSim.lair = lair;
  pSim.trouble = null;

  if (province.state && living.states[province.state]) {
  }

  const lairDef = getLairDef(chosenLairId);
  pushNews(living, {
    kind: "lair",
    text: `A ${lairDef.name} arose in ${province.name}! (Lair level ${finalLevel})`,
    cell: originCell,
    stateId: province.state
  });

  return lair;
}

export function smiteLair(provinceId: number): boolean {
  const province = pack.provinces?.[provinceId];
  if (!province?.i || province.removed) return false;
  const host = getHost();
  const living = host.getState();
  const pSim = living.provinces[provinceId];
  if (!pSim?.lair) return false;

  removeLairMarker(pSim.lair.markerId);
  const lairName = pSim.lair.name;
  pSim.lair = null;

  if (province.state && living.states[province.state]) {
  }

  pushNews(living, {
    kind: "lair",
    text: `The ${lairName} in ${province.name} was destroyed.`,
    cell: province.center ?? 0,
    stateId: province.state
  });
  return true;
}

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

    pushNews(living, {
      kind: "faction",
      text: `${faction.name} has proclaimed sovereign independence, founding ${newState?.fullName ?? "a new realm"}!`,
      cell: targetCell,
      stateId: newStateId,
      burgId: targetBurg?.i
    });
  }

  return newStateId;
}

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
    }
  }

  return stateId;
}

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

  const living = getHost().getState();
  pushNews(living, {
    kind: "faction",
    text: `Loyalists of the fallen ${fallenState.name} formed the ${remnant.name}!`,
    cell: fallenState.center || 0,
    stateId: conquerorStateId
  });

  return remnant;
}

function resolveEmergentCapital(
  province: Province,
  originKind: "trouble" | "lair" | "faction",
  originCell: number,
  rng: Rng,
  requestedBurgId?: number
): Burg | null {
  if (requestedBurgId) {
    const target = pack.burgs?.[requestedBurgId];
    if (target?.i && !target.removed && (!target.capital || originKind === "faction")) return target;
  }

  const cellBurgId = pack.cells.burg?.[originCell];
  if (cellBurgId) {
    const cellBurg = pack.burgs?.[cellBurgId];
    if (cellBurg?.i && !cellBurg.removed && (!cellBurg.capital || originKind === "faction")) return cellBurg;
  }

  if (originKind === "trouble" || originKind === "faction") {
    if (province.burg) {
      const pBurg = pack.burgs?.[province.burg];
      if (pBurg?.i && !pBurg.removed && !pBurg.capital) return pBurg;
    }
    const candidates = (pack.burgs ?? []).filter(
      b =>
        b?.i &&
        !b.removed &&
        !b.capital &&
        (pack.cells.province?.[b.cell] === province.i || (province.state && b.state === province.state))
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
      return candidates[0]!;
    }
  }

  return foundEmergentBurg(province, originCell, rng);
}

function foundEmergentBurg(province: Province, originCell: number, rng: Rng): Burg {
  const occupiedCells = new Set<number>();
  for (const b of pack.burgs ?? []) {
    if (b?.i && !b.removed) occupiedCells.add(b.cell);
  }

  let cell = originCell;
  if (occupiedCells.has(cell)) {
    const neighbor = (pack.cells.c?.[originCell] ?? []).find(
      c => !occupiedCells.has(c) && (!pack.cells.h || pack.cells.h[c] >= 20)
    );
    if (neighbor !== undefined) cell = neighbor;
  }

  const [x, y] = pack.cells.p?.[cell] ?? [0, 0];
  const culture =
    pack.cells.culture?.[cell] ??
    (province.state ? pack.states[province.state]?.culture : undefined) ??
    pack.states[1]?.culture ??
    0;
  const pop = Math.round(rng.range(1.5, 3.0) * 10) / 10;

  try {
    const addedId = Burgs.add(x, y);
    const added = pack.burgs[addedId];
    if (added) {
      added.population = Math.max(added.population ?? 0, pop);
      return added;
    }
  } catch {
    // Fallback for stubbed test packs without full Voronoi grid or Routes
  }

  const burgId = pack.burgs.length;
  const burg: Burg = {
    i: burgId,
    cell,
    x,
    y,
    state: province.state ?? 0,
    culture,
    name: Names.getCulture(culture),
    population: pop,
    capital: 0,
    port: 0,
    walls: 1,
    plaza: 1,
    temple: 1,
    citadel: 1,
    tags: []
  };
  pack.burgs.push(burg);
  if (pack.cells.burg) pack.cells.burg[cell] = burgId;
  return burg;
}

function emergentStateColor(rosterId?: string, alignment?: Alignment, fallback?: string): string {
  if (rosterId === "tombKingsBase") return "#d6ccb2";
  if (rosterId === "vampireBase" || rosterId === "darkElfBase") return "#5e3c6e";
  if (rosterId === "demonBase" || rosterId === "chaosBase") return "#9e2a2b";
  if (rosterId === "infernalDwarfBase" || rosterId === "skavenBase") return "#5c646d";
  if (rosterId === "orcBase" || rosterId === "tribalBase") return "#8c4a27";
  if (alignment === "evil") return "#8b2635";
  if (alignment === "chaotic") return "#b5532a";
  if (alignment === "lawful") return "#4a5d73";
  return fallback ?? "#7a6855";
}

function spawnEmergentRuler(state: State, living: LivingWorldState, preferredAlignment?: Alignment): HistoricalFigure {
  const history = Chronicle.sync();
  history.figures ??= [];
  const year = options.map?.lore?.calendar?.year ?? 1000;
  const culture = state.culture ?? 0;
  const index = history.figures.length;
  const rng = traitsRng(living.seed, "figure", index + state.i * 1000);
  const alignment = preferredAlignment ?? rollAlignment(rng, pack.cultures[culture]?.alignment ?? "chaotic");
  const { virtues, vices } = aggressiveTraits(rollFigureTraits(rng, alignment));
  const figure: HistoricalFigure = {
    i: index,
    name: Names.getCulture(culture),
    culture,
    birth: year - rng.int(22, 48),
    roles: [{ type: "ruler", target: { kind: "state", id: state.i }, from: year }],
    alignment,
    virtues,
    vices
  };
  history.figures.push(figure);
  return figure;
}

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
  const rng = getRng(`emergent:${originKind}`, province.i, living.tick);

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
    treasury: 150
  };
  pack.states.push(newState);
  capital.capital = 1;
  capital.state = newStateId;

  const territoryCells = emergentTerritoryCells(province, capital, oldOwnerId);
  transferCells(newStateId, territoryCells);
  capital.state = newStateId;

  // Ensure the province transfers cleanly if its center or non-capital cells were seized
  const oldCapitalCell = oldOwner?.capital ? pack.burgs[oldOwner.capital]?.cell : oldOwner?.center;
  const provinceCells = getProvinceCells(province.i);
  const holdsOldCapital = oldCapitalCell !== undefined && provinceCells.includes(oldCapitalCell);
  if (!holdsOldCapital) {
    if (oldOwner?.provinces) {
      oldOwner.provinces = oldOwner.provinces.filter(id => id !== province.i);
    }
    province.state = newStateId;
    province.burg = capital.i;
    province.center = capital.cell;
    if (!newState.provinces?.includes(province.i)) {
      newState.provinces = [...(newState.provinces ?? []), province.i];
    }
    for (const c of territoryCells) {
      if (pack.cells.province) pack.cells.province[c] = province.i;
    }
  } else {
    assignProvince(newStateId, territoryCells);
  }

  if (markerId !== undefined) {
    removeLairMarker(markerId);
  }

  pSim.trouble = null;
  pSim.lair = null;
  pSim.order = 75;
  pSim.stability = 3;

  const ruler = spawnEmergentRuler(newState, living, opts.alignment);

  // Sync world burgs/provinces/states and scaffold capital infrastructure
  syncBurgs(living);
  syncProvinces(living);
  syncStates(living);

  const bSim = living.burgs?.[capital.i];
  if (bSim) {
    bSim.unrest = 0;
    bSim.conqueredBy = undefined;
    const scaffold = ["walls2", "barracks1", "market1", "temple1"];
    const bSet = new Set(bSim.buildings);
    bSet.delete("walls1");
    for (const bid of scaffold) bSet.add(bid);
    bSim.buildings = Array.from(bSet);
    syncBurgFlagsFromBuildings(capital, bSim.buildings);
  }

  const sSim = living.states[newStateId];
  if (sSim) {
    sSim.rulerId = ruler.i;
    sSim.unravel = 0;
    sSim.warExhaustion = 0;
  }

  // Clear stale agendas on former owner targeting this province
  if (oldOwnerId && living.states[oldOwnerId]) {
    const oldSim = living.states[oldOwnerId]!;
    const kind = oldSim.agenda?.kind;
    if (
      (kind === "clear_lair" || kind === "hire_adventurers") &&
      oldSim.agenda?.targetProvinceId === province.i
    ) {
      oldSim.agenda = null;
    }
  }

  // Form 1st Regiment at capital
  const unitTypes = Military.getUnitTypes();
  const regiment = createRegiment(newState);
  regiment.name = `1st Host of ${newState.name}`;
  moveArmy(regiment, capital);
  regiment.units = fromBattleUnitsMen(opts.units, unitTypes);
  syncRegimentTotals(regiment, unitTypes);
  ensureCommanders();

  if (oldOwnerId && living.states[oldOwnerId]) {
  }

  // Claims and mutual high-weight grudges with the former sovereign
  if (oldOwnerId && oldOwner && !oldOwner.removed) {
    recordClaim(oldOwnerId, capital, newStateId);
    recordGrudge(
      oldOwnerId,
      capital,
      "conquest",
      `${newState.name} seized ${capital.name ?? "the province"} from ${oldOwner.name}`,
      newStateId
    );
    const lastOldGrudge = living.states[oldOwnerId]?.grudges?.at(-1);
    if (lastOldGrudge) lastOldGrudge.weight = 60;

    recordGrudge(newStateId, capital, "conquest", `${ruler.name} vowed to cast down ${oldOwner.name}`, oldOwnerId);
    const lastNewGrudge = living.states[newStateId]?.grudges?.at(-1);
    if (lastNewGrudge) lastNewGrudge.weight = 60;
  }

  const provLabel = province.name ?? capital.name ?? "the province";
  const text =
    originKind === "lair"
      ? `${ruler.name} of the ${originName} in ${provLabel} has proclaimed the ${fullName}!`
      : `${originName} in ${provLabel} erupted into revolution, proclaiming the ${fullName} under ${ruler.name}!`;
  pushNews(living, {
    kind: originKind === "lair" ? "lair" : "revolt",
    text,
    cell: capital.cell,
    stateId: newStateId,
    burgId: capital.i
  });
  pushHistory(
    "independence",
    [
      { kind: "figure", id: ruler.i },
      { kind: "burg", id: capital.i },
      { kind: "state", id: newStateId },
      ...(oldOwnerId ? [{ kind: "state", id: oldOwnerId } as HistRef] : [])
    ],
    capital.cell,
    text
  );

  return newStateId;
}

export const LivingThreats = {
  setHost: setThreatHost,
  syncDangerMarkers,
  registerActiveLair,
  addLairMarker,
  removeLairMarker,
  clearLair,
  spawnTrouble,
  spawnDangerousFaction,
  migrateLegacyThreats,
  quellTrouble,
  assaultFaction,
  sendAdventurersToFaction,
  assaultLair,
  sendAdventurersToLair,
  metastasizeTroubleToLair,
  spawnLair,
  smiteLair,
  ascendFactionToState,
  ascendLairToState,
  spawnRemnantFaction
};



