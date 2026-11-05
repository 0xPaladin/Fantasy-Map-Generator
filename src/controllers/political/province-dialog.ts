import { Controllers } from "@/controllers";
import { currentContent } from "@/data/roster-store";
import type { BuildingDef } from "@/data/roster-content";
import { poiCapacityType } from "@/data/tiers";
import { valueModifier } from "@/data/saves-helpers";
import { currentSession } from "@/conquest/store/session";
import { civBuildingCapacity } from "@/data/living-civ-buildings";
import { isLairStateCapable } from "@/data/living-lairs";
import { getTroubleDef, isTroubleStatePromotable, SAVE_KIND_LABELS, UNIT_ROLE_LABELS } from "@/data/living-troubles";
import type { Province } from "@/model/political/provinces-generator";
import { Provinces } from "@/model/political/provinces-generator";
import { classifyGood, Living, regionTierFromPop } from "@/model/physical/living-generator";
import { Names } from "@/model/society/names-generator";
import { getCellPoint } from "@/model/story/journeys/journey-places";
import { getArea, getAreaUnit } from "@/model/units";
import { Layers } from "@/renderers/layers";
import { speak } from "@/services/speech";
import type { LivingWorldState, ProvinceSimState } from "@/types/living";
import { Dialog } from "@/ui/dialog/dialog";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { applyOption, ensureEl, findEl } from "@/utils/node-utils";
import { rn, si } from "@/utils/number-utils";
import { rand } from "@/utils/probability-utils";
import { escapeHtml } from "@/utils/string-utils";

type BuildingEffects = BuildingDef["effects"];

export const PROVINCE_DIALOG_ID = "provinceDetailsDialog" as const;

const PROVINCE_FORMS = [
  "",
  "Area",
  "Autonomy",
  "Barony",
  "Canton",
  "Captaincy",
  "Chiefdom",
  "Clan",
  "Colony",
  "Council",
  "County",
  "Deanery",
  "Department",
  "Dependency",
  "Diaconate",
  "District",
  "Duchy",
  "Earldom",
  "Governorate",
  "Island",
  "Islands",
  "Land",
  "Landgrave",
  "Mandate",
  "Margrave",
  "Municipality",
  "Occupation zone",
  "Parish",
  "Prefecture",
  "Province",
  "Region",
  "Republic",
  "Reservation",
  "Seneschalty",
  "Shire",
  "State",
  "Territory",
  "Tribe"
] as const;

function getLivingState(): LivingWorldState | undefined {
  // Fixtures and older maps may expose the simulation directly on `pack.living`;
  // prefer it so the dialog also works without initializing the world.
  const direct = (globalThis as unknown as { pack?: { living?: LivingWorldState } }).pack?.living;
  if (direct) return direct;

  try {
    return typeof Living !== "undefined" && Living.getState ? Living.getState() : undefined;
  } catch {
    return undefined;
  }
}

export interface ProvinceCapacity {
  m: number;
  w: number;
  s: number;
  c: number;
  modM: number;
  modW: number;
  modS: number;
  modC: number;
}

function getProvinceBuildings(provinceId: number, living?: LivingWorldState): string[] {
  const result: string[] = [];
  try {
    const session = currentSession();
    const campaignReg = session?.store?.state?.regions?.[String(provinceId)];
    if (campaignReg?.buildings?.length) {
      result.push(...campaignReg.buildings);
    }
  } catch {}

  const pSim = living?.provinces?.[provinceId] as
    | (ProvinceSimState & { buildings?: string[]; assets?: string[] })
    | undefined;
  if (pSim?.buildings?.length) {
    for (const b of pSim.buildings) {
      if (!result.includes(b)) result.push(b);
    }
  }
  if (pSim?.assets?.length) {
    for (const b of pSim.assets) {
      if (!result.includes(b)) result.push(b);
    }
  }

  const p = pack.provinces?.[provinceId] as (Province & { buildings?: string[]; assets?: string[] }) | undefined;
  if (p?.buildings?.length) {
    for (const b of p.buildings) {
      if (!result.includes(b)) result.push(b);
    }
  }
  if (p?.assets?.length) {
    for (const b of p.assets) {
      if (!result.includes(b)) result.push(b);
    }
  }

  return result;
}

function getProvinceConstruction(provinceId: number, living?: LivingWorldState) {
  try {
    const session = currentSession();
    const campaignReg = session?.store?.state?.regions?.[String(provinceId)];
    if (campaignReg?.construction) return campaignReg.construction;
  } catch {}

  const pSim = living?.provinces?.[provinceId] as (ProvinceSimState & { construction?: any }) | undefined;
  if (pSim?.construction) return pSim.construction;
  return null;
}

