// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/services/local-db", () => ({
  LocalDB: { isSupported: () => true, get: vi.fn(async () => []), set: vi.fn(async () => {}) }
}));
vi.mock("./map", () => ({
  AssistantMap: {
    id: () => 1,
    name: () => "Test map",
    context: async () => "# Current map",
    tools: () => [],
    canUndo: () => true,
    undo: async () => "undone"
  }
}));
vi.mock("@/controllers", () => ({ Controllers: { NotesEditor: { current: async () => null } } }));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/utils/file-utils", async importOriginal => ({
  ...(await importOriginal<typeof import("@/utils/file-utils")>()),
  downloadFile: download
}));

// The assistant UI is a large controller graph; pay its transform once where the hook has room
beforeAll(async () => {
  await import("./index");
}, 60000);

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  download.mockReset();
  document.body.innerHTML = '<div id="dialogs"></div>';
});

afterEach(() => {
  document.body.innerHTML = "";
});

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as unknown as T;

const click = (selector: string): void => {
  const control = document.querySelector<HTMLElement>(selector);
  expect(control).not.toBeNull();
  control!.click();
};

const clickText = (text: string): void => {
  const control = [...document.querySelectorAll("button")].find(button => button.textContent === text);
  expect(control).toBeDefined();
  control!.click();
};

async function openCustomize(): Promise<void> {
  const { Assistant } = await import("./index");
  Assistant.open();
  await ready();
  click("#assistantOpenCustomize");
  await vi.waitFor(() => expect(el("assistantCustomize").hidden).toBe(false));
}

/** The panel has finished its first render, so the title-bar buttons are live */
async function ready(): Promise<void> {
  await vi.waitFor(() => expect(el("assistantTier").textContent).toMatch(/Guest|Member/));
}

/** jsdom dispatches a non-bubbling Event unless asked otherwise, and the view listens on its container */
const submit = (form: HTMLElement): void => {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};

it("creates, selects and exports AGENTS.md profiles", async () => {
  const customization = await import("@/services/assistant/customization");
  await openCustomize();
  expect(el("assistantInstructionsProfileList").textContent).toContain("No profiles yet.");

  // the empty state is replaced by the first profile, which becomes active
  clickText("+ New profile");
  expect(el("assistantCustomizeEditor").hidden).toBe(false);
  expect(el("assistantEditorTitle").textContent).toBe("Instructions profile");
  expect(el("assistantEditorBodyLabel").textContent).toBe("Instructions");
  expect(el("assistantEditorDescriptionField").hidden).toBe(true);
  expect(el("assistantEditorEnabledField").hidden).toBe(true);
  el<HTMLInputElement>("assistantEditorName").value = "Map Editor";
  el<HTMLTextAreaElement>("assistantEditorBody").value = "Name rivers after local saints.";
  submit(el("assistantCustomizeEditor"));

  const profiles = customization.listInstructionsProfiles();
  expect(profiles).toHaveLength(1);
  expect(customization.getInstructions()).toBe("Name rivers after local saints.");
  expect(el("assistantInstructionsProfileList").textContent).toContain("Map Editor");

  // a second profile is created and selected with the radio button
  clickText("+ New profile");
  el<HTMLInputElement>("assistantEditorName").value = "GM";
  el<HTMLTextAreaElement>("assistantEditorBody").value = "Run the world as the GM.";
  submit(el("assistantCustomizeEditor"));
  expect(customization.getInstructions()).toBe("Name rivers after local saints."); // the first stays active

  const gm = customization.listInstructionsProfiles().find(profile => profile.name === "GM")!;
  click(`[data-action="set-active-instructions"][data-id="${gm.id}"]`);
  expect(customization.getInstructions()).toBe("Run the world as the GM.");

  click(`[data-action="export-instructions"][data-id="${gm.id}"]`);
  expect(download).toHaveBeenCalledWith(expect.stringContaining("name: GM"), "GM.md", "text/markdown");

  click(`[data-action="delete-instructions"][data-id="${gm.id}"]`);
  expect(customization.listInstructionsProfiles().map(profile => profile.name)).toEqual(["Map Editor"]);
  expect(customization.getInstructions()).toBe("Name rivers after local saints.");
});

