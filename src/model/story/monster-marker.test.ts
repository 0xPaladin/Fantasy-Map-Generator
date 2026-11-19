import { beforeEach, describe, expect, it } from "vitest";
import { ensureGenerated } from "./marker-content";
import type { Marker } from "./markers-generator";
import { Markers } from "./markers-generator";
import { createMonsterContent, MONSTER_KIND, MONSTER_VERSION, monsterContext } from "./monster-marker";
import { Notes } from "./notes";

const CELL = 1;

const makeMarker = (): Marker =>
  ({
    i: 0,
    type: "hill-monsters",
    icon: "",
    x: 10,
    y: 20,
    cell: CELL,
    name: "Aeloran Ogre",
    note: "Folk speak of a great Ogre who inhabits Aeloran hills and steals cattle at night."
  }) as Marker;

beforeEach(() => {
  options.map.seed = "12345";
  globalThis.pack = {
    cells: {
      i: [0, 1],
      culture: Uint8Array.from([1, 1]),
      biome: Uint8Array.from([1, 1]),
      h: Uint8Array.from([60, 60]),
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

describe("monster marker context", () => {
  it("reads the culture, species and habit from the marker", () => {
    const marker = makeMarker();
    marker.generated = {
      kind: MONSTER_KIND,
      version: MONSTER_VERSION,
      seed: "12345",
      meta: { species: "Troll", habit: "terrorizes the region" }
    };

    expect(monsterContext(marker, "12345")).toMatchObject({
      seed: "12345",
      cell: CELL,
      cultureName: "Aeloran",
      alignment: "chaotic",
      biomeName: "Forest",
      name: "Aeloran Ogre",
      species: "Troll",
      habit: "terrorizes the region"
    });
  });

  it("stores only the recipe until the profile is read", () => {
    expect(createMonsterContent()).toEqual({ kind: MONSTER_KIND, version: MONSTER_VERSION, seed: "12345" });
  });

  it("renders the monster profile and caches it", () => {
    const marker = makeMarker();
    marker.generated = { ...createMonsterContent(), meta: { species: "Ogre", habit: "steals cattle at night" } };

    const html = ensureGenerated(marker);
    expect(html).toContain("<h3>Aeloran Ogre</h3>");
    expect(html).toContain("Alternate monster profile");
    expect(html).toContain("Treasure mix");
    expect(marker.generated?.html).toBe(html);
  });

  it("merges the short note and the profile for the notes editor", () => {
    const marker = makeMarker();
    marker.generated = createMonsterContent();
    pack.markers = [marker];

    const full = Notes.getFull({ type: "marker", id: 0 });
    expect(full).toContain("steals cattle at night");
    expect(full).toContain("<hr><h3>Monster profile</h3>");
    expect(full).toContain("<h3>Aeloran Ogre</h3>");
    expect(Notes.get({ type: "marker", id: 0 })).toBe(marker.note);
  });

  it("backfills an older monster through the generic reroll and infers its species", () => {
    const marker = makeMarker();
    pack.markers = [marker];

    Markers.regenerateGeneratedContent(0, "backfill");

    expect(marker.generated).toMatchObject({ kind: MONSTER_KIND, version: MONSTER_VERSION, seed: "12345" });
    expect(marker.generated?.meta).toMatchObject({ species: "Ogre", habit: "steals cattle at night" });
    expect(marker.generated?.html).toContain("Alternate monster profile");
    expect(marker.note).toContain("steals cattle at night");
  });
});
