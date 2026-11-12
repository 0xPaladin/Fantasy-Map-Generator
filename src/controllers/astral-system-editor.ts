// The System Editor: a burg read as a star system, edited in the astral vocabulary. Every write goes
// through the Burgs model, so the world stays one world; the spectral class stays a readout derived
// from population. The generated star/planet readout is a pure calculation opened with the dialog —
// see docs/plans/astral-system-dialog.md and docs/plans/astral-system-details.md
import { select } from "d3";
import { Controllers } from "@/controllers";
import { ASTRAL_WORLD_TYPE_KEYS, type AstralWorldType } from "@/data/astral-goods";
import { Goods } from "@/model/economy/goods-generator";
import { Markets } from "@/model/economy/markets-generator";
import { Production } from "@/model/economy/production-generator";
import {
  isCoreOrCapital,
  peopleOf,
  setWorldTypeFor,
  starClassFor,
  tradeGoodsFor,
  worldTypeFor
} from "@/model/physical/astral-naming";
import { type SystemDetails, systemDetailsFor } from "@/model/physical/astral-system";
import { starTypeData } from "@/model/physical/astral-system/astrophysics";
import { Burgs } from "@/model/political/burgs-generator";
import { Names } from "@/model/society/names-generator";
import { extractSystemOriginContext } from "@/model/system/planetary-polity";
import { SolarSystem } from "@/model/system/solar-system";
import { type StarClassId, starShape, writeAttrs } from "@/renderers/astral/system-markers";
import { removeEmblem } from "@/renderers/draw-emblems";
import { Layers } from "@/renderers/layers";
import { enterAstralPlanetView, enterAstralSystemView, isAstralView } from "@/renderers/view-mode";
import type { Market } from "@/types/economy";
import type { StylesData } from "@/types/styles";
import { Dialog } from "@/ui/dialog/dialog";
import { noteButton } from "@/ui/dialog/dialog-helpers";
import { applyDefaultViewboxEvents } from "@/ui/map/viewbox-events";
import { zoomTo } from "@/ui/map/zoom";
import { clearMainTip, tip } from "@/ui/tooltips";
import { ensureEl, escapeHtml, findEl, getPointer, rand, rn, speak } from "@/utils";
import { errorText } from "@/utils/string-utils";

type ClassStyle = StylesData["systems"]["groups"][StarClassId];
type Feature = "capital" | "port" | "citadel" | "walls" | "plaza" | "temple" | "shanty";
const FEATURES: Feature[] = ["capital", "port", "citadel", "walls", "plaza", "temple", "shanty"];

let selectedId: number | null = null;
let isCellsLayerForced = false; // the cells layer is turned on for the relocation mode

function open(id: number | string): void {
  if (options.app.mode) return;
  const burg = pack.burgs[+id];
  if (!burg || burg.removed) return;
  Dialog.closeAll(".stable");
  Layers.show("systems", "labels");

  selectedId = +id;
  renderDialog();
  ensureEl("astralSystemEditor").dataset.entity = `burg:${selectedId}`;
  updateSystemValues();

  Dialog.open("astralSystemEditor", {
    title: "Edit System",
    resizable: false,
    onClose: closeSystemEditor,
    position: { my: "left top", at: "left+10 top+10", of: "svg" }
  });
}

