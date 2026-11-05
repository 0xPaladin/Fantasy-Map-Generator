import { Controllers } from "@/controllers";
import { FACTION_ASSETS_CATALOG, getFactionAsset } from "@/data/faction-assets";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { Factions } from "@/model/political/factions-generator";
import { Military } from "@/model/political/military-generator";
import { Layers } from "@/renderers/layers";
import { Csv } from "@/services/io/csv";
import type { Faction, FactionScale } from "@/types/factions";
import type { YieldValues } from "@/types/living";
import { Dialog } from "@/ui/dialog/dialog";
import { bindColumnSorting, sortDataByColumns } from "@/ui/dialog/sorting";
import { dialogState } from "@/ui/dialog/state";
import {
  type EditorColumn,
  initColumnVisibility,
  initEditorTable,
  renderEditorHeader,
  type TableView
} from "@/ui/dialog/table";
import type { FillBoxElement } from "@/ui/elements/fill-box";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const dialogId = "factionsEditor" as const;
const position = { my: "right top", at: "right-10 top+10", of: "svg" };

const CSV_COLUMNS = [
  "Id",
  "Name",
  "Category",
  "Type",
  "Scale",
  "Tier",
  "Allegiance",
  "HQ Cell",
  "HQ Burg",
  "Outposts Count",
  "Treasury",
  "Influence",
  "Food",
  "Production",
  "Gold",
  "Science",
  "Culture",
  "Faith",
  "Happiness",
  "Citizens",
  "Worked Cells",
  "Alignment",
  "Expansionism",
  "Color"
];

function formatYieldValue(value: number | undefined): string {
  return String(Math.round(value ?? 0));
}

function formatYields(faction: Faction): string {
  const yields: YieldValues | undefined = faction.yieldsPerTurn;
  if (!yields) return "—";
  return `🌾 ${formatYieldValue(yields.food)} · 🔨 ${formatYieldValue(yields.production)} · 🪙 ${formatYieldValue(yields.gold)} · 🔬 ${formatYieldValue(yields.science)} · 🎭 ${formatYieldValue(yields.culture)} · ✨ ${formatYieldValue(yields.faith)} · 😊 ${formatYieldValue(faction.happiness)}`;
}

function factionNodes(faction: Faction) {
  return [faction.hq, ...(faction.outposts ?? [])].filter(Boolean);
}

function totalCitizens(faction: Faction): number {
  return factionNodes(faction).reduce((sum, node) => sum + (node?.sim?.citizens ?? 0), 0);
}

function totalWorkedCells(faction: Faction): number {
  return factionNodes(faction).reduce((sum, node) => sum + (node?.sim?.workedCells?.length ?? 0), 0);
}

