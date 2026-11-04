// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTroubleNotePin,
  drawTrouble,
  getLairIcon,
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
          threatId: "lair:10"
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
          activeLairs: {
            "lair:10": {
              id: "bandit_camp",
              name: "Red Hand Bandits",
              level: 5,
              theme: "burg",
              cell: 0,
              markerId: 10,
              provinceId: 1,
              raidThreshold: 5,
              raidUnits: [{ type: "spear", count: 2, exp: 0 }],
              defenders: [{ type: "spear", count: 4, exp: 0 }],
              fortified: false,
              raidPending: false,
              seasonsActive: 1
            },
            "lair:sea": {
              id: "monster_nest",
              name: "Dread Kraken",
              level: 7,
              theme: "resource",
              cell: 2,
              provinceId: 0,
              maritime: true,
              raidThreshold: 6,
              raidUnits: [],
              defenders: [{ type: "spear", count: 10, exp: 0 }],
              fortified: false,
              raidPending: true,
              seasonsActive: 4
            }
          },
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
              },
              lair: null
            },
            2: {
              provinceId: 2,
              order: 40,
              stability: 5,
              development: 0,
              developmentProgress: null,
              trouble: null,
              lair: {
                id: "bandit_camp",
                name: "Black Wolf Bandits",
                level: 6,
                theme: "burg",
                cell: 1,
                raidThreshold: 5,
                raidUnits: [{ type: "spear", count: 2, exp: 0 }],
                defenders: [{ type: "spear", count: 4, exp: 0 }],
                fortified: true,
                raidPending: true,
                seasonsActive: 3
              }
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

  it("returns icons for troubles and lairs", () => {
    const trouble = pack.history!.living!.provinces[1].trouble!;
    const lair = pack.history!.living!.provinces[2].lair!;

    expect(getTroubleIcon(trouble)).toBe("🐺");
    expect(getLairIcon(lair)).toBe("🗡️");
  });

  it("draws markers when trouble layer is on", () => {
    Layers.show("trouble");
    drawTrouble();

    console.log("IDS", [...document.querySelectorAll("#trouble [id]")].map(e => e.id));
    const troubleMarker = document.getElementById("trouble-marker-1");
    const lairMarker = document.getElementById("lair-marker-10");
    const seaLairMarker = document.getElementById("lair-marker-2");

    expect(troubleMarker).not.toBeNull();
    expect(lairMarker).not.toBeNull();
    expect(seaLairMarker).not.toBeNull();
  });

  it("clears content on removeTrouble", () => {
    Layers.show("trouble");
    drawTrouble();
    expect(document.querySelectorAll(".trouble-marker, .lair-marker").length).toBeGreaterThan(0);

    removeTrouble();
    expect(document.querySelectorAll(".trouble-marker, .lair-marker").length).toBe(0);
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

  it("resolves active lair info when hovering a standard marker element", () => {
    const stdMarkerEl = document.getElementById("marker10")!;
    const info = getTroubleOrLairFromElement(stdMarkerEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("lair");
    expect(info?.name).toContain("Red Hand Bandits");
    expect(info?.tip).toContain("Level 5");
    expect(info?.note).toContain("Northshire");
    expect(info?.note).toContain("Defenders");
  });

  it("resolves maritime lair in open waters without a province", () => {
    Layers.show("trouble");
    drawTrouble();

    const seaEl = document.getElementById("lair-marker-2")!;
    const info = getTroubleOrLairFromElement(seaEl);

    expect(info).toBeDefined();
    expect(info?.type).toBe("lair");
    expect(info?.name).toContain("Dread Kraken");
    expect(info?.note).toContain("Maritime Waters");
    expect(info?.note).toContain("Raid Imminent");
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
