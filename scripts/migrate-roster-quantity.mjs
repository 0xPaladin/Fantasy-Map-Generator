// One-shot roster migration (living-openciv-armies.md §13.2):
//   blocks × MEN_PER_BLOCK → quantity
//   upkeep × UPKEEP_SCALE  → Gold-per-tick at hp 1 (baseline block = 0.1)
//   cost = round(upkeep × PRODUCTION_PER_UPKEEP) → Production to raise one block
// Idempotent: a file already carrying `quantity` is left alone.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "conquest", "content", "docs", "rosters");
const MEN_PER_BLOCK = 1000;
const BASELINE_UPKEEP = 0.1; // Gold per tick for a median block
const PRODUCTION_PER_UPKEEP = 250; // floor 5 so the weakest militia still takes a tick or two

const round = (v, d = 0) => Number(v.toFixed(d));

const files = readdirSync(DIR).filter(f => f.endsWith(".json"));
const all = files.map(f => ({ file: f, doc: JSON.parse(readFileSync(join(DIR, f), "utf8")) }));

// 1. Measure the scale across every unit that still uses the Conquest scale.
const upkeepValues = [];
for (const { doc } of all) {
  for (const u of Object.values(doc.roster?.units ?? {})) {
    if (u.quantity === undefined && typeof u.upkeep === "number") upkeepValues.push(u.upkeep);
  }
}
if (upkeepValues.length === 0) {
  console.log("nothing to migrate — every roster already authors quantity");
  process.exit(0);
}
upkeepValues.sort((a, b) => a - b);
const median = upkeepValues[Math.floor(upkeepValues.length / 2)];
const UPKEEP_SCALE = round(BASELINE_UPKEEP / median, 6);
console.log(`units: ${upkeepValues.length}  median upkeep: ${median}  UPKEEP_SCALE: ${UPKEEP_SCALE}`);

let units = 0;
const before = { quantity: [], upkeep: [], cost: [] };
for (const { doc, file } of all) {
  const roster = doc.roster;
  if (!roster?.units) continue;
  let touched = false;
  for (const [id, u] of Object.entries(roster.units)) {
    if (u.quantity !== undefined) continue;
    if (u.blocks === undefined) continue;
    const quantity = Math.max(1, Math.round(u.blocks * MEN_PER_BLOCK));
    const upkeep = round(u.upkeep * UPKEEP_SCALE, 3);
    const cost = Math.max(5, Math.round(upkeep * PRODUCTION_PER_UPKEEP));
    before.quantity.push(quantity);
    before.upkeep.push(upkeep);
    before.cost.push(cost);
    roster.units[id] = {
      name: u.name,
      category: u.category,
      quantity,
      attack: u.attack,
      defense: u.defense,
      charge: u.charge,
      missile: u.missile,
      cost,
      upkeep,
      ...(u.capacityCost ? { capacityCost: u.capacityCost } : {}),
      ...(u.requiresGood !== undefined ? { requiresGood: u.requiresGood } : {}),
      ...(u.requiresWallTier !== undefined ? { requiresWallTier: u.requiresWallTier } : {}),
      ...(u.powers ? { powers: u.powers } : {}),
      ...(u.resistArcane !== undefined ? { resistArcane: u.resistArcane } : {}),
      ...(u.troubleRole ? { troubleRole: u.troubleRole } : {})
    };
    touched = true;
    units += 1;
  }
  if (touched) {
    writeFileSync(join(DIR, file), JSON.stringify(doc, null, 2) + "\n");
  }
}

const stat = arr => {
  const s = [...arr].sort((a, b) => a - b);
  return { min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};
console.log(`migrated units: ${units}`);
console.log("quantity:", JSON.stringify(stat(before.quantity)));
console.log("upkeep:", JSON.stringify(stat(before.upkeep)));
console.log("cost:", JSON.stringify(stat(before.cost)));
console.log(`baseline block: upkeep ${BASELINE_UPKEEP} Gold, cost ${Math.round(BASELINE_UPKEEP * PRODUCTION_PER_UPKEEP)} Production`);
