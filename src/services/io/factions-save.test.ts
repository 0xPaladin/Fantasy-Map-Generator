import { describe, expect, it } from "vitest";
import { FIRST_SNAPSHOT_RECORD, HISTORY_RECORD, parseHistory } from "@/services/io/epochs-format";
import type { Faction } from "@/types/factions";

describe("Factions .map Serialization and Legacy Migration", () => {
  const sampleFaction: Faction = {
    i: 1,
    name: "The Gilded Compass Consortium",
    category: "commercial",
    type: "merchant_consortium",
    allegiance: "chartered",
    patronStateId: 2,
    color: "#ffaa00",
    icon: "💰",
    culture: 1,
    foundedYear: 120,
    memberIds: [10, 11],
    alignment: "lawful",
    values: ["greed", "order"],
    expansionism: 1.2,
    expansionScope: "global",
    sovereignAmbition: false,
    hq: {
      cell: 100,
      burgId: 5,
      fortified: true,
      secrecy: 0,
      assets: ["trade_depot", "counting_house"]
    },
    outposts: [
      {
        burgId: 8,
        cell: 120,
        tier: 1,
        influence: 60,
        secrecy: 10,
        assets: ["trade_depot"],
        establishedYear: 140
      }
    ],
    science: 3,
    currentTechId: "banking",
    researchQueue: ["banking", "economics"],
    researchedTechs: ["pottery", "currency", "sailing"],
    researchedProgress: { banking: 45 },
    treasury: 450,
    influence: 120,
    military: [],
    stateRelations: { 2: "Ally", 3: "Neutral" },
    factionRelations: { 2: "Rival" },
    agenda: null,
    seasonsActive: 16
  };

  // Mirrors the legacy shift in load.ts, which moves old history/factions records past
  // upstream's prosperity and development records.
  function migrate(data: string[]): void {
    if (data[53]?.trim().startsWith("{")) data.splice(53, 0, "", "", "", "");
    else if (data[54]?.trim().startsWith("{")) data.splice(54, 0, "", "", "");
    else if (data[54]?.trim().startsWith("[")) data.splice(54, 0, "", "");
  }

  const historyJson = (text: string) =>
    JSON.stringify({ events: [{ i: 0, year: 100, type: "founding", text }], realms: [], eras: [] });

  it("places history at record 57 and snapshots at 58", () => {
    expect(HISTORY_RECORD).toBe(57);
    expect(FIRST_SNAPSHOT_RECORD).toBe(58);
  });

  it("migrates a legacy map where record 53 was history", () => {
    const data: string[] = Array.from({ length: 53 }, () => "");
    data[53] = historyJson("Founded");

    migrate(data);

    expect(data[56]).toBe("");
    expect(data[57]).toBe(historyJson("Founded"));
    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Founded");
  });

  it("migrates a legacy map where record 54 was history", () => {
    const data: string[] = Array.from({ length: 54 }, () => "");
    data[54] = historyJson("Founded");

    migrate(data);

    expect(data[56]).toBe("");
    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Founded");
  });

  it("migrates a legacy map where record 54 was factions and 55 was history", () => {
    const factionsJson = JSON.stringify([{ i: 0 }, sampleFaction]);
    const data: string[] = Array.from({ length: 54 }, () => "");
    data[54] = factionsJson;
    data[55] = historyJson("Border war");

    migrate(data);

    const factions: Faction[] = JSON.parse(data[56]);
    expect(factions).toHaveLength(2);
    expect(factions[1].name).toBe("The Gilded Compass Consortium");
    expect(factions[1].hq.assets).toEqual(["trade_depot", "counting_house"]);
    expect(factions[1].outposts[0].influence).toBe(60);

    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Border war");
  });

  it("loads a new map with prosperity, development, factions and history records", () => {
    const factionsJson = JSON.stringify([{ i: 0 }, sampleFaction]);
    const data: string[] = Array.from({ length: 54 }, () => "");
    data[54] = "1,2,3"; // prosperity
    data[55] = "4,5,6"; // development
    data[56] = factionsJson;
    data[57] = historyJson("Border war");

    migrate(data); // no legacy record matches, so nothing shifts

    const factions: Faction[] = JSON.parse(data[56]);
    expect(factions).toHaveLength(2);
    expect(factions[1].name).toBe("The Gilded Compass Consortium");

    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Border war");
  });

  it("handles ancient maps with no faction record", () => {
    const data: string[] = Array.from({ length: 50 }, () => "");

    migrate(data);

    const factions: Faction[] = data[56] ? JSON.parse(data[56]) : [{ i: 0 } as Faction];
    expect(factions).toHaveLength(1);
    expect(factions[0].i).toBe(0);
  });
});