function productionSummary(faction: Faction): string {
  const sim = faction.hq?.sim;
  const item = sim?.productionQueue?.[0];
  if (!item) return "—";
  const def =
    item.kind === "unit"
      ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
      : CIV_BUILDING_BY_ID[item.id];
  const progress = Math.round(sim?.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
  const cost = Math.round((def as { cost?: number } | undefined)?.cost ?? 0);
  return `${def?.name ?? item.id} ${progress}/${cost}`;
}

function nodeDetailsText(faction: Faction, node: NonNullable<Faction["hq"]> | Faction["outposts"][number], isHq: boolean): string {
  void faction;
  const sim = node.sim;
  if (!sim) return "—";
  const yields = sim.cityYields;
  const yieldText = yields
    ? `🌾 ${formatYieldValue(yields.food)} · 🔨 ${formatYieldValue(yields.production)} · 🪙 ${formatYieldValue(yields.gold)} · 🔬 ${formatYieldValue(yields.science)} · 🎭 ${formatYieldValue(yields.culture)} · ✨ ${formatYieldValue(yields.faith)}`
    : "—";
  const queue = (sim.productionQueue ?? [])
    .map(item => {
      const def =
        item.kind === "unit"
          ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
          : CIV_BUILDING_BY_ID[item.id];
      const progress = Math.round(sim.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
      const cost = Math.round((def as { cost?: number } | undefined)?.cost ?? 0);
      return `${def?.name ?? item.id} ${progress}/${cost}`;
    })
    .join(", ");
  const workedCount = sim.workedCells?.length ?? 0;
  return `${isHq ? "HQ" : "Outpost"} · ${sim.citizens ?? 0} citizens · ${workedCount} worked cells · ${yieldText}${queue ? ` · Queue: ${queue}` : ""}`;
}

let filterState: { search: string; category: string; scale: string };

const columns: EditorColumn<Faction>[] = [
  { key: "locate", width: "1.2em", permanent: true },
  { key: "color", width: "1.2em", permanent: true },
  {
    key: "name",
    label: t("Faction"),
    width: "10em",
    permanent: true,
    sortBy: f => f.name || "",
    sortType: "alpha"
  },
  { key: "icon", width: "1.6em" },
  {
    key: "category",
    label: t("Category"),
    width: "7.5em",
    sortBy: f => f.category || "",
    sortType: "alpha"
  },
  {
    key: "scale",
    label: t("Scale"),
    width: "5em",
    sortBy: f => f.scale || "",
    sortType: "alpha"
  },
  {
    key: "tier",
    label: t("Tier"),
    width: "3em",
    sortBy: f => f.tier || 1,
    sortType: "numeric"
  },
  {
    key: "allegiance",
    label: t("Allegiance"),
    width: "7em",
    sortBy: f => f.allegiance || "",
    sortType: "alpha"
  },
  {
    key: "hq",
    label: t("HQ"),
    width: "7.5em",
    sortBy: f => (f.hq.burgId ? pack.burgs?.[f.hq.burgId]?.name || "" : `Cell ${f.hq.cell}`),
    sortType: "alpha"
  },
  {
    key: "outposts",
    label: t("Outposts"),
    width: "5em",
    sortBy: f => f.outposts?.length || 0,
    sortType: "numeric"
  },
  {
    key: "treasury",
    label: t("Treasury"),
    width: "5em",
    sortBy: f => f.treasury || 0,
    sortType: "numeric"
  },
  {
    key: "influence",
    label: t("Influence"),
    width: "5em",
    sortBy: f => f.influence || 0,
    sortType: "numeric"
  },
  {
    key: "yields",
    label: t("Yields"),
    width: "14em",
    sortBy: f => f.yieldsPerTurn?.gold || 0,
    sortType: "numeric"
  },
  {
    key: "citizens",
    label: t("Citizens"),
    width: "7em",
    sortBy: f => totalCitizens(f),
    sortType: "numeric"
  },
  {
    key: "worked",
    label: t("Worked Cells"),
    width: "5em",
    sortBy: f => totalWorkedCells(f),
    sortType: "numeric"
  },
  {
    key: "production",
    label: t("Production"),
    width: "10em",
    sortBy: f => f.hq?.sim?.productionQueue?.[0]?.id || "",
    sortType: "alpha"
  },
  {
    key: "military",
    label: t("Forces"),
    width: "4em",
    sortBy: f => f.military?.length || 0,
    sortType: "numeric"
  },
  { key: "details", width: "1.2em" },
  { key: "remove", width: "1.2em", permanent: true }
];

const factionsTable = initEditorTable<Faction>({ getData: getFactionsData, onUpdate: renderFactionsPage });

function open(focusId?: number): void {
  Dialog.closeAll("#factionsEditor, .stable");
  Layers.show("factions");

  filterState = dialogState.get(dialogId, "filters", () => ({ search: "", category: "all", scale: "all" }));
  filterState.search ??= "";
  filterState.category ??= "all";
  filterState.scale ??= "all";

  renderDialog();
  updateFilters();
  factionsTable.reset();

  Dialog.open("factionsEditor", {
    title: t("Factions Overview & Editor"),
    onClose: closeFactionsEditor,
    position
  });

  if (focusId) {
    setTimeout(() => {
      const row = findEl(`factionRow-${focusId}`);
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
        row.style.outline = "2px solid #38bdf8";
        setTimeout(() => {
          row.style.outline = "";
        }, 1500);
      }
    }, 100);
  }
}

function closeFactionsEditor(): void {
  const view = factionsTable.view();
  view.rows = [];
  view.all = [];
}

function getFactionsData(): Faction[] {
  if (!pack.factions) return [];
  const search = filterState.search.toLowerCase().trim();
  const categoryFilter = filterState.category;
  const scaleFilter = filterState.scale;

  let list = Factions.active();

  if (categoryFilter !== "all") {
    list = list.filter(f => f.category === categoryFilter);
  }
  if (scaleFilter !== "all") {
    list = list.filter(f => f.scale === scaleFilter);
  }
  if (search) {
    list = list.filter(f => {
      const burgName = f.hq.burgId ? (pack.burgs?.[f.hq.burgId]?.name?.toLowerCase() ?? "") : "";
      return (
        f.name.toLowerCase().includes(search) ||
        f.type.toLowerCase().includes(search) ||
        f.category.toLowerCase().includes(search) ||
        burgName.includes(search)
      );
    });
  }

  if (!findEl(`${dialogId}Header`)) return list;
  return sortDataByColumns(dialogId, list, columns);
}

function renderDialog(): void {
  Dialog.destroy("factionsEditor");
  const editorHtml = /* html */ `
    <div id="factionsEditor" class="dialog stable editorDialog">
      ${renderEditorHeader({ dialogId, columns })}
      <div id="factionsBodySection" class="table" data-type="absolute" style="max-height: 480px; overflow-y: auto;"></div>
      <div id="factionsFilters" class="editorFilters" style="display: flex; gap: 8px; align-items: center; padding: 6px;">
        <label for="factionsSearch">
          ${t("Search")}: <input id="factionsSearch" type="search" style="width: 120px;" />
        </label>
        <label for="factionsCategoryFilter">
          ${t("Category")}:
          <select id="factionsCategoryFilter">
            <option value="all">${t("All")}</option>
            <option value="commercial">${t("Commercial")}</option>
            <option value="adventuring">${t("Adventuring")}</option>
            <option value="underworld">${t("Underworld")}</option>
            <option value="religious">${t("Religious")}</option>
            <option value="political">${t("Political")}</option>
            <option value="martial">${t("Martial")}</option>
          </select>
        </label>
        <label for="factionsScaleFilter">
          ${t("Scale")}:
          <select id="factionsScaleFilter">
            <option value="all">${t("All")}</option>
            <option value="burg">${t("Burg")}</option>
            <option value="province">${t("Province")}</option>
            <option value="state">${t("State")}</option>
            <option value="world">${t("World")}</option>
          </select>
        </label>
      </div>
      <div id="factionsFooter" class="totalLine" style="display: flex; justify-content: space-between; align-items: center; padding: 6px;">
        <div>
          ${t("Factions")}:&nbsp;<span id="factionsFooterCount">0</span> |
          ${t("Outposts")}:&nbsp;<span id="factionsFooterOutposts">0</span>
        </div>
        <div style="display: flex; gap: 4px;">
          <button id="addFactionButton" class="btn" data-tip="${t("Add a new custom faction")}">${t("+ Faction")}</button>
          <button id="regenerateFactionsButton" class="btn" data-tip="${t("Regenerate all procedural factions")}">${t("Regenerate")}</button>
          <button id="exportFactionsCsv" class="btn icon-download" data-tip="${t("Download CSV data")}"></button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", editorHtml);
  initColumnVisibility({
    dialogId,
    columns,
    onUpdate: () => factionsTable.refresh()
  });
  bindColumnSorting(dialogId, factionsTable.reset);

  ensureEl<HTMLInputElement>("factionsSearch").addEventListener("input", function () {
    filterState.search = this.value;
    factionsTable.refresh();
  });

  ensureEl<HTMLSelectElement>("factionsCategoryFilter").addEventListener("change", function () {
    filterState.category = this.value;
    factionsTable.refresh();
  });

  ensureEl<HTMLSelectElement>("factionsScaleFilter").addEventListener("change", function () {
    filterState.scale = this.value;
    factionsTable.refresh();
  });

  ensureEl("addFactionButton").addEventListener("click", addNewFaction);
  ensureEl("regenerateFactionsButton").addEventListener("click", regenerateAllFactions);
  ensureEl("exportFactionsCsv").addEventListener("click", exportCsv);
}

function updateFilters(): void {
  ensureEl<HTMLInputElement>("factionsSearch").value = filterState.search;
  ensureEl<HTMLSelectElement>("factionsCategoryFilter").value = filterState.category;
  ensureEl<HTMLSelectElement>("factionsScaleFilter").value = filterState.scale;
}

function renderFactionsPage(view: TableView<Faction>): void {
  const container = findEl("factionsBodySection");
  if (!container) return;

  const totalOutposts = view.all.reduce((sum, f) => sum + (f.outposts?.length ?? 0), 0);
  ensureEl("factionsFooterCount").textContent = String(view.all.length);
  ensureEl("factionsFooterOutposts").textContent = String(totalOutposts);

  const categories: FactionCategory[] = [
    "commercial",
    "adventuring",
    "underworld",
    "religious",
    "political",
    "martial"
  ];
  const allegiances: FactionAllegiance[] = ["state_arm", "chartered", "autonomous", "clandestine", "hostile"];

  const rows = view.rows
    .map(f => {
      const hqName = f.hq.burgId
        ? (pack.burgs?.[f.hq.burgId]?.name ?? `Burg ${f.hq.burgId}`)
        : f.hq.markerId !== undefined
          ? (pack.markers?.[f.hq.markerId]?.legend ?? `Marker ${f.hq.markerId}`)
          : `Cell ${f.hq.cell}`;

      const catOptions = categories
        .map(c => `<option value="${c}" ${f.category === c ? "selected" : ""}>${capitalize(c)}</option>`)
        .join("");

      const allgOptions = allegiances
        .map(a => `<option value="${a}" ${f.allegiance === a ? "selected" : ""}>${capitalize(a)}</option>`)
        .join("");

      return /* html */ `
      <div id="factionRow-${f.i}" class="states" data-id="${f.i}">
        <div data-col="locate" class="pointer icon-dot-circled" data-action="locate" data-tip="${t("Locate HQ on map")}"></div>
        <fill-box fill="${f.color}" data-col="color" data-action="color" data-tip="${t("Change color")}"></fill-box>
        <input class="name" value="${escapeHtml(f.name)}" data-col="name" data-action="rename" data-tip="${t("Click to rename")}" />
        <span data-col="icon" class="pointer" data-action="icon" data-tip="${t("Change icon")}" style="text-align: center; font-size: 1.1em;">${f.icon || "⚔️"}</span>
        <select data-col="category" data-action="category">${catOptions}</select>
        <span data-col="scale" class="badge" data-tip="${t("Calculated scale: burg, province, state, or world")}">${capitalize(f.scale)}</span>
        <span data-col="tier" style="text-align: center;">T${f.tier}</span>
        <select data-col="allegiance" data-action="allegiance">${allgOptions}</select>
        <span data-col="hq" class="pointer" data-action="locate" data-tip="${t("Click to zoom to HQ")}" style="text-decoration: underline;">${escapeHtml(hqName)}</span>
        <span data-col="outposts" class="badge pointer" data-action="outposts" data-tip="${t("Click to manage outposts and assets")}">${f.outposts?.length || 0}</span>
        <input type="number" min="0" max="99999" value="${f.treasury || 0}" data-col="treasury" data-action="treasury" style="width: 4.5em;" />
        <input type="number" min="0" max="99999" value="${f.influence || 0}" data-col="influence" data-action="influence" style="width: 4.5em;" />
        <span data-col="yields" data-tip="${escapeHtml(formatYields(f))}">${escapeHtml(formatYields(f))}</span>
        <span data-col="citizens" style="text-align: center;">${totalCitizens(f)}</span>
        <span data-col="worked" style="text-align: center;">${totalWorkedCells(f)}</span>
        <span data-col="production" data-tip="${escapeHtml(productionSummary(f))}">${escapeHtml(productionSummary(f))}</span>
        <span data-col="military" style="text-align: center;">${f.military?.length || 0}</span>
        <div data-col="details" class="pointer icon-pencil" data-action="details" data-tip="${t("Manage Outposts & Assets")}"></div>
        <div data-col="remove" class="pointer icon-trash" data-action="remove" data-tip="${t("Remove faction")}"></div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = rows;

  // Event delegation on table body
  container.addEventListener("click", handleTableClick);
  container.addEventListener("change", handleTableChange);
}

function handleTableClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-action]");
  if (!target) return;

  const row = target.closest<HTMLElement>("[data-id]");
  const id = Number(row?.dataset.id);
  if (!id || !pack.factions?.[id]) return;
  const faction = pack.factions[id];
  const action = target.dataset.action;

  if (action === "locate") {
    zoomToFaction(faction);
  } else if (action === "color") {
    const current = (target as FillBoxElement).fill || faction.color;
    void Controllers.ColorPicker.open(current, newColor => {
      faction.color = newColor;
      (target as FillBoxElement).fill = newColor;
      Layers.draw("factions");
    });
  } else if (action === "icon") {
    void Controllers.IconPicker.open({
      current: faction.icon || "⚔️",
      onPick: newIcon => {
        if (newIcon) {
          faction.icon = newIcon;
          target.textContent = newIcon;
          Layers.draw("factions");
        }
      }
    });
  } else if (action === "outposts" || action === "details") {
    openOutpostsDialog(faction.i);
  } else if (action === "remove") {
    Dialog.confirm({
      message: `${t("Are you sure you want to remove")} ${faction.name}?`,
      onConfirm: () => {
        Factions.remove(faction.i);
        Layers.draw("factions");
        factionsTable.refresh();
      }
    });
  }
}

