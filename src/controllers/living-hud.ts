// The Living World HUD: a seasonal clock, a live news ticker and a god-mode inspector.
// See docs/plans/living-world.md (slice 5)
import { Controllers } from "@/controllers";
import { ACTION_DEFS, DIE_SIDES } from "@/data/character-actions";
import { ALIGNMENT_COLORS } from "@/data/culture-traits";
import { figureArchetype, figureDisciplines, HERO_ARCHETYPES, pendingPathLevel } from "@/data/hero-archetypes";
import { activeAspects } from "@/data/hero-aspects";
import { HERO_DISCIPLINES } from "@/data/hero-disciplines";
import { HERO_INJURY_LABELS, heroTemperamentTags, injuryIsActive } from "@/data/hero-vitals";
import { CIV_IMPROVEMENT_BY_ID } from "@/data/living-civ-improvements";
import { SOVEREIGN_DEVELOPMENT } from "@/data/living-eras";
import { PROJECT_BY_ID, projectName } from "@/data/living-projects";
import { getTroubleDef } from "@/data/living-troubles";
import { currentContent } from "@/data/roster-store";
import { Accounts } from "@/model/economy/accounts";
import { DEAL_KINDS, Deals } from "@/model/economy/deals";
import { Output } from "@/model/economy/output";
import { Prosperity } from "@/model/economy/prosperity";
import { Pack } from "@/model/graph/pack-generator";
import { canReadUpstreamEconomy } from "@/model/physical/living-faction-economy";
import { figureLevel, Living } from "@/model/physical/living-generator";
import { ensureHeroSheet } from "@/model/physical/living-heroes";
import { Factions } from "@/model/political/factions-generator";
import { Military } from "@/model/political/military-generator";
import { Stability } from "@/model/political/stability";
import { Development } from "@/model/society/development-generator";
import { getCellPoint } from "@/model/story/journeys/journey-places";
import { getMoneySymbol } from "@/model/units";
import { drawLivingOverlay, removeLivingOverlay } from "@/renderers/draw-living-overlay";
import { Layers } from "@/renderers/layers";
import type { HistoricalFigure } from "@/types/history";
import type {
  FiscalLock,
  HeroDoctrine,
  HeroGuildState,
  LivingNewsItem,
  MissionTag,
  ProvinceSimState,
  StatePolitySim
} from "@/types/living";
import { SEASON_NAMES } from "@/types/living";
import { dialogState } from "@/ui/dialog/state";
import { zoomTo } from "@/ui/map/zoom";
import { escapeHtml, findEl, getPointer } from "@/utils";
import { t } from "@/utils/i18n";

const HUD_ID = "livingWorldHud";
const INSPECTOR_ID = "livingInspector";
const MAX_NEWS = 8;

const TEMPLATE = /* html */ `
  <style>
    #${HUD_ID} {
      position: fixed;
      left: 50%;
      bottom: 8px;
      transform: translateX(-50%);
      z-index: 60;
      width: min(780px, calc(100vw - 20px));
      border: 1px solid #5e4fa2;
      border-radius: 4px;
      background: var(--bg-light, #f7f7f7);
      font-family: var(--monospace);
      font-size: 0.85em;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      user-select: none;
    }
    #${HUD_ID} .livingHudTop { display: flex; align-items: center; gap: 0.3em; padding: 0.3em 0.4em 0; }
    #${HUD_ID} .livingHudDrag { cursor: move; padding: 0 0.35em; opacity: 0.55; }
    #${HUD_ID} button {
      font-family: var(--monospace);
      font-size: 1em;
      padding: 0.15em 0.5em;
      cursor: pointer;
    }
    #${HUD_ID} button.pressed { background: var(--header, #5e4fa2); color: #fff; }
    #${HUD_ID} #livingHudDate { margin-left: auto; font-weight: bold; }
    #${HUD_ID} .livingHudEschaton { margin-left: auto; font-weight: bold; color: #6a4c93; cursor: default; }
    #${HUD_ID} #livingHudClose { padding: 0 0.45em; }
    #${HUD_ID} .livingHudNews {
      display: flex;
      flex-direction: column;
      max-height: 13.5em;
      overflow-y: auto;
      margin: 0.35em 0.45em 0.45em;
      border: 1px solid rgba(0, 0, 0, 0.16);
      border-radius: 4px;
      background: #ffffff;
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    #${HUD_ID} .livingNewsItem {
      display: block;
      width: 100%;
      text-align: left;
      border: none;
      border-bottom: 1px solid #e1e4e8;
      padding: 7px 12px;
      min-height: 32px;
      line-height: 1.55;
      font-size: 13.5px;
      font-family: var(--sans-serif);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      box-sizing: border-box;
      color: #1f2328;
    }
    #${HUD_ID} .livingNewsItem:nth-child(even) {
      background: #f0f4f9;
    }
    #${HUD_ID} .livingNewsItem:nth-child(odd) {
      background: #ffffff;
    }
    #${HUD_ID} .livingNewsItem:hover {
      background: #e2eafc;
      color: #000;
    }
    #${HUD_ID} .livingNewsDate {
      font-family: var(--monospace);
      font-size: 0.95em;
      font-weight: bold;
      color: #5e4fa2;
      margin-right: 0.5em;
    }
    #${HUD_ID} .livingNewsEmpty {
      color: #666;
      font-style: italic;
      padding: 0.7em 1em;
      background: #ffffff;
    }
    #${HUD_ID} .livingHudStatus { display: none; }
    #${INSPECTOR_ID} {
      position: fixed;
      top: 52px;
      right: 12px;
      z-index: 61;
      width: min(340px, calc(100vw - 24px));
      max-height: calc(100vh - 140px);
      overflow-y: auto;
      padding: 0.65em 0.75em;
      border: 1px solid #5e4fa2;
      border-radius: 4px;
      background: var(--bg-light, #f7f7f7);
      color: #1f2328;
      font-family: var(--sans-serif);
      font-size: 0.85em;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
    }
    #${INSPECTOR_ID} .livingInspectorClose {
      float: right;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: 1em;
      line-height: 1;
      padding: 0.1em 0.3em;
      color: #555;
    }
    #${INSPECTOR_ID} .livingInspectorTitle {
      display: block;
      font-size: 1.08em;
      font-weight: bold;
      margin-bottom: 0.3em;
      padding: 0;
      border: none;
      background: transparent;
      color: #3d2f7a;
      text-align: left;
      cursor: pointer;
    }
    #${INSPECTOR_ID} .livingSection {
      margin-top: 0.55em;
      padding-top: 0.45em;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    #${INSPECTOR_ID} .livingSectionTitle,
    #${INSPECTOR_ID} .livingGodTitle {
      font-weight: bold;
      font-size: 0.92em;
      margin-bottom: 0.25em;
      color: #333;
    }
    #${INSPECTOR_ID} .livingGodTitle { margin-top: 0.6em; }
    #${INSPECTOR_ID} .livingMuted,
    #${INSPECTOR_ID} .livingPlaceholder { color: #666; font-size: 0.9em; }
    #${INSPECTOR_ID} .livingTraits { color: #555; font-size: 0.88em; font-style: italic; }
    #${INSPECTOR_ID} .livingPoolVitals { display: flex; flex-wrap: wrap; gap: 0.25em; margin-top: 0.2em; }
    #${INSPECTOR_ID} .livingChipRows { display: flex; flex-direction: column; gap: 0.25em; margin-top: 0.2em; }
    #${INSPECTOR_ID} .livingChipRow { display: flex; flex-wrap: nowrap; gap: 0.25em; min-width: 0; }
    #${INSPECTOR_ID} .livingChipRow .livingCivChip { flex: 0 0 auto; white-space: nowrap; }
    #${INSPECTOR_ID} .livingCivChip {
      display: inline-block;
      padding: 0.15em 0.4em;
      border: 1px solid rgba(0, 0, 0, 0.18);
      border-radius: 3px;
      background: #fff;
      font-size: 0.85em;
      cursor: pointer;
    }
    #${INSPECTOR_ID} .livingButtons { display: flex; flex-wrap: wrap; gap: 0.25em; margin-top: 0.25em; }
    #${INSPECTOR_ID} .livingButtons button { font-size: 0.85em; padding: 0.2em 0.45em; cursor: pointer; }
    #${INSPECTOR_ID} .livingLinkBtn {
      border: none;
      background: transparent;
      padding: 0;
      color: #3d5a99;
      text-decoration: underline;
      cursor: pointer;
      font-size: inherit;
      text-align: left;
    }
    #${INSPECTOR_ID} .livingCapacityRow,
    #${INSPECTOR_ID} .livingMeterRow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.4em;
      margin-top: 0.2em;
    }
    #${INSPECTOR_ID} .livingBar {
      flex: 1;
      height: 6px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.12);
      overflow: hidden;
    }
    #${INSPECTOR_ID} .livingBar > i { display: block; height: 100%; background: #5e4fa2; }
    #${INSPECTOR_ID} .livingBar.danger > i { background: #a33d3d; }
    #${INSPECTOR_ID} .livingBadge {
      display: inline-block;
      padding: 0.05em 0.35em;
      border-radius: 3px;
      color: #fff;
      font-size: 0.8em;
    }
    #${INSPECTOR_ID} ul { margin: 0.2em 0 0; padding-left: 1.1em; }
  </style>
  <div id="${HUD_ID}">
    <div class="livingHudTop">
      <span class="livingHudDrag" title="Drag to move">⠿</span>
      <button id="livingHudPause" type="button" class="pressed">❚❚</button>
      <button id="livingHudStepSeason" type="button" title="Step one season">⏵</button>
      <button id="livingHudStepYear" type="button" title="Step one year">⏩</button>
      <button id="livingHudPlay" type="button" title="Play one season per second">▶</button>
      <button id="livingHudPlay4" type="button" title="Play four seasons per second">▶▶</button>
      <button id="livingHudDate" type="button"></button>
      <span id="livingHudEschaton" class="livingHudEschaton"></span>
      <button id="livingHudClose" type="button" title="Close Living World">☓</button>
    </div>
    <div id="livingHudStatus" class="livingHudStatus" style="display: none;"></div>
    <div id="livingHudNews" class="livingHudNews"></div>
  </div>
`;

