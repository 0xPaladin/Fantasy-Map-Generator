import { describe, expect, it, vi } from "vitest";
import {
  getViewMode,
  is3dView,
  isAstralView,
  isGlobeView,
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

  it("resets back to standard view", () => {
    setViewMode("globe");
    setViewMode("standard");
    expect(getViewMode()).toBe("standard");
    expect(is3dView()).toBe(false);
    expect(isGlobeView()).toBe(false);
  });
});
