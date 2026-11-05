// The Living World HUD: a seasonal clock, a live news ticker and a god-mode inspector.
// See docs/plans/living-world.md (slice 5)
import { select } from "d3";
import { currentContent } from "@/conquest/content/store";
import { type BattleModifiers, estimateOdds } from "@/conquest/engine/game/battle";
import { valueModifier } from "@/conquest/engine/game/saves";
import { Controllers } from "@/controllers";
import { ACTION_DEFS, DIE_SIDES } from "@/data/character-actions";
import { ALIGNMENT_COLORS } from "@/data/culture-traits";
import { GUILD_OPERATIONS } from "@/data/guild-operations";
import { figureArchetype, figureDisciplines, HERO_ARCHETYPES, pendingPathLevel } from "@/data/hero-archetypes";
import { activeAspects, aspectBonus } from "@/data/hero-aspects";
import { HERO_DISCIPLINES, matchingDisciplines } from "@/data/hero-disciplines";
import { HERO_INJURY_LABELS, heroTemperamentTags, injuryIsActive } from "@/data/hero-vitals";
import { CIV_BELIEF_BY_ID } from "@/data/living-civ-beliefs";
import { CIV_BUILDING_BY_ID } from "@/data/living-civ-buildings";
import { CIV_CIVILIAN_BY_ID } from "@/data/living-civ-civilians";
import { CIV_TECH_BY_ID } from "@/data/living-civ-techs";
import { resolveCivTechName } from "@/data/living-civ-themes";
import { getLairDef, isLairStateCapable } from "@/data/living-lairs";
import { getPetitionDef } from "@/data/living-petitions";
import { describeRelicBonuses, RELIC_CATALOG, reserveRelics, vaultHasRoom, vaultRelics } from "@/data/living-relics";
import { getTroubleDef, isTroubleStatePromotable, SAVE_KIND_LABELS, UNIT_ROLE_LABELS } from "@/data/living-troubles";
import {
  excavationMissionTags,
  lairMissionTags,
  missionTagsText,
  PACIFY_MISSION_TAGS,
  troubleMissionTags
} from "@/data/mission-tags";
import { Pack } from "@/model/graph/pack-generator";
import {
  armyHp,
  armyIsEmpty,
  armyLead,
  armyMen,
  armySlots,
  toBattleTypes,
  toBattleUnits
} from "@/model/physical/living-armies";
import {
  activeCivThemeId,
  figureLevel,
  GUILD_TIER_TITLES,
  Living,
  majorityReligion,
  maxHeroesForTier,
  pantheonFaithCost,
  prophetFaithCost
} from "@/model/physical/living-generator";
import { ensureHeroSheet } from "@/model/physical/living-heroes";
import { Military } from "@/model/political/military-generator";
import { getCellPoint } from "@/model/story/journeys/journey-places";
import {
  clearLivingToasts,
  drawLivingOverlay,
  removeLivingOverlay,
  showMarkerToast
} from "@/renderers/draw-living-overlay";
import { Layers } from "@/renderers/layers";
import type { HistoricalFigure } from "@/types/history";
import {
  type BurgSimState,
  type GuildState,
  type HeroDoctrine,
  type HeroGuildState,
  type HistoricalRelic,
  type IdleDoctrine,
  type LivingNewsItem,
  type MissionTag,
  type ProvinceSimState,
  SEASON_NAMES,
  type StatePolitySim,
  type YieldValues
} from "@/types/living";
import { Dialog } from "@/ui/dialog/dialog";
import { dialogState } from "@/ui/dialog/state";
import { zoomTo } from "@/ui/map/zoom";
import { ensureEl, escapeHtml, findEl, getPointer } from "@/utils";