type Selection =
  | { kind: "state"; id: number }
  | { kind: "burg"; id: number }
  | { kind: "province"; id: number }
  | { kind: "cell"; id: number }
  | { kind: "figure"; id: number }
  | { kind: "marker"; id: number };

const HERO_DOCTRINE_LABELS: Record<HeroDoctrine, string> = {
  hunt_troubles: "Troubles",
  hunt_lairs: "Lairs",
  excavate: "Excavate",
  support: "Support",
  patrol: "Patrol",
  manual: "Manual"
};

let playing = 0;
let timer: number | null = null;
let selected: Selection | null = null;
let lastFitTarget: { label: string; tags: MissionTag[] } | null = null;
let dragOrigin: { x: number; y: number; left: number; top: number } | null = null;

function open(): void {
  if (findEl(HUD_ID)) {
    refresh();
    drawLivingOverlay();
    bindOverlayClicks();
    return;
  }

  Living.getState();
  document.body.insertAdjacentHTML("beforeend", TEMPLATE);
  if (!findEl(INSPECTOR_ID)) {
    document.body.insertAdjacentHTML("beforeend", `<aside id="${INSPECTOR_ID}"></aside>`);
  }

  bindControls();
  attachMapSelection();
  refresh();
  bindOverlayClicks();
  drawLivingOverlay();
}

function close(): void {
  detachMapSelection();
  findEl(HUD_ID)?.remove();
  removeLivingOverlay();
  const inspector = findEl(INSPECTOR_ID);
  if (inspector) inspector.remove();
  selected = null;
  playing = 0;
  stopTimer();
}

function toggle(): void {
  if (findEl(HUD_ID)) close();
  else open();
}

function refresh(): void {
  if (!findEl(HUD_ID)) return;

  const living = Living.getState();
  const date = findEl("livingHudDate");
  if (date) date.textContent = Living.formatSeasonDate(living);

  renderControls();
  renderEschaton();
  renderNews(living.recentNews ?? []);
  validateSelection();
  renderInspector();
}

function bindControls(): void {
  findEl("livingHudPause")?.addEventListener("click", pause);
  findEl("livingHudStepSeason")?.addEventListener("click", () => step(1));
  findEl("livingHudStepYear")?.addEventListener("click", () => step(4));
  findEl("livingHudPlay")?.addEventListener("click", () => play(1));
  findEl("livingHudPlay4")?.addEventListener("click", () => play(4));
  findEl("livingHudDate")?.addEventListener("click", () => void Controllers.LegendsOverview.open());
  findEl("livingHudClose")?.addEventListener("click", close);

  const drag = document.querySelector<HTMLElement>(`#${HUD_ID} .livingHudDrag`);
  drag?.addEventListener("pointerdown", startDrag);
}

function startDrag(event: PointerEvent): void {
  const hud = findEl(HUD_ID);
  if (!hud) return;
  const rect = hud.getBoundingClientRect();
  dragOrigin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
  document.addEventListener("pointermove", moveDrag);
  document.addEventListener("pointerup", endDrag);
}

function moveDrag(event: PointerEvent): void {
  if (!dragOrigin) return;
  const hud = findEl(HUD_ID);
  if (!hud) return;
  hud.style.left = `${dragOrigin.left + event.clientX - dragOrigin.x}px`;
  hud.style.top = `${dragOrigin.top + event.clientY - dragOrigin.y}px`;
  hud.style.bottom = "auto";
  hud.style.transform = "none";
}

function endDrag(): void {
  dragOrigin = null;
  document.removeEventListener("pointermove", moveDrag);
  document.removeEventListener("pointerup", endDrag);
}

function step(seasons: number): void {
  Living.tick(seasons);
  afterTick();
}

function play(speed: number): void {
  playing = speed;
  renderControls();
  stopTimer();
  timer = window.setInterval(() => {
    Living.tick(1);
    afterTick();
  }, 1000 / speed);
}

function pause(): void {
  playing = 0;
  renderControls();
  stopTimer();
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function afterTick(): void {
  clearToasts();
  Living.syncWorld();
  redrawMap();
  refresh();
  drawLivingOverlay();
}

function redrawMap(): void {
  Layers.draw("states", "borders", "provinces", "labels", "burgIcons", "military", "markers");
}

function renderControls(): void {
  findEl("livingHudPause")?.classList.toggle("pressed", playing === 0);
  findEl("livingHudPlay")?.classList.toggle("pressed", playing === 1);
  findEl("livingHudPlay4")?.classList.toggle("pressed", playing === 4);
}

function renderEschaton(): void {
  const el = findEl("livingHudEschaton");
  if (!el) return;

  const eschaton = Living.getEschaton?.() ?? 0;
  const wheelReady = eschaton >= 100;
  el.textContent = `⏳ ${eschaton}`;
  el.title = `The eschaton clock: how close this age is to its finale (${eschaton}/100).${
    wheelReady ? " The Wheel of Ages may be turned!" : " Reach eschaton 100 to turn it."
  }`;
}

function zoomToState(stateId: number): void {
  const state = pack.states[stateId];
  if (!state || state.removed) return;
  if (state.pole) {
    zoomTo(state.pole[0], state.pole[1], 4, 1500);
    return;
  }
  if (state.capital && pack.burgs[state.capital]) {
    const burg = pack.burgs[state.capital];
    if (Number.isFinite(burg.x) && Number.isFinite(burg.y)) {
      zoomTo(burg.x, burg.y, 6, 1500);
      return;
    }
    if (burg.cell !== undefined) {
      const pt = getCellPoint(burg.cell);
      if (pt) {
        zoomTo(pt[0], pt[1], 6, 1500);
        return;
      }
    }
  }
  if (state.center !== undefined) {
    const pt = getCellPoint(state.center);
    if (pt) {
      zoomTo(pt[0], pt[1], 4, 1500);
      return;
    }
    const p = pack.cells.p?.[state.center];
    if (p) zoomTo(p[0], p[1], 4, 1500);
  }
}

function renderNews(news: LivingNewsItem[]): void {
  const wrap = findEl("livingHudNews");
  if (!wrap) return;

  const items = news.slice(0, MAX_NEWS);
  if (items.length === 0) {
    wrap.innerHTML = `<span class="livingNewsEmpty">No dispatches yet - step a season.</span>`;
    return;
  }

  wrap.innerHTML = items
    .map(item => {
      const date = `${item.year} ${SEASON_NAMES[item.season] ?? ""}`.trim();
      const burgAttr = item.burgId ? ` data-burg="${item.burgId}"` : "";
      const stateAttr = item.stateId ? ` data-state="${item.stateId}"` : "";
      const cellAttr = item.cell !== undefined ? ` data-cell="${item.cell}"` : "";
      return `<button type="button" class="livingNewsItem"${burgAttr}${stateAttr}${cellAttr}>
        <span class="livingNewsDate">${date}</span>${escapeHtml(item.text)}
      </button>`;
    })
    .join("");

  for (const row of wrap.querySelectorAll<HTMLElement>(".livingNewsItem")) {
    row.addEventListener("click", focusNews);
  }
}

function focusNews(this: HTMLElement): void {
  const burgId = Number(this.dataset.burg ?? 0);
  const stateId = Number(this.dataset.state ?? 0);
  if (burgId) zoomToLocation(undefined, burgId);
  else if (stateId) zoomToState(stateId);
  const cell = Number(this.dataset.cell ?? Number.NaN);
  if (!Number.isFinite(cell)) return;
  const point = getCellPoint(cell);
  if (point) zoomTo(point[0], point[1], 8, 1000);
}

function handleMapClick(event: MouseEvent): void {
  if (!findEl(HUD_ID)) return;
  const viewbox = document.getElementById("viewbox") as SVGElement | null;
  if (viewbox) onMapClick(viewbox, event);
}

function attachMapSelection(): void {
  const target = document.getElementById("map") ?? document.getElementById("viewbox");
  target?.removeEventListener("click", handleMapClick);
  target?.addEventListener("click", handleMapClick);
}

function detachMapSelection(): void {
  document.getElementById("map")?.removeEventListener("click", handleMapClick);
  document.getElementById("viewbox")?.removeEventListener("click", handleMapClick);
}

function onMapClick(svg: SVGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, svg);
  const cell = Pack.findCell(x, y);
  if (cell === undefined || cell < 0) return;

  const burgId = pack.cells.burg?.[cell] ?? 0;
  if (burgId) {
    selectBurg(burgId);
    return;
  }

  if (event.altKey) {
    selectCell(cell);
    return;
  }

  const stateId = pack.cells.state?.[cell] ?? 0;
  if (stateId) {
    selectState(stateId);
    return;
  }

  const marker = (pack.markers ?? []).find(entry => entry?.cell === cell);
  if (marker) {
    selectMarker(marker.i);
    return;
  }

  selectCell(cell); // unowned land and water: inspect the cell itself
}

