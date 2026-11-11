// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/services/local-db", () => ({
  LocalDB: { isSupported: () => true, get: vi.fn(async () => []), set: vi.fn(async () => {}) }
}));

const discovery = vi.hoisted(() => ({ list: vi.fn() }));
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
vi.mock("@/services/assistant/provider/models", async importOriginal => ({
  ...(await importOriginal<typeof import("@/services/assistant/provider/models")>()),
  listModels: discovery.list
}));

// The assistant UI is a large controller graph, and the first test imports it cold inside a 20s
// budget. Pay that transform once, here, where the hook has room.
beforeAll(async () => {
  await import("./index");
}, 60000);

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  discovery.list.mockReset().mockResolvedValue([]);
  document.body.innerHTML = '<div id="dialogs"></div>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function openSheet(): Promise<void> {
  const { Assistant } = await import("./index");
  Assistant.open();
  await vi.waitFor(() => expect(document.getElementById("assistantAccount")?.textContent).toContain("key"));
  click("Use key");
}

function click(text: string): void {
  const control = [...document.querySelectorAll("button")].find(button => button.textContent === text);
  expect(control).toBeDefined();
  control!.click();
}

function enterKey(value: string): void {
  const key = document.getElementById("assistantApiKey") as HTMLInputElement;
  key.value = value;
  key.dispatchEvent(new Event("input"));
}

it("offers Gemini, discovers models and saves its own key and model", async () => {
  discovery.list.mockResolvedValue(["gemini-flash-latest"]);
  await openSheet();
  const provider = document.getElementById("assistantProvider") as HTMLSelectElement;
  expect(provider.querySelector('option[value="gemini"]')?.textContent).toBe("Gemini");
  provider.value = "gemini";
  provider.dispatchEvent(new Event("change"));
  expect((document.getElementById("assistantKeyLink") as HTMLAnchorElement).href).toBe(
    "https://aistudio.google.com/apikey"
  );
  expect((document.getElementById("assistantModel") as HTMLInputElement).value).toBe("gemini-flash-latest");
  enterKey("gemini-key");
  await vi.waitFor(() =>
    expect(discovery.list).toHaveBeenCalledWith(
      "gemini",
      "gemini-key",
      "http://localhost:11434/v1",
      expect.any(AbortSignal)
    )
  );
  click("Connect");
  expect(localStorage.getItem("fmg-ai-chat-provider")).toBe("gemini");
  expect(localStorage.getItem("fmg-ai-kl-gemini")).toBe("gemini-key");
  expect(localStorage.getItem("fmg-ai-model-gemini")).toBe("gemini-flash-latest");
}, 20000);

it("does not save a draft local address when the key sheet is cancelled", async () => {
  localStorage.setItem("fmg-ai-local-url", "http://localhost:8080/v1");
  await openSheet();
  const provider = document.getElementById("assistantProvider") as HTMLSelectElement;
  expect(provider.querySelector('option[value="local"]')?.textContent).toBe("Local");
  provider.value = "local";
  provider.dispatchEvent(new Event("change"));
  const server = document.getElementById("assistantLocalUrl") as HTMLInputElement;
  server.value = "http://localhost:9000/v1";
  server.dispatchEvent(new Event("input"));
  await vi.waitFor(() =>
    expect(discovery.list).toHaveBeenCalledWith("local", "", "http://localhost:9000/v1", expect.any(AbortSignal))
  );
  click("Cancel");
  expect(localStorage.getItem("fmg-ai-local-url")).toBe("http://localhost:8080/v1");
});

it("ignores an old key's discovery error after a new key succeeds", async () => {
  let rejectOld!: (error: Error) => void;
  discovery.list.mockImplementation((_provider, key) =>
    key === "old-key"
      ? new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
      : Promise.resolve(["claude-test"])
  );
  await openSheet();
  enterKey("old-key");
  await vi.waitFor(() => expect(rejectOld).toBeDefined());
  enterKey("new-key");
  await vi.waitFor(() => expect(document.querySelector("#assistantModels option")?.textContent).toBe("claude-test"));
  rejectOld(new Error("Old key rejected"));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(document.getElementById("assistantDiscoveryError")?.textContent).toBe("");
});

it("does not start pending discovery after leaving the key sheet", async () => {
  await openSheet();
  enterKey("draft-key");
  click("Cancel");
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(discovery.list).not.toHaveBeenCalled();
});