const HUD_ID = "livingWorldHud";
const INSPECTOR_ID = "livingInspector";
const HEROES_DIALOG_ID = "livingHeroesDialog";
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
    #${HUD_ID} .livingGuildHeaderRow { display: flex; align-items: center; justify-content: space-between; width: 100%; }
    #${HUD_ID} .livingGuildLeft { display: flex; align-items: center; gap: 0.3em; }
    #${HUD_ID} .livingGuildCenter { display: flex; align-items: center; gap: 0.4em; }
    #${HUD_ID} .livingGuildRight { display: flex; align-items: center; gap: 0.3em; }
    #${HUD_ID} .livingSandboxToggle.strikethrough { text-decoration: line-through; opacity: 0.75; }
    #${HUD_ID} .livingGuildBottomRight { display: flex; justify-content: flex-end; margin-top: 0.15em; }
    #${HUD_ID} .livingWheelButton { background: var(--header, #5e4fa2); color: #fff; font-weight: bold; }
    #${HUD_ID} .livingGuildSubRow { display: flex; align-items: center; justify-content: space-between; width: 100%; }
    #${HUD_ID} .livingGuildButtonLink {
      background: transparent;
      border: 1px solid rgba(94, 79, 162, 0.4);
      border-radius: 3px;
      padding: 0.1em 0.45em;
      color: inherit;
      cursor: pointer;
    }
    #${HUD_ID} .livingGuildButtonLink:hover {
      background: rgba(94, 79, 162, 0.12);
      border-color: #5e4fa2;
    }
    #livingHeroesDialog {
      font-family: var(--monospace);
      font-size: 0.88em;
      max-height: calc(100vh - 160px);
      overflow-y: auto;
      padding: 0.4em 0.6em;
    }
    #livingHeroesDialog .livingHeroesSection { margin-bottom: 0.8em; }
    #livingHeroesDialog .livingHeroesSectionHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(94, 79, 162, 0.3);
      padding-bottom: 0.25em;
      margin-bottom: 0.4em;
      font-weight: bold;
      color: #5e4fa2;
    }
    #livingHeroesDialog .livingHeroSub { font-weight: normal; font-size: 0.9em; color: #666; }
    #livingHeroesDialog .livingHeroesList { display: flex; flex-direction: column; gap: 0.45em; }
    #livingHeroesDialog .livingHeroItem {
      border: 1px solid rgba(94, 79, 162, 0.3);
      border-radius: 4px;
      padding: 0.4em 0.6em;
      background: rgba(255, 255, 255, 0.5);
    }
    #livingHeroesDialog .livingHeroItem.seeker { border-color: rgba(61, 107, 53, 0.4); }
    #livingHeroesDialog .livingHeroRowTop {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.4em;
      flex-wrap: wrap;
      margin-bottom: 0.2em;
    }
    #livingHeroesDialog .livingHeroName { font-weight: bold; font-size: 1.05em; }
    #livingHeroesDialog .livingHeroArchetype {
      background: #5e4fa2;
      color: #fff;
      border-radius: 2px;
      padding: 0 0.3em;
      font-size: 0.85em;
    }
    #livingHeroesDialog .livingHeroArchetype.seeker { background: #3d6b35; }
    #livingHeroesDialog .livingHeroMeta { font-size: 0.88em; color: #555; }
    #livingHeroesDialog .livingHeroStatsRow {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6em;
      font-size: 0.9em;
      color: #333;
      margin-bottom: 0.2em;
    }
    #livingHeroesDialog .livingHeroVitals { display: flex; gap: 0.5em; }
    #livingHeroesDialog .livingHeroBar { display: inline-flex; align-items: center; gap: 0.25em; }
    #livingHeroesDialog .livingHeroBarMini {
      width: 3.5em;
      height: 0.4em;
      background: rgba(0, 0, 0, 0.12);
      border-radius: 2px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
    }
    #livingHeroesDialog .livingHeroBarMini > i { display: block; height: 100%; background: #5e4fa2; }
    #livingHeroesDialog .livingHeroActions { display: flex; align-items: center; gap: 0.3em; margin-top: 0.3em; }
    #livingHeroesDialog .livingHeroActions button {
      font-family: var(--monospace);
      font-size: 0.9em;
      padding: 0.15em 0.45em;
      cursor: pointer;
    }
    #livingHeroesDialog .livingHeroActions button.pressed { background: #5e4fa2; color: #fff; }
    #livingHeroesDialog .livingHeroEmpty { color: #666; font-style: italic; padding: 0.3em 0; }
    #${HUD_ID} .livingHudGuild {
      display: flex;
      flex-direction: column;
      gap: 0.15em;
      padding: 0.2em 0.45em;
      border-top: 1px solid rgba(0, 0, 0, 0.1);
    }
    #${HUD_ID} .livingGuildRow { display: flex; align-items: center; flex-wrap: wrap; gap: 0.3em; }
    #${HUD_ID} .livingGuildBadge { background: #5e4fa2; color: #fff; border-radius: 2px; padding: 0 0.3em; font-weight: bold; }
    #${HUD_ID} .livingGuildTitle { font-weight: bold; }
    #${HUD_ID} .livingGuildStat { color: #6a4c93; font-weight: bold; }
    #${HUD_ID} .livingGuildMuted { color: #666; font-style: italic; }
    #${HUD_ID} .livingGuildDoctrine { margin-left: auto; display: flex; align-items: center; gap: 0.25em; }
    #${HUD_ID} .livingGuildDoctrine select { font-family: var(--monospace); font-size: 1em; }
    #${HUD_ID} .livingGuildEschaton { display: flex; align-items: center; gap: 0.25em; }
    #${HUD_ID} .livingGuildEschaton button:not([disabled]) { background: var(--header, #5e4fa2); color: #fff; }
    #${HUD_ID} .livingGuildChip {
      border: 1px solid rgba(94, 79, 162, 0.5);
      border-radius: 3px;
      background: transparent;
      padding: 0.05em 0.4em;
    }
    #${HUD_ID} .livingGuildChip.mission { border-color: #b8860b; }
    #${HUD_ID} .livingGuildChip.cooldown { border-color: #a33d3d; opacity: 0.7; }
    #${HUD_ID} .livingGuildChip.relic { border-color: #b8860b; }
    #${HUD_ID} .livingGuildChip.site { border-color: #3d6b35; }
    #${HUD_ID} .livingGuildChip.petition { border-color: #444a8a; }
    #${HUD_ID} .livingGuildChipStatus { color: #777; }
    #${INSPECTOR_ID} {
      position: fixed;
      right: 10px;
      top: 60px;
      z-index: 60;
      width: 21em;
      max-height: calc(100vh - 190px);
      overflow-y: auto;
      border: 1px solid #5e4fa2;
      border-radius: 4px;
      background: var(--bg-light, #f7f7f7);
      font-family: var(--monospace);
      font-size: 0.82em;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      padding: 0.4em 0.55em;
    }
    #${INSPECTOR_ID} .livingInspectorClose {
      position: absolute;
      top: 6px;
      right: 8px;
      background: transparent;
      border: none;
      font-size: 1.15em;
      line-height: 1;
      padding: 0.1em 0.35em;
      cursor: pointer;
      color: #666;
      border-radius: 3px;
    }
    #${INSPECTOR_ID} .livingInspectorClose:hover {
      background: rgba(163, 61, 61, 0.15);
      color: #a33d3d;
    }
    #${INSPECTOR_ID} .livingInspectorTitle {
      font-weight: bold;
      font-size: 1.15em;
      margin-bottom: 0.25em;
      padding-right: 1.5em;
    }
    #${INSPECTOR_ID} button.livingInspectorTitle {
      background: none;
      border: none;
      padding: 0 1.5em 0 0;
      margin: 0 0 0.25em;
      font: inherit;
      font-weight: bold;
      font-size: 1.15em;
      color: inherit;
      cursor: pointer;
      text-align: left;
      text-decoration: underline;
      text-decoration-color: rgba(94, 79, 162, 0.4);
      display: block;
      width: 100%;
    }
    #${INSPECTOR_ID} button.livingInspectorTitle:hover {
      color: #5e4fa2;
      text-decoration-color: #5e4fa2;
    }
    #${INSPECTOR_ID} .livingSection { border-top: 1px solid rgba(0, 0, 0, 0.12); padding: 0.3em 0; }
    #${INSPECTOR_ID} .livingSectionTitle { font-weight: bold; margin-bottom: 0.15em; }
    #${INSPECTOR_ID} .livingMuted { color: #777; font-style: italic; }
    #${INSPECTOR_ID} .livingOddsBar {
      display: inline-block;
      width: 4em;
      height: 0.45em;
      margin-left: 0.4em;
      background: rgba(0, 0, 0, 0.12);
      border-radius: 2px;
      overflow: hidden;
      vertical-align: middle;
    }
    #${INSPECTOR_ID} .livingOddsBar > span { display: block; height: 100%; background: #5e4fa2; }
    #${INSPECTOR_ID} .livingBattleCard {
      margin-top: 0.2em;
      padding: 0.2em 0.4em;
      border-left: 2px solid #a33d3d;
      background: rgba(163, 61, 61, 0.08);
      font-size: 0.85em;
    }
    #${INSPECTOR_ID} details > summary { cursor: pointer; color: #777; }
    #${INSPECTOR_ID} details ul { margin: 0.15em 0 0 1em; padding: 0; }
    #${INSPECTOR_ID} .livingBar { height: 0.4em; background: rgba(0, 0, 0, 0.12); border-radius: 2px; overflow: hidden; }
    #${INSPECTOR_ID} .livingBar > i { display: block; height: 100%; background: #5e4fa2; }
    #${INSPECTOR_ID} .livingBar.danger > i { background: #a33d3d; }
    #${INSPECTOR_ID} .livingCapacityRow,
    #${INSPECTOR_ID} .livingMeterRow {
      display: grid;
      grid-template-columns: 7.5em 1fr;
      gap: 0.5em;
      align-items: center;
      margin-bottom: 0.3em;
      cursor: pointer;
    }
    #${INSPECTOR_ID} .livingCapacityLabel,
    #${INSPECTOR_ID} .livingMeterLabel {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${INSPECTOR_ID} .livingCapacityRow .livingBar,
    #${INSPECTOR_ID} .livingMeterRow .livingBar {
      height: 0.45em;
      background: rgba(0, 0, 0, 0.12);
      border-radius: 2px;
      overflow: hidden;
    }
    #${INSPECTOR_ID} .livingCapacityRow .livingBar > i,
    #${INSPECTOR_ID} .livingMeterRow .livingBar > i {
      display: block;
      height: 100%;
      background: #5e4fa2;
    }
    #${INSPECTOR_ID} .livingCapacityRow.over .livingBar > i,
    #${INSPECTOR_ID} .livingMeterRow .livingBar.danger > i {
      background: #a33d3d;
    }
    #${INSPECTOR_ID} .livingCapacityRow:hover,
    #${INSPECTOR_ID} .livingMeterRow:hover {
      opacity: 0.85;
    }
    #${INSPECTOR_ID} .livingPool { display: grid; grid-template-columns: 3.4em 1fr auto; gap: 0.2em 0.35em; align-items: center; }
    #${INSPECTOR_ID} .livingPoolVitals { display: grid; gap: 0.25em; margin-bottom: 0.25em; }
    #${INSPECTOR_ID} .livingVital { display: grid; grid-template-columns: 4.6em 3.2em 1fr; gap: 0.3em; align-items: center; }
    #${INSPECTOR_ID} .livingVital .livingBar { grid-column: 3; }
    #${INSPECTOR_ID} .livingDiscipline.injury { border-color: #a33d3d; color: #7b2525; }
    #${INSPECTOR_ID} .livingDiscipline.pressed { background: #5e4fa2; color: #fff; }
    #${INSPECTOR_ID} .dangerText { color: #a33d3d; }
    #${INSPECTOR_ID} .livingPool.over { color: #a33d3d; }
    #${INSPECTOR_ID} .livingPool .livingBar { grid-column: 2 / 4; }
    #${INSPECTOR_ID} .livingRuler { display: flex; gap: 0.4em; align-items: baseline; flex-wrap: wrap; }
    #${INSPECTOR_ID} .livingAge { color: #666; }
    #${INSPECTOR_ID} .livingBadge { border-radius: 2px; padding: 0 0.25em; color: #fff; }
    #${INSPECTOR_ID} .livingTraits { color: #444; }
    #${INSPECTOR_ID} .livingChips { display: flex; flex-wrap: wrap; gap: 0.25em; }
    #${INSPECTOR_ID} .livingCivChips { display: flex; flex-wrap: wrap; gap: 0.25em; margin: 0.15em 0; }
    #${INSPECTOR_ID} .livingCivChip {
      border: 1px solid rgba(94, 79, 162, 0.45);
      border-radius: 3px;
      background: rgba(94, 79, 162, 0.08);
      color: #3f3570;
      padding: 0 0.3em;
      white-space: nowrap;
      font-size: 1em;
    }
    #${INSPECTOR_ID} .livingDiscipline { border: 1px solid #5e4fa2; border-radius: 2px; padding: 0 0.3em; color: #3f3570; }
    #${INSPECTOR_ID} ul { margin: 0.15em 0 0; padding-left: 1.1em; }
    #${INSPECTOR_ID} li { margin-bottom: 0.1em; }
    #${INSPECTOR_ID} .livingLinkBtn {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      text-align: left;
      text-decoration: underline;
      text-decoration-color: rgba(94, 79, 162, 0.4);
      display: inline;
    }
    #${INSPECTOR_ID} .livingLinkBtn:hover {
      color: #5e4fa2;
      text-decoration-color: #5e4fa2;
    }
    #${INSPECTOR_ID} .livingButtons { display: flex; flex-wrap: wrap; gap: 0.25em; margin-top: 0.3em; }
    #${INSPECTOR_ID} .livingButtons button { font-size: 1em; padding: 0.12em 0.4em; cursor: pointer; }
    #${INSPECTOR_ID} .livingGodTitle { color: #a33d3d; font-weight: bold; margin: 0.3em 0 0.1em; }
    #${INSPECTOR_ID} .livingPetitionChoice { display: block; width: 100%; text-align: left; }
    #${INSPECTOR_ID} .livingPlaceholder { color: #666; font-style: italic; padding: 0.5em 0; }
  </style>
  <div id="${HUD_ID}">
    <div class="livingHudTop">
      <span class="livingHudDrag" title="Drag to move">✥</span>
      <button id="livingHudPause" type="button">Pause</button>
      <button id="livingHudStepSeason" type="button">Step +1 Season</button>
      <button id="livingHudStepYear" type="button">Step +1 Year</button>
      <button id="livingHudPlay" type="button">Play 1×</button>
      <button id="livingHudPlay4" type="button">Play 4×</button>
      <button id="livingHudDate" type="button"></button>
      <span id="livingHudEschaton" class="livingHudEschaton"></span>
      <button id="livingHudClose" type="button" title="Close Living World">☓</button>
    </div>
    <div id="livingHudStatus" class="livingHudStatus" style="display: none;"></div>
    <div id="livingHudGuild" class="livingHudGuild"></div>
    <div id="livingHudNews" class="livingHudNews"></div>
  </div>