function bindOverlayClicks(): void {
  const overlay = document.getElementById("livingOverlay");
  if (!overlay || overlay.getAttribute("data-bound") === "1") return;
  overlay.setAttribute("data-bound", "1");
  overlay.addEventListener("click", onOverlayClick);
}

function onOverlayClick(event: Event): void {
  const target = event.target as Element | null;
  const popupElement = target?.closest?.(".livingPopup") as HTMLElement | null;
  if (!popupElement) return;

  event.stopPropagation();
  event.preventDefault();
  const markerId = Number(popupElement.getAttribute("data-marker-id") ?? 0);
  if (markerId) {
    selectMarker(markerId);
  }
}

function rememberTarget(label: string | undefined, tags: MissionTag[] | undefined): void {
  if (!label || !tags?.length) return;
  lastFitTarget = { label, tags };
}

/** Hostile/clandestine faction with an HQ in a province (HUD view of threat pressure). */
function hostileFactionInProvince(provinceId: number): import("@/types/factions").Faction | null {
  const candidates = Factions.active().filter(f => {
    if (f.allegiance !== "hostile" && f.allegiance !== "clandestine") return false;
    return provIdOfFaction(f) === provinceId;
  });
  candidates.sort((a, b) => (b.military?.[0]?.a ?? 0) - (a.military?.[0]?.a ?? 0));
  return candidates[0] ?? null;
}

/** Province a faction HQ sits in. */
function provIdOfFaction(faction: import("@/types/factions").Faction): number | undefined {
  return (
    faction.hq.provinceId ??
    (faction.hq.burgId ? pack.cells.province?.[pack.burgs?.[faction.hq.burgId]?.cell ?? 0] : undefined) ??
    pack.cells?.province?.[faction.hq.cell]
  );
}

function rememberProvinceTarget(provinceId: number): void {
  const living = Living.getState();
  const province = pack.provinces?.[provinceId];
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || !pSim) return;
  if (pSim.trouble) rememberTarget(`Fit for ${pSim.trouble.name}`, ["combat", "trouble"]);
  else {
    const threat = hostileFactionInProvince(provinceId);
    if (threat) {
      const marker = threat.hq.markerId !== undefined ? pack.markers?.[threat.hq.markerId] : undefined;
      rememberTarget(
        `Fit for ${threat.name}`,
        marker && ["ruins", "dungeon", "cave", "battlefields"].includes(marker.type ?? "")
          ? ["ruin", "wild"]
          : ["combat", "lair"]
      );
    }
  }
}

function selectMarker(markerId: number): void {
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  if (marker) rememberTarget(`Fit for ${marker.name ?? "the site"}`, ["ruin", "wild"]);
  selected = { kind: "marker", id: markerId };
  renderInspector();
}

function selectState(stateId: number): void {
  const province = (pack.provinces ?? []).find(p => {
    if (!p?.i || p.removed || p.state !== stateId) return false;
    const sim = Living.getState().provinces?.[p.i];
    return Boolean(sim?.trouble || hostileFactionInProvince(p.i));
  });
  if (province) rememberProvinceTarget(province.i);
  selected = { kind: "state", id: stateId };
  renderInspector();
}

function selectBurg(burgId: number): void {
  const provId = pack.burgs?.[burgId]?.cell !== undefined ? pack.cells?.province?.[pack.burgs[burgId].cell] : 0;
  if (provId && (Stability.getProvince(provId)?.stability ?? 1) < 0.4) {
    rememberTarget("Fit for unrest", ["social", "order"]);
  }
  selected = { kind: "burg", id: burgId };
  renderInspector();
}

function selectProvince(provinceId: number): void {
  rememberProvinceTarget(provinceId);
  selected = { kind: "province", id: provinceId };
  renderInspector();
}

function selectCell(cellId: number): void {
  selected = { kind: "cell", id: cellId };
  renderInspector();
}

function validateSelection(): void {
  if (!selected) return;
  const current = selected;
  const alive =
    current.kind === "state"
      ? Boolean(pack.states[current.id] && !pack.states[current.id].removed)
      : current.kind === "burg"
        ? Boolean(pack.burgs[current.id] && !pack.burgs[current.id].removed)
        : current.kind === "province"
          ? Boolean(pack.provinces?.[current.id] && !pack.provinces[current.id].removed)
          : current.kind === "cell"
            ? Boolean(pack.cells.i?.includes(current.id))
            : current.kind === "marker"
              ? (pack.markers ?? []).some(marker => marker?.i === current.id)
              : Boolean(pack.history?.figures?.some(figure => figure.i === current.id));
  if (!alive) selected = null;
}

function renderInspector(): void {
  const panel = findEl(INSPECTOR_ID);
  if (!panel) return;

  if (!selected) {
    panel.innerHTML = `<button type="button" class="livingInspectorClose" data-inspector="close" title="Close Inspector">✕</button><div class="livingPlaceholder">Click a state, burg, hero or landmark to inspect it.</div>`;
    bindInspectorButtons(panel);
    return;
  }

  panel.style.display = "block";
  const content =
    selected.kind === "state"
      ? renderStateCard(selected.id)
      : selected.kind === "burg"
        ? renderBurgCard(selected.id)
        : selected.kind === "province"
          ? renderProvinceCard(selected.id)
          : selected.kind === "cell"
            ? renderCellCard(selected.id)
            : selected.kind === "marker"
              ? renderMarkerCard(selected.id)
              : renderFigureCard(selected.id);

  panel.innerHTML = `<button type="button" class="livingInspectorClose" data-inspector="close" title="Close Inspector">✕</button>${content}`;
  bindInspectorButtons(panel);
}

function renderMarkerCard(markerId: number): string {
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  if (!marker) return `<div class="livingPlaceholder">This landmark is gone.</div>`;

  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(marker.name ?? "Landmark")}</div>
    <div class="livingMuted">${escapeHtml(marker.type.replaceAll("-", " "))} · cell ${marker.cell}${
      marker.chronicle ? " · chronicle site" : ""
    }</div>
    ${lastFitTarget ? `<div class="livingMuted">${escapeHtml(lastFitTarget.label)}</div>` : ""}`;
}

function actionDice(figure: HistoricalFigure): string {
  const hero = ensureHeroSheet(figure);
  return Object.values(ACTION_DEFS)
    .map(def => ({ label: def.label, die: hero.actions[def.id] }))
    .sort((a, b) => DIE_SIDES[b.die] - DIE_SIDES[a.die])
    .slice(0, 3)
    .map(entry => `${entry.label} ${entry.die}`)
    .join(" · ");
}

function disciplineChips(figure: HistoricalFigure): string {
  return figureDisciplines(figure)
    .map(id => `<span class="livingDiscipline">${escapeHtml(HERO_DISCIPLINES[id]?.name ?? id)}</span>`)
    .join("");
}

function renderPathChoices(figure: HistoricalFigure, figureId: number): string {
  if (figure.death !== undefined || (figure.progression?.pendingChoices ?? 0) <= 0) return "";

  const level = pendingPathLevel(figure);
  const choice = HERO_ARCHETYPES[figureArchetype(figure).id].paths.find(entry => entry.level === level);
  if (!choice) return "";

  return `<div class="livingSection">
    <div class="livingSectionTitle">Choose a path (level ${level})</div>
    <div class="livingButtons">${choice.options
      .map(
        option =>
          `<button type="button" data-guild="choose-path" data-figure="${figureId}" data-path="${option.id}">${escapeHtml(option.name)} <span class="livingMuted">${escapeHtml(option.note)}</span></button>`
      )
      .join("")}</div>
  </div>`;
}

function vitalBar(label: string, value: number, max: number): string {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return `<div class="livingVital"><span>${label}</span><span>${value}/${max}</span><div class="livingBar"><i style="width:${pct}%"></i></div></div>`;
}

function renderVitals(figureId: number, state: HeroGuildState | undefined): string {
  if (!state) return "";
  const temperament = heroTemperamentTags(state.temperament)
    .map(tag => `<span class="livingDiscipline">${escapeHtml(tag)}</span>`)
    .join("");
  const injuries = state.injuries
    .filter(injury => injuryIsActive(injury, Living.getState().tick))
    .map(injury => {
      const label = HERO_INJURY_LABELS[injury.kind];
      return `<span class="livingDiscipline injury">${escapeHtml(label)}${
        injury.untilTick === undefined ? " · until treated" : ""
      }</span>`;
    })
    .join("");
  const down =
    state.downUntilTick !== undefined && state.downUntilTick > Living.getState().tick
      ? `<div class="livingMuted dangerText">Downed until tick ${state.downUntilTick}</div>`
      : "";
  const doctrineButtons = `<div class="livingButtons">${(Object.keys(HERO_DOCTRINE_LABELS) as HeroDoctrine[])
    .map(
      doctrine =>
        `<button type="button" class="livingDiscipline${state.doctrine === doctrine ? " pressed" : ""}" data-guild="hero-doctrine" data-figure="${figureId}" data-doctrine="${doctrine}" title="Set this hero's doctrine">${HERO_DOCTRINE_LABELS[doctrine]}</button>`
    )
    .join(
      ""
    )}<button type="button" class="livingDiscipline${state.push ? " pressed" : ""}" data-guild="toggle-push" data-figure="${figureId}" title="Spend Stamina on harder checks">Push: ${state.push ? "On" : "Off"}</button></div>`;

  return `<div class="livingSection">
    <div class="livingSectionTitle">Vitals</div>
    <div class="livingPoolVitals">
      ${vitalBar("Resolve", state.resolve, state.maxResolve)}
      ${vitalBar("Stamina", state.stamina, state.maxStamina)}
    </div>
    <div class="livingChips">${temperament}${injuries}</div>
    ${down}
    <div class="livingMuted">Doctrine: ${HERO_DOCTRINE_LABELS[state.doctrine]}</div>
    ${doctrineButtons}
  </div>`;
}

function renderFigureCard(figureId: number): string {
  const living = Living.getState();
  const figure = pack.history?.figures?.find(entry => entry.i === figureId);
  if (!figure) return `<div class="livingPlaceholder">This figure has passed from the chronicle.</div>`;

  const year = options.map?.lore?.calendar?.year ?? 1000;
  const age = Math.max(0, year - figure.birth);
  const level = figureLevel(figure.xp ?? 0);
  const isHero = Boolean(figure.hero);
  const heroState = isHero ? Living.getHeroState?.(figureId) : undefined;
  const isDown = heroState?.downUntilTick !== undefined && heroState.downUntilTick > living.tick;
  const culture = pack.cultures?.[figure.culture]?.name;
  const alignment = figure.alignment
    ? `<span class="livingBadge" style="background:${ALIGNMENT_COLORS[figure.alignment]}">${figure.alignment}</span>`
    : "";
  const virtues = (figure.virtues ?? []).map(escapeHtml).join(", ");
  const vices = (figure.vices ?? []).map(escapeHtml).join(", ");
  const traits = [virtues, vices].filter(Boolean).join(" · ");
  const archetype = figureArchetype(figure);
  const archetypeBadge = `<span class="livingBadge" style="background:#5e4fa2">${archetype.icon} ${archetype.name}</span>`;
  const aspects = activeAspects(figure);
  const aspectNotes = [aspects.virtue?.note, aspects.vice?.note]
    .filter((note): note is string => Boolean(note))
    .map(note => `<div class="livingMuted">${escapeHtml(note)}</div>`)
    .join("");
  const skills = `<div class="livingMuted">Top actions: ${actionDice(figure)}</div>`;

  let status = `<div class="livingMuted">Free agent</div>`;
  if (figure.death !== undefined) status = `<div class="livingMuted">Died ${figure.death}</div>`;
  else if (isDown) status = `<div class="livingMuted dangerText">Downed until tick ${heroState!.downUntilTick}</div>`;
  else if (isHero) status = `<div class="livingMuted">Living hero</div>`;

  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(figure.name)}</div>
    <div class="livingRuler">
      <span class="livingAge">age ${age}</span>
      ${alignment}
      ${archetypeBadge}
    </div>
    ${culture ? `<div class="livingMuted">${escapeHtml(culture)}</div>` : ""}
    ${traits ? `<div class="livingTraits">${traits}</div>` : ""}
    <div class="livingSection">
      <div class="livingSectionTitle">Identity</div>
      <div class="livingChips">${disciplineChips(figure)}</div>
      ${aspectNotes || `<div class="livingMuted">${escapeHtml(archetype.temperament)}</div>`}
    </div>
    ${renderVitals(figureId, heroState)}
    <div class="livingSection">
      <div class="livingSectionTitle">Progression</div>
      <div>Level ${level} <span class="livingMuted">· ${figure.xp ?? 0} xp</span></div>
      ${skills}
      ${status}
    </div>
    ${renderPathChoices(figure, figureId)}`;
}

