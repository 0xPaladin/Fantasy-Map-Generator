import { describe, expect, it } from "vitest";
import {
  bodySceneRadius,
  controllingStates,
  ellipsePoint,
  gasGiantBandColors,
  orbitRadius,
  rockyBaseColor
} from "./system-3d-renderer";

describe("orrery scene math", () => {
  it("compresses orbital radii monotonically and keeps AU spans navigable", () => {
    const mercury = orbitRadius(0.39);
    const earth = orbitRadius(1);
    const neptune = orbitRadius(30.1);

    expect(mercury).toBeGreaterThan(0);
    expect(earth).toBeGreaterThan(mercury);
    expect(neptune).toBeGreaterThan(earth);
    // compression: 77x the distance must not be 77x the scene radius
    expect(neptune / mercury).toBeLessThan(6);
  });

  it("places the Kepler ellipse focus on the star", () => {
    const a = 10;
    const e = 0.4;
    const periapsis = ellipsePoint(a, e, 0);
    const apoapsis = ellipsePoint(a, e, Math.PI);

    expect(periapsis.x).toBeCloseTo(a * (1 - e), 6); // closest to the star
    expect(apoapsis.x).toBeCloseTo(-a * (1 + e), 6); // farthest from the star
    expect(Math.hypot(periapsis.x, periapsis.z)).toBeCloseTo(a * (1 - e), 6);
  });

  it("sizes planets by log-compressed astro radius with gas giants above moons", () => {
    const jupiter = bodySceneRadius(69.9, "planet");
    const earth = bodySceneRadius(6.371, "planet");
    const ceres = bodySceneRadius(0.47, "planet");
    const luna = bodySceneRadius(1.737, "moon");

    expect(jupiter).toBeGreaterThan(earth);
    expect(earth).toBeGreaterThan(ceres);
    expect(luna).toBeLessThan(earth);
  });
});

describe("orrery procedural surfaces", () => {
  it("picks three distinct gas giant band colors, deterministically", () => {
    const first = gasGiantBandColors("planet-5");
    const second = gasGiantBandColors("planet-5");

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(3);
    expect(gasGiantBandColors("planet-6")).not.toEqual(first);
  });

  it("picks a rocky base color deterministically per body", () => {
    expect(rockyBaseColor("planet-2-moon-0")).toBe(rockyBaseColor("planet-2-moon-0"));
  });
});

describe("controllingStates", () => {
  it("lists up to four states with colors from a materialized snapshot", () => {
    const snapshot = {
      pack: {
        states: [
          { name: "Empire", color: "#ff0000" },
          { name: "Republic", color: "#00ff00" },
          null,
          { name: "Gone", color: "#0000ff", removed: true },
          { name: "League", color: "#0000ff" }
        ]
      }
    } as unknown as Parameters<typeof controllingStates>[0];

    const states = controllingStates(snapshot);
    expect(states.map(state => state.name)).toEqual(["Empire", "Republic", "League"]);
    expect(states.every(state => state.color)).toBe(true);
  });

  it("returns nothing for unmaterialized bodies", () => {
    expect(controllingStates(undefined)).toEqual([]);
  });
});
