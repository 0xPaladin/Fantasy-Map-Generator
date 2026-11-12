import { type Selection, select } from "d3";
import { Controllers } from "@/controllers";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { Markets } from "@/model/economy/markets-generator";
import { Prosperity } from "@/model/economy/prosperity";
import { majorityReligion } from "@/model/physical/living-generator";
import type { Burg } from "@/model/political/burgs-generator";
import { Burgs } from "@/model/political/burgs-generator";
import { Factions } from "@/model/political/factions-generator";
import { Military } from "@/model/political/military-generator";
import { Names } from "@/model/society/names-generator";
import { Tags } from "@/model/tags";
import { convertTemperature, getHeight, getTemperatureLikeness } from "@/model/units";
import { removeEmblem } from "@/renderers/draw-emblems";
import { EmblemRenderer } from "@/renderers/emblems/renderer";
import { Layers } from "@/renderers/layers";
import { speak } from "@/services/speech";
import type { Market } from "@/types/economy";
import { renderDevelopment } from "@/ui/development-view";
import { Dialog } from "@/ui/dialog/dialog";
import { closeEntityDialogs, noteButton } from "@/ui/dialog/dialog-helpers";
import { EconomyTerms, prosperityTip, renderProsperity } from "@/ui/economy-view";
import { applyDefaultViewboxEvents } from "@/ui/map/viewbox-events";
import { zoomTo } from "@/ui/map/zoom";
import { clearMainTip, tip } from "@/ui/tooltips";
import { escapeHtml } from "@/utils";
import { openURL } from "@/utils/common-utils";
import { sentences, t } from "@/utils/i18n";
import { ensureEl, getPointer } from "@/utils/node-utils";
import { rn } from "@/utils/number-utils";
import { MAX_ZOOM, PAN_ZOOM_IDENTITY, type PanZoom, panBy, zoomAt } from "@/utils/pan-zoom-utils";
import { rand } from "@/utils/probability-utils";
import { errorText } from "@/utils/string-utils";

let selected: Selection<SVGElement, unknown, HTMLElement, unknown> | null = null;
let selectedId: number | null = null;
let previewTransform: PanZoom = { ...PAN_ZOOM_IDENTITY };
let previewMaxZoom = MAX_ZOOM;
let previewCommittedK = 1;
let previewSettleTimer = 0;
let previewLayoutLocked = false;

function open(id: number | string): void {
  if (options.app.mode) return;
  Dialog.closeAll(".stable");
  Layers.show("burgIcons", "labels");

  selectedId = +id;
  selected = select<SVGElement, unknown>("#labels").select<SVGElement>(`[data-label-type='burg'][data-id='${id}']`);
  if (!selected.size()) selected = select<SVGElement, unknown>("#burgIcons").select<SVGElement>(`[data-id='${id}']`);

  renderDialog();
  ensureEl("burgEditor").dataset.entity = `burg:${selectedId}`;
  updateGroupsList();

  Dialog.open("burgEditor", {
    title: t("Edit Burg"),
    onClose: closeBurgEditor,
    position: { my: "left top", at: "left+10 top+10", of: "svg" }
  });
  updateBurgValues(); // after opening: moving a loading iframe into the window would restart its navigation
}