function renderStateCard(stateId: number): string {
  const living = Living.getState();
  const state = pack.states[stateId];
  const sSim = living.states[stateId];
  if (!state?.i || state.removed || !sSim) return `<div class="livingPlaceholder">This state is gone.</div>`;

  const year = options.map?.lore?.calendar?.year ?? 1000;
  const ruler = pack.history?.figures?.find(figure => figure.i === sSim.rulerId);
  const age = ruler ? Math.max(0, year - ruler.birth) : undefined;
  const hasFactions = (pack.provinces ?? []).some(
    p => p?.i && !p.removed && p.state === stateId && hostileFactionInProvince(p.i)
  );
  const hasAscendableFaction = Factions.active().some(
    f =>
      f.sovereignAmbition &&
      (f.allegiance === "hostile" || f.allegiance === "clandestine") &&
      (f.seasonsActive ?? 0) >= 8 &&
      (pack.cells.development?.[f.hq.cell] ?? 0) >= SOVEREIGN_DEVELOPMENT &&
      (() => {
        const provId = provIdOfFaction(f);
        return provId !== undefined && pack.provinces?.[provId]?.state === stateId;
      })()
  );
  const canSpawnStateFaction = (pack.provinces ?? []).some(
    p => p?.i && !p.removed && p.state === stateId && !hostileFactionInProvince(p.i)
  );

  return /* html */ `
    <button type="button" class="livingInspectorTitle" data-open="states" data-id="${stateId}" title="States editor">${escapeHtml(state.fullName ?? state.name ?? "State")}</button>
    ${renderRuler(ruler, age)}
    ${renderFiscal(stateId)}
    ${renderProjects(stateId)}
    ${renderUpstreamState(stateId)}
    ${renderAgenda(sSim, living)}
    ${renderStateNav(stateId)}
    ${renderSuppressionTargets(stateId, sSim)}
    <div class="livingSection">
      <div class="livingSectionTitle">Issues &amp; Crises</div>
      ${
        [
          renderStateInstability(stateId),
          renderProvincesFactions(stateId),
          renderProvincesTroubles(stateId),
          renderClaims(sSim),
          renderGrudges(sSim)
        ]
          .filter(Boolean)
          .join("") || '<div class="livingMuted">None</div>'
      }
    </div>
    <div class="livingGodTitle">Sandbox God Mode</div>
    <div class="livingButtons">
      <button type="button" data-god="spark" data-state="${stateId}">Spark Rebellion</button>
      <button type="button" data-god="smite" data-state="${stateId}">Smite Ruler</button>
      <button type="button" data-god="war" data-state="${stateId}">Force War</button>
      ${hasFactions ? `<button type="button" data-god="assault-state-faction" data-state="${stateId}">Assault Faction</button>` : ""}
      ${hasFactions ? `<button type="button" data-god="delve-state-faction" data-state="${stateId}">Send Adventurers</button>` : ""}
      ${hasAscendableFaction ? `<button type="button" data-god="ascend-state-faction" data-state="${stateId}">Ascend Faction</button>` : ""}
      ${hasFactions ? `<button type="button" data-god="smite-state-faction" data-state="${stateId}">Smite Faction</button>` : ""}
      ${canSpawnStateFaction ? `<button type="button" data-god="spawn-state-faction" data-state="${stateId}">Spawn Faction</button>` : ""}
    </div>`;
}

function renderRuler(ruler: HistoricalFigure | undefined, _age?: number): string {
  if (!ruler)
    return `<div class="livingSection"><div class="livingSectionTitle">Ruler</div><span class="livingMuted">No ruler</span></div>`;

  const culture = pack.cultures?.[ruler.culture]?.name;
  const alignment = ruler.alignment
    ? `<span class="livingBadge" style="background:${ALIGNMENT_COLORS[ruler.alignment]}">${ruler.alignment}</span>`
    : "";
  const virtues = (ruler.virtues ?? []).map(escapeHtml).join(", ");
  const vices = (ruler.vices ?? []).map(escapeHtml).join(", ");
  const traits = [virtues, vices].filter(Boolean).join(" · ");

  return /* html */ `
    <div class="livingSection">
      <div class="livingSectionTitle">Ruler: <span>${escapeHtml(ruler.name)}</span> (${escapeHtml(culture)}) ${alignment}</div>
      ${traits ? `<div class="livingTraits">${traits}</div>` : ""}
    </div>`;
}

const percent = (value: number | null | undefined): string => (value == null ? "—" : `${Math.round(value * 100)}%`);

const FISCAL_LINES: readonly [FiscalLock, string, string][] = [
  ["pollTax", "👥", "Poll tax"],
  ["salesTax", "🧾", "Sales tax"],
  ["corruption", "🤝", "Corruption"],
  ["court", "👑", "Court"],
  ["administration", "🖋️", "Administration"],
  ["infrastructure", "🏗️", "Infrastructure"],
  ["military", "⚔️", "Military"]
];

/** Two fixed rows: taxes and corruption above, the spending lines below */
const FISCAL_ROWS = [FISCAL_LINES.slice(0, 3), FISCAL_LINES.slice(3)];