it("creates, edits, disables and deletes a skill", async () => {
  const customization = await import("@/services/assistant/customization");
  await openCustomize();

  clickText("+ New skill");
  expect(el("assistantCustomizeEditor").hidden).toBe(false);
  expect(el("assistantEditorDescriptionField").hidden).toBe(false);
  el<HTMLInputElement>("assistantEditorName").value = "Naming";
  el<HTMLInputElement>("assistantEditorDescription").value = "How to name things";
  el<HTMLTextAreaElement>("assistantEditorBody").value = "Use the old tongue.";
  submit(el("assistantCustomizeEditor"));

  expect(el("assistantCustomizeEditor").hidden).toBe(true);
  const skills = customization.listSkills();
  expect(skills).toHaveLength(1);
  expect(skills[0]).toMatchObject({ name: "Naming", description: "How to name things", enabled: true });
  expect(el("assistantSkillList").textContent).toContain("Naming");

  // the toggle flips the skill off, so the model is never offered it
  click(`[data-action="toggle-skill"][data-id="${skills[0].id}"]`);
  expect(customization.listSkills()[0].enabled).toBe(false);
  expect(customization.enabledSkills()).toEqual([]);

  click('[data-action="export-skill"]');
  expect(download).toHaveBeenCalledWith(expect.stringContaining("name: Naming"), "Naming.md", "text/markdown");

  click(`[data-action="delete-skill"][data-id="${skills[0].id}"]`);
  expect(customization.listSkills()).toEqual([]);
  expect(el("assistantSkillList").textContent).toContain("No skills yet.");
});

it("keeps the editor open and shows the reason when a skill has no name", async () => {
  await openCustomize();
  clickText("+ New skill");
  el<HTMLInputElement>("assistantEditorName").value = "   ";
  submit(el("assistantCustomizeEditor"));
  expect(el("assistantCustomizeEditor").hidden).toBe(false);
  expect(el("assistantCustomizeError").textContent).toMatch(/name/i);
});

it("imports AGENTS.md as the instructions and another file as a skill", async () => {
  const customization = await import("@/services/assistant/customization");
  await openCustomize();

  const agents = new File(["Standards for this world."], "AGENTS.md", { type: "text/markdown" });
  const agents2 = new File(["Map conventions."], "map-editor.md", { type: "text/markdown" });
  const trade = new File(["---\nname: Trade\ndescription: Routes\n---\n\nFollow the rivers."], "trade.md", {
    type: "text/markdown"
  });

  const profileInput = el<HTMLInputElement>("assistantInstructionsFile");
  Object.defineProperty(profileInput, "files", { value: [agents, agents2], configurable: true });
  profileInput.dispatchEvent(new Event("change"));

  await vi.waitFor(() => expect(customization.listInstructionsProfiles()).toHaveLength(2));
  expect(customization.listInstructionsProfiles().map(profile => profile.name).sort()).toEqual([
    "AGENTS",
    "map-editor"
  ]);
  expect(customization.getInstructions()).toBe("Standards for this world."); // the first imported profile is active

  const skillInput = el<HTMLInputElement>("assistantSkillFile");
  Object.defineProperty(skillInput, "files", { value: [trade], configurable: true });
  skillInput.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(customization.listSkills().map(skill => skill.name)).toEqual(["Trade"]));
});

it("drops a saved prompt into the composer, replacing nothing it should keep", async () => {
  const customization = await import("@/services/assistant/customization");
  customization.savePrompt({ name: "Lore pass", text: "Describe every state." });
  const { Assistant } = await import("./index");
  Assistant.open();
  await ready();

  click("#assistantPromptButton");
  expect(el("assistantPromptMenu").hidden).toBe(false);
  click('[data-action="use-prompt"]');
  expect(el<HTMLTextAreaElement>("assistantQuestion").value).toBe("Describe every state.");
  expect(el("assistantPromptMenu").hidden).toBe(true);

  const box = el<HTMLTextAreaElement>("assistantQuestion");
  box.value = "Keep this.";
  click("#assistantPromptButton");
  click('[data-action="use-prompt"]');
  expect(box.value).toBe("Keep this.\nDescribe every state.");
});

it("points at Customize when there are no prompts yet", async () => {
  const { Assistant } = await import("./index");
  Assistant.open();
  await ready();
  click("#assistantPromptButton");
  expect(el("assistantPromptMenu").textContent).toContain("No prompts yet.");
  click('[data-action="customize"]');
  expect(el("assistantCustomize").hidden).toBe(false);
  expect(el("assistantPromptMenu").hidden).toBe(true);
});
