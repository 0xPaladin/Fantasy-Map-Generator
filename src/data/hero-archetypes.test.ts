import { describe, expect, it } from "vitest";
import {
  archetypeWeight,
  defaultPathForDoctrine,
  figureArchetype,
  HERO_ARCHETYPE_IDS,
  HERO_ARCHETYPES,
  inferHeroArchetype,
  pendingPathLevel,
  rollHeroArchetype
} from "@/data/hero-archetypes";
import { HERO_DISCIPLINES } from "@/data/hero-disciplines";
import { createRng } from "@/utils/rng";

describe("hero archetype catalog", () => {
  it("defines ten archetypes with three points of base skills", () => {
    expect(HERO_ARCHETYPE_IDS).toHaveLength(10);
    for (const id of HERO_ARCHETYPE_IDS) {
      const def = HERO_ARCHETYPES[id];
      const skills = def.baseSkills;
      expect(skills.m + skills.w + skills.s + skills.c).toBe(3);
      expect(def.disciplines).toHaveLength(3);
      expect(def.growthOrder.length).toBeGreaterThanOrEqual(17);
      expect(def.paths.map(path => path.level)).toEqual([3, 6]);
      for (const path of def.paths) {
        expect(path.options).toHaveLength(2);
        expect(path.options[0].id).not.toBe(path.options[1].id);
      }
    }
  });

  it("only references known disciplines", () => {
    for (const id of HERO_ARCHETYPE_IDS) {
      for (const discipline of HERO_ARCHETYPES[id].disciplines) {
        expect(HERO_DISCIPLINES[discipline]).toBeDefined();
      }
      for (const path of HERO_ARCHETYPES[id].paths) {
        for (const option of path.options) {
          if (option.discipline) expect(HERO_DISCIPLINES[option.discipline]).toBeDefined();
        }
      }
    }
  });

  it("weights archetypes by culture values, type and alignment", () => {
    const martial = archetypeWeight(HERO_ARCHETYPES.warden, { values: ["valor"], type: "Generic" });
    const priest = archetypeWeight(HERO_ARCHETYPES.priest, { values: ["valor"], type: "Generic" });
    expect(martial).toBeGreaterThan(priest);

    const hunting = archetypeWeight(HERO_ARCHETYPES.ranger, { type: "Hunting" });
    const river = archetypeWeight(HERO_ARCHETYPES.ranger, { type: "River" });
    expect(hunting).toBeGreaterThan(river);

    const evil = { type: "Generic" as const, alignment: "evil" as const };
    expect(archetypeWeight(HERO_ARCHETYPES.warlock, evil)).toBeGreaterThan(
      archetypeWeight(HERO_ARCHETYPES.priest, evil)
    );
  });

  it("keeps a mixed culture pool varied over 200 seeds", () => {
    const culture = {
      values: ["valor", "knowledge", "independence"],
      alignment: "neutral" as const,
      type: "River" as const
    };
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 200; seed++) {
      const id = rollHeroArchetype(createRng(`mixed-${seed}`), culture);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    expect(counts.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...counts.values()) / 200).toBeLessThan(0.35);
  });

  it("is deterministic for the same seed and culture", () => {
    const culture = { values: ["valor"], alignment: "good" as const, type: "Highland" as const };
    const first = Array.from({ length: 10 }, (_, seed) => rollHeroArchetype(createRng(`same-${seed}`), culture));
    const second = Array.from({ length: 10 }, (_, seed) => rollHeroArchetype(createRng(`same-${seed}`), culture));
    expect(first).toEqual(second);
  });

  it("infers legacy identity from role specialty, then highest pool", () => {
    expect(
      inferHeroArchetype({
        roles: [{ type: "specialist", target: { kind: "state", id: 1 }, from: 1000, specialty: "sage" }],
        skills: { m: 4, w: 1, s: 0, c: 0 }
      })
    ).toBe("scholar");
    expect(
      inferHeroArchetype({
        roles: [{ type: "adventurer", target: { kind: "culture", id: 1 }, from: 1000 }],
        skills: { m: 0, w: 0, s: 0, c: 4 }
      })
    ).toBe("shadow");
    expect(inferHeroArchetype({ roles: [], skills: { m: 0, w: 0, s: 0, c: 0 } })).toBe("freeblade");
  });

  it("offers the right pending path level and auto-picks by doctrine", () => {
    const figure = { archetype: "warden" as const, roles: [], skills: { m: 2, w: 0, s: 1, c: 0 } };
    expect(pendingPathLevel(figure)).toBe(3);
    expect(pendingPathLevel({ ...figure, progression: { picks: ["warden_shieldwall"] } })).toBe(6);
    expect(defaultPathForDoctrine("warden", "hunt_lairs", 3).kind).toBe("martial");
    expect(defaultPathForDoctrine("scholar", "excavate", 3).kind).toBe("lore");
    expect(defaultPathForDoctrine("priest", "support", 3).kind).toBe("support");
  });

  it("falls back to Freeblade for an unknown archetype", () => {
    expect(figureArchetype({ roles: [], skills: { m: 0, w: 0, s: 0, c: 0 } }).id).toBe("freeblade");
  });
});