`;

type Selection =
  | { kind: "state"; id: number }
  | { kind: "burg"; id: number }
  | { kind: "province"; id: number }
  | { kind: "figure"; id: number }
  | { kind: "marker"; id: number }
  | { kind: "relic"; id: number }
  | { kind: "petition"; id: number };

const DOCTRINE_LABELS: Record<IdleDoctrine, string> = {
  auto_bounties: "Hunt Troubles",
  auto_lairs: "Hunt Lairs",
  auto_excavate: "Excavate Ruins",
  auto_pacify: "Pacify Unrest",
  auto_patron: "Guard Favored State",
  manual: "Manual Dispatch"
};

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
  drawLivingOverlay();
  bindOverlayClicks();
}

function close(): void {
  pause();
  selected = null;
  lastFitTarget = null;
  Dialog.destroy(HEROES_DIALOG_ID);
  findEl(HUD_ID)?.remove();
  findEl(INSPECTOR_ID)?.remove();
  removeLivingOverlay();
  window.removeEventListener("pointermove", moveDrag);
  window.removeEventListener("pointerup", endDrag);
  select<SVGElement, unknown>("#viewbox").on("click.livingHud", null).style("cursor", null);
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
  renderGuildBar();
  renderNews(living.recentNews ?? []);
  validateSelection();
  renderInspector();
  if (findEl(HEROES_DIALOG_ID)) {
    renderHeroesDialogContent();
  }
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
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
}

function startDrag(event: PointerEvent): void {
  const hud = findEl(HUD_ID);
  if (!hud) return;

  const rect = hud.getBoundingClientRect();
  dragOrigin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
  event.preventDefault();
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
}

function step(seasons: number): void {
  pause();
  Living.tick(seasons);
  afterTick();
}

function play(speed: number): void {
  stopTimer();
  playing = speed;
  timer = window.setInterval(
    () => {
      Living.tick(1);
      afterTick();
    },
    speed === 4 ? 350 : 1400
  );
  renderControls();
}

function pause(): void {
  stopTimer();
  playing = 0;
  renderControls();
}

function stopTimer(): void {
  if (timer === null) return;
  window.clearInterval(timer);
  timer = null;
}

function afterTick(): void {
  clearLivingToasts();
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
  const tier = Living.getGuild?.()?.tier ?? 1;
  const wheelReady = eschaton >= 100 || tier >= 5;
  el.textContent = `⏳ ${eschaton}`;
  el.title = `The eschaton clock: how close this age is to its finale (${eschaton}/100).${
    wheelReady ? " The Wheel of Ages may be turned!" : " Reach eschaton 100 or Guild tier 5 to turn it."
  }`;
}

function heroStatus(guild: GuildState, figureId: number): { label: string; className: string } {
  const mission = (guild.missions ?? []).find(entry => entry.figureId === figureId);
  if (mission) return { label: `${mission.kind} ${mission.progress}/${mission.required}`, className: "mission" };
  const until = guild.cooldowns?.[figureId];
  if (until !== undefined && until > Living.getState().tick) return { label: "recovering", className: "cooldown" };
  if ((guild.candidates ?? []).includes(figureId)) return { label: "seeker", className: "" };
  if ((guild.roster ?? []).includes(figureId)) return { label: "idle", className: "" };
  return { label: "free", className: "" };
}

function relicHolderLabel(relic: HistoricalRelic): string {
  const holder = relic.holder;
  switch (holder.kind) {
    case "vault":
      return "vault";
    case "reserve":
      return "reserve";
    case "figure":
      return pack.history?.figures?.find(figure => figure.i === holder.id)?.name ?? "hero";
    case "state":
      return pack.states[holder.id]?.name ?? "leased";
    case "ruin":
      return "lost";
  }
}

function renderRelicChip(relic: HistoricalRelic): string {
  const def = RELIC_CATALOG[relic.category];
  const selectedClass = selected?.kind === "relic" && selected.id === relic.id ? " pressed" : "";
  return `<button type="button" class="livingGuildChip relic${selectedClass}" data-guild="inspect-relic" data-relic="${relic.id}" title="${escapeHtml(relic.name)} — ${describeRelicBonuses(relic)}">
    ${def.icon} ${escapeHtml(relic.name)} <span class="livingGuildChipStatus">· ${escapeHtml(relicHolderLabel(relic))}</span>
  </button>`;
}

const MAX_GUILD_CHIPS = 6;

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

function renderGuildBar(): void {
  const bar = findEl("livingHudGuild");
  if (!bar) return;

  const guild = Living.getGuild?.();
  if (!guild) {
    bar.innerHTML = "";
    return;
  }

  const tier = guild.tier ?? 1;
  const roster = guild.roster ?? [];
  const relics = guild.relics ?? [];
  const vaultCount = vaultRelics(relics).length;
  const reserveCount = reserveRelics(relics).length;
  const doctrine = guild.doctrine ?? "auto_bounties";
  const sandbox = Boolean(guild.sandboxGodMode);
  const favoredState = guild.favoredStateId !== undefined ? pack.states[guild.favoredStateId] : undefined;
  const patronName = favoredState && !favoredState.removed ? favoredState.name : "None";
  const eschaton = Living.getEschaton?.() ?? 0;
  const wheelReady = eschaton >= 100 || tier >= 5;
  const doctrineOptions = (Object.keys(DOCTRINE_LABELS) as IdleDoctrine[])
    .map(key => `<option value="${key}"${key === doctrine ? " selected" : ""}>${DOCTRINE_LABELS[key]}</option>`)
    .join("");

  const petitionChips = (guild.popups ?? [])
    .filter(popup => popup.kind === "guild_petition")
    .map(popup => {
      const selectedClass = selected?.kind === "petition" && selected.id === popup.id ? " pressed" : "";
      return `<button type="button" class="livingGuildChip petition${selectedClass}" data-guild="inspect-petition" data-popup="${popup.id}" title="${escapeHtml(popup.subtitle)}">
        ⚖️ ${escapeHtml(popup.title)}
      </button>`;
    })
    .join("");

  bar.innerHTML = /* html */ `
    <div class="livingGuildRow livingGuildHeaderRow">
      <div class="livingGuildLeft">
        <span class="livingGuildBadge" title="Guild tier">⚜ T${tier}</span>
        <span class="livingGuildTitle">${escapeHtml(GUILD_TIER_TITLES[tier - 1] ?? GUILD_TIER_TITLES[0]!)}</span>
      </div>
      <div class="livingGuildCenter">
        <span class="livingGuildStat" title="Guild gold">${guild.gold ?? 0}g</span>
        <span class="livingGuildStat" title="Guild renown">${guild.renown ?? 0}r</span>
        <span class="livingGuildMuted">· ${relics.length} ${relics.length === 1 ? "relic" : "relics"}</span>
      </div>
      <div class="livingGuildRight">
        <label class="livingGuildDoctrine">Doctrine
          <select id="livingHudDoctrine">${doctrineOptions}</select>
        </label>
        <button type="button" data-mode="sandbox" class="livingSandboxToggle${sandbox ? " pressed" : " strikethrough"}" title="${
          sandbox
            ? "Sandbox Mode: interventions are free and instant. Click to toggle Guild Mode."
            : "Guild Mode: operations cost gold and heroes. Click to toggle Sandbox Mode."
        }">
          ${sandbox ? "Sandbox" : "<s>Sandbox</s>"}
        </button>
      </div>
    </div>
    <div class="livingGuildRow livingGuildSubRow">
      <div class="livingGuildLeft">
        <button type="button" class="livingGuildButtonLink" id="livingHudPatronBtn" data-guild="zoom-patron" title="${favoredState ? `Zoom to ${escapeHtml(patronName)}` : "No favored state set"}">
          Patron: ${escapeHtml(patronName)}
        </button>
      </div>
      <div class="livingGuildRight">
        <button type="button" class="livingGuildButtonLink" id="livingHudHeroesBtn" data-guild="open-heroes" title="Open Guild Heroes & Tavern dialog">
          Heroes: ${roster.length}/${maxHeroesForTier(tier)}
        </button>
      </div>
    </div>
    ${
      relics.length > 0
        ? `<div class="livingGuildRow">
            <span class="livingGuildMuted">Vault (${vaultCount}/${tier})${reserveCount > 0 ? ` · Reserve (${reserveCount})` : ""}:</span>
            ${relics
              .slice(0, MAX_GUILD_CHIPS)
              .map(relic => renderRelicChip(relic))
              .join("")}
            ${relics.length > MAX_GUILD_CHIPS ? `<span class="livingGuildMuted">+${relics.length - MAX_GUILD_CHIPS} more</span>` : ""}
          </div>`
        : ""
    }
    ${
      petitionChips
        ? `<div class="livingGuildRow">
            <span class="livingGuildMuted">Petitions:</span>
            ${petitionChips}
          </div>`
        : ""
    }
    ${
      wheelReady
        ? `<div class="livingGuildRow livingGuildBottomRight">
             <button type="button" class="livingWheelButton" data-wheel="turn">Turn the Wheel of Ages</button>
           </div>`
        : ""
    }`;

  bar.querySelector<HTMLSelectElement>("#livingHudDoctrine")?.addEventListener("change", event => {
    const value = (event.target as HTMLSelectElement).value as IdleDoctrine;
    Living.setDoctrine(value);
    refresh();
    setStatus(`The Guild now follows ${DOCTRINE_LABELS[value]}.`);
  });

  const sandboxToggle = bar.querySelector<HTMLElement>("[data-mode='sandbox']");
  sandboxToggle?.addEventListener("click", () => {
    const newSandbox = !sandbox;
    Living.setSandboxGodMode(newSandbox);
    refresh();
    setStatus(
      newSandbox
        ? "Sandbox God Mode: interventions are free and instant."
        : "Guild Mode: operations cost gold and heroes."
    );
  });

  bar.querySelector<HTMLElement>("#livingHudPatronBtn")?.addEventListener("click", () => {
    if (guild.favoredStateId !== undefined) {
      selectState(guild.favoredStateId);
      zoomToState(guild.favoredStateId);
    } else {
      setStatus("No patron state selected. Use the States Inspector to designate a patron.");
    }
  });

  bar.querySelector<HTMLElement>("#livingHudHeroesBtn")?.addEventListener("click", () => {
    openHeroesDialog();
  });

  for (const button of bar.querySelectorAll<HTMLElement>("[data-guild='inspect']")) {
    button.addEventListener("click", () => {
      selected = { kind: "figure", id: Number(button.dataset.figure ?? 0) };
      renderInspector();
    });
  }

  for (const button of bar.querySelectorAll<HTMLElement>("[data-guild='inspect-relic']")) {
    button.addEventListener("click", () => {
      selected = { kind: "relic", id: Number(button.dataset.relic ?? 0) };
      renderInspector();
    });
  }

  for (const button of bar.querySelectorAll<HTMLElement>("[data-guild='inspect-marker']")) {
    button.addEventListener("click", () => {
      const markerId = Number(button.dataset.marker ?? 0);
      const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
      if (marker) rememberTarget(`Fit for ${marker.name ?? "the site"}`, excavationMissionTags(marker));
      selected = { kind: "marker", id: markerId };
      renderInspector();
    });
  }

  for (const button of bar.querySelectorAll<HTMLElement>("[data-guild='inspect-petition']")) {
    button.addEventListener("click", () => {
      selected = { kind: "petition", id: Number(button.dataset.popup ?? 0) };
      renderInspector();
    });
  }

  for (const button of bar.querySelectorAll<HTMLElement>("[data-wheel]")) {
    button.addEventListener("click", () => {
      const result = Living.turnAge();
      afterTick();
      setStatus(
        result
          ? `${result.era} dawns — ${result.realms} ${result.realms === 1 ? "realm" : "realms"} fell, ${
              result.successorStates
            } provinces broke away, and the Guild enters a new age.`
          : "The Wheel refuses to turn."
      );
    });
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
      const attrs = [
        item.cell !== undefined ? `data-cell="${item.cell}"` : "",
        item.stateId ? `data-state="${item.stateId}"` : "",
        item.burgId ? `data-burg="${item.burgId}"` : ""
      ]
        .filter(Boolean)
        .join(" ");
      return `<button type="button" class="livingNewsItem" ${attrs} title="${escapeHtml(item.text)}"><span class="livingNewsDate">[${date}]</span> ${escapeHtml(item.text)}</button>`;
    })
    .join("");

  for (const button of wrap.querySelectorAll<HTMLElement>("button.livingNewsItem")) {
    button.addEventListener("click", focusNews);
  }
}

function focusNews(this: HTMLElement): void {
  const burgId = Number(this.dataset.burg ?? 0);
  const stateId = Number(this.dataset.state ?? 0);
  if (burgId && pack.burgs[burgId] && !pack.burgs[burgId].removed) selectBurg(burgId);
  else if (stateId && pack.states[stateId] && !pack.states[stateId].removed) selectState(stateId);

  const cell = Number(this.dataset.cell ?? Number.NaN);
  if (!Number.isFinite(cell)) return;
  const point = getCellPoint(cell);
  if (point) zoomTo(point[0], point[1], 8, 800);
}

function attachMapSelection(): void {
  select<SVGElement, unknown>("#viewbox").style("cursor", "crosshair").on("click.livingHud", onMapClick);
}

function onMapClick(this: SVGElement, event: MouseEvent): void {
  const [x, y] = getPointer(event, this);
  const cell = Pack.findCell(x, y);
  if (cell === undefined) return;

  const burgId = pack.cells.burg?.[cell] ?? 0;
  if (burgId && pack.burgs[burgId] && !pack.burgs[burgId].removed) {
    selectBurg(burgId);
    return;
  }

  const stateId = pack.cells.state?.[cell] ?? 0;
  if (stateId && pack.states[stateId] && !pack.states[stateId].removed) {
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
  const id = Number(popupElement.getAttribute("data-popup-id") ?? 0);
  if (!id) return;

  // petitions open a 2-choice dilemma card instead of banking a claim bonus
  if (popupElement.getAttribute("data-kind") === "guild_petition") {
    selected = { kind: "petition", id };
    renderInspector();
    drawLivingOverlay({ includeBadges: false });
    return;
  }

  const claimed = Living.claimPopup(id);
  drawLivingOverlay({ includeBadges: false });
  refresh();
  if (claimed) {
    setStatus(`Bounty claimed: ${claimed.title} (+${claimed.rewardGold}g, +${claimed.rewardRenown} renown).`);
    showMarkerToast(claimed);
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
  if (pSim.trouble) rememberTarget(`Fit for ${pSim.trouble.name}`, troubleMissionTags(pSim.trouble));
  else if (pSim.lair) rememberTarget(`Fit for ${pSim.lair.name}`, lairMissionTags(pSim.lair));
}

function selectMarker(markerId: number): void {
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  if (marker) rememberTarget(`Fit for ${marker.name ?? "the site"}`, excavationMissionTags(marker));
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
  if ((living.burgs?.[burgId]?.unrest ?? 0) > 0) rememberTarget("Fit for unrest", [...PACIFY_MISSION_TAGS]);
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
  const guild = Living.getGuild?.();
  const alive =
    current.kind === "state"
      ? Boolean(pack.states[current.id] && !pack.states[current.id].removed)
      : current.kind === "burg"
        ? Boolean(pack.burgs[current.id] && !pack.burgs[current.id].removed)
        : current.kind === "province"
          ? Boolean(pack.provinces?.[current.id] && !pack.provinces[current.id].removed)
          : current.kind === "marker"
            ? (pack.markers ?? []).some(marker => marker?.i === current.id)
            : current.kind === "relic"
              ? (guild?.relics ?? []).some(relic => relic.id === current.id)
              : current.kind === "petition"
                ? (guild?.popups ?? []).some(popup => popup.id === current.id && popup.kind === "guild_petition")
                : Boolean(pack.history?.figures?.some(figure => figure.i === current.id));
  if (!alive) selected = null;
}

function renderInspector(): void {
  const panel = findEl(INSPECTOR_ID);
  if (!panel) return;

  if (!selected) {
    panel.innerHTML = `<button type="button" class="livingInspectorClose" data-inspector="close" title="Close Inspector">✕</button><div class="livingPlaceholder">Click a state, burg, hero, landmark or relic to inspect it.</div>`;
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
            : selected.kind === "relic"
              ? renderRelicCard(selected.id)
              : selected.kind === "petition"
                ? renderPetitionCard(selected.id)
                : renderFigureCard(selected.id);

  panel.innerHTML = `<button type="button" class="livingInspectorClose" data-inspector="close" title="Close Inspector">✕</button>${content}`;
  bindInspectorButtons(panel);
}

/** The 2-choice dilemma card for an awaiting guild petition */
function renderPetitionCard(popupId: number): string {
  const guild = Living.getGuild?.();
  const popup = (guild?.popups ?? []).find(entry => entry.id === popupId && entry.kind === "guild_petition");
  if (!popup) return `<div class="livingPlaceholder">The petitioners have moved on.</div>`;

  const def = getPetitionDef(popup.petitionId);
  if (!def) return `<div class="livingPlaceholder">This petition no longer has meaning.</div>`;

  const remaining = Math.max(0, popup.expiresAtTick - Living.getState().tick);
  const choices = def.choices
    .map(
      (choice, index) =>
        `<button type="button" class="livingPetitionChoice" data-guild="petition" data-popup="${popupId}" data-choice="${index}" title="${escapeHtml(choice.tooltip)}">
          ${escapeHtml(choice.label)} <span class="livingGuildChipStatus">${choice.gold >= 0 ? "+" : ""}${choice.gold}g · ${choice.renown >= 0 ? "+" : ""}${choice.renown}r</span>
        </button>`
    )
    .join("");

  return /* html */ `
    <div class="livingInspectorTitle">⚖️ ${escapeHtml(popup.title)}</div>
    <div class="livingMuted">${escapeHtml(popup.subtitle)}</div>
    <div class="livingSection">
      <div class="livingSectionTitle">The Dilemma</div>
      <div class="livingMuted">Decide within ${remaining} season${remaining === 1 ? "" : "s"} or the matter resolves itself.</div>
    </div>
    <div class="livingButtons">${choices}</div>`;
}

function relicHolderText(relic: HistoricalRelic): string {
  const holder = relic.holder;
  switch (holder.kind) {
    case "vault":
      return "Held in the Guild Vault";
    case "reserve":
      return "Held in reserve — the vault is full";
    case "figure":
      return `Carried by ${pack.history?.figures?.find(figure => figure.i === holder.id)?.name ?? "a hero"}`;
    case "state":
      return `Leased to ${pack.states[holder.id]?.name ?? "a state"} (+gen, -1 unravel, +10g tribute per season)`;
    case "ruin":
      return `Buried in ${(pack.markers ?? []).find(marker => marker?.i === holder.markerId)?.name ?? "a ruin"} — excavate to recover`;
  }
}

function renderRelicCard(relicId: number): string {
  const guild = Living.getGuild?.();
  const relic = (guild?.relics ?? []).find(entry => entry.id === relicId);
  if (!relic) return `<div class="livingPlaceholder">This relic has crumbled to dust.</div>`;

  const def = RELIC_CATALOG[relic.category];
  const realm =
    relic.originRealmId !== undefined
      ? pack.history?.realms?.find(entry => entry.i === relic.originRealmId)?.name
      : undefined;
  const figure =
    relic.originFigureId !== undefined
      ? pack.history?.figures?.find(entry => entry.i === relic.originFigureId)?.name
      : undefined;
  const origin = [realm, figure]
    .filter((entry): entry is string => Boolean(entry))
    .map(escapeHtml)
    .join(" · ");

  let actions = "";
  if (relic.holder.kind === "ruin") {
    actions = `<button type="button" data-guild="dispatch-marker" data-marker="${relic.holder.markerId}">Send Expedition</button>`;
  } else if (relic.holder.kind === "reserve") {
    actions = vaultHasRoom(guild ?? { tier: 1, relics: [] })
      ? `<button type="button" data-guild="enshrine" data-relic="${relic.id}">Enshrine in Vault</button>`
      : `<div class="livingMuted">Held in reserve until vault space opens.</div>`;
  } else if (relic.holder.kind !== "vault") {
    actions = `<button type="button" data-guild="recall" data-relic="${relic.id}">Return to Vault</button>`;
  } else {
    const stored = vaultRelics(guild?.relics ?? []).length;
    actions = `<div class="livingMuted">Enshrined in the Guild Vault (${stored}/${guild?.tier ?? 1})</div>`;
  }

  return /* html */ `
    <div class="livingInspectorTitle">${def.icon} ${escapeHtml(relic.name)}</div>
    <div class="livingMuted">${def.label} · origin year ${relic.originYear}${origin ? ` · ${origin}` : ""}${
      relic.cursed ? " · 🩸 Cursed" : ""
    }</div>
    <div class="livingSection">
      <div class="livingSectionTitle">Powers</div>
      <div>${describeRelicBonuses(relic)}</div>
      <div class="livingMuted">${escapeHtml(relic.lore)}</div>
      <div class="livingMuted">${relicHolderText(relic)}</div>
    </div>
    ${actions ? `<div class="livingButtons">${actions}</div>` : ""}`;
}

function renderMarkerCard(markerId: number): string {
  const guild = Living.getGuild?.();
  const marker = (pack.markers ?? []).find(entry => entry?.i === markerId);
  if (!marker) return `<div class="livingPlaceholder">This landmark is gone.</div>`;

  const excavated = (guild?.excavatedMarkers ?? []).includes(markerId);
  const targeted = (guild?.missions ?? []).some(
    mission => mission.kind === "excavate" && mission.markerId === markerId
  );
  const buried = (guild?.relics ?? []).filter(
    relic => relic.holder.kind === "ruin" && relic.holder.markerId === markerId
  );
  const buriedChips = buried
    .map(
      relic =>
        `<button type="button" class="livingGuildChip" data-guild="inspect-relic" data-relic="${relic.id}">${RELIC_CATALOG[relic.category].icon} ${escapeHtml(relic.name)}</button>`
    )
    .join("");

  let actions: string;
  if (excavated) {
    actions = `<div class="livingMuted">Already excavated by the Guild.</div>`;
  } else {
    actions = `<button type="button" data-guild="dispatch-marker" data-marker="${markerId}"${targeted ? " disabled" : ""}>${
      targeted ? "Excavation Underway" : "Dispatch Hero"
    }</button>`;
    if (guild?.sandboxGodMode) {
      actions += `<button type="button" data-god="excavate-marker" data-marker="${markerId}">Excavate Now</button>`;
    }
  }

  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(marker.name ?? "Landmark")}</div>
    <div class="livingMuted">${escapeHtml(marker.type.replaceAll("-", " "))} · cell ${marker.cell}${
      marker.chronicle ? " · chronicle site" : ""
    }</div>
    <div class="livingSection">
      <div class="livingSectionTitle">Excavation</div>
      ${
        excavated
          ? `<div class="livingMuted">Site dug</div>`
          : `<div class="livingMuted">DC ${13 + (guild?.tier ?? 1)} · chronicle sites always yield a named relic</div>`
      }
      ${buriedChips ? `<div class="livingMuted">Buried relics:</div><div>${buriedChips}</div>` : ""}
    </div>
    <div class="livingButtons">${actions}</div>`;
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

