// The Living World HUD: a seasonal clock, a live news ticker and a god-mode inspector.
// See docs/plans/living-world.md (slice 5)
import { Controllers } from "@/controllers";
import { ACTION_DEFS, DIE_SIDES } from "@/data/character-actions";
import { ALIGNMENT_COLORS } from "@/data/culture-traits";
import { figureArchetype, figureDisciplines, HERO_ARCHETYPES, pendingPathLevel } from "@/data/hero-archetypes";
import { activeAspects } from "@/data/hero-aspects";
import { HERO_DISCIPLINES, matchingDisciplines } from "@/data/hero-disciplines";
import { HERO_INJURY_LABELS, heroTemperamentTags, injuryIsActive } from "@/data/hero-vitals";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { resolveCivTechName } from "@/data/living-civ-themes";
import { getLairDef, isLairStateCapable } from "@/data/living-lairs";
import { getTroubleDef, isTroubleStatePromotable, SAVE_KIND_LABELS, UNIT_ROLE_LABELS } from "@/data/living-troubles";
import { currentContent } from "@/data/roster-store";
import { Pack } from "@/model/graph/pack-generator";
import {
  activeCivThemeId,
  factionSuppressionProductionCost,
  figureLevel,
  Living
} from "@/model/physical/living-generator";
import { ensureHeroSheet } from "@/model/physical/living-heroes";
import { Military } from "@/model/political/military-generator";
import { getCellPoint } from "@/model/story/journeys/journey-places";
import { drawLivingOverlay, removeLivingOverlay } from "@/renderers/draw-living-overlay";
import { Layers } from "@/renderers/layers";
import type { HistoricalFigure } from "@/types/history";
import {
  type HeroDoctrine,
  type HeroGuildState,
  type LivingNewsItem,
  type MissionTag,
  type ProvinceSimState,
  SEASON_NAMES,
  type StatePolitySim,
  type YieldValues
} from "@/types/living";
import { dialogState } from "@/ui/dialog/state";
import { zoomTo } from "@/ui/map/zoom";
import { escapeHtml, findEl, getPointer } from "@/utils";

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
  findEl(HUD_ID)?.remove();
  removeLivingOverlay();
  const inspector = findEl(INSPECTOR_ID);
  if (inspector) inspector.remove();
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
  Layers.draw("states", "borders", "provinces", "labels", "burgIcons", "military", "markers", "trouble");
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

function attachMapSelection(): void {
  const map = document.getElementById("viewbox");
  map?.addEventListener("click", event => onMapClick(event.currentTarget as SVGElement, event));
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

  const stateId = pack.cells.state?.[cell] ?? 0;
  if (stateId) {
    selectState(stateId);
    return;
  }

  const marker = (pack.markers ?? []).find(entry => entry?.cell === cell);
  if (marker) {
    selectMarker(marker.i);
  }
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

function rememberProvinceTarget(provinceId: number): void {
  const living = Living.getState();
  const province = pack.provinces?.[provinceId];
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || !pSim) return;
  if (pSim.trouble) rememberTarget(`Fit for ${pSim.trouble.name}`, ["combat", "trouble"]);
  else if (pSim.lair) rememberTarget(`Fit for ${pSim.lair.name}`, ["combat", "lair"]);
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
    return Boolean(sim?.trouble || sim?.lair);
  });
  if (province) rememberProvinceTarget(province.i);
  selected = { kind: "state", id: stateId };
  renderInspector();
}

function selectBurg(burgId: number): void {
  const living = Living.getState();
  if ((living.burgs?.[burgId]?.unrest ?? 0) > 0) rememberTarget("Fit for unrest", ["social", "order"]);
  selected = { kind: "burg", id: burgId };
  renderInspector();
}