/** Phase 3: the ruler's fiscal target against the real budget, with pin buttons. */
function renderFiscal(stateId: number): string {
  const policy = Living.fiscalPolicy?.(stateId);
  if (!policy) return "";

  const chip = ([line, icon, label]: readonly [FiscalLock, string, string]) => {
    const locked = policy.locks.includes(line);
    const current = policy.current[line];
    const target = policy.target[line];
    const isTax = line === "salesTax" || line === "pollTax";
    const format = (value: number) => (isTax ? `${Math.round(value * 1000) / 10}%` : `${Math.round(value)}%`);
    const title = `${label}: ${Math.round(current)} → ${Math.round(target)} (drift ${policy.stride}/spring). Click to ${locked ? "unpin" : "pin"}.`;
    return `<button type="button" class="livingCivChip" data-god="fiscal-lock" data-state="${stateId}" data-line="${line}" title="${escapeHtml(title)}"${locked ? ' style="outline:1px solid #c4a000;"' : ""}>${icon} ${format(current)}→${format(target)}${locked ? " 🔒" : ""}</button>`;
  };
  const rows = FISCAL_ROWS.map(row => `<div class="livingChipRow">${row.map(chip).join("")}</div>`).join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Fiscal policy <span class="livingMuted">· ruler's target, drifting ${policy.stride}/spring</span></div>
    <div class="livingChipRows">${rows}</div>
  </div>`;
}

/** Phase 4: the works under construction and the daily lines they pay. */
function renderProjects(stateId: number): string {
  const living = Living.getState();
  const sSim = living.states[stateId];
  if (!sSim) return "";
  const active = sSim.project;
  const built = (living.projects ?? []).filter(project => project.stateId === stateId);
  if (!active && built.length === 0) return "";

  const targetName = (scale: string, targetId: number) => {
    if (scale === "state") return pack.states[stateId]?.name ?? "";
    if (scale === "province") return pack.provinces?.[targetId]?.name ?? `Province ${targetId}`;
    return pack.burgs?.[targetId]?.name ?? `Burg ${targetId}`;
  };

  const activeDef = active ? PROJECT_BY_ID[active.id] : undefined;
  const activeName = activeDef ? projectName(activeDef) : (active?.id.replace(/_/g, " ") ?? "");
  const activeRow = active
    ? `<div class="livingMuted">🏗️ ${escapeHtml(activeName)} · ${escapeHtml(
        targetName(active.scale, active.targetId)
      )} · ${active.turnsLeft} ${t("seasons left")}</div>`
    : "";
  const rows = built
    .slice(-8)
    .map(project => {
      const line = project.line ? ` +${project.line.value}/day` : "";
      return `<span class="livingCivChip" title="${escapeHtml(project.name)}${escapeHtml(line)}">🏛️ ${escapeHtml(
        project.name
      )}${line}</span>`;
    })
    .join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Public works${built.length ? ` <span class="livingMuted">· ${built.length}</span>` : ""}</div>
    ${activeRow}
    <div class="livingPoolVitals">${rows}</div>
  </div>`;
}

/** The era a development level falls in, as the upstream schema names it */
function eraOf(level: number): string {
  return options.map.eras?.length ? Development.getEra(level) : "";
}