function fitSummary(figure: HistoricalFigure, tags: readonly MissionTag[] | undefined): string {
  if (!tags?.length) return "";
  const matched = matchingDisciplines(figureDisciplines(figure), tags);
  const discipline = Math.min(2, matched.length);
  const aspect = aspectBonus(figure, tags);
  if (discipline === 0 && aspect === 0) return "Poor match: no applicable discipline.";

  const parts: string[] = [];
  if (discipline > 0) parts.push(`+${discipline} discipline`);
  if (aspect !== 0) parts.push(`${aspect > 0 ? "+" : ""}${aspect} aspect`);
  return `${aspect < 0 ? "Risky match" : "Good match"}: ${parts.join(", ")}.`;
}

function renderPathChoices(figure: HistoricalFigure, figureId: number, isHero: boolean): string {
  if (!isHero || figure.death !== undefined || (figure.progression?.pendingChoices ?? 0) <= 0) return "";

  const level = pendingPathLevel(figure);
  const choice = HERO_ARCHETYPES[figureArchetype(figure).id].paths.find(entry => entry.level === level);
  if (!choice) return "";

  return `<div class="livingSection">
    <div class="livingSectionTitle">Choose a path (level ${level})</div>
    <div class="livingMuted">Ignored choices are made for you after two seasons.</div>
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

function renderVitals(figureId: number, state: HeroGuildState | undefined, isHero: boolean): string {
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
  const doctrineButtons = isHero
    ? `<div class="livingButtons">${(Object.keys(HERO_DOCTRINE_LABELS) as HeroDoctrine[])
        .map(
          doctrine =>
            `<button type="button" class="livingDiscipline${state.doctrine === doctrine ? " pressed" : ""}" data-guild="hero-doctrine" data-figure="${figureId}" data-doctrine="${doctrine}" title="Set this hero's doctrine">${HERO_DOCTRINE_LABELS[doctrine]}</button>`
        )
        .join(
          ""
        )}<button type="button" class="livingDiscipline${state.push ? " pressed" : ""}" data-guild="toggle-push" data-figure="${figureId}" title="Spend Stamina on harder checks">Push: ${state.push ? "On" : "Off"}</button></div>`
    : "";

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

function missionPhaseChips(mission: {
  phases?: { id: string; label: string; action: string }[];
  phaseResults?: { phaseId: string; heroId: number; success: boolean; untrained?: boolean }[];
  progress: number;
}): string {
  const phases = mission.phases ?? [];
  if (phases.length === 0) return "";
  const results = mission.phaseResults ?? [];
  return phases
    .map((phase, index) => {
      const result = results.find(entry => entry.phaseId === phase.id);
      const status = result ? (result.success ? "✓" : "✗") : index === mission.progress ? "next" : "·";
      const untrained = result?.untrained ? " ⚠" : "";
      const action = ACTION_DEFS[phase.action as keyof typeof ACTION_DEFS]?.label ?? phase.action;
      return `<span class="livingDiscipline">${escapeHtml(phase.label)} ${action} ${status}${untrained}</span>`;
    })
    .join("");
}

function renderPartyPreview(provinceId: number): string {
  const preview = Living.getPartyPreview?.(provinceId);
  if (!preview || preview.party.length === 0) return "";
  const names = preview.members.map(member => escapeHtml(member.name)).join(", ");
  const phases = preview.phases
    .map(phase => {
      const action = ACTION_DEFS[phase.action as keyof typeof ACTION_DEFS]?.label ?? phase.action;
      return `<span class="livingDiscipline">${escapeHtml(phase.label)} ${action}</span>`;
    })
    .join("");
  const buttons = preview.members
    .map(
      member =>
        `<button type="button" data-guild="dispatch-leader" data-province="${provinceId}" data-figure="${member.figureId}" title="Pin ${escapeHtml(member.name)} as leader and auto-fill companions">${escapeHtml(member.name)} +${member.score}</button>`
    )
    .join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Expedition Party</div>
    <div class="livingMuted">Auto-fill: ${names}</div>
    <div class="livingChips">${phases}</div>
    <div class="livingButtons">${buttons}</div>
  </div>`;
}

