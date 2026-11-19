import { beforeEach, describe, expect, it } from "vitest";
import { BANDIT_KIND, BANDIT_VERSION, banditContext, createBanditContent } from "./bandit-marker";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "brigands",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Aeloran Wolves",
    note: "A gang of forest brigands."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([40, 40]),
      pop: Uint8Array.from([5, 5])
    },
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "Aeloran", alignment: "chaotic" }
    ],
    biomes: [
      { i: 0, name: "" },
      { i: 1, name: "Forest" }
    ],
    markers: []
  } as unknown as typeof pack;
});

describe("bandit marker context", () => {
  it("reads the culture, gang, locality and maritime flag from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: BANDIT_KIND,
      version: BANDIT_VERSION,
      seed: "12345",
      meta: { gang: "Wolves", locality: "forest", maritime: false }
    };

    expect(banditContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Aeloran Wolves",
      gang: "Wolves",
      locality: "forest",
      maritime: false
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createBanditContent()).toEqual({ kind: BANDIT_KIND, version: BANDIT_VERSION, seed: "12345" });
  });

  it("renders the bandit profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createBanditContent(), meta: { gang: "Wolves", locality: "forest" } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Aeloran Wolves</h3>");
    expect(html).toContain("Alternate bandit profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createBanditContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("forest brigands");
    expect(full).toContain("<hr><h3>Bandit profile</h3>");
    expect(full).toContain("<h3>Aeloran Wolves</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older brigand through the generic reroll and infers its gang", () => {
    const marker = makeMarker();
    marker.name = "Aeloran Bears";
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: BANDIT_KIND, version: BANDIT_VERSION, seed: "12345" });
    expect(marker.generated?.meta).toMatchObject({ gang: "Bears", locality: "forest" });
    expect(marker.generated?.html).toContain("Alternate bandit profile");
    expect(marker.note).toContain("forest brigands");
  });

  it("infers a maritime flag for an older pirate marker", () => {
    const marker = {
      ...makeMarker(),
      type: "pirates",
      name: "Pirates",
      note: "Pirate ships have been spotted."
    } as Marker;
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated?.meta).toMatchObject({ maritime: true, locality: "coastal" });
    expect(marker.generated?.html).toContain("Alternate bandit profile");
  });
});