/** §6.2: the upstream economy behind the state, its court's books and its forces' upkeep. */
function renderUpstreamState(stateId: number): string {
  const readable = canReadUpstreamEconomy();
  const prosperity = readable ? Accounts.ofState(stateId)?.prosperity : undefined;
  const stability = readable ? Stability.get(stateId)?.stability : undefined;
  const development =
    pack.cells.h && pack.cells.development ? Development.getAverages(pack.cells.state)[stateId] : undefined;
  const upkeep = Military.getUpkeep(stateId);
  const battle = Military.getLivingBattleUpkeep(stateId);
  if (prosperity == null && stability == null && development == null && upkeep === 1) return "";
  const era = development == null ? "" : eraOf(development);

  const treasury = `<button type="button" class="livingCivChip" data-open="budget" data-id="${stateId}" title="Treasury and the season's net balance: open the state budget">${getMoneySymbol("🪙")} ${Math.round(Number(pack.states[stateId]?.economy?.treasury ?? 0))} treasury</button>`;
  const developmentChip =
    development == null
      ? ""
      : `<span class="livingCivChip" title="The people's mean development and era: it unlocks goods and unit tiers and raises output">🧪 ${Math.round(development)}${era ? ` · ${escapeHtml(era)}` : ""}</span>`;

  const rows = [
    [
      treasury,
      prosperity == null
        ? ""
        : `<button type="button" class="livingCivChip" data-open="economy" data-id="${stateId}" title="Open the state's agriculture, crafts and trade">🏙️ ${percent(prosperity)} prosperity</button>`,
      stability == null
        ? ""
        : `<button type="button" class="livingCivChip" data-open="stability" data-id="${stateId}" title="Open the state's and its provinces' stability">⚖️ ${percent(stability)} stability</button>`
    ],
    [
      `<span class="livingCivChip" title="Share of the military spending its forces need; below it they fight worse">⚔️ ${percent(upkeep)} upkeep · ×${battle.toFixed(2)}</span>`,
      developmentChip
    ]
  ]
    .map(row => `<div class="livingChipRow">${row.filter(Boolean).join("")}</div>`)
    .join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Upstream economy</div>
    <div class="livingChipRows">${rows}</div>
  </div>`;
}

/** A burg's trade this run: what it sold less what it bought */
function burgTradeBalance(burgId: number): number {
  let balance = 0;
  for (const deal of pack.deals ?? []) {
    if (deal[0] !== burgId) continue;
    const value = Deals.getGoodsValue(deal);
    balance += deal[3] === DEAL_KINDS.sale ? value : -value;
  }
  return balance;
}

/** §6.2: a city's upstream prosperity and trade balance. */
function renderUpstreamBurg(burgId: number): string {
  if (!canReadUpstreamEconomy()) return "";
  const prosperity = Prosperity.getBurg(burgId)?.prosperity;
  const balance = burgTradeBalance(burgId);
  if (prosperity == null && !balance) return "";

  const trade = balance
    ? `<span class="livingCivChip" title="What the burg sold less what it bought in the last run">${balance > 0 ? "▲" : "▼"} ${Math.abs(Math.round(balance))} trade</span>`
    : "";
  return `<div class="livingSection">
    <div class="livingSectionTitle">Upstream economy</div>
    <div class="livingPoolVitals">
      <button type="button" class="livingCivChip" data-open="burg-economy" data-id="${burgId}" title="Open the burg's production, consumption and balance">🏙️ ${percent(prosperity)} prosperity</button>
      ${trade}
    </div>
  </div>`;
}

/** §6.2: a cell's development, prosperity, improvement, deposit and rural output. */
function renderCellCard(cellId: number): string {
  const living = Living.getState();
  const stateId = pack.cells.state?.[cellId] ?? 0;
  const provinceId = pack.cells.province?.[cellId] ?? 0;
  const burgId = pack.cells.burg?.[cellId] ?? 0;
  const biome = pack.biomes?.[pack.cells.biome?.[cellId] ?? 0]?.name;
  const level = pack.cells.h && pack.cells.development ? Development.ofCell(cellId) : undefined;
  const prosperity = pack.cells.prosperity?.[cellId];
  const depositId = Number(pack.cells.good?.[cellId] ?? 0);
  const deposit = depositId ? options.map.goods?.find(good => good.i === depositId)?.name : undefined;
  const cellSim = living.cells?.[cellId];
  const improvement = cellSim?.improvement
    ? (CIV_IMPROVEMENT_BY_ID[cellSim.improvement]?.name ?? cellSim.improvement)
    : undefined;

  let output = "";
  if (canReadUpstreamEconomy() && pack.cells.development) {
    try {
      const produced = Output.ofCell(cellId);
      output = Object.entries(produced)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 4)
        .map(([goodId, units]) => {
          const good = options.map.goods?.find(entry => entry.i === Number(goodId));
          return `${escapeHtml(good?.name ?? goodId)} ${Math.round(Number(units) * 10) / 10}`;
        })
        .join(" · ");
    } catch {
      output = ""; // a stripped pack cannot price rural produce
    }
  }

  const state = stateId ? pack.states?.[stateId] : undefined;
  const province = provinceId ? pack.provinces?.[provinceId] : undefined;
  const burg = burgId ? pack.burgs?.[burgId] : undefined;

  return /* html */ `
    <div class="livingInspectorTitle">Cell ${cellId}</div>
    <div class="livingMuted">${escapeHtml(biome ?? "Unclaimed land")}${state?.i ? ` · ${escapeHtml(state.name ?? "")}` : " · wildlands"}</div>
    <div class="livingSection">
      <div class="livingMuted">
        ${level == null ? "No development" : `${Math.round(level)} development${eraOf(level) ? ` · ${escapeHtml(eraOf(level))}` : ""}`}
        ${prosperity == null ? "" : ` · ${prosperity}% prosperity`}
      </div>
      <div class="livingMuted">
        ${deposit ? `Deposit: ${escapeHtml(deposit)}` : "No deposit"}${improvement ? ` · ${escapeHtml(improvement)}` : ""}${cellSim?.pillaged ? " · pillaged" : ""}
      </div>
      ${output ? `<div class="livingMuted">Output: ${output}</div>` : ""}
    </div>
    <div class="livingSection">
      <div class="livingSectionTitle">Held by</div>
      <div class="livingCapacityRow" title="Click to zoom to the cell">
        <span>${escapeHtml(state?.name ?? "Wildlands")}${province?.i ? ` · ${escapeHtml(province.name ?? "Province")}` : ""}${burg?.i ? ` · ${escapeHtml(burg.name ?? "Burg")}` : ""}</span>
        <button type="button" class="livingLinkBtn" data-zoom-cell="${cellId}">Zoom</button>
      </div>
    </div>`;
}

const INSTABILITY_TOP = 55; // percent, the band where rebellions start

/** Provinces with low enough stability to matter, with their rebellion age */
function renderStateInstability(stateId: number): string {
  const living = Living.getState();
  const owned = (pack.provinces ?? []).filter(p => p?.i && !p.removed && p.state === stateId);

  const rows = owned
    .map(p => {
      const stability = (Stability.getProvince(p.i)?.stability ?? 0) * 100;
      if (stability > INSTABILITY_TOP) return "";
      const stab = Math.round(stability);
      const rebellion = living.provinces?.[p.i]?.rebellion;
      const fire = rebellion ? ` 🔥[${rebellion.seasonsActive}]` : "";
      const rebellionTip = rebellion ? ` · Rebellion: ${rebellion.name}` : "";
      return `<div class="livingCapacityRow" title="${escapeHtml(p.name ?? "Province")}: stability ${stab}%${escapeHtml(rebellionTip)}">
        <span>⚠️ ${escapeHtml(p.name ?? "Province")}${fire}</span>
        <span class="livingMuted">${stab}%</span>
      </div>`;
    })
    .filter(Boolean)
    .join("");

  return rows ? `<div class="livingSectionTitle">Instability</div>${rows}` : "";
}

function renderStateNav(stateId: number): string {
  return `<div class="livingSection"><div class="livingSectionTitle">Manage</div>
    <div class="livingButtons" style="margin-top: 0.35em;">
      <button type="button" data-open="provinces" data-id="${stateId}">Provinces</button>
      <button type="button" data-open="burgs" data-id="${stateId}">Burgs</button>
      <button type="button" data-open="regiments" data-id="${stateId}">Regiments</button>
    </div></div>`;
}

function renderAgenda(sSim: StatePolitySim, living?: ReturnType<typeof Living.getState>): string {
  const agenda = sSim.agenda;
  if (!agenda)
    return `<div class="livingSection"><div class="livingSectionTitle">Agenda</div><span class="livingMuted">No active agenda</span></div>`;

  if (agenda.kind === "suppress_faction") {
    const factionId = agenda.targetFactionId;
    const faction = factionId !== undefined ? pack.factions?.[factionId] : undefined;
    const burg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
    const node =
      faction && burg
        ? faction.hq?.burgId === burg.i && !faction.hq.pillaged
          ? faction.hq
          : (faction.outposts ?? []).find(outpost => outpost.burgId === burg.i && !outpost.pillaged)
        : faction?.hq && !faction.hq.pillaged && !faction.hq.burgId
          ? faction.hq
          : undefined;
    const influence =
      node !== undefined ? ("tier" in node ? node.influence : (node.influence ?? undefined)) : undefined;
    const tick = living?.tick ?? 0;
    const stalled = agenda.stallUntilTick !== undefined && agenda.stallUntilTick > tick;
    const wilderness = agenda.targetCell !== undefined && !burg;
    const location = burg?.name ?? (wilderness ? "the wildlands" : "a burg");
    return /* html */ `
    <div class="livingSection">
      <div class="livingSectionTitle">Agenda</div>
      <div>Suppressing ${escapeHtml(faction?.name ?? "a faction")} in ${escapeHtml(location)}</div>
      <div class="livingMuted">Influence ${influence !== undefined ? `${Math.round(influence)}%` : "—"}${stalled ? " · stalled (defending army or failed storm)" : ""}${wilderness ? " · wilderness stronghold (military only)" : ""}</div>
    </div>`;
  }

  const ratio = agenda.required > 0 ? Math.min(100, Math.round((agenda.progress / agenda.required) * 100)) : 0;
  return /* html */ `
    <div class="livingSection">
      <div class="livingSectionTitle">Agenda</div>
      <div>${escapeHtml(agenda.label)} <span class="livingMuted">${agenda.progress} / ${agenda.required}</span></div>
      <div class="livingBar"><i style="width:${ratio}%"></i></div>
    </div>`;
}

function renderSuppressionTargets(stateId: number, sSim: StatePolitySim): string {
  const targets = Living.eligibleFactionSuppressionTargets?.(stateId) ?? [];
  const suppressing = sSim.agenda?.kind === "suppress_faction";
  if (targets.length === 0 && !suppressing) return "";
  const rows = targets
    .map(target => {
      const influence = "tier" in target.node ? target.node.influence : (target.node.influence ?? undefined);
      const location = target.burg?.name ?? "the wildlands";
      const wildernessTag = target.wilderness ? " · wilderness (military only)" : "";
      return `<li>
        <span class="livingMuted">${escapeHtml(target.faction.name)} · ${escapeHtml(location)}${escapeHtml(wildernessTag)} · Influence ${influence !== undefined ? `${Math.round(influence)}%` : "—"}</span>
        ${suppressing && sSim.agenda?.targetFactionId === target.faction.i ? `<span class="livingMuted"> (suppressing)</span>` : `<button type="button" data-guild="suppress-faction" data-state="${stateId}" data-faction="${target.faction.i}">Suppress faction</button>`}
      </li>`;
    })
    .join("");
  return `<div class="livingSection">
    <div class="livingSectionTitle">Suppression</div>
    ${rows ? `<ul>${rows}</ul>` : `<span class="livingMuted">No eligible local factions</span>`}
  </div>`;
}

function renderClaims(sSim: StatePolitySim): string {
  const claims = sSim.claims
    .map(claim => {
      const burg = pack.burgs[claim.burgId];
      if (!burg?.i || burg.removed) return "";
      const holder = pack.states[claim.heldByStateId];
      const name = burg.name ?? "Burg";
      const holderName = holder?.name ?? "no one";
      const text = `${name} - held by ${holderName} since ${claim.lostYear}`;
      return `<li><button type="button" class="livingLinkBtn" data-zoom-burg="${burg.i}" title="Zoom to ${escapeHtml(name)}">${escapeHtml(text)}</button></li>`;
    })
    .filter(Boolean);

  return claims.length > 0 ? `<div class="livingSectionTitle">Casus belli</div><ul>${claims.join("")}</ul>` : "";
}

function renderGrudges(sSim: StatePolitySim): string {
  if (sSim.grudges.length === 0) return "";

  const rows = sSim.grudges
    .slice(-4)
    .map(grudge => `<li>${escapeHtml(grudge.summary)} <span class="livingMuted">(${grudge.weight})</span></li>`)
    .join("");
  return `<div class="livingSectionTitle">Grudges</div><ul>${rows}</ul>`;
}

function renderProvinceCard(provinceId: number): string {
  const living = Living.getState();
  const province = pack.provinces?.[provinceId];
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim) return `<div class="livingPlaceholder">This province is gone.</div>`;

  const stateId = province.state ?? 0;
  const state = stateId ? pack.states[stateId] : undefined;
  const trouble = pSim.trouble;
  const tDef = trouble ? getTroubleDef(trouble.id) : undefined;
  const threat = hostileFactionInProvince(provinceId);
  const threatCapable = Boolean(threat?.sovereignAmbition);
  const cell = trouble?.cell ?? threat?.hq.cell ?? province.center ?? 0;

  const stabPct = Math.round((Stability.getProvince(provinceId)?.stability ?? 0) * 100);
  const rebellion = pSim.rebellion;
  return /* html */ `
    <button type="button" class="livingInspectorTitle" data-open="province" data-id="${provinceId}">Provinces Editor</button>
    <div class="livingMuted">${escapeHtml(state?.name ?? "Unclaimed")} · stability ${stabPct}%</div>
    ${
      rebellion
        ? `<div style="margin-top:0.3em;color:#a33d3d;"><strong>Rebellion:</strong> 🔥 ${escapeHtml(rebellion.name)} (${rebellion.seasonsActive} ${rebellion.seasonsActive === 1 ? "season" : "seasons"})</div>`
        : ""
    }
    ${
      trouble && tDef
        ? `<div style="margin-top:0.3em;color:${trouble.severity === "drain" ? "#a33d3d" : "#666"};"><strong>Trouble:</strong> ${escapeHtml(trouble.name || tDef.name)} (${trouble.severity === "drain" ? "Drain" : "Flavor"})</div>
           <div class="livingMuted">${escapeHtml(tDef.description)}</div>`
        : `<div class="livingMuted" style="margin-top:0.2em;">No active trouble</div>`
    }
    ${
      threat
        ? `<div style="margin-top:0.3em;color:#8b0000;"><strong>Faction:</strong> ${escapeHtml(threat.name)} (${escapeHtml(threat.allegiance)}) ${threatCapable ? `<span class="livingBadge" style="background:#5e3c6e">${escapeHtml(threat.stateForm ?? "State-Capable")}</span>` : ""}</div>
           <div class="livingMuted">Raid: ${threat.raidThreshold ?? 6}+, ${(threat.military ?? []).reduce((sum, r) => sum + (r.a ?? 0), 0)} fighters${threat.hq.fortified ? ", fortified" : ""}${threat.raidPending ? ", raid imminent" : ""}</div>`
        : `<div class="livingMuted" style="margin-top:0.2em;">No dangerous faction</div>`
    }
    <div class="livingGodTitle">Sandbox God Mode</div>
    <div class="livingButtons">
      ${
        trouble
          ? `<button type="button" data-god="quell-trouble" data-province="${provinceId}">Quell Trouble</button>`
          : `<button type="button" data-god="spawn-trouble" data-province="${provinceId}">Spawn Trouble</button>`
      }
      ${
        threat
          ? `${stateId ? `<button type="button" data-god="assault-faction" data-state="${stateId}" data-province="${provinceId}">Assault Faction</button>` : ""}
             ${stateId ? `<button type="button" data-god="delve-faction" data-state="${stateId}" data-province="${provinceId}">Send Adventurers</button>` : ""}
             ${threatCapable ? `<button type="button" data-god="ascend-faction" data-province="${provinceId}">Ascend Faction</button>` : ""}
             <button type="button" data-god="smite-faction" data-province="${provinceId}">Smite Faction</button>`
          : `<button type="button" data-god="spawn-faction" data-province="${provinceId}">Spawn Faction</button>`
      }
    </div>
    <button type="button" data-zoom-cell="${cell}" class="livingLinkBtn">Zoom</button>`;
}

function renderProvincesTroubles(stateId: number): string {
  const living = Living.getState();
  const state = pack.states[stateId];
  const lines = (state?.economy?.simAdjustments ?? []).filter(line => line.name.startsWith("Trouble: "));
  const ownedProvinces = (pack.provinces ?? []).filter(p => p?.i && !p.removed && p.state === stateId);
  const troubled = ownedProvinces
    .map(p => ({ province: p, pSim: living.provinces?.[p.i] }))
    .filter((entry): entry is { province: (typeof pack.provinces)[number]; pSim: ProvinceSimState } =>
      Boolean(entry.pSim?.trouble)
    );

  if (troubled.length === 0) return "";

  const rows = troubled
    .map(({ province, pSim }) => {
      const t = pSim.trouble!;
      const def = getTroubleDef(t.id);
      const name = t.name || def.name;
      const cell = t.cell || province.center || (province.burg ? pack.burgs[province.burg]?.cell : 0);
      const drain = lines.find(line => line.name.includes(province.name ?? ""))?.value;
      const text = `${province.name ?? "Province"}, ${name} (${t.severity === "drain" ? "Drain" : "Flavor"})${drain ? ` · ${drain}/day` : ""}`;
      return `<li><button type="button" class="livingLinkBtn" data-zoom-cell="${cell}" title="Zoom to ${escapeHtml(name)}">${escapeHtml(text)}</button></li>`;
    })
    .join("");
  return `<div class="livingSectionTitle">Troubles</div><ul>${rows}</ul>`;
}

function renderProvincesFactions(stateId: number): string {
  const ownedProvinces = (pack.provinces ?? []).filter(p => p?.i && !p.removed && p.state === stateId);
  const threatened = ownedProvinces
    .map(p => ({ province: p, threat: hostileFactionInProvince(p.i) }))
    .filter((entry): entry is { province: (typeof pack.provinces)[number]; threat: NonNullable<typeof entry.threat> } =>
      Boolean(entry.threat)
    );

  if (threatened.length === 0) return "";

  const rows = threatened
    .map(({ province, threat }) => {
      const name = threat.name;
      const cell = threat.hq.cell || province.center || (province.burg ? pack.burgs[province.burg]?.cell : 0);
      const men = (threat.military ?? []).reduce((s, r) => s + (r.a ?? 0), 0);
      const text = `${province.name ?? "Province"}, ${name} [${threat.allegiance}]`;
      const burgAttr = threat.hq.burgId ? ` data-zoom-burg="${threat.hq.burgId}"` : "";
      const badge = threat.sovereignAmbition
        ? ` <span class="livingBadge" style="background:#5e3c6e">${escapeHtml(threat.stateForm ?? "State-Capable")}</span>`
        : "";
      return `<li><button type="button" class="livingLinkBtn" data-zoom-cell="${cell}"${burgAttr} title="Zoom to ${escapeHtml(name)}">${escapeHtml(text)}</button>${badge} <span class="livingMuted">${men} fighters</span></li>`;
    })
    .join("");
  return `<div class="livingSectionTitle">Dangerous factions</div><ul>${rows}</ul>`;
}
function renderBurgCard(burgId: number): string {
  const living = Living.getState();
  const burg = pack.burgs[burgId];
  const bSim = living.burgs[burgId];
  if (!burg?.i || burg.removed || !bSim) return `<div class="livingPlaceholder">This burg is gone.</div>`;

  const stateId = burg.state ?? 0;
  const state = stateId ? pack.states[stateId] : undefined;
  const owner = state && !state.removed ? state.name : "Free Burg";
  const building = bSim.construction ? currentBuildingName(bSim.construction.buildingId) : "No construction";

  const provId = pack.cells.province?.[burg.cell] ?? 0;
  const province = provId ? pack.provinces?.[provId] : undefined;
  const pSim = provId ? living.provinces?.[provId] : undefined;
  const trouble = pSim?.trouble;
  const tDef = trouble ? getTroubleDef(trouble.id) : undefined;
  const threat = provId ? hostileFactionInProvince(provId) : null;
  const threatCapable = Boolean(threat?.sovereignAmbition);

  const provStab = provId ? Math.round((Stability.getProvince(provId)?.stability ?? 0) * 100) : 0;
  const rebellion = pSim?.rebellion;
  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(burg.name ?? "Burg")}</div>
    <div class="livingMuted">${escapeHtml(owner ?? "")} · tier ${bSim.baseTier} · pop ${burg.population ?? 0}</div>
    ${renderUpstreamBurg(burgId)}
    <div class="livingSection">
      <div class="livingSectionTitle">Asset</div>
      <div>${escapeHtml(building)}</div>
      ${bSim.construction ? `<div class="livingMuted">${bSim.construction.turnsLeft} turns left</div>` : ""}
      <div class="livingMuted">${bSim.buildings.length} standing structures</div>
    </div>
    ${
      province && pSim
        ? `<div class="livingSection">
            <div class="livingSectionTitle">Province: ${escapeHtml(province.name ?? "Province")}</div>
            <div class="livingMuted">Stability ${provStab}%</div>
            ${
              rebellion
                ? `<div style="margin-top:0.3em;color:#a33d3d;"><strong>Rebellion:</strong> 🔥 ${escapeHtml(rebellion.name)} (${rebellion.seasonsActive} ${rebellion.seasonsActive === 1 ? "season" : "seasons"})</div>`
                : ""
            }
            ${
              trouble && tDef
                ? `<div style="margin-top:0.3em;color:${trouble.severity === "drain" ? "#a33d3d" : "#666"};"><strong>Trouble:</strong> ${escapeHtml(trouble.name || tDef.name)} (${trouble.severity === "drain" ? "Drain" : "Flavor"})</div>
                   <div class="livingMuted">${escapeHtml(tDef.description)}</div>`
                : `<div class="livingMuted" style="margin-top:0.2em;">No active trouble</div>`
            }
            ${
              threat
                ? `<div style="margin-top:0.3em;color:#8b0000;"><strong>Faction:</strong> ${escapeHtml(threat.name)} (${escapeHtml(threat.allegiance)}) ${threatCapable ? `<span class="livingBadge" style="background:#5e3c6e">${escapeHtml(threat.stateForm ?? "State-Capable")}</span>` : ""}</div>
                   <div class="livingMuted">Raid: ${threat.raidThreshold ?? 6}+, ${(threat.military ?? []).reduce((sum, r) => sum + (r.a ?? 0), 0)} fighters${threat.hq.fortified ? ", fortified" : ""}${threat.raidPending ? ", raid imminent" : ""}</div>`
                : `<div class="livingMuted" style="margin-top:0.2em;">No dangerous faction</div>`
            }
          </div>`
        : ""
    }
    <div class="livingButtons">
      <button type="button" data-open="burg" data-id="${burgId}">Burg Editor</button>
      ${stateId ? `<button type="button" data-open="regiments" data-id="${stateId}">Regiments</button>` : ""}
    </div>
    <div class="livingGodTitle">Sandbox God Mode</div>
    <div class="livingButtons">
      ${stateId ? `<button type="button" data-god="spark" data-state="${stateId}" data-burg="${burgId}">Spark Rebellion</button>` : ""}
      <button type="button" data-god="pacify" data-burg="${burgId}">Pacify Unrest</button>
      <button type="button" data-god="complete" data-burg="${burgId}">Complete Asset</button>
      ${
        provId && trouble
          ? `<button type="button" data-god="quell-trouble" data-province="${provId}">Quell Trouble</button>`
          : provId
            ? `<button type="button" data-god="spawn-trouble" data-province="${provId}">Spawn Trouble</button>`
            : ""
      }
      ${
        provId && threat
          ? `${stateId ? `<button type="button" data-god="assault-faction" data-state="${stateId}" data-province="${provId}">Assault Faction</button>` : ""}
             ${stateId ? `<button type="button" data-god="delve-faction" data-state="${stateId}" data-province="${provId}">Send Adventurers</button>` : ""}
             ${threatCapable ? `<button type="button" data-god="ascend-faction" data-province="${provId}" data-burg="${burgId}">Ascend Faction</button>` : ""}
             <button type="button" data-god="smite-faction" data-province="${provId}">Smite Faction</button>`
          : provId
            ? `<button type="button" data-god="spawn-faction" data-province="${provId}">Spawn Faction</button>`
            : ""
      }
    </div>`;
}

