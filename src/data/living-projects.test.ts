import { describe, expect, it } from "vitest";
import { GOODS_DATA } from "@/data/goods";
import { PROJECT_BY_ID, PROJECTS } from "./living-projects";

describe("Project catalog (living-fmg-native Phase 4)", () => {
  it("has unique ids and one definition per id", () => {
    const ids = PROJECTS.map(project => project.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(PROJECT_BY_ID[id]?.id).toBe(id);
  });

  it("keeps every work sane: a scale, an era, seasons and a price", () => {
    for (const project of PROJECTS) {
      expect(["state", "province", "burg"]).toContain(project.scale);
      expect(project.minDevelopment).toBeGreaterThanOrEqual(0);
      expect(project.minDevelopment).toBeLessThanOrEqual(100);
      expect(project.seasons).toBeGreaterThan(0);
      expect(project.seasons).toBeLessThanOrEqual(4);
      expect(project.treasury).toBeGreaterThan(0);
      expect(project.name.length).toBeGreaterThan(2);
      expect(project.description.length).toBeGreaterThan(10);
    }
  });

  it("only asks for goods the map trades", () => {
    const names = new Set(GOODS_DATA.map(good => good.name));
    for (const project of PROJECTS) {
      for (const cost of project.goods ?? []) {
        expect(names.has(cost.name), `${project.id} asks for ${cost.name}`).toBe(true);
        expect(cost.units).toBeGreaterThan(0);
      }
    }
  });

  it("gives every work something real to change", () => {
    for (const project of PROJECTS) {
      expect(Object.keys(project.effect).length).toBeGreaterThan(0);
      if (project.effect.market) expect(project.scale).toBe("burg");
      if (project.effect.route) expect(project.scale).toBe("state");
      if (project.effect.burgFlag) expect(project.scale).toBe("burg");
    }
  });

  it("offers a work for each kind of ruler", () => {
    const affinity = (key: "martial" | "civic" | "pious" | "cruel") =>
      PROJECTS.some(project => (project.affinity?.[key] ?? 0) > 0);
    expect(affinity("martial")).toBe(true);
    expect(affinity("civic")).toBe(true);
    expect(affinity("pious")).toBe(true);
    expect(affinity("cruel")).toBe(true);
  });
});