function renderDialog(): void {
  Dialog.destroy("astralSystemEditor");
  const editorHtml = /* html */ `<div id="astralSystemEditor" class="dialog">
      <style>
        #astralSystemEditor {
          width: 50em;
        }
        #astralSystemEditor .label {
          display: inline;
          margin-right: 0.25em;
          opacity: 0.85;
        }
        #astralSystemEditor table {
          width: 100%;
          border-collapse: collapse;
        }
        #astralSystemEditor tbody tr:nth-child(even) td {
          background: rgba(0, 0, 0, 0.045);
        }
        #astralSystemEditor .systemPlanetView {
          background: none;
          border: 0;
          cursor: pointer;
          padding: 0 0.25em;
          color: #333;
        }
        #astralSystemEditor .systemPlanetView:hover {
          color: #000;
        }
      </style>
      <div id="astralSystemBody" style="padding-bottom: 0.3em">
        <div style="display: flex; align-items: center; gap: 0.8em">
          <svg
            id="systemStar"
            data-tip="The system's star, drawn as the chart draws it"
            viewBox="0 0 140 140"
            style="width: 4.8em; height: 4.8em; flex-shrink: 0"
          >
            <g id="systemStarShape" font-size="36" transform="translate(70 70)"></g>
          </svg>
          <div style="display: flex; flex-direction: column; gap: 0.35em; flex: 1; min-width: 0">
            <div id="systemSectorAndEmpire" style="font-weight: bold; font-size: 1.05em"></div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.8em">
              <span data-tip="The star's class, from how many people live in the system" style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">Class:</span>
                <span id="systemClass" style="font-weight: 500"></span>
              </span>
              <span style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">Name:</span>
                <input id="systemName" data-tip="Type to rename the system" autocorrect="off" spellcheck="false" style="width: 7.5em" />
                <span id="systemNameSpeak" data-tip="Speak the name. You can change voice and language in options" class="speaker pointer">🔊</span>
                <span id="systemNameReRandom" data-tip="Generate random name for the system" class="icon-globe pointer"></span>
                <span id="systemNameReCulture" data-tip="Generate people-specific name for the system" class="icon-book pointer"></span>
              </span>
              <span data-tip="The people that holds the system" style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">People:</span>
                <select id="systemPeople" style="width: 7.5em"></select>
              </span>
              <span data-tip="Set system population. The star's class follows it" style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">Population:</span>
                <input id="systemPopulation" type="number" min="0" step="1" style="width: 4.8em" />
              </span>
            </div>
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.8em">
              <span data-tip="System World Type and trade specialization" style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">World:</span>
                <select id="systemWorldType" style="width: 7.5em"></select>
              </span>
              <span id="systemTradeGoodsLine" data-tip="Primary commodities traded in this system" style="display: inline-flex; align-items: center; gap: 0.2em">
                <span class="label">Trade:</span>
                <span id="systemTradeGoods"></span>
              </span>
              <span data-tip="The installations that make the system what it is. Click one to toggle" style="display: inline-flex; align-items: center; gap: 0.25em">
                <span class="label">Installations:</span>
                <span id="systemCapital" data-tip="Empire capital. Click to toggle" data-feature="capital" class="burgFeature icon-star"></span>
                <span id="systemPort" data-tip="Shipyard. Click to toggle" data-feature="port" class="burgFeature icon-anchor"></span>
                <span id="systemCitadel" data-tip="Bastion. Click to toggle" data-feature="citadel" class="burgFeature icon-chess-rook" style="font-size: 1.1em"></span>
                <span id="systemWalls" data-tip="Shielding. Click to toggle" data-feature="walls" class="burgFeature icon-fort-awesome"></span>
                <span id="systemPlaza" data-tip="Civic core. Click to toggle" data-feature="plaza" class="burgFeature icon-store"></span>
                <span id="systemTemple" data-tip="Shrine. Click to toggle" data-feature="temple" class="burgFeature icon-chess-bishop" style="font-size: 1.1em; margin-left: 3px"></span>
                <span id="systemShanty" data-tip="Drift. Click to toggle" data-feature="shanty" class="burgFeature icon-campground"></span>
              </span>
              <span id="systemPrecursorLine" data-tip="Precursor infrastructure in this star system" style="display: none; align-items: center; gap: 0.25em">
                <span class="label">Precursor:</span>
                <span id="systemSpaceGate" data-tip="Great Space Gate: instantaneous Precursor planar conduit connecting major galactic domains" class="burgFeature pointer" style="font-size: 1.1em">🌌</span>
                <span id="systemWaystationActive" data-tip="Active Precursor Waystation: lattice node powering regional hyperlane conduit network" class="burgFeature pointer" style="font-size: 1.1em">🛰️</span>
                <span id="systemWaystationDerelict" data-tip="Derelict Precursor Waystation: inactive relic / planar hazard anomaly" class="burgFeature pointer" style="font-size: 1.1em">⚠️</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div
        id="astralSystemReadout"
        style="margin-top: 0.3em; padding: 0.35em 0.4em 0.15em; border-top: 1px solid rgba(0, 0, 0, 0.08); font-size: 0.9em"
      >
        <div style="font-weight: bold">Star</div>
        <table style="border-collapse: collapse">
          <thead>
            <tr style="opacity: 0.75; border-bottom: 1px solid rgba(0, 0, 0, 0.08)">
              <th style="text-align: left">Star</th>
              <th style="text-align: left">Class</th>
              <th style="text-align: right">Mass (solar)</th>
              <th style="text-align: right">Lum (solar)</th>
              <th style="text-align: right">Separation (AU)</th>
              <th style="text-align: right">Period (yr)</th>
            </tr>
          </thead>
          <tbody id="systemStarsBody"></tbody>
        </table>
        <div id="systemReadoutTotals" style="margin-top: 0.25em; opacity: 0.8"></div>
        <div style="font-weight: bold; margin-top: 0.4em">Planets</div>
        <div style="overflow: auto; max-height: 11em">
          <table style="border-collapse: collapse; white-space: nowrap">
            <thead>
              <tr style="opacity: 0.75; border-bottom: 1px solid rgba(0, 0, 0, 0.08)">
                <th style="text-align: left">Planet</th>
                <th style="text-align: right">Map</th>
                <th style="text-align: left">Type</th>
                <th style="text-align: right">Orbit (AU)</th>
                <th style="text-align: right">Radius (Earth=1)</th>
                <th style="text-align: right">Gravity (g)</th>
                <th style="text-align: left">Temp</th>
                <th style="text-align: left">Atmosphere</th>
                <th style="text-align: right">Water</th>
                <th style="text-align: left">Habitability</th>
                <th style="text-align: right">Moons</th>
                <th style="text-align: right">Map</th>
              </tr>
            </thead>
            <tbody id="systemPlanetsBody"></tbody>
          </table>
        </div>
      </div>
      <div id="astralSystemBottom">
        <button id="systemStyleShow" data-tip="Show style edit section" class="icon-brush"></button>
        <div id="systemStyleSection" style="display: none">
          <button id="systemStyleHide" data-tip="Hide style edit section" class="icon-brush"></button>
          <button id="systemEditLabelStyle" data-tip="Edit label style for the system's group in Style Editor" class="icon-font"></button>
          <button id="systemEditClassStyle" data-tip="Edit the star style for this class in Style Editor" class="icon-star"></button>
        </div>
        <button id="systemEditLabel" data-tip="Edit this system label" class="icon-font"></button>
        <button id="systemEditEmblem" data-tip="Edit emblem" class="icon-shield-alt"></button>
        <button id="systemLocate" data-tip="Zoom map and center view in the system" class="icon-target"></button>
        <button id="systemProductionOverview" data-tip="Show production overview for this system" class="icon-chart-bar"></button>
        <button id="systemView3d" data-tip="Open this system in the 3D orrery view">3D System</button>
        <button id="systemRelocate" data-tip="Relocate system. Click on map to move the system" class="icon-map-pin"></button>
        ${noteButton("systemLegend", "this system")}
        <button id="systemLock" class="icon-lock-open"></button>
        <button id="systemRemove" data-tip="Remove non-capital system" data-shortcut="Delete" class="icon-trash fastDelete"></button>
      </div>
    </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", editorHtml);

  ensureEl("systemName").addEventListener("input", changeName);
  ensureEl("systemNameSpeak").addEventListener("click", () => speak(ensureEl<HTMLInputElement>("systemName").value));
  ensureEl("systemNameReRandom").addEventListener("click", generateNameRandom);
  ensureEl("systemNameReCulture").addEventListener("click", generateNameCulture);
  ensureEl("systemPeople").addEventListener("change", changePeople);
  ensureEl("systemPopulation").addEventListener("change", changePopulation);
  ensureEl("systemWorldType").addEventListener("change", changeWorldType);
  ensureEl("astralSystemBody")
    .querySelectorAll<HTMLElement>(".burgFeature")
    .forEach(el => void el.addEventListener("click", toggleFeature));
  ensureEl("systemSpaceGate").addEventListener("click", openPrecursorNote);
  ensureEl("systemWaystationActive").addEventListener("click", openPrecursorNote);
  ensureEl("systemWaystationDerelict").addEventListener("click", openPrecursorNote);
  ensureEl("systemStyleShow").addEventListener("click", showStyleSection);
  ensureEl("systemStyleHide").addEventListener("click", hideStyleSection);
  ensureEl("systemEditLabelStyle").addEventListener("click", editLabelStyle);
  ensureEl("systemEditClassStyle").addEventListener("click", editClassStyle);
  ensureEl("systemEditLabel").addEventListener("click", editLabel);
  ensureEl("systemEditEmblem").addEventListener("click", editEmblem);
  ensureEl("systemLocate").addEventListener("click", zoomIntoSystem);
  ensureEl("systemProductionOverview").addEventListener("click", showProductionOverview);
  ensureEl("systemView3d").addEventListener("click", openSystemOrrery);
  ensureEl("systemPlanetsBody").addEventListener("click", viewPlanetInFmg);
  ensureEl("systemRelocate").addEventListener("click", toggleRelocateSystem);
  ensureEl("systemLegend").addEventListener("click", editNotes);
  ensureEl("systemLock").addEventListener("click", toggleLock);
  ensureEl("systemRemove").addEventListener("click", removeSelectedSystem);
}

function getSelectedId(): number {
  return selectedId as number;
}

function featureId(feature: Feature): string {
  return `system${feature[0].toUpperCase()}${feature.slice(1)}`;
}

function updateSystemValues(): void {
  const burg = pack.burgs[getSelectedId()];

  const province = pack.cells.province[burg.cell];
  const provinceName = province ? `${pack.provinces[province].fullName}, ` : "";
  const state = pack.states[burg.state ?? 0];
  ensureEl("systemSectorAndEmpire").innerHTML =
    `${escapeHtml(provinceName)}${escapeHtml(state.fullName || state.name)}`;

  ensureEl<HTMLInputElement>("systemName").value = burg.name ?? "";

  const peopleSelect = ensureEl<HTMLSelectElement>("systemPeople");
  peopleSelect.options.length = 0;
  const cultures = pack.cultures.filter(c => !c.removed);
  cultures.forEach(c => void peopleSelect.options.add(new Option(c.name, String(c.i), false, c.i === burg.culture)));

  ensureEl<HTMLInputElement>("systemPopulation").value = String(peopleOf(burg));

  for (const feature of FEATURES) {
    ensureEl(featureId(feature)).classList.toggle("inactive", !burg[feature]);
  }

  const isGate = Boolean(burg.spaceGate);
  const isWsActive = burg.waystation === 1;
  const isWsDerelict = burg.waystation === 2;
  ensureEl("systemSpaceGate").classList.toggle("inactive", !isGate);
  ensureEl("systemWaystationActive").classList.toggle("inactive", !isWsActive);
  ensureEl("systemWaystationDerelict").classList.toggle("inactive", !isWsDerelict);
  ensureEl("systemPrecursorLine").style.display = isGate || isWsActive || isWsDerelict ? "inline-flex" : "none";

  const worldTypeSelect = ensureEl<HTMLSelectElement>("systemWorldType");
  worldTypeSelect.options.length = 0;
  const currentWorldType = worldTypeFor(burg);
  for (const wt of ASTRAL_WORLD_TYPE_KEYS) {
    worldTypeSelect.options.add(new Option(wt, wt, false, wt === currentWorldType));
  }

  const [goodAId, goodBId] = tradeGoodsFor(burg);
  const goodA = Goods.get(goodAId);
  const goodB = Goods.get(goodBId);
  const goodAName = goodA ? goodA.name : `#${goodAId}`;
  const goodBName = goodB ? goodB.name : `#${goodBId}`;
  ensureEl("systemTradeGoods").innerHTML = `${escapeHtml(goodAName)}, ${escapeHtml(goodBName)}`;

  updateStar();
  updateLockIcon();
  renderSystemDetails(systemDetailsFor(burg));
}