function currentBuildingName(buildingId: string): string {
  return currentContent().content.buildings.find(building => building.id === buildingId)?.name ?? buildingId;
}

function zoomToLocation(cell?: number, burgId?: number): void {
  if (burgId && pack.burgs[burgId]) {
    const burg = pack.burgs[burgId];
    if (Number.isFinite(burg.x) && Number.isFinite(burg.y)) {
      zoomTo(burg.x, burg.y, 8, 1000);
      return;
    }
    if (burg.cell !== undefined) {
      const point = getCellPoint(burg.cell);
      if (point) {
        zoomTo(point[0], point[1], 8, 1000);
        return;
      }
    }
  }
  if (cell !== undefined && Number.isFinite(cell)) {
    const point = getCellPoint(cell);
    if (point) {
      zoomTo(point[0], point[1], 8, 1000);
      return;
    }
  }
}

function bindInspectorButtons(panel: HTMLElement): void {
  panel.querySelector<HTMLElement>("[data-inspector='close']")?.addEventListener("click", () => {
    selected = null;
    panel.style.display = "none";
  });

  for (const button of panel.querySelectorAll<HTMLElement>("[data-zoom-cell], [data-zoom-burg]")) {
    button.addEventListener("click", () => {
      const cell = Number(button.dataset.zoomCell ?? Number.NaN);
      const burgId = Number(button.dataset.zoomBurg ?? 0);
      zoomToLocation(Number.isFinite(cell) ? cell : undefined, burgId || undefined);
    });
  }

  for (const row of panel.querySelectorAll<HTMLElement>(".livingCapacityRow, .livingMeterRow")) {
    row.addEventListener("click", () => {
      const text = row.getAttribute("title");
      if (text) setStatus(text);
    });
  }

  for (const button of panel.querySelectorAll<HTMLElement>("[data-open]")) {
    button.addEventListener("click", () => {
      const id = Number(button.dataset.id ?? 0);
      switch (button.dataset.open) {
        case "states":
        case "state": {
          const state = pack.states[id];
          if (state && !state.removed) {
            dialogState.set("statesEditor", "filters", { search: state.name });
          }
          void Controllers.StatesEditor.open();
          break;
        }
        case "provinces": {
          dialogState.set("provincesEditor", "filters", { stateId: id, search: "" });
          void Controllers.ProvincesEditor.open();
          break;
        }
        case "economy":
          void Controllers.EconomyOverview.open("state", id);
          break;
        case "burg-economy":
          void Controllers.BurgEconomyOverview.open(id);
          break;
        case "stability":
          void Controllers.StabilityOverview.open(id);
          break;
        case "budget":
          void Controllers.StateBudgetEditor.open(id);
          break;
        case "burgs":
          void Controllers.BurgsOverview.open({ stateId: id });
          break;
        case "burg":
          void Controllers.BurgEditor.open(id);
          break;
        case "province":
          void Controllers.ProvincesEditor.open();
          break;
        case "regiments":
          void Controllers.RegimentsOverview.open(id);
          break;
      }
    });
  }

  for (const button of panel.querySelectorAll<HTMLElement>("[data-god]")) {
    button.addEventListener("click", () => runIntervention(button));
  }

  for (const button of panel.querySelectorAll<HTMLElement>("[data-guild]")) {
    button.addEventListener("click", () => runHeroCommand(button));
  }
}

