// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/renderers/layers", () => ({
  Layers: { has: () => false, show: vi.fn(), draw: vi.fn(), hide: vi.fn(), isOn: () => false }
}));
vi.mock("@/ui/map/zoom", () => ({ zoomTo: vi.fn() }));

const { schemesOpen, delveOpen } = vi.hoisted(() => ({ schemesOpen: vi.fn(), delveOpen: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: {
    SchemesOverview: { open: schemesOpen },
    DelveScreen: { openPartyPickerForCharacter: delveOpen }
  }
}));

import {
  CHARACTER_CSV_COLUMNS,
  CharactersEditor,
  characterCsvRows,
  importCharacterCsv,
  openCharacterDetails
} from "@/controllers/society/characters-editor";
import { HERO_ATTRIBUTE_SPREADS, heroStartingPackage } from "@/data/character-actions";
import { TRAIT_COUNTS } from "@/data/culture-traits";
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
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Aeloria" }
      ],
      burgs: [{}, { i: 1, name: "Aelor" }],
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

  it("marks villains and opens their scheme", () => {
    const villain = Characters.add({ name: "Nerath", culture: 1, birth: 900, manual: true });
    Characters.add({ name: "Bran", culture: 1, birth: 950, manual: true });
    pack.history!.schemes = [
      {
        i: 3,
        goal: "divine_ascension",
        mastermind: { kind: "religion", id: 1 },
        villainFigure: villain.i,
        template: "holy_crusade",
        secrecy: 40,
        steps: [],
        status: "active",
        startedYear: 990
      }
    ] as never;

    CharactersEditor.open();

    const header = document.querySelector('#charactersEditorHeader [data-col="villain"]');
    expect(header?.textContent).toContain("Villain");

    const row = document.querySelector(`#characterRow-${villain.i}`)!;
    expect(row.querySelector('[data-col="villain"]')?.textContent).toContain("Yes");
    (row.querySelector('[data-action="scheme"]') as HTMLButtonElement).click();
    expect(schemesOpen).toHaveBeenCalledWith({ schemeId: 3 });
  });

  it("orders the columns and names each role's target", () => {
    const character = Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      manual: true,
      roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 900 }]
    });

    CharactersEditor.open();

    const headers = [...document.querySelectorAll("#charactersEditorHeader [data-col]")].map(header =>
      header.getAttribute("data-col")
    );
    expect(headers.slice(1, 5)).toEqual(["name", "status", "age", "culture"]);

    const row = document.querySelector(`#characterRow-${character.i}`)!;
    expect(row.querySelector('[data-col="role"]')?.textContent).toBe("Ruler Aeloria");
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

    const dialog = document.querySelector("#characterDetailsDialog")!;
    expect([...dialog.querySelectorAll("h4")].map(heading => heading.textContent)).toContain("Hero");
    expect(dialog.querySelector("#promoteCharacterButton")).toBeNull();

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

  it("selects an archetype and rerolls the hero's stats from it", () => {
    const character = Characters.add({
      name: "Mara",
      culture: 1,
      birth: 940,
      hero: true,
      archetype: "freeblade",
      manual: true
    });
    openCharacterDetails(character.i);

    const select = document.querySelector<HTMLSelectElement>("#characterArchetype")!;
    expect(select.value).toBe("freeblade");
    select.value = "warden";
    document.querySelector<HTMLElement>("#rerollHeroButton")!.click();

    const hero = Characters.get(character.i)!.hero!;
    const start = heroStartingPackage("warden");
    expect(hero.archetype).toBe("warden");
    const allowed = HERO_ATTRIBUTE_SPREADS.map(spread => [...spread].sort((a, b) => a - b));
    const values = Object.values(hero.attributes).sort((a, b) => a - b);
    expect(allowed.some(spread => spread.every((value, index) => value === values[index]))).toBe(true);
    expect(hero.actions).toEqual(start.actions);
    expect(hero.abilities).toEqual([start.ability]);
  });

  it("gives a new hero full Resolve and Stamina from its archetype", () => {
    const character = Characters.add({
      name: "Mara",
      culture: 1,
      birth: 940,
      hero: true,
      archetype: "warden",
      manual: true
    });
    expect(character.hero?.condition?.resolve).toBeGreaterThan(0);
    expect(character.hero?.condition?.stamina).toBeGreaterThan(0);

    openCharacterDetails(character.i);
    const resolve = document.querySelector<HTMLInputElement>("#heroResolve")!;
    const stamina = document.querySelector<HTMLInputElement>("#heroStamina")!;
    expect(Number(resolve.value)).toBeGreaterThan(0);
    expect(Number(stamina.value)).toBeGreaterThan(0);
  });

  it("edits a character's location as a burg or marker pairing", () => {
    pack.burgs = [{ i: 0 }, { i: 1, name: "Aelor", cell: 12 }] as unknown as typeof pack.burgs;
    pack.markers = [
      { i: 0, type: "ruins", icon: "ruins", x: 0, y: 0, cell: 33, name: "Old Barrow" }
    ] as unknown as typeof pack.markers;

    const character = Characters.add({ name: "Mara", culture: 1, birth: 940, manual: true });
    openCharacterDetails(character.i);

    const kind = document.querySelector<HTMLSelectElement>("#characterLocationKind")!;
    const target = document.querySelector<HTMLSelectElement>("#characterLocationTarget")!;
    expect(kind.value).toBe("none");
    expect(target.disabled).toBe(true);

    kind.value = "marker";
    kind.dispatchEvent(new Event("change"));
    expect(target.disabled).toBe(false);
    expect([...target.options].map(option => option.textContent)).toContain("Old Barrow");

    target.value = "33";
    document.querySelector<HTMLElement>("#saveCharacterButton")!.click();
    expect(Characters.get(character.i)?.cell).toBe(33);

    openCharacterDetails(character.i);
    expect(document.querySelector<HTMLSelectElement>("#characterLocationKind")!.value).toBe("marker");
    expect(document.querySelector<HTMLSelectElement>("#characterLocationTarget")!.value).toBe("33");

    const burgKind = document.querySelector<HTMLSelectElement>("#characterLocationKind")!;
    const burgTarget = document.querySelector<HTMLSelectElement>("#characterLocationTarget")!;
    burgKind.value = "burg";
    burgKind.dispatchEvent(new Event("change"));
    burgTarget.value = "12";
    document.querySelector<HTMLElement>("#saveCharacterButton")!.click();

    expect(Characters.get(character.i)?.cell).toBe(12);
  });

  it("offers a hero the delve flow from the sheet", () => {
    const character = Characters.add({ name: "Mara", culture: 1, birth: 940, hero: true, manual: true });
    openCharacterDetails(character.i);
    delveOpen.mockClear();

    document.querySelector<HTMLElement>("#delveCharacterButton")!.click();
    expect(delveOpen).toHaveBeenCalledWith(character.i);
  });

  it("lays the hero stats out in rows without Push or progression fields", () => {
    const character = Characters.add({ name: "Mara", culture: 1, birth: 940, hero: true, manual: true });
    openCharacterDetails(character.i);

    const dialog = document.querySelector("#characterDetailsDialog")!;
    for (const id of ["heroPush", "heroAppliedLevel", "heroPendingChoices", "heroPicks"])
      expect(dialog.querySelector(`#${id}`)).toBeNull();

    const at = (markup: string) => dialog.innerHTML.indexOf(markup);
    expect(at('id="characterArchetype"')).toBeLessThan(at('id="heroXp"'));
    expect(at('id="heroXp"')).toBeLessThan(at('data-attr="might"'));
    expect(at('data-attr="might"')).toBeLessThan(at('data-action="strike"'));
    expect(at('data-action="survive"')).toBeLessThan(at('data-action="investigate"'));
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

  it("selects alignment and rerolls the combined virtues and vices from the row", () => {
    const character = Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      alignment: "lawful",
      virtues: ["just"],
      vices: ["proud"],
      manual: true
    });
    CharactersEditor.open();

    const row = document.querySelector(`#characterRow-${character.i}`)!;
    const select = row.querySelector<HTMLSelectElement>('[data-action="alignment"]')!;
    expect(select.value).toBe("lawful");
    expect(row.querySelector('[data-col="traits"]')?.textContent).toContain("just, proud");

    select.value = "good";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(Characters.get(character.i)?.alignment).toBe("good");

    row.querySelector('[data-action="reroll-traits"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const updated = Characters.get(character.i)!;
    expect(updated.alignment).toBe("good");
    const counts = TRAIT_COUNTS.good;
    expect(updated.virtues).toHaveLength(counts.virtues);
    expect(updated.vices).toHaveLength(counts.vices);
  });

  it("drops traits from the sheet, tables roles and relations, and shows no Hero section for background characters", () => {
    const character = Characters.add({
      name: "Bran",
      culture: 1,
      birth: 950,
      alignment: "lawful",
      virtues: ["just"],
      vices: ["proud"],
      manual: true,
      roles: [{ type: "ruler", target: { kind: "state", id: 1 }, from: 900 }],
      relations: { factions: { 1: "Ally" } }
    });
    openCharacterDetails(character.i);

    const dialog = document.querySelector("#characterDetailsDialog")!;
    expect(dialog.querySelector("#characterAlignment")).toBeNull();
    expect(dialog.querySelector("#characterVirtues")).toBeNull();
    expect(dialog.querySelector("#characterVices")).toBeNull();

    expect(dialog.querySelector("#characterRolesRows")?.tagName).toBe("TBODY");
    expect(dialog.querySelector("#characterRelationsRows")?.tagName).toBe("TBODY");
    expect(dialog.querySelector("#characterRolesRows tr")).not.toBeNull();
    expect(dialog.querySelector("#characterRelationsRows")?.textContent).toContain("Wayfarers");

    const promote = dialog.querySelector("#promoteCharacterButton")!;
    expect(promote.nextElementSibling?.id).toBe("saveCharacterButton");
    expect(dialog.querySelector('label[for="newRelationKind"]')).toBeNull();

    const headings = [...dialog.querySelectorAll("h4")].map(heading => heading.textContent);
    expect(headings).not.toContain("Hero");
    expect(headings.indexOf("Roles")).toBeLessThan(headings.indexOf("Relations"));

    document.querySelector<HTMLElement>("#saveCharacterButton")?.click();
    const saved = Characters.get(character.i)!;
    expect(saved.alignment).toBe("lawful");
    expect(saved.virtues).toEqual(["just"]);
    expect(saved.vices).toEqual(["proud"]);
  });
});