function handleTableChange(event: Event): void {
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>("[data-id]");
  const id = Number(row?.dataset.id);
  if (!id || !pack.factions?.[id]) return;
  const faction = pack.factions[id];
  const action = target.dataset.action;

  if (action === "rename") {
    const val = (target as HTMLInputElement).value.trim();
    if (val) {
      faction.name = val;
      Layers.draw("factions");
    }
  } else if (action === "category") {
    faction.category = (target as HTMLSelectElement).value as FactionCategory;
    Layers.draw("factions");
  } else if (action === "allegiance") {
    faction.allegiance = (target as HTMLSelectElement).value as FactionAllegiance;
    Layers.draw("factions");
  } else if (action === "treasury") {
    faction.treasury = Math.max(0, Number((target as HTMLInputElement).value) || 0);
  } else if (action === "influence") {
    faction.influence = Math.max(0, Number((target as HTMLInputElement).value) || 0);
  }
}

function zoomToFaction(faction: Faction): void {
  if (faction.hq.burgId && pack.burgs?.[faction.hq.burgId]) {
    const b = pack.burgs[faction.hq.burgId];
    zoomTo(b.x, b.y, 6, 1400);
    return;
  }
  if (faction.hq.markerId !== undefined && pack.markers?.[faction.hq.markerId]) {
    const m = pack.markers[faction.hq.markerId];
    zoomTo(m.x, m.y, 6, 1400);
    return;
  }
  if (pack.cells?.p?.[faction.hq.cell]) {
    const [cx, cy] = pack.cells.p[faction.hq.cell];
    zoomTo(cx, cy, 6, 1400);
  }
}