export function computeProvinceCapacity(
  p: Province,
  pSim?: ProvinceSimState,
  living?: LivingWorldState
): ProvinceCapacity {
  const popScale = options.map?.units?.population?.scale ?? 1000;
  const urbanRate = options.map?.units?.population?.urbanization?.rate ?? 1;
  const rural = (p.rural ?? 0) * popScale;
  const urban = (p.urban ?? 0) * popScale * urbanRate;
  const totalPop = rural + urban;
  const popThousands = Math.round(totalPop / 1000);
  const rTier = regionTierFromPop(popThousands);
  const dev = pSim?.development ?? 0;

  let m = 1; // base levy
  let w = rTier + dev;
  let s = rTier + dev;
  let c = 0;

  // Capital court bonus: +2 C if province holds state capital
  const state = pack.states?.[p.state];
  if (state?.capital && (p.burg === state.capital || (p.burgs && p.burgs.includes(state.capital)))) {
    c += 2;
  }

  // Province cells
  const provCells = new Set<number>();
  if (pack.cells?.province) {
    for (let i = 0; i < pack.cells.province.length; i++) {
      if (pack.cells.province[i] === p.i) provCells.add(i);
    }
  }

  // Landmarks & POIs in this province's cells
  for (const marker of pack.markers ?? []) {
    if (marker && provCells.has(marker.cell)) {
      const pool = poiCapacityType(marker.type);
      if (pool === "m") m++;
      else if (pool === "w") w++;
      else if (pool === "s") s++;
      else if (pool === "c") c++;
    }
  }

  // Trade goods in this province's cells
  if (pack.cells?.good) {
    for (const cell of provCells) {
      const goodId = pack.cells.good[cell];
      if (!goodId) continue;
      const good = pack.goods?.[goodId];
      if (!good) continue;
      const cl = classifyGood(good);
      if (cl === "strategic") m++;
      else if (cl === "luxury") w++;
    }
  }

  // Standing buildings
  let buildingDefs: BuildingDef[] = [];
  try {
    buildingDefs = currentContent().content.buildings;
  } catch {
    buildingDefs = [];
  }
  const buildingById = new Map<string, BuildingDef>(buildingDefs.map(b => [b.id, b]));

  // Province-level buildings
  const provBuildings = getProvinceBuildings(p.i, living);
  for (const bid of provBuildings) {
    const bDef = buildingById.get(bid);
    if (bDef?.effects?.capacity) {
      m += bDef.effects.capacity.m ?? 0;
      w += bDef.effects.capacity.w ?? 0;
      s += bDef.effects.capacity.s ?? 0;
      c += bDef.effects.capacity.c ?? 0;
    }
  }

  // Burg structures in this province
  for (const bId of p.burgs ?? []) {
    const bSim = living?.burgs?.[bId];
    if (!bSim) continue;
    for (const bid of bSim.civBuildings ?? []) {
      const cap = civBuildingCapacity(bid);
      m += cap.m;
      w += cap.w;
      s += cap.s;
      c += cap.c;
    }
    for (const bid of bSim.buildings ?? []) {
      const bDef = buildingById.get(bid);
      if (bDef?.effects?.capacity) {
        m += bDef.effects.capacity.m ?? 0;
        w += bDef.effects.capacity.w ?? 0;
        s += bDef.effects.capacity.s ?? 0;
        c += bDef.effects.capacity.c ?? 0;
      }
    }
  }

  return {
    m,
    w,
    s,
    c,
    modM: valueModifier(m),
    modW: valueModifier(w),
    modS: valueModifier(s),
    modC: valueModifier(c)
  };
}

function formatBuildingEffects(effects?: BuildingEffects): string {
  if (!effects) return "Active";
  const parts: string[] = [];
  if (effects.capacity) {
    for (const [pool, val] of Object.entries(effects.capacity)) {
      if (val) parts.push(`+${val} ${pool.toUpperCase()}`);
    }
  }
  if (effects.upkeep) {
    for (const [pool, val] of Object.entries(effects.upkeep)) {
      if (val) parts.push(`-${val} ${pool.toUpperCase()}`);
    }
  }
  if (effects.freeGarrisonUnits) {
    parts.push(`+${effects.freeGarrisonUnits} Garrison`);
  }
  return parts.length ? parts.join(", ") : "Active";
}

