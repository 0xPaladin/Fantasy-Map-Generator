import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { systemBlocks } from "./context";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

test("cached instructions contain the map rules, operations and data fields", () => {
  const [cached] = systemBlocks();
  expect(cached.text).toContain("read_help");
  expect(cached.text).toContain("read_docs");
  expect(cached.text).toContain("propose_change");
  expect(cached.text).toMatch(/^Burgs: rename, setPopulation, /m);
  expect(cached.text).toContain("Notes: write");
  expect(cached.text).toMatch(/^Burgs: i, name, cell/m);
  expect(cached.cache_control).toEqual({ type: "ephemeral" });
});

// About 3.5 characters per token: keeps the fixed prompt under about 4.7k tokens.
// The multi-realm (sky/underdark/underwater) networks add their fields and operations; 16_500 still fits the budget.
test("cached instructions stay compact", () => {
  const [cached] = systemBlocks();
  expect(cached.text.length).toBeLessThan(16_500);
});

test("generated context matches the codebase and Knowledge Base", () => {
  expect(() =>
    execFileSync("node", ["scripts/generate-assistant-context.mjs", "--check"], { cwd: root })
  ).not.toThrow();
}, 20_000);

test("without custom content there is exactly the built-in block", () => {
  const empty = systemBlocks();
  expect(empty).toHaveLength(1);
  expect(empty).toEqual(systemBlocks({ instructions: "", skills: [] }));
  expect(empty).toEqual(systemBlocks({ instructions: "  ", skills: [] }));
});

test("the user's instructions join as a second block after the unchanged built-in one", () => {
  const blocks = systemBlocks({ instructions: "Name rivers after local saints.", skills: [] });
  expect(blocks).toHaveLength(2);
  expect(blocks[0].text).toBe(systemBlocks()[0].text); // byte-identical built-in prompt
  expect(blocks[0]).not.toHaveProperty("cache_control");
  expect(blocks[1].text).toContain("# The user's instructions");
  expect(blocks[1].text).toContain("Name rivers after local saints.");
  expect(blocks[1].text).toContain("the rules above still hold when they conflict");
  expect(blocks[1].cache_control).toEqual({ type: "ephemeral" });
});

test("enabled skills join as a final index block telling the model to read them", () => {
  const blocks = systemBlocks({
    instructions: "Be terse.",
    skills: [
      { name: "Naming", description: "How to name things here" },
      { name: "Heraldry", description: "The realm's coat-of-arms conventions" }
    ]
  });
  expect(blocks).toHaveLength(3);
  expect(blocks[1].text).toContain("Be terse.");
  expect(blocks[2].text).toContain("# Skills");
  expect(blocks[2].text).toContain("- Naming: How to name things here");
  expect(blocks[2].text).toContain("- Heraldry: The realm's coat-of-arms conventions");
  expect(blocks[2].text).toContain('read_skill("<name>")');
  expect(blocks[2].cache_control).toEqual({ type: "ephemeral" });
});
