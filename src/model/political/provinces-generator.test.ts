import { beforeEach, expect, it } from "vitest";
import { Provinces } from "./provinces-generator";

beforeEach(async () => {
  await import("./provinces-generator");
});

it("sets a province's revenue lines", () => {
  globalThis.pack = {
    provinces: [0, { i: 1, name: "Old", formName: "Duchy", fullName: "Duchy of Old" }]
  } as any;

  Provinces.setAdjustments(1, [{ name: "Tolls", value: 12 }]);
  expect(pack.provinces[1].adjustments).toEqual([{ name: "Tolls", value: 12 }]);
  expect(() => Provinces.setAdjustments(9, [])).toThrow("Province 9 does not exist");
});

it("keeps a province's full-name pattern and rebuilds it when the name is not in it", () => {
  globalThis.pack = {
    provinces: [
      0,
      { i: 1, name: "Old", formName: "Duchy", fullName: "Duchy of Old" },
      { i: 2, name: "Ash", formName: "March", fullName: "Border" }
    ]
  } as any;
  Provinces.rename(1, "New");
  expect(pack.provinces[1].fullName).toBe("Duchy of New");
  Provinces.rename(2, "Elm");
  expect(pack.provinces[2].fullName).toBe("Elm March");
  expect(() => Provinces.rename(3, "X")).toThrow("Province 3 does not exist");
});