/** The star preview: the marker exactly as the systems layer draws it, from the same shape code */
function updateStar(): void {
  const burg = pack.burgs[getSelectedId()];
  const population = peopleOf(burg);
  const { class: cls, name: className } = starClassFor(burg);
  ensureEl("systemClass").innerHTML = `${cls}-class ${escapeHtml(className)}`;
  ensureEl("systemStar").dataset.tip = `${cls}-class ${className}. The star, drawn as the chart draws it`;

  const style = styles.systems.groups[cls as StarClassId] as ClassStyle | undefined;
  const glow = Boolean(styles.systems.options.glow && style?.options.glow);
  const shape = starShape(population, !!burg.capital, !!burg.port, glow);
  const attrs = writeAttrs(style?.attrs);
  ensureEl("systemStarShape").outerHTML =
    `<g id="systemStarShape" font-size="36" transform="translate(70 70)"${attrs}>${shape}</g>`;
}

const CELL_STYLE = "padding: 0.1em 0.9em 0.1em 0";
const NO_VALUE = "—";
const DOT_STYLE =
  "display: inline-block; width: 0.65em; height: 0.65em; margin-right: 0.35em; border-radius: 50%; background:";

/** The generated star/planet readout: rendered from the details, no listeners and no cache */
function renderSystemDetails(details: SystemDetails): void {
  const stars = details.stars
    .map(star => {
      const tip = star.massRatio == null ? "" : ` data-tip="Mass ratio ${star.massRatio}"`;
      const separation = star.separationAU == null ? NO_VALUE : String(rn(star.separationAU, 2));
      const period = star.periodYears == null ? NO_VALUE : String(rn(star.periodYears, 1));
      return `<tr${tip}>
        <td style="${CELL_STYLE}">${escapeHtml(star.role)}</td>
        <td style="${CELL_STYLE}"><span style="${DOT_STYLE}${escapeHtml(star.color)}"></span>${escapeHtml(
          `${star.spectral} ${star.luminosityClass ?? ""}`.trim()
        )}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(star.massSolar, 2)}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(star.luminositySolar, 2)}</td>
        <td style="${CELL_STYLE}; text-align: right">${separation}</td>
        <td style="${CELL_STYLE}; text-align: right">${period}</td>
      </tr>`;
    })
    .join("");
  ensureEl("systemStarsBody").innerHTML = stars;

  const totals = [
    `Total mass ${rn(details.totalMassSolar, 2)} solar`,
    `Snow line ${rn(details.snowLineAU, 2)} AU`,
    `${details.planetCount} planet${details.planetCount === 1 ? "" : "s"}`
  ];
  if (details.habitableCandidate) totals.push("Habitable candidate");
  ensureEl("systemReadoutTotals").textContent = totals.join(" · ");

  const planets = details.planets
    .map((planet, index) => {
      const moons = planet.moons.length ? ` data-tip="${escapeHtml(planet.moons.join(", "))}"` : "";
      const planetRow = `<tr>
        <td style="${CELL_STYLE}">${escapeHtml(planet.name)}</td>
        <td style="${CELL_STYLE}; text-align: right">
          <button
            class="systemPlanetView icon-globe pointer"
            data-body="${escapeHtml(planet.bodyId ?? `planet-${index}`)}"
            data-tip="Generate this planet and open its surface in FMG"
          ></button>
        </td>
        <td style="${CELL_STYLE}">${escapeHtml(planet.type)}</td>
        <td style="${CELL_STYLE}; text-align: right" data-tip="Period ${rn(planet.periodDays, 1)} days">${rn(
          planet.orbitAU,
          2
        )}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(planet.radiusEarth, 2)}</td>
        <td style="${CELL_STYLE}; text-align: right">${escapeHtml(planet.gravity)}</td>
        <td style="${CELL_STYLE}" data-tip="${escapeHtml(planet.temperatureC)} °C">${escapeHtml(planet.temperature)}</td>
        <td style="${CELL_STYLE}">${escapeHtml(planet.atmosphere)}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(planet.water)}%</td>
        <td style="${CELL_STYLE}" data-tip="HI ${planet.hi}">${escapeHtml(planet.habitability)}</td>
        <td style="${CELL_STYLE}; text-align: right"${moons}>${planet.moons.length}</td>
      </tr>`;

      const moonRows = (planet.moonRows ?? [])
        .map(
          moon => `
      <tr style="background: rgba(255, 255, 255, 0.035)">
        <td style="${CELL_STYLE}; padding-left: 1.6em">
          <span style="opacity: 0.6; margin-right: 0.3em">↳</span>${escapeHtml(moon.name)}
        </td>
        <td style="${CELL_STYLE}; text-align: right">
          <button
            class="systemPlanetView icon-globe pointer"
            data-body="${escapeHtml(moon.bodyId)}"
            data-tip="Generate ${escapeHtml(moon.name)} and open its surface in FMG"
          ></button>
        </td>
        <td style="${CELL_STYLE}">${escapeHtml(moon.type)}</td>
        <td style="${CELL_STYLE}; text-align: right" data-tip="Parent orbit ${rn(moon.orbitAU, 2)} AU · Moon period ${rn(moon.periodDays, 1)} days">${rn(
          moon.orbitAU,
          2
        )}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(moon.radiusEarth, 2)}</td>
        <td style="${CELL_STYLE}; text-align: right">${escapeHtml(moon.gravity)}</td>
        <td style="${CELL_STYLE}" data-tip="${escapeHtml(moon.temperatureC)} °C">${escapeHtml(moon.temperature)}</td>
        <td style="${CELL_STYLE}">${escapeHtml(moon.atmosphere)}</td>
        <td style="${CELL_STYLE}; text-align: right">${rn(moon.water)}%</td>
        <td style="${CELL_STYLE}" data-tip="HI ${moon.hi}">${escapeHtml(moon.habitability)}</td>
        <td style="${CELL_STYLE}; text-align: right">—</td>
      </tr>`
        )
        .join("");

      return planetRow + moonRows;
    })
    .join("");
  ensureEl("systemPlanetsBody").innerHTML = planets
    ? planets
    : `<tr><td colspan="10" style="${CELL_STYLE}; opacity: 0.7">No planets detected</td></tr>`;
}

