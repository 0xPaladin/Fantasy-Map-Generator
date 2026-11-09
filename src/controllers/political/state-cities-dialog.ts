import { Controllers } from "@/controllers";
import { CIV_BUILDINGS, CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { resolveCivTechName } from "@/data/living-civ-themes";
import {
  activeCivThemeId,
  citizensFromPopulation,
  factionSuppressionProductionCost,
  Living,
  settlementTierFromPop
} from "@/model/physical/living-generator";
import type { Burg } from "@/model/political/burgs-generator";
import { Military } from "@/model/political/military-generator";
import type { YieldValues } from "@/types/living";
import { Dialog } from "@/ui/dialog/dialog";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { ensureEl } from "@/utils/node-utils";
import { escapeHtml } from "@/utils/string-utils";

export const STATE_CITIES_DIALOG_ID = "stateCitiesDialog" as const;

function formatYieldValue(value: number | undefined): string {
  return String(Math.round(value ?? 0));
}

function formatYields(yields?: YieldValues): string {
  if (!yields) return "—";
  return `🌾 ${formatYieldValue(yields.food)} · 🔨 ${formatYieldValue(yields.production)} · 🪙 ${formatYieldValue(yields.gold)} · 🔬 ${formatYieldValue(yields.science)} · 🎭 ${formatYieldValue(yields.culture)} · ✨ ${formatYieldValue(yields.faith)}`;
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

  return parts.length ? parts.join(", ") : (civ.effects ? t("Special effect") : "—");
}

/** Open Cities & Yields Management Dialog for a single State */
export function openStateCitiesDialog(stateId: number): void {
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

  // Burg candidate options for "+ City"
  const stateBurgs = (pack.burgs ?? []).filter(
    (b): b is Burg => Boolean(b?.i && !b.removed && b.state === stateId)
  );
  const currentCityBurgIds = new Set(breakdown.cities.map(c => c.burgId));
  const availableBurgs = stateBurgs.filter(b => !currentCityBurgIds.has(b.i));
  const addCityOptions = availableBurgs.length
    ? availableBurgs
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .map(b => `<option value="${b.i}">${escapeHtml(b.name ?? `Burg ${b.i}`)} (Pop: ${(b.population ?? 0).toLocaleString()})</option>`)
        .join("")
    : `<option disabled>${t("All state burgs are major cities")}</option>`;

  const citiesHtml = breakdown.cities.length
    ? breakdown.cities
        .map(city => {
          const burg = pack.burgs?.[city.burgId];
          const bSim = living.burgs[city.burgId];
          const isStateCapital = Boolean(city.isCapital || state.capital === city.burgId);
          const isProvCapital = !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === city.burgId));
          const starPrefix = isStateCapital ? "⭐ " : isProvCapital ? '<span style="font-size: 0.85em; opacity: 0.85; margin-right: 2px;">★</span>' : "";

          const prodItem = bSim?.productionQueue?.[0];
          let queueText = "";
          if (prodItem) {
            if (prodItem.kind === "operation" && prodItem.id === "faction-suppression") {
              const targetFaction = prodItem.targetFactionId !== undefined ? pack.factions?.[prodItem.targetFactionId] : undefined;
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
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${formatYields(city.yields)}</div>
              <div style="justify-content: flex-end; text-align: right; white-space: nowrap;">
                <button class="btn icon-search zoomCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Zoom to city")}"></button>
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
    const isProvCapital = !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === city.burgId));
    const starPrefix = isStateCapital ? "⭐ " : isProvCapital ? '<span style="font-size: 0.85em; opacity: 0.85; margin-right: 2px;">★</span>' : "";

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
        const prog = Math.round(bSim?.productionProgress?.[itemToProgressKey(item)] ?? bSim?.productionProgress?.[item.id] ?? 0);
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
          const isProvCapital = !isStateCapital && Boolean(pack.provinces?.some(p => p?.i && !p.removed && p.burg === c.burgId));
          const prefix = isStateCapital ? "⭐ " : isProvCapital ? "★ " : "";
          return `<option value="${c.burgId}">${prefix}${escapeHtml(c.name)}</option>`;
        })
        .join("")
    : `<option disabled>${t("No cities available")}</option>`;

  const civBuildingOptions = [...CIV_BUILDINGS]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(b => `<option value="${b.id}">${escapeHtml(b.name)}${b.cost ? ` (${b.cost}🔨)` : ""}</option>`)
    .join("");

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

      <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px;">
        <span class="badge">${t("Culture")}: ${escapeHtml(cultureName)}</span>
        <span class="badge">${t("Capital")}: ${escapeHtml(capitalName)}</span>
        <span class="badge">${t("Treasury")}: 🪙 ${Math.round(state.treasury ?? 0)}</span>
        ${techName ? `<span class="badge">🔬 ${escapeHtml(techName)} (${techProgress}/${techCost})</span>` : ""}
      </div>

      <div style="margin-bottom: 14px; width: 0; min-width: 100%;">
        <div style="font-weight: bold; margin-bottom: 4px;">${t("Major Cities")}:</div>
        <div id="stateCitiesTable" class="table" style="--table-columns: minmax(12em, 1.3fr) 5.5em 4.5em 4em minmax(29em, 3fr) 5.5em; width: 0; min-width: 100%;">
          <div class="header">
            <div>${t("City")}</div>
            <div style="justify-content: center; text-align: center;">${t("Pop")}</div>
            <div style="justify-content: center; text-align: center;">${t("Citizens")}</div>
            <div style="justify-content: center; text-align: center;">${t("Cells")}</div>
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

      <div style="margin-bottom: 8px; width: 0; min-width: 100%;">
        <div style="font-weight: bold; margin-bottom: 4px;">${t("Assets")}:</div>
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

  // Attach button listeners
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".zoomCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", (e) => {
        const target = (e.currentTarget as HTMLElement);
        const burgId = Number(target.dataset.burgId);
        const b = pack.burgs?.[burgId];
        if (b) zoomTo(b.x, b.y, 8, 1600);
      });
    });

  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".editCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", (e) => {
        const target = (e.currentTarget as HTMLElement);
        const burgId = Number(target.dataset.burgId);
        void Controllers.BurgEditor.open(burgId);
      });
    });

  // Remove city listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".removeCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", (e) => {
        const target = (e.currentTarget as HTMLElement);
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
        openStateCitiesDialog(stateId);
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
    openStateCitiesDialog(stateId);
  });

  // Dismantle Asset listener
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".removeAssetBtn")
    .forEach(btn => {
      btn.addEventListener("click", (e) => {
        const target = (e.currentTarget as HTMLElement);
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
        openStateCitiesDialog(stateId);
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
    openStateCitiesDialog(stateId);
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
