import { describe, expect, it, vi } from "vitest";
import {
  enterAstralPlanetView,
  enterAstralSystemView,
  getAstralNavLevel,
  getViewMode,
  is3dView,
  isAstralNavBeyondSector,
  isAstralNavPlanet,
  isAstralView,
  isGlobeView,
  isSystemView,
  resetAstralNav,
  returnToAstralSector,
  returnToAstralSystem,
  setAstralView,
  setViewMode,
  subscribeAstralView
} from "./view-mode";

describe("the Astral view flag", () => {
  it("notifies subscribers only when the mode changes", () => {
    setAstralView(false);
    const listener = vi.fn();
    const unsubscribe = subscribeAstralView(listener);

    setAstralView(true);
    expect(isAstralView()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    setAstralView(true);
    expect(listener).toHaveBeenCalledOnce();

    setAstralView(false);
    expect(isAstralView()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setAstralView(true);
    expect(listener).toHaveBeenCalledTimes(2);
    setAstralView(false);
  });
});

describe("view mode switching", () => {
  it("defaults to standard view", () => {
    setViewMode("standard");
    expect(getViewMode()).toBe("standard");
    expect(is3dView()).toBe(false);
    expect(isGlobeView()).toBe(false);
  });

  it("handles globe view mode", () => {
    setViewMode("globe");
    expect(getViewMode()).toBe("globe");
    expect(is3dView()).toBe(true);
    expect(isGlobeView()).toBe(true);
  });

  it("handles mesh 3d view mode", () => {
    setViewMode("mesh");
    expect(getViewMode()).toBe("mesh");
    expect(is3dView()).toBe(true);
    expect(isGlobeView()).toBe(false);
  });

  it("handles system orrery view mode", () => {
    setViewMode("system");
    expect(getViewMode()).toBe("system");
    expect(is3dView()).toBe(true);
    expect(isGlobeView()).toBe(false);
    expect(isSystemView()).toBe(true);
    setViewMode("standard");
    expect(isSystemView()).toBe(false);
  });

  it("resets back to standard view", () => {
    setViewMode("globe");
    setViewMode("standard");
    expect(getViewMode()).toBe("standard");
    expect(is3dView()).toBe(false);
    expect(isGlobeView()).toBe(false);
  });
});

describe("Astral navigation hierarchy", () => {
  it("walks sector -> system -> planet and back up", () => {
    resetAstralNav();
    expect(getAstralNavLevel()).toBe("sector");
    expect(isAstralNavBeyondSector()).toBe(false);

    enterAstralSystemView("planet-2");
    expect(getAstralNavLevel()).toBe("system");
    expect(isAstralNavBeyondSector()).toBe(true);
    expect(isAstralNavPlanet()).toBe(false);

    enterAstralPlanetView("planet-2");
    expect(getAstralNavLevel()).toBe("planet");
    expect(isAstralNavPlanet()).toBe(true);

    returnToAstralSystem();
    expect(getAstralNavLevel()).toBe("system");
    expect(isAstralNavPlanet()).toBe(false);

    returnToAstralSector();
    expect(getAstralNavLevel()).toBe("sector");
    expect(isAstralNavBeyondSector()).toBe(false);
  });

  it("returnToAstralSystem never leaves the sector level behind", () => {
    resetAstralNav();
    returnToAstralSystem();
    expect(getAstralNavLevel()).toBe("sector");
  });

  it("resetAstralNav clears the stack from any depth", () => {
    resetAstralNav();
    enterAstralSystemView("planet-0");
    enterAstralPlanetView("planet-0");
    resetAstralNav();
    expect(getAstralNavLevel()).toBe("sector");
    expect(isAstralNavBeyondSector()).toBe(false);
  });
});
