import { describe, expect, it } from "vitest";
import { GUILD_OPERATION_LABELS, GUILD_OPERATIONS } from "@/data/guild-operations";
import { HERO_ARCHETYPE_IDS } from "@/data/hero-archetypes";

describe("guild operations", () => {
  it("defines the five paid operations with hero requirements", () => {
    expect(Object.keys(GUILD_OPERATIONS)).toHaveLength(5);
    expect(GUILD_OPERATIONS.pacify_mediate.cost).toBe(40);
    expect(GUILD_OPERATIONS.rush_charter.cost).toBe(50);
    expect(GUILD_OPERATIONS.incite_uprising.cost).toBe(75);
    expect(GUILD_OPERATIONS.assassinate_ruler.cost).toBe(100);
    expect(GUILD_OPERATIONS.war_broker.cost).toBe(80);

    for (const operation of Object.values(GUILD_OPERATIONS)) {
      expect(operation.archetypes.length).toBeGreaterThan(0);
      for (const archetype of operation.archetypes) {
        expect(HERO_ARCHETYPE_IDS).toContain(archetype);
      }
    }
  });

  it("gives checked operations a pool, DC and tags", () => {
    expect(GUILD_OPERATIONS.assassinate_ruler.check).toMatchObject({ pool: "c", dc: 15 });
    expect(GUILD_OPERATIONS.war_broker.check).toMatchObject({ pool: "best_sc", dc: 15 });
    expect(GUILD_OPERATIONS.pacify_mediate.check).toBeUndefined();
    expect(GUILD_OPERATION_LABELS.assassinate_ruler).toBe("Assassinate Ruler");
  });
});
