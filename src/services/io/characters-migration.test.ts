import { describe, expect, it } from "vitest";
import { heroStartingPackage } from "@/data/character-actions";
import { type LegacyFigure, migrateCharacters } from "@/services/io/characters-migration";
import { FIRST_SNAPSHOT_RECORD, HISTORY_RECORD, parseHistory, serializeHistory } from "@/services/io/epochs-format";
import type { HeroSheet } from "@/types/character";
import { emptyHistory, type History } from "@/types/history";

function heroSheet(archetype: "warden" | "freeblade" = "warden"): HeroSheet {
  const start = heroStartingPackage(archetype);
  return {
    archetype,
    attributes: start.attributes,
    actions: start.actions,
    abilities: [start.ability],
    xp: 0
  };
}

describe("character migration", () => {
  it("backfills seed keys and converts legacy skills to a hero sheet", () => {
    const figure: LegacyFigure = {
      i: 0,
      name: "Vale",
      culture: 1,
      birth: 900,
      roles: [{ type: "general", target: { kind: "state", id: 1 }, from: 950 }],
      skills: { m: 4, w: 1, s: 0, c: 2 },
      xp: 7,
      archetype: "warden",
      disciplines: ["melee", "tactics"],
      progression: { appliedLevel: 2, pendingChoices: 1, picks: ["strike"] }
    };
    const history: History = { ...emptyHistory(), figures: [figure] };

    const result = migrateCharacters(history);

    expect(result.heroes).toBe(1);
    expect(figure.seedKey).toBe("figure:0");
    expect(figure.hero).toMatchObject({
      archetype: "warden",
      attributes: { might: 2, agility: 1, wits: 0, presence: -1 },
      actions: {
        strike: "d12",
        guard: "d12",
        maneuver: "d12",
        investigate: "d6",
        craft: "d6",
        treat: "d6",
        command: "d4",
        persuade: "d4",
        deceive: "d4",
        scout: "d8",
        infiltrate: "d8",
        survive: "d8"
      },
      abilities: ["melee", "tactics"],
      xp: 7,
      progression: { appliedLevel: 2, pendingChoices: 1, picks: [] }
    });
    expect(figure.skills).toEqual({ m: 4, w: 1, s: 0, c: 2 });
  });

  it("keeps a new hero sheet untouched", () => {
    const existing = heroSheet("freeblade");
    const figure: LegacyFigure = {
      i: 2,
      name: "Soren",
      culture: 1,
      birth: 900,
      roles: [],
      hero: existing,
      skills: { m: 1, w: 1, s: 1, c: 1 }
    };
    const history: History = { ...emptyHistory(), figures: [figure] };

    migrateCharacters(history);

    expect(figure.hero).toBe(existing);
    expect(figure.hero?.archetype).toBe("freeblade");
    expect(figure.hero?.actions).toEqual(existing.actions);
  });

  it("leaves background characters without a hero sheet", () => {
    const figure: LegacyFigure = {
      i: 3,
      name: "Tomas",
      culture: 1,
      birth: 900,
      roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 950, to: 990 }]
    };
    const history: History = { ...emptyHistory(), figures: [figure] };

    expect(migrateCharacters(history).heroes).toBe(0);
    expect(figure.seedKey).toBe("figure:3");
    expect(figure.hero).toBeUndefined();
  });

  it("is idempotent", () => {
    const figure: LegacyFigure = {
      i: 4,
      name: "Yara",
      culture: 1,
      birth: 900,
      roles: [],
      skills: { m: 2, w: 2, s: 2, c: 2 }
    };
    const history: History = { ...emptyHistory(), figures: [figure] };

    migrateCharacters(history);
    const sheet = figure.hero;
    expect(migrateCharacters(history).heroes).toBe(0);
    expect(figure.hero).toBe(sheet);
  });
});

describe("character save round-trip", () => {
  it("keeps the history record layout and a new hero sheet", () => {
    expect(HISTORY_RECORD).toBe(55);
    expect(FIRST_SNAPSHOT_RECORD).toBe(56);

    const history: History = {
      ...emptyHistory(),
      figures: [
        {
          i: 0,
          name: "Aster",
          culture: 1,
          birth: 900,
          roles: [],
          seedKey: "figure:0",
          hero: heroSheet("warden")
        }
      ]
    };

    const { json, snapshotRecords } = serializeHistory(history, 0);
    const loaded = parseHistory(json, snapshotRecords, 0);
    expect(loaded.figures).toEqual(history.figures);
  });

  it("keeps a removed character as a tombstone", () => {
    const history: History = {
      ...emptyHistory(),
      figures: [
        {
          i: 1,
          name: "Fallen",
          culture: 1,
          birth: 800,
          death: 850,
          roles: [],
          removed: true,
          seedKey: "figure:1"
        }
      ]
    };

    const { json, snapshotRecords } = serializeHistory(history, 0);
    const loaded = parseHistory(json, snapshotRecords, 0);
    expect(loaded.figures[0]?.removed).toBe(true);
    expect(loaded.figures[0]?.death).toBe(850);
  });
});
