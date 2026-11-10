import { Controllers } from "@/controllers";
import { CIV_BUILDING_BY_ID, CIV_BUILDINGS } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { resolveCivTechName } from "@/data/living-civ-themes";
import { Accounts } from "@/model/economy/accounts";
import { Prosperity } from "@/model/economy/prosperity";
import { canReadUpstreamEconomy } from "@/model/physical/living-faction-economy";
import {
  activeCivThemeId,
  citizensFromPopulation,
  factionSuppressionProductionCost,
  Living,
  settlementTierFromPop
} from "@/model/physical/living-generator";
import type { Burg } from "@/model/political/burgs-generator";
import { Military, type Regiment } from "@/model/political/military-generator";
import { Stability } from "@/model/political/stability";
import { Development } from "@/model/society/development-generator";
import type { YieldValues } from "@/types/living";
import { Dialog } from "@/ui/dialog/dialog";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { capitalize, escapeHtml } from "@/utils/string-utils";

export const STATE_CITIES_DIALOG_ID = "stateCitiesDialog" as const;

function formatYieldValue(value: number | undefined): string {
  return String(Math.round(value ?? 0));
}

function formatYields(yields?: YieldValues): string {
  if (!yields) return "—";
  return `🌾 ${formatYieldValue(yields.food)} · 🔨 ${formatYieldValue(yields.production)} · 🪙 ${formatYieldValue(yields.gold)} · 🔬 ${formatYieldValue(yields.science)} · 🎭 ${formatYieldValue(yields.culture)} · ✨ ${formatYieldValue(yields.faith)}`;
}

/** A city's upstream prosperity, 0–100, or — before the economy has run */
function formatProsperity(burgId: number): string {
  const prosperity = canReadUpstreamEconomy() ? Prosperity.getBurg(burgId)?.prosperity : undefined;
  return prosperity == null ? "—" : `${Math.round(prosperity * 100)}%`;
}

