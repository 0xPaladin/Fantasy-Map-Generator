// Which view the map is shown in: the flat map, the 3D mesh, the globe, the solar system orrery
// or the Astral chart

import { notifyAstralView } from "@/app/chrome/astral-view";

export { subscribeAstralView } from "@/app/chrome/astral-view";

type ViewMode = "standard" | "mesh" | "globe" | "system";
type Cartography = "standard" | "astral";
let viewMode: ViewMode = "standard";
let cartography: Cartography = "standard";
let livingWorldEnabled = false;

export const getViewMode = (): ViewMode => viewMode;
export function setViewMode(mode: ViewMode): void {
  if (viewMode === mode) return;
  viewMode = mode;
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("viewmode:change", { detail: mode }));
  }
}

export const is3dView = (): boolean => viewMode !== "standard";
export const isGlobeView = (): boolean => viewMode === "globe";
export const isSystemView = (): boolean => viewMode === "system";
export const isAstralView = (): boolean => cartography === "astral";
export const isLivingWorldEnabled = (): boolean => livingWorldEnabled;

export function setLivingWorld(enabled: boolean): void {
  livingWorldEnabled = enabled;
}

export function setAstralView(on: boolean): void {
  const next: Cartography = on ? "astral" : "standard";
  if (cartography === next) return;

  cartography = next;
  notifyAstralView();
}

// --- Astral view navigation hierarchy ------------------------------------------

// The Astral view has three levels: the Sector View (the star chart), a System
// view (the 3D orrery / System Editor) and a Planet view (an individual world's
// surface). Back navigation always returns up one level, all the way to Sector.

type AstralNavLevel = "sector" | "system" | "planet";
let astralNavLevel: AstralNavLevel = "sector";
let astralNavSystemId: string | null = null; // the system body being viewed

export const getAstralNavLevel = (): AstralNavLevel => astralNavLevel;
export const isAstralNavBeyondSector = (): boolean => astralNavLevel !== "sector";
export const isAstralNavPlanet = (): boolean => astralNavLevel === "planet";
export const getAstralNavSystemId = (): string | null => astralNavSystemId;

/** Enter a system view from the Sector View. */
function dispatchNavChange(): void {
  // the app dispatches so the layers-tab back buttons refresh; headless stubs may lack the API
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent("astralnav:change"));
  }
}

export function enterAstralSystemView(systemId: string): void {
  astralNavLevel = "system";
  astralNavSystemId = systemId;
  dispatchNavChange();
}

/** Enter a planet view from a System View. */
export function enterAstralPlanetView(systemId: string): void {
  astralNavLevel = "planet";
  astralNavSystemId = systemId;
  dispatchNavChange();
}

/** Return one level up: planet -> system, system -> sector, sector stays. */
export function returnToAstralSystem(): void {
  if (astralNavLevel === "planet") astralNavLevel = "system";
  dispatchNavChange();
}

/** Return all the way to the Sector View, clearing the navigation stack. */
export function returnToAstralSector(): void {
  astralNavLevel = "sector";
  astralNavSystemId = null;
  dispatchNavChange();
}

/** Reset the navigation stack when leaving the Astral view entirely. */
export function resetAstralNav(): void {
  astralNavLevel = "sector";
  astralNavSystemId = null;
  dispatchNavChange();
}
