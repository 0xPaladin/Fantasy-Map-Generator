// Enter and leave the Astral view: swap the layer profile and, when available, the chart style
import Alea from "alea";
import { Controllers } from "@/controllers";
import { ASTRAL_DEFAULT_PRESET, ASTRAL_PRESETS } from "@/data/astral-layers";
import { ANOMALY_DIVIDER, astralLegend, MARKER_READINGS } from "@/data/astral-markers";
import { ASTRAL_ERAS, DEFAULT_ERAS, type Era } from "@/data/development";
import { isAstralBase } from "@/data/name-bases";
import { assignAstralStateRoster } from "@/data/roster-content";
import { Goods } from "@/model/economy/goods-generator";
import { Production } from "@/model/economy/production-generator";
import { Icons } from "@/model/icons";
import { Options } from "@/model/options/options-model";
import type { OptionsData } from "@/model/options/options-schema";
import { pickFor, sectorWordFor } from "@/model/physical/astral-naming";
import { Burgs } from "@/model/political/burgs-generator";
import { Military, type Regiment } from "@/model/political/military-generator";
import {
  getAstralMilitaryUnits,
  getDefaultMilitaryUnits,
  isAstralMilitaryUnits
} from "@/model/political/military-units";
import { Provinces } from "@/model/political/provinces-generator";
import { States, type TariffRule } from "@/model/political/states-generator";
import { Development } from "@/model/society/development-generator";
import { Names } from "@/model/society/names-generator";
import { Layers, type LayersState } from "@/renderers/layers";
import { applyPerformanceSettings, setHaloOwnedByBorders } from "@/renderers/performance";
import { is3dView, isAstralView, returnToAstralSector, setAstralView } from "@/renderers/view-mode";
import { StylePresetsService } from "@/services/style-presets";
import type { Good } from "@/types/economy";
import type { MilitaryUnit } from "@/types/military";
import type { StylesData } from "@/types/styles";
import { refreshEditors } from "@/ui/dialog/dialog-helpers";
import { invokeActiveZooming } from "@/ui/map/zoom";
import { tip } from "@/ui/tooltips";
import { capitalize, findEl } from "@/utils";

const PROFILE_KEY = "fmg-astral-previous-profile";
const POLITICAL_LAYERS = [
  "borders",
  "burgIcons",
  "ice",
  "labels",
  "lakes",
  "rivers",
  "routes",
  "scaleBar",
  "states",
  "vignette"
];

const ASTRAL_BASE_DEVELOPMENT: Record<string, number> = {
  VRARC: 98,
  TRKSY: 94,
  VRSOL: 94,
  VRACN: 92,
  VRELY: 91,
  TRKCO: 88,
  VRECH: 90,
  VRCRY: 88,
  TRKTE: 76,
  VRHEG: 84,
  GRMCH: 80,
  VRMIG: 82,
  VRGRY: 82,
  VRHUI: 80,
  VRXOT: 78,
  TRKCN: 64,
  VRONE: 90,
  VRFRN: 68,
  GRMCO: 62,
  GRMIR: 58,
  GRMGO: 44
};

function isDefaultEraList(eras: readonly Era[] | undefined, reference: readonly Era[]): boolean {
  if (!eras?.length) return true;
  return (
    eras.length === reference.length &&
    eras.every((e, i) => e.level === reference[i].level && e.name === reference[i].name)
  );
}

const ASTRAL_NAME_BASES = [
  "TRKCO",
  "TRKTE",
  "TRKCN",
  "TRKSY",
  "GRMCO",
  "GRMGO",
  "GRMIR",
  "GRMCH",
  "VRARC",
  "VRACN",
  "VRELY",
  "VRSOL",
  "VRHEG",
  "VRMIG",
  "VRHUI",
  "VRCRY",
  "VRECH",
  "VRGRY",
  "VRXOT",
  "VRFRN",
  "VRONE"
];

interface BurgSnapshot {
  i: number;
  name?: string;
}

