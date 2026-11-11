import { beforeEach, describe, expect, it } from "vitest";
import {
  activeInstructionsId,
  deleteInstructionsProfile,
  deletePrompt,
  deleteSkill,
  getInstructions,
  INSTRUCTIONS_LIMIT,
  importInstructionsProfileFile,
  importSkillFile,
  instructionsProfileToMarkdown,
  listInstructionsProfiles,
  listPrompts,
  listSkills,
  readSkill,
  saveInstructionsProfile,
  savePrompt,
  saveSkill,
  setActiveInstructionsProfile,
  skillToMarkdown
} from "./customization";

const reset = (): void => {
  for (const profile of listInstructionsProfiles()) deleteInstructionsProfile(profile.id);
  for (const skill of listSkills()) deleteSkill(skill.id);
  for (const prompt of listPrompts()) deletePrompt(prompt.id);
};

beforeEach(reset);

describe("instructions profiles", () => {
  it("create, select and delete selectable profiles", () => {
    const editor = saveInstructionsProfile({ name: "Map Editor", text: "Name places like an atlas." });
    const gm = saveInstructionsProfile({ name: "GM", text: "Run the world as the GM." });
    expect(getInstructions()).toBe("Name places like an atlas."); // the first profile becomes active
    expect(activeInstructionsId()).toBe(editor.id);

    setActiveInstructionsProfile(gm.id);
    expect(getInstructions()).toBe("Run the world as the GM.");

    saveInstructionsProfile({ id: gm.id, text: "Run the world as the GM, harshly." });
    expect(getInstructions()).toBe("Run the world as the GM, harshly."); // the active profile follows the edit

    deleteInstructionsProfile(gm.id);
    expect(getInstructions()).toBe("Name places like an atlas."); // falls back to the first profile

    deleteInstructionsProfile(editor.id);
    expect(getInstructions()).toBe("");
    expect(activeInstructionsId()).toBeNull();
  });

  it("reject empty names, duplicates and updates of a deleted profile", () => {
    saveInstructionsProfile({ name: "GM", text: "b" });
    expect(() => saveInstructionsProfile({ name: "  ", text: "b" })).toThrow(/name/i);
    expect(() => saveInstructionsProfile({ name: "gm", text: "b" })).toThrow(/already exists/i);
    expect(() => saveInstructionsProfile({ id: "missing", name: "Ghost", text: "b" })).toThrow(/deleted/);
    expect(() => setActiveInstructionsProfile("missing")).toThrow(/deleted/);
  });

  it("cap the name, text and profile count", () => {
    const profile = saveInstructionsProfile({ name: "n".repeat(60), text: "t".repeat(INSTRUCTIONS_LIMIT + 500) });
    expect(profile.name).toHaveLength(40);
    expect(profile.text).toHaveLength(INSTRUCTIONS_LIMIT);
    for (let i = 1; i < 20; i++) saveInstructionsProfile({ name: `P${i}`, text: "x" });
    expect(() => saveInstructionsProfile({ name: "21st", text: "x" })).toThrow(/at most/i);
  });

  it("round-trip a profile through export and import", () => {
    const profile = saveInstructionsProfile({ name: "Storyteller", text: "Write like a bard." });
    const file = instructionsProfileToMarkdown(profile);
    expect(file).toContain("name: Storyteller");
    deleteInstructionsProfile(profile.id);

    const imported = importInstructionsProfileFile("storyteller.md", file);
    expect(imported.name).toBe("Storyteller");
    expect(imported.text).toBe("Write like a bard.");
    expect(activeInstructionsId()).toBe(imported.id); // the first profile becomes active

    const imported2 = importInstructionsProfileFile("storyteller.md", file);
    expect(imported2.name).toBe("Storyteller 2"); // the taken name is suffixed
  });

  it("import an AGENTS.md file as a separate profile", () => {
    saveInstructionsProfile({ name: "Map Editor", text: "Keep the atlas consistent." });
    const imported = importInstructionsProfileFile("AGENTS.md", "Conventions for this world.");
    expect(imported.name).toBe("AGENTS");
    expect(listInstructionsProfiles()).toHaveLength(2);
    expect(getInstructions()).toBe("Keep the atlas consistent."); // stays on the previously active profile
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

    const imported = importSkillFile("heraldry.md", file);
    expect(imported.name).toBe("Heraldry 2"); // the user's own skill keeps its name
    expect(imported.description).toBe("Coat-of-arms conventions");
    expect(imported.body).toBe(skill.body);
    expect(listSkills()).toHaveLength(2); // a file imports as a new entry
  });

  it("derive name and description from the file when front matter is missing", () => {
    const imported = importSkillFile("trade-routes.md", "# Trade routes\n\nFollow the rivers.");
    expect(imported.name).toBe("trade-routes");
    expect(imported.description).toBe("Trade routes");
    expect(imported.body).toContain("Follow the rivers.");
    expect(imported.enabled).toBe(true);
  });

  it("respect an enabled: false front-matter field", () => {
    const file = "---\nname: Draft\ndescription: Not ready\nenabled: false\n---\n\nBody.";
    const imported = importSkillFile("draft.md", file);
    expect(imported.enabled).toBe(false);
    expect(readSkill("Draft")).toBeUndefined();
  });

  it("strip front matter from an imported skill body", () => {
    const imported = importSkillFile("a.md", "---\nname: A\n---\n\nJust the body.");
    expect(imported.body).toBe("Just the body.");
  });
});