function changeName(): void {
  const value = ensureEl<HTMLInputElement>("systemName").value;
  if (!value.trim()) return;
  Burgs.rename(getSelectedId(), value);
  Layers.draw("labels");
  // the seed does not move: only the planet names follow the rename
  renderSystemDetails(systemDetailsFor(pack.burgs[getSelectedId()]));
}

function generateNameRandom(): void {
  const base = Names.nameBases[rand(Names.nameBases.length - 1)].id;
  ensureEl<HTMLInputElement>("systemName").value = Names.getBase(base);
  changeName();
}

function generateNameCulture(): void {
  const culture = pack.burgs[getSelectedId()].culture!;
  ensureEl<HTMLInputElement>("systemName").value = Names.getCulture(culture);
  changeName();
}

function changePeople(this: HTMLSelectElement): void {
  if (tryEdit(() => Burgs.setCulture(getSelectedId(), +this.value))) updateSystemValues();
}

function changeWorldType(this: HTMLSelectElement): void {
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];
  if (!burg) return;
  const newType = this.value as AstralWorldType;
  setWorldTypeFor(burg, newType);
  if (Goods.isAstralCatalogue()) {
    const [primaryGoodId] = tradeGoodsFor(burg);
    pack.cells.good[burg.cell] = primaryGoodId;
    Production.regenerate();
    Layers.draw("goods", "markets");
  }
  updateSystemValues();
}

