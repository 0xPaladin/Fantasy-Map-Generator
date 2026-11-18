import { Controllers } from "@/controllers";
import { ALIGNMENTS, type Alignment } from "@/data/culture-traits";
import { FACTION_ASSETS_CATALOG, getFactionAsset } from "@/data/faction-assets";
import {
  COMMERCIAL_ASSETS,
  COMMISSION_PER_ASSET,
  factionNodeHostPresence,
  projectedAssetSeasons
} from "@/model/physical/living-faction-economy";
import { Living } from "@/model/physical/living-generator";
import { Factions, syncFactionState } from "@/model/political/factions-generator";
import type { Regiment } from "@/model/political/military-generator";
import { formatPrice, getMoneySymbol } from "@/model/units";
import { Layers } from "@/renderers/layers";
import { Csv } from "@/services/io/csv";
import type {
  Faction,
  FactionAllegiance,
  FactionCategory,
  FactionExpenseBucket,
  FactionHq,
  FactionOutpost,
  FactionYieldBreakdown
} from "@/types/factions";
import { Dialog } from "@/ui/dialog/dialog";
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
import {
  budgetBackground,
  ECONOMY_COLORS,
  EconomyTerms,
  mountAdjustments,
  renderProsperityPercent,
  tone
} from "@/ui/economy-view";
import type { FillBoxElement } from "@/ui/elements/fill-box";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";
import { minmax, rn } from "@/utils/number-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const dialogId = "factionsEditor" as const;
const position = { my: "right top", at: "right-10 top+10", of: "svg" };

const CSV_COLUMNS = [
  "Id",
  "Name",
  "Category",
  "Type",
  "Allegiance",
  "Alignment",
  "HQ Cell",
  "HQ Burg",
  "Outposts Count",
  "Income",
  "Prosperity (%)",
  "Stability (%)",
  "Expansionism",
  "Color"
];

/** Daily gold a node or faction draws from the economy, before internal expenses */
function formatDailyIncome(gold: number | undefined): string {
  return gold ? formatPrice(gold) : "—";
}

export function formatAssetBenefits(assetId?: string): string {
  if (!assetId) return "—";
  const def = getFactionAsset(assetId);
  if (!def) return "—";
  const parts: string[] = [];
  if (def.burgImpact?.gold) {
    const sign = def.burgImpact.gold > 0 ? "+" : "";
    parts.push(`${sign}${def.burgImpact.gold} ${getMoneySymbol("🪙")}/day Host`);
  }
  if (COMMERCIAL_ASSETS.includes(assetId)) {
    parts.push(`+${Math.round(COMMISSION_PER_ASSET * 100)}% Market Cut`);
  }
  if (def.burgImpact?.stability) {
    const sign = def.burgImpact.stability > 0 ? "+" : "";
    parts.push(`${sign}${def.burgImpact.stability}% Host Stability`);
  }
  if (def.yields?.gold) {
    parts.push(`+${def.yields.gold} ${getMoneySymbol("🪙")}/day Revenue`);
  }
  if (def.yields?.militaryCap) {
    parts.push(`+${def.yields.militaryCap} Force Cap`);
  }
  if (def.yields?.secrecy) {
    parts.push(`+${def.yields.secrecy} Secrecy`);
  }
  if (def.yields?.development) {
    parts.push(`+${def.yields.development} Development`);
  }
  if (def.yields?.influence) {
    parts.push(`+${def.yields.influence} Influence`);
  }

  return parts.length ? parts.join(", ") : def.description || "—";
}

function provisionColor(provision: number): string {
  if (provision >= 0.8) return ECONOMY_COLORS.positive;
  if (provision >= 0.4) return "#d97706";
  return ECONOMY_COLORS.negative;
}

function renderExpensesPanel(faction: Faction, breakdown: FactionYieldBreakdown): string {
  const econ = breakdown.economy;
  const expRow = (name: string, share: number, bar: string, value: number, tipText: string, rowTone: string) =>
    `<div ${tipText ? `data-tip="${escapeHtml(tipText)}"` : ""} class="row budget"><span class="name">${name}</span><span class="right">${share}%</span>${bar}<span class="right ${rowTone}">${formatPrice(value)}</span></div>`;

  const expensesHtml = econ.expenses
    .map(exp => {
      const pctMet = Math.round(exp.provision * 100);
      const tipText = t("Spent: {{spent}} (effective {{effective}}) / Required: {{req}} · {{pct}}% met", {
        spent: formatPrice(exp.daily),
        effective: formatPrice(exp.effectiveDaily),
        req: formatPrice(exp.requiredDaily),
        pct: pctMet
      });
      return `<div class="row budget" data-bucket-row="${exp.bucket}" data-tip="${escapeHtml(tipText)}">
        <span class="name">
          <span>${escapeHtml(t(exp.label))}</span>
          <span class="muted" style="color: ${provisionColor(exp.provision)}; font-size: 0.8em;">(${pctMet}% · ${t("req")} ${formatPrice(exp.requiredDaily)})</span>
        </span>
        <span class="right" style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 1px;">
          <input type="number" class="factionBudgetInput" data-bucket="${exp.bucket}" min="0" max="100" step="1" value="${exp.targetShare}" style="width: 3.1em; text-align: right; margin: 0;" />%
        </span>
        <div class="bar" data-exp-bar="${exp.bucket}" style="background: ${budgetBackground(Math.min(100, exp.provision * 100), econ.corruptionRate)}"></div>
        <span class="right negative" data-exp-daily="${exp.bucket}">${formatPrice(-exp.daily)}</span>
      </div>`;
    })
    .join("");

  const corruptionRow = `<div class="row budget muted" data-tip="${t("Corruption: share of faction revenue lost to skimming and overhead (curbed by Administration)")}"><span class="name"><span class="swatch" style="background: ${ECONOMY_COLORS.pocketed}"></span>${t("Corruption")}: ${econ.corruptionRate}%</span><span></span><span></span><span class="right negative">${formatPrice(-econ.corruptionDaily)}</span></div>`;

  const titheRow =
    econ.charterTitheDaily > 0
      ? `<div class="row budget muted" data-tip="${t("Charter tithe paid daily to the patron state")}"><span class="name"><span class="swatch" style="background: ${ECONOMY_COLORS.spent}"></span>${t("Charter tithe")}: 15%</span><span></span><span></span><span class="right negative">${formatPrice(-econ.charterTitheDaily)}</span></div>`
      : "";

  const activeDef = faction.project ? getFactionAsset(faction.project.assetId) : undefined;
  const projectNote = faction.project
    ? `<div class="muted" style="margin-top: 2px;">🏗️ ${escapeHtml(activeDef?.name ?? faction.project.assetId)}: ${formatPrice(econ.projectDaily)}/day · ${faction.project.turnsLeft} ${faction.project.turnsLeft === 1 ? t("season left") : t("seasons left")}</div>`
    : "";

  return /* html */ `
    ${expensesHtml}
    <div class="total">${expRow(t("Day Balance"), econ.dayBalanceShare, "<span></span>", econ.dayBalance, t("Net daily balance (×90 per season)"), tone(econ.dayBalance))}</div>
    ${corruptionRow}
    ${titheRow}
    <div class="muted" style="margin-top: 2px;">${t("Required upkeep: {{req}}/day · Allocated: {{share}}%", { req: formatPrice(econ.requiredTotalDaily), share: econ.spentShare })}</div>
    ${projectNote}
  `;
}