function renderFigureCard(figureId: number): string {
  const living = Living.getState();
  const guild = Living.getGuild?.();
  const figure = pack.history?.figures?.find(entry => entry.i === figureId);
  if (!figure) return `<div class="livingPlaceholder">This figure has passed from the chronicle.</div>`;

  const year = options.map?.lore?.calendar?.year ?? 1000;
  const age = Math.max(0, year - figure.birth);
  const level = figureLevel(figure.xp ?? 0);
  const roster = guild?.roster ?? [];
  const candidates = guild?.candidates ?? [];
  const mission = (guild?.missions ?? []).find(entry => entry.figureId === figureId || entry.party?.includes(figureId));
  const cooldownUntil = guild?.cooldowns?.[figureId];
  const onCooldown = cooldownUntil !== undefined && cooldownUntil > living.tick;
  const isCandidate = candidates.includes(figureId);
  const isHero = roster.includes(figureId);
  const heroState = isHero || isCandidate ? Living.getHeroState?.(figureId) : undefined;
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
  else if (mission) {
    const tags = missionTagsText(mission.tags);
    const fit = fitSummary(figure, mission.tags);
    const stamina = mission.staminaSpent ? ` · ${mission.staminaSpent} Stamina spent` : "";
    const phase = Math.min((mission.progress ?? 0) + 1, mission.required || 1);
    status = `<div class="livingMuted">On expedition: Phase ${phase}/${mission.required || 1}${
      tags ? ` · ${escapeHtml(tags)}` : ""
    }${stamina}</div><div class="livingChips">${missionPhaseChips(mission)}</div>${
      fit ? `<div class="livingMuted">${escapeHtml(fit)}</div>` : ""
    }`;
  } else if (isDown) status = `<div class="livingMuted dangerText">Downed until tick ${heroState!.downUntilTick}</div>`;
  else if (onCooldown) status = `<div class="livingMuted">Recovering until tick ${cooldownUntil}</div>`;
  else if (isHero) status = `<div class="livingMuted">At the Guild Hall</div>`;
  else if (isCandidate) status = `<div class="livingMuted">Seeking a contract</div>`;

  const recruitCost = Living.recruitCost?.(figureId) ?? 40 + (guild?.tier ?? 1) * 20;
  const fitPreview = isCandidate && lastFitTarget ? fitSummary(figure, lastFitTarget.tags) : "";
  const carried = (guild?.relics ?? []).find(relic => relic.holder.kind === "figure" && relic.holder.id === figureId);
  let actions = "";
  if (isCandidate && figure.death === undefined) {
    const affordable = (guild?.gold ?? 0) >= recruitCost;
    actions = `<button type="button" data-guild="recruit" data-figure="${figureId}"${affordable ? "" : " disabled"}>Recruit — ${recruitCost}g</button>`;
  } else if (isHero && figure.death === undefined) {
    if (age >= 55)
      actions = `<button type="button" data-guild="retire" data-figure="${figureId}">Retire & Mentor</button>`;
    if (!mission && !onCooldown && !isDown)
      actions += `<div class="livingMuted">Select a province, state or excavation site and dispatch a hero.</div>`;
    if (carried)
      actions += `<button type="button" data-guild="recall" data-relic="${carried.id}">Return ${escapeHtml(carried.name)} to Vault</button>`;
    else
      for (const relic of vaultRelics(guild?.relics ?? []).slice(0, 3)) {
        actions += `<button type="button" data-guild="equip" data-relic="${relic.id}" data-figure="${figureId}">Equip ${escapeHtml(relic.name)}</button>`;
      }
  }

  return /* html */ `
    <div class="livingInspectorTitle">${escapeHtml(figure.name)}</div>
    <div class="livingRuler">
      <span class="livingAge">age ${age}</span>
      ${alignment}
      ${archetypeBadge}
      ${isHero ? `<span class="livingBadge" style="background:#5e4fa2">Guild Hero</span>` : ""}
      ${isCandidate ? `<span class="livingBadge" style="background:#3d6b35">Seeker</span>` : ""}
    </div>
    ${culture ? `<div class="livingMuted">${escapeHtml(culture)}</div>` : ""}
    ${traits ? `<div class="livingTraits">${traits}</div>` : ""}
    <div class="livingSection">
      <div class="livingSectionTitle">Identity</div>
      <div class="livingChips">${disciplineChips(figure)}</div>
      ${aspectNotes || `<div class="livingMuted">${escapeHtml(archetype.temperament)}</div>`}
    </div>
    ${renderVitals(figureId, heroState, isHero)}
    <div class="livingSection">
      <div class="livingSectionTitle">Progression</div>
      <div>Level ${level} <span class="livingMuted">· ${figure.xp ?? 0} xp</span></div>
      ${skills}
      ${carried ? `<div class="livingMuted">Carries ${RELIC_CATALOG[carried.category].icon} ${escapeHtml(carried.name)}</div>` : ""}
      ${status}
      ${fitPreview ? `<div class="livingMuted">${escapeHtml(lastFitTarget!.label)} · ${escapeHtml(fitPreview)}</div>` : ""}
    </div>
    ${renderPathChoices(figure, figureId, isHero)}
    ${actions ? `<div class="livingButtons">${actions}</div>` : ""}`;
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
  const guild = Living.getGuild?.();
  const sandbox = Boolean(guild?.sandboxGodMode);
  const isPatron = guild?.favoredStateId === stateId;

  return /* html */ `
    <button type="button" class="livingInspectorTitle" data-open="states" data-id="${stateId}" title="States editor">${escapeHtml(state.fullName ?? state.name ?? "State")}</button>
    ${renderRuler(ruler, age)}
    ${renderCivState(sSim, stateId)}
    ${renderStateProvinces(stateId)}
    ${renderCapacity(sSim, stateId)}
    ${renderAgenda(sSim)}
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
    ${renderStateRelics(stateId, guild)}
    ${
      sandbox
        ? `<div class="livingGodTitle">Sandbox God Mode</div>
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
           </div>`
        : `<div class="livingGodTitle">Guild Operations</div>
           <div class="livingButtons">
             ${hasTroubled || hasLairs ? `<button type="button" data-guild="dispatch-state" data-state="${stateId}">Dispatch Party</button>` : ""}
             <button type="button" data-guild="patron" data-state="${stateId}" title="Restrict auto_patron contracts to this state">${isPatron ? "Current Patron State" : "Make Patron State"}</button>
             ${sSim.rulerId !== undefined ? `<button type="button" data-guild="op-assassinate" data-state="${stateId}" title="${escapeHtml(GUILD_OPERATIONS.assassinate_ruler.description)}">Assassinate Ruler — ${GUILD_OPERATIONS.assassinate_ruler.cost}g</button>` : ""}
             <button type="button" data-guild="op-broker" data-state="${stateId}" title="${escapeHtml(GUILD_OPERATIONS.war_broker.description)}">War Broker — ${GUILD_OPERATIONS.war_broker.cost}g</button>
           </div>`
    }`;
}

