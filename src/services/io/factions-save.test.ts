import { describe, expect, it } from "vitest";
import { FIRST_SNAPSHOT_RECORD, HISTORY_RECORD, parseHistory } from "@/services/io/epochs-format";
import type { Faction } from "@/types/factions";

describe("Factions .map Serialization and Legacy Migration", () => {
  const sampleFaction: Faction = {
    i: 1,
    name: "The Gilded Compass Consortium",
    category: "commercial",
    type: "merchant_consortium",
    scale: "province",
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
    tier: 2,
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

  it("correctly identifies record 54 for factions and 55 for history", () => {
    expect(HISTORY_RECORD).toBe(55);
    expect(FIRST_SNAPSHOT_RECORD).toBe(56);
  });

  it("migrates legacy map where record 54 was history (JSON object)", () => {
    const legacyHistoryJson = JSON.stringify({
      events: [{ i: 0, year: 100, type: "founding", text: "Founded" }],
      realms: [],
      eras: []
    });

    // Emulate loaded data array where record 54 is history JSON and 55+ are snapshots
    const data: string[] = Array.from({ length: 54 }, () => "");
    data[54] = legacyHistoryJson; // legacy map format

    // Emulate load.ts migration logic
    if (data[54] && !data[54].startsWith("[")) {
      data.splice(54, 0, JSON.stringify([{ i: 0 }]));
    }

    const factions: Faction[] = JSON.parse(data[54]);
    expect(factions).toHaveLength(1);
    expect(factions[0].i).toBe(0);

    // Verify history now sits at HISTORY_RECORD (55)
    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Founded");
  });

  it("loads new map where record 54 is factions array and 55 is history", () => {
    const factionsJson = JSON.stringify([{ i: 0 }, sampleFaction]);
    const historyJson = JSON.stringify({
      events: [{ i: 1, year: 150, type: "war", text: "Border war" }],
      realms: [],
      eras: []
    });

    const data: string[] = Array.from({ length: 54 }, () => "");
    data[54] = factionsJson;
    data[55] = historyJson;

    // Load logic
    if (data[54] && !data[54].startsWith("[")) {
      data.splice(54, 0, JSON.stringify([{ i: 0 }]));
    }

    const factions: Faction[] = JSON.parse(data[54]);
    expect(factions).toHaveLength(2);
    expect(factions[1].name).toBe("The Gilded Compass Consortium");
    expect(factions[1].hq.assets).toEqual(["trade_depot", "counting_house"]);
    expect(factions[1].outposts[0].influence).toBe(60);

    const history = parseHistory(data[HISTORY_RECORD], data.slice(FIRST_SNAPSHOT_RECORD), 0);
    expect(history.events).toHaveLength(1);
    expect(history.events[0].text).toBe("Border war");
  });

  it("handles ancient maps with no record 54", () => {
    const data: string[] = Array.from({ length: 50 }, () => "");

    if (data[54] && !data[54].startsWith("[")) {
      data.splice(54, 0, JSON.stringify([{ i: 0 }]));
    }

    const factions: Faction[] = data[54] ? JSON.parse(data[54]) : [{ i: 0 } as Faction];
    expect(factions).toHaveLength(1);
    expect(factions[0].i).toBe(0);
  });
});