function changePopulation(): void {
  const people = ensureEl<HTMLInputElement>("systemPopulation").valueAsNumber;
  if (Number.isFinite(people) && people >= 0) Burgs.setPopulation(getSelectedId(), people);
  updateSystemValues(); // the class readout and the star follow the people
  Layers.draw("systems");
}

function openPrecursorNote(): void {
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

function toggleFeature(this: HTMLElement): void {
  const feature = this.dataset.feature as Feature;
  if (!feature) return;
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];
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

  this.classList.toggle("inactive", !burg[feature]);
  updateStar(); // a port earns its tick, a capital its ring
  Layers.draw("systems");
  if (feature === "capital") Layers.draw("burgIcons", "labels");
  else if (feature === "port") Layers.draw("burgIcons");
}

function confirmRemoveMarket(market: Market): void {
  Dialog.confirm({
    title: "Remove market",
    message: `This system is the center of the market "${escapeHtml(Markets.getName(market))}". Remove the market?<br>This action cannot be reverted`,
    confirm: "Remove",
    onConfirm: () => {
      Markets.removeMarket(market.i);
      Layers.draw("markets");
      updateSystemValues();
    }
  });
}

function togglePort(burgId: number): void {
  if (tryEdit(() => Burgs.setPort(burgId, !pack.burgs[burgId].port))) Layers.draw("burgIcons");
}

