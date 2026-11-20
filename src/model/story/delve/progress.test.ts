import { describe, expect, it } from "vitest";
import type { Rng } from "@/utils/rng";
import { alertDie, alertFromInhabitants, driftChaos, frameScene, rollProgress, stepAlert } from "./progress";

function scripted(...faces: number[]): Rng {
  let index = 0;
  return {
    next: () => 0.5,
    range: lo => lo,
    int: lo => lo,
    d: sides => {
      const face = faces[index++] ?? 1;
      return Math.max(1, Math.min(sides, face));
    },
    choice: items => items[0],
    chance: () => false
  };
}

describe("alert ladder", () => {
  it("starts from the inhabitants rating", () => {
    expect(alertFromInhabitants(1)).toBe("quiet");
    expect(alertFromInhabitants(2)).toBe("uneasy");
    expect(alertFromInhabitants(3)).toBe("uneasy");
    expect(alertFromInhabitants(4)).toBe("alerted");
    expect(alertFromInhabitants(5)).toBe("alerted");
    expect(alertFromInhabitants(6)).toBe("hunting");
  });

  it("steps and clamps", () => {
    expect(stepAlert("quiet")).toBe("uneasy");
    expect(stepAlert("alerted", 2)).toBe("hunting");
    expect(stepAlert("hunting")).toBe("hunting");
    expect(stepAlert("quiet", -1)).toBe("quiet");
  });

  it("sets the alert threat die", () => {
    expect(alertDie("quiet")).toBe(6);
    expect(alertDie("uneasy")).toBe(8);
    expect(alertDie("alerted")).toBe(10);
    expect(alertDie("hunting")).toBe(12);
  });
});

describe("frameScene", () => {
  it("interrupts on an exact chaos roll and raises chaos", () => {
    const scene = frameScene(scripted(5), 5);
    expect(scene.kind).toBe("interrupt");
    expect(scene.chaos).toBe(6);
  });

  it("alters below chaos and plays straight above it", () => {
    expect(frameScene(scripted(4), 5).kind).toBe("altered");
    expect(frameScene(scripted(6), 5).kind).toBe("expected");
  });

  it("clamps chaos to 1-9", () => {
    expect(driftChaos(9, 1)).toBe(9);
    expect(driftChaos(1, -1)).toBe(1);
  });
});

describe("rollProgress", () => {
  it("maps the d6 to the four outcomes", () => {
    expect(rollProgress(scripted(1)).kind).toBe("upheaval");
    expect(rollProgress(scripted(2)).kind).toBe("setback");
    expect(rollProgress(scripted(3)).kind).toBe("compromised");
    expect(rollProgress(scripted(4)).kind).toBe("advance");
    expect(rollProgress(scripted(6)).kind).toBe("advance");
  });
});