function zoomToLocation(cell?: number, x?: number, y?: number): void {
  if (x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y)) {
    zoomTo(x, y, 8, 1000);
    return;
  }
  if (cell !== undefined && Number.isFinite(cell)) {
    const point = getCellPoint(cell);
    if (point) zoomTo(point[0], point[1], 8, 1000);
  }
}

export function openProvinceDetailsDialog(provinceId: number, onUpdate?: () => void): void {
  const p = pack.provinces?.[provinceId];
  if (!p || p.removed) return;

  Dialog.destroy(PROVINCE_DIALOG_ID);

  const state = pack.states?.[p.state];
  const stateName = state && !state.removed ? state.name : t("Neutrals");
  const stateColor = state?.color ?? "#999";

  const cultureId = p.center !== undefined && pack.cells?.culture ? pack.cells.culture[p.center] : 0;
  const cultureName = pack.cultures?.[cultureId]?.name ?? t("Unknown");

  const area = getArea(p.area ?? 0);
  const unit = ` ${getAreaUnit()}`;
  const popScale = options.map?.units?.population?.scale ?? 1000;
  const urbanRate = options.map?.units?.population?.urbanization?.rate ?? 1;
  const rural = (p.rural ?? 0) * popScale;
  const urban = (p.urban ?? 0) * popScale * urbanRate;
  const population = rn(rural + urban);

  const capitalBurg = p.burg && pack.burgs?.[p.burg] ? pack.burgs[p.burg] : undefined;
  const capitalName = capitalBurg?.name ?? t("Governed from state capital");

  const living = getLivingState();
  const pSim = living?.provinces?.[provinceId];
  const order = pSim?.order ?? 50;
  const stability = pSim?.stability ?? 0;
  const development = pSim?.development ?? 0;

  // Domain checks capacity
  const cap = computeProvinceCapacity(p, pSim, living);

  // Development progress
  let devProgressHtml = "";
  if (pSim?.developmentProgress) {
    const targetBurg =
      pack.burgs?.[pSim.developmentProgress.settlementId]?.name ?? `Burg #${pSim.developmentProgress.settlementId}`;
    devProgressHtml = `<div class="provRow" style="font-size:0.85em; color:#444;">
      <span class="label">Progress:</span>
      <span>Next dev in <strong>${escapeHtml(targetBurg)}</strong> (${pSim.developmentProgress.turnsLeft} turns left)</span>
    </div>`;
  }

  // Active Trouble
  let troubleHtml = "";
  if (pSim?.trouble) {
    const tDef = getTroubleDef(pSim.trouble.id);
    const isPromotable = isTroubleStatePromotable(pSim.trouble.id);
    const troubleName = pSim.trouble.name || tDef?.name || pSim.trouble.id;
    troubleHtml = `<span>
      <strong>${escapeHtml(troubleName)}</strong>
      <span style="font-size:0.88em; color:#666;">(Lv ${pSim.trouble.level}, ${escapeHtml(pSim.trouble.theme)})</span>
      ${isPromotable ? '<span class="provBadge" style="background:#8b2635">State-Capable</span>' : ""}
      <button type="button" class="icon-target pointer" data-zoom-cell="${pSim.trouble.cell}" data-tip="${t("Zoom to trouble")}" style="background:none; border:none; padding:0; cursor:pointer; font-size:1.05em; vertical-align:middle;"></button>
      <span style="font-size:0.85em; color:#666; margin-left:0.3em;">(${tDef ? SAVE_KIND_LABELS[tDef.save] : ""} · ${tDef ? UNIT_ROLE_LABELS[tDef.requiredRole] : ""} · ${pSim.trouble.seasonsUnchecked ?? 0}s unchecked)</span>
    </span>`;
  }

  // Active Lair
  let lairHtml = "";
  if (pSim?.lair) {
    const lair = pSim.lair;
    const isCapable = isLairStateCapable(lair.id);
    const defCount = (lair.defenders ?? []).reduce((sum: number, u: { count?: number }) => sum + (u.count ?? 0), 0);
    lairHtml = `<span>
      <strong>${escapeHtml(lair.name)}</strong>
      <span style="font-size:0.88em; color:#666;">(Lv ${lair.level}, ${escapeHtml(lair.theme)})</span>
      ${isCapable ? '<span class="provBadge" style="background:#5e3c6e">State-Capable</span>' : ""}
      ${lair.fortified ? '<span class="provBadge" style="background:#2b5c8f">Fortified</span>' : ""}
      ${lair.raidPending ? '<span class="provBadge" style="background:#a33d3d">Raid Imminent</span>' : ""}
      <button type="button" class="icon-target pointer" data-zoom-cell="${lair.cell}" data-tip="${t("Zoom to lair")}" style="background:none; border:none; padding:0; cursor:pointer; font-size:1.05em; vertical-align:middle;"></button>
      <span style="font-size:0.85em; color:#666; margin-left:0.3em;">(${defCount} def · Raid ${lair.raidThreshold}+)</span>
    </span>`;
  }

  // Province cells
  const provCells = new Set<number>();
  if (pack.cells?.province) {
    for (let i = 0; i < pack.cells.province.length; i++) {
      if (pack.cells.province[i] === provinceId) provCells.add(i);
    }
  }

  // 1. Province-Level Assets Table (NOT linked to Burgs)
  let buildingDefs: BuildingDef[] = [];
  try {
    buildingDefs = currentContent().content.buildings;
  } catch {
    buildingDefs = [];
  }
  const buildingById = new Map<string, BuildingDef>(buildingDefs.map(b => [b.id, b]));

  let assetRowsHtml = "";
  const provBuildings = getProvinceBuildings(provinceId, living);

  for (const bid of provBuildings) {
    const bDef = buildingById.get(bid);
    // Include province assets (unchained, resource, custom, or direct province buildings)
    const name = bDef?.name ?? bid;
    const kind = bDef?.kind ? bDef.kind.charAt(0).toUpperCase() + bDef.kind.slice(1) : "Province Asset";
    const effects = formatBuildingEffects(bDef?.effects);

    assetRowsHtml += `<tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td><span class="provBadge" style="background:#4a6fa5;">${escapeHtml(kind)}</span></td>
      <td>${escapeHtml(effects)}</td>
      <td style="text-align:right;">Active</td>
    </tr>`;
  }

  // Province construction
  const provConstruction = getProvinceConstruction(provinceId, living);
  if (provConstruction) {
    const bDef = buildingById.get(provConstruction.buildingId);
    const name = bDef?.name ?? provConstruction.buildingId;
    const checksText = `M:${provConstruction.checks?.m ? "✓" : "✗"} W:${provConstruction.checks?.w ? "✓" : "✗"} S:${provConstruction.checks?.s ? "✓" : "✗"}`;
    assetRowsHtml += `<tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td><span class="provBadge" style="background:#2b5c8f;">Construction</span></td>
      <td>${provConstruction.turnsLeft}t left · ${checksText}</td>
      <td style="text-align:right;">Underway</td>
    </tr>`;
  }

  // Regional POIs / Landmarks in this province's territory
  for (const marker of pack.markers ?? []) {
    if (!marker || !provCells.has(marker.cell)) continue;
    const pool = poiCapacityType(marker.type);
    const effects = pool ? `+1 ${pool.toUpperCase()} Capacity` : "Landmark";
    assetRowsHtml += `<tr>
      <td><strong>${escapeHtml(marker.name || marker.type)}</strong></td>
      <td><span class="provBadge" style="background:#5e4fa2;">POI · ${escapeHtml(marker.type)}</span></td>
      <td>${effects}</td>
      <td style="text-align:right; white-space:nowrap;">
        Cell ${marker.cell}
        <button type="button" class="icon-target pointer" data-zoom-cell="${marker.cell}" data-tip="${t("Zoom to landmark")}" style="background:none; border:none; padding:0; cursor:pointer; font-size:1.05em; vertical-align:middle; margin-left:3px;"></button>
      </td>
    </tr>`;
  }

  const assetTableHtml = assetRowsHtml
    ? `<table class="provTable">
        <thead>
          <tr>
            <th>${t("Asset")}</th>
            <th>${t("Type")}</th>
            <th>${t("Effects / Capacity")}</th>
            <th style="text-align:right;">${t("Status / Location")}</th>
          </tr>
        </thead>
        <tbody>${assetRowsHtml}</tbody>
      </table>`
    : `<div class="provMuted" style="padding:4px 0;">${t("No province-level assets or landmarks")}</div>`;

  // 2. Burgs Table with feature buttons on the right-hand side
  const burgIds = p.burgs ?? [];
  let burgRowsHtml = "";

  for (const bId of burgIds) {
    const b = pack.burgs?.[bId];
    if (!b || b.removed) continue;
    const bSim = living?.burgs?.[bId];
    const icon = b.capital ? "👑" : b.port ? "⚓" : "🏰";
    const pop = rn((b.population ?? 0) * popScale * urbanRate);
    const unrestBadge =
      bSim && bSim.unrest > 0
        ? `<span class="provBadge" style="background:${bSim.unrest >= 20 ? "#8b0000" : bSim.unrest >= 15 ? "#d9534f" : bSim.unrest >= 10 ? "#f0ad4e" : "#5cb85c"}">Unrest ${bSim.unrest}</span>`
        : `<span style="color:#888;">0</span>`;

    burgRowsHtml += `<tr>
      <td>
        <span style="margin-right:2px;">${icon}</span>
        <strong>${escapeHtml(b.name || "")}</strong>
      </td>
      <td>Tier ${bSim?.baseTier ?? 1}</td>
      <td>${si(pop)}</td>
      <td>${unrestBadge}</td>
      <td style="text-align:right; white-space:nowrap;">
        <span class="burgFeatureIcon icon-star-empty ${b.capital ? "" : "inactive"}" style="color:${b.capital ? "#d4af37" : "#aaa"}; font-size:1.05em;" data-tip="${b.capital ? t("State capital (Click to toggle)") : t("Not a capital (Click to toggle)")}" data-burg-feature="capital" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-anchor ${b.port ? "" : "inactive"}" style="color:${b.port ? "#3a86ff" : "#aaa"}; font-size:0.95em;" data-tip="${b.port ? t("Port (Click to toggle)") : t("Not a port (Click to toggle)")}" data-burg-feature="port" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-chess-rook ${b.citadel ? "" : "inactive"}" style="color:${b.citadel ? "#6a4c93" : "#aaa"}; font-size:1.05em;" data-tip="${b.citadel ? t("Citadel (Click to toggle)") : t("No citadel (Click to toggle)")}" data-burg-feature="citadel" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-fort-awesome ${b.walls ? "" : "inactive"}" style="color:${b.walls ? "#444" : "#aaa"}; font-size:1.05em;" data-tip="${b.walls ? t("Walled (Click to toggle)") : t("No walls (Click to toggle)")}" data-burg-feature="walls" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-store ${b.plaza ? "" : "inactive"}" style="color:${b.plaza ? "#e07a5f" : "#aaa"}; font-size:0.95em;" data-tip="${b.plaza ? t("Trade plaza (Click to toggle)") : t("No plaza (Click to toggle)")}" data-burg-feature="plaza" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-chess-bishop ${b.temple ? "" : "inactive"}" style="color:${b.temple ? "#38b000" : "#aaa"}; font-size:1.05em;" data-tip="${b.temple ? t("Temple (Click to toggle)") : t("No temple (Click to toggle)")}" data-burg-feature="temple" data-burg-id="${b.i}"></span>
        <span class="burgFeatureIcon icon-campground ${b.shanty ? "" : "inactive"}" style="color:${b.shanty ? "#8d5b4c" : "#aaa"}; font-size:0.95em;" data-tip="${b.shanty ? t("Shanty town (Click to toggle)") : t("No shanty town (Click to toggle)")}" data-burg-feature="shanty" data-burg-id="${b.i}"></span>
        <span style="display:inline-block; width:1px; height:1em; background:rgba(0,0,0,0.15); margin:0 4px; vertical-align:middle;"></span>
        <button type="button" class="icon-target pointer" data-zoom-burg="${b.i}" data-tip="${t("Zoom to burg")}" style="background:none; border:none; padding:0; cursor:pointer; font-size:1.05em; vertical-align:middle;"></button>
        <button type="button" class="icon-pencil pointer" data-open-burg="${b.i}" data-tip="${t("Edit Burg")}" style="background:none; border:none; padding:0; cursor:pointer; font-size:1.05em; margin-left:0.3em; vertical-align:middle;"></button>
      </td>
    </tr>`;
  }

  const burgTableHtml = burgRowsHtml
    ? `<table class="provTable">
        <thead>
          <tr>
            <th>${t("Burg")}</th>
            <th>${t("Tier")}</th>
            <th>${t("Pop")}</th>
            <th>${t("Unrest")}</th>
            <th style="text-align:right;">${t("Features & Actions")}</th>
          </tr>
        </thead>
        <tbody>${burgRowsHtml}</tbody>
      </table>`
    : `<div class="provMuted" style="padding:4px 0;">${t("No burgs in this province")}</div>`;

  const titleText = escapeHtml(p.fullName || p.name || "Province");

  const dialogHtml = /* html */ `
    <div id="${PROVINCE_DIALOG_ID}" class="dialog" data-province="${provinceId}" style="min-width:440px; max-width:600px;">
      <!-- Title & State -->
      <div style="display:flex; align-items:center; gap:0.5em; margin-bottom:0.35em;">
        <fill-box fill="${p.color}" style="width:1.2em; height:1.2em; border-radius:3px; display:inline-block;"></fill-box>
        <strong style="font-size:1.1em;">${titleText}</strong>
        <span style="margin-left:auto; font-size:0.88em; display:flex; align-items:center; gap:0.3em;">
          <span style="display:inline-block; width:0.65em; height:0.65em; border-radius:50%; background:${stateColor};"></span>
          ${escapeHtml(stateName)}
        </span>
      </div>

      <!-- Line 1: Short Name & Form Name on one line -->
      <div class="provSection" style="margin-top:0.1em; padding-top:0.2em;">
        <div class="provRow" style="flex-wrap: wrap; gap: 0.35em; align-items: center;">
          <span class="label" data-tip="${t("Short name")}">${t("Name")}:</span>
          <input
            id="provDialogShort"
            value="${escapeHtml(p.name || "")}"
            data-tip="${t("Type to change the short name")}"
            autocorrect="off"
            spellcheck="false"
            style="width: 8.5em"
          />
          <span id="provDialogShortSpeak" data-tip="${t("Speak the name")}" class="speaker pointer">🔊</span>
          <span id="provDialogShortCulture" data-tip="${t("Generate culture-specific name")}" class="icon-book pointer"></span>
          <span id="provDialogShortRandom" data-tip="${t("Generate random name")}" class="icon-globe pointer"></span>

          <span class="label" style="margin-left: 0.4em;" data-tip="${t("Form name")}">${t("Form")}:</span>
          <select id="provDialogSelectForm" style="display: inline-block; width: 8.5em; height: 1.645em">
            ${PROVINCE_FORMS.map(f => `<option value="${f}">${f ? t(f) : t("blank")}</option>`).join("")}
          </select>
          <input
            id="provDialogCustomForm"
            placeholder="${t("Custom form")}"
            data-tip="${t("Create custom province form name")}"
            style="display: none; width: 8.5em"
          />
          <span id="provDialogAddForm" data-tip="${t("Click to add custom province form name to the list")}" class="icon-plus pointer"></span>
          <span style="font-size: 0.85em; color: #666; margin-left: auto;">(${escapeHtml(cultureName)})</span>
        </div>
      </div>

      <!-- Line 2: Geography & Demographics on one line -->
      <div class="provSection">
        <div class="provRow" style="flex-wrap: wrap; gap: 0.5em; font-size: 0.88em;">
          <span>
            <strong class="label">${t("Capital")}:</strong> ${escapeHtml(capitalName)}
            ${capitalBurg ? `<button type="button" class="icon-star-empty pointer" id="provDialogZoomCapital" data-tip="${t("Click to zoom")}" style="background:none; border:none; padding:0; font-size:1.05em; cursor:pointer; vertical-align:middle;"></button>` : ""}
          </span>
          <span style="color:#aaa;">·</span>
          <span><strong class="label">${t("Area")}:</strong> ${si(area)}${unit}</span>
          <span style="color:#aaa;">·</span>
          <span><strong class="label">${t("Population")}:</strong> <strong>${si(population)}</strong> (${t("Rural")}: ${si(rural)}, ${t("Urban")}: ${si(urban)})</span>
        </div>
      </div>

      <!-- Line 3: Living World Stats & Domain Checks -->
      <div class="provSection">
        <div class="provRow" style="flex-wrap: wrap; gap: 0.8em; align-items: center; justify-content: space-between;">
          <div style="display: inline-flex; align-items: center; gap: 0.35em;">
            <strong class="label" data-tip="${t("Province Domain check modifiers")}">Checks:</strong>
            <span class="provCheckChip" data-tip="Military Value: ${cap.m} → Check Modifier: +${cap.modM} (Roll: 1d20 + ${cap.modM})"><strong>M:</strong> ${cap.m} (+${cap.modM})</span>
            <span class="provCheckChip" data-tip="Wealth Value: ${cap.w} → Check Modifier: +${cap.modW} (Roll: 1d20 + ${cap.modW})"><strong>W:</strong> ${cap.w} (+${cap.modW})</span>
            <span class="provCheckChip" data-tip="Social Value: ${cap.s} → Check Modifier: +${cap.modS} (Roll: 1d20 + ${cap.modS})"><strong>S:</strong> ${cap.s} (+${cap.modS})</span>
            <span class="provCheckChip" data-tip="Cunning Value: ${cap.c} → Check Modifier: +${cap.modC} (Roll: 1d20 + ${cap.modC})"><strong>C:</strong> ${cap.c} (+${cap.modC})</span>
          </div>

          <div style="display: inline-flex; align-items: center; gap: 0.4em;">
            <span class="label" data-tip="${t("Public Order")}">${t("Order")}:</span>
            <input type="number" id="provDialogOrder" min="0" max="100" value="${order}" style="width: 4.5em; text-align: center;" />
            <span style="font-size:0.85em; color:#666;">/100</span>

            <span class="label" style="margin-left:0.35em;" data-tip="${t("Stability")}">${t("Stab")}:</span>
            <input type="number" id="provDialogStability" min="0" value="${stability}" style="width: 4em; text-align: center;" />

            <span class="label" style="margin-left:0.35em;" data-tip="${t("Development")}">${t("Dev")}:</span>
            <input type="number" id="provDialogDev" min="0" value="${development}" style="width: 4em; text-align: center;" />
          </div>
        </div>

        ${devProgressHtml ? `<div style="font-size: 0.85em; color: #555; margin-top: 2px;">${devProgressHtml}</div>` : ""}

        ${
          troubleHtml || lairHtml
            ? `
        <div class="provRow" style="flex-wrap: wrap; gap: 0.8em; margin-top: 0.25em; font-size: 0.88em;">
          ${troubleHtml ? `<div style="display:inline-flex; align-items:center; gap:0.3em;"><strong>Trouble:</strong> ${troubleHtml}</div>` : ""}
          ${lairHtml ? `<div style="display:inline-flex; align-items:center; gap:0.3em;"><strong>Lair:</strong> ${lairHtml}</div>` : ""}
        </div>`
            : ""
        }
      </div>

      <!-- Assets Table (Province Level Assets, moved above Burgs) -->
      <div class="provSection">
        <div class="provSectionTitle">${t("Province Assets")}</div>
        ${assetTableHtml}
      </div>

      <!-- Burgs Table -->
      <div class="provSection">
        <div class="provSectionTitle">${t("Burgs")} (${burgIds.length})</div>
        ${burgTableHtml}
      </div>
    </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", dialogHtml);

  applyOption(ensureEl("provDialogSelectForm"), p.formName || "");

  // Event handlers
  ensureEl("provDialogShortCulture").addEventListener("click", () => {
    const culture = p.center !== undefined && pack.cells?.culture ? pack.cells.culture[p.center] : 0;
    const name = Names.getState(Names.getCultureShort(culture), culture);
    ensureEl<HTMLInputElement>("provDialogShort").value = name;
  });

  ensureEl("provDialogShortRandom").addEventListener("click", () => {
    const base = Names.nameBases[rand(Names.nameBases.length - 1)].id;
    const name = Names.getState(Names.getBase(base), undefined as unknown as number, base);
    ensureEl<HTMLInputElement>("provDialogShort").value = name;
  });

  ensureEl("provDialogShortSpeak").addEventListener("click", () => {
    speak(ensureEl<HTMLInputElement>("provDialogShort").value);
  });

  ensureEl("provDialogAddForm").addEventListener("click", () => {
    const customForm = ensureEl<HTMLInputElement>("provDialogCustomForm");
    const selectForm = ensureEl<HTMLSelectElement>("provDialogSelectForm");
    const displayed = customForm.style.display === "inline-block";
    customForm.style.display = displayed ? "none" : "inline-block";
    selectForm.style.display = displayed ? "inline-block" : "none";
    if (displayed && customForm.value.trim()) {
      applyOption(selectForm, customForm.value.trim());
    }
  });

  if (capitalBurg) {
    findEl("provDialogZoomCapital")?.addEventListener("click", () => {
      zoomToLocation(capitalBurg.cell, capitalBurg.x, capitalBurg.y);
    });
  }

  // Zoom and editor buttons inside the dialog
  const dialogEl = ensureEl(PROVINCE_DIALOG_ID);
  dialogEl.querySelectorAll<HTMLElement>("[data-zoom-cell]").forEach(btn => {
    btn.addEventListener("click", () => {
      const cell = Number(btn.dataset.zoomCell);
      zoomToLocation(cell);
    });
  });

  dialogEl.querySelectorAll<HTMLElement>("[data-zoom-burg]").forEach(btn => {
    btn.addEventListener("click", () => {
      const burgId = Number(btn.dataset.zoomBurg);
      const burg = pack.burgs?.[burgId];
      if (burg) zoomToLocation(burg.cell, burg.x, burg.y);
    });
  });

  dialogEl.querySelectorAll<HTMLElement>("[data-open-burg]").forEach(btn => {
    btn.addEventListener("click", () => {
      const burgId = Number(btn.dataset.openBurg);
      void Controllers.BurgEditor?.open(burgId);
    });
  });

  // Feature buttons inside Burg table
  dialogEl.querySelectorAll<HTMLElement>("[data-burg-feature]").forEach(btn => {
    btn.addEventListener("click", () => {
      const burgId = Number(btn.dataset.burgId);
      const feature = btn.dataset.burgFeature as
        | "capital"
        | "port"
        | "citadel"
        | "walls"
        | "plaza"
        | "temple"
        | "shanty";
      const b = pack.burgs?.[burgId];
      if (!b) return;

      if (feature === "capital") {
        b.capital = b.capital ? 0 : 1;
      } else if (feature === "port") {
        b.port = b.port ? 0 : 1;
      } else if (feature === "citadel") {
        b.citadel = b.citadel ? 0 : 1;
      } else if (feature === "walls") {
        b.walls = b.walls ? 0 : 1;
      } else if (feature === "plaza") {
        b.plaza = b.plaza ? 0 : 1;
      } else if (feature === "temple") {
        b.temple = b.temple ? 0 : 1;
      } else if (feature === "shanty") {
        b.shanty = b.shanty ? 0 : 1;
      }

      const isActive = Boolean(b[feature]);
      btn.classList.toggle("inactive", !isActive);
      if (feature === "capital") {
        btn.style.color = isActive ? "#d4af37" : "#aaa";
      } else if (feature === "port") {
        btn.style.color = isActive ? "#3a86ff" : "#aaa";
      } else if (feature === "citadel") {
        btn.style.color = isActive ? "#6a4c93" : "#aaa";
      } else if (feature === "walls") {
        btn.style.color = isActive ? "#444" : "#aaa";
      } else if (feature === "plaza") {
        btn.style.color = isActive ? "#e07a5f" : "#aaa";
      } else if (feature === "temple") {
        btn.style.color = isActive ? "#38b000" : "#aaa";
      } else if (feature === "shanty") {
        btn.style.color = isActive ? "#8d5b4c" : "#aaa";
      }

      Layers.draw("burgIcons");
      Layers.draw("labels");
      onUpdate?.();
    });
  });

  Dialog.open(PROVINCE_DIALOG_ID, {
    title: `${titleText} — ${t("Province Details")}`,
    width: 580,
    buttons: [
      {
        label: t("Apply"),
        onClick: () => {
          applyChanges(p, onUpdate);
          Dialog.close(PROVINCE_DIALOG_ID);
        }
      },
      {
        label: t("Cancel"),
        onClick: () => {
          Dialog.close(PROVINCE_DIALOG_ID);
        }
      }
    ],
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(PROVINCE_DIALOG_ID)
  });
}

function applyChanges(p: Province, onUpdate?: () => void): void {
  const shortInput = findEl<HTMLInputElement>("provDialogShort");
  const formSelect = findEl<HTMLSelectElement>("provDialogSelectForm");

  const name = shortInput?.value.trim() ?? "";
  const formName = formSelect?.value ?? "";
  const oldName = p.name;
  const oldFormName = p.formName ?? "";

  if (name && name !== oldName) Provinces.rename(p.i, name);
  if (formName !== oldFormName) {
    Provinces.setForm(p.i, formName);
  } else if (name && name !== oldName) {
    const fullName = formName ? `${name} ${formName}` : name;
    Provinces.setFullName(p.i, fullName);
  }

  const living = getLivingState();
  const pSim = living?.provinces?.[p.i];
  if (pSim) {
    const orderInput = findEl<HTMLInputElement>("provDialogOrder");
    const stabInput = findEl<HTMLInputElement>("provDialogStability");
    const devInput = findEl<HTMLInputElement>("provDialogDev");
    if (orderInput && orderInput.value !== "") {
      pSim.order = Math.max(0, Math.min(100, Number(orderInput.value) || 0));
    }
    if (stabInput && stabInput.value !== "") {
      pSim.stability = Math.max(0, Number(stabInput.value) || 0);
    }
    if (devInput && devInput.value !== "") {
      pSim.development = Math.max(0, Number(devInput.value) || 0);
    }
  }

  Layers.draw("provinces");
  Layers.draw("labels");
  onUpdate?.();
}