function formatBuildingBenefits(buildingId?: string): string {
  if (!buildingId) return "—";
  const civ = CIV_BUILDING_BY_ID[buildingId];
  if (!civ) return "—";

  const parts: string[] = [];
  if (civ.stats?.food) parts.push(`+${civ.stats.food} 🌾`);
  if (civ.stats?.production) parts.push(`+${civ.stats.production} 🔨`);
  if (civ.stats?.gold) parts.push(`+${civ.stats.gold} 🪙`);
  if (civ.stats?.science) parts.push(`+${civ.stats.science} 🔬`);
  if (civ.stats?.culture) parts.push(`+${civ.stats.culture} 🎭`);
  if (civ.stats?.faith) parts.push(`+${civ.stats.faith} ✨`);
  if (civ.stats?.defense) parts.push(`+${civ.stats.defense} 🛡️`);
  if (civ.effects?.trainedUnitExperience?.amount) parts.push(`+${civ.effects.trainedUnitExperience.amount} XP`);
  if (civ.effects?.foodKeptPercent) parts.push(`+${civ.effects.foodKeptPercent}% food kept`);

  return parts.length ? parts.join(", ") : civ.effects ? t("Special effect") : "—";
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

/** Open Cities & Yields Management Dialog for a single State */
export function openStateCitiesDialog(stateId: number, activeTab: "cities" | "assets" | "forces" = "cities"): void {
  const state = pack.states?.[stateId];
  if (!state || state.removed) return;

  const living = Living.getState();
  const sSim = living.states[stateId];
  const breakdown = Living.getStateYieldBreakdown(state, living);
  if (sSim) sSim.yieldsPerTurn = breakdown.total;

  Dialog.destroy(STATE_CITIES_DIALOG_ID);

  const capital = state.capital ? pack.burgs[state.capital] : undefined;
  const capitalName = capital?.name ?? t("None");
  const cultureName = pack.cultures[state.culture]?.name ?? t("None");

  const currentTech = sSim?.currentTechId ? CIV_TECH_BY_ID[sSim.currentTechId] : undefined;
  const techName = currentTech ? resolveCivTechName(activeCivThemeId(), currentTech) : undefined;
  const techProgress = currentTech ? Math.round(sSim?.researchedProgress?.[currentTech.id] ?? 0) : 0;
  const techCost = currentTech?.cost ?? 0;

  // §6.2: the upstream figures the Living World runs on, alongside the seasonal yields
  const readable = canReadUpstreamEconomy();
  const prosperity = readable ? Accounts.ofState(stateId)?.prosperity : undefined;
  const stability = readable ? Stability.get(stateId)?.stability : undefined;
  const development = pack.cells.development ? Development.getAverages(pack.cells.state)[stateId] : undefined;
  const era = development == null || !options.map.eras?.length ? undefined : Development.getEra(development);

  let currentTab = activeTab;

  // Burg candidate options for "+ City"
  const stateBurgs = (pack.burgs ?? []).filter((b): b is Burg => Boolean(b?.i && !b.removed && b.state === stateId));
  const currentCityBurgIds = new Set(breakdown.cities.map(c => c.burgId));
  const availableBurgs = stateBurgs.filter(b => !currentCityBurgIds.has(b.i));
  const addCityOptions = availableBurgs.length
    ? availableBurgs
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .map(
          b =>
            `<option value="${b.i}">${escapeHtml(b.name ?? `Burg ${b.i}`)} (Pop: ${(b.population ?? 0).toLocaleString()})</option>`
        )
        .join("")
    : `<option disabled>${t("All state burgs are major cities")}</option>`;

  const citiesHtml = breakdown.cities.length
    ? breakdown.cities
        .map(city => {
          const burg = pack.burgs?.[city.burgId];
          const bSim = living.burgs[city.burgId];
          const isStateCapital = Boolean(city.isCapital || state.capital === city.burgId);
          const isProvCapital =
            !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === city.burgId));
          const starPrefix = isStateCapital
            ? "⭐ "
            : isProvCapital
              ? '<span style="font-size: 0.85em; opacity: 0.85; margin-right: 2px;">★</span>'
              : "";

          const prodItem = bSim?.productionQueue?.[0];
          let queueText = "";
          if (prodItem) {
            if (prodItem.kind === "operation" && prodItem.id === "faction-suppression") {
              const targetFaction =
                prodItem.targetFactionId !== undefined ? pack.factions?.[prodItem.targetFactionId] : undefined;
              const targetNode =
                prodItem.targetNodeKey === "hq"
                  ? targetFaction?.hq
                  : targetFaction?.outposts?.find(outpost => `outpost:${outpost.burgId}` === prodItem.targetNodeKey);
              const tier = "tier" in (targetNode ?? {}) ? (targetNode as { tier: number }).tier : 2;
              const prog = Math.round(bSim?.productionProgress?.[itemToProgressKey(prodItem)] ?? 0);
              const cost = factionSuppressionProductionCost({ tier });
              queueText = `<span style="font-size: 0.8em; opacity: 0.75; margin-left: 4px;">🔨 Suppressing (${prog}/${cost})</span>`;
            } else {
              const def =
                prodItem.kind === "unit"
                  ? (CIV_CIVILIAN_BY_ID[prodItem.id] ?? Military.getUnitTypes()[prodItem.id])
                  : CIV_BUILDING_BY_ID[prodItem.id];
              const prog = Math.round(bSim?.productionProgress?.[itemToProgressKey(prodItem)] ?? 0);
              const cost = Math.round((def as { cost?: number } | undefined)?.cost ?? 0);
              queueText = `<span style="font-size: 0.8em; opacity: 0.75; margin-left: 4px;">🔨 ${escapeHtml(def?.name ?? prodItem.id)} (${prog}/${cost})</span>`;
            }
          }

          const popText = burg?.population ? burg.population.toLocaleString() : "—";

          return /* html */ `
            <div class="states" data-burg-id="${city.burgId}">
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${starPrefix}<b>${escapeHtml(city.name)}</b>${queueText}
              </div>
              <div style="justify-content: center; text-align: center;">${popText}</div>
              <div style="justify-content: center; text-align: center;">${city.citizens}</div>
              <div style="justify-content: center; text-align: center;">${city.workedCells}</div>
              <div style="justify-content: center; text-align: center;">${formatProsperity(city.burgId)}</div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${formatYields(city.yields)}</div>
              <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
                <button class="btn icon-search zoomCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Zoom to city")}"></button>
                <button class="btn icon-bank cityEconomyBtn" data-burg-id="${city.burgId}" data-tip="${t("Open the burg's economy")}"></button>
                <button class="btn icon-pencil editCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Edit burg")}"></button>
                ${!isStateCapital ? `<button class="btn icon-trash removeCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Remove city from major cities")}"></button>` : ""}
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="states" style="display: flex; justify-content: center; padding: 6px; opacity: 0.7;">${t("No major cities established yet.")}</div>`;

  interface StateAssetEntry {
    name: string;
    buildingId: string;
    location: string;
    starPrefix: string;
    progress: string;
    progressTip?: string;
    isComplete: boolean;
    benefits: string;
    burgId: number;
  }

  const assetEntries: StateAssetEntry[] = [];

  for (const city of breakdown.cities) {
    const bSim = living.burgs[city.burgId];
    const isStateCapital = Boolean(city.isCapital || state.capital === city.burgId);
    const isProvCapital =
      !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === city.burgId));
    const starPrefix = isStateCapital
      ? "⭐ "
      : isProvCapital
        ? '<span style="font-size: 0.85em; opacity: 0.85; margin-right: 2px;">★</span>'
        : "";

    // Completed buildings
    for (const bId of city.buildings) {
      const def = CIV_BUILDING_BY_ID[bId];
      assetEntries.push({
        name: def?.name ?? bId,
        buildingId: bId,
        location: city.name,
        starPrefix,
        progress: "100%",
        isComplete: true,
        benefits: formatBuildingBenefits(bId),
        burgId: city.burgId
      });
    }

    // In-progress buildings
    for (const item of bSim?.productionQueue ?? []) {
      if (item.kind === "building" && !city.buildings.includes(item.id)) {
        const def = CIV_BUILDING_BY_ID[item.id];
        const prog = Math.round(
          bSim?.productionProgress?.[itemToProgressKey(item)] ?? bSim?.productionProgress?.[item.id] ?? 0
        );
        const cost = Math.round((def as { cost?: number } | undefined)?.cost ?? 100);
        const pct = Math.min(99, Math.round((prog / Math.max(1, cost)) * 100));
        assetEntries.push({
          name: def?.name ?? item.id,
          buildingId: item.id,
          location: city.name,
          starPrefix,
          progress: `${pct}%`,
          progressTip: `${prog}/${cost}`,
          isComplete: false,
          benefits: formatBuildingBenefits(item.id),
          burgId: city.burgId
        });
      }
    }
  }

  const assetsRowsHtml = assetEntries.length
    ? assetEntries
        .map(
          r => `
          <div class="states" data-burg-id="${r.burgId}">
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><b>${escapeHtml(r.name)}</b></div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.starPrefix}${escapeHtml(r.location)}</div>
            <div style="justify-content: center; text-align: center;">
              <span style="font-weight: 600; color: ${r.isComplete ? "#4ade80" : "#fbbf24"};" ${r.progressTip ? `data-tip="${escapeHtml(r.progressTip)}"` : ""}>${escapeHtml(r.progress)}</span>
            </div>
            <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.benefits}</div>
            <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
              <button class="btn icon-search zoomCityBtn" data-burg-id="${r.burgId}" data-tip="${t("Zoom to city")}"></button>
              ${r.isComplete ? `<button class="btn icon-trash removeAssetBtn" data-burg-id="${r.burgId}" data-building-id="${r.buildingId}" data-tip="${t("Dismantle asset")}"></button>` : ""}
            </div>
          </div>
        `
        )
        .join("")
    : `<div class="states" style="display: flex; justify-content: center; padding: 6px; opacity: 0.7;">${t("No assets constructed yet.")}</div>`;

  const assetCityOptions = breakdown.cities.length
    ? breakdown.cities
        .map(c => {
          const isStateCapital = Boolean(c.isCapital || state.capital === c.burgId);
          const isProvCapital =
            !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === c.burgId));
          const prefix = isStateCapital ? "⭐ " : isProvCapital ? "★ " : "";
          return `<option value="${c.burgId}">${prefix}${escapeHtml(c.name)}</option>`;
        })
        .join("")
    : `<option disabled>${t("No cities available")}</option>`;

  const civBuildingOptions = [...CIV_BUILDINGS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(b => `<option value="${b.id}">${escapeHtml(b.name)}${b.cost ? ` (${b.cost}🔨)` : ""}</option>`)
    .join("");

  // Forces table rows
  const forcesRowsHtml = (state.military ?? []).length
    ? (state.military ?? [])
        .map(r => {
          let locName = `Cell ${r.cell}`;
          const burgId = Number(pack.cells?.burg?.[r.cell] ?? 0);
          if (burgId && pack.burgs?.[burgId]) {
            const isCap = Boolean(state.capital === burgId);
            const isProv = !isCap && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === burgId));
            locName = `${isCap ? "⭐ " : isProv ? "★ " : ""}${pack.burgs[burgId].name ?? `Burg ${burgId}`}`;
          } else {
            const provId = Number(pack.cells?.province?.[r.cell] ?? 0);
            if (provId && pack.provinces?.[provId]) locName = pack.provinces[provId].name ?? `Province ${provId}`;
            else if ((pack.cells?.h?.[r.cell] ?? 20) < 20) locName = t("At Sea");
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

  const forceCityOptions = breakdown.cities.length
    ? breakdown.cities
        .map(c => {
          const isStateCapital = Boolean(c.isCapital || state.capital === c.burgId);
          const isProvCapital =
            !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === c.burgId));
          const prefix = isStateCapital ? "⭐ " : isProvCapital ? "★ " : "";
          return `<option value="${c.burgId}">${prefix}${escapeHtml(c.name)}</option>`;
        })
        .join("")
    : `<option disabled>${t("No cities available")}</option>`;

  const markup = /* html */ `
    <div id="${STATE_CITIES_DIALOG_ID}" class="dialog stable editorDialog" style="width: 100%; min-width: 860px; max-width: 95vw; max-height: 80vh; overflow-y: auto; overflow-x: hidden;">
      <style>
        #${STATE_CITIES_DIALOG_ID}::-webkit-scrollbar {
          width: 8px;
        }
        #${STATE_CITIES_DIALOG_ID}::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.05);
        }
        #${STATE_CITIES_DIALOG_ID}::-webkit-scrollbar-thumb {
          background-color: rgba(94, 79, 162, 0.35);
          border-radius: 4px;
        }
        #${STATE_CITIES_DIALOG_ID}::-webkit-scrollbar-thumb:hover {
          background-color: rgba(94, 79, 162, 0.6);
        }
        #${STATE_CITIES_DIALOG_ID} .dialogTabs {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          margin-bottom: 12px;
          padding: 0 4px;
        }
        #${STATE_CITIES_DIALOG_ID} .tabBtn {
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
        #${STATE_CITIES_DIALOG_ID} .tabBtn:hover {
          background-color: rgba(94, 79, 162, 0.06);
        }
        #${STATE_CITIES_DIALOG_ID} .tabBtn.active {
          font-weight: bold;
          background-color: rgba(94, 79, 162, 0.12);
          border-color: rgba(94, 79, 162, 0.4);
          border-bottom: 2px solid #5e4fa2;
          color: #5e4fa2;
        }
        #${STATE_CITIES_DIALOG_ID} .table > .states:nth-child(even) {
          background-image: none;
          background-color: rgba(0, 0, 0, 0.04);
        }
        #${STATE_CITIES_DIALOG_ID} .table > .states:nth-child(odd) {
          background-image: none;
          background-color: transparent;
        }
        #${STATE_CITIES_DIALOG_ID} .table > .states:hover {
          background-image: none;
          background-color: rgba(94, 79, 162, 0.08);
          border-color: #c4c4c4;
        }
        #${STATE_CITIES_DIALOG_ID} .header {
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
      </style>

      <div style="font-size: 1.15em; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="color: ${state.color};">🏛️</span> ${escapeHtml(state.fullName || state.name)}
        </div>
        <div style="font-size: 0.85em; opacity: 0.85;">
          <span class="badge">${escapeHtml(state.formName || state.form || "State")}</span>
        </div>
      </div>

      <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px;">
        <span class="badge">${t("Culture")}: ${escapeHtml(cultureName)}</span>
        <span class="badge">${t("Capital")}: ${escapeHtml(capitalName)}</span>
        <span class="badge pointer" id="stateCitiesBudgetBtn" data-tip="${t("Open the state budget")}">${t("Treasury")}: 🪙 ${Math.round(state.economy?.treasury ?? 0)}</span>
        ${
          prosperity == null
            ? ""
            : `<span class="badge pointer" id="stateCitiesEconomyBtn" data-tip="${t("Open the state's agriculture, crafts and trade")}">${t("Prosperity")}: ${Math.round(prosperity * 100)}%</span>`
        }
        ${
          stability == null
            ? ""
            : `<span class="badge pointer" id="stateCitiesStabilityBtn" data-tip="${t("Open the state's stability")}">${t("Stability")}: ${Math.round(stability * 100)}%</span>`
        }
        ${
          development == null
            ? ""
            : `<span class="badge">${t("Development")}: ${Math.round(development)}${era ? ` · ${escapeHtml(era)}` : ""}</span>`
        }
        ${techName ? `<span class="badge">🔬 ${escapeHtml(techName)} (${techProgress}/${techCost})</span>` : ""}
      </div>

      <!-- Tab Buttons -->
      <div class="dialogTabs">
        <button type="button" class="tabBtn ${activeTab === "cities" ? "active" : ""}" data-tab="cities">
          🏛️ ${t("Major Cities")} (${breakdown.cities.length})
        </button>
        <button type="button" class="tabBtn ${activeTab === "assets" ? "active" : ""}" data-tab="assets">
          🪙 ${t("Assets")} (${assetEntries.length})
        </button>
        <button type="button" class="tabBtn ${activeTab === "forces" ? "active" : ""}" data-tab="forces">
          ⚔️ ${t("Forces")} (${state.military?.length ?? 0})
        </button>
      </div>

      <!-- Tab 1: Major Cities -->
      <div class="tabPanel" data-panel="cities" style="display: ${activeTab === "cities" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="stateCitiesTable" class="table" style="--table-columns: minmax(12em, 1.3fr) 5.5em 4.5em 4em 5em minmax(29em, 3fr) 7.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("City")}</div>
            <div style="justify-content: center; text-align: center;">${t("Pop")}</div>
            <div style="justify-content: center; text-align: center;">${t("Citizens")}</div>
            <div style="justify-content: center; text-align: center;">${t("Cells")}</div>
            <div style="justify-content: center; text-align: center;">${t("Prosperity")}</div>
            <div>${t("Yields")}</div>
            <div style="justify-content: flex-end; text-align: right;">${t("Actions")}</div>
          </div>
          ${citiesHtml}
        </div>
        <div style="width: 0; min-width: 100%; display: flex; gap: 4px; margin-top: 4px;">
          <select id="newStateCitySelect" style="flex-grow: 1;" ${availableBurgs.length ? "" : "disabled"}>
            ${addCityOptions}
          </select>
          <button id="addStateCityBtn" class="btn" ${availableBurgs.length ? "" : "disabled"}>${t("+ City")}</button>
        </div>
      </div>

      <!-- Tab 2: Assets -->
      <div class="tabPanel" data-panel="assets" style="display: ${activeTab === "assets" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="stateAssetsTable" class="table" style="--table-columns: minmax(12em, 1.2fr) minmax(10em, 1fr) 5.5em minmax(27em, 3fr) 4.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("Asset")}</div>
            <div>${t("Location")}</div>
            <div style="justify-content: center; text-align: center;">${t("Progress")}</div>
            <div>${t("Benefits")}</div>
            <div style="justify-content: flex-end; text-align: right;"></div>
          </div>
          ${assetsRowsHtml}
        </div>
        <div style="width: 0; min-width: 100%; display: flex; gap: 4px; margin-top: 4px;">
          <select id="newStateAssetCitySelect" style="flex: 1;" ${breakdown.cities.length ? "" : "disabled"}>
            ${assetCityOptions}
          </select>
          <select id="newStateAssetSelect" style="flex: 1.5;" ${breakdown.cities.length ? "" : "disabled"}>
            ${civBuildingOptions}
          </select>
          <button id="addStateAssetBtn" class="btn" ${breakdown.cities.length ? "" : "disabled"}>${t("+ Asset")}</button>
        </div>
      </div>

      <!-- Tab 3: Forces -->
      <div class="tabPanel" data-panel="forces" style="display: ${activeTab === "forces" ? "block" : "none"}; width: 0; min-width: 100%; margin-bottom: 12px;">
        <div id="stateForcesTable" class="table" style="--table-columns: minmax(12em, 1.2fr) minmax(10em, 1fr) 5.5em minmax(27em, 3fr) 4.5em; width: 0; min-width: 100%;">
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
          <select id="newStateForceLocationSelect" style="flex: 1;" ${breakdown.cities.length ? "" : "disabled"}>
            ${forceCityOptions}
          </select>
          <input id="newStateForceNameInput" type="text" placeholder="${t("Force name")}" style="flex: 1.2;" />
          <input id="newStateForceTroopsInput" type="number" min="10" step="50" value="100" style="width: 5.5em;" />
          <button id="addStateForceBtn" class="btn" ${breakdown.cities.length ? "" : "disabled"}>${t("+ Force")}</button>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 8px; width: 0; min-width: 100%;">
        <button id="stateCitiesOverviewBurgsBtn" class="btn">${t("All Burgs Overview")}</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", markup);

  Dialog.open(STATE_CITIES_DIALOG_ID, {
    title: `${t("State Cities & Yields")} - ${state.name}`,
    width: "auto",
    minWidth: 860,
    maxHeight: Math.round((window.innerHeight || 800) * 0.85),
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(STATE_CITIES_DIALOG_ID)
  });

  // Tab switching listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".tabBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const tab = target.dataset.tab as "cities" | "assets" | "forces";
        if (!tab) return;
        currentTab = tab;
        ensureEl(STATE_CITIES_DIALOG_ID)
          ?.querySelectorAll(".tabBtn")
          .forEach(b => {
            b.classList.remove("active");
          });
        target.classList.add("active");
        ensureEl(STATE_CITIES_DIALOG_ID)
          ?.querySelectorAll(".tabPanel")
          .forEach(p => {
            (p as HTMLElement).style.display = (p as HTMLElement).dataset.panel === tab ? "block" : "none";
          });
      });
    });

  // Attach button listeners
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".zoomCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const burgId = Number(target.dataset.burgId);
        const b = pack.burgs?.[burgId];
        if (b) zoomTo(b.x, b.y, 8, 1600);
      });
    });

  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".editCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const burgId = Number(target.dataset.burgId);
        void Controllers.BurgEditor.open(burgId);
      });
    });

  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".cityEconomyBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        void Controllers.BurgEconomyOverview.open(Number(target.dataset.burgId));
      });
    });

  ensureEl("stateCitiesEconomyBtn")?.addEventListener("click", () => {
    void Controllers.EconomyOverview.open("state", stateId);
  });
  ensureEl("stateCitiesStabilityBtn")?.addEventListener("click", () => {
    void Controllers.StabilityOverview.open(stateId);
  });
  ensureEl("stateCitiesBudgetBtn")?.addEventListener("click", () => {
    void Controllers.StateBudgetEditor.open(stateId);
  });

  // Remove city listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".removeCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const burgId = Number(target.dataset.burgId);
        if (!burgId) return;

        const bSim = living.burgs[burgId];
        if (bSim) {
          bSim.isMajor = false;
        }
        const burg = pack.burgs?.[burgId];
        if (burg) Living.refreshStateBurgYields(state, burg);
        const newBreakdown = Living.getStateYieldBreakdown(state, living);
        if (sSim) sSim.yieldsPerTurn = newBreakdown.total;
        openStateCitiesDialog(stateId, currentTab);
      });
    });

  // Add City listener
  ensureEl("addStateCityBtn")?.addEventListener("click", () => {
    const sel = ensureEl<HTMLSelectElement>("newStateCitySelect");
    const burgId = Number(sel?.value);
    if (!burgId) return;
    const burg = pack.burgs?.[burgId];
    if (!burg) return;

    let bSim = living.burgs[burgId];
    if (!bSim) {
      bSim = {
        burgId,
        baseTier: settlementTierFromPop(burg.population ?? 0),
        development: 0,
        developmentProgress: 0,
        buildings: [],
        civBuildings: [],
        construction: null,
        unrest: 0,
        originalOwner: burg.state ?? 0,
        originalCulture: burg.culture,
        originalReligion: pack.cells.religion?.[burg.cell] ?? 0
      };
      living.burgs[burgId] = bSim;
    }
    bSim.isMajor = true;
    if (!bSim.citizens) {
      bSim.citizens = Math.max(1, citizensFromPopulation(burg.population ?? 0));
    }
    Living.refreshStateBurgYields(state, burg);
    const newBreakdown = Living.getStateYieldBreakdown(state, living);
    if (sSim) sSim.yieldsPerTurn = newBreakdown.total;
    openStateCitiesDialog(stateId, "cities");
  });

  // Dismantle Asset listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".removeAssetBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const burgId = Number(target.dataset.burgId);
        const buildingId = target.dataset.buildingId;
        if (!burgId || !buildingId) return;

        const bSim = living.burgs[burgId];
        if (!bSim?.civBuildings) return;

        const idx = bSim.civBuildings.indexOf(buildingId);
        if (idx !== -1) {
          bSim.civBuildings.splice(idx, 1);
        }
        const burg = pack.burgs?.[burgId];
        if (burg) Living.refreshStateBurgYields(state, burg);
        const newBreakdown = Living.getStateYieldBreakdown(state, living);
        if (sSim) sSim.yieldsPerTurn = newBreakdown.total;
        openStateCitiesDialog(stateId, "assets");
      });
    });

  // Add Asset listener
  ensureEl("addStateAssetBtn")?.addEventListener("click", () => {
    const citySel = ensureEl<HTMLSelectElement>("newStateAssetCitySelect");
    const assetSel = ensureEl<HTMLSelectElement>("newStateAssetSelect");
    const burgId = Number(citySel?.value);
    const assetId = assetSel?.value;
    if (!burgId || !assetId) return;

    const burg = pack.burgs?.[burgId];
    if (!burg) return;

    let bSim = living.burgs[burgId];
    if (!bSim) {
      bSim = {
        burgId,
        baseTier: settlementTierFromPop(burg.population ?? 0),
        development: 0,
        developmentProgress: 0,
        buildings: [],
        civBuildings: [],
        construction: null,
        unrest: 0,
        originalOwner: burg.state ?? 0,
        originalCulture: burg.culture,
        originalReligion: pack.cells.religion?.[burg.cell] ?? 0
      };
      living.burgs[burgId] = bSim;
    }
    bSim.civBuildings ??= [];
    if (!bSim.civBuildings.includes(assetId)) {
      bSim.civBuildings.push(assetId);
    }
    Living.refreshStateBurgYields(state, burg);
    const newBreakdown = Living.getStateYieldBreakdown(state, living);
    if (sSim) sSim.yieldsPerTurn = newBreakdown.total;
    openStateCitiesDialog(stateId, "assets");
  });

  // Zoom to force listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".zoomForceBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const x = Number(target.dataset.x);
        const y = Number(target.dataset.y);
        if (!Number.isNaN(x) && !Number.isNaN(y)) zoomTo(x, y, 8, 1600);
      });
    });

  // Disband force listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".removeForceBtn")
    .forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.currentTarget as HTMLElement;
        const regId = Number(target.dataset.regId);
        if (!regId) return;
        state.military = (state.military ?? []).filter(r => r.i !== regId);
        openStateCitiesDialog(stateId, "forces");
      });
    });

  // Add Force listener
  ensureEl("addStateForceBtn")?.addEventListener("click", () => {
    const locSel = ensureEl<HTMLSelectElement>("newStateForceLocationSelect");
    const nameInput = ensureEl<HTMLInputElement>("newStateForceNameInput");
    const troopsInput = ensureEl<HTMLInputElement>("newStateForceTroopsInput");
    const burgId = Number(locSel?.value);
    const burg = burgId ? pack.burgs?.[burgId] : undefined;
    const cell = burg?.cell ?? state.center ?? 0;
    const [x, y] = pack.cells?.p?.[cell] ?? [burg?.x ?? 0, burg?.y ?? 0];
    const troops = Math.max(10, Number(troopsInput?.value) || 100);
    const name = nameInput?.value.trim() || `${state.name} Regiment ${(state.military?.length ?? 0) + 1}`;

    state.military ??= [];
    const maxI = state.military.length ? Math.max(...state.military.map(r => r.i ?? 0)) : 0;
    const newReg: Regiment = {
      i: maxI + 1,
      name,
      a: troops,
      cell,
      x,
      y,
      bx: x,
      by: y,
      state: stateId,
      n: 0,
      u: { infantry: troops },
      icon: "⚔️",
      tags: []
    };
    state.military.push(newReg);
    openStateCitiesDialog(stateId, "forces");
  });

  ensureEl("stateCitiesOverviewBurgsBtn")?.addEventListener("click", () => {
    void Controllers.BurgsOverview.open({ stateId });
  });
}

function itemToProgressKey(item: { kind?: string; id: string }): string {
  return item.kind ? `${item.kind}:${item.id}` : item.id;
}

export const StateCitiesDialog = {
  open: openStateCitiesDialog,
  close: () => Dialog.close(STATE_CITIES_DIALOG_ID)
};