/** Vault lease offer and currently leased relics for one state */
function renderStateRelics(stateId: number, guild: GuildState | undefined): string {
  const relics = guild?.relics ?? [];
  const leased = relics.filter(relic => relic.holder.kind === "state" && relic.holder.id === stateId);
  const offer = vaultRelics(relics)[0];

  const rows = leased
    .map(relic => {
      const def = RELIC_CATALOG[relic.category];
      return `<li><button type="button" class="livingGuildChip" data-guild="inspect-relic" data-relic="${relic.id}">${def.icon} ${escapeHtml(relic.name)}</button></li>`;
    })
    .join("");

  const buttons = [
    offer
      ? `<button type="button" data-guild="lease" data-relic="${offer.id}" data-state="${stateId}" title="Lease ${escapeHtml(offer.name)}: +gen, -1 unravel, ${10}g tribute per season">Lease ${escapeHtml(offer.name)}</button>`
      : "",
    leased.length > 0
      ? `<button type="button" data-guild="recall" data-relic="${leased[0]!.id}">Recall ${escapeHtml(leased[0]!.name)}</button>`
      : ""
  ]
    .filter(Boolean)
    .join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Relics</div>
    ${leased.length > 0 ? `<ul>${rows}</ul>` : `<div class="livingMuted">No relics leased</div>`}
  </div>
  ${buttons ? `<div class="livingButtons">${buttons}</div>` : ""}`;
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

/** The OpenCiv empire panel: yields, research, happiness, faith and 1UPT regiments. */
function renderCivState(sSim: StatePolitySim, stateId: number): string {
  const living = Living.getState();
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
       <div class="livingMuted">${banked} / ${tech.cost} science · ${
         sSim.researchedTechs?.length ?? 0
       } technologies known</div>`
    : `<div class="livingMuted">No technology selected</div>`;

  const breakdown = sSim.happinessBreakdown;
  const happinessDetail = breakdown
    ? `<div class="livingMuted">+${
        breakdown.base + breakdown.luxuries + breakdown.buildings + breakdown.religion + (breakdown.relics ?? 0)
      } − ${breakdown.cityUnhappiness + breakdown.citizenUnhappiness + breakdown.unrestUnhappiness} · luxuries ${
        breakdown.luxuries
      } · buildings ${breakdown.buildings} · religion ${breakdown.religion}${
        breakdown.relics ? ` · relics ${breakdown.relics}` : ""
      }</div>`
    : "";

  const religionId = sSim.religionId ?? 0;
  const religion = religionId ? pack.religions?.[religionId] : undefined;
  const record = religionId ? living.religions?.[religionId] : undefined;
  const pantheon = sSim.pantheonId ? CIV_BELIEF_BY_ID[sSim.pantheonId]?.name : undefined;
  const faith = Math.round(sSim.faith ?? 0);
  const prophetCost = prophetFaithCost(sSim.prophetsEarned ?? 0);
  const holyCity = record?.holyCityBurgId ? pack.burgs[record.holyCityBurgId]?.name : undefined;
  const religionLines = `<div>${religion ? escapeHtml(religion.name) : "No organized religion"}${
    pantheon ? ` · pantheon: ${escapeHtml(pantheon)}` : ""
  }</div>
    <div class="livingMuted">Faith ${faith} · prophets ${sSim.prophetsEarned ?? 0} · next prophet ${prophetCost}${
      holyCity ? ` · holy city ${escapeHtml(holyCity)}` : ""
    }</div>`;

  const types = Military.getUnitTypes();
  const battleConfig = currentContent().config;
  const baseModifiers: BattleModifiers = {
    walls: 0,
    defenderEncamped: false,
    defenderAmbushed: false,
    attackerCrossedRiver: false,
    labels: []
  };
  /** The army occupying a cell, used only for the odds preview. */
  function armyAt(id: number, cell: number) {
    return (pack.states[id]?.military ?? []).find(
      entry => entry.cell === cell && living.armies?.[`${id}-${entry.i}`] && !armyIsEmpty(entry)
    );
  }
  const adjacentEnemyOdds = (cell: number): string[] => {
    const own = armyAt(stateId, cell);
    if (!own) return [];
    const lines: string[] = [];
    for (const neighbor of pack.cells.c?.[cell] ?? []) {
      for (const other of pack.states) {
        if (!other?.i || other.removed || other.i === stateId) continue;
        if (pack.states[stateId]?.diplomacy?.[other.i] !== "Enemy") continue;
        const enemy = armyAt(other.i, neighbor);
        if (!enemy) continue;
        const odds = estimateOdds(
          battleConfig,
          { factionId: stateId, armyId: null, units: toBattleUnits(own.units ?? []) },
          { factionId: other.i, armyId: null, units: toBattleUnits(enemy.units ?? []) },
          baseModifiers,
          toBattleTypes(types)
        );
        lines.push(
          `<div class="livingMuted">vs ${escapeHtml(other.name)}: ${odds.attackerWinPct}% win ` +
            `<span class="livingOddsBar"><span style="width:${odds.attackerWinPct}%"></span></span></div>`
        );
      }
    }
    return lines;
  };

  const regiments = (pack.states[stateId]?.military ?? [])
    .map(regiment => {
      const key = `${stateId}-${regiment.i}`;
      const army = living.armies?.[key];
      if (army) {
        const lead = armyLead(regiment);
        const name = lead ? (types[lead.type]?.name ?? lead.type) : "Army";
        const hpPct = Math.round(armyHp(regiment) * 100);
        const blocks = armySlots(regiment);
        const men = armyMen(regiment, types);
        const exp = (regiment.units ?? []).reduce((sum, block) => sum + block.exp, 0) / Math.max(1, blocks);
        const battle = army.lastBattle
          ? `<div class="livingBattleCard">${army.lastBattle.role === "attacker" ? "Attack" : "Defence"} · ${
              army.lastBattle.winner === army.lastBattle.role ? "won" : "lost"
            } · ${army.lastBattle.rounds} rounds · ${Math.round(army.lastBattle.lossesHp * 100) / 100} hp lost · ${
              army.lastBattle.blocksLost
            } blocks · ${Math.round(army.lastBattle.survivorsHp * 100)}% left</div>`
          : "";
        const composition = (regiment.units ?? [])
          .map(block => {
            const def = types[block.type];
            const quantity = def ? Math.max(1, Math.round(def.quantity)) : 1;
            return `<li>${escapeHtml(def?.name ?? block.type)} · ${Math.round(block.hp * 100)}% · exp ${block.exp} · ~${quantity} nominal</li>`;
          })
          .join("");
        return `<li><div>${escapeHtml(name)} · ${hpPct}% · ~${men} men · ${blocks} blocks · exp ${exp.toFixed(1)} · ${army.stance}</div>${adjacentEnemyOdds(regiment.cell).join("")}${battle}<details><summary>composition</summary><ul>${composition}</ul></details></li>`;
      }
      const unit = living.units?.[key];
      if (!unit) return "";
      const def = CIV_CIVILIAN_BY_ID[unit.unitTypeId];
      return `<li>${escapeHtml(def?.name ?? unit.unitTypeId)} · utility</li>`;
    })
    .filter(Boolean)
    .join("");

  const pantheonHint = sSim.pantheonId
    ? ""
    : `<div class="livingMuted">Next pantheon at ${pantheonFaithCost(0)} Faith</div>`;

  return `<div class="livingSection">
    <div class="livingSectionTitle">OpenCiv Empire</div>
    <div class="livingCivChips">${yieldChips(yields)}${happinessChip}${treasuryChip}</div>
    ${happinessDetail}
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Research</div>
    <div>${escapeHtml(techName)}</div>
    ${techProgress}
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Faith</div>
    ${religionLines}
    ${pantheonHint}
  </div>
  ${
    regiments
      ? `<div class="livingSection"><div class="livingSectionTitle">Armies</div><ul>${regiments}</ul></div>`
      : ""
  }`;
}

interface CitySimView {
  citizens?: number;
  cityYields?: YieldValues;
  foodStored?: number;
  cultureStored?: number;
  tilesAcquired?: number;
  productionQueue?: { kind: "unit" | "building" | "wonder"; id: string }[];
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
      const def =
        item.kind === "unit"
          ? (CIV_CIVILIAN_BY_ID[item.id] ?? Military.getUnitTypes()[item.id])
          : CIV_BUILDING_BY_ID[item.id];
      const cost = Math.max(1, Math.round(def?.cost ?? 1));
      const progress = Math.round(bSim.productionProgress?.[`${item.kind}:${item.id}`] ?? 0);
      return `<li>${escapeHtml(def?.name ?? item.id)} <span class="livingGuildChipStatus">${progress} / ${
        cost
      }</span></li>`;
    })
    .join("");

  const pressure = Object.entries(bSim.religionPressure ?? {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([id, value]) => {
      const name = pack.religions?.[Number(id)]?.name ?? `Faith ${id}`;
      return `<span class="livingCivChip">${escapeHtml(name)} ${Math.round(Number(value))}</span>`;
    })
    .join(" ");
  const majority = majorityReligion(bSim.religionPressure, bSim.citizens ?? 1);
  const majorityName = majority ? (pack.religions?.[majority]?.name ?? `Faith ${majority}`) : undefined;

  const hp =
    bSim.hp !== undefined && bSim.maxHp !== undefined
      ? `<div class="livingMuted">City HP ${Math.round(bSim.hp)} / ${Math.round(bSim.maxHp)}</div>`
      : "";

  const burg = pack.burgs[burgId];
  const religionNote = burg?.state
    ? `<div class="livingMuted">Province faith updates the Religions layer when the majority flips.</div>`
    : "";

  return `<div class="livingSection">
    <div class="livingSectionTitle">OpenCiv City</div>
    <div class="livingCivChips">${yieldChips(bSim.cityYields)}</div>
    <div class="livingMuted">${bSim.citizens ?? 0} citizens · store ${Math.round(bSim.foodStored ?? 0)} food · ${
      bSim.tilesAcquired ?? 0
    } tiles</div>
    ${hp}
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Production</div>
    ${queue ? `<ul>${queue}</ul>` : `<div class="livingMuted">Queue empty</div>`}
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Religion</div>
    <div>${majorityName ? escapeHtml(majorityName) : "No majority faith"}</div>
    <div class="livingCivChips">${pressure || `<span class="livingMuted">No pressure recorded</span>`}</div>
    ${religionNote}
  </div>`;
}

/** Clickable chips for every province held by a state. */
function renderStateProvinces(stateId: number): string {
  const living = Living.getState();
  const provinces = (pack.provinces ?? []).filter(
    province => province?.i && !province.removed && province.state === stateId
  );
  if (!provinces.length) return "";

  const chips = provinces
    .map(province => {
      const pSim = living.provinces?.[province.i];
      const icon = pSim?.lair ? "💀" : pSim?.trouble ? "⚠️" : "🏳️";
      const order = Math.round(pSim?.order ?? 0);
      const name = escapeHtml(province.name ?? "Province");
      return `<button type="button" class="livingCivChip" data-inspect="province" data-id="${province.i}" title="Public order ${order}%">${icon} ${name}</button>`;
    })
    .join("");

  return `<div class="livingSection">
    <div class="livingSectionTitle">Provinces</div>
    <div class="livingCivChips">${chips}</div>
  </div>`;
}

