// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  convertDangerMarkerToRuins,
  DANGER_MARKER_TYPES,
  getLairArchetypeForMarker,
  isDangerMarker,
  isDangerMarkerType
} from "./danger-markers";

describe("danger-markers", () => {
  beforeEach(() => {
    globalThis.pack = {
      cells: {
        h: new Uint8Array([50, 10, 60]), // cell 1 is water (<20)
        province: new Uint16Array([1, 0, 2]),
        p: [
          [100, 100],
          [200, 200],
          [300, 300]
        ]
      },
      provinces: [
        { i: 0, name: "Wild" },
        { i: 1, name: "Northshire", center: 0 },
        { i: 2, name: "Southlands", center: 2 }
      ],
      burgs: [{ i: 0 }]
    } as unknown as typeof pack;
  });

  it("contains expected danger types", () => {
    expect(DANGER_MARKER_TYPES).toContain("brigands");
    expect(DANGER_MARKER_TYPES).toContain("pirates");
    expect(DANGER_MARKER_TYPES).toContain("monsters");
  });

  it("identifies danger marker types correctly", () => {
    expect(isDangerMarkerType("brigands")).toBe(true);
    expect(isDangerMarkerType("pirates")).toBe(true);
    expect(isDangerMarkerType("hill-monsters")).toBe(true);
    expect(isDangerMarkerType("lake-monsters")).toBe(true);
    expect(isDangerMarkerType("sea-monsters")).toBe(true);
    expect(isDangerMarkerType("dungeons")).toBe(true);
    expect(isDangerMarkerType("caves")).toBe(true);
    expect(isDangerMarkerType("necropolises")).toBe(true);
    expect(isDangerMarkerType("rifts")).toBe(true);

    // Non-danger markers
    expect(isDangerMarkerType("encounters")).toBe(false);
    expect(isDangerMarkerType("encounter")).toBe(false);
    expect(isDangerMarkerType("inns")).toBe(false);
    expect(isDangerMarkerType("bridges")).toBe(false);
    expect(isDangerMarkerType("libraries")).toBe(false);
    expect(isDangerMarkerType("waterfalls")).toBe(false);
    expect(isDangerMarkerType(undefined)).toBe(false);
  });

  it("detects danger markers including hidden flag check", () => {
    const dangerMarker = { type: "brigands", hidden: false };
    const hiddenDanger = { type: "brigands", hidden: true };
    const civicMarker = { type: "inns", hidden: false };

    expect(isDangerMarker(dangerMarker)).toBe(true);
    expect(isDangerMarker(hiddenDanger)).toBe(false);
    expect(isDangerMarker(civicMarker)).toBe(false);
  });

  it("maps marker types to appropriate lair archetypes with maritime detection", () => {
    const pirateArch = getLairArchetypeForMarker("pirates");
    expect(pirateArch.lairId).toBe("thieves_stronghold");
    expect(pirateArch.isMaritime).toBe(true);

    const seaMonsterArch = getLairArchetypeForMarker("sea-monsters");
    expect(seaMonsterArch.lairId).toBe("monster_nest");
    expect(seaMonsterArch.isMaritime).toBe(true);

    const banditArch = getLairArchetypeForMarker("brigands");
    expect(banditArch.lairId).toBe("bandit_camp");
    expect(banditArch.isMaritime).toBe(false);

    const dungeonArch = getLairArchetypeForMarker("dungeons");
    expect(dungeonArch.lairId).toBe("ancient_evil");
    expect(dungeonArch.isMaritime).toBe(false);
  });

  it("converts defeated danger markers to historical ruins", () => {
    const marker = {
      i: 12,
      cell: 0,
      type: "brigands",
      icon: "💰",
      x: 100,
      y: 100,
      name: "Red Hand Outlaws",
      note: "Infamous bandits who terrorized the north roads.",
      threatId: "lair:12"
    };

    convertDangerMarkerToRuins(marker, "King Alden");

    expect(marker.type).toBe("ruins");
    expect(marker.icon).toBe("🏛️");
    expect(marker.name).toBe("Ruins of Red Hand Outlaws");
    expect(marker.threatId).toBeUndefined();
    expect(marker.note).toContain("Site cleared and dismantled by King Alden");
  });
});
