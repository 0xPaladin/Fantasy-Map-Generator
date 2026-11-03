import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/model/options/options-model";
import type { Planet } from "@/model/physical/astral-system/planet";
import { applyPlanetaryOptions, resolveArchetype } from "./planetary-profile";

const body = (over: Partial<Planet> = {}): Planet =>
  ({
    HI: 3,
    hydrographics: 0,
    atmosphere: "Trace",
    temp: "temperate",
    tempC: "10.0",
    ...over
  }) as unknown as Planet;

describe("resolveArchetype", () => {
  it("classifies earthlike bodies as terran", () => {
    expect(resolveArchetype(body({ HI: 1, hydrographics: 0, atmosphere: "Trace" }))).toBe("terran");
    expect(resolveArchetype(body({ HI: 2, hydrographics: 60, atmosphere: "Breathable" }))).toBe("terran");
    expect(resolveArchetype(body({ HI: 4, hydrographics: 30, atmosphere: "Filterable" }))).toBe("terran");
  });

  it("classifies infernal and corrosive bodies as volcanic", () => {
    expect(resolveArchetype(body({ temp: "very hot", atmosphere: "Trace" }))).toBe("volcanic");
    expect(resolveArchetype(body({ temp: "extremely hot" }))).toBe("volcanic");
    expect(resolveArchetype(body({ temp: "frigid", atmosphere: "Corrosive" }))).toBe("volcanic");
  });

  it("classifies cold wet toxic bodies as titan", () => {
    expect(resolveArchetype(body({ temp: "frigid", hydrographics: 45, atmosphere: "Toxic" }))).toBe("titan");
    expect(resolveArchetype(body({ temp: "extremely cold", hydrographics: 10, atmosphere: "Crushing" }))).toBe("titan");
  });

  it("classifies cold dry bodies as icy moons", () => {
    expect(resolveArchetype(body({ temp: "frigid", hydrographics: 0, atmosphere: "Trace" }))).toBe("icy_moon");
    expect(resolveArchetype(body({ temp: "extremely cold", hydrographics: 5, atmosphere: "Trace" }))).toBe("icy_moon");
  });

  it("classifies airless rock as lunar", () => {
    expect(resolveArchetype(body({ hydrographics: 0, atmosphere: "Trace" }))).toBe("lunar");
    expect(resolveArchetype(body({ hydrographics: 0, atmosphere: "Inert" }))).not.toBe("lunar");
  });

  it("falls back to martian for cold deserts and thin unbreathable air", () => {
    expect(resolveArchetype(body({ hydrographics: 20, atmosphere: "Breathable" }))).toBe("martian");
    expect(resolveArchetype(body({ temp: "cold", hydrographics: 10, atmosphere: "Inert" }))).toBe("martian");
  });
});

describe("applyPlanetaryOptions", () => {
  beforeEach(() => {
    globalThis.options = Options.getDefaultOptions();
  });

  it("sets full-globe coordinates, archetype and hydrographics", () => {
    const archetype = applyPlanetaryOptions(body()); // airless rock resolves to lunar
    expect(archetype).toBe("lunar");
    expect(options.map.geography.archetype).toBe("lunar");
    expect(options.map.geography.hydrographics).toBe(0);
    expect(options.map.geography.coordinates).toEqual({
      latT: 180,
      latN: 90,
      latS: -90,
      lonT: 360,
      lonW: -180,
      lonE: 180
    });
  });

  it("narrows the pole-to-equator delta under a thick atmosphere", () => {
    applyPlanetaryOptions(body({ tempC: "30.0", atmosphere: "Crushing" }));
    expect(options.map.climate.temperature).toEqual({ equator: 38, northPole: 18, southPole: 18 });
  });

  it("widens the pole-to-equator delta under a trace atmosphere", () => {
    applyPlanetaryOptions(body({ tempC: "-60.0", atmosphere: "Trace" }));
    expect(options.map.climate.temperature).toEqual({ equator: -30, northPole: -110, southPole: -110 });
  });

  it("uses a moderate delta for standard atmospheres", () => {
    applyPlanetaryOptions(body({ tempC: "15.0", atmosphere: "Breathable", hydrographics: 60 }));
    expect(options.map.climate.temperature).toEqual({ equator: 33, northPole: -13, southPole: -13 });
  });

  it("clamps extreme temperatures into the Int8Array range", () => {
    applyPlanetaryOptions(body({ tempC: "460.0", atmosphere: "Crushing" }));
    const { equator, northPole } = options.map.climate.temperature;
    expect(equator).toBe(120);
    expect(northPole).toBeLessThanOrEqual(120);
    expect(northPole).toBeGreaterThanOrEqual(-120);
  });

  it("kills precipitation on airless worlds and scales it from hydrographics otherwise", () => {
    applyPlanetaryOptions(body({ hydrographics: 0, atmosphere: "Trace" }));
    expect(options.map.climate.precipitation).toBe(0);

    applyPlanetaryOptions(body({ hydrographics: 71, atmosphere: "Breathable" }));
    expect(options.map.climate.precipitation).toBe(100);

    applyPlanetaryOptions(body({ hydrographics: 40, atmosphere: "Inert" }));
    expect(options.map.climate.precipitation).toBe(56);
  });
});
