// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Options } from "@/model/options/options-model";
import { SolarSystem } from "./solar-system";

const ARCHETYPES = ["terran", "lunar", "martian", "icy_moon", "titan", "volcanic", "gas_giant"];

describe("SolarSystem registry", () => {
  beforeEach(() => {
    globalThis.options = Options.getDefaultOptions();
    SolarSystem.reset();
    SolarSystem.forgetOrigin();
  });

  it("initFromSeed creates planets and moons from astral-system", () => {
    SolarSystem.initFromSeed("42");

    const planets = SolarSystem.bodies.filter(body => body.kind === "planet");
    const moons = SolarSystem.bodies.filter(body => body.kind === "moon");

    expect(planets.length).toBeGreaterThan(0);
    expect(SolarSystem.seed).toBe("42");
    expect(SolarSystem.star).toBeTruthy();
    expect(SolarSystem.homeworldId).toBeTruthy();

    const homeworld = SolarSystem.homeworld!;
    expect(homeworld.kind).toBe("moon");
    expect(homeworld.colonizable).toBe(true);
    expect(homeworld.parentId).toMatch(/^planet-\d+$/);

    for (const moon of moons) {
      expect(moon.parentId).toMatch(/^planet-\d+$/);
      expect(SolarSystem.getBody(moon.parentId!)!.kind).toBe("planet");
      expect(moon.orbit.semiMajorAxisAU).toBeGreaterThan(0);
      expect(moon.orbit.periodDays).toBeGreaterThan(0);
    }

    for (const planet of planets) {
      expect(planet.orbit.semiMajorAxisAU).toBeGreaterThan(0);
      expect(planet.orbit.semiMajorAxisAU).toBe(planet.astro.orbit);
      expect(planet.orbit.periodDays).toBeGreaterThan(0);
      expect(planet.orbit.eccentricity).toBeGreaterThanOrEqual(0);
    }
  });

  it("resolves a concrete archetype for every body", () => {
    SolarSystem.initFromSeed("42");
    for (const body of SolarSystem.bodies) {
      expect(ARCHETYPES).toContain(body.archetype);
    }
  });

  it("names planets by designation and moons by letter", () => {
    SolarSystem.initFromSeed("42");
    const planets = SolarSystem.bodies.filter(body => body.kind === "planet");
    expect(planets[0].name).toMatch(/^(GL|HD|KL|TYC|ROSS|WOLF)-\d+ I$/);
    const moon = SolarSystem.bodies.find(body => body.kind === "moon");
    if (moon) expect(moon.name).toBe(`${SolarSystem.getBody(moon.parentId!)!.name} b`);
  });

  it("is deterministic for a fixed seed", () => {
    SolarSystem.initFromSeed("42");
    const first = SolarSystem.bodies.map(body => ({
      id: body.id,
      name: body.name,
      archetype: body.archetype,
      orbit: body.orbit,
      colonizable: body.colonizable
    }));
    SolarSystem.initFromSeed("42");
    expect(
      SolarSystem.bodies.map(body => ({
        id: body.id,
        name: body.name,
        archetype: body.archetype,
        orbit: body.orbit,
        colonizable: body.colonizable
      }))
    ).toEqual(first);
  });

  it("builds the Sol preset with pinned archetypes and Earth as the homeworld", () => {
    SolarSystem.initFromPreset();

    expect(SolarSystem.bodies.length).toBe(14);
    expect(SolarSystem.homeworldId).toBe("earth");
    expect(SolarSystem.getBody("mars")!.archetype).toBe("martian");
    expect(SolarSystem.getBody("io")!.archetype).toBe("volcanic");
    expect(SolarSystem.getBody("titan")!.archetype).toBe("titan");
    expect(SolarSystem.getBody("europa")!.archetype).toBe("icy_moon");
    expect(SolarSystem.getBody("luna")!.archetype).toBe("lunar");
    expect(SolarSystem.getBody("luna")!.parentId).toBe("earth");
    expect(SolarSystem.getBody("jupiter")!.colonizable).toBe(false);
    expect(SolarSystem.getBody("saturn")!.colonizable).toBe(false);
    expect(SolarSystem.getBody("enceladus")!.parentId).toBe("saturn");
  });

  it("refuses to switch to a gas giant", async () => {
    SolarSystem.initFromPreset();
    SolarSystem.redrawHook = () => {};
    await expect(SolarSystem.switchBody("jupiter")).rejects.toThrow("no mappable surface");
    await expect(SolarSystem.switchBody("saturn")).rejects.toThrow("no mappable surface");
  });

  it("throws for unknown body ids", async () => {
    SolarSystem.initFromPreset();
    await expect(SolarSystem.switchBody("planet-x")).rejects.toThrow("does not exist");
  });
});

