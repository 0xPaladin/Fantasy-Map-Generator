/**
 * Calibration guard for the Living World army economy
 * (living-openciv-armies.md §10.1).
 *
 * Income is measured on a real map instead of guessed: the sample world is
 * decompressed to the runtime pack shape, stale armies are cleared, and the
 * Living World runs 12 seasons. The assertions are deliberately loose — they
 * do not pin exact yields, they fail when the *derived* constants stop being
 * sane against the measured economy, which is the moment recalibration is due.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentContent } from "@/conquest/content/store";

const raw = JSON.parse(readFileSync("src/conquest/test-data/sample-world.json", "utf8"));

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
};

/** FMG serializes cells as objects; the runtime model wants columns. */
function decompressCells(rows: Array<Record<string, unknown>>): Record<string, unknown> {
  const columns: Record<string, unknown[]> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (!columns[key]) columns[key] = [];
      columns[key].push(value);
    }
  }
  const cells: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(columns)) {
    cells[key] = Array.isArray(values[0]) ? values : Float64Array.from(values as number[]);
  }
  cells.p = rows.map(row => row.p);
  cells.c = rows.map(row => row.c);
  cells.v = rows.map(row => row.v);
  return cells;
}

describe("Living World army economy calibration", () => {
  it("keeps a burg's 30% army budget at a plausible block count", async () => {
    const { Living } = await import("./living-generator");

    const rawPack = raw.pack as { cells: Array<Record<string, unknown>>; states: Array<{ military?: unknown[] }> };
    (rawPack as Record<string, unknown>).cells = decompressCells(rawPack.cells);
    for (const state of rawPack.states) if (state) state.military = [];

    (globalThis as unknown as { options: unknown }).options = {
      ...(raw.settings as Record<string, unknown>),
      map: {
        seed: "sample-world",
        population: { ruralFactor: 1, urbanization: 1 },
        lore: {
          name: "Sample World",
          description: "",
          calendar: { year: 1000, era: "Age of Dawn", eraShort: "AD" },
          history: { span: 500, realms: 0, density: 1, echoes: false, renames: false, mode: "archaeologist" }
        }
      },
      generation: { cultures: { traits: true }, states: { limit: 4, sizeVariety: 2, growthRate: 1 } }
    };
    (globalThis as unknown as { pack: unknown }).pack = rawPack;

    const living = Living.init();
    for (let i = 0; i < 12; i++) Living.tick(1);

    const cityBurgs = Object.values(living.burgs).filter(b => b.cityYields && (b.citizens ?? 0) > 0);
    expect(cityBurgs.length).toBeGreaterThan(50);

    const goldPerBurg = median(cityBurgs.map(b => b.cityYields!.gold));
    const productionPerBurg = median(cityBurgs.map(b => b.cityYields!.production));

    // A burg should earn a few coins a season, not one and not twenty.
    expect(goldPerBurg).toBeGreaterThanOrEqual(2);
    expect(goldPerBurg).toBeLessThanOrEqual(5);
    expect(productionPerBurg).toBeGreaterThanOrEqual(3);

    const { content } = currentContent();
    const types = Object.values(content.unitTypes);
    const upkeepPerBlock = median(types.map(u => u.upkeep));
    const costPerBlock = median(types.map(u => u.cost));

    // 30% of a burg's gold, spent on upkeep, buys a plausible garrison.
    const blocksPerBurg = (0.3 * goldPerBurg) / upkeepPerBlock;
    expect(blocksPerBurg).toBeGreaterThanOrEqual(3);
    expect(blocksPerBurg).toBeLessThanOrEqual(7);

    // Raising one block should take under a dozen seasons of a median city.
    expect(costPerBlock / Math.max(1, productionPerBurg)).toBeLessThanOrEqual(10);
  }, 600_000);
});
