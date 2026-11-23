// The collapsible panel on the right and the sticked menu below it
import { showExportPane, showLoadPane, showSavePane } from "@/app/chrome/io-panes";
import { regeneratePrompt } from "@/app/lifecycle";
import { Controllers } from "@/controllers";
import { ARROW_TIP_KEY } from "@/services/versioning";
import { makeDraggable } from "@/ui/draggable";
import { resetZoom } from "@/ui/map/zoom";
import { clearMainTip } from "@/ui/tooltips";
import { changeViewMode } from "@/ui/view-mode-switch";
import { ensureEl, findEl } from "@/utils/node-utils";

const TAB_CONTENT: Record<string, string> = {
  layersTab: "layersContent",
  styleTab: "styleContent",
  optionsTab: "optionsContent",
  toolsTab: "toolsContent",
  aboutTab: "aboutContent"
};

interface TabSection {
  id: string;
  label: string;
  element: HTMLElement;
}

/** Last sub-tab chosen per main tab, kept while the menu stays open. */
const activeSections: Record<string, string> = {};

/** A tab's sections are its direct `.tabsection` children, in document order. */
function sectionsOf(contentId: string | undefined): TabSection[] {
  if (!contentId) return [];
  const content = findEl(contentId);
  if (!content) return [];

  return Array.from(content.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("tabsection"))
    .map(child => ({
      id: child.dataset.tabSection ?? "",
      label: child.dataset.tabLabel ?? child.dataset.tabSection ?? "",
      element: child
    }))
    .filter(section => section.id);
}

function renderSubtabs(sections: readonly TabSection[], activeId?: string): void {
  const bar = ensureEl("subtabs");
  if (sections.length < 2) {
    bar.style.display = "none";
    bar.replaceChildren();
    return;
  }

  bar.style.display = "flex";
  bar.replaceChildren(
    ...sections.map(section => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.section = section.id;
      button.textContent = section.label;
      button.classList.toggle("active", section.id === activeId);
      return button;
    })
  );
}

function showSection(tabId: string, sections: readonly TabSection[], sectionId: string): void {
  const active = sections.find(section => section.id === sectionId) ?? sections[0];
  if (!active) return;

  for (const section of sections) section.element.hidden = section !== active;
  activeSections[tabId] = active.id;
  renderSubtabs(sections, active.id);
}

function showSelectedSection(tabId: string, contentId: string | undefined): void {
  const sections = sectionsOf(contentId);
  if (!sections.length) {
    renderSubtabs([]);
    return;
  }
  const remembered = activeSections[tabId];
  const initial = sections.some(section => section.id === remembered) ? remembered : sections[0].id;
  showSection(tabId, sections, initial);
}