describe("SolarSystem.switchBody", () => {
  beforeEach(() => {
    globalThis.options = Options.getDefaultOptions();
    // keep the generation runs small; the assertions care about identity, not fidelity
    options.map.graph = { width: 1000, height: 500, points: 2000, sampling: "square", jitter: 0.9 };
    SolarSystem.redrawHook = () => {};
    SolarSystem.reset();
    SolarSystem.forgetOrigin();
  });

  it("swaps the world to a second globe and restores the homeworld exactly", async () => {
    SolarSystem.initFromSeed("42");
    const homeworld = SolarSystem.homeworld!;
    await SolarSystem.switchBody(homeworld.id);

    const baselineGrid = grid;
    const baselineHeights = Array.from(grid.cells.h);
    const baselineBurgs = structuredClone(pack.burgs);
    const baselineStates = structuredClone(pack.states);
    const baselineSeed = options.map.seed;

    const target = SolarSystem.bodies.find(body => body.colonizable && body.id !== homeworld.id);
    expect(target).toBeTruthy();

    await SolarSystem.switchBody(target!.id);

    expect(SolarSystem.activeBodyId).toBe(target!.id);
    expect(target!.materialized).toBe(true);
    expect(target!.snapshot).toBeTruthy();
    expect(grid).not.toBe(baselineGrid); // a genuinely different world is active
    expect(options.map.seed).toBe(target!.astro.seed);
    expect(options.map.geography.archetype).toBe(target!.archetype);
    expect(options.map.geography.coordinates.lonT).toBe(360);

    await SolarSystem.switchBody(homeworld.id);

    expect(SolarSystem.activeBodyId).toBe(homeworld.id);
    expect(grid).toBe(baselineGrid); // the exact original world objects come back
    expect(Array.from(grid.cells.h)).toEqual(baselineHeights);
    expect(pack.burgs).toEqual(baselineBurgs);
    expect(pack.states).toEqual(baselineStates);
    expect(options.map.seed).toBe(baselineSeed);
  });

  it("switching to the active body is a no-op", async () => {
    SolarSystem.initFromSeed("42");
    const homeworld = SolarSystem.homeworld!;
    await SolarSystem.switchBody(homeworld.id);
    const world = grid;

    await SolarSystem.switchBody(homeworld.id);
    expect(grid).toBe(world);
    expect(SolarSystem.activeBodyId).toBe(homeworld.id);
  });

  it("returnToOrigin restores the world the session started from", async () => {
    // a distinctive origin world, standing in for the FMG map before any body switch
    const originGrid = {
      cells: { h: Uint8Array.from([5, 6, 7, 8]) }
    } as unknown as typeof grid;
    globalThis.grid = originGrid;

    SolarSystem.initFromSeed("42");
    await SolarSystem.switchBody(SolarSystem.homeworld!.id); // first switch parks the origin
    const planetWorld = grid;
    expect(planetWorld).not.toBe(originGrid);

    await SolarSystem.switchBody(
      SolarSystem.bodies.find(body => body.colonizable && body.id !== SolarSystem.homeworld!.id)!.id
    );

    SolarSystem.returnToOrigin();

    expect(grid).toBe(originGrid); // the exact origin world objects come back
    expect(Array.from(grid.cells.h)).toEqual([5, 6, 7, 8]);
    expect(SolarSystem.activeBodyId).toBeNull();

    // and body switching still works from the origin
    const target = SolarSystem.bodies.find(body => body.colonizable && body.id !== SolarSystem.homeworld!.id)!;
    await SolarSystem.switchBody(target.id);
    expect(grid).not.toBe(originGrid);
    expect(SolarSystem.activeBodyId).toBe(target.id);
  });
});
