// The Star Systems overview: every burg on the map read as a star system — its class, its
// world type, the installations that make it what it is. Read-only, styled like the Burgs
// overview editor (full-width table, bottom filters and buttons, column sorting).

import { Controllers } from "@/controllers";
import { type StarSystem, systemsOf } from "@/model/physical/astral-naming";
import { Tags } from "@/model/tags";
import { Csv } from "@/services/io/csv";
import { Dialog } from "@/ui/dialog/dialog";
import { applyLineHighlighting } from "@/ui/dialog/highlighting";
import { bindColumnSorting, sortDataByColumns } from "@/ui/dialog/sorting";
import { dialogState } from "@/ui/dialog/state";
import {
  type EditorColumn,
  initColumnVisibility,
  initEditorTable,
  renderEditorHeader,
  renderEditorPagination,
  type TableView
} from "@/ui/dialog/table";
import { zoomTo } from "@/ui/map/zoom";
import { tip } from "@/ui/tooltips";
import { ensureEl, escapeHtml } from "@/utils";
import { t } from "@/utils/i18n";
import { si } from "@/utils/number-utils";

const dialogId = "astralSystems" as const;
const position = { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" };
const CSV_COLUMNS = ["Id", "System", "Class", "State", "Culture", "Population", "Capital", "Port", "Traits"];
const CLASS_RANK: Record<string, number> = { O: 0, B: 1, A: 2, F: 3, G: 4, K: 5, M: 6 };

function featureSortKey(system: StarSystem): string {
  if (system.capital && system.port) return "a-capital-port";
  if (system.capital) return "c-capital";
  if (system.port) return "p-port";
  return "z-none";
}

type FilterState = { search: string; stateId: number; cultureId: number };
let filterState: FilterState;

const columns: EditorColumn<StarSystem>[] = [
  { key: "locate", width: "0.8em", permanent: true },
  {
    key: "name",
    label: t("System"),
    width: "9em",
    permanent: true,
    sortBy: system => system.name || "",
    sortType: "alpha"
  },
  {
    key: "class",
    label: t("Class"),
    width: "5em",
    sortBy: system => CLASS_RANK[system.class] ?? 99,
    tip: t("Spectral class of the primary star")
  },
  {
    key: "state",
    label: t("State"),
    width: "8em",
    sortBy: system => pack.states[system.state]?.name || "",
    sortType: "alpha"
  },
  {
    key: "culture",
    label: t("Culture"),
    width: "9em",
    mobileHidden: true,
    sortBy: system => pack.cultures[system.culture]?.name || "",
    sortType: "alpha"
  },
  {
    key: "population",
    label: t("Population"),
    width: "7em",
    defaultSort: "desc",
    sortBy: system => system.population
  },
  {
    key: "features",
    label: t("Features"),
    width: "3.5em",
    sortType: "alpha",
    sortBy: featureSortKey
  },
  {
    key: "traits",
    label: t("Traits"),
    width: "14em",
    sortBy: system => system.traits.join(", "),
    sortType: "alpha"
  },
  { key: "edit", width: "1.1em" }
];

const systemsTable = initEditorTable<StarSystem>({
  dialogId,
  getData: () => sortDataByColumns(dialogId, getFilteredSystems(), columns),
  onUpdate: renderSystemRows
});

function open(): void {
  if (options.app.mode) return;
  filterState = dialogState.get(dialogId, "filters", () => ({ search: "", stateId: -1, cultureId: -1 }));
  Dialog.closeAll(`#${dialogId}, .stable`);

  renderDialog();
  updateFilter();
  systemsTable.reset();

  Dialog.open(dialogId, {
    title: t("Star Systems"),
    onClose: closeStarSystems,
    width: "fit-content",
    position
  });
}

function renderDialog(): void {
  Dialog.destroy(dialogId);

  const html = /* html */ `<div id="${dialogId}" class="dialog stable editorDialog">
    <div id="astralBody" class="table">${renderEditorHeader({ dialogId, columns })}</div>
    <div id="astralFilters" data-tip="${t("Apply a filter")}" class="editorFilters">
      <label for="astralSearch" data-tip="${t("Filter by name, class, world type, trait, state or culture")}"
        >${t("Search")}: <input id="astralSearch" type="search"
      /></label>
      <label for="astralFilterState">${t("State")}: <select id="astralFilterState"></select></label>
      <label for="astralFilterCulture">${t("Culture")}: <select id="astralFilterCulture"></select></label>
    </div>

    <div id="astralFooter" class="totalLine">
      <div data-tip="${t("Systems shown")}" style="margin-left: 5px">
        ${t("Systems")}:&nbsp;<span id="astralCount">0</span>
      </div>
      <div data-tip="${t("Average population")}" style="margin-left: 12px" data-col="population">
        ${t("Avg population")}:&nbsp;<span id="astralAvgPopulation">0</span>
      </div>
    </div>

    <div id="astralBottom" class="editorToolbar">
      <button id="astralRefresh" data-tip="${t("Refresh")}" class="icon-cw"></button>
      <button id="astralExport" data-tip="${t("Save data as a CSV file")}" class="icon-download"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  ensureEl<HTMLInputElement>("astralSearch").value = filterState.search;
  bindColumnSorting(dialogId, systemsTable.reset);
  applyLineHighlighting(dialogId, ({ cellId }) => pack.cells.burg[cellId]);

  initColumnVisibility({
    dialogId,
    columns,
    onUpdate: () => Dialog.update(dialogId, { width: "fit-content", position })
  });

  ensureEl("astralRefresh").addEventListener("click", refreshSystems);
  ensureEl("astralExport").addEventListener("click", downloadSystemsData);
  ensureEl("astralFilterState").addEventListener("change", onFilterChange);
  ensureEl("astralFilterCulture").addEventListener("change", onFilterChange);
  ensureEl("astralSearch").addEventListener("input", onFilterChange);
}

function closeStarSystems(): void {
  Dialog.destroy(dialogId);
}

function refreshSystems(): void {
  updateFilter();
  systemsTable.reset();
}

function updateFilter(): void {
  const stateFilter = ensureEl<HTMLSelectElement>("astralFilterState");
  const validStateIds = new Set(pack.states.filter(state => !state.removed).map(state => state.i));
  if (!validStateIds.has(filterState.stateId)) filterState.stateId = -1;
  stateFilter.options.length = 0;
  stateFilter.options.add(new Option(t("All"), "-1", false, filterState.stateId === -1));
  stateFilter.options.add(new Option(pack.states[0].name, "0", false, filterState.stateId === 0));
  const statesSorted = pack.states.filter(s => s.i && !s.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
  statesSorted.forEach(
    s => void stateFilter.options.add(new Option(s.name, String(s.i), false, s.i === filterState.stateId))
  );

  const cultureFilter = ensureEl<HTMLSelectElement>("astralFilterCulture");
  const validCultureIds = new Set(pack.cultures.filter(culture => !culture.removed).map(culture => culture.i));
  if (!validCultureIds.has(filterState.cultureId)) filterState.cultureId = -1;
  cultureFilter.options.length = 0;
  cultureFilter.options.add(new Option(t("All"), "-1", false, filterState.cultureId === -1));
  cultureFilter.options.add(new Option(pack.cultures[0].name, "0", false, filterState.cultureId === 0));
  const culturesSorted = pack.cultures.filter(c => c.i && !c.removed).sort((a, b) => (a.name > b.name ? 1 : -1));
  culturesSorted.forEach(
    c => void cultureFilter.options.add(new Option(c.name, String(c.i), false, c.i === filterState.cultureId))
  );
  dialogState.set(dialogId, "filters", filterState);
}

function onFilterChange(): void {
  filterState.search = ensureEl<HTMLInputElement>("astralSearch").value;
  filterState.stateId = +ensureEl<HTMLSelectElement>("astralFilterState").value;
  filterState.cultureId = +ensureEl<HTMLSelectElement>("astralFilterCulture").value;
  dialogState.set(dialogId, "filters", filterState);
  systemsTable.reset();
}

function getFilteredSystems(): StarSystem[] {
  const searchText = filterState.search.toLowerCase().trim();
  let filtered = systemsOf();

  if (searchText) {
    filtered = filtered.filter(system => {
      const state = pack.states[system.state]?.name || "";
      const culture = pack.cultures[system.culture]?.name || "";
      return Tags.matches(searchText, system.name, system.traits, [state, culture, system.class, system.className]);
    });
  }
  if (filterState.stateId !== -1) filtered = filtered.filter(system => system.state === filterState.stateId);
  if (filterState.cultureId !== -1) filtered = filtered.filter(system => system.culture === filterState.cultureId);
  return filtered;
}

// totals and footer span the full filtered set, not just the current page
function renderSystemRows(view: TableView<StarSystem>): void {
  const body = ensureEl("astralBody");
  body.querySelectorAll(":scope > .states").forEach(row => {
    row.remove();
  });

  let lines = "";
  let totalPopulation = 0;

  for (const system of view.all) totalPopulation += system.population;

  for (const system of view.rows) {
    const state = pack.states[system.state]?.name || "";
    const culture = pack.cultures[system.culture]?.name || "";
    const population = si(system.population);

    lines += /* html */ `<div
        class="states"
        data-id="${system.id}"
        data-name="${escapeHtml(system.name)}"
        data-class="${escapeHtml(system.class)}"
        data-state="${escapeHtml(state)}"
        data-culture="${escapeHtml(culture)}"
        data-population="${system.population}"
        data-features="${featureSortKey(system)}"
        data-traits="${escapeHtml(system.traits.join(", "))}"
      >
        <span data-tip="${t("Click to zoom")}" class="icon-dot-circled pointer" data-col="locate"></span>
        <input data-tip="${t("Name")}" class="astralName" value="${escapeHtml(system.name)}" data-col="name" disabled />
        <input data-tip="${t("Spectral class")}" value="${escapeHtml(system.class)}" data-col="class" disabled />
        <input data-tip="${t("State")}" value="${escapeHtml(state)}" data-col="state" disabled />
        <input data-tip="${t("Dominant culture")}" value="${escapeHtml(culture)}" data-col="culture" disabled />
        <input data-tip="${t("Population")}" value="${population}" data-col="population" disabled />
        <div data-col="features">
          <span
            data-tip="${system.capital ? t("Capital") : t("Not a capital")}"
            class="icon-star-empty${system.capital ? "" : " inactive"}" style="padding: 0 1px;"></span>
          <span
            data-tip="${system.port ? t("Port") : t("Not a port")}"
            class="icon-anchor${system.port ? "" : " inactive"}" style="font-size: .9em; padding: 0 1px;"></span>
        </div>
        <input data-tip="${t("Traits")}" value="${escapeHtml(system.traits.join(", "))}" data-col="traits" disabled />
        <span data-col="edit" data-tip="${t("Open the System Editor")}" class="icon-pencil"></span>
      </div>`;
  }
  body.insertAdjacentHTML("beforeend", lines);

  ensureEl("astralCount").textContent = `${view.all.length} of ${systemsOf().length}`;
  ensureEl("astralAvgPopulation").textContent = view.all.length
    ? si(Math.round(totalPopulation / view.all.length))
    : "0";

  renderEditorPagination(ensureEl("astralFooter"), view, systemsTable.goto);

  body.querySelectorAll("div.states").forEach(el => void el.addEventListener("mouseenter", onSystemHighlightOn));
  body
    .querySelectorAll("div.states")
    .forEach(el => void el.addEventListener("mouseleave", () => onSystemHighlightOff()));
  body.querySelectorAll("div > span.icon-dot-circled").forEach(el => void el.addEventListener("click", zoomIntoSystem));
  body.querySelectorAll("div > span.icon-pencil").forEach(el => void el.addEventListener("click", openSystemEditor));
}

function onSystemHighlightOn(event: Event): void {
  const burg = Number((event.currentTarget as HTMLElement).dataset.id);
  const label = document.querySelector(`#labels [data-label-type='burg'][data-id='${burg}']`);
  if (label) label.classList.add("drag");
}

function onSystemHighlightOff(): void {
  document.querySelectorAll("text[data-label-type='burg'].drag").forEach(label => {
    label.classList.remove("drag");
  });
}

function zoomIntoSystem(this: HTMLElement): void {
  const line = this.closest<HTMLElement>(".states")!;
  const burg = Number(line.dataset.id);
  const burgObject = pack.burgs[burg];
  if (!burgObject) return;
  zoomTo(burgObject.x, burgObject.y, 8, 2000);
}

function openSystemEditor(this: HTMLElement): void {
  const line = this.closest<HTMLElement>(".states")!;
  const burg = Number(line.dataset.id);
  if (!pack.burgs[burg] || pack.burgs[burg].removed) {
    tip(t("This system is not on the map anymore"), false, "error");
    return;
  }
  Controllers.AstralSystemEditor.open(burg);
}

function downloadSystemsData(): void {
  const rows = systemsOf().map(system => {
    const state = pack.states[system.state]?.name || "";
    const culture = pack.cultures[system.culture]?.name || "";
    return [
      system.id,
      system.name,
      `${system.class} ${system.className}`,
      state,
      culture,
      system.population,
      system.capital ? "capital" : "",
      system.port ? "port" : "",
      system.traits.join("; ")
    ];
  });
  Csv.download("Star Systems", CSV_COLUMNS, rows);
}

export const AstralSystems = { open };
