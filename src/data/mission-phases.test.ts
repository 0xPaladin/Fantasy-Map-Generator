import { describe, expect, it } from "vitest";
import { buildMissionPhases, phasesForParty } from "@/data/mission-phases";

describe("mission phases", () => {
  it("builds two phases for low-level lairs and three for level 5+", () => {
    const low = buildMissionPhases({ kind: "lair", dc: 15, tags: ["lair", "combat", "wild"], level: 4 });
    const high = buildMissionPhases({ kind: "lair", dc: 15, tags: ["lair", "combat", "wild"], level: 5 });

    expect(low.map(phase => phase.label)).toEqual(["Approach", "Breach"]);
    expect(high.map(phase => phase.label)).toEqual(["Approach", "Breach", "Decapitation"]);
    expect(low[0]!.dc).toBe(14);
    expect(high[2]!.dc).toBe(16);
  });

  it("gives chronicle excavations three phases and wild ruins two", () => {
    const wild = buildMissionPhases({ kind: "excavate", dc: 14, tags: ["ruin"], level: 0 });
    const chronicle = buildMissionPhases({
      kind: "excavate",
      dc: 14,
      tags: ["ruin", "arcane"],
      level: 0,
      chronicle: true
    });

    expect(wild).toHaveLength(2);
    expect(chronicle).toHaveLength(3);
    expect(chronicle.map(phase => phase.label)).toEqual(["Survey", "Delve", "Extraction"]);
  });

  it("builds trouble and pacify phases with their own pools", () => {
    const trouble = buildMissionPhases({
      kind: "trouble",
      dc: 16,
      tags: ["trouble", "combat", "save:disorder", "role:guardsmen"],
      level: 6
    });
    const pacify = buildMissionPhases({ kind: "pacify", dc: 13, tags: ["social", "order"], level: 3 });

    expect(trouble.map(phase => phase.pool)).toEqual(["c", "m", "s"]);
    expect(trouble[0]!.tags).toContain("trouble");
    expect(pacify.map(phase => phase.label)).toEqual(["Parley", "Enforce"]);
  });

  it("caps phases at two per party member", () => {
    const phases = buildMissionPhases({
      kind: "excavate",
      dc: 14,
      tags: ["ruin", "arcane"],
      level: 0,
      chronicle: true
    });
    expect(phasesForParty(phases, 1)).toHaveLength(2);
    expect(phasesForParty(phases, 2)).toHaveLength(3);
  });
});