function toggleCapital(burgId: number): void {
  if (pack.burgs[burgId].capital) {
    tip("To change the capital, make another system of the empire the capital first", false, "error");
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

function toggleLock(): void {
  const id = getSelectedId();
  Burgs.setLocked(id, !pack.burgs[id].lock);
  updateLockIcon();
}

function updateLockIcon(): void {
  const locked = pack.burgs[getSelectedId()].lock;
  const lock = ensureEl("systemLock");
  lock.classList.toggle("icon-lock-open", !locked);
  lock.classList.toggle("icon-lock", !!locked);
}

function showStyleSection(): void {
  document.querySelectorAll<HTMLElement>("#astralSystemBottom > button").forEach(el => {
    el.style.display = "none";
  });
  ensureEl("systemStyleSection").style.display = "inline-block";
}

function hideStyleSection(): void {
  document.querySelectorAll<HTMLElement>("#astralSystemBottom > button").forEach(el => {
    el.style.display = "inline-block";
  });
  ensureEl("systemStyleSection").style.display = "none";
}

function editLabelStyle(): void {
  const burg = pack.burgs[getSelectedId()];
  Dialog.closeAll(".stable");
  void Controllers.StyleEditor.open("labels", burg.label?.group || burg.group);
}

function editClassStyle(): void {
  const burg = pack.burgs[getSelectedId()];
  Dialog.closeAll(".stable");
  void Controllers.StyleEditor.open("systems", starClassFor(burg).class);
}

function editLabel(): void {
  const id = getSelectedId();
  Dialog.close("astralSystemEditor");
  Controllers.LabelsEditor.open("burg", id);
}

function editEmblem(): void {
  const id = getSelectedId();
  void Controllers.EmblemsEditor.open("burg", `burgCOA${id}`, pack.burgs[id]);
}

function zoomIntoSystem(): void {
  const burg = pack.burgs[getSelectedId()];
  zoomTo(burg.x, burg.y, 8, 2000);
}

/** Roll the registry for this burg's system: the same seed and primary the readout shows */
function ensureSolarSystem(): void {
  const burgId = getSelectedId();
  const seed = `${options.map.seed}/astral/system/${burgId}`;
  if (SolarSystem.seed === seed && SolarSystem.bodies.length) return; // keep materialized snapshots
  const burg = pack.burgs[burgId];
  const originContext = extractSystemOriginContext(pack, burgId);
  if (isCoreOrCapital(burg)) {
    SolarSystem.initFromSeed(seed, { forceHabitable: true, systemName: burg.name }, originContext);
  } else {
    const { class: spectral } = starClassFor(burg);
    SolarSystem.initFromSeed(
      seed,
      { primaryType: starTypeData[spectral] ? spectral : "G", forceHabitable: false, systemName: burg.name },
      originContext
    );
  }
}

async function openSystemOrrery(): Promise<void> {
  ensureSolarSystem();
  // the orrery sits on the restored FMG profile: the star chart layers do not follow us down
  if (isAstralView()) await Controllers.AstralMode.exit();
  enterAstralSystemView(String(getSelectedId()));
  Dialog.close("astralSystemEditor");
  void Controllers.View3d.open("viewSystem");
}

async function viewPlanetInFmg(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest<HTMLElement>(".systemPlanetView");
  if (!button) return;
  const bodyId =
    button.dataset?.body ?? (button.dataset?.planet !== undefined ? `planet-${button.dataset.planet}` : undefined);
  if (!bodyId) return;

  ensureSolarSystem();
  if (isAstralView()) await Controllers.AstralMode.exit(); // the flat map needs the FMG profile
  const body = SolarSystem.getBody(bodyId);
  if (!body?.colonizable) {
    tip(`${body?.name ?? "This body"} has no mappable surface`, false, "error");
    return;
  }

  Dialog.close("astralSystemEditor");
  tip(`Generating ${body.name}...`, true);
  try {
    enterAstralPlanetView(String(getSelectedId()));
    await SolarSystem.switchBody(body.id); // the planet or moon's world becomes the active FMG map
    clearMainTip();
  } catch (error) {
    clearMainTip();
    tip(errorText(error), false, "error");
  }
}

function toggleRelocateSystem(): void {
  ensureEl("systemRelocate").classList.toggle("pressed");
  if (ensureEl("systemRelocate").classList.contains("pressed")) {
    select<SVGGElement, unknown>("#viewbox").style("cursor", "crosshair").on("click", relocateOnClick);
    tip("Click on map to relocate the system. Hold Shift for continuous move", true);
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

function relocateOnClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, this);
  if (!tryEdit(() => Burgs.move(getSelectedId(), x, y))) return;
  Layers.draw("systems", "labels", "burgIcons");
  if (event.shiftKey === false) toggleRelocateSystem();
}

function editNotes(): void {
  void Controllers.NotesEditor.open({ type: "burg", id: getSelectedId() });
}

function showProductionOverview(): void {
  Controllers.BurgEconomyOverview.open(getSelectedId());
}

function removeSelectedSystem(): void {
  const burgId = getSelectedId();
  const burg = pack.burgs[burgId];

  if (burg.capital) {
    Dialog.message({
      title: "Remove system",
      message: "You cannot remove the capital. You must change the empire capital first"
    });
  } else if (pack.markets?.some(m => m.centerBurgId === burgId)) {
    Dialog.message({
      title: "Remove system",
      message: "You cannot remove a market center system. Please remove the market first"
    });
  } else {
    Dialog.confirm({
      title: "Remove system",
      message: "Are you sure you want to remove the system? <br>This action cannot be reverted",
      confirm: "Remove",
      onConfirm: () => {
        Burgs.remove(burgId);
        removeEmblem("burg", burgId);
        Layers.draw("burgIcons", "labels", "systems");
        Dialog.close("astralSystemEditor");
      }
    });
  }
}

function closeSystemEditor(): void {
  if (ensureEl("systemRelocate").classList.contains("pressed")) toggleRelocateSystem();
  selectedId = null;
  Dialog.destroy("astralSystemEditor");
  const editor = findEl("astralSystemEditor");
  if (editor) editor.remove();
}

export const AstralSystemEditor = { open };