function addNewFaction(): void {
  const defaultCell = pack.burgs?.[1]?.cell ?? pack.states?.[1]?.center ?? 0;
  const defaultBurg = pack.burgs?.[1]?.i;

  const newFaction = Factions.add({
    name: "New Faction",
    category: "commercial",
    type: "merchant_consortium",
    allegiance: "autonomous",
    hq: { cell: defaultCell, burgId: defaultBurg, fortified: false, secrecy: 0, assets: ["trade_depot"] },
    treasury: 150,
    influence: 30
  });

  Layers.draw("factions");
  factionsTable.refresh();
  open(newFaction.i);
}

function regenerateAllFactions(): void {
  Dialog.confirm({
    message: t("Regenerate all factions? Custom factions will be replaced with new procedural organizations."),
    onConfirm: () => {
      Factions.generate();
      Layers.draw("factions");
      factionsTable.refresh();
    }
  });
}

function exportCsv(): void {
  const list = Factions.active();
  const rows = list.map(f => [
    f.i,
    f.name,
    f.category,
    f.type,
    f.scale,
    f.tier,
    f.allegiance,
    f.hq.cell,
    f.hq.burgId ?? "",
    f.outposts?.length ?? 0,
    f.treasury,
    f.influence,
    f.yieldsPerTurn?.food ?? 0,
    f.yieldsPerTurn?.production ?? 0,
    f.yieldsPerTurn?.gold ?? 0,
    f.yieldsPerTurn?.science ?? 0,
    f.yieldsPerTurn?.culture ?? 0,
    f.yieldsPerTurn?.faith ?? 0,
    f.happiness ?? 0,
    totalCitizens(f),
    totalWorkedCells(f),
    f.alignment,
    f.expansionism,
    f.color
  ]);
  Csv.download("Factions", CSV_COLUMNS, rows);
}