it("hides the reasoning level for local servers and saves it for cloud providers", async () => {
  await openSheet();
  const reasoning = document.getElementById("assistantReasoning") as HTMLSelectElement;
  const reasoningLabel = document.getElementById("assistantReasoningLabel") as HTMLLabelElement;
  expect(reasoning.hidden).toBe(false);
  expect(reasoningLabel.hidden).toBe(false);

  enterKey("openai-key");
  reasoning.value = "high";
  click("Connect");
  expect(localStorage.getItem("fmg-ai-reasoning-openai")).toBe("high");
  expect(localStorage.getItem("fmg-ai-chat-provider")).toBe("openai");

  // reopening the sheet restores the saved level
  click("Cancel");
  click("Key");
  expect((document.getElementById("assistantReasoning") as HTMLSelectElement).value).toBe("high");

  const provider = document.getElementById("assistantProvider") as HTMLSelectElement;
  provider.value = "local";
  provider.dispatchEvent(new Event("change"));
  expect(reasoning.hidden).toBe(true);
  expect(reasoningLabel.hidden).toBe(true);
});

it("opens the model picker from the footer name and saves the chosen model", async () => {
  discovery.list.mockResolvedValue(["gpt-6-luna", "gpt-6-sol"]);
  await openSheet();
  enterKey("openai-key");
  click("Connect");

  const model = document.getElementById("assistantFooterModel") as HTMLButtonElement;
  expect(model.hidden).toBe(false);
  expect(model.textContent).toContain("gpt-6-luna");
  expect((document.getElementById("assistantUseKey") as HTMLElement).hidden).toBe(true);
  expect(document.getElementById("assistantStatus")?.textContent).toContain("tokens");

  // the picker lists the discovered models and filters as you type
  model.click();
  await vi.waitFor(() => expect(document.getElementById("assistantModelFilter")).not.toBeNull());
  const filter = document.getElementById("assistantModelFilter") as HTMLInputElement;
  const select = document.getElementById("assistantModelSelect") as HTMLSelectElement;
  expect(select.options.length).toBe(2);
  filter.value = "sol";
  filter.dispatchEvent(new Event("input"));
  expect(select.options.length).toBe(1);
  expect(select.value).toBe("gpt-6-sol");
  clickDialogButton("Select");
  expect(localStorage.getItem("fmg-ai-model-openai")).toBe("gpt-6-sol");
  expect(document.getElementById("assistantModelPicker")).toBeNull(); // dialog closes on Select
  expect(model.textContent).toContain("gpt-6-sol");

  // a filter that matches nothing keeps the window open on Select
  model.click();
  await vi.waitFor(() => expect(document.getElementById("assistantModelFilter")).not.toBeNull());
  const filter2 = document.getElementById("assistantModelFilter") as HTMLInputElement;
  filter2.value = "zzz";
  filter2.dispatchEvent(new Event("input"));
  clickDialogButton("Select");
  expect(localStorage.getItem("fmg-ai-model-openai")).toBe("gpt-6-sol"); // unchanged
  expect(document.getElementById("assistantModelPicker")).not.toBeNull(); // still open
  clickDialogButton("Cancel");

  const reasoning = document.getElementById("assistantFooterReasoning") as HTMLSelectElement;
  reasoning.value = "low";
  reasoning.dispatchEvent(new Event("change"));
  expect(localStorage.getItem("fmg-ai-reasoning-openai")).toBe("low");

  // the key image opens the key sheet
  (document.getElementById("assistantFooterKey") as HTMLButtonElement).click();
  expect((document.getElementById("assistantKey") as HTMLElement).hidden).toBe(false);
});

it("hides the reasoning level in the footer for a local server", async () => {
  discovery.list.mockResolvedValue(["llama3.2"]);
  await openSheet();
  const provider = document.getElementById("assistantProvider") as HTMLSelectElement;
  provider.value = "local";
  provider.dispatchEvent(new Event("change"));
  const model = document.getElementById("assistantModel") as HTMLInputElement;
  model.value = "llama3.2";
  click("Connect");

  const reasoning = document.getElementById("assistantFooterReasoning") as HTMLSelectElement;
  expect(document.getElementById("assistantFooterModel")?.textContent).toContain("llama3.2");
  expect(reasoning.hidden).toBe(true);
});

function clickDialogButton(label: string): void {
  const frame = document.querySelector(".dialog-window .dialog-buttonset");
  const control = [...frame!.querySelectorAll("button")].find(button => button.textContent === label);
  expect(control).toBeDefined();
  control!.click();
}