function selectProvince(provinceId: number): void {
  rememberProvinceTarget(provinceId);
  selected = { kind: "province", id: provinceId };
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
  const hasTroubled = (pack.provinces ?? []).some(
    p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.trouble
  );
  const hasPromotableTrouble = (pack.provinces ?? []).some(p => {
    const t = p?.i && !p.removed && p.state === stateId ? living.provinces?.[p.i]?.trouble : undefined;
    return Boolean(t && isTroubleStatePromotable(t.id));
  });
  const hasLairs = (pack.provinces ?? []).some(
    p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.lair
  );
  const hasAscendableLair = (pack.provinces ?? []).some(p => {
    const l = p?.i && !p.removed && p.state === stateId ? living.provinces?.[p.i]?.lair : undefined;
    return Boolean(l && isLairStateCapable(l.id));
  });
  const canSpawnStateLair = (pack.provinces ?? []).some(
    p => p?.i && !p.removed && p.state === stateId && !living.provinces?.[p.i]?.lair
  );

  return /* html */ `
    <button type="button" class="livingInspectorTitle" data-open="states" data-id="${stateId}" title="States editor">${escapeHtml(state.fullName ?? state.name ?? "State")}</button>
    ${renderRuler(ruler, age)}
    ${renderCivState(sSim, stateId)}
    ${renderStateProvinces(stateId)}
    ${renderEconomy(sSim, stateId)}
    ${renderAgenda(sSim, stateId, living)}
    ${renderSuppressionTargets(stateId, sSim)}
    <div class="livingSection">
      <div class="livingSectionTitle">Stability</div>
      ${renderMeter("Unravel", sSim.unravel, true)}
      ${renderMeter("Exhaustion", sSim.warExhaustion, false)}
    </div>
    <div class="livingSection">
      <div class="livingSectionTitle">Claims & Grudges</div>
      ${
        [
          renderProvincesLairs(stateId),
          renderProvincesTroubles(stateId),
          renderRestiveBurgs(stateId),
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
      ${hasTroubled ? `<button type="button" data-god="resolve-state-trouble" data-state="${stateId}">Resolve Trouble</button>` : ""}
      ${hasPromotableTrouble ? `<button type="button" data-god="promote-state-trouble" data-state="${stateId}">Promote to State</button>` : ""}
      ${hasLairs ? `<button type="button" data-god="assault-state-lair" data-state="${stateId}">Assault Lair</button>` : ""}
      ${hasLairs ? `<button type="button" data-god="delve-state-lair" data-state="${stateId}">Send Adventurers</button>` : ""}
      ${hasAscendableLair ? `<button type="button" data-god="ascend-state-lair" data-state="${stateId}">Ascend Lair</button>` : ""}
      ${hasLairs ? `<button type="button" data-god="smite-state-lair" data-state="${stateId}">Smite Lair</button>` : ""}
      ${canSpawnStateLair ? `<button type="button" data-god="spawn-state-lair" data-state="${stateId}">Spawn Lair</button>` : ""}
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

const CIV_YIELD_CHIPS: readonly [keyof YieldValues, string, string][] = [
  ["food", "🌾", "Food"],
  ["production", "🔨", "Production"],
  ["gold", "🪙", "Gold"],
  ["science", "🔬", "Science"],
  ["culture", "🎭", "Culture"],
  ["faith", "✨", "Faith"]
];

function yieldChips(yields: YieldValues | undefined): string {
  if (!yields) return "";
  return CIV_YIELD_CHIPS.map(
    ([key, icon, label]) =>
      `<span class="livingCivChip" title="${label}">${icon} ${Math.round(yields[key] ?? 0)}</span>`
  ).join("");
}

/** The OpenCiv empire panel: yields, research, happiness and treasury. */
function renderCivState(sSim: StatePolitySim, stateId: number): string {
  const yields = sSim.yieldsPerTurn;
  if (!yields && sSim.happiness === undefined && sSim.faith === undefined) return "";

  const happinessIcon = (sSim.happiness ?? 0) >= 0 ? "🙂" : "☹️";
  const happinessChip = `<span class="livingCivChip" title="Empire Happiness">${happinessIcon} ${Math.round(
    sSim.happiness ?? 0
  )}</span>`;
  const treasuryChip = `<span class="livingCivChip" title="Treasury">🪙 ${Math.round(
    pack.states[stateId]?.treasury ?? 0
  )}</span>`;

  const tech = sSim.currentTechId ? CIV_TECH_BY_ID[sSim.currentTechId] : undefined;
  const techName = tech ? resolveCivTechName(activeCivThemeId(), tech) : "No research";
  const banked = tech ? Math.round(sSim.researchedProgress?.[tech.id] ?? 0) : 0;
  const techProgress = tech
    ? `<div class="livingBar"><i style="width:${Math.min(
        100,
        Math.round((banked / Math.max(1, tech.cost)) * 100)
      )}%"></i></div>
       <div class="livingMuted">${escapeHtml(techName)}: ${banked} / ${tech.cost} science · ${
         sSim.researchedTechs?.length ?? 0
       } technologies known</div>`
    : `<div class="livingMuted">No technology selected</div>`;

  const list = `<div class="livingPoolVitals">${yieldChips(yields)}${happinessChip}${treasuryChip}</div>`;

  return `<div class="livingSection">
    <div class="livingSectionTitle">Empire</div>
    ${list}
    ${techProgress}
  </div>`;
}

function renderStateProvinces(stateId: number): string {
  const living = Living.getState();
  const owned = (pack.provinces ?? []).filter(p => p?.i && !p.removed && p.state === stateId);
  if (owned.length === 0) return "";

  const rows = owned
    .map(p => {
      const pSim = living.provinces?.[p.i];
      const order = Math.round(pSim?.order ?? 0);
      const stability = pSim?.stability ?? 0;
      const markers = [pSim?.trouble ? "⚠️" : "", pSim?.lair ? "💀" : ""].filter(Boolean).join("");
      return `<div class="livingCapacityRow" title="${escapeHtml(p.name ?? "Province")}: order ${order}%, stability ${stability}">
        <span>${escapeHtml(p.name ?? "Province")}${markers ? ` ${markers}` : ""}</span>
        <span class="livingMuted">${order}% · S${stability}</span>
      </div>`;
    })
    .join("");

  return `<div class="livingSection"><div class="livingSectionTitle">Provinces</div>${rows}</div>`;
}

function renderEconomy(sSim: StatePolitySim, stateId: number): string {
  const yields = sSim.yieldsPerTurn;
  if (!yields) return "";

  const list = [
    ["Gold", `${Math.round(pack.states[stateId]?.treasury ?? 0)}g`],
    ["Science", `${Math.round(yields.science ?? 0)}`],
    ["Faith", `${Math.round(sSim.faith ?? 0)}`]
  ]
    .map(
      ([label, value]) =>
        `<div class="livingMeterRow"><span class="livingCapacityLabel">${escapeHtml(label)}</span><span class="livingMuted">${escapeHtml(value)}</span></div>`
    )
    .join("");

  const buttons = stateId
    ? `<div class="livingButtons" style="margin-top: 0.35em;">
        <button type="button" data-open="cities" data-id="${stateId}">Cities &amp; Yields</button>
        <button type="button" data-open="provinces" data-id="${stateId}">Provinces</button>
        <button type="button" data-open="burgs" data-id="${stateId}">Burgs</button>
        <button type="button" data-open="regiments" data-id="${stateId}">Regiments</button>
      </div>`
    : "";

  return `<div class="livingSection"><div class="livingSectionTitle">Economy</div>${list}${buttons}</div>`;
}

function renderAgenda(
  sSim: StatePolitySim,
  stateId?: number,
  living?: ReturnType<typeof Living.getState>
): string {
  const agenda = sSim.agenda;
  if (!agenda)
    return `<div class="livingSection"><div class="livingSectionTitle">Agenda</div><span class="livingMuted">No active agenda</span></div>`;

  if (agenda.kind === "suppress_faction") {
    const factionId = agenda.targetFactionId;
    const faction = factionId !== undefined ? pack.factions?.[factionId] : undefined;
    const burg = agenda.targetBurgId !== undefined ? pack.burgs[agenda.targetBurgId] : undefined;
    const node =
      faction && burg
        ? (faction.hq?.burgId === burg.i && !faction.hq.pillaged
            ? faction.hq
            : (faction.outposts ?? []).find(outpost => outpost.burgId === burg.i && !outpost.pillaged))
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

function renderMeter(label: string, value: number, danger: boolean): string {
  const width = Math.max(0, Math.min(100, Math.round(value)));
  const tip = `${label}: ${width}%`;
  return `<div class="livingMeterRow" title="${escapeHtml(tip)}" tabindex="0">
    <span class="livingMeterLabel">${escapeHtml(label)}</span>
    <div class="livingBar${danger ? " danger" : ""}"><i style="width:${width}%"></i></div>
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

