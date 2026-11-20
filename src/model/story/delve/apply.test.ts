import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DungeonProfile, generateDungeonProfile } from "@/model/story/dungeon-generator";
import { ensureGenerated } from "@/model/story/marker-content";
import type { Marker } from "@/model/story/markers-generator";
import { ACTIONS, type ActionId, type Die } from "@/types/character-actions";
import type { DelveHero, DelveOutcome } from "@/types/delves";
import type { HistoricalFigure, History } from "@/types/history";
import { type DelveHost, delveHeroFromFigure, runDelveAtMarker, setDelveHost } from "./apply";
import { runDelve } from "./engine";

const CELL = 7;

function context(seed: string) {
  return {
    seed,
    cell: CELL,
    cultureName: "the local folk",
    alignment: "neutral" as const,
    biomeName: "wilderness",
    height: 0,
    name: "Test Keep"
  };
}

function figure(index: number, weak = false): HistoricalFigure {
  const die: Die = weak ? "d4" : "d12";
  const modifier = weak ? -1 : 2;
  const actions = Object.fromEntries(ACTIONS.map(action => [action, die])) as Record<ActionId, Die>;
  return {
    i: index,
    name: `Hero ${index}`,
    culture: 0,
    birth: 900,
    roles: [],
    hero: {
      archetype: "warden",
      attributes: { might: modifier, agility: modifier, wits: modifier, presence: modifier },
      actions,
      abilities: [],
      xp: 0
    }
  };
}

function profile(seed: string): DungeonProfile {
  return generateDungeonProfile(context(seed));
}

function findSeed(heroes: readonly DelveHero[], dungeon: DungeonProfile, outcome: DelveOutcome): string {
  for (let index = 0; index < 400; index++) {
    const seed = `scan-${outcome}-${index}`;
    if (runDelve(dungeon, heroes, { seed, order: "swift" }).outcome === outcome) return seed;
  }
  throw new Error(`No ${outcome} seed found`);
}

describe("runDelveAtMarker", () => {
  let marker: Marker;
  let figures: HistoricalFigure[];
  let history: History;
  let host: DelveHost;

  function setup(partyFigures: HistoricalFigure[], seed = "small-6"): void {
    figures = partyFigures;
    marker = {
      i: 0,
      type: "dungeons",
      icon: "dungeons",
      x: 0,
      y: 0,
      cell: CELL,
      name: "Test Keep",
      generated: { kind: "dungeon", version: 1, seed }
    };
    history = { events: [], realms: [], eras: [], figures: [] };
    host = {
      getMarker: id => (id === marker.i ? marker : undefined),
      getFigure: id => figures.find(entry => entry.i === id),
      getHistory: () => history,
      tick: () => 0,
      year: () => 1000
    };
    setDelveHost(host);
  }

  beforeEach(() => {
    (globalThis as unknown as { pack: unknown }).pack = { cells: {} };
  });

  afterEach(() => {
    setDelveHost(undefined);
  });

  it("clears a dungeon on a triumph and logs the deed", () => {
    setup([figure(1), figure(2), figure(3)]);
    const seed = findSeed(figures.map(delveHeroFromFigure), profile("small-6"), "triumph");

    const run = runDelveAtMarker({ markerId: 0, party: [1, 2, 3], order: "swift", seed });

    expect(run.record.outcome).toBe("triumph");
    expect(marker.delve?.status).toBe("cleared");
    expect(marker.delve?.clearedYear).toBe(1000);
    expect(history.delves).toHaveLength(1);
    expect(history.delves?.[0].marker).toBe(marker.i);
    expect(history.events.some(event => event.type === "deed")).toBe(true);
    expect(marker.note).toContain("Delve record — Triumph");

    const html = ensureGenerated(marker);
    expect(html).toContain("Cleared.");
    expect(html).toContain("Treasure</strong> 0/10 (depleted)");

    if (run.result.xp > 0) {
      for (const entry of figures) {
        const result = run.result.heroes.find(hero => hero.figureId === entry.i);
        if (result && !result.down) expect(entry.xp ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the bag on a retreat and does not clear the dungeon", () => {
    setup([figure(1), figure(2)], "map-seed");
    const seed = findSeed(figures.map(delveHeroFromFigure), profile("map-seed"), "retreat");

    const run = runDelveAtMarker({ markerId: 0, party: [1, 2], order: "swift", seed });

    expect(run.record.outcome).toBe("retreat");
    expect(marker.delve?.status).not.toBe("cleared");
    expect(marker.note).toContain("Delve record — Retreat");

    const totalLoot = Object.values(run.result.loot).reduce((sum, amount) => sum + amount, 0);
    if (totalLoot > 0) {
      expect(figures.some(entry => (entry.hero?.inventory?.length ?? 0) > 0)).toBe(true);
    }
  });

  it("downs the party and loses the bag on a defeat", () => {
    setup([figure(1, true)], "map-seed");
    const seed = findSeed(figures.map(delveHeroFromFigure), profile("map-seed"), "defeat");

    const run = runDelveAtMarker({ markerId: 0, party: [1], order: "swift", seed });

    expect(run.record.outcome).toBe("defeat");
    expect(run.record.xp).toBe(0);
    expect(marker.delve?.status).not.toBe("cleared");
    expect(figures[0].hero?.condition?.downUntilTick).toBe(2);
    expect(figures[0].hero?.inventory?.length ?? 0).toBe(0);
    expect(marker.note).toContain("Delve record — Defeat");
  });

  it("replaces the previous record instead of growing the note", () => {
    setup([figure(1), figure(2)], "map-seed");
    const heroes = figures.map(delveHeroFromFigure);
    const seed = findSeed(heroes, profile("map-seed"), "retreat");

    runDelveAtMarker({ markerId: 0, party: [1, 2], order: "swift", seed });
    runDelveAtMarker({ markerId: 0, party: [1, 2], order: "swift", seed });

    expect(history.delves).toHaveLength(2);
    expect(marker.note?.split("<h3>Delve record</h3>")).toHaveLength(2);
  });

  it("rejects unknown figures and non-dungeon markers", () => {
    setup([figure(1)]);
    expect(() => runDelveAtMarker({ markerId: 0, party: [9], seed: "x" })).toThrow("Unknown hero 9");

    marker.type = "ruins";
    marker.generated = undefined;
    expect(() => runDelveAtMarker({ markerId: 0, party: [1], seed: "x" })).toThrow("not a dungeon");
  });
});
