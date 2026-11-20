// Application layer: run a delve at a marker and write its outcomes back.
// See docs/plans/dungeon-delves.md §7 and §10 phase 2.

import { DEFAULT_DELVE_CONFIG, type DelveConfig } from "@/data/delve-config";
import { figureDisciplines } from "@/data/hero-archetypes";
import { Pack } from "@/model/graph/pack-generator";
import { Chronicle } from "@/model/physical/history-generator";
import { applyHeroLevels, ensureHeroGuildState, ensureHeroSheet } from "@/model/physical/living-heroes";
import { Characters } from "@/model/society/characters";
import { generateDungeonProfile } from "@/model/story/dungeon-generator";
import { DUNGEON_KIND, dungeonContext } from "@/model/story/dungeon-marker";
import { createGeneratedContent } from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import type {
  DelveHero,
  DelveHeroResult,
  DelveLoot,
  DelveOrder,
  DelveOutcome,
  DelveRecord,
  DelveResult,
  MarkerDelveState
} from "@/types/delves";
import { type DelveLootPart, TREASURE_PARTS } from "@/types/delves";
import type { HistoricalFigure, History, HistoryEventType, HistRef } from "@/types/history";
import { createRng } from "@/utils/rng";
import { capitalize } from "@/utils/string-utils";
import { runDelve } from "./engine";
import { renderDelveRecordHtml } from "./journal";

export interface DelveHost {
  getMarker(id: number): Marker | undefined;
  getFigure(id: number): HistoricalFigure | undefined;
  getHistory(): History;
  tick(): number;
  year(): number;
  pushNews?(text: string, cell: number): void;
  pushHistory?(type: HistoryEventType, actors: HistRef[], cell: number, text: string): void;
}

let delveHost: DelveHost | undefined;

/** Inject the living-world host; without it the model reads globals and writes no news. */
export function setDelveHost(host?: DelveHost): void {
  delveHost = host;
}

function defaultHost(): DelveHost {
  return {
    getMarker: id => pack.markers?.find(marker => marker.i === id),
    getFigure: id => Characters.get(id),
    getHistory: () => Chronicle.sync(),
    tick: () => pack.history?.living?.tick ?? 0,
    year: () => options?.map?.lore?.calendar?.year ?? 1000
  };
}

function host(): DelveHost {
  return delveHost ?? defaultHost();
}

const DELVE_HEADING = "<hr><h3>Delve record</h3>";

const LOOT_NOUNS: Record<DelveLootPart, readonly string[]> = {
  bullion: ["coin", "silver ingots", "plate"],
  regalia: ["crown jewels", "ceremonial seal", "gilded sceptre"],
  art: ["tapestry", "illuminated book", "sculpture"],
  relics: ["saint's relic", "founder's blade", "sacred vessel"]
};

export interface DelveRunOptions {
  markerId: number;
  /** figure ids, leader first */
  party: readonly number[];
  order?: DelveOrder;
  retainers?: number;
  /** override for tests and replay; otherwise keyed by map seed, cell, party and tick */
  seed?: string;
  config?: DelveConfig;
}

export interface DelveRun {
  record: DelveRecord;
  result: DelveResult;
  marker: Marker;
}

/** Read a figure as the engine's hero sheet; background characters get a sheet on first use. */
export function delveHeroFromFigure(figure: HistoricalFigure): DelveHero {
  const sheet = ensureHeroSheet(figure);
  const state = ensureHeroGuildState(figure);
  return {
    figureId: figure.i,
    name: figure.name,
    actions: { ...sheet.actions },
    attributes: { ...sheet.attributes },
    resolve: state.resolve,
    maxResolve: state.maxResolve,
    stamina: state.stamina,
    maxStamina: state.maxStamina,
    injuries: state.injuries.length,
    disciplines: [...figureDisciplines(figure)],
    virtues: [...(figure.virtues ?? [])],
    vices: [...(figure.vices ?? [])]
  };
}

function applyHeroResult(figure: HistoricalFigure, result: DelveHeroResult, tick: number, xp: number): void {
  const sheet = ensureHeroSheet(figure);
  const state = ensureHeroGuildState(figure);

  state.resolve = Math.max(0, Math.min(result.resolve, state.maxResolve));
  state.stamina = Math.max(0, Math.min(result.stamina, state.maxStamina));

  const missing = Math.max(0, result.injuries - state.injuries.length);
  for (let index = 0; index < missing; index++) {
    state.injuries.push({ kind: "wounded", untilTick: tick + 2 });
  }
  if (result.down) state.downUntilTick = Math.max(state.downUntilTick ?? 0, tick + 2);

  if (xp > 0) {
    figure.xp = (figure.xp ?? 0) + xp;
    sheet.xp = figure.xp;
    applyHeroLevels(figure);
  }
}

