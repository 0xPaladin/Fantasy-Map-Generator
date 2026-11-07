// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTroubleNotePin,
  drawTrouble,
  getFactionIcon,
  getTroubleIcon,
  getTroubleOrLairFromElement,
  hasTroubleNotePin,
  isTroubleNotePinned,
  pinTroubleNote,
  removeTrouble
} from "./draw-trouble";
import { Layers } from "./layers";

describe("draw-trouble", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <svg id="map">
        <g id="viewbox">
          <g id="markers">
            <g id="marker10" data-id="10"></g>
          </g>
          <g id="trouble"></g>
        </g>
      </svg>
      <div id="notes">
        <div id="notesHeader"></div>
        <div id="notesBody"></div>
      </div>
    `;

    globalThis.pack = {
      cells: {
        province: new Uint16Array([1, 2, 0]),
        p: [
          [0, 0],
          [20, 20],
          [40, 40]
        ]
      },
      provinces: [
        { i: 0, name: "Wild" },
        { i: 1, name: "Northshire", center: 0, state: 1 },
        { i: 2, name: "Southlands", center: 1, state: 1 }
      ],
      states: [{ i: 0 }, { i: 1, name: "Kingdom" }],
      burgs: [{ i: 0 }, { i: 1, name: "Capital", cell: 0 }],
      markers: [
        {
          i: 10,
          cell: 0,
          type: "brigands",
          icon: "💰",
          x: 100,
          y: 100,
          name: "Red Hand Bandits",
          threatId: "faction:1"
        }
      ],
      factions: [
        { i: 0 },
        {
          i: 1,
          name: "Red Hand Bandits",
          type: "brigand_raiders",
          allegiance: "hostile",
          hq: { cell: 0, markerId: 10, provinceId: 1, fortified: false, secrecy: 0, assets: [] },
          outposts: [],
          military: [{ a: 40, units: [{ type: "spear", hp: 1 }] }],
          raidThreshold: 4,
          raidPending: true,
          seasonsActive: 1,
          sovereignAmbition: true,
          stateForm: "Bandit Principality",
          stateRelations: {},
          factionRelations: {}
        },
        {
          i: 2,
          name: "Dread Kraken",
          type: "monster_nest",
          allegiance: "hostile",
          hq: { cell: 2, provinceId: 0, maritime: true, fortified: false, secrecy: 0, assets: [] },
          outposts: [],
          military: [{ a: 60, units: [{ type: "spear", hp: 1 }] }],
          raidThreshold: 6,
          raidPending: true,
          seasonsActive: 4,
          sovereignAmbition: false,
          stateRelations: {},
          factionRelations: {}
        }
      ],
      history: {
        living: {
          enabled: true,
          tick: 1,
          season: 0,
          seed: "test",
          snapshotIntervalYears: 10,
          promptOnPlayerBattles: false,
          states: {},
          recentNews: [],
          burgs: {},
          provinces: {
            1: {
              provinceId: 1,
              order: 50,
              stability: 10,
              development: 0,
              developmentProgress: null,
              trouble: {
                id: "monsters",
                name: "Monster Infestation",
                theme: "ruin",
                pool: "m",
                save: "uprising",
                requiredRole: "military",
                level: 5,
                seasonsUnchecked: 2,
                cell: 0
              }
            },
            2: {
              provinceId: 2,
              order: 40,
              stability: 5,
              development: 0,
              developmentProgress: null,
              trouble: null
            }
          }
        }
      }
    } as unknown as typeof pack;

    globalThis.options = {
      app: { notesPinned: false },
      map: { viewOnly: false }
    } as unknown as typeof options;
  });

  it("returns icons for troubles and factions", () => {
    const trouble = pack.history!.living!.provinces[1].trouble!;
    const faction = pack.factions![1]!;

    expect(getTroubleIcon(trouble)).toBe("🐺");
    expect(getFactionIcon(faction)).toBe("🗡️");
  });

  it("draws trouble and faction pins when the trouble layer is on", () => {
    Layers.show("trouble");
    drawTrouble();

    expect(document.getElementById("trouble-marker-1")).not.toBeNull();
    expect(document.getElementById("faction-marker-1")).not.toBeNull();
    expect(document.getElementById("faction-marker-2")).not.toBeNull();
  });

  it("clears content on removeTrouble", () => {
    Layers.show("trouble");
    drawTrouble();
    expect(document.querySelectorAll(".trouble-marker, .faction-marker").length).toBeGreaterThan(0);

    removeTrouble();
    expect(document.querySelectorAll(".trouble-marker, .faction-marker").length).toBe(0);
  });

  it("resolves trouble info from element", () => {
    Layers.show("trouble");
    drawTrouble();

    const troubleEl = document.getElementById("trouble-marker-1")!;
    const info = getTroubleOrLairFromElement(troubleEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("trouble");
    expect(info?.name).toContain("Monster Infestation");
    expect(info?.tip).toContain("Level 5");
    expect(info?.note).toContain("Northshire");
    expect(info?.note).toContain("Threat Level:</strong> 5 / 10");
  });

  it("resolves faction info from a faction pin", () => {
    Layers.show("trouble");
    drawTrouble();

    const factionEl = document.getElementById("faction-marker-1")!;
    const info = getTroubleOrLairFromElement(factionEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("faction");
    expect(info?.name).toContain("Red Hand Bandits");
    expect(info?.tip).toContain("hostile");
    expect(info?.note).toContain("Northshire");
    expect(info?.note).toContain("Fighters:</strong> 40");
    expect(info?.note).toContain("Raid imminent");
  });

  it("resolves faction info from a standard marker element", () => {
    const stdMarkerEl = document.getElementById("marker10")!;
    const info = getTroubleOrLairFromElement(stdMarkerEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("faction");
    expect(info?.name).toContain("Red Hand Bandits");
  });

  it("resolves a maritime faction in open waters without a province", () => {
    Layers.show("trouble");
    drawTrouble();

    const seaEl = document.getElementById("faction-marker-2")!;
    const info = getTroubleOrLairFromElement(seaEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("faction");
    expect(info?.name).toContain("Dread Kraken");
    expect(info?.note).toContain("Maritime Waters");
    expect(info?.note).toContain("Raid imminent");
  });

  it("handles pinning trouble notes", () => {
    expect(hasTroubleNotePin()).toBe(false);
    pinTroubleNote("trouble:1");
    expect(hasTroubleNotePin()).toBe(true);
    expect(isTroubleNotePinned("trouble:1")).toBe(true);
    expect(isTroubleNotePinned("trouble:2")).toBe(false);

    clearTroubleNotePin();
    expect(hasTroubleNotePin()).toBe(false);
  });
});
