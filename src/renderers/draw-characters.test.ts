// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/controllers", () => ({
  Controllers: {
    CharactersEditor: { openDetails: vi.fn() }
  }
}));

import { Controllers } from "@/controllers";
import { Characters } from "@/model/society/characters";
import { drawCharacters, removeCharacters } from "@/renderers/draw-characters";
import { Layers } from "@/renderers/layers";
import { setViewportSize, setViewportTransform } from "@/renderers/viewport/viewport";
import type { PackedGraph } from "@/types/packed-graph";

describe("draw-characters", () => {
  beforeEach(() => {
    setViewportSize(1000, 1000);
    setViewportTransform(1, 0, 0);
    document.body.innerHTML = `
      <svg id="map">
        <g id="viewbox">
          <g id="characters"></g>
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
      cultures: [
        { i: 0, name: "Wildlands", base: "german" },
        { i: 1, name: "Aeloran", base: "german" }
      ],
      factions: [],
      history: { events: [], realms: [], eras: [], figures: [] }
    } as unknown as PackedGraph;
  });

  it("draws background characters and heroes with distinct markers", () => {
    Layers.show("characters");
    Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      cell: 1,
      manual: true,
      role: { type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }
    });
    Characters.add({ name: "Mara", culture: 1, birth: 940, cell: 2, hero: true, archetype: "warden", manual: true });

    drawCharacters();

    const background = document.querySelector("#character0");
    const hero = document.querySelector("#character1");
    expect(background?.getAttribute("data-type")).toBe("character");
    expect(background?.innerHTML).toContain("✧");
    expect(hero?.innerHTML).toContain("★");
    expect(hero?.getAttribute("data-tip")).toContain("Hero");
  });

  it("opens the character detail on click", () => {
    Layers.show("characters");
    const character = Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      cell: 1,
      manual: true,
      role: { type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }
    });
    drawCharacters();

    document
      .querySelector<SVGGElement>(`#character${character.i}`)
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(Controllers.CharactersEditor.openDetails).toHaveBeenCalledWith(character.i);
  });

  it("clears the layer content", () => {
    Layers.show("characters");
    Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      cell: 1,
      manual: true,
      role: { type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }
    });
    drawCharacters();
    expect(document.querySelector("#characters")?.children.length).toBeGreaterThan(0);

    removeCharacters();
    expect(document.querySelector("#characters")?.children.length).toBe(0);
  });
});