/** Loot lands in inventories round-robin; defeat carries nothing home. */
function awardLoot(figures: readonly HistoricalFigure[], loot: DelveLoot, seed: string): void {
  const rng = createRng(`${seed}:loot`);
  const items: string[] = [];
  for (const part of TREASURE_PARTS) {
    if (loot[part] <= 0) continue;
    items.push(`${capitalize(rng.choice(LOOT_NOUNS[part]))} (${loot[part]})`);
  }
  if (!items.length) return;

  figures.forEach((figure, index) => {
    const sheet = ensureHeroSheet(figure);
    sheet.inventory ??= [];
    sheet.inventory.push(items[index % items.length]);
  });
}

function nextStatus(
  result: DelveResult,
  leaderCleared: boolean,
  previous?: MarkerDelveState
): MarkerDelveState["status"] {
  if (result.outcome === "triumph") return "cleared";
  if (leaderCleared) return "weakened";
  return previous?.status === "cleared" ? "cleared" : "undisturbed";
}

function setRecordNote(marker: Marker, html: string): void {
  const note = marker.note ?? "";
  const index = note.indexOf(DELVE_HEADING);
  marker.note = `${index === -1 ? note : note.slice(0, index)}${DELVE_HEADING}${html}`;
}

function writeHistory(scope: DelveHost, type: HistoryEventType, actors: HistRef[], cell: number, text: string): void {
  if (scope.pushHistory) {
    scope.pushHistory(type, actors, cell, text);
    return;
  }
  const history = scope.getHistory();
  history.events ??= [];
  history.events.push({ i: history.events.length, year: scope.year(), type, actors, loc: cell, text });
}

const OUTCOME_TEXT: Record<DelveOutcome, (names: string, dungeon: string) => string> = {
  triumph: (names, dungeon) => `${names} cleared ${dungeon}.`,
  retreat: (names, dungeon) => `${names} withdrew from ${dungeon}.`,
  defeat: (names, dungeon) => `${names} fell in ${dungeon}.`
};

export function runDelveAtMarker(options: DelveRunOptions): DelveRun {
  const scope = host();
  const marker = scope.getMarker(options.markerId);
  if (!marker) throw new Error(`Unknown marker ${options.markerId}`);
  if (marker.type !== "dungeons" && marker.type !== "dungeon" && marker.generated?.kind !== DUNGEON_KIND) {
    throw new Error(`Marker ${options.markerId} is not a dungeon`);
  }

  const content = marker.generated ?? createGeneratedContent(marker);
  if (!content) throw new Error(`Marker ${options.markerId} has no generated profile`);
  marker.generated = content;

  const salt = typeof content.meta?.salt === "string" ? content.meta.salt : "";
  const profile = generateDungeonProfile(dungeonContext(marker.cell, content.seed, marker.name), salt);

  const tick = scope.tick();
  const year = scope.year();
  const order = options.order ?? "cautious";
  const figures = options.party.map(id => {
    const figure = scope.getFigure(id);
    if (!figure || figure.removed || figure.death !== undefined) throw new Error(`Unknown hero ${id}`);
    return figure;
  });
  const party = figures.map(delveHeroFromFigure);
  const seed = options.seed ?? `${content.seed}:delve:${marker.cell}:${options.party.join(",")}:${tick}`;

  const result = runDelve(
    profile,
    party,
    { seed, leaderId: options.party[0], order, retainers: options.retainers },
    options.config ?? DEFAULT_DELVE_CONFIG
  );

  const history = scope.getHistory();
  history.delves ??= [];
  const record: DelveRecord = {
    i: history.delves.length,
    marker: marker.i,
    cell: marker.cell,
    year,
    tick,
    party: [...options.party],
    order,
    outcome: result.outcome,
    objectivesDone: result.objectivesDone,
    objectivesTotal: result.objectivesTotal,
    turns: result.turns,
    finalAlert: result.alert,
    escalation: result.escalation,
    loot: result.loot,
    xp: result.xp
  };
  history.delves.push(record);

  const xp = result.outcome === "defeat" ? 0 : result.xp;
  const byId = new Map(result.heroes.map(hero => [hero.figureId, hero]));
  for (const figure of figures) {
    const heroResult = byId.get(figure.i);
    if (heroResult) applyHeroResult(figure, heroResult, tick, heroResult.down ? 0 : xp);
  }

  if (result.outcome !== "defeat") awardLoot(figures, result.loot, seed);

  const leaderCleared = result.objectives.some(objective =>
    objective.situations.some(situation => situation.leader && situation.strength === 0)
  );
  const status = nextStatus(result, leaderCleared, marker.delve);
  marker.delve = {
    ...marker.delve,
    status,
    lastDelve: record.i,
    ...(status === "cleared" ? { clearedYear: year } : {})
  };
  delete content.html;

  setRecordNote(marker, renderDelveRecordHtml(result));

  const names = figures.map(figure => figure.name).join(", ");
  const text = OUTCOME_TEXT[result.outcome](names, profile.name);
  writeHistory(
    scope,
    "deed",
    figures.map(figure => ({ kind: "figure", id: figure.i })),
    marker.cell,
    text
  );
  scope.pushNews?.(text, marker.cell);

  Pack.markChanged();
  return { record, result, marker };
}