const UNREST_BINS = [
  { label: "Red", color: "#a33d3d", min: 17 },
  { label: "Orange", color: "#d96b27", min: 10 },
  { label: "Yellow", color: "#c99b24", min: 5 }
] as const;

function getUnrestBin(unrest: number): (typeof UNREST_BINS)[number] | null {
  if (unrest >= 17) return UNREST_BINS[0];
  if (unrest >= 10) return UNREST_BINS[1];
  if (unrest >= 5) return UNREST_BINS[2];
  return null;
}

function renderRestiveBurgs(stateId: number): string {
  const living = Living.getState();
  const restive = (pack.burgs ?? [])
    .filter(b => b?.i && !b.removed && b.state === stateId && (living.burgs[b.i]?.unrest ?? 0) >= 5)
    .map(b => ({ burg: b, unrest: living.burgs[b.i]?.unrest ?? 0 }));
  if (restive.length === 0) return "";

  const rows = restive
    .map(({ burg, unrest }) => {
      const bin = getUnrestBin(unrest)!;
      return `<li><button type="button" class="livingLinkBtn" data-zoom-burg="${burg.i}" title="Zoom to ${escapeHtml(burg.name ?? "Burg")}">
        <span style="color:${bin.color}; font-weight: bold;">■</span> ${escapeHtml(burg.name ?? "Burg")}
      </button></li>`;
    })
    .join("");
  return `<div class="livingSectionTitle">Restive Burgs</div><ul>${rows}</ul>`;
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
  const troublePromotable = Boolean(trouble && isTroubleStatePromotable(trouble.id));
  const lair = pSim.lair;
  const lairDef = lair ? getLairDef(lair.id) : undefined;
  const lairCapable = Boolean(lair && isLairStateCapable(lair.id));
  const cell = trouble?.cell ?? lair?.cell ?? province.center ?? 0;

  return /* html */ `
    <button type="button" class="livingInspectorTitle" data-open="province" data-id="${provinceId}">Provinces Editor</button>
    <div class="livingMuted">${escapeHtml(state?.name ?? "Unclaimed")} · order ${Math.round(pSim.order)}% · stability ${pSim.stability} · dev ${pSim.development}</div>
    ${
      trouble && tDef
        ? `<div style="margin-top:0.3em;color:#a33d3d;"><strong>Trouble:</strong> ${escapeHtml(tDef.name)} (Lv ${trouble.level}, ${trouble.theme}) ${troublePromotable ? `<span class="livingBadge" style="background:#8b2635">${escapeHtml(tDef.stateForm ?? "State-Capable")}</span>` : ""}</div>
           <div class="livingMuted">Save: ${SAVE_KIND_LABELS[tDef.save]} · Specialist: ${UNIT_ROLE_LABELS[tDef.requiredRole]}</div>`
        : `<div class="livingMuted" style="margin-top:0.2em;">No active trouble</div>`
    }
    ${
      lair
        ? `<div style="margin-top:0.3em;color:#8b0000;"><strong>Lair:</strong> ${escapeHtml(lair.name)} (Lv ${lair.level}, ${lair.theme}) ${lairCapable ? `<span class="livingBadge" style="background:#5e3c6e">${escapeHtml(lairDef?.stateForm ?? "State-Capable")}</span>` : ""}</div>`
        : `<div class="livingMuted" style="margin-top:0.2em;">No active lair</div>`
    }
    <div class="livingGodTitle">Sandbox God Mode</div>
    <div class="livingButtons">
      ${
        trouble
          ? `<button type="button" data-god="quell-trouble" data-province="${provinceId}">Quell Trouble</button>
             ${stateId ? `<button type="button" data-god="resolve-trouble" data-state="${stateId}" data-province="${provinceId}">Resolve Trouble</button>` : ""}
             ${troublePromotable ? `<button type="button" data-god="promote-trouble" data-province="${provinceId}">Promote to State</button>` : ""}`
          : `<button type="button" data-god="spawn-trouble" data-province="${provinceId}">Spawn Trouble</button>`
      }
      ${
        lair
          ? `${stateId ? `<button type="button" data-god="assault-lair" data-state="${stateId}" data-province="${provinceId}">Assault Lair</button>` : ""}
             ${stateId ? `<button type="button" data-god="delve-lair" data-state="${stateId}" data-province="${provinceId}">Send Adventurers</button>` : ""}
             ${lairCapable ? `<button type="button" data-god="ascend-lair" data-province="${provinceId}">Ascend Lair</button>` : ""}
             <button type="button" data-god="smite-lair" data-province="${provinceId}">Smite Lair</button>`
          : `<button type="button" data-god="spawn-lair" data-province="${provinceId}">Spawn Lair</button>`
      }
    </div>
    <button type="button" data-zoom-cell="${cell}" class="livingLinkBtn">Zoom</button>`;
}