interface StateSnapshot {
  i: number;
  name: string;
  form?: string;
  formName?: string;
  fullName?: string;
  label?: string;
  tariffs?: TariffRule[];
  rosterId?: string;
  alert?: number;
  military?: Regiment[];
}

interface ProvinceSnapshot {
  i: number;
  name: string;
  formName?: string;
  fullName?: string;
}

interface MarkerSnapshot {
  i: number;
  name: string;
  icon: string;
  note?: string;
}

interface StoredProfile {
  stylePreset: string;
  styled: boolean;
  layers: LayersState;
}

interface Profile extends StoredProfile {
  styles: StylesData;
  extents?: string;
  burgs?: BurgSnapshot[];
  states?: StateSnapshot[];
  provinces?: ProvinceSnapshot[];
  goods?: Good[];
  cellsGood?: Uint16Array;
  markers?: MarkerSnapshot[];
  eras?: Era[];
  cellsDevelopment?: Uint8Array;
  culturesDevelopment?: { i: number; development?: number }[];
  militaryUnits?: MilitaryUnit[];
}

let profile: Profile | null = null;
let transition = 0;

function getAstralBaseForCulture(cultureId: number): string {
  const culture = pack?.cultures?.[cultureId];
  if (culture?.base && isAstralBase(Names.getNameBase(culture.base))) {
    return culture.base;
  }
  return ASTRAL_NAME_BASES[(cultureId || 1) % ASTRAL_NAME_BASES.length];
}

function generateAstralBurgName(burg: { i: number; culture?: number }): string {
  const baseId = getAstralBaseForCulture(burg.culture ?? 0);
  const rng = Alea(`${options?.map?.seed ?? ""}/astral/burg/name/${burg.i}`);
  const oldRandom = Math.random;
  Math.random = rng;
  let name = "Alpha";
  try {
    name = Names.getBase(baseId);
  } finally {
    Math.random = oldRandom;
  }
  return name && name !== "ERROR" ? name : "Alpha";
}

function applyAstralNames(): void {
  if (!pack?.burgs || !pack?.states) return;

  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const base = Names.getNameBase(pack.cultures?.[burg.culture ?? 0]?.base);
    if (!isAstralBase(base)) {
      const astralName = generateAstralBurgName(burg);
      Burgs.rename(burg.i, astralName);
    }
  }

  for (const state of pack.states) {
    if (!state?.i || state.removed || !state.name) continue;
    const capital = state.capital ? pack.burgs[state.capital] : undefined;
    const culture = state.culture ?? 0;
    const astralBaseId = getAstralBaseForCulture(culture);
    const astralBase = Names.getNameBase(astralBaseId);
    const polityWords = astralBase?.groups?.polities?.filter(w => !/\bof\b/i.test(w)) ?? [
      "United Federation",
      "Galactic Union",
      "Core Worlds",
      "Star League",
      "Hegemony",
      "Dominion",
      "Commonwealth"
    ];
    const word = pickFor(polityWords, capital?.name || state.name) ?? "Federation";

    if (capital?.name && state.name !== capital.name) {
      States.rename(state.i, capital.name);
    }
    States.setForm(state.i, word);
  }

  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed || !province.name) continue;
    const culture = pack.burgs?.[province.burg]?.culture ?? 0;
    const word = sectorWordFor(province.name, culture) ?? "Sector";
    Provinces.setForm(province.i, word);
  }

  Layers.draw("labels");
}

function applyAstralDevelopment(): void {
  if (!pack?.cells) return;
  if (isDefaultEraList(options.map.eras, DEFAULT_ERAS)) {
    options.map.eras = Development.getAstralEras();
  }
  const astralSet = ["astralTrek", "grimdark", "verse"].includes(options.map.cultures?.set ?? "");
  if (!astralSet && pack.cultures) {
    for (const culture of pack.cultures) {
      if (!culture?.i || culture.removed) continue;
      if ((culture.development ?? 0) < 48) {
        const baseId = getAstralBaseForCulture(culture.i);
        culture.development = ASTRAL_BASE_DEVELOPMENT[baseId] ?? 64;
      }
    }
  }
  Development.generateAstral();
}

