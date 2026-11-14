// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({
  Layers: { has: () => false, show: vi.fn(), draw: vi.fn(), hide: vi.fn(), isOn: () => false }
}));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));

import {
  CHARACTER_CSV_COLUMNS,
  CharactersEditor,
  characterCsvRows,
  importCharacterCsv,
  openCharacterDetails
} from "@/controllers/society/characters-editor";
import { Characters } from "@/model/society/characters";
import { parseHistory, serializeHistory } from "@/services/io/epochs-format";
import type { Faction } from "@/types/factions";
import type { PackedGraph } from "@/types/packed-graph";
import { dialogState } from "@/ui/dialog/state";

function addFaction(id: number, overrides: Partial<Faction> = {}): Faction {
  return {
    i: id,
    name: `Faction ${id}`,
    removed: false,
    memberIds: [],
    candidateIds: [],
    ...overrides
  } as unknown as Faction;
}

describe("CharactersEditor", () => {
  beforeEach(() => {
    for (const key of ["filters", "sorting", "columns"] as const) dialogState.remove("charactersEditor", key);
    document.body.innerHTML = /* html */ `<div id="dialogs"></div><svg id="viewbox"></svg>`;
    globalThis.options = {
      map: { lore: { calendar: { year: 1000 } } }
    } as unknown as typeof globalThis.options;
    globalThis.pack = {
      cultures: [
        { i: 0, name: "Wildlands", base: "german" },
        { i: 1, name: "Aeloran", base: "german" }
      ],
      factions: [addFaction(1, { name: "Wayfarers" })],
      cells: {
        p: [
          [0, 0],
          [20, 20]
        ]
      },
      history: { events: [], realms: [], eras: [], figures: [] }
    } as unknown as PackedGraph;
  });

  it("renders background characters and heroes", () => {
    Characters.add({ name: "Bran", culture: 1, birth: 950, manual: true });
    Characters.add({ name: "Mara", culture: 1, birth: 940, hero: true, archetype: "warden", manual: true });

    CharactersEditor.open();

    const body = document.querySelector("#charactersBodySection")!;
    expect(body.innerHTML).toContain("Bran");
    expect(body.innerHTML).toContain("Mara");
    expect(body.innerHTML).toContain("Hero");
    expect(document.querySelector("#charactersFooterCount")?.textContent).toBe("2");
    expect(document.querySelector("#charactersFooterHeroes")?.textContent).toBe("1");
  });

  it("derives the faction column from faction membership", () => {
    const character = Characters.add({ name: "Bran", culture: 1, birth: 950 });
    pack.factions = [addFaction(1, { name: "Wayfarers", memberIds: [character.i] })];

    CharactersEditor.open();

    expect(document.querySelector("#charactersBodySection")?.innerHTML).toContain("Wayfarers");
    expect(Characters.get(character.i)).not.toHaveProperty("factionId");
  });

  it("removes a character from the table and restores it", () => {
    const character = Characters.add({ name: "Bran", culture: 1, birth: 950 });
    CharactersEditor.open();

    document.querySelector<HTMLElement>(`#characterRow-${character.i} [data-action="remove"]`)?.click();
    document.querySelector<HTMLButtonElement>(".dialog-buttonset > button")?.click();
    expect(Characters.get(character.i)?.removed).toBe(true);

    CharactersEditor.open();
    const row = document.querySelector<HTMLElement>(`#characterRow-${character.i}`)!;
    expect(row.classList.contains("removed")).toBe(true);
    row.querySelector<HTMLElement>('[data-action="restore"]')?.click();

    expect(Characters.get(character.i)?.removed).toBe(false);
  });

  it("promotes a character, edits dice and attributes, and adds a relation", () => {
    const character = Characters.add({ name: "Bran", culture: 1, birth: 950, manual: true });
    openCharacterDetails(character.i);

    document.querySelector<HTMLElement>("#promoteCharacterButton")?.click();
    expect(Characters.get(character.i)?.hero).toBeDefined();

    const might = document.querySelector<HTMLInputElement>('[data-attr="might"]')!;
    might.value = "2";
    const strike = document.querySelector<HTMLSelectElement>('[data-action="strike"]')!;
    strike.value = "d12";

    document.querySelector<HTMLSelectElement>("#newRelationKind")!.value = "factions";
    document.querySelector<HTMLInputElement>("#newRelationTarget")!.value = "1";
    document.querySelector<HTMLSelectElement>("#newRelationTier")!.value = "Ally";
    document.querySelector<HTMLElement>("#addRelationButton")?.click();
    document.querySelector<HTMLElement>("#saveCharacterButton")?.click();

    const saved = Characters.get(character.i)!;
    expect(saved.hero?.attributes.might).toBe(2);
    expect(saved.hero?.actions.strike).toBe("d12");
    expect(saved.relations?.factions?.[1]).toBe("Ally");

    const { json, snapshotRecords } = serializeHistory(pack.history, 0);
    const loaded = parseHistory(json, snapshotRecords, 0);
    expect(loaded.figures?.[0]?.hero?.attributes.might).toBe(2);
    expect(loaded.figures?.[0]?.hero?.actions.strike).toBe("d12");
  });

  it("imports CSV rows and round-trips the exported shape", () => {
    const character = Characters.add({ name: "Bran", culture: 1, birth: 950, manual: true });
    const header = CHARACTER_CSV_COLUMNS.join(",");
    const row = [character.i, "Bran the Bold", 1, 950, "", "", "", "active", "", "", "", "brave", "note"];

    expect(importCharacterCsv(`${header}\n${row.join(",")}`)).toEqual({ updated: 1, added: 0, skipped: 0 });
    expect(Characters.get(character.i)?.name).toBe("Bran the Bold");

    const rows = characterCsvRows(Characters.all());
    expect(rows[0]).toHaveLength(CHARACTER_CSV_COLUMNS.length);
    expect(rows[0]?.[1]).toBe("Bran the Bold");
  });

  it("regenerates virtues and vices from the selected alignment", () => {
    const character = Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      alignment: "lawful",
      virtues: ["just"],
      vices: ["proud"],
      manual: true
    });
    openCharacterDetails(character.i);

    const alignmentSelect = document.querySelector<HTMLSelectElement>("#characterAlignment")!;
    alignmentSelect.value = "good";
    document.querySelector<HTMLButtonElement>("#regenerateCharacterTraitsButton")!.click();

    const virtues = document
      .querySelector<HTMLInputElement>("#characterVirtues")!
      .value.split(",")
      .map(s => s.trim())
      .filter(Boolean);
    const vices = document
      .querySelector<HTMLInputElement>("#characterVices")!
      .value.split(",")
      .map(s => s.trim())
      .filter(Boolean);
    expect(virtues).toHaveLength(3);
    expect(vices).toHaveLength(0);

    alignmentSelect.value = "";
    document.querySelector<HTMLButtonElement>("#regenerateCharacterTraitsButton")!.click();
    expect(document.querySelector<HTMLInputElement>("#characterVirtues")!.value).toBe("");
    expect(document.querySelector<HTMLInputElement>("#characterVices")!.value).toBe("");
  });
});