function renderFactionEconomyLedger(faction: Faction, breakdown: FactionYieldBreakdown): string {
  const econ = breakdown.economy;
  const revRow = (label: string, value: number, tipText = "", rowTone = "positive", id = "") =>
    `<div ${tipText ? `data-tip="${escapeHtml(tipText)}"` : ""} class="row plain"><span class="name">${escapeHtml(label)}</span><span ${id ? `id="${id}"` : ""} class="right ${rowTone}">${formatPrice(value)}</span></div>`;

  const revenueHtml = econ.revenueLines.length
    ? econ.revenueLines.map(line => revRow(t(line.label), line.daily)).join("")
    : `<div class="row plain muted"><span class="name">${t("No active revenue streams")}</span><span class="right">—</span></div>`;

  const nodeCount = breakdown.nodes.length;
  const subNote =
    econ.hostProductShare > 0
      ? `${nodeCount} ${nodeCount === 1 ? t("active node") : t("active nodes")} · ${t("{{share}}% of host product", { share: econ.hostProductShare })}`
      : `${nodeCount} ${nodeCount === 1 ? t("active node") : t("active nodes")}`;

  return /* html */ `
    <div class="factionLedger columns">
      <div>
        <h4 data-tip="${t("Daily revenue streams across active HQ and outposts")}"><span>${t("Revenue")}</span><span>🏛️</span></h4>
        ${revenueHtml}
        <div id="factionRevenueAdjustments"></div>
        <div class="total">${revRow(t("Collected"), econ.collectedDaily, t("Total daily revenue before expenses"), tone(econ.collectedDaily), "factionRevenueCollected")}</div>
        <div class="muted" id="factionRevenueSubnote">${subNote}</div>
      </div>
      <div>
        <h4 data-tip="${t("Configurable daily expense shares and required upkeep fulfillment")}">
          <span>${t("Expenses")}</span>
          <span style="display: inline-flex; align-items: center; gap: 4px;">
            <button type="button" id="resetFactionBudgetBtn" class="btn icon-cw" style="padding: 0 3px; font-size: 0.78em; line-height: 1.1;" data-tip="${t("Reset expense shares to category defaults")}"></button>
            <span>🏛️</span>
          </span>
        </h4>
        <div id="factionLedgerExpenses">${renderExpensesPanel(faction, breakdown)}</div>
      </div>
    </div>
  `;
}

let filterState: { search: string; category: string; allegiance: string; alignment: string };

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
    key: "allegiance",
    label: t("Allegiance"),
    width: "7em",
    sortBy: f => f.allegiance || "",
    sortType: "alpha"
  },
  {
    key: "alignment",
    label: t("Alignment"),
    width: "7em",
    sortBy: f => f.alignment || "",
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
    sortType: "number"
  },
  {
    key: "income",
    label: t("Income"),
    width: "5.5em",
    sortBy: f => Living.getFactionYieldBreakdown(f).dailyIncome,
    sortType: "number"
  },
  {
    key: "prosperity",
    label: t("Prosperity"),
    width: "5.2em",
    sortBy: f => Living.getFactionYieldBreakdown(f).prosperity,
    sortType: "number"
  },
  {
    key: "stability",
    label: t("Stability"),
    width: "5em",
    sortBy: f => Living.getFactionYieldBreakdown(f).stability,
    sortType: "number"
  },
  {
    key: "military",
    label: t("Forces"),
    width: "4em",
    sortBy: f => f.military?.length || 0,
    sortType: "number"
  },
  { key: "details", width: "1.2em" },
  { key: "remove", width: "1.2em", permanent: true }
];

const factionsTable = initEditorTable<Faction>({ dialogId, getData: getFactionsData, onUpdate: renderFactionsPage });

