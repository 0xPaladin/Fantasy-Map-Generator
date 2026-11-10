// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/controllers", () => ({
  Controllers: {
    FactionsEditor: { open: vi.fn() }
  }
}));

import { Controllers } from "@/controllers";
import { Factions } from "@/model/political/factions-generator";
import { drawFactions, removeFactions } from "@/renderers/draw-factions";
import { Layers } from "@/renderers/layers";
import { setViewportSize, setViewportTransform } from "@/renderers/viewport/viewport";
import type { Faction } from "@/types/factions";

describe("draw-factions", () => {
  beforeEach(() => {
    setViewportSize(1000, 1000);
    setViewportTransform(1, 0, 0);

    document.body.innerHTML = `
      <svg id="map">
        <g id="viewbox">
          <g id="factions"></g>
        </g>
      </svg>
    `;

    globalThis.pack = {
      cells: {
        p: [
          [0, 0],
          [50, 50],
          [100, 100]
        ]
      },
      burgs: [
        { i: 0 },
        { i: 1, name: "Aelor", x: 50, y: 50, cell: 1 },
        { i: 2, name: "Oakhaven", x: 100, y: 100, cell: 2 }
      ],
      markers: [],
      states: [{ i: 0 }, { i: 1, name: "Aeloria" }],
      provinces: [{ i: 0 }, { i: 1, name: "Heartland" }],
      factions: [{ i: 0 } as Faction]
    } as unknown as typeof pack;
  });

  it("renders faction HQ pins, outposts, and connection lines", () => {
    Layers.show("factions");

    const faction = Factions.add({
      name: "Iron Guild",
      category: "commercial",
      type: "merchant_consortium",
      color: "#f59e0b",
      icon: "⚖️",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] },
      outposts: [
        {
          burgId: 2,
          cell: 2,
          tier: 1,
          influence: 40,
          secrecy: 0,
          assets: ["trade_depot"],
          establishedYear: 1000
        }
      ]
    });

    drawFactions();

    const container = document.querySelector("#factions")!;
    expect(container).not.toBeNull();

    // Check HQ pin
    const hqPin = container.querySelector(`#faction-hq-${faction.i}`);
    expect(hqPin).not.toBeNull();
    expect(hqPin?.getAttribute("data-type")).toBe("faction");
    expect(hqPin?.getAttribute("data-id")).toBe(String(faction.i));
    expect(hqPin?.innerHTML).toContain("⚖️");

    // Check Outpost pin
    const outpostPin = container.querySelector(`[data-outpost-burg="2"]`);
    expect(outpostPin).not.toBeNull();
    expect(outpostPin?.getAttribute("data-id")).toBe(String(faction.i));

    // Check connection line
    const linesGroup = container.querySelector("#factionLines");
    expect(linesGroup?.innerHTML).toContain("<path d=");
  });

  it("clears content on removeFactions", () => {
    Layers.show("factions");

    Factions.add({
      name: "Silent Daggers",
      category: "underworld",
      type: "thieves_guild",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 50, assets: [] }
    });

    drawFactions();
    expect(document.querySelector("#factionHQs")?.children.length).toBeGreaterThan(0);

    removeFactions();
    expect(document.querySelector("#factions")?.children.length).toBe(0);
  });

  it("triggers Controllers.FactionsEditor.open when clicking on a faction pin", () => {
    Layers.show("factions");

    const faction = Factions.add({
      name: "Vanguard",
      category: "martial",
      type: "mercenary_company",
      hq: { cell: 1, burgId: 1, fortified: false, secrecy: 0, assets: [] }
    });

    drawFactions();

    const hqPin = document.querySelector(`#faction-hq-${faction.i}`)!;
    hqPin.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(Controllers.FactionsEditor.open).toHaveBeenCalledWith(faction.i);
  });
});
