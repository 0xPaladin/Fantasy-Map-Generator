import { beforeEach, describe, expect, it } from "vitest";
import {
  deletePrompt,
  deleteSkill,
  getInstructions,
  INSTRUCTIONS_LIMIT,
  importFile,
  instructionsToMarkdown,
  listPrompts,
  listSkills,
  readSkill,
  saveInstructions,
  savePrompt,
  saveSkill,
  skillToMarkdown
} from "./customization";

const reset = (): void => {
  saveInstructions("");
  for (const skill of listSkills()) deleteSkill(skill.id);
  for (const prompt of listPrompts()) deletePrompt(prompt.id);
};

beforeEach(reset);

describe("instructions", () => {
  it("save, read back and cap at the limit", () => {
    expect(getInstructions()).toBe("");
    saveInstructions("Always name rivers after local saints.");
    expect(getInstructions()).toBe("Always name rivers after local saints.");
    saveInstructions("x".repeat(INSTRUCTIONS_LIMIT + 500));
    expect(getInstructions()).toHaveLength(INSTRUCTIONS_LIMIT);
  });
});

describe("skills", () => {
  it("create, update, enable and delete", () => {
    const skill = saveSkill({ name: "Naming", description: "How to name things", body: "Use old tongues." });
    expect(listSkills()).toHaveLength(1);
    expect(skill.enabled).toBe(true);

    saveSkill({ id: skill.id, name: "Naming", description: "Updated", body: "New body", enabled: false });
    const [updated] = listSkills();
    expect(updated.description).toBe("Updated");
    expect(updated.enabled).toBe(false);

    expect(readSkill("naming")).toBeUndefined(); // disabled skills are not served
    saveSkill({ id: skill.id, name: "Naming", enabled: true });
    expect(readSkill("Naming")).toBe("New body");
    expect(readSkill("  NAMING ")).toBe("New body");

    deleteSkill(skill.id);
    expect(listSkills()).toEqual([]);
    expect(readSkill("Naming")).toBeUndefined();
  });

  it("reject empty and duplicate names, and updates of a deleted skill", () => {
    saveSkill({ name: "Naming", body: "b" });
    expect(() => saveSkill({ name: "  ", body: "b" })).toThrow(/name/i);
    expect(() => saveSkill({ name: "naming", body: "b" })).toThrow(/already exists/);
    expect(() => saveSkill({ id: "missing", name: "Ghost", body: "b" })).toThrow(/deleted/);
    expect(listSkills()).toHaveLength(1);
  });

  it("cap name, description and body", () => {
    const skill = saveSkill({ name: `n`.repeat(60), description: `d`.repeat(200), body: `b`.repeat(64_000) });
    expect(skill.name).toHaveLength(40);
    expect(skill.description).toHaveLength(120);
    expect(skill.body).toHaveLength(32_000);
  });
});

describe("prompts", () => {
  it("create, update, delete and reject duplicates", () => {
    const prompt = savePrompt({ name: "Lore pass", text: "Describe every state." });
    savePrompt({ id: prompt.id, name: "Lore pass", text: "Describe every state, tersely." });
    expect(listPrompts()[0].text).toBe("Describe every state, tersely.");
    expect(() => savePrompt({ name: "lore pass", text: "x" })).toThrow(/already exists/);
    deletePrompt(prompt.id);
    expect(listPrompts()).toEqual([]);
  });
});

describe("markdown files", () => {
  it("round-trip a skill through export and import", () => {
    const skill = saveSkill({
      name: "Heraldry",
      description: "Coat-of-arms conventions",
      body: "# Heraldry\n\nOr always above argent."
    });
    const file = skillToMarkdown(skill);
    expect(file).toContain("name: Heraldry");
    expect(file).toContain("description: Coat-of-arms conventions");

    const imported = importFile("heraldry.md", file);
    expect(imported.kind).toBe("skill");
    if (imported.kind !== "skill") return;
    expect(imported.skill.name).toBe("Heraldry 2"); // the user's own skill keeps its name
    expect(imported.skill.description).toBe("Coat-of-arms conventions");
    expect(imported.skill.body).toBe(skill.body);
    expect(listSkills()).toHaveLength(2); // a file imports as a new entry
  });

  it("derive name and description from the file when front matter is missing", () => {
    const imported = importFile("trade-routes.md", "# Trade routes\n\nFollow the rivers.");
    expect(imported.kind).toBe("skill");
    if (imported.kind !== "skill") return;
    expect(imported.skill.name).toBe("trade-routes");
    expect(imported.skill.description).toBe("Trade routes");
    expect(imported.skill.body).toContain("Follow the rivers.");
    expect(imported.skill.enabled).toBe(true);
  });

  it("respect an enabled: false front-matter field", () => {
    const file = "---\nname: Draft\ndescription: Not ready\nenabled: false\n---\n\nBody.";
    const imported = importFile("draft.md", file);
    expect(imported.kind).toBe("skill");
    if (imported.kind !== "skill") return;
    expect(imported.skill.enabled).toBe(false);
    expect(readSkill("Draft")).toBeUndefined();
  });

  it("import AGENTS.md as the instructions and export them back", () => {
    const imported = importFile("AGENTS.md", "---\nname: x\n---\n\nStandards for this world.");
    expect(imported.kind).toBe("instructions");
    expect(getInstructions()).toBe("Standards for this world.");
    expect(instructionsToMarkdown()).toBe("Standards for this world.");

    importFile("agents", "Plain file, no extension.");
    expect(getInstructions()).toBe("Plain file, no extension.");
  });

  it("strip front matter from an imported skill body", () => {
    const imported = importFile("a.md", "---\nname: A\n---\n\nJust the body.");
    expect(imported.kind).toBe("skill");
    if (imported.kind !== "skill") return;
    expect(imported.skill.body).toBe("Just the body.");
  });
});
