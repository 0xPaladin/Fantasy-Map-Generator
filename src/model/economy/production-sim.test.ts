import { describe, expect, it } from "vitest";
import { buildingModifierFor } from "./production-generator";

describe("Living World building manufacture boosts (economy alignment Phase 3)", () => {
  it("multiplies every manufacture by the burg's general buildings", () => {
    expect(buildingModifierFor([], "Grain")).toBe(1);
    expect(buildingModifierFor(["workshop"], "Grain")).toBeCloseTo(1.15);
    expect(buildingModifierFor(["windmill", "workshop"], "Grain")).toBeCloseTo(1.265);
    expect(buildingModifierFor(["factory"], "Grain")).toBeCloseTo(1.35);
  });

  it("adds the forge bonus only for metal and arms", () => {
    expect(buildingModifierFor(["forge"], "Grain")).toBeCloseTo(1);
    expect(buildingModifierFor(["forge"], "Arms")).toBeCloseTo(1.2);
    expect(buildingModifierFor(["forge"], "Tools")).toBeCloseTo(1.2);
  });

  it("stacks the armory forge on arms and artillery", () => {
    expect(buildingModifierFor(["workshop", "forge", "armory_forge"], "Artillery")).toBeCloseTo(1.15 * 1.2 * 1.25);
    expect(buildingModifierFor(["armory_forge"], "Tools")).toBeCloseTo(1);
  });
});