/** The Living World province card: order, capital, faith, trouble, lair and OpenCiv links. */
function renderProvinceCard(provinceId: number): string {
  const living = Living.getState();
  const province = pack.provinces?.[provinceId];
  const pSim = living.provinces?.[provinceId];
  if (!province?.i || province.removed || !pSim) return `<div class="livingPlaceholder">This province is gone.</div>`;

  const state = pack.states[province.state];
  const owner = state && !state.removed ? (state.fullName ?? state.name) : "Unclaimed";
  const capitalBurg = province.burg ? pack.burgs[province.burg] : undefined;
  const capitalSim = province.burg ? living.burgs[province.burg] : undefined;
  const trouble = pSim.trouble;
  const troubleDef = trouble ? getTroubleDef(trouble.id) : undefined;
  const lair = pSim.lair;
  const lairDef = lair ? getLairDef(lair.id) : undefined;
  const religionId = capitalBurg ? (pack.cells.religion?.[capitalBurg.cell] ?? 0) : 0;
  const religionName = religionId ? pack.religions?.[religionId]?.name : undefined;
  const development = pSim.developmentProgress
    ? ` · next development in ${pSim.developmentProgress.turnsLeft} turn${
        pSim.developmentProgress.turnsLeft === 1 ? "" : "s"
      }`
    : "";

  const capitalRow = capitalBurg
    ? `<button type="button" class="livingGuildChip" data-inspect="burg" data-id="${capitalBurg.i}">${escapeHtml(
        capitalBurg.name ?? "Capital"
      )}</button>`
    : `<span class="livingMuted">No province capital</span>`;

  const troubleRow =
    trouble && troubleDef
      ? `<div><strong>${escapeHtml(troubleDef.name)}</strong> (Lv ${trouble.level}, ${trouble.theme})</div>
         <div class="livingMuted">Save: ${SAVE_KIND_LABELS[troubleDef.save]} · Specialist: ${
           UNIT_ROLE_LABELS[troubleDef.requiredRole]
         }</div>`
      : `<div class="livingMuted">No active trouble</div>`;

  const lairDefenders = lair?.defenders.reduce((sum, unit) => sum + (unit.count ?? 0), 0) ?? 0;
  const lairRow =
    lair && lairDef
      ? `<div><strong>${escapeHtml(lair.name)}</strong> (Lv ${lair.level}, ${lair.theme})</div>
         <div class="livingMuted">Raid ${lair.raidThreshold}+ · ${lairDefenders} defenders${
           lair.fortified ? " · 🏰 Fortified" : ""
         }${lair.raidPending ? " · ⚠️ Raid imminent" : ""}</div>`
      : `<div class="livingMuted">No active lair</div>`;

  return `<div class="livingInspectorTitle">🏳️ ${escapeHtml(province.name ?? "Province")}</div>
  <div class="livingMuted">${escapeHtml(owner)}${province.formName ? ` · ${escapeHtml(province.formName)}` : ""}</div>
  <div class="livingSection">
    <div class="livingSectionTitle">Public order</div>
    ${renderMeter("Order", Math.round(pSim.order), false)}
    <div class="livingMuted">Order ${Math.round(pSim.order)}% · Stability ${pSim.stability} · Development ${
      pSim.development
    }${development}</div>
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Capital & faith</div>
    <div>${capitalRow}</div>
    <div class="livingMuted">${capitalSim?.citizens ?? 0} citizens${
      religionName ? ` · ${escapeHtml(religionName)}` : ""
    }</div>
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Trouble</div>
    ${troubleRow}
  </div>
  <div class="livingSection">
    <div class="livingSectionTitle">Lair</div>
    ${lairRow}
  </div>
  <div class="livingButtons">
    <button type="button" data-open="province" data-id="${provinceId}">Provinces Editor</button>
    ${state && !state.removed ? `<button type="button" data-inspect="state" data-id="${state.i}">State</button>` : ""}
  </div>`;
}

function renderCapacity(sSim: StatePolitySim, stateId?: number): string {
  const pools = [
    ["m", "Military"],
    ["w", "Wealth"],
    ["s", "Social"],
    ["c", "Cunning"]
  ] as const;

  const rows = pools
    .map(([key, label]) => {
      const pool = sSim.capacity[key];
      const over = pool.load > pool.gen;
      const ratio = pool.gen > 0 ? Math.min(100, Math.round((pool.load / pool.gen) * 100)) : 0;
      const mod = valueModifier(pool.gen);
      const signMod = mod >= 0 ? `+${mod}` : `${mod}`;
      const tip = `${label}: ${pool.gen} gen / ${pool.load} load (${signMod} check mod)${over ? " (over capacity)" : ""}`;
      return `<div class="livingCapacityRow${over ? " over" : ""}" title="${escapeHtml(tip)}" tabindex="0">
        <span class="livingCapacityLabel">${label} <small style="opacity:0.75; font-size:0.85em;">(${signMod})</small></span>
        <div class="livingBar${over ? " danger" : ""}"><i style="width:${ratio}%"></i></div>
      </div>`;
    })
    .join("");

  const buttons = stateId
    ? `<div class="livingButtons" style="margin-top: 0.35em;">
        <button type="button" data-open="provinces" data-id="${stateId}">Provinces</button>
        <button type="button" data-open="burgs" data-id="${stateId}">Burgs</button>
        <button type="button" data-open="regiments" data-id="${stateId}">Regiments</button>
      </div>`
    : "";

  return `<div class="livingSection"><div class="livingSectionTitle">Capacity</div>${rows}${buttons}</div>`;
}

function renderAgenda(sSim: StatePolitySim): string {
  const agenda = sSim.agenda;
  if (!agenda)
    return `<div class="livingSection"><div class="livingSectionTitle">Agenda</div><span class="livingMuted">No active agenda</span></div>`;

  const ratio = agenda.required > 0 ? Math.min(100, Math.round((agenda.progress / agenda.required) * 100)) : 0;
  return /* html */ `
    <div class="livingSection">
      <div class="livingSectionTitle">Agenda</div>
      <div>${escapeHtml(agenda.label)} <span class="livingMuted">${agenda.progress} / ${agenda.required}</span></div>
      <div class="livingBar"><i style="width:${ratio}%"></i></div>
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
  const restive = Object.values(living.burgs)
    .map(bSim => {
      const burg = pack.burgs[bSim.burgId];
      const bin = getUnrestBin(bSim.unrest);
      return { bSim, burg, bin };
    })
    .filter(
      (entry): entry is { bSim: BurgSimState; burg: (typeof pack.burgs)[number]; bin: (typeof UNREST_BINS)[number] } =>
        Boolean(entry.burg?.state === stateId && !entry.burg.removed && entry.bin)
    );

  if (restive.length === 0) return "";

  const rows = UNREST_BINS.map(bin => {
    const burgsInBin = restive
      .filter(entry => entry.bin.label === bin.label)
      .sort((a, b) => b.bSim.unrest - a.bSim.unrest);

    if (burgsInBin.length === 0) return "";

    const burgLinks = burgsInBin
      .map(({ burg }) => {
        const name = burg.name ?? "Burg";
        return `<button type="button" class="livingLinkBtn" data-zoom-burg="${burg.i}" title="Zoom to ${escapeHtml(name)}">${escapeHtml(name)}</button>`;
      })
      .join(", ");

    return `<li><span class="livingBadge" style="background:${bin.color}; display:inline-block; text-decoration:none; margin-right:0.35em;">${bin.label}</span> ${burgLinks}</li>`;
  })
    .filter(Boolean)
    .join("");

  return rows ? `<div class="livingSectionTitle">Restive burgs</div><ul>${rows}</ul>` : "";
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
  const guild = Living.getGuild?.();
  const sandbox = Boolean(guild?.sandboxGodMode);
  const canDispatch = Boolean(provId && (trouble || lair));

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
    ${
      sandbox
        ? `<div class="livingGodTitle">Sandbox God Mode</div>
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
           </div>`
        : `<div class="livingGodTitle">Guild Operations</div>
           ${canDispatch ? renderPartyPreview(provId) : ""}
           <div class="livingButtons">
             ${canDispatch ? `<button type="button" data-guild="dispatch" data-province="${provId}">Dispatch Auto-Fill</button>` : ""}
             ${stateId ? `<button type="button" data-guild="dispatch-state" data-state="${stateId}">Dispatch to State</button>` : ""}
             ${stateId ? `<button type="button" data-guild="patron" data-state="${stateId}">Make Patron State</button>` : ""}
           </div>
           <div class="livingButtons">
             ${bSim.unrest > 0 ? `<button type="button" data-guild="op-pacify" data-burg="${burgId}" title="${escapeHtml(GUILD_OPERATIONS.pacify_mediate.description)}">Pacify & Mediate — ${GUILD_OPERATIONS.pacify_mediate.cost}g</button>` : ""}
             ${bSim.construction ? `<button type="button" data-guild="op-charter" data-burg="${burgId}" title="${escapeHtml(GUILD_OPERATIONS.rush_charter.description)}">Rush Charter — ${GUILD_OPERATIONS.rush_charter.cost}g</button>` : ""}
             ${burg.state ? `<button type="button" data-guild="op-incite" data-burg="${burgId}" title="${escapeHtml(GUILD_OPERATIONS.incite_uprising.description)}">Incite Uprising — ${GUILD_OPERATIONS.incite_uprising.cost}g</button>` : ""}
           </div>`
    }`;
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

  for (const button of panel.querySelectorAll<HTMLElement>("[data-inspect]")) {
    button.addEventListener("click", () => {
      const kind = button.dataset.inspect as Selection["kind"] | undefined;
      if (!kind) return;
      inspect(kind, Number(button.dataset.id ?? 0));
    });
  }

  for (const button of panel.querySelectorAll<HTMLElement>("[data-god]")) {
    button.addEventListener("click", () => runIntervention(button));
  }

  for (const button of panel.querySelectorAll<HTMLElement>("[data-guild]")) {
    button.addEventListener("click", () => runGuildOperation(button));
  }
}