function renderDialog(): void {
  Dialog.destroy("burgEditor");
  const editorHtml = /* html */ `<div id="burgEditor" class="dialog" data-burg-id="${getSelectedId()}">
      <div id="burgBody" style="padding-bottom: 0.3em">
        <div style="display: flex; align-items: center">
          <svg data-tip="${sentences(t("Burg emblem"), t("Click to edit"))}" class="pointer" viewBox="0 0 200 200" width="13em" height="13em">
            <use id="burgEmblem"></use>
          </svg>
          <div style="display: grid; grid-auto-rows: minmax(2em, auto)">
            <div id="burgProvinceAndState" style="font-weight: bold; max-width: 16em"></div>
            <div>
              <div class="label">${t("Name")}:</div>
              <input
                id="burgName"
                data-tip="${t("Type to rename")}"
                autocorrect="off"
                spellcheck="false"
                style="width: 9em"
              />
              <span id="burgNameSpeak" data-tip="${sentences(t("Speak the name"), t("You can change voice and language in options"))}" class="speaker">🔊</span>
              <span
                id="burgNameReRandom"
                data-tip="${t("Generate random name")}"
                class="icon-globe pointer"
              ></span>
            </div>
            <div data-tip="${t("Select burg group. Groups defines burg icon, label size and style")}">
              <div class="label">${t("Group")}:</div>
              <select id="burgGroup" style="width: 9em"></select>
              <span id="burgGroupConfigure" data-tip="${t("Configure burg groups")}" class="icon-cog pointer"></span>
            </div>
            <div data-tip="${t("Select burg type. Type slightly affects emblem generation")}">
              <div class="label">${t("Type")}:</div>
              <select id="burgType" style="width: 9em">
                <option value="Generic">${t("Generic")}</option>
                <option value="River">${t("River")}</option>
                <option value="Lake">${t("Lake")}</option>
                <option value="Naval">${t("Naval")}</option>
                <option value="Nomadic">${t("Nomadic")}</option>
                <option value="Hunting">${t("Hunting")}</option>
                <option value="Highland">${t("Highland")}</option>
              </select>
            </div>
            <div data-tip="${t("Select dominant culture")}">
              <div class="label">${t("Culture")}:</div>
              <select id="burgCulture" style="width: 9em"></select>
              <span
                id="burgNameReCulture"
                data-tip="${t("Generate culture-specific name")}"
                class="icon-book pointer"
              ></span>
            </div>
            <div data-tip="${t("Set burg population")}">
              <div class="label">${t("Population")}:</div>
              <input id="burgPopulation" type="number" min="0" step="1" style="width: 9em" />
            </div>
            <div data-tip="${t("Burg average yearly temperature")}" style="display: flex; justify-content: space-between">
              <div>
                <div class="label">${t("Temperature")}:</div>
                <span id="burgTemperature"></span>
              </div>
              <div style="display: flex; gap: 0.5em">
                <i class="icon-info-circled" id="burgTemperatureLikeIn"></i>
                <i
                  id="burgTemperatureGraph"
                  data-tip="${t("Show temperature graph for the burg")}"
                  class="icon-chart-area pointer"
                ></i>
              </div>
            </div>
            <div data-tip="${t("Burg height above mean sea level")}">
              <div class="label">${t("Elevation")}:</div>
              <span id="burgElevation"></span> ${t("above sea level")}
            </div>
            <div data-tip="${t("Vertical offset relative to the cell's surface. Skyburgs float above, underdark holds tunnel below, underwater settlements lie on the seabed")}" style="display: flex; justify-content: space-between; gap: 0.5em;">
              <div>
                <div class="label">${t("Altitude")}:</div>
                <span id="burgAltitude"></span>
              </div>
              <span id="burgAltitudeEdit" data-tip="${t("Set the burg's vertical offset in feet")}" class="icon-pencil pointer" style="align-self: center"></span>
            </div>
            <div data-tip="${t("Realm: surface burgs belong to a land state; realm burgs hold zero surface territory and answer to their realm state")}">
              <div class="label">${t("Realm")}:</div>
              <span
                id="burgFlying"
                data-tip="${sentences(t("Skyburg: a floating settlement above the surface"), t("Click to toggle"))}"
                data-feature="flying"
                class="burgFeature icon-rocket"
              ></span>
              <span
                id="burgUnderdark"
                data-tip="${sentences(t("Underdark hold: a subterranean settlement below the surface"), t("Click to toggle"))}"
                data-feature="underdark"
                class="burgFeature icon-mountain"
              ></span>
              <span
                id="burgUnderwater"
                data-tip="${sentences(t("Underwater settlement: a benthic settlement in water cells"), t("Click to toggle"))}"
                data-feature="underwater"
                class="burgFeature icon-ship"
              ></span>
            </div>
            <div data-tip="${t("Cross-realm hubs and bridges: ground airfields for air lanes and mines and sinkholes for underdark tunnels")}">
              <div class="label">${t("Hub")}:</div>
              <span
                id="burgSkyPort"
                data-tip="${sentences(t("Skyport: a surface burg with an airfield, doubling as an air-route bridge"), t("Click to toggle"))}"
                data-feature="skyPort"
                class="burgFeature icon-button-air"
              ></span>
              <span
                id="burgUnderdarkGate"
                data-tip="${sentences(t("Underdark Gate: a surface burg with a mine or sinkhole, opening to the underdark tunnel network"), t("Click to toggle"))}"
                data-feature="underdarkGate"
                class="burgFeature icon-key"
              ></span>
            </div>
            <div id="burgPrecursorLine" data-tip="${t("Precursor infrastructure in this settlement")}" style="display: none">
              <div class="label">${t("Precursor")}:</div>
              <span
                id="burgSpaceGate"
                data-tip="${t("Great Space Gate: Precursor planar portal connecting major galactic domains")}"
                class="burgFeature pointer"
                style="font-size: 1.1em"
              >🌌</span>
              <span
                id="burgWaystationActive"
                data-tip="${t("Active Precursor Waystation: hyperlane conduit node powering regional lattice")}"
                class="burgFeature pointer"
                style="font-size: 1.1em"
              >🛰️</span>
              <span
                id="burgWaystationDerelict"
                data-tip="${t("Derelict Precursor Waystation: inert relic / planar hazard anomaly")}"
                class="burgFeature pointer"
                style="font-size: 1.1em"
              >⚠️</span>
            </div>
            <div>
              <div class="label">${t("Features", { context: "burg" })}:</div>
              <span
                id="burgCapital"
                data-tip="${sentences(t("Shows whether the burg is a state capital"), t("Click to toggle"))}"
                data-feature="capital"
                class="burgFeature icon-star"
              ></span>
              <span
                id="burgPort"
                data-tip="${sentences(t("Shows whether the burg is a port"), t("Click to toggle"))}"
                data-feature="port"
                class="burgFeature icon-anchor"
              ></span>
              <span
                id="burgCitadel"
                data-tip="${sentences(t("Shows whether the burg has a citadel (castle)"), t("Click to toggle"))}"
                data-feature="citadel"
                class="burgFeature icon-chess-rook"
                style="font-size: 1.1em"
              ></span>
              <span
                id="burgWalls"
                data-tip="${sentences(t("Shows whether the burg is walled"), t("Click to toggle"))}"
                data-feature="walls"
                class="burgFeature icon-fort-awesome"
              ></span>
              <span
                id="burgPlaza"
                data-tip="${sentences(t("Shows whether the burg is a trade center (market center)"), t("Click to toggle"))}"
                data-feature="plaza"
                class="burgFeature icon-store"
                style="font-size: 1em"
              ></span>
              <span
                id="burgTemple"
                data-tip="${sentences(t("Shows whether the burg is a religious center"), t("Click to toggle"))}"
                data-feature="temple"
                class="burgFeature icon-chess-bishop"
                style="font-size: 1.1em; margin-left: 3px"
              ></span>
              <span
                id="burgShanty"
                data-tip="${sentences(t("Shows whether the burg has a shanty town"), t("Click to toggle"))}"
                data-feature="shanty"
                class="burgFeature icon-campground"
                style="font-size: 1em"
              ></span>
            </div>
            <div id="burgDevelopmentLine" data-tip="${t("Development of the burg's land, 0–100, and its era: what it can make")}">
              <div class="label">${t("Development")}:</div>
              <span id="burgDevelopment"></span>
            </div>
            <div id="burgProsperityLine">
              <div class="label">${t("Prosperity")}:</div>
              <span id="burgProsperity"></span>
            </div>
            <div data-tip="${sentences(EconomyTerms.wealth(), EconomyTerms.product())}">
              <div class="label">${t("Wealth")}:</div>
              <span id="burgWealth"></span>
              <span id="burgWealthEconomy" data-tip="${EconomyTerms.open()}" class="icon-chart-bar pointer" style="margin-left: 0.3em"></span>
            </div>
            <div data-tip="${t("Burg tags (comma-separated)")}">
              <div class="label"><label for="burgTags">${t("Tags")}:</label></div>
              <input
                id="burgTags"
                placeholder="${t("Tags")}"
                autocorrect="off"
                spellcheck="false"
                style="width: 9em"
              />
            </div>
          </div>
        </div>
        <div
          id="burgLivingSection"
          data-tip="${t("OpenCiv city state managed by the Living World simulation")}"
          style="display: none; border-top: 1px solid #d4d4d4; margin-top: 0.35em; padding-top: 0.35em"
        >
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.4em">
            <strong>${t("Living World")}</strong>
            <button
              id="burgLivingOpen"
              type="button"
              data-tip="${t("Open this burg in the Living World inspector")}"
            >
              ${t("Inspect")}
            </button>
          </div>
          <div id="burgLiving" style="font-size: 0.95em; line-height: 1.45em"></div>
        </div>
        <div id="burgPreviewSection" data-tip="${t("Burg map preview: scroll to zoom, drag to pan")}" style="display: flex; flex-direction: column">
          <div style="display: flex; justify-content: space-between">
            <span>${t("Burg preview")}:</span>
            <div style="display: flex; gap: 0.5em">
              <i id="burgPreviewReset" data-tip="${t("Reset preview zoom")}" class="icon-ccw pointer"></i>
              <i id="burgLinkOpen" data-tip="${t("Open burg map in a new tab")}" class="icon-link-ext pointer"></i>
            </div>
          </div>
          <div
            id="burgPreviewObject"
            style="overflow: hidden; position: relative; touch-action: none; height: 320px; max-width: 60vw; max-height: 60vh"
          ></div>
        </div>
      </div>
      <div id="burgBottom">
        <button id="burgStyleShow" data-tip="${t("Show")}" class="icon-brush"></button>
        <div id="burgStyleSection" style="display: none">
          <button id="burgStyleHide" data-tip="${t("Hide")}" class="icon-brush"></button>
          <button
            id="burgEditLabelStyle"
            data-tip="${t("Edit label style for burg group in Style Editor")}"
            class="icon-font"
          ></button>
          <button
            id="burgEditGroupStyle"
            data-tip="${t("Edit icon and anchor style for the burg group in Style Editor")}"
            class="icon-dot-circled"
          ></button>
        </div>
        <button id="burgEditLabel" data-tip="${t("Edit this burg label")}" class="icon-font"></button>
        <button id="burgEditEmblem" data-tip="${t("Edit Emblem")}" class="icon-shield-alt"></button>
        <button id="burgSetPreviewLink" data-tip="${t("Set custom burg map URL")}" class="icon-map-o"></button>
        <button id="burgLocate" data-tip="${t("Zoom map and center view in the burg")}" class="icon-target"></button>
        <button
          id="burgEconomyButton"
          data-tip="${EconomyTerms.open()}"
          class="icon-chart-bar"
        ></button>
        <button
          id="burgRelocate"
          data-tip="${t("Relocate burg. Click on map to move the burg")}"
          class="icon-map-pin"
        ></button>
        ${noteButton("burglLegend", t("Edit free text notes (legend)"))}
        <button id="burgLock" class="icon-lock-open" data-lock-tip></button>
        <button
          id="burgRemove"
          data-tip="${t("Remove")}"
          data-shortcut="Delete"
          class="icon-trash fastDelete"
        ></button>
      </div>
    </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", editorHtml);

  ensureEl("burgLivingOpen").addEventListener(
    "click",
    () => void Controllers.LivingHud.inspect("burg", getSelectedId())
  );
  ensureEl("burgName").addEventListener("input", changeName);
  ensureEl("burgNameSpeak").addEventListener("click", () => speak(ensureEl<HTMLInputElement>("burgName").value));
  ensureEl("burgNameReRandom").addEventListener("click", generateNameRandom);
  ensureEl("burgGroup").addEventListener("change", changeGroup);
  ensureEl("burgGroupConfigure").addEventListener("click", editBurgGroups);
  ensureEl("burgType").addEventListener("change", changeType);
  ensureEl("burgCulture").addEventListener("change", changeCulture);
  ensureEl("burgNameReCulture").addEventListener("click", generateNameCulture);
  ensureEl("burgPopulation").addEventListener("change", changePopulation);
  ensureEl("burgWealthEconomy").addEventListener("click", showBurgEconomy);
  ensureEl("burgTags").addEventListener("change", changeTags);
  ensureEl("burgBody")
    .querySelectorAll<HTMLElement>(".burgFeature")
    .forEach(el => {
      // realm, hub, and precursor toggles are handled by their own handlers, not the generic building toggles
      if (
        [
          "burgFlying",
          "burgUnderdark",
          "burgUnderwater",
          "burgSkyPort",
          "burgUnderdarkGate",
          "burgSpaceGate",
          "burgWaystationActive",
          "burgWaystationDerelict"
        ].includes(el.id)
      )
        return;
      void el.addEventListener("click", toggleFeature);
    });
  ensureEl("burgSpaceGate").addEventListener("click", openBurgPrecursorNote);
  ensureEl("burgWaystationActive").addEventListener("click", openBurgPrecursorNote);
  ensureEl("burgWaystationDerelict").addEventListener("click", openBurgPrecursorNote);
  ensureEl("burgFlying").addEventListener("click", () => toggleRealm("sky"));
  ensureEl("burgUnderdark").addEventListener("click", () => toggleRealm("underdark"));
  ensureEl("burgUnderwater").addEventListener("click", () => toggleRealm("underwater"));
  ensureEl("burgSkyPort").addEventListener("click", toggleSkyPort);
  ensureEl("burgUnderdarkGate").addEventListener("click", toggleUnderdarkGate);
  ensureEl("burgAltitudeEdit").addEventListener("click", editAltitude);
  ensureEl("burgLinkOpen").addEventListener("click", openBurgLink);
  ensureEl("burgPreviewReset").addEventListener("click", resetPreviewZoom);
  ensureEl("burgPreviewObject").addEventListener("wheel", onPreviewWheel as EventListener, { passive: false });
  ensureEl("burgPreviewObject").addEventListener("dblclick", onPreviewDoubleClick as EventListener);
  ensureEl("burgPreviewObject").addEventListener("pointerdown", onPreviewPointerDown as EventListener);

  ensureEl("burgStyleShow").addEventListener("click", showStyleSection);
  ensureEl("burgStyleHide").addEventListener("click", hideStyleSection);
  ensureEl("burgEditLabelStyle").addEventListener("click", editGroupLabelStyle);
  ensureEl("burgEditGroupStyle").addEventListener("click", editGroupStyle);

  ensureEl("burgEmblem").addEventListener("click", openEmblemEdit);
  ensureEl("burgSetPreviewLink").addEventListener("click", setCustomPreview);
  ensureEl("burgEditEmblem").addEventListener("click", openEmblemEdit);
  ensureEl("burgLocate").addEventListener("click", zoomIntoBurg);
  ensureEl("burgEditLabel").addEventListener("click", editBurgLabel);
  ensureEl("burgRelocate").addEventListener("click", toggleRelocateBurg);
  ensureEl("burglLegend").addEventListener("click", editBurgLegend);
  ensureEl("burgLock").addEventListener("click", toggleBurgLockButton);
  ensureEl("burgRemove").addEventListener("click", removeSelectedBurg);
  ensureEl("burgTemperatureGraph").addEventListener("click", showTemperatureGraph);
  ensureEl("burgEconomyButton").addEventListener("click", showBurgEconomy);
}

function getSelectedId(): number {
  return selectedId ?? +selected!.attr("data-id");
}

function updateGroupsList(): void {
  const groupSelect = ensureEl<HTMLSelectElement>("burgGroup");
  groupSelect.options.length = 0; // remove all options
  for (const { name } of options.map.burgs.groups) {
    groupSelect.options.add(new Option(name, name));
  }
}

function updateBurgValues(): void {
  const id = getSelectedId();
  const b = pack.burgs[id];
  const province = pack.cells.province[b.cell];
  const provinceName = province ? `${pack.provinces[province].fullName}, ` : "";
  const stateName = pack.states[b.state!].fullName || pack.states[b.state!].name;
  ensureEl("burgProvinceAndState").textContent = provinceName + stateName;

  ensureEl<HTMLInputElement>("burgName").value = b.name!;
  ensureEl<HTMLSelectElement>("burgGroup").value = b.group!;
  ensureEl<HTMLSelectElement>("burgType").value = b.type || "Generic";
  ensureEl<HTMLInputElement>("burgPopulation").value = String(
    rn(b.population! * options.map.units.population.scale * options.map.units.population.urbanization.rate)
  );
  ensureEl("burgWealth").innerHTML = `🟡 ${rn(b.population! > 0 ? (b.product || 0) / b.population! : 0, 2)}`;
  ensureEl<HTMLInputElement>("burgTags").value = Tags.format(b.tags);

  // update list and select culture
  const cultureSelect = ensureEl<HTMLSelectElement>("burgCulture");
  cultureSelect.options.length = 0;
  const cultures = pack.cultures.filter(c => !c.removed);
  cultures.forEach(c => void cultureSelect.options.add(new Option(c.name, String(c.i), false, c.i === b.culture)));

  const temperature = grid.cells.temp[pack.cells.g[b.cell]];
  ensureEl("burgTemperature").innerHTML = convertTemperature(temperature);
  ensureEl("burgTemperatureLikeIn").dataset.tip = t("Average yearly temperature is like in {{place}}", {
    place: getTemperatureLikeness(temperature)
  });
  ensureEl("burgElevation").innerHTML = getHeight(pack.cells.h[b.cell]);
  ensureEl("burgAltitude").innerHTML = formatAltitude(b);

  ensureEl("burgCapital").classList.toggle("inactive", !b.capital);
  ensureEl("burgPort").classList.toggle("inactive", !b.port);
  ensureEl("burgCitadel").classList.toggle("inactive", !b.citadel);
  ensureEl("burgWalls").classList.toggle("inactive", !b.walls);
  ensureEl("burgPlaza").classList.toggle("inactive", !b.plaza);
  ensureEl("burgTemple").classList.toggle("inactive", !b.temple);
  ensureEl("burgShanty").classList.toggle("inactive", !b.shanty);
  const living = Prosperity.getBurg(b.i!);
  ensureEl("burgProsperity").innerHTML = living ? renderProsperity(living.prosperity) : "—";
  ensureEl("burgProsperityLine").dataset.tip = living ? prosperityTip(living.prosperity) : EconomyTerms.noData();
  const development = pack.cells.development?.[b.cell];
  ensureEl("burgDevelopment").textContent = development === undefined ? "—" : renderDevelopment(development);
  const isSurface = !b.flying && !b.underdark && !b.underwater;
  ensureEl("burgFlying").classList.toggle("inactive", !b.flying);
  ensureEl("burgUnderdark").classList.toggle("inactive", !b.underdark);
  ensureEl("burgUnderwater").classList.toggle("inactive", !b.underwater);
  // realm burgs are never surface: they cannot carry surface hubs
  ensureEl("burgSkyPort").classList.toggle("inactive", !b.skyPort);
  ensureEl("burgUnderdarkGate").classList.toggle("inactive", !b.underdarkGate);
  ensureEl("burgSkyPort").classList.toggle("disabled", !isSurface);
  ensureEl("burgUnderdarkGate").classList.toggle("disabled", !isSurface);

  const isGate = Boolean(b.spaceGate);
  const isWsActive = b.waystation === 1;
  const isWsDerelict = b.waystation === 2;
  ensureEl("burgSpaceGate").classList.toggle("inactive", !isGate);
  ensureEl("burgWaystationActive").classList.toggle("inactive", !isWsActive);
  ensureEl("burgWaystationDerelict").classList.toggle("inactive", !isWsDerelict);
  ensureEl("burgPrecursorLine").style.display =
    isGate || isWsActive || isWsDerelict || options.map.astral ? "block" : "none";

  updateBurgLiving(id);

  updateBurgLockIcon();

  // set emblem image
  const coaID = `burgCOA${id}`;
  EmblemRenderer.trigger(coaID, b.coa);
  ensureEl("burgEmblem").setAttribute("href", `#${coaID}`);

  updateBurgPreview(b);
}

