import { beforeEach, describe, expect, it } from "vitest";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { Notes } from "./notes";
import { createRuinContent, RUIN_KIND, RUIN_VERSION, ruinContext } from "./ruin-marker";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "ruins",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Ruins of Vaelen",
    note: "A historical ruin."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([42, 42]),
      state: Uint8Array.from([1, 1]),
      province: Uint8Array.from([1, 1]),
      religion: Uint8Array.from([1, 1])
    },
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Aeloran", alignment: "chaotic" }
    ],
    biomes: [
      { i: 0, name: "" },
      { i: 1, name: "Forest" }
    ],
    states: [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Ardenia" }
    ],
    provinces: [
      { i: 0, name: "" },
      { i: 1, name: "Green March" }
    ],
    religions: [
      { i: 0, name: "" },
      { i: 1, name: "The Dawn" }
    ],
    markers: []
  } as unknown as typeof pack;
});

describe("ruin marker context", () => {
  it("reads the culture, alignment and history metadata from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: RUIN_KIND,
      version: RUIN_VERSION,
      seed: "12345",
      meta: {
        tier: "city",
        originalName: "Vaelen",
        originalPolity: "Old Vaelen",
        fallYear: 512,
        cause: "a curse",
        looted: true,
        clearedBy: "King Alden"
      }
    };

    expect(ruinContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Ruins of Vaelen",
      tier: "city",
      originalName: "Vaelen",
      originalPolity: "Old Vaelen",
      fallYear: 512,
      cause: "a curse",
      looted: true,
      clearedBy: "King Alden"
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createRuinContent()).toEqual({ kind: RUIN_KIND, version: RUIN_VERSION, seed: "12345" });
  });

  it("renders the ruin profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = createRuinContent();

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Ruins of Vaelen</h3>");
    expect(html).toContain("Alternate ruin profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createRuinContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("A historical ruin.");
    expect(full).toContain("<hr><h3>Ruin profile</h3>");
    expect(full).toContain("<h3>Ruins of Vaelen</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe("A historical ruin.");
  });

  it("backfills an older ruin through the generic reroll", () => {
    const marker = makeMarker();
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: RUIN_KIND, version: RUIN_VERSION, seed: "12345" });
    expect(marker.generated?.html).toContain("Alternate ruin profile");
    expect(marker.note).toBe("A historical ruin.");
  });
});