function runGuildOperation(button: HTMLElement): void {
  const stateId = Number(button.dataset.state ?? 0);
  const provId = Number(button.dataset.province ?? 0);
  const figureId = Number(button.dataset.figure ?? 0);
  const burgId = Number(button.dataset.burg ?? 0);
  let ok = false;
  let message = "";

  switch (button.dataset.guild) {
    case "dispatch":
      ok = Living.dispatchBestHero(provId);
      message = ok ? "A guild hero party set out on an expedition." : "No idle hero or target is available.";
      break;
    case "dispatch-leader":
      ok = Living.dispatchParty(figureId, provId);
      message = ok ? "The pinned leader and their companions set out." : "No idle hero or target is available.";
      break;
    case "op-pacify":
      ok = Living.guildPacifyMediate(burgId);
      message = ok ? "The Guild mediated the burg back to order." : "No qualified idle hero, unrest, or gold.";
      break;
    case "op-charter":
      ok = Living.guildRushAssetCharter(burgId);
      message = ok ? "The Guild charter rushed the works." : "No qualified idle hero, works, or gold.";
      break;
    case "op-incite":
      ok = Living.guildInciteUprising(burgId);
      message = ok ? "The Guild operative lit the fuse." : "No qualified idle hero, target, or gold.";
      break;
    case "op-assassinate":
      ok = Living.guildAssassinateRuler(stateId);
      message = ok ? "The ruler fell; succession follows." : "The assassination failed or no operative was available.";
      break;
    case "op-broker":
      ok = Living.guildBrokerWar(stateId);
      message = ok ? "The Guild's diplomacy succeeded." : "The brokerage failed or no envoy was available.";
      break;
    case "dispatch-state": {
      const living = Living.getState();
      const prov = (pack.provinces ?? []).find(p => {
        if (!p?.i || p.removed || p.state !== stateId) return false;
        const sim = living.provinces?.[p.i];
        return Boolean(sim?.trouble || sim?.lair);
      });
      if (prov) {
        ok = Living.dispatchBestHero(prov.i);
        message = ok ? `A guild hero set out for ${prov.name}.` : "No idle hero is available.";
      } else {
        message = "No trouble or lair to dispatch against.";
      }
      break;
    }
    case "patron":
      Living.setFavoredState(stateId);
      ok = true;
      message = `${pack.states[stateId]?.name ?? "The state"} is now the Guild's patron.`;
      break;
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
    case "recruit":
      ok = Living.recruitCandidate(figureId);
      message = ok ? "A new hero joins the Guild." : "Recruitment failed: not enough gold or the roster is full.";
      break;
    case "retire": {
      const protegeId = Living.retireHero(figureId);
      ok = protegeId !== null;
      message = ok ? "The veteran retired and passed the torch to a protege." : "This hero cannot retire yet.";
      if (ok && protegeId !== null) selected = { kind: "figure", id: protegeId };
      break;
    }
    case "dispatch-marker":
      ok = Living.dispatchBestHeroToMarker(Number(button.dataset.marker ?? 0));
      message = ok ? "A guild hero set out to excavate the site." : "No idle hero is available for the dig.";
      break;
    case "equip": {
      const relicId = Number(button.dataset.relic ?? 0);
      ok = Living.equipRelic(relicId, figureId);
      const name = (Living.getRelics?.() ?? []).find(relic => relic.id === relicId)?.name;
      message = ok ? `${name ?? "The relic"} is now carried by the hero.` : "The relic could not be equipped.";
      break;
    }
    case "enshrine": {
      ok = Living.enshrineRelic(Number(button.dataset.relic ?? 0));
      message = ok ? "The relic was enshrined in the Guild Vault." : "The vault is full; the relic stays in reserve.";
      break;
    }
    case "recall": {
      ok = Living.recallRelic(Number(button.dataset.relic ?? 0));
      message = ok ? "The relic was returned to the Guild Vault." : "The relic could not be recalled.";
      break;
    }
    case "lease":
      ok = Living.leaseRelic(Number(button.dataset.relic ?? 0), stateId);
      message = ok
        ? `${pack.states[stateId]?.name ?? "The state"} now leases the relic from the Guild.`
        : "The lease failed: no vault relic or valid state.";
      break;
    case "petition": {
      const popupId = Number(button.dataset.popup ?? 0);
      const choice = Number(button.dataset.choice ?? 0);
      const outcome = Living.resolvePetition(popupId, choice);
      ok = outcome !== null;
      message = outcome?.summary ?? "The petition could not be resolved.";
      if (ok) selected = null;
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
    case "excavate-marker": {
      const markerId = Number(button.dataset.marker ?? 0);
      ok = Living.excavateMarker(markerId);
      message = ok ? "The site was excavated instantly." : "Nothing left to excavate here.";
      if (ok) selected = { kind: "marker", id: markerId };
      break;
    }
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

function openHeroesDialog(): void {
  const guild = Living.getGuild?.();
  if (!guild) return;

  Dialog.destroy(HEROES_DIALOG_ID);
  if (!findEl("dialogs")) {
    document.body.insertAdjacentHTML("beforeend", `<div id="dialogs"></div>`);
  }

  ensureEl("dialogs").insertAdjacentHTML("beforeend", `<div id="${HEROES_DIALOG_ID}" class="dialog stable"></div>`);
  renderHeroesDialogContent();

  Dialog.open(HEROES_DIALOG_ID, {
    title: "Guild Heroes & Tavern",
    width: "40em",
    position: { my: "center", at: "center", of: "svg" },
    onClose: () => Dialog.destroy(HEROES_DIALOG_ID)
  });
}

function renderHeroesDialogContent(): void {
  const dialogEl = findEl(HEROES_DIALOG_ID);
  if (!dialogEl) return;

  const guild = Living.getGuild?.();
  if (!guild) {
    dialogEl.innerHTML = `<div class="livingHeroEmpty">The Guild has not formed.</div>`;
    return;
  }

  const tier = guild.tier ?? 1;
  const roster = guild.roster ?? [];
  const candidates = guild.candidates ?? [];
  const maxHeroes = maxHeroesForTier(tier);

  const activeHeroesHtml =
    roster.length > 0
      ? roster.map(id => renderHeroDialogItem(guild, id, false)).join("")
      : `<div class="livingHeroEmpty">No active heroes in the guild roster. Recruit seekers from the tavern below.</div>`;

  const tavernSeekersHtml =
    candidates.length > 0
      ? candidates.map(id => renderHeroDialogItem(guild, id, true)).join("")
      : `<div class="livingHeroEmpty">No seekers at the tavern this year. Step a season or wait for travelers.</div>`;

  dialogEl.innerHTML = /* html */ `
    <div class="livingHeroesSection">
      <div class="livingHeroesSectionHeader">
        <span>Active Heroes (${roster.length}/${maxHeroes})</span>
        <span class="livingHeroSub">${guild.gold ?? 0}g in treasury</span>
      </div>
      <div class="livingHeroesList">${activeHeroesHtml}</div>
    </div>
    <div class="livingHeroesSection">
      <div class="livingHeroesSectionHeader">
        <span>Tavern Seekers (${candidates.length})</span>
        <span class="livingHeroSub">${roster.length >= maxHeroes ? "Roster Full" : "Available for Hire"}</span>
      </div>
      <div class="livingHeroesList">${tavernSeekersHtml}</div>
    </div>
  `;

  bindHeroesDialogListeners(dialogEl);
}

function renderHeroDialogItem(guild: GuildState, figureId: number, isSeeker: boolean): string {
  const figure = pack.history?.figures?.find(entry => entry.i === figureId);
  if (!figure) return "";

  const level = figureLevel(figure.xp ?? 0);
  const archetype = figureArchetype(figure);
  const heroState = Living.getHeroState?.(figureId);
  const status = heroStatus(guild, figureId);
  const skills = actionDice(figure);
  const disciplines = figureDisciplines(figure)
    .map(id => `<span class="livingDiscipline">${escapeHtml(HERO_DISCIPLINES[id]?.name ?? id)}</span>`)
    .join(" ");

  const year = options.map?.lore?.calendar?.year ?? 1000;
  const age = Math.max(0, year - figure.birth);
  const culture = pack.cultures?.[figure.culture]?.name;
  const carried = (guild.relics ?? []).find(r => r.holder.kind === "figure" && r.holder.id === figureId);

  let actions = "";
  if (isSeeker) {
    const cost = Living.recruitCost?.(figureId) ?? 40 + (guild.tier ?? 1) * 20;
    const canAfford = (guild.gold ?? 0) >= cost && (guild.roster ?? []).length < maxHeroesForTier(guild.tier ?? 1);
    actions = `
      <button type="button" data-hero-dialog="recruit" data-figure="${figureId}"${canAfford ? "" : " disabled"}>Recruit (${cost}g)</button>
      <button type="button" data-guild="inspect" data-figure="${figureId}">Inspect</button>
    `;
  } else {
    actions = `
      <button type="button" data-guild="inspect" data-figure="${figureId}">Inspect</button>
      <button type="button" data-hero-dialog="toggle-push" data-figure="${figureId}" class="${heroState?.push ? "pressed" : ""}">Push: ${heroState?.push ? "On" : "Off"}</button>
    `;
    if (age >= 55) {
      actions += `<button type="button" data-hero-dialog="retire" data-figure="${figureId}">Retire</button>`;
    }
  }

  const resolveVal = heroState?.resolve ?? 0;
  const maxResolve = heroState?.maxResolve ?? 0;
  const staminaVal = heroState?.stamina ?? 0;
  const maxStamina = heroState?.maxStamina ?? 0;
  const resolvePct = maxResolve > 0 ? Math.min(100, Math.round((resolveVal / maxResolve) * 100)) : 0;
  const staminaPct = maxStamina > 0 ? Math.min(100, Math.round((staminaVal / maxStamina) * 100)) : 0;

  return /* html */ `
    <div class="livingHeroItem${isSeeker ? " seeker" : ""}">
      <div class="livingHeroRowTop">
        <span class="livingHeroName">${escapeHtml(figure.name)}</span>
        <span class="livingHeroArchetype${isSeeker ? " seeker" : ""}">${archetype.icon} ${escapeHtml(archetype.name)}</span>
        <span class="livingHeroMeta">Lv ${level}${isSeeker ? "" : ` (${figure.xp ?? 0} xp)`} · age ${age}${culture ? ` · ${escapeHtml(culture)}` : ""}</span>
        <span class="livingGuildChipStatus">${isSeeker ? "Seeker" : status.label}</span>
      </div>
      <div class="livingHeroStatsRow">
        <div class="livingHeroVitals">
          <span class="livingHeroBar" title="Resolve">Res: ${resolveVal}/${maxResolve} <span class="livingHeroBarMini"><i style="width:${resolvePct}%"></i></span></span>
          <span class="livingHeroBar" title="Stamina">Sta: ${staminaVal}/${maxStamina} <span class="livingHeroBarMini"><i style="width:${staminaPct}%"></i></span></span>
        </div>
        <span>${skills}</span>
        ${disciplines ? `<div class="livingChips">${disciplines}</div>` : ""}
        ${!isSeeker && heroState ? `<span class="livingMuted">Doc: ${HERO_DOCTRINE_LABELS[heroState.doctrine]}</span>` : ""}
        ${carried ? `<span class="livingMuted">Carries: ${escapeHtml(carried.name)}</span>` : ""}
      </div>
      <div class="livingHeroActions">${actions}</div>
    </div>
  `;
}

function bindHeroesDialogListeners(dialogEl: HTMLElement): void {
  for (const button of dialogEl.querySelectorAll<HTMLElement>('[data-guild="inspect"]')) {
    button.addEventListener("click", () => {
      const figureId = Number(button.dataset.figure ?? 0);
      selected = { kind: "figure", id: figureId };
      renderInspector();
    });
  }

  for (const button of dialogEl.querySelectorAll<HTMLElement>('[data-hero-dialog="recruit"]')) {
    button.addEventListener("click", () => {
      const figureId = Number(button.dataset.figure ?? 0);
      const ok = Living.recruitCandidate(figureId);
      if (ok) {
        refresh();
        renderHeroesDialogContent();
        setStatus("A new hero joins the Guild.");
      } else {
        setStatus("Recruitment failed: not enough gold or the roster is full.");
      }
    });
  }

  for (const button of dialogEl.querySelectorAll<HTMLElement>('[data-hero-dialog="toggle-push"]')) {
    button.addEventListener("click", () => {
      const figureId = Number(button.dataset.figure ?? 0);
      const state = Living.getHeroState?.(figureId);
      const ok = Living.setHeroPush(figureId, !state?.push);
      if (ok) {
        refresh();
        renderHeroesDialogContent();
      }
    });
  }

  for (const button of dialogEl.querySelectorAll<HTMLElement>('[data-hero-dialog="retire"]')) {
    button.addEventListener("click", () => {
      const figureId = Number(button.dataset.figure ?? 0);
      const protegeId = Living.retireHero(figureId);
      if (protegeId !== null) {
        if (selected?.kind === "figure" && selected.id === figureId) {
          selected = { kind: "figure", id: protegeId };
        }
        refresh();
        renderHeroesDialogContent();
        setStatus("The veteran retired and passed the torch to a protege.");
      }
    });
  }
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

export const LivingHud = { open, close, toggle, refresh, inspect, openHeroesDialog, selectMarker };