function applyAstralGoods(): void {
  if (!pack?.cells) return;
  if (!Goods.isAstralCatalogue()) {
    const previousIds = (options.map.goods ?? []).map(good => good.i);
    Goods.switchToAstralGoods();
    States.pruneTariffs({ goods: previousIds.filter(id => !Goods.get(id)) });
    Goods.generate();
    Production.regenerate();
    Layers.draw("markets", "goods", "trade");
  }
}

function applyAstralMilitary(): void {
  if (!pack?.states || !pack?.cells) return;
  if (!isAstralMilitaryUnits(options.map.military?.units)) {
    options.map.military.units = getAstralMilitaryUnits();
  }
  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    state.rosterId = assignAstralStateRoster(state, pack.cultures ?? []);
  }
  Military.generate();
  if (Layers.state.active.includes("military")) Layers.draw("military");
}

function applyAstralMarkers(): void {
  if (!pack?.markers) return;
  for (const marker of pack.markers) {
    const reading = MARKER_READINGS[marker.type];
    if (!reading || marker.hidden) continue;
    const legend = astralLegend(marker.type, `${marker.i}|${marker.name ?? ""}`);
    if (legend && !marker.note?.includes(ANOMALY_DIVIDER)) {
      const original = marker.note ? `${ANOMALY_DIVIDER}${marker.note}` : "";
      marker.note = `${legend}${original}`;
    }
    marker.icon = Icons.reference(reading.icon);
    marker.name = capitalize(reading.reading);
  }
  Layers.draw("markers");
}

function reverseAstralState(previous: Profile | null): void {
  if (!pack) return;

  if (previous?.burgs) {
    for (const b of previous.burgs) {
      const burg = pack.burgs[b.i];
      if (burg) {
        burg.name = b.name;
        if (burg.label?.text !== undefined) burg.label.text = b.name ?? "";
      }
    }
  }

  if (previous?.states) {
    for (const s of previous.states) {
      const state = pack.states[s.i];
      if (state) {
        state.name = s.name;
        state.form = s.form;
        if (s.formName) state.formName = s.formName;
        else delete state.formName;
        state.fullName = s.fullName;
        if (state.label?.text !== undefined && s.label !== undefined) {
          state.label.text = s.label;
        }
        if (state.economy && s.tariffs !== undefined) {
          state.economy.tariffs = structuredClone(s.tariffs);
        }
        state.rosterId = s.rosterId;
        if (s.alert !== undefined) state.alert = s.alert;
        if (s.military !== undefined) state.military = structuredClone(s.military);
      }
    }
  }

  if (previous?.provinces) {
    for (const p of previous.provinces) {
      const province = pack.provinces[p.i];
      if (province) {
        province.name = p.name;
        province.formName = p.formName ?? "";
        province.fullName = p.fullName ?? p.name;
      }
    }
  }
  Layers.draw("labels");

  if (previous?.eras) {
    options.map.eras = structuredClone(previous.eras);
  } else if (isDefaultEraList(options.map.eras, ASTRAL_ERAS)) {
    options.map.eras = Development.getDefaultEras();
  }

  if (previous?.culturesDevelopment && pack.cultures) {
    for (const entry of previous.culturesDevelopment) {
      const culture = pack.cultures[entry.i];
      if (culture) culture.development = entry.development;
    }
  }

  if (previous?.cellsDevelopment && pack.cells) {
    pack.cells.development = new Uint8Array(previous.cellsDevelopment);
  }

  if (previous?.goods && previous?.cellsGood) {
    options.map.goods = structuredClone(previous.goods);
    pack.cells.good = new Uint16Array(previous.cellsGood);
    Goods.sync();
    Production.regenerate();
    Layers.draw("markets", "goods", "trade");
  } else if (Goods.isAstralCatalogue()) {
    Goods.restoreDefaults();
    Goods.generate();
    Production.regenerate();
    Layers.draw("markets", "goods", "trade");
  }

  if (previous?.militaryUnits) {
    options.map.military.units = structuredClone(previous.militaryUnits);
    if (Layers.state.active.includes("military")) Layers.draw("military");
  } else if (isAstralMilitaryUnits(options.map.military?.units)) {
    options.map.military.units = getDefaultMilitaryUnits();
    for (const state of pack.states ?? []) {
      if (state.i && !state.removed) delete state.rosterId;
    }
    Military.generate();
    if (Layers.state.active.includes("military")) Layers.draw("military");
  }

  if (previous?.markers) {
    for (const m of previous.markers) {
      const marker = pack.markers?.find(entry => entry.i === m.i);
      if (marker) {
        marker.name = m.name;
        marker.icon = m.icon;
        if (m.note !== undefined) marker.note = m.note;
        else delete marker.note;
      }
    }
  } else {
    for (const marker of pack.markers ?? []) {
      if (marker.note?.includes(ANOMALY_DIVIDER)) {
        marker.note = marker.note.split(ANOMALY_DIVIDER)[1];
      }
    }
  }
  Layers.draw("markers");

  refreshEditors();
}