/** Summarise the OpenCiv city state (if the Living World simulates this burg). */
function updateBurgLiving(burgId: number): void {
  const section = ensureEl("burgLivingSection");
  const bSim = pack.history?.living?.burgs?.[burgId];
  if (!bSim) {
    section.style.display = "none";
    ensureEl("burgLiving").innerHTML = "";
    return;
  }

  section.style.display = "block";
  const yields = bSim.cityYields;
  const yieldLine = yields
    ? `🌾 ${Math.round(yields.food)} · 🔨 ${Math.round(yields.production)} · 🪙 ${Math.round(
        yields.gold
      )} · 🔬 ${Math.round(yields.science)} · 🎭 ${Math.round(yields.culture)} · ✨ ${Math.round(yields.faith)}`
    : "";
  const hpLine =
    bSim.hp !== undefined && bSim.maxHp !== undefined ? ` · HP ${Math.round(bSim.hp)}/${Math.round(bSim.maxHp)}` : "";
  const citizensLine = `${bSim.citizens ?? bSim.baseTier} citizens${yieldLine ? ` · ${yieldLine}` : ""}${hpLine}`;

  const religionId = majorityReligion(bSim.religionPressure, bSim.citizens ?? 1);
  const religion = religionId ? pack.religions?.[religionId]?.name : undefined;
  const religionLine = religion ? `<div>${t("Faith")}: ${escapeHtml(religion)}</div>` : "";

  const item = bSim.productionQueue?.[0];
  const itemDef = item
    ? item.kind === "unit"
      ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
      : CIV_BUILDING_BY_ID[item.id]
    : undefined;
  const itemProgress = item ? Math.round(bSim.productionProgress?.[`${item.kind}:${item.id}`] ?? 0) : 0;
  const queueLine = item
    ? `<div>${t("Production")}: ${escapeHtml(itemDef?.name ?? item.id)} · ${itemProgress} / ${Math.round(
        itemDef?.cost ?? 0
      )}</div>`
    : "";

  const outposts = Factions.atBurg(getSelectedId());
  const outpostsLine = outposts.length
    ? `<div style="margin-top: 2px;">${t("Outposts")}:</div>${outposts
        .map(f => {
          const isHq = f.hq.burgId === selectedId;
          const op = f.outposts.find(o => o.burgId === selectedId);
          const sim = isHq ? f.hq.sim : op?.sim;
          const yields = sim?.cityYields;
          const yieldText = yields
            ? `🌾 ${Math.round(yields.food)} · 🔨 ${Math.round(yields.production)} · 🪙 ${Math.round(yields.gold)} · 🔬 ${Math.round(yields.science)} · 🎭 ${Math.round(yields.culture)} · ✨ ${Math.round(yields.faith)}`
            : "—";
          const queue = (sim?.productionQueue ?? [])
            .map(item => {
              const def =
                item.kind === "unit"
                  ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
                  : CIV_BUILDING_BY_ID[item.id];
              const progress = Math.round(sim?.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
              return `${def?.name ?? item.id} ${progress}/${Math.round(def?.cost ?? 0)}`;
            })
            .join(", ");
          const tier = isHq ? null : op?.tier;
          return `<div style="color: ${f.color || "#38bdf8"}; font-weight: 500;">${escapeHtml(f.name)}${tier !== null && tier !== undefined ? ` (T${tier})` : ""}</div><div style="font-size: 0.85em; opacity: 0.85;">${isHq ? "HQ" : "Outpost"} · ${sim?.citizens ?? 0} citizens · ${sim?.workedCells?.length ?? 0} worked cells · ${escapeHtml(yieldText)}${queue ? ` · Queue: ${escapeHtml(queue)}` : ""}</div>`;
        })
        .join("")}`
    : "";

  ensureEl("burgLiving").innerHTML = `<div>${escapeHtml(citizensLine)}</div>${religionLine}${queueLine}${outpostsLine}`;
}

function changeName(): void {
  const value = ensureEl<HTMLInputElement>("burgName").value;
  if (!value.trim()) return;
  Burgs.rename(getSelectedId(), value);
  Layers.draw("labels");
}

function generateNameRandom(): void {
  const base = Names.nameBases[rand(Names.nameBases.length - 1)].id;
  ensureEl<HTMLInputElement>("burgName").value = Names.getBase(base);
  changeName();
}

function changeGroup(this: HTMLSelectElement): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  Burgs.changeGroup(burg, this.value);
  Layers.draw("burgIcons", "labels");
}

function changeType(this: HTMLSelectElement): void {
  const id = getSelectedId();
  Burgs.setType(id, this.value);
}

function changeCulture(this: HTMLSelectElement): void {
  Burgs.setCulture(getSelectedId(), +this.value);
}

function generateNameCulture(): void {
  const id = getSelectedId();
  const culture = pack.burgs[id].culture!;
  ensureEl<HTMLInputElement>("burgName").value = Names.getCulture(culture);
  changeName();
}

function changePopulation(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];

  const people = ensureEl<HTMLInputElement>("burgPopulation").valueAsNumber;
  if (Number.isFinite(people) && people >= 0) Burgs.setPopulation(id, people);
  updateBurgPreview(burg);
}

function changeTags(): void {
  const burg = pack.burgs[getSelectedId()];
  if (!burg) return;
  const input = ensureEl<HTMLInputElement>("burgTags");
  Tags.set(burg, input.value);
  input.value = Tags.format(burg.tags);
}

function toggleFeature(this: HTMLElement): void {
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];

  const feature = this.dataset.feature!;
  const value = Number(this.classList.contains("inactive"));

  if (feature === "plaza" && !value) {
    const market = pack.markets?.find(m => m.centerBurgId === burgId);
    if (market) {
      confirmRemoveMarket(market);
      return;
    }
  }

  if (feature === "port") togglePort(burgId);
  else if (feature === "capital") toggleCapital(burgId);
  else Burgs.setBuilding(burgId, feature, Boolean(value));

  this.classList.toggle("inactive", !burg[feature as keyof Burg]);

  updateBurgPreview(burg);
}

function confirmRemoveMarket(market: Market): void {
  Dialog.confirm({
    title: t("Remove"),
    message: `${t("This burg is the center of the market “{{market}}”. Remove the market?", {
      market: Markets.getName(market)
    })}<br>${t("This action cannot be reverted")}`,
    confirm: t("Remove"),
    onConfirm: () => {
      Markets.removeMarket(market.i);
      closeEntityDialogs();
      Layers.draw("markets", "goods", "trade");
      updateBurgValues();
    }
  });
}

/** Toggle between a realm and the surface: clicking the active realm resets to surface */
function toggleRealm(realm: "sky" | "underdark" | "underwater"): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  const current = burg.flying ? "sky" : burg.underdark ? "underdark" : burg.underwater ? "underwater" : "surface";
  const next = current === realm ? "surface" : realm;
  if (tryEdit(() => Burgs.setRealm(id, next))) {
    Layers.draw("burgIcons", "labels");
    updateBurgValues();
  }
}

function toggleSkyPort(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  if (tryEdit(() => Burgs.setSkyPort(id, !burg.skyPort))) {
    Layers.draw("burgIcons", "labels");
    updateBurgValues();
  }
}

function toggleUnderdarkGate(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  if (tryEdit(() => Burgs.setUnderdarkGate(id, !burg.underdarkGate))) {
    Layers.draw("burgIcons", "labels");
    updateBurgValues();
  }
}

function editAltitude(): void {
  const id = getSelectedId();
  Dialog.prompt(
    t(
      "Vertical offset in feet relative to the cell's surface. Positive floats above, negative sinks below. Leave empty to clear"
    ),
    { default: String(pack.burgs[id].altitude ?? ""), required: false },
    value => {
      try {
        Burgs.setAltitude(id, value === "" ? null : Number(value));
      } catch (error) {
        tip((error as Error).message, false, "error");
        return;
      }
      updateBurgValues();
    }
  );
}

function togglePort(burgId: number): void {
  if (tryEdit(() => Burgs.setPort(burgId, !pack.burgs[burgId].port))) Layers.draw("burgIcons");
}

function toggleCapital(burgId: number): void {
  if (pack.burgs[burgId].capital) {
    tip(t("To change capital please assign a capital status to another burg of this state"), false, "error");
    return;
  }
  if (tryEdit(() => Burgs.setCapital(burgId))) Layers.draw("burgIcons", "labels");
}

/** Run a model edit, showing its validation error as a tip; returns whether it succeeded */
function tryEdit(edit: () => void): boolean {
  try {
    edit();
    return true;
  } catch (error) {
    tip(errorText(error), false, "error");
    return false;
  }
}

function toggleBurgLockButton(): void {
  const id = getSelectedId();
  Burgs.setLocked(id, !pack.burgs[id].lock);

  updateBurgLockIcon();
}

function updateBurgLockIcon(): void {
  const id = getSelectedId();
  const b = pack.burgs[id];
  if (b.lock) {
    ensureEl("burgLock").classList.remove("icon-lock-open");
    ensureEl("burgLock").classList.add("icon-lock");
  } else {
    ensureEl("burgLock").classList.remove("icon-lock");
    ensureEl("burgLock").classList.add("icon-lock-open");
  }
}

function showStyleSection(): void {
  document.querySelectorAll<HTMLElement>("#burgBottom > button").forEach(el => {
    el.style.display = "none";
  });
  ensureEl("burgStyleSection").style.display = "inline-block";
}

function hideStyleSection(): void {
  document.querySelectorAll<HTMLElement>("#burgBottom > button").forEach(el => {
    el.style.display = "inline-block";
  });
  ensureEl("burgStyleSection").style.display = "none";
}

// the style editor selects groups by bare name, never by the DOM id of the rendered node
function editGroupLabelStyle(): void {
  const burg = pack.burgs[getSelectedId()];
  Dialog.closeAll(".stable");
  void Controllers.StyleEditor.open("labels", burg.label?.group || burg.group);
}

function editBurgLabel(): void {
  const id = getSelectedId();
  Dialog.close("burgEditor");
  Controllers.LabelsEditor.open("burg", id);
}

// the group form carries both the icons and the anchors parts
function editGroupStyle(): void {
  const burg = pack.burgs[getSelectedId()];
  Dialog.closeAll(".stable");
  void Controllers.StyleEditor.open("burgIcons", burg.group);
}

function getPreviewViewport(): { width: number; height: number } {
  const container = ensureEl("burgPreviewObject");
  return { width: container.clientWidth, height: container.clientHeight };
}

// mid-gesture the frame is scaled with a cheap transform; the layout size is committed
// only once the gesture settles, as generators re-render asynchronously on resize.
// canvas-backed generators (watabou) never commit at all: resizing clears their canvas
// to transparent until the next redraw, so their layout is locked at a supersampled
// size on load and zoom stays a pure transform of it
function applyPreviewTransform(): void {
  const container = ensureEl("burgPreviewObject");
  const frame = container.querySelector<HTMLIFrameElement>("iframe");
  if (!frame) return;
  const { k, x, y } = previewTransform;
  frame.style.transformOrigin = "0 0";
  frame.style.transform = `translate(${x}px, ${y}px) scale(${k / previewCommittedK})`;
  frame.style.left = "0";
  frame.style.top = "0";
  container.style.cursor = k > 1 ? "grab" : "default";
  clearTimeout(previewSettleTimer);
  if (!previewLayoutLocked) previewSettleTimer = window.setTimeout(commitPreviewTransform, 200);
}

function commitPreviewTransform(): void {
  if (previewLayoutLocked) return;
  const frame = ensureEl("burgPreviewObject").querySelector<HTMLIFrameElement>("iframe");
  if (!frame) return;
  const { k, x, y } = previewTransform;
  previewCommittedK = k;
  frame.style.width = `${k * 100}%`;
  frame.style.height = `${k * 100}%`;
  frame.style.transform = "none";
  frame.style.left = `${x}px`;
  frame.style.top = `${y}px`;
}

function resetPreviewZoom(): void {
  previewTransform = { ...PAN_ZOOM_IDENTITY };
  clearTimeout(previewSettleTimer);
  if (previewLayoutLocked) applyPreviewTransform();
  else commitPreviewTransform();
  ensureEl("burgPreviewObject").style.cursor = "default";
}

function previewPointFromEvent(event: MouseEvent): { x: number; y: number } {
  const rect = ensureEl("burgPreviewObject").getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onPreviewWheel(event: WheelEvent): void {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002));
  previewTransform = zoomAt(
    previewTransform,
    previewPointFromEvent(event),
    factor,
    getPreviewViewport(),
    previewMaxZoom
  );
  applyPreviewTransform();
}

function onPreviewDoubleClick(event: MouseEvent): void {
  previewTransform = zoomAt(previewTransform, previewPointFromEvent(event), 2, getPreviewViewport(), previewMaxZoom);
  applyPreviewTransform();
}

function onPreviewPointerDown(event: PointerEvent): void {
  if (previewTransform.k <= 1) return;
  event.preventDefault();
  const container = ensureEl("burgPreviewObject");
  container.setPointerCapture(event.pointerId);
  container.style.cursor = "grabbing";
  let last = { x: event.clientX, y: event.clientY };

  const move = (e: Event) => {
    const p = e as PointerEvent;
    previewTransform = panBy(previewTransform, p.clientX - last.x, p.clientY - last.y, getPreviewViewport());
    last = { x: p.clientX, y: p.clientY };
    applyPreviewTransform();
  };
  const up = () => {
    container.removeEventListener("pointermove", move);
    container.removeEventListener("pointerup", up);
    container.removeEventListener("pointercancel", up);
    container.style.cursor = "grab";
  };
  container.addEventListener("pointermove", move);
  container.addEventListener("pointerup", up);
  container.addEventListener("pointercancel", up);
}

let glMaxTextureSize = 0;
function getGlMaxTextureSize(): number {
  if (!glMaxTextureSize) {
    const gl = document.createElement("canvas").getContext("webgl");
    glMaxTextureSize = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096;
  }
  return glMaxTextureSize;
}

// half the reported limit: the generator's internal render textures pad past the raw canvas size
function getPreviewTextureBudgetK(): number {
  const { width, height } = getPreviewViewport();
  const paneMax = Math.max(width, height, 1);
  return getGlMaxTextureSize() / 2 / (devicePixelRatio * paneMax);
}

function updateBurgPreview(burg: Burg): void {
  const preview = Burgs.getPreview(burg).preview;
  if (!preview) {
    ensureEl("burgPreviewSection").style.display = "none";
    return;
  }

  ensureEl("burgPreviewSection").style.display = "block";

  // recreate the element to force reload (Chrome bug)
  const container = ensureEl("burgPreviewObject");
  container.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.style.position = "absolute";
  frame.style.border = "none";
  frame.style.pointerEvents = "none";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = preview;
  container.insertBefore(frame, null);

  previewLayoutLocked = preview.includes("watabou.github.io");
  if (previewLayoutLocked) {
    const supersample = Math.max(1, Math.min(4, getPreviewTextureBudgetK()));
    previewCommittedK = supersample;
    frame.style.width = `${supersample * 100}%`;
    frame.style.height = `${supersample * 100}%`;
    previewMaxZoom = Math.min(MAX_ZOOM, supersample * 2.5);
  } else {
    previewCommittedK = 1;
    previewMaxZoom = MAX_ZOOM;
  }
  resetPreviewZoom();
}

function openBurgLink(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  const link = Burgs.getPreview(burg).link;
  if (link) openURL(link);
}

function setCustomPreview(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];

  Dialog.prompt(
    t(
      "Provide custom URL to the burg map. It can be a link to a generator or just an image. Leave empty to use the default map preview"
    ),
    { default: Burgs.getPreview(burg).link || "", required: false },
    link => {
      try {
        Burgs.setLink(id, String(link ?? ""));
      } catch (error) {
        tip((error as Error).message, false, "error");
      }
      updateBurgPreview(burg);
    }
  );
}

function openEmblemEdit(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  void Controllers.EmblemsEditor.open("burg", `burgCOA${id}`, burg);
}

function zoomIntoBurg(): void {
  const id = getSelectedId();
  const burg = pack.burgs[id];
  zoomTo(burg.x, burg.y, 8, 2000);
}

let isCellsLayerForced = false; // the cells layer is turned on for the relocation mode

function toggleRelocateBurg(): void {
  ensureEl("burgRelocate").classList.toggle("pressed");
  if (ensureEl("burgRelocate").classList.contains("pressed")) {
    select<SVGGElement, unknown>("#viewbox").style("cursor", "crosshair").on("click", relocateBurgOnClick);
    tip(t("Click on map to relocate burg. Hold Shift for continuous move"), true);
    if (!Layers.isOn("cells")) {
      Layers.show("cells");
      isCellsLayerForced = true;
    }
  } else {
    clearMainTip();
    applyDefaultViewboxEvents();
    if (isCellsLayerForced) {
      Layers.hide("cells");
      isCellsLayerForced = false;
    }
  }
}

function relocateBurgOnClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, this);
  if (!tryEdit(() => Burgs.move(getSelectedId(), x, y))) return;
  Layers.draw("burgIcons", "labels", "routes", "goods", "markets", "trade");
  if (event.shiftKey === false) toggleRelocateBurg();
}

function editBurgLegend(): void {
  void Controllers.NotesEditor.open({ type: "burg", id: getSelectedId() });
}

function openBurgPrecursorNote(): void {
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];
  if (!burg) return;
  const marker = pack.markers?.find(
    m => m.cell === burg.cell || (Math.abs(m.x - burg.x) < 2 && Math.abs(m.y - burg.y) < 2)
  );
  if (marker) {
    void Controllers.NotesEditor.open({ type: "marker", id: marker.i });
  } else {
    void Controllers.NotesEditor.open({ type: "burg", id: burgId });
  }
}

function showTemperatureGraph(): void {
  const id = getSelectedId();
  void Controllers.TemperatureGraph.open(id);
}

function showBurgEconomy(): void {
  const id = getSelectedId();
  Controllers.BurgEconomyOverview.open(id);
}

function removeSelectedBurg(): void {
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];

  if (burg.capital) {
    Dialog.message({
      message: /* html */ `${sentences(t("You cannot remove the capital"), t("You must change the state capital first"))}`,
      title: t("Remove")
    });
  } else if (pack.markets?.some(m => m.centerBurgId === burgId)) {
    Dialog.message({
      message: /* html */ `${t("You cannot remove a market center burg. Please remove the market first")}`,
      title: t("Remove")
    });
  } else {
    Dialog.confirm({
      title: t("Remove"),
      message: `${t("Are you sure you want to remove the burg?")}<br>${t("This action cannot be reverted")}`,
      confirm: t("Remove"),
      onConfirm: () => {
        Burgs.remove(burgId);
        closeEntityDialogs();
        removeEmblem("burg", burgId);
        Layers.draw("burgIcons", "labels", "goods", "trade");
        Dialog.close("burgEditor");
      }
    });
  }
}

function editBurgGroups(): void {
  Controllers.BurgGroupEditor.open();
}

function closeBurgEditor(): void {
  clearTimeout(previewSettleTimer);
  if (ensureEl("burgRelocate").classList.contains("pressed")) toggleRelocateBurg();
  selected = null;
  ensureEl("burgPreviewObject").replaceChildren();
  Dialog.destroy("burgEditor");
}

/** Formats the burg's vertical offset in feet, as +250 ft above surface / -1,200 ft below ground / -400 ft below sea level */
function formatAltitude(b: Burg): string {
  const altitude = b.altitude;
  if (altitude === undefined || altitude === 0) return t("at surface level");
  const feet = Math.abs(altitude);
  const rounded = Math.round(feet).toLocaleString("en-US");
  if (b.underwater) return t("{{n}} ft below sea level", { n: rounded });
  if (b.underdark) return t("{{n}} ft below ground", { n: rounded });
  return t("+{{n}} ft above surface", { n: rounded });
}

export const BurgEditor = { open };