/** Hero-sheet commands (paths, doctrine, push) plus the state suppression command. */
function runHeroCommand(button: HTMLElement): void {
  const stateId = Number(button.dataset.state ?? 0);
  const figureId = Number(button.dataset.figure ?? 0);
  let ok = false;
  let message = "";

  switch (button.dataset.guild) {
    case "suppress-faction": {
      const factionId = Number(button.dataset.faction ?? 0);
      ok = Living.startFactionSuppression(stateId, factionId);
      message = ok ? "The state has begun suppressing the faction." : "No eligible local faction node to suppress.";
      break;
    }
    case "hero-doctrine": {
      const doctrine = button.dataset.doctrine as HeroDoctrine | undefined;
      if (!doctrine) {
        message = "The doctrine could not be changed.";
        break;
      }
      ok = Living.setHeroDoctrine(figureId, doctrine);
      message = ok ? `Hero doctrine set to ${HERO_DOCTRINE_LABELS[doctrine]}.` : "The doctrine could not be changed.";
      break;
    }
    case "toggle-push": {
      const state = Living.getHeroState?.(figureId);
      ok = Living.setHeroPush(figureId, !state?.push);
      message = ok
        ? `Push ${!state?.push ? "enabled" : "disabled"} for this hero.`
        : "The push setting could not be changed.";
      break;
    }
    case "choose-path": {
      ok = Living.chooseHeroPath(figureId, button.dataset.path ?? "");
      message = ok ? "The hero's path is chosen." : "That path choice is not available.";
      break;
    }
    default:
      return;
  }

  afterTick();
  setStatus(message);
}

function runIntervention(button: HTMLElement): void {
  const stateId = Number(button.dataset.state ?? 0);
  const burgId = Number(button.dataset.burg ?? 0);
  const provId = Number(button.dataset.province ?? 0);
  let ok = false;
  let message = "";

  switch (button.dataset.god) {
    case "spark":
      ok = Living.sparkRebellion(stateId, burgId || undefined);
      message = ok ? "A rebellion has been sparked." : "No burg could be stirred to revolt.";
      break;
    case "smite":
      ok = Living.smiteRuler(stateId);
      message = ok ? "The ruler has been struck down." : "There is no living ruler to smite.";
      break;
    case "fiscal-lock": {
      const line = button.dataset.line as FiscalLock | undefined;
      if (!line) {
        message = "The fiscal line could not be pinned.";
        break;
      }
      ok = Living.toggleFiscalLock(stateId, line);
      message = ok
        ? `The ${line} line is pinned; the ruler cannot drift it.`
        : `The ${line} line drifts with the ruler again.`;
      break;
    }
    case "war":
      ok = Living.forceWar(stateId);
      message = ok ? "War has been declared." : "No rival could be found.";
      break;
    case "pacify":
      ok = Living.pacifyBurg(burgId);
      message = ok ? "The burg has been pacified." : "There is no unrest to pacify.";
      break;
    case "complete":
      ok = Living.completeAsset(burgId);
      message = ok ? "The asset has been completed." : "No asset can be completed here.";
      break;
    case "spawn-trouble": {
      const res = Living.spawnTrouble(provId);
      ok = Boolean(res);
      message = res ? `Named provincial instability: ${res.name}.` : "Failed to assign trouble.";
      break;
    }
    case "quell-trouble":
      ok = Living.quellTrouble(provId);
      message = ok ? "The provincial trouble has been quelled." : "No trouble to quell.";
      break;
    case "spawn-faction": {
      const res = Living.spawnDangerousFaction(provId);
      ok = Boolean(res);
      message = ok ? "A dangerous faction has taken root in the province." : "Failed to spawn faction.";
      break;
    }
    case "smite-faction":
      ok = Living.smiteFaction(provId);
      message = ok ? "The faction was smitten by divine wrath." : "No faction to smite.";
      break;
    case "assault-faction":
      ok = Living.assaultFaction(stateId, provId);
      message = ok ? "The military expedition destroyed the faction!" : "The expedition failed to destroy the faction.";
      break;
    case "delve-faction":
      ok = Living.sendAdventurersToFaction(stateId, provId);
      message = ok
        ? "The adventuring party vanquished the faction!"
        : "The adventuring party failed to destroy the faction.";
      break;
    case "ascend-faction": {
      const threat = hostileFactionInProvince(provId);
      const newStateId = threat ? Living.ascendFactionToState(threat.i, burgId || undefined) : null;
      ok = newStateId !== null;
      const newState = newStateId ? pack.states[newStateId] : undefined;
      message = ok
        ? `The faction ascended into ${newState?.fullName ?? newState?.name ?? "a sovereign state"}!`
        : "This faction cannot form a state.";
      break;
    }
    case "ascend-state-faction": {
      const threat =
        Factions.active().find(
          f => (f.allegiance === "hostile" || f.allegiance === "clandestine") && f.sovereignAmbition
        ) ?? null;
      const provIdForState = threat ? provIdOfFaction(threat) : undefined;
      if (threat && provIdForState) {
        const newStateId = Living.ascendFactionToState(threat.i);
        ok = newStateId !== null;
        const newState = newStateId ? pack.states[newStateId] : undefined;
        const prov = pack.provinces?.[provIdForState];
        message = ok
          ? `${threat.name} in ${prov?.name} ascended into ${newState?.fullName ?? newState?.name ?? "a sovereign state"}!`
          : `${threat.name} could not form a state.`;
      } else {
        ok = false;
        message = "No ambitious dangerous faction in the state.";
      }
      break;
    }
    case "spawn-state-faction": {
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && !hostileFactionInProvince(p.i)
      );
      if (prov) {
        const res = Living.spawnDangerousFaction(prov.i);
        ok = Boolean(res);
        message = ok ? `A dangerous faction arose in ${prov.name}!` : `Failed to spawn faction in ${prov.name}.`;
      } else {
        ok = false;
        message = "All provinces already harbor factions.";
      }
      break;
    }
    case "assault-state-faction": {
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && hostileFactionInProvince(p.i)
      );
      if (prov) {
        ok = Living.assaultFaction(stateId, prov.i);
        message = ok
          ? `The expedition destroyed the faction in ${prov.name}!`
          : `The expedition against the faction in ${prov.name} failed.`;
      } else {
        ok = false;
        message = "No dangerous faction in the state.";
      }
      break;
    }
    case "delve-state-faction": {
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && hostileFactionInProvince(p.i)
      );
      if (prov) {
        ok = Living.sendAdventurersToFaction(stateId, prov.i);
        message = ok
          ? `The adventuring party vanquished the faction in ${prov.name}!`
          : `The adventurers in ${prov.name} failed to destroy the faction.`;
      } else {
        ok = false;
        message = "No dangerous faction in the state.";
      }
      break;
    }
    case "smite-state-faction": {
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && hostileFactionInProvince(p.i)
      );
      if (prov) {
        ok = Living.smiteFaction(prov.i);
        message = ok ? `The faction in ${prov.name} was smitten!` : `Failed to smite faction in ${prov.name}.`;
      } else {
        ok = false;
        message = "No dangerous faction in the state.";
      }
      break;
    }
    default:
      return;
  }

  afterTick();
  setStatus(message);
}

function setStatus(message: string): void {
  const status = findEl("livingHudStatus");
  if (status) status.textContent = message;
}

function clearToasts(): void {
  document.querySelectorAll(".livingToast").forEach(toast => {
    toast.remove();
  });
}

/** Open the HUD and select an entity (used by the native editors and map commands). */
function inspect(kind: Selection["kind"], id: number): void {
  open();
  if (kind === "state") selectState(id);
  else if (kind === "burg") selectBurg(id);
  else if (kind === "province") selectProvince(id);
  else {
    selected = { kind, id } as Selection;
    renderInspector();
  }
}

export const LivingHud = { open, close, toggle, refresh, inspect, selectMarker };