function saveProfile(value: StoredProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
  } catch {
    // a full storage only costs the cross-reload fallback
  }
}

function readProfile(): StoredProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredProfile>;
    if (typeof value.stylePreset !== "string" || typeof value.styled !== "boolean") return null;
    const layers = value.layers;
    if (!layers || !Array.isArray(layers.order) || !Array.isArray(layers.active)) return null;
    return { stylePreset: value.stylePreset, styled: value.styled, layers };
  } catch {
    return null;
  }
}

function clearProfile(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    // nothing to clear
  }
}

function applyLayers(active: readonly string[], order?: string[]): void {
  Layers.restore({ order: order ?? Layers.state.order, active: [...active] });
  Layers.drawAll();
}

function applyButtonState(astral: boolean): void {
  const viewMode = findEl("viewMode");
  if (!viewMode) return;
  for (const button of viewMode.querySelectorAll("button")) button.classList.remove("pressed");
  findEl(astral ? "viewAstral" : "viewStandard")?.classList.add("pressed");
}

async function applyStyle(styles: unknown, current: number): Promise<void> {
  if (current !== transition) return;
  await Controllers.StylePresetsEditor.applyPreset(styles);
  if (current !== transition) return;
  Layers.drawAll();
  invokeActiveZooming();
  void Controllers.StyleEditor.refresh(true);
}

