import { Controllers } from "@/controllers";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { resolveCivTechName } from "@/data/living-civ-themes";
import { activeCivThemeId, factionSuppressionProductionCost, Living } from "@/model/physical/living-generator";
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

  const citiesHtml = breakdown.cities.length
    ? breakdown.cities
        .map(city => {
          const burg = pack.burgs?.[city.burgId];
          const bSim = living.burgs[city.burgId];
          const buildingsBadges = city.buildings.length
            ? city.buildings
                .map(
                  id =>
                    `<span class="badge" style="margin: 1px; font-size: 0.8em;">${escapeHtml(CIV_BUILDING_BY_ID[id]?.name ?? id)}</span>`
                )
                .join(" ")
            : `<span style="opacity: 0.6;">${t("None")}</span>`;

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
              const prog = Math.round(bSim?.productionProgress?.[`${prodItem.kind}:${prodItem.id}`] ?? 0);
              const cost = factionSuppressionProductionCost({ tier });
              queueText = `<div style="font-size: 0.8em; opacity: 0.75; margin-top: 2px;">🔨 Suppressing ${escapeHtml(targetFaction?.name ?? "faction")} (${prog}/${cost})</div>`;
            } else {
              const def =
                prodItem.kind === "unit"
                  ? (CIV_CIVILIAN_BY_ID[prodItem.id] ?? Military.getUnitTypes()[prodItem.id])
                  : CIV_BUILDING_BY_ID[prodItem.id];
              const prog = Math.round(bSim?.productionProgress?.[`${prodItem.kind}:${prodItem.id}`] ?? 0);
              const cost = Math.round((def as { cost?: number } | undefined)?.cost ?? 0);
              queueText = `<div style="font-size: 0.8em; opacity: 0.75; margin-top: 2px;">🔨 ${escapeHtml(def?.name ?? prodItem.id)} (${prog}/${cost})</div>`;
            }
          }

          const popText = burg?.population ? burg.population.toLocaleString() : "—";

          return /* html */ `
            <tr style="border-bottom: 1px solid #444;" data-burg-id="${city.burgId}">
              <td style="padding: 6px 4px;">
                <b>${escapeHtml(city.name)}</b>
                ${city.isCapital ? ` <span class="badge" style="font-size: 0.75em; background: #b45309; color: #fff;">${t("Capital")}</span>` : ""}
                ${queueText}
              </td>
              <td style="padding: 6px 4px; text-align: center;">${popText}</td>
              <td style="padding: 6px 4px; text-align: center;">${city.citizens}</td>
              <td style="padding: 6px 4px; text-align: center;">${city.workedCells}</td>
              <td style="padding: 6px 4px;">${formatYields(city.yields)}</td>
              <td style="padding: 6px 4px;">${buildingsBadges}</td>
              <td style="padding: 6px 4px; text-align: right; white-space: nowrap;">
                <button class="btn icon-search zoomCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Zoom to city")}"></button>
                <button class="btn icon-pencil editCityBtn" data-burg-id="${city.burgId}" data-tip="${t("Edit burg")}"></button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="7" style="padding: 10px; opacity: 0.7; text-align: center;">${t("No major cities established yet.")}</td></tr>`;

  const markup = /* html */ `
    <div id="${STATE_CITIES_DIALOG_ID}" class="dialog" style="min-width: 480px; max-width: 650px; padding: 10px;">
      <div style="font-size: 1.15em; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="color: ${state.color};">🏛️</span> ${escapeHtml(state.fullName || state.name)}
        </div>
        <div style="font-size: 0.85em; opacity: 0.85;">
          <span class="badge">${escapeHtml(state.formName || state.form || "State")}</span>
        </div>
      </div>

      <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 4px;">
        <span class="badge">${t("Culture")}: ${escapeHtml(cultureName)}</span>
        <span class="badge">${t("Capital")}: ${escapeHtml(capitalName)}</span>
        <span class="badge">${t("Treasury")}: 🪙 ${Math.round(state.treasury ?? 0)}</span>
        ${techName ? `<span class="badge">🔬 ${escapeHtml(techName)} (${techProgress}/${techCost})</span>` : ""}
      </div>

      <div style="font-size: 0.85em; opacity: 0.85; margin-bottom: 4px;">
        ${escapeHtml(formatYields(breakdown.total))} · 😊 ${Math.round(sSim?.happiness ?? 0)}
      </div>
      <div style="font-size: 0.85em; opacity: 0.85; margin-bottom: 10px;">
        ${breakdown.totalCitizens} ${t("citizens")} · ${breakdown.totalWorkedCells} ${t("worked cells")} · ${t("Upkeep")}: -🪙${breakdown.upkeep} · ${t("Maint")}: -🪙${breakdown.maintenance}${breakdown.relicTribute ? ` · ${t("Relics")}: +🪙${breakdown.relicTribute}` : ""}
      </div>

      <div style="margin-bottom: 8px; background: rgba(255,255,255,0.04); padding: 8px; border-radius: 4px;">
        <div style="font-weight: bold; margin-bottom: 6px;">${t("Major Cities & OpenCiv Nodes")}:</div>
        <div id="stateCitiesTableContainer" style="width: 100%; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.85em;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px solid #555;">
                <th style="padding: 4px;">${t("City")}</th>
                <th style="padding: 4px; text-align: center;">${t("Pop")}</th>
                <th style="padding: 4px; text-align: center;">${t("Citizens")}</th>
                <th style="padding: 4px; text-align: center;">${t("Cells")}</th>
                <th style="padding: 4px;">${t("Yields")}</th>
                <th style="padding: 4px;">${t("Buildings")}</th>
                <th style="padding: 4px; text-align: right;">${t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              ${citiesHtml}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px;">
        <button id="stateCitiesOverviewBurgsBtn" class="btn">${t("All Burgs Overview")}</button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", markup);

  Dialog.open(STATE_CITIES_DIALOG_ID, {
    title: `${t("State Cities & Yields")} - ${state.name}`,
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(STATE_CITIES_DIALOG_ID)
  });

  // Attach button listeners
  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".zoomCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", function () {
        const burgId = Number((this as HTMLElement).dataset.burgId);
        const b = pack.burgs?.[burgId];
        if (b) zoomTo(b.x, b.y, 8, 1600);
      });
    });

  ensureEl(STATE_CITIES_DIALOG_ID)
    ?.querySelectorAll(".editCityBtn")
    .forEach(btn => {
      btn.addEventListener("click", function () {
        const burgId = Number((this as HTMLElement).dataset.burgId);
        void Controllers.BurgEditor.open(burgId);
      });
    });

  ensureEl("stateCitiesOverviewBurgsBtn")?.addEventListener("click", () => {
    void Controllers.BurgsOverview.open({ stateId });
  });
}

export const StateCitiesDialog = {
  open: openStateCitiesDialog,
  close: () => Dialog.close(STATE_CITIES_DIALOG_ID)
};
