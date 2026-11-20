// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { draw, pushNews } = vi.hoisted(() => ({ draw: vi.fn(), pushNews: vi.fn() }));
vi.mock("@/renderers/layers", () => ({ Layers: { draw } }));
vi.mock("@/model/physical/living-generator", () => ({ Living: { pushNews } }));

import { isDungeonMarker, openPartyPicker, openPartyPickerForCharacter } from "@/controllers/story/delve-screen";
import { Characters } from "@/model/society/characters";
import type { Marker } from "@/model/story/markers-generator";
import type { PackedGraph } from "@/types/packed-graph";

const marker: Marker = {
  i: 0,
  type: "dungeons",
  icon: "dungeons",
  x: 0,
  y: 0,
  cell: 7,
  name: "Test Keep",
  generated: { kind: "dungeon", version: 1, seed: "small-6" }
};

let heroIds: number[];

describe("DelveScreen", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="dialogs"></div><svg id="viewbox"></svg>';
    globalThis.options = {
      app: { mode: null },
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof globalThis.options;
    globalThis.pack = {
      markers: [{ ...marker, generated: { ...marker.generated! } }],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Aeloran" }
      ],
      cells: {},
      history: { events: [], realms: [], eras: [], figures: [], living: { tick: 1 } }
    } as unknown as PackedGraph;

    const first = Characters.add({
      name: "Kael",
      culture: 1,
      birth: 950,
      hero: true,
      archetype: "warden",
      manual: true
    });
    const second = Characters.add({
      name: "Mira",
      culture: 1,
      birth: 940,
      hero: true,
      archetype: "ranger",
      manual: true
    });
    heroIds = [first.i, second.i];
    draw.mockClear();
    pushNews.mockClear();
  });

  it("lists the living characters and dispatches the selected party", () => {
    openPartyPicker(0);
    expect(document.getElementById("delvePicker")).toBeTruthy();
    expect(document.querySelectorAll("#delvePickerBody input[type=checkbox]")).toHaveLength(2);

    const first = document.querySelector<HTMLInputElement>(`#delvePickerBody input[data-hero="${heroIds[0]}"]`)!;
    first.checked = true;
    first.dispatchEvent(new Event("change", { bubbles: true }));

    const second = document.querySelector<HTMLInputElement>(`#delvePickerBody input[data-hero="${heroIds[1]}"]`)!;
    second.checked = true;
    second.dispatchEvent(new Event("change", { bubbles: true }));

    expect(document.getElementById("delveSelectedCount")?.textContent).toBe("2/6");
    document.getElementById("delveDispatch")!.click();

    expect(document.getElementById("delveReport")).toBeTruthy();
    expect(pack.history.delves).toHaveLength(1);
    expect(pack.history.delves?.[0].party).toHaveLength(2);
    expect(pack.markers[0].delve).toBeDefined();
    expect(pack.markers[0].note).toContain("Delve record");
    expect(pushNews).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "delve" }));
    expect(draw).toHaveBeenCalledWith("markers");
  });

  it("steps the log and reveals the outcome", () => {
    openPartyPicker(0);
    const first = document.querySelector<HTMLInputElement>(`#delvePickerBody input[data-hero="${heroIds[0]}"]`)!;
    first.checked = true;
    first.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("delveDispatch")!.click();

    const log = document.getElementById("delveLog")!;
    expect(log.children).toHaveLength(0);

    document.getElementById("delveStep")!.click();
    expect(log.children.length).toBeGreaterThan(0);

    document.getElementById("delveShowAll")!.click();
    expect(document.getElementById("delveOutcome")?.textContent).not.toBe("");
  });

  it("chooses a dungeon from the character sheet flow", () => {
    openPartyPickerForCharacter(heroIds[0]);
    expect(document.getElementById("delveDungeonChooser")).toBeTruthy();

    document.querySelector<HTMLElement>(".delveDungeon")!.click();

    expect(document.getElementById("delvePicker")).toBeTruthy();
    const checkbox = document.querySelector<HTMLInputElement>(`#delvePickerBody input[data-hero="${heroIds[0]}"]`);
    expect(checkbox?.checked).toBe(true);
  });

  it("only treats dungeon markers as delve sites", () => {
    expect(isDungeonMarker(marker)).toBe(true);
    expect(isDungeonMarker({ ...marker, type: "ruins", generated: undefined })).toBe(false);
  });
});