async function enter(): Promise<void> {
  if (isAstralView()) return;
  if (options.app.mode) return void tip("Finish editing before entering Astral view", false, "error");
  if (is3dView()) await Controllers.View3d.enterStandard();

  const styled = StylePresetsService.isSystem("astral");
  const burgsSnapshot: BurgSnapshot[] = (pack.burgs ?? []).map(b => ({
    i: b.i,
    name: b.name
  }));

  const statesSnapshot: StateSnapshot[] = (pack.states ?? []).map(s => ({
    i: s.i,
    name: s.name,
    form: s.form,
    formName: s.formName,
    fullName: s.fullName,
    label: s.label?.text,
    tariffs: s.economy?.tariffs ? structuredClone(s.economy.tariffs) : undefined,
    rosterId: s.rosterId,
    alert: s.alert,
    military: s.military ? structuredClone(s.military) : undefined
  }));

  const provincesSnapshot: ProvinceSnapshot[] = (pack.provinces ?? []).map(p => ({
    i: p.i,
    name: p.name,
    formName: p.formName,
    fullName: p.fullName
  }));

  const goodsSnapshot = options.map.goods ? structuredClone(options.map.goods) : undefined;
  const cellsGoodSnapshot = pack.cells?.good ? new Uint16Array(pack.cells.good) : undefined;
  const erasSnapshot = options.map.eras ? structuredClone(options.map.eras) : undefined;
  const cellsDevSnapshot = pack.cells?.development ? new Uint8Array(pack.cells.development) : undefined;
  const culturesDevSnapshot = (pack.cultures ?? []).map(c => ({ i: c.i, development: c.development }));
  const militaryUnitsSnapshot = options.map.military?.units ? structuredClone(options.map.military.units) : undefined;

  const markersSnapshot: MarkerSnapshot[] = (pack.markers ?? []).map(m => ({
    i: m.i,
    name: m.name,
    icon: m.icon,
    note: m.note
  }));

  const next: Profile = {
    stylePreset: options.map.style.preset,
    styled,
    layers: Layers.state,
    styles: structuredClone(styles),
    extents: options.map.extents,
    burgs: burgsSnapshot,
    states: statesSnapshot,
    provinces: provincesSnapshot,
    goods: goodsSnapshot,
    cellsGood: cellsGoodSnapshot,
    markers: markersSnapshot,
    eras: erasSnapshot,
    cellsDevelopment: cellsDevSnapshot,
    culturesDevelopment: culturesDevSnapshot,
    militaryUnits: militaryUnitsSnapshot
  };
  profile = next;
  saveProfile({ stylePreset: next.stylePreset, styled: next.styled, layers: next.layers });
  const current = ++transition;

  setAstralView(true);
  setHaloOwnedByBorders(true);
  options.map.astral = true;
  if (styled) options.map.style.preset = "astral";
  Options.persist();
  applyButtonState(true);
  returnToAstralSector();
  applyLayers(ASTRAL_PRESETS[ASTRAL_DEFAULT_PRESET].layers);

  applyAstralNames();
  applyAstralDevelopment();
  applyAstralGoods();
  applyAstralMilitary();
  applyAstralMarkers();
  refreshEditors();

  if (!styled) return;
  const loaded = await StylePresetsService.load("astral");
  if (current !== transition || !isAstralView()) return;
  if (loaded.error) tip(`${loaded.error}. Keeping the current style`, false, "error", 8000);
  else await applyStyle(loaded.styles, current);
}

async function exit(): Promise<void> {
  if (!isAstralView()) return;
  if (is3dView()) await Controllers.View3d.enterStandard();
  const current = ++transition;
  const previousProfile = profile;
  const stored = readProfile();
  const restoreStyle = previousProfile?.styled ?? stored?.styled ?? StylePresetsService.isSystem("astral");

  setAstralView(false);
  setHaloOwnedByBorders(false);
  options.map.astral = false;
  if (options.map.extents === "astral") {
    options.map.extents = (previousProfile?.extents as OptionsData["map"]["extents"]) ?? "whole";
  }
  options.map.style.preset = previousProfile?.stylePreset ?? stored?.stylePreset ?? "default";
  Options.persist();
  applyButtonState(false);
  returnToAstralSector();
  applyLayers(
    previousProfile?.layers.active ?? stored?.layers.active ?? POLITICAL_LAYERS,
    previousProfile?.layers.order ?? stored?.layers.order
  );

  reverseAstralState(previousProfile);

  if (restoreStyle) {
    if (profile) await applyStyle(profile.styles, current);
    else {
      const loaded = await StylePresetsService.load(options.map.style.preset);
      if (current !== transition || isAstralView()) return;
      if (loaded.error) tip(`${loaded.error}. Applying the default style`, false, "error", 8000);
      await applyStyle(loaded.styles, current);
    }
  }

  profile = null;
  clearProfile();
}

const toggle = async (): Promise<void> => (isAstralView() ? exit() : enter());

/** Adopt the persisted mode without re-applying anything: the loaded map already carries its state */
function hydrate(): void {
  const astral = options.map.astral === true;
  setAstralView(astral);
  setHaloOwnedByBorders(astral);
  applyButtonState(astral);
}

// the halo lives on the states layer but is switched by the Borders one, so re-check it on every change
Layers.subscribe(() => applyPerformanceSettings());

window?.addEventListener?.("map:generated", hydrate);

export const AstralMode = { enter, exit, toggle, hydrate };