function open(focusId?: number): void {
  Dialog.closeAll("#factionsEditor, .stable");
  Layers.show("factions");

  filterState = dialogState.get(dialogId, "filters", () => ({
    search: "",
    category: "all",
    allegiance: "all",
    alignment: "all"
  }));
  filterState.search ??= "";
  filterState.category ??= "all";
  filterState.allegiance ??= "all";
  filterState.alignment ??= "all";

  renderDialog();
  updateFilters();
  factionsTable.reset();

  Dialog.open("factionsEditor", {
    title: t("Factions Overview"),
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
  const allegianceFilter = filterState.allegiance;
  const alignmentFilter = filterState.alignment;

  let list = Factions.active();

  if (categoryFilter !== "all") {
    list = list.filter(f => f.category === categoryFilter);
  }
  if (allegianceFilter !== "all") {
    list = list.filter(f => f.allegiance === allegianceFilter);
  }
  if (alignmentFilter !== "all") {
    list = list.filter(f => f.alignment === alignmentFilter);
  }
  if (search) {
    list = list.filter(f => {
      const burgName = f.hq.burgId ? (pack.burgs?.[f.hq.burgId]?.name?.toLowerCase() ?? "") : "";
      return (
        f.name.toLowerCase().includes(search) ||
        f.type.toLowerCase().includes(search) ||
        f.category.toLowerCase().includes(search) ||
        f.allegiance.toLowerCase().includes(search) ||
        f.alignment.toLowerCase().includes(search) ||
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
      <div id="factionsBodySection" class="table">
        ${renderEditorHeader({ dialogId, columns })}
        <div id="factionsRows"></div>
      </div>
      <div id="factionsFilters" data-tip="${t("Apply a filter")}" class="editorFilters">
        <label for="factionsSearch" data-tip="${t("Filter by name, type, category, allegiance, alignment, or HQ burg")}"
          >${t("Search")}: <input id="factionsSearch" type="search"
        /></label>
        <label for="factionsCategoryFilter"
          >${t("Category")}:
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
        <label for="factionsAllegianceFilter"
          >${t("Allegiance")}:
          <select id="factionsAllegianceFilter">
            <option value="all">${t("All")}</option>
            <option value="state_arm">${t("State-Arm")}</option>
            <option value="chartered">${t("Chartered")}</option>
            <option value="autonomous">${t("Autonomous")}</option>
            <option value="clandestine">${t("Clandestine")}</option>
            <option value="hostile">${t("Hostile")}</option>
          </select>
        </label>
        <label for="factionsAlignmentFilter"
          >${t("Alignment")}:
          <select id="factionsAlignmentFilter">
            <option value="all">${t("All")}</option>
            <option value="good">${t("Good")}</option>
            <option value="lawful">${t("Lawful")}</option>
            <option value="neutral">${t("Neutral")}</option>
            <option value="chaotic">${t("Chaotic")}</option>
            <option value="evil">${t("Evil")}</option>
          </select>
        </label>
      </div>
      <div id="factionsFooter" class="totalLine">
        <div data-tip="${t("Factions displayed")}" style="margin-left: 5px">
          ${t("Factions")}:&nbsp;<span id="factionsFooterCount">${t("{{shown}} of {{total}}", { shown: 0, total: 0 })}</span>
        </div>
        <div data-tip="${t("Average daily income across displayed factions")}" style="margin-left: 12px">
          ${t("Avg daily income")}:&nbsp;<span id="factionsFooterIncome">0</span>
        </div>
        <div data-tip="${t("Total outposts")}" style="margin-left: 12px">
          ${t("Outposts")}:&nbsp;<span id="factionsFooterOutposts">0</span>
        </div>
      </div>
      <div id="factionsBottom" class="editorToolbar">
        <button id="factionsRefresh" data-tip="${t("Refresh")}" class="icon-cw"></button>
        <button id="addFactionButton" data-tip="${t("Add a new custom faction")}" class="icon-plus"></button>
        <button id="regenerateFactionsButton" data-tip="${t("Regenerate all procedural factions")}" class="icon-retweet"></button>
        <button id="exportFactionsCsv" data-tip="${t("Save data as a CSV file")}" class="icon-download"></button>
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

  ensureEl<HTMLSelectElement>("factionsAllegianceFilter").addEventListener("change", function () {
    filterState.allegiance = this.value;
    factionsTable.refresh();
  });

  ensureEl<HTMLSelectElement>("factionsAlignmentFilter").addEventListener("change", function () {
    filterState.alignment = this.value;
    factionsTable.refresh();
  });

  ensureEl("factionsRefresh").addEventListener("click", () => {
    updateFilters();
    factionsTable.reset();
  });
  ensureEl("addFactionButton").addEventListener("click", addNewFaction);
  ensureEl("regenerateFactionsButton").addEventListener("click", regenerateAllFactions);
  ensureEl("exportFactionsCsv").addEventListener("click", exportCsv);
}

function updateFilters(): void {
  ensureEl<HTMLInputElement>("factionsSearch").value = filterState.search;
  ensureEl<HTMLSelectElement>("factionsCategoryFilter").value = filterState.category;
  ensureEl<HTMLSelectElement>("factionsAllegianceFilter").value = filterState.allegiance;
  ensureEl<HTMLSelectElement>("factionsAlignmentFilter").value = filterState.alignment;
}

function renderFactionsPage(view: TableView<Faction>): void {
  const container = findEl("factionsRows");
  if (!container) return;

  const totalOutposts = view.all.reduce((sum, f) => sum + (f.outposts?.length ?? 0), 0);
  const validCount = pack.factions?.filter(f => f && f.i > 0 && !f.removed).length ?? view.all.length;
  const avgDailyIncome = view.all.length
    ? view.all.reduce((sum, f) => sum + Living.getFactionYieldBreakdown(f).dailyIncome, 0) / view.all.length
    : 0;
  ensureEl("factionsFooterCount").innerHTML = t("{{shown}} of {{total}}", {
    shown: view.all.length,
    total: validCount
  });
  ensureEl("factionsFooterIncome").textContent = formatPrice(avgDailyIncome);
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
  const alignments = ALIGNMENTS;

  const rows = view.rows
    .map(f => {
      const hqName = f.hq.burgId
        ? (pack.burgs?.[f.hq.burgId]?.name ?? `Burg ${f.hq.burgId}`)
        : f.hq.markerId !== undefined
          ? ((pack.markers?.[f.hq.markerId] as { legend?: string; name?: string } | undefined)?.legend ??
            pack.markers?.[f.hq.markerId]?.name ??
            `Marker ${f.hq.markerId}`)
          : `Cell ${f.hq.cell}`;

      const catOptions = categories
        .map(c => `<option value="${c}" ${f.category === c ? "selected" : ""}>${capitalize(c)}</option>`)
        .join("");

      const allgOptions = allegiances
        .map(a => `<option value="${a}" ${f.allegiance === a ? "selected" : ""}>${capitalize(a)}</option>`)
        .join("");

      const alignmentOptions = alignments
        .map(a => `<option value="${a}" ${f.alignment === a ? "selected" : ""}>${capitalize(a)}</option>`)
        .join("");

      const breakdown = Living.getFactionYieldBreakdown(f);
      const stabTone = breakdown.stability >= 0.7 ? "positive" : breakdown.stability < 0.4 ? "negative" : "";

      return /* html */ `
      <div id="factionRow-${f.i}" class="states" data-id="${f.i}">
        <div data-col="locate" class="pointer icon-dot-circled" data-action="locate" data-tip="${t("Locate HQ on map")}"></div>
        <fill-box fill="${f.color}" data-col="color" data-action="color" data-tip="${t("Change color")}"></fill-box>
        <input class="name" value="${escapeHtml(f.name)}" data-col="name" data-action="rename" data-tip="${t("Click to rename")}" />
        <span data-col="icon" class="pointer" data-action="icon" data-tip="${t("Change icon")}" style="text-align: center; font-size: 1.1em;">${f.icon || "⚔️"}</span>
        <select data-col="category" data-action="category">${catOptions}</select>
        <select data-col="allegiance" data-action="allegiance">${allgOptions}</select>
        <select data-col="alignment" data-action="alignment">${alignmentOptions}</select>
        <span data-col="hq" class="pointer" data-action="locate" data-tip="${t("Click to zoom to HQ")}" style="text-decoration: underline;">${escapeHtml(hqName)}</span>
        <span data-col="outposts" class="badge pointer" data-action="outposts" data-tip="${t("Click to manage outposts and assets")}">${f.outposts?.length || 0}</span>
        <span data-col="income" style="text-align: center;">${formatDailyIncome(breakdown.dailyIncome)}</span>
        <span data-col="prosperity" style="text-align: center;">${renderProsperityPercent(breakdown.prosperity)}</span>
        <span data-col="stability" class="${stabTone}" style="text-align: center;">${rn(breakdown.stability * 100)}%</span>
        <span data-col="military" style="text-align: center;">${f.military?.length || 0}</span>
        <div data-col="details" class="pointer icon-pencil" data-action="details" data-tip="${t("Manage Outposts & Assets")}"></div>
        <div data-col="remove" class="pointer icon-trash" data-action="remove" data-tip="${t("Remove faction")}"></div>
      </div>
    `;
    })
    .join("");

  container.innerHTML = rows;

  renderEditorPagination(ensureEl("factionsFooter"), view, factionsTable.goto);

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
  } else if (action === "alignment") {
    faction.alignment = (target as HTMLSelectElement).value as Alignment;
    Layers.draw("factions");
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
  const rows = list.map(f => {
    const b = Living.getFactionYieldBreakdown(f);
    return [
      f.i,
      f.name,
      f.category,
      f.type,
      f.allegiance,
      f.alignment,
      f.hq.cell,
      f.hq.burgId ?? "",
      f.outposts?.length ?? 0,
      rn(b.dailyIncome, 2),
      rn(b.prosperity * 100),
      rn(b.stability * 100),
      f.expansionism,
      f.color
    ];
  });
  Csv.download("Factions", CSV_COLUMNS, rows);
}

function formatRegimentComposition(reg: Regiment): string {
  if (reg.units && reg.units.length > 0) {
    const counts: Record<string, number> = {};
    for (const b of reg.units) {
      counts[b.type] = (counts[b.type] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => `${count}× ${capitalize(type)}`)
      .join(", ");
  }
  if (reg.u && Object.keys(reg.u).length > 0) {
    return Object.entries(reg.u)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${count} ${capitalize(type)}`)
      .join(", ");
  }
  return reg.n ? t("Fleet") : t("Regiment");
}

/** Open Outposts & Assets Management Dialog for a single Faction */
export function openOutpostsDialog(factionId: number, activeTab: "outposts" | "assets" | "forces" = "outposts"): void {
  const faction = pack.factions?.[factionId];
  if (!faction) return;

  const breakdown = Living.getFactionYieldBreakdown(faction);

  const dialogDomId = "factionOutpostsDialog";
  Dialog.destroy(dialogDomId);

  let currentTab = activeTab;

  const hqBurg = faction.hq.burgId ? pack.burgs?.[faction.hq.burgId] : null;
  const hqName = hqBurg?.name ?? (faction.hq.markerId ? `Marker ${faction.hq.markerId}` : `Cell ${faction.hq.cell}`);
  const hqStatusText = faction.hq.pillaged
    ? `<span style="opacity: 0.7; font-size: 0.85em; margin-left: 4px;">(Pillaged)</span>`
    : "";
  const hqIncome = formatDailyIncome(breakdown.hq?.dailyIncome);

  const burgOptions = (pack.burgs ?? [])
    .filter(b => b?.i && !b.removed && b.i !== faction.hq.burgId && !faction.outposts.some(o => o.burgId === b.i))
    .map(b => `<option value="${b.i}">${escapeHtml(b.name ?? "")} (Pop: ${b.population || 0})</option>`)
    .join("");

  const renderHostImpactHtml = (node: FactionHq | FactionOutpost, isHq: boolean, prosperity: number) => {
    const impact = factionNodeHostPresence(faction, node, isHq, prosperity);
    const parts: string[] = [];
    if (Math.abs(impact.goldDaily) >= 0.01) {
      const sign = impact.goldDaily > 0 ? "+" : "";
      parts.push(`<span class="${tone(impact.goldDaily)}">${sign}${formatPrice(impact.goldDaily)}/d</span>`);
    }
    if (Math.abs(impact.stabilityDelta) >= 0.05) {
      const sign = impact.stabilityDelta > 0 ? "+" : "";
      parts.push(`<span class="${tone(impact.stabilityDelta)}">${sign}${impact.stabilityDelta}% stab</span>`);
    }
    const tipText = t("Presence: {{pGold}}/day, {{pStab}}% stab · Assets: {{aGold}}/day, {{aStab}}% stab", {
      pGold: formatPrice(impact.presenceGoldDaily),
      pStab: impact.presenceStabilityDelta,
      aGold: formatPrice(impact.assetGoldDaily),
      aStab: impact.assetStabilityDelta
    });
    return parts.length
      ? `<span data-tip="${escapeHtml(tipText)}">${parts.join(" · ")}</span>`
      : `<span class="muted">—</span>`;
  };

  const hqRowHtml = /* html */ `
    <div class="states" style="background: rgba(255, 255, 255, 0.03);">
      <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">⭐ <b>${escapeHtml(hqName)}</b></div>
      <div style="justify-content: center; text-align: center; gap: 2px;">
        <input type="number" class="nodeInfluenceInput" data-node="hq" min="0" max="100" step="1" value="${Math.round(faction.hq.influence ?? 70)}" style="width: 4em; text-align: right; margin: 0;" />%${hqStatusText}
      </div>
      <div data-node-income="hq" style="justify-content: center; text-align: center;">${hqIncome}</div>
      <div data-node-impact="hq" style="justify-content: center; text-align: center; font-size: 0.9em;">${renderHostImpactHtml(faction.hq, true, breakdown.prosperity)}</div>
      <div></div>
    </div>
  `;

  const outpostsRowsHtml = faction.outposts
    .map((op, idx) => {
      const burg = pack.burgs?.[op.burgId];
      const burgName = burg?.name ?? `Burg ${op.burgId}`;
      const nodeBreakdown = breakdown.outposts.find(b => b.node === op);
      const income = formatDailyIncome(nodeBreakdown?.dailyIncome);
      const statusText = op.pillaged
        ? `<span style="opacity: 0.7; font-size: 0.85em; margin-left: 4px;">(Pillaged)</span>`
        : "";
      return /* html */ `
      <div class="states">
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><b>${escapeHtml(burgName)}</b></div>
        <div style="justify-content: center; text-align: center; gap: 2px;">
          <input type="number" class="nodeInfluenceInput" data-node="outpost" data-index="${idx}" min="0" max="100" step="1" value="${Math.round(op.influence ?? 0)}" style="width: 4em; text-align: right; margin: 0;" />%${statusText}
        </div>
        <div data-node-income="outpost:${idx}" style="justify-content: center; text-align: center;">${income}</div>
        <div data-node-impact="outpost:${idx}" style="justify-content: center; text-align: center; font-size: 0.9em;">${renderHostImpactHtml(op, false, breakdown.prosperity)}</div>
        <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
          <button class="btn icon-trash removeOutpostBtn" data-index="${idx}" data-tip="${t("Abandon outpost")}"></button>
        </div>
      </div>
    `;
    })
    .join("");

  const locationsTableRows = hqRowHtml + outpostsRowsHtml;

  const nodeLabelForKey = (nodeKey: string): string => {
    if (nodeKey === "hq") return `⭐ ${hqName}`;
    const opIdx = Number(nodeKey.split(":")[1]);
    const op = faction.outposts?.[opIdx];
    const burg = op?.burgId ? pack.burgs?.[op.burgId] : undefined;
    return burg?.name ?? `Outpost ${opIdx + 1}`;
  };

  interface AssetEntry {
    name: string;
    location: string;
    progress: string;
    progressTip?: string;
    statusTone: string;
    benefits: string;
    queueKind?: "active" | "queued";
    queueIndex?: number;
    nodeType?: "hq" | "outpost";
    outpostIndex?: number;
    assetIndex?: number;
  }

  const assetEntries: AssetEntry[] = [];

  if (faction.project) {
    const def = getFactionAsset(faction.project.assetId);
    const total = faction.project.totalCost ?? def?.cost ?? 0;
    const rem = faction.project.remainingCost ?? total;
    const pct = total > 0 ? Math.min(99, Math.max(0, Math.round(((total - rem) / total) * 100))) : 0;
    const seasonsText = `${faction.project.turnsLeft} ${faction.project.turnsLeft === 1 ? t("season") : t("seasons")}`;
    assetEntries.push({
      name: def?.name ?? faction.project.assetId,
      location: nodeLabelForKey(faction.project.nodeKey),
      progress: `${pct > 0 ? `${pct}% · ` : ""}${seasonsText}`,
      progressTip: t("Active public work funded from daily infrastructure revenue"),
      statusTone: "#fbbf24",
      benefits: formatAssetBenefits(faction.project.assetId),
      queueKind: "active"
    });
  }

  (faction.projectQueue ?? []).forEach((queued, qIdx) => {
    const def = getFactionAsset(queued.assetId);
    const est = def ? projectedAssetSeasons(def.cost, breakdown.economy.projectDaily) : null;
    assetEntries.push({
      name: def?.name ?? queued.assetId,
      location: nodeLabelForKey(queued.nodeKey),
      progress: est !== null ? `${t("Queued")} · ~${est}s` : t("Queued"),
      progressTip: t("Starts automatically when the active work finishes"),
      statusTone: "#60a5fa",
      benefits: formatAssetBenefits(queued.assetId),
      queueKind: "queued",
      queueIndex: qIdx
    });
  });

  // HQ completed assets
  (faction.hq.assets ?? []).forEach((aid, idx) => {
    const def = getFactionAsset(aid);
    assetEntries.push({
      name: def?.name ?? aid,
      location: `⭐ ${hqName}`,
      progress: "100%",
      statusTone: "#4ade80",
      benefits: formatAssetBenefits(aid),
      nodeType: "hq",
      assetIndex: idx
    });
  });

  // Outpost assets
  (faction.outposts ?? []).forEach((op, opIdx) => {
    const burg = pack.burgs?.[op.burgId];
    const burgName = burg?.name ?? `Burg ${op.burgId}`;

    (op.assets ?? []).forEach((aid, aIdx) => {
      const def = getFactionAsset(aid);
      assetEntries.push({
        name: def?.name ?? aid,
        location: burgName,
        progress: "100%",
        statusTone: "#4ade80",
        benefits: formatAssetBenefits(aid),
        nodeType: "outpost",
        outpostIndex: opIdx,
        assetIndex: aIdx
      });
    });
  });

  const assetsRowsHtml = assetEntries.length
    ? assetEntries
        .map(r => {
          const actionBtn = r.queueKind
            ? `<button class="btn icon-trash cancelProjectBtn" data-queue="${r.queueKind}" data-index="${r.queueIndex ?? 0}" data-tip="${t("Cancel queued work")}"></button>`
            : r.assetIndex !== undefined && r.assetIndex >= 0
              ? `<button class="btn icon-trash removeAssetBtn" data-node="${r.nodeType}" data-outpost-index="${r.outpostIndex ?? ""}" data-index="${r.assetIndex}" data-tip="${t("Dismantle asset")}"></button>`
              : "";
          return `
          <div class="states">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><b>${escapeHtml(r.name)}</b></div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.location)}</div>
            <div style="justify-content: center; text-align: center;">
              <span style="font-weight: 600; color: ${r.statusTone};" ${r.progressTip ? `data-tip="${escapeHtml(r.progressTip)}"` : ""}>${escapeHtml(r.progress)}</span>
            </div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.benefits}</div>
            <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
              ${actionBtn}
            </div>
          </div>
        `;
        })
        .join("")
    : `<div class="states" style="display: flex; justify-content: center; padding: 6px; opacity: 0.7;">${t("No assets constructed yet.")}</div>`;

  const assetLocationOptions = [
    `<option value="hq">⭐ ${escapeHtml(hqName)} (HQ)</option>`,
    ...faction.outposts.map((op, idx) => {
      const burg = pack.burgs?.[op.burgId];
      return `<option value="outpost:${idx}">${escapeHtml(burg?.name ?? `Outpost ${idx + 1}`)}</option>`;
    })
  ].join("");

  const renderAssetSelectOptions = (projectDaily: number) =>
    Object.values(FACTION_ASSETS_CATALOG)
      .map(a => {
        const seasons = projectedAssetSeasons(a.cost, projectDaily);
        const durationLabel =
          seasons !== null ? `${seasons} ${seasons === 1 ? t("season") : t("seasons")}` : t("no revenue");
        return `<option value="${a.id}">${escapeHtml(a.name)} (${durationLabel})</option>`;
      })
      .join("");

  const assetOptions = renderAssetSelectOptions(breakdown.economy.projectDaily);

  // Forces table rows
  const forcesRowsHtml = (faction.military ?? []).length
    ? (faction.military ?? [])
        .map(r => {
          let locName = `Cell ${r.cell}`;
          if (r.cell === faction.hq.cell) locName = `⭐ ${hqName} (HQ)`;
          else {
            const op = faction.outposts.find(o => o.cell === r.cell || pack.burgs?.[o.burgId]?.cell === r.cell);
            if (op) locName = pack.burgs?.[op.burgId]?.name ?? `Outpost`;
            else {
              const burgId = Number(pack.cells?.burg?.[r.cell] ?? 0);
              if (burgId && pack.burgs?.[burgId]) locName = pack.burgs[burgId].name ?? `Burg ${burgId}`;
              else {
                const provId = Number(pack.cells?.province?.[r.cell] ?? 0);
                if (provId && pack.provinces?.[provId]) locName = pack.provinces[provId].name ?? `Province ${provId}`;
                else if ((pack.cells?.h?.[r.cell] ?? 20) < 20) locName = t("At Sea");
              }
            }
          }

          const compText = formatRegimentComposition(r);

          return /* html */ `
            <div class="states" data-reg-id="${r.i}">
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ⚔️ <b>${escapeHtml(r.name)}</b>
              </div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(locName)}
              </div>
              <div style="justify-content: center; text-align: center;">${(r.a ?? 0).toLocaleString()}</div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(compText)}</div>
              <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
                <button class="btn icon-search zoomForceBtn" data-cell="${r.cell}" data-x="${r.x}" data-y="${r.y}" data-tip="${t("Zoom to force")}"></button>
                <button class="btn icon-trash removeForceBtn" data-reg-id="${r.i}" data-tip="${t("Disband force")}"></button>
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="states" style="display: flex; justify-content: center; padding: 6px; opacity: 0.7;">${t("No military forces mustered yet.")}</div>`;

  const forceLocationOptions = [
    `<option value="hq">⭐ ${escapeHtml(hqName)} (HQ)</option>`,
    ...faction.outposts.map((op, idx) => {
      const burg = pack.burgs?.[op.burgId];
      return `<option value="outpost:${idx}">${escapeHtml(burg?.name ?? `Outpost ${idx + 1}`)}</option>`;
    })
  ].join("");

  const renderHeaderBadges = (b: FactionYieldBreakdown) => /* html */ `
    <span class="badge" style="margin-right: 4px;">${capitalize(faction.category)}</span>
    <span class="badge" style="margin-right: 4px;">${capitalize(faction.allegiance)}</span>
    <span class="badge" style="margin-right: 4px;">${capitalize(faction.alignment)}</span>
    <span class="badge" style="margin-right: 4px;">📈 ${formatPrice(b.dailyIncome)}/day</span>
    <span class="badge" style="margin-right: 4px;">🏙️ ${renderProsperityPercent(b.prosperity)} prosperity</span>
    <span class="badge" style="margin-right: 4px;">⚖️ ${rn(b.stability * 100)}% stability</span>
    ${b.economy.charterTitheDaily > 0 ? `<span class="badge">🏛️ ${formatPrice(b.economy.charterTitheDaily)}/day tithe</span>` : ""}
  `;

  const markup = /* html */ `
    <div id="${dialogDomId}" class="dialog stable editorDialog" style="width: 100%; min-width: 860px; max-width: 95vw; max-height: 80vh; overflow-y: auto; overflow-x: hidden;">
      <style>
        #${dialogDomId}::-webkit-scrollbar {
          width: 8px;
        }
        #${dialogDomId}::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
        }
        #${dialogDomId}::-webkit-scrollbar-thumb {
          background-color: rgba(94, 79, 162, 0.35);
          border-radius: 4px;
        }
        #${dialogDomId}::-webkit-scrollbar-thumb:hover {
          background-color: rgba(94, 79, 162, 0.6);
        }
        #${dialogDomId} .dialogTabs {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          margin-bottom: 12px;
          padding: 0 4px;
        }
        #${dialogDomId} .tabBtn {
          padding: 6px 14px;
          cursor: pointer;
          border: 1px solid transparent;
          border-bottom: none;
          border-radius: 4px 4px 0 0;
          background: none;
          font-size: 0.95em;
          color: inherit;
          margin-bottom: -2px;
          transition: all 0.15s ease;
        }
        #${dialogDomId} .tabBtn:hover {
          background-color: rgba(94, 79, 162, 0.06);
        }
        #${dialogDomId} .tabBtn.active {
          font-weight: bold;
          background-color: rgba(94, 79, 162, 0.12);
          border-color: rgba(94, 79, 162, 0.4);
          border-bottom: 2px solid #5e4fa2;
          color: #5e4fa2;
        }
        #${dialogDomId} .table > .states:nth-child(even) {
          background-image: none;
          background-color: rgba(0, 0, 0, 0.04);
        }
        #${dialogDomId} .table > .states:nth-child(odd) {
          background-image: none;
          background-color: transparent;
        }
        #${dialogDomId} .table > .states:hover {
          background-image: none;
          background-color: rgba(94, 79, 162, 0.08);
          border-color: #c4c4c4;
        }
        #${dialogDomId} .header {
          position: sticky;
          top: 0;
          z-index: 1;
          width: auto;
          line-height: 2em;
          background: #f3f4f7;
          border: 1px solid transparent;
          padding: 0 0.2em;
          font-weight: 600;
        }
        #${dialogDomId} .factionLedger.columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
          width: 100%;
          column-gap: 1.8em;
          margin-bottom: 10px;
          font-size: 0.92em;
        }
        #${dialogDomId} .factionLedger h4 {
          margin: 0.2em 0 0.3em;
          border-bottom: 1px solid var(--dark-solid);
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1em;
        }
        #${dialogDomId} .factionLedger .row {
          display: grid;
          align-items: center;
          column-gap: 0.4em;
          line-height: 1.5;
        }
        #${dialogDomId} .factionLedger .row.plain {
          grid-template-columns: minmax(0, 1fr) minmax(6em, max-content);
        }
        #${dialogDomId} .factionLedger .row.budget {
          grid-template-columns: minmax(0, 2.2fr) 4.2em minmax(1em, 1fr) minmax(5em, max-content);
        }
        #${dialogDomId} .factionLedger .row .name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: inline-flex;
          align-items: center;
          gap: 0.2em;
        }
        #${dialogDomId} .factionLedger .bar {
          height: 0.7em;
          background: #eee;
        }
        #${dialogDomId} .factionLedger .right {
          text-align: right;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
        #${dialogDomId} .factionLedger .total {
          font-weight: bold;
          border-top: 1px solid #ccc;
        }
        #${dialogDomId} .factionLedger .muted {
          font-size: 0.85em;
          color: #666;
        }
        #${dialogDomId} .factionLedger .swatch {
          display: inline-block;
          width: 0.8em;
          height: 0.8em;
          margin-right: 0.25em;
          vertical-align: middle;
        }
      </style>

      <div style="font-size: 1.1em; font-weight: bold; margin-bottom: 4px;">
        <span style="color: ${faction.color};">${faction.icon || "⚔️"}</span> ${escapeHtml(faction.name)}
      </div>
      <div id="factionHeaderBadges" style="font-size: 0.9em; opacity: 0.9; margin-bottom: 8px;">
        ${renderHeaderBadges(breakdown)}
      </div>

      ${renderFactionEconomyLedger(faction, breakdown)}

      <!-- Tab Buttons -->
      <div class="dialogTabs">
        <button type="button" class="tabBtn ${activeTab === "outposts" ? "active" : ""}" data-tab="outposts">
          🏛️ ${t("HQ & Outposts")} (${1 + faction.outposts.length})
        </button>
        <button type="button" class="tabBtn ${activeTab === "assets" ? "active" : ""}" data-tab="assets">
          ${getMoneySymbol("🪙")} ${t("Assets")} (${assetEntries.length})
        </button>
        <button type="button" class="tabBtn ${activeTab === "forces" ? "active" : ""}" data-tab="forces">
          ⚔️ ${t("Forces")} (${faction.military?.length ?? 0})
        </button>
      </div>

      <!-- Tab 1: HQ & Outposts -->
      <div class="tabPanel" data-panel="outposts" style="display: ${activeTab === "outposts" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="outpostsTable" class="table" style="--table-columns: minmax(11em, 1.6fr) 6.5em 6.5em minmax(9em, 1.2fr) 2.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("Burg")}</div>
            <div style="justify-content: center; text-align: center;">${t("Influence")}</div>
            <div style="justify-content: center; text-align: center;" data-tip="${t("Daily gold the node draws from its host's economy")}">${t("Income")}</div>
            <div style="justify-content: center; text-align: center;" data-tip="${t("Net daily economy and provincial stability impact on the host")}">${t("Host Impact")}</div>
            <div></div>
          </div>
          ${locationsTableRows}
        </div>
        <div style="width: 0; min-width: 100%; display: flex; gap: 4px; margin-top: 4px;">
          <select id="newOutpostBurgSelect" style="flex-grow: 1;">${burgOptions}</select>
          <button id="addOutpostBtn" class="btn">${t("+ Outpost")}</button>
        </div>
      </div>

      <!-- Tab 2: Assets -->
      <div class="tabPanel" data-panel="assets" style="display: ${activeTab === "assets" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="assetsTable" class="table" style="--table-columns: 11em 10em 5.5em minmax(26em, 3fr) 2.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("Asset")}</div>
            <div>${t("Location")}</div>
            <div style="justify-content: center; text-align: center;">${t("Progress")}</div>
            <div>${t("Benefits")}</div>
            <div></div>
          </div>
          ${assetsRowsHtml}
        </div>
        <div style="width: 0; min-width: 100%; display: flex; gap: 4px; margin-top: 4px;">
          <select id="newAssetLocationSelect" style="flex: 1;">${assetLocationOptions}</select>
          <select id="newAssetSelect" style="flex: 1.5;">${assetOptions}</select>
          <button id="addAssetBtn" class="btn">${t("+ Asset")}</button>
        </div>
      </div>

      <!-- Tab 3: Forces -->
      <div class="tabPanel" data-panel="forces" style="display: ${activeTab === "forces" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="forcesTable" class="table" style="--table-columns: minmax(11em, 1.3fr) minmax(10em, 1.2fr) 5.5em minmax(26em, 3fr) 4.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("Force")}</div>
            <div>${t("Location")}</div>
            <div style="justify-content: center; text-align: center;">${t("Troops")}</div>
            <div>${t("Composition")}</div>
            <div style="justify-content: flex-end; text-align: right;"></div>
          </div>
          ${forcesRowsHtml}
        </div>
        <div style="width: 0; min-width: 100%; display: flex; gap: 4px; margin-top: 4px;">
          <select id="newFactionForceLocationSelect" style="flex: 1;">${forceLocationOptions}</select>
          <input id="newFactionForceNameInput" type="text" placeholder="${t("Force name")}" style="flex: 1.2;" />
          <input id="newFactionForceTroopsInput" type="number" min="10" step="50" value="100" style="width: 5.5em;" />
          <button id="addFactionForceBtn" class="btn">${t("+ Force")}</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", markup);

  Dialog.open(dialogDomId, {
    title: `${t("Manage Outposts & Assets")} - ${faction.name}`,
    width: "auto",
    minWidth: 860,
    maxHeight: Math.round((window.innerHeight || 800) * 0.85),
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(dialogDomId)
  });

  const refreshHostImpacts = (prosperity: number) => {
    const hqImpactEl = ensureEl(dialogDomId)?.querySelector<HTMLElement>('[data-node-impact="hq"]');
    if (hqImpactEl) hqImpactEl.innerHTML = renderHostImpactHtml(faction.hq, true, prosperity);
    faction.outposts.forEach((op, idx) => {
      const el = ensureEl(dialogDomId)?.querySelector<HTMLElement>(`[data-node-impact="outpost:${idx}"]`);
      if (el) el.innerHTML = renderHostImpactHtml(op, false, prosperity);
    });
  };

  const refreshLedgerAndAssets = (preserveBudgetFocusBucket?: string) => {
    const next = Living.getFactionYieldBreakdown(faction);
    const econ = next.economy;
    const badgesEl = findEl("factionHeaderBadges");
    if (badgesEl) badgesEl.innerHTML = renderHeaderBadges(next);
    const collectedEl = findEl("factionRevenueCollected");
    if (collectedEl) {
      collectedEl.textContent = formatPrice(econ.collectedDaily);
      collectedEl.className = `right ${tone(econ.collectedDaily)}`;
    }
    const subnoteEl = findEl("factionRevenueSubnote");
    if (subnoteEl) {
      const n = next.nodes.length;
      subnoteEl.textContent =
        econ.hostProductShare > 0
          ? `${n} ${n === 1 ? t("active node") : t("active nodes")} · ${t("{{share}}% of host product", { share: econ.hostProductShare })}`
          : `${n} ${n === 1 ? t("active node") : t("active nodes")}`;
    }
    const expEl = findEl("factionLedgerExpenses");
    if (expEl) {
      expEl.innerHTML = renderExpensesPanel(faction, next);
      if (preserveBudgetFocusBucket) {
        const refocused = expEl.querySelector<HTMLInputElement>(
          `.factionBudgetInput[data-bucket="${preserveBudgetFocusBucket}"]`
        );
        if (refocused) {
          refocused.focus();
        }
      }
    }
    refreshHostImpacts(next.prosperity);
    const assetSel = findEl<HTMLSelectElement>("newAssetSelect");
    if (assetSel) {
      const selected = assetSel.value;
      assetSel.innerHTML = renderAssetSelectOptions(econ.projectDaily);
      if (selected) assetSel.value = selected;
    }
    factionsTable.refresh();
  };

  const expensesContainer = findEl("factionLedgerExpenses");
  expensesContainer?.addEventListener("input", event => {
    const input = (event.target as HTMLElement)?.closest<HTMLInputElement>(".factionBudgetInput");
    const bucket = input?.dataset.bucket as FactionExpenseBucket | undefined;
    if (!input || !bucket) return;
    const val = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
    Factions.setBudget(factionId, { [bucket]: val });
    refreshLedgerAndAssets(bucket);
  });

  findEl("resetFactionBudgetBtn")?.addEventListener("click", () => {
    Factions.resetBudget(factionId);
    Living.syncFactionEffects();
    refreshLedgerAndAssets();
  });

  const adjContainer = findEl("factionRevenueAdjustments");
  if (adjContainer) {
    mountAdjustments(adjContainer, faction.adjustments ?? [], EconomyTerms.adjustments(), lines => {
      Factions.setAdjustments(factionId, lines);
      Living.syncFactionEffects();
      refreshLedgerAndAssets();
    });
  }

  ensureEl(dialogDomId)
    ?.querySelectorAll<HTMLInputElement>(".nodeInfluenceInput")
    .forEach(input => {
      input.addEventListener("change", () => {
        const clamped = minmax(Math.round(Number(input.value) || 0), 0, 100);
        input.value = String(clamped);
        if (input.dataset.node === "hq") {
          faction.hq.influence = clamped;
        } else {
          const idx = Number(input.dataset.index);
          if (faction.outposts[idx]) faction.outposts[idx].influence = clamped;
        }
        Living.syncFactionEffects();
        openOutpostsDialog(factionId, currentTab);
        factionsTable.refresh();
      });
    });

  // Tab switching listener
  ensureEl(dialogDomId)
    ?.querySelectorAll(".tabBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const tab = target.dataset.tab as "outposts" | "assets" | "forces";
        if (!tab) return;
        currentTab = tab;
        ensureEl(dialogDomId)
          ?.querySelectorAll(".tabBtn")
          .forEach(b => {
            b.classList.remove("active");
          });
        target.classList.add("active");
        ensureEl(dialogDomId)
          ?.querySelectorAll(".tabPanel")
          .forEach(p => {
            (p as HTMLElement).style.display = (p as HTMLElement).dataset.panel === tab ? "block" : "none";
          });
      });
    });

  // Attach Outposts & Assets listeners
  ensureEl("addAssetBtn")?.addEventListener("click", () => {
    const locSel = ensureEl<HTMLSelectElement>("newAssetLocationSelect");
    const assetSel = ensureEl<HTMLSelectElement>("newAssetSelect");
    const loc = locSel?.value ?? "hq";
    const assetId = assetSel?.value;
    if (!assetId) return;

    const nodeKey = loc === "hq" ? "hq" : (`outpost:${Number(loc.split(":")[1])}` as const);
    Living.commissionFactionAsset(factionId, assetId, nodeKey);

    Layers.draw("factions");
    openOutpostsDialog(factionId, currentTab);
    factionsTable.refresh();
  });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".cancelProjectBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const queueKind = target.dataset.queue === "active" ? "active" : "queued";
        const qIdx = Number(target.dataset.index ?? 0);
        Living.dequeueFactionProject(factionId, queueKind, qIdx);
        Layers.draw("factions");
        openOutpostsDialog(factionId, currentTab);
        factionsTable.refresh();
      });
    });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".removeAssetBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const nodeType = target.dataset.node;
        const assetIdx = Number(target.dataset.index);
        if (assetIdx < 0) return;

        if (nodeType === "hq") {
          faction.hq.assets.splice(assetIdx, 1);
          if (faction.hq.sim) delete faction.hq.sim.civBuildings;
          syncFactionState(faction);
        } else if (nodeType === "outpost") {
          const opIdx = Number(target.dataset.outpostIndex);
          const outpost = faction.outposts[opIdx];
          if (outpost) {
            outpost.assets.splice(assetIdx, 1);
            if (outpost.sim) delete outpost.sim.civBuildings;
            syncFactionState(faction);
          }
        }

        Living.syncFactionEffects();
        Layers.draw("factions");
        openOutpostsDialog(factionId, currentTab);
        factionsTable.refresh();
      });
    });

  ensureEl("addOutpostBtn")?.addEventListener("click", () => {
    const sel = ensureEl<HTMLSelectElement>("newOutpostBurgSelect");
    const burgId = Number(sel.value);
    if (burgId && pack.burgs?.[burgId]) {
      const b = pack.burgs[burgId];
      const newOutpost: FactionOutpost = {
        burgId,
        cell: b.cell,
        tier: 1,
        influence: 35,
        secrecy: faction.allegiance === "clandestine" ? 50 : 0,
        assets: [],
        establishedYear: options?.map?.lore?.calendar?.year ?? 1000
      };
      faction.outposts.push(newOutpost);
      syncFactionState(faction);
      Living.syncFactionEffects();
      Layers.draw("factions");
      openOutpostsDialog(factionId, currentTab);
      factionsTable.refresh();
    }
  });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".removeOutpostBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const idx = Number(target.dataset.index);
        faction.outposts.splice(idx, 1);
        syncFactionState(faction);
        Living.syncFactionEffects();
        Layers.draw("factions");
        openOutpostsDialog(factionId, currentTab);
        factionsTable.refresh();
      });
    });

  // Forces listeners
  ensureEl(dialogDomId)
    ?.querySelectorAll(".zoomForceBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const x = Number(target.dataset.x);
        const y = Number(target.dataset.y);
        if (!Number.isNaN(x) && !Number.isNaN(y)) zoomTo(x, y, 8, 1600);
      });
    });

  ensureEl(dialogDomId)
    ?.querySelectorAll(".removeForceBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const regId = Number(target.dataset.regId);
        if (!regId) return;
        faction.military = (faction.military ?? []).filter(r => r.i !== regId);
        syncFactionState(faction);
        openOutpostsDialog(factionId, currentTab);
        factionsTable.refresh();
      });
    });

  ensureEl("addFactionForceBtn")?.addEventListener("click", () => {
    const locSel = ensureEl<HTMLSelectElement>("newFactionForceLocationSelect");
    const nameInput = ensureEl<HTMLInputElement>("newFactionForceNameInput");
    const troopsInput = ensureEl<HTMLInputElement>("newFactionForceTroopsInput");
    const locVal = locSel?.value ?? "hq";
    let cell = faction.hq.cell;
    if (locVal.startsWith("outpost:")) {
      const opIdx = Number(locVal.split(":")[1]);
      const op = faction.outposts[opIdx];
      if (op) cell = op.cell ?? pack.burgs?.[op.burgId]?.cell ?? cell;
    }
    const [x, y] = pack.cells?.p?.[cell] ?? [0, 0];
    const troops = Math.max(10, Number(troopsInput?.value) || 100);
    const name = nameInput?.value.trim() || `${faction.name} Company ${(faction.military?.length ?? 0) + 1}`;

    faction.military ??= [];
    const maxI = faction.military.length ? Math.max(...faction.military.map(r => r.i ?? 0)) : 0;
    const newReg: Regiment = {
      i: maxI + 1,
      name,
      a: troops,
      cell,
      x,
      y,
      bx: x,
      by: y,
      state: 0,
      n: 0,
      u: { garrison: troops },
      icon: "⚔️",
      tags: []
    };
    faction.military.push(newReg);
    syncFactionState(faction);
    openOutpostsDialog(factionId, "forces");
    factionsTable.refresh();
  });
}
export const FactionsEditor = {
  open,
  close: () => Dialog.close("factionsEditor"),
  openOutpostsDialog
};