/** Open Outposts & Assets Management Dialog for a single Faction */
export function openOutpostsDialog(factionId: number): void {
  const faction = pack.factions?.[factionId];
  if (!faction) return;

  const dialogDomId = "factionOutpostsDialog";
  Dialog.destroy(dialogDomId);

  const burgOptions = (pack.burgs ?? [])
    .filter(b => b?.i && !b.removed && b.i !== faction.hq.burgId && !faction.outposts.some(o => o.burgId === b.i))
    .map(b => `<option value="${b.i}">${escapeHtml(b.name)} (Pop: ${b.population || 0})</option>`)
    .join("");

  const assetOptions = Object.values(FACTION_ASSETS_CATALOG)
    .filter(a => !faction.hq.assets.includes(a.id))
    .map(a => `<option value="${a.id}">${escapeHtml(a.name)} (T${a.tier} · ${a.cost}g)</option>`)
    .join("");

  const outpostsHtml = faction.outposts.length
    ? faction.outposts
        .map((op, idx) => {
          const burg = pack.burgs?.[op.burgId];
          const burgName = burg?.name ?? `Burg ${op.burgId}`;
          const assetsText = op.assets.join(", ") || t("None");
          return /* html */ `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #334155;">
              <div>
                <b>${escapeHtml(burgName)}</b>
                <span style="font-size: 0.85em; opacity: 0.8;"> · Tier ${op.tier} · Infl: ${op.influence}% · Assets: ${assetsText}</span>
                <div style="font-size: 0.82em; opacity: 0.75; margin-top: 2px;">${escapeHtml(nodeDetailsText(faction, op, false))}</div>
              </div>
              <button class="btn icon-trash removeOutpostBtn" data-index="${idx}" data-tip="${t("Abandon outpost")}"></button>
            </div>
          `;
        })
        .join("")
    : `<div style="padding: 6px 0; opacity: 0.7;">${t("No outposts established yet.")}</div>`;

  const hqAssetsHtml = faction.hq.assets.length
    ? faction.hq.assets
        .map(
          (aid, idx) => `
            <span class="badge" style="margin: 2px;">
              ${escapeHtml(getFactionAsset(aid)?.name ?? aid)}
              <span class="pointer removeHqAssetBtn" data-index="${idx}" style="margin-left: 4px; color: #f87171;">✕</span>
            </span>
          `
        )
        .join("")
    : `<span style="opacity: 0.7;">${t("No assets constructed.")}</span>`;

  const markup = /* html */ `
    <div id="${dialogDomId}" class="dialog" style="min-width: 380px; max-width: 500px; padding: 10px;">
      <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 8px;">
        <span style="color: ${faction.color};">${faction.icon || "⚔️"}</span> ${escapeHtml(faction.name)}
        <span class="badge" style="float: right;">${capitalize(faction.scale)} (T${faction.tier})</span>
      </div>
      <div style="font-size: 0.85em; opacity: 0.85; margin-bottom: 8px;">${escapeHtml(formatYields(faction))} · ${totalCitizens(faction)} citizens · ${totalWorkedCells(faction)} worked cells</div>
      <div style="font-size: 0.82em; opacity: 0.75; margin-bottom: 8px;">${escapeHtml(nodeDetailsText(faction, faction.hq, true))}</div>

      <div style="margin-bottom: 12px; background: rgba(255,255,255,0.04); padding: 8px; border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 4px;">${t("HQ Assets")}:</div>
        <div id="hqAssetsList" style="margin-bottom: 6px;">${hqAssetsHtml}</div>
        <div style="display: flex; gap: 4px;">
          <select id="newHqAssetSelect" style="flex-grow: 1;">${assetOptions}</select>
          <button id="addHqAssetBtn" class="btn" style="white-space: nowrap;">${t("+ Asset")}</button>
        </div>
      </div>

      <div style="margin-bottom: 8px; background: rgba(255,255,255,0.04); padding: 8px; border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 4px;">${t("Established Outposts")}:</div>
        <div id="outpostsList" style="max-height: 160px; overflow-y: auto; margin-bottom: 6px;">${outpostsHtml}</div>
        <div style="display: flex; gap: 4px;">
          <select id="newOutpostBurgSelect" style="flex-grow: 1;">${burgOptions}</select>
          <button id="addOutpostBtn" class="btn" style="white-space: nowrap;">${t("+ Outpost")}</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", markup);

  Dialog.open(dialogDomId, {
    title: `${t("Manage Outposts & Assets")} - ${faction.name}`,
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(dialogDomId)
  });

  // Attach Outposts & Assets listeners
  ensureEl("addHqAssetBtn")?.addEventListener("click", () => {
    const sel = ensureEl<HTMLSelectElement>("newHqAssetSelect");
    if (sel.value) {
      faction.hq.assets.push(sel.value);
      Factions.recomputeScale(faction);
      Layers.draw("factions");
      openOutpostsDialog(factionId);
      factionsTable.refresh();
    }
  });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".removeHqAssetBtn")
    .forEach(btn => {
      btn.addEventListener("click", function () {
        const idx = Number((this as HTMLElement).dataset.index);
        faction.hq.assets.splice(idx, 1);
        Factions.recomputeScale(faction);
        Layers.draw("factions");
        openOutpostsDialog(factionId);
        factionsTable.refresh();
      });
    });

  ensureEl("addOutpostBtn")?.addEventListener("click", () => {
    const sel = ensureEl<HTMLSelectElement>("newOutpostBurgSelect");
    const burgId = Number(sel.value);
    if (burgId && pack.burgs?.[burgId]) {
      const b = pack.burgs[burgId];
      faction.outposts.push({
        burgId,
        cell: b.cell,
        tier: 1,
        influence: 35,
        secrecy: faction.allegiance === "clandestine" ? 50 : 0,
        assets: [],
        establishedYear: options?.map?.lore?.calendar?.year ?? 1000
      });
      Factions.recomputeScale(faction);
      Layers.draw("factions");
      openOutpostsDialog(factionId);
      factionsTable.refresh();
    }
  });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".removeOutpostBtn")
    .forEach(btn => {
      btn.addEventListener("click", function () {
        const idx = Number((this as HTMLElement).dataset.index);
        faction.outposts.splice(idx, 1);
        Factions.recomputeScale(faction);
        Layers.draw("factions");
        openOutpostsDialog(factionId);
        factionsTable.refresh();
      });
    });
}

export const FactionsEditor = {
  open,
  close: () => Dialog.close("factionsEditor"),
  openOutpostsDialog
};