function showOptions(event?: Event): void {
  if (!localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    localStorage.setItem(ARROW_TIP_KEY, "true");
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  ensureEl("regenerate").style.display = "none";
  ensureEl("options").style.display = "block";
  ensureEl("optionsTrigger").style.display = "none";
  event?.stopPropagation();
}

export function hideOptions(event?: Event): void {
  ensureEl("options").style.display = "none";
  ensureEl("optionsTrigger").style.display = "block";
  event?.stopPropagation();
}

export function toggleOptions(event?: Event): void {
  if (ensureEl("options").style.display === "none") showOptions(event);
  else hideOptions(event);
}

/** Open the panel on the given tab */
export function openTab(id: string): void {
  showOptions();
  selectTab(id);
}

/** Show the clicked tab, hiding whichever was open. Tools swaps in the customization menu instead */
function selectTab(id: string): void {
  const active = ensureEl("options").querySelector(".tab > button.active");
  if (active?.id === id) {
    const shown = id === "toolsTab" && options.app.mode === "heightmap" ? "heightmapMenu" : TAB_CONTENT[id];
    if (shown) showSelectedSection(id, shown);
    else renderSubtabs([]);
    return;
  }
  if (active?.id === "styleTab") void Controllers.StyleEditor.close();

  active?.classList.remove("active");
  ensureEl(id).classList.add("active");
  for (const content of ensureEl("options").querySelectorAll<HTMLElement>(".tabcontent")) {
    content.style.display = "none";
  }

  const shown = id === "toolsTab" && options.app.mode === "heightmap" ? "heightmapMenu" : TAB_CONTENT[id];
  if (shown) {
    ensureEl(shown).style.display = "block";
    showSelectedSection(id, shown);
  } else {
    renderSubtabs([]);
  }
  if (id === "styleTab") void Controllers.StyleEditor.open();
}

/** Recompute the sub-tab bar for whichever main tab is active */
export function refreshSubtabs(): void {
  const active = ensureEl("options").querySelector<HTMLElement>(".tab > button.active")?.id;
  if (!active) {
    renderSubtabs([]);
    return;
  }
  const shown = active === "toolsTab" && options.app.mode === "heightmap" ? "heightmapMenu" : TAB_CONTENT[active];
  if (shown) showSelectedSection(active, shown);
  else renderSubtabs([]);
}

/** Keep every `<x>Input` and its `<x>Output` showing the same value */
function onPanelInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.closest("[data-option]")) return;
  const { id, value } = target;

  if (id.endsWith("Input")) {
    const output = findEl<HTMLOutputElement>(`${id.slice(0, -5)}Output`);
    if (output) output.value = value;
  } else if (id.endsWith("Output")) {
    const input = findEl<HTMLInputElement>(`${id.slice(0, -6)}Input`);
    if (input) input.value = value;
  }
}

function initialize(): void {
  makeDraggable(ensureEl("optionsContainer"), ".drag-trigger");
  makeDraggable(ensureEl("heightmapFinalize"), "div");

  if (localStorage.getItem(ARROW_TIP_KEY)) {
    clearMainTip();
    ensureEl("optionsTrigger").classList.remove("glow");
  }

  const trigger = ensureEl("optionsTrigger");
  trigger.addEventListener("mouseenter", () => {
    if (trigger.classList.contains("glow")) return;
    if (ensureEl("options").style.display === "none") ensureEl("regenerate").style.display = "block";
  });
  ensureEl("collapsible").addEventListener("mouseleave", () => {
    ensureEl("regenerate").style.display = "none";
  });

  ensureEl("options")
    .querySelector("div.tab")
    ?.addEventListener("click", event => {
      const target = event.target as HTMLElement;
      if (target.tagName === "BUTTON") selectTab(target.id);
    });

  ensureEl("subtabs").addEventListener("click", event => {
    const button = (event.target as HTMLElement).closest("button");
    const tabId = ensureEl("options").querySelector(".tab > button.active")?.id;
    if (!button || !tabId || !button.dataset.section) return;

    const contentId = tabId === "toolsTab" && options.app.mode === "heightmap" ? "heightmapMenu" : TAB_CONTENT[tabId];
    showSection(tabId, sectionsOf(contentId), button.dataset.section);
  });

  for (const id of ["options", "dialogs"]) {
    ensureEl(id).addEventListener("input", onPanelInput);
  }

  ensureEl("sticked").addEventListener("click", event => {
    const id = (event.target as HTMLElement).id;
    if (id === "newMapButton") regeneratePrompt();
    else if (id === "saveButton") showSavePane();
    else if (id === "exportButton") showExportPane();
    else if (id === "loadButton") void showLoadPane();
    else if (id === "zoomReset") resetZoom(1000);
    else if (id === "searchButton") Controllers.Omnibar.open();
  });

  ensureEl("viewMode").addEventListener("click", changeViewMode);
  ensureEl("optionsTrigger").addEventListener("click", showOptions);
  ensureEl("regenerate").addEventListener("click", () => regeneratePrompt());
  ensureEl("optionsHide").addEventListener("click", hideOptions);

  const initialTab = ensureEl("options").querySelector<HTMLElement>(".tab > button.active")?.id;
  if (initialTab) showSelectedSection(initialTab, TAB_CONTENT[initialTab]);
}

initialize();