function renderProvincesTroubles(stateId: number): string {
  const living = Living.getState();
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
      const text = `${province.name ?? "Province"}, ${name} [${t.level}]`;
      const burgAttr = t.burgId ? ` data-zoom-burg="${t.burgId}"` : "";
      return `<li><button type="button" class="livingLinkBtn" data-zoom-cell="${cell}"${burgAttr} title="Zoom to ${escapeHtml(name)}">${escapeHtml(text)}</button></li>`;
    })
    .join("");
  return `<div class="livingSectionTitle">Troubles</div><ul>${rows}</ul>`;
}

function renderProvincesLairs(stateId: number): string {
  const living = Living.getState();
  const ownedProvinces = (pack.provinces ?? []).filter(p => p?.i && !p.removed && p.state === stateId);
  const laired = ownedProvinces
    .map(p => ({ province: p, pSim: living.provinces?.[p.i] }))
    .filter((entry): entry is { province: (typeof pack.provinces)[number]; pSim: ProvinceSimState } =>
      Boolean(entry.pSim?.lair)
    );

  if (laired.length === 0) return "";

  const rows = laired
    .map(({ province, pSim }) => {
      const lair = pSim.lair!;
      const def = getLairDef(lair.id);
      const name = lair.name || def.name;
      const cell = lair.cell || province.center || (province.burg ? pack.burgs[province.burg]?.cell : 0);
      const text = `${province.name ?? "Province"}, ${name} [${lair.level}]`;
      const burgAttr = lair.burgId ? ` data-zoom-burg="${lair.burgId}"` : "";
      const stateForm = isLairStateCapable(lair.id) ? getLairDef(lair.id)?.stateForm : undefined;
      const badge = stateForm
        ? ` <span class="livingBadge" style="background:#5e3c6e">${escapeHtml(stateForm)}</span>`
        : "";
      return `<li><button type="button" class="livingLinkBtn" data-zoom-cell="${cell}"${burgAttr} title="Zoom to ${escapeHtml(name)}">${escapeHtml(text)}</button>${badge}</li>`;
    })
    .join("");
  return `<div class="livingSectionTitle">Lairs</div><ul>${rows}</ul>`;
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
  const troublePromotable = Boolean(trouble && isTroubleStatePromotable(trouble.id));
  const lair = pSim?.lair;
  const lairDef = lair ? getLairDef(lair.id) : undefined;
  const lairCapable = Boolean(lair && isLairStateCapable(lair.id));

  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(burg.name ?? "Burg")}</div>
    <div class="livingMuted">${escapeHtml(owner ?? "")} · tier ${bSim.baseTier} · pop ${burg.population ?? 0}</div>
    <div class="livingSection">
      <div class="livingSectionTitle">Unrest</div>
      ${renderMeter("Unrest", bSim.unrest, true)}
    </div>
    ${renderCivCity(bSim, burgId)}
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
            <div class="livingMuted">Order ${Math.round(pSim.order)}% · Stability ${pSim.stability} · Dev ${pSim.development}</div>
            ${
              trouble && tDef
                ? `<div style="margin-top:0.3em;color:#a33d3d;"><strong>Trouble:</strong> ${escapeHtml(tDef.name)} (Lv ${trouble.level}, ${trouble.theme}) ${troublePromotable ? `<span class="livingBadge" style="background:#8b2635">${escapeHtml(tDef.stateForm ?? "State-Capable")}</span>` : ""}</div>
                   <div class="livingMuted">Save: ${SAVE_KIND_LABELS[tDef.save]} · Specialist: ${UNIT_ROLE_LABELS[tDef.requiredRole]}</div>`
                : `<div class="livingMuted" style="margin-top:0.2em;">No active trouble</div>`
            }
            ${
              lair
                ? `<div style="margin-top:0.3em;color:#8b0000;"><strong>Lair:</strong> ${escapeHtml(lair.name)} (Lv ${lair.level}, ${lair.theme}) ${lairCapable ? `<span class="livingBadge" style="background:#5e3c6e">${escapeHtml(lairDef?.stateForm ?? "State-Capable")}</span>` : ""}</div>
                   <div class="livingMuted">Raid: ${lair.raidThreshold}+ · Defenders: ${lair.defenders.reduce((sum, u) => sum + (u.count ?? 0), 0)} men${lair.fortified ? " · Fortified" : ""}${lair.raidPending ? " · Raid Imminent" : ""}</div>`
                : `<div class="livingMuted" style="margin-top:0.2em;">No active lair</div>`
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
          ? `<button type="button" data-god="quell-trouble" data-province="${provId}">Quell Trouble</button>
             ${stateId ? `<button type="button" data-god="resolve-trouble" data-state="${stateId}" data-province="${provId}">Resolve Trouble</button>` : ""}
             ${troublePromotable ? `<button type="button" data-god="promote-trouble" data-province="${provId}" data-burg="${burgId}">Promote to State</button>` : ""}`
          : provId && !lair
            ? `<button type="button" data-god="spawn-trouble" data-province="${provId}">Spawn Trouble</button>`
            : ""
      }
      ${
        provId && lair
          ? `${stateId ? `<button type="button" data-god="assault-lair" data-state="${stateId}" data-province="${provId}">Assault Lair</button>` : ""}
             ${stateId ? `<button type="button" data-god="delve-lair" data-state="${stateId}" data-province="${provId}">Send Adventurers</button>` : ""}
             ${lairCapable ? `<button type="button" data-god="ascend-lair" data-province="${provId}" data-burg="${burgId}">Ascend Lair</button>` : ""}
             <button type="button" data-god="smite-lair" data-province="${provId}">Smite Lair</button>`
          : provId
            ? `<button type="button" data-god="spawn-lair" data-province="${provId}">Spawn Lair</button>`
            : ""
      }
    </div>`;
}

interface CitySimView {
  citizens?: number;
  cityYields?: YieldValues;
  foodStored?: number;
  cultureStored?: number;
  tilesAcquired?: number;
  productionQueue?: {
    kind: "unit" | "building" | "wonder" | "trouble" | "operation";
    id: string;
    targetFactionId?: number;
    targetNodeKey?: string;
  }[];
  productionProgress?: Record<string, number>;
  hp?: number;
  maxHp?: number;
  religionPressure?: Record<number, number>;
  civBuildings?: string[];
}

/** The OpenCiv city panel: yields, growth buckets, queue, HP and religious pressure. */
function renderCivCity(bSim: CitySimView, burgId: number): string {
  if (bSim.cityYields === undefined && bSim.citizens === undefined) return "";

  const queue = (bSim.productionQueue ?? [])
    .slice(0, 4)
    .map(item => {
      if (item.kind === "operation" && item.id === "faction-suppression") {
        const factionName = pack.factions?.[item.targetFactionId ?? 0]?.name ?? "faction";
        const cost = factionSuppressionProductionCost({ tier: 2 });
        const progress = Math.round(bSim.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
        return `<li>Suppressing ${escapeHtml(factionName)} <span class="livingGuildChipStatus">${progress} / ${cost}</span></li>`;
      }
      const def =
        item.kind === "unit"
          ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
          : CIV_BUILDING_BY_ID[item.id];
      const cost = Math.max(1, Math.round(def?.cost ?? 1));
      const progress = Math.round(bSim.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
      const name = def?.name ?? item.id;
      const icon = item.kind === "unit" ? "⚔️" : "🏛️";
      return `<li>${icon} ${escapeHtml(name)} <span class="livingGuildChipStatus">${progress} / ${cost}</span></li>`;
    })
    .join("");

  const pressure = Object.entries(bSim.religionPressure ?? {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([id, value]) => `${pack.religions?.[Number(id)]?.name ?? id}: ${Math.round(Number(value))}`)
    .join(" · ");

  return `<div class="livingSection">
    <div class="livingSectionTitle">City</div>
    <div class="livingPoolVitals">${yieldChips(bSim.cityYields)}</div>
    <div class="livingMuted">${bSim.citizens ?? 1} citizens · ${bSim.foodStored ?? 0} food · ${bSim.cultureStored ?? 0} culture</div>
    ${queue ? `<ul class="livingQueue">${queue}</ul>` : ""}
    ${pressure ? `<div class="livingMuted">${escapeHtml(pressure)}</div>` : ""}
    <button type="button" data-open="burg" data-id="${burgId}">Burg Editor</button>
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
        case "cities":
          void Controllers.StateCitiesDialog.open(id);
          break;
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
      message = ok ? "Trouble has arisen in the province." : "Failed to spawn trouble.";
      break;
    }
    case "quell-trouble":
      ok = Living.quellTrouble(provId);
      message = ok ? "The provincial trouble has been quelled." : "No trouble to quell.";
      break;
    case "resolve-trouble":
      ok = Living.resolveTrouble(stateId, provId);
      message = ok ? "The domain quashed the trouble!" : "The domain's effort failed.";
      break;
    case "resolve-state-trouble": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.trouble
      );
      if (prov) {
        ok = Living.resolveTrouble(stateId, prov.i);
        message = ok
          ? `The domain quashed the trouble in ${prov.name}!`
          : `The domain's effort in ${prov.name} failed.`;
      } else {
        ok = false;
        message = "No active trouble in the state.";
      }
      break;
    }
    case "promote-trouble": {
      const newStateId = Living.promoteTroubleToState(provId, burgId || undefined);
      ok = newStateId !== null;
      const newState = newStateId ? pack.states[newStateId] : undefined;
      message = ok
        ? `Trouble promoted to sovereign state: ${newState?.fullName ?? newState?.name ?? "New Realm"}!`
        : "This trouble cannot promote to a state.";
      break;
    }
    case "promote-state-trouble": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(p => {
        const t = p?.i && !p.removed && p.state === stateId ? living.provinces?.[p.i]?.trouble : undefined;
        return Boolean(t && isTroubleStatePromotable(t.id));
      });
      if (prov) {
        const newStateId = Living.promoteTroubleToState(prov.i);
        ok = newStateId !== null;
        const newState = newStateId ? pack.states[newStateId] : undefined;
        message = ok
          ? `Trouble in ${prov.name} proclaimed ${newState?.fullName ?? newState?.name ?? "a new state"}!`
          : `Trouble in ${prov.name} could not form a state.`;
      } else {
        ok = false;
        message = "No promotable trouble in the state.";
      }
      break;
    }
    case "spawn-lair": {
      const res = Living.spawnLair(provId);
      ok = Boolean(res);
      message = ok ? "A lair has arisen in the province." : "Failed to spawn lair.";
      break;
    }
    case "smite-lair":
      ok = Living.smiteLair(provId);
      message = ok ? "The lair was smitten by divine wrath." : "No lair to smite.";
      break;
    case "assault-lair":
      ok = Living.assaultLair(stateId, provId);
      message = ok ? "The military expedition destroyed the lair!" : "The expedition failed to destroy the lair.";
      break;
    case "delve-lair":
      ok = Living.sendAdventurersToLair(stateId, provId);
      message = ok ? "The adventuring party vanquished the lair!" : "The adventuring party failed to destroy the lair.";
      break;
    case "ascend-lair": {
      const newStateId = Living.ascendLairToState(provId, burgId || undefined);
      ok = newStateId !== null;
      const newState = newStateId ? pack.states[newStateId] : undefined;
      message = ok
        ? `The lair ascended into ${newState?.fullName ?? newState?.name ?? "a sovereign state"}!`
        : "This lair cannot form a state.";
      break;
    }
    case "ascend-state-lair": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(p => {
        const l = p?.i && !p.removed && p.state === stateId ? living.provinces?.[p.i]?.lair : undefined;
        return Boolean(l && isLairStateCapable(l.id));
      });
      if (prov) {
        const newStateId = Living.ascendLairToState(prov.i);
        ok = newStateId !== null;
        const newState = newStateId ? pack.states[newStateId] : undefined;
        message = ok
          ? `The lair in ${prov.name} ascended into ${newState?.fullName ?? newState?.name ?? "a sovereign state"}!`
          : `The lair in ${prov.name} could not form a state.`;
      } else {
        ok = false;
        message = "No state-capable lair in the state.";
      }
      break;
    }
    case "spawn-state-lair": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && !living.provinces?.[p.i]?.lair
      );
      if (prov) {
        const res = Living.spawnLair(prov.i);
        ok = Boolean(res);
        message = ok ? `A lair arose in ${prov.name}!` : `Failed to spawn lair in ${prov.name}.`;
      } else {
        ok = false;
        message = "All provinces already harbor lairs.";
      }
      break;
    }
    case "assault-state-lair": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.lair
      );
      if (prov) {
        ok = Living.assaultLair(stateId, prov.i);
        message = ok
          ? `The expedition destroyed the lair in ${prov.name}!`
          : `The expedition against the lair in ${prov.name} failed.`;
      } else {
        ok = false;
        message = "No active lair in the state.";
      }
      break;
    }
    case "delve-state-lair": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.lair
      );
      if (prov) {
        ok = Living.sendAdventurersToLair(stateId, prov.i);
        message = ok
          ? `The adventuring party vanquished the lair in ${prov.name}!`
          : `The adventurers in ${prov.name} failed to destroy the lair.`;
      } else {
        ok = false;
        message = "No active lair in the state.";
      }
      break;
    }
    case "smite-state-lair": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(
        p => p?.i && !p.removed && p.state === stateId && living.provinces?.[p.i]?.lair
      );
      if (prov) {
        ok = Living.smiteLair(prov.i);
        message = ok ? `The lair in ${prov.name} was smitten!` : `Failed to smite lair in ${prov.name}.`;
      } else {
        ok = false;
        message = "No active lair in the state.";
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
  document.querySelectorAll(".livingToast").forEach(toast => toast.remove());
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

