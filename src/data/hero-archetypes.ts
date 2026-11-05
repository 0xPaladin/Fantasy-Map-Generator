// The ten hero identities, their culture weighting and their small level 3 / 6 choices.
// See docs/plans/hero-diversity.md.
import type { Alignment } from "@/data/culture-traits";
import type { Culture } from "@/model/society/cultures-generator";
import type { FigureSkills, HistoricalFigure } from "@/types/history";
import type { DisciplineId, HeroArchetypeId, HeroDoctrine, HeroPool, HeroTemperament } from "@/types/living";
import type { Rng } from "@/utils/rng";

export type HeroPathKind = "martial" | "lore" | "support" | "social" | "stealth";

export interface HeroPathDef {
  id: string;
  name: string;
  kind: HeroPathKind;
  /** @deprecated map through `legacyActionForPool`; removed with the guild shim */
  pool?: HeroPool;
  /** @deprecated folded into `hero.abilities` */
  discipline?: DisciplineId;
  maxResolve?: number;
  maxStamina?: number;
  temperament?: Partial<HeroTemperament>;
  note: string;
}

export interface HeroPathChoice {
  level: 3 | 6;
  options: readonly [HeroPathDef, HeroPathDef];
}

export interface HeroArchetypeDef {
  id: HeroArchetypeId;
  name: string;
  icon: string;
  /** @deprecated use the hero sheet actions */
  primaryPool: HeroPool;
  /** @deprecated use the hero sheet actions */
  secondaryPool: HeroPool;
  /** @deprecated use `hero.abilities` */
  disciplines: readonly [DisciplineId, DisciplineId, DisciplineId];
  /** @deprecated use `HERO_STARTING_PACKAGES` */
  baseSkills: FigureSkills;
  /** @deprecated use action-die growth */
  growthOrder: readonly HeroPool[];
  paths: readonly HeroPathChoice[];
  virtueBias: readonly string[];
  temperament: string;
  defaultDoctrine: HeroDoctrine;
  cultureValues: Readonly<Record<string, number>>;
  cultureTypeBias: Readonly<Record<string, number>>;
  alignmentBias: Readonly<Partial<Record<Alignment, number>>>;
}

const GROWTH = {
  warden: ["m", "s", "m", "m", "s", "m", "s", "m", "m", "s", "m", "s", "m", "m", "s", "m", "s", "m", "m", "s"],
  ranger: ["m", "c", "m", "m", "c", "m", "c", "m", "m", "c", "m", "c", "m", "m", "c", "m", "c", "m", "m", "c"],
  scholar: ["w", "c", "w", "w", "c", "w", "c", "w", "w", "c", "w", "c", "w", "w", "c", "w", "c", "w", "w", "c"],
  priest: ["s", "m", "s", "s", "w", "s", "m", "s", "s", "w", "s", "m", "s", "s", "w", "s", "m", "s", "s", "w"],
  shadow: ["c", "m", "c", "c", "m", "c", "m", "c", "c", "m", "c", "m", "c", "c", "m", "c", "m", "c", "c", "m"],
  factor: ["w", "s", "w", "w", "c", "w", "s", "w", "w", "c", "w", "s", "w", "w", "c", "w", "s", "w", "w", "c"],
  envoy: ["s", "c", "s", "s", "w", "s", "c", "s", "s", "w", "s", "c", "s", "s", "w", "s", "c", "s", "s", "w"],
  alchemist: ["w", "s", "w", "w", "s", "w", "s", "w", "w", "s", "w", "s", "w", "w", "s", "w", "s", "w", "w", "s"],
  warlock: ["c", "s", "c", "c", "w", "c", "s", "c", "c", "w", "c", "s", "c", "c", "w", "c", "s", "c", "c", "w"],
  freeblade: ["m", "c", "m", "w", "c", "m", "c", "m", "w", "c", "m", "c", "m", "w", "c", "m", "c", "m", "w", "c"]
} as const satisfies Record<HeroArchetypeId, readonly HeroPool[]>;

export const HERO_ARCHETYPES: Record<HeroArchetypeId, HeroArchetypeDef> = {
  warden: {
    id: "warden",
    name: "Warden",
    icon: "🛡️",
    primaryPool: "m",
    secondaryPool: "s",
    disciplines: ["melee", "tactics", "ride"],
    baseSkills: { m: 2, w: 0, s: 1, c: 0 },
    growthOrder: GROWTH.warden,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "warden_shieldwall",
            name: "Shieldwall",
            kind: "martial",
            pool: "m",
            maxResolve: 1,
            note: "+1 M, +1 max Resolve"
          },
          {
            id: "warden_standard",
            name: "Standard-Bearer",
            kind: "support",
            pool: "s",
            discipline: "tactics",
            temperament: { teamplay: 0.1 },
            note: "+1 S, +1 teamplay"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "warden_vanguard",
            name: "Vanguard",
            kind: "martial",
            pool: "m",
            discipline: "ride",
            note: "+1 M, ride"
          },
          {
            id: "warden_captain",
            name: "Captain",
            kind: "support",
            pool: "s",
            discipline: "court_etiquette",
            note: "+1 S, court etiquette"
          }
        ]
      }
    ],
    virtueBias: ["brave", "disciplined", "loyal"],
    temperament: "steady",
    defaultDoctrine: "hunt_lairs",
    cultureValues: { valor: 3, honor: 2, discipline: 2, conflict: 1, order: 1 },
    cultureTypeBias: { Highland: 2 },
    alignmentBias: { good: 1, lawful: 1.5, neutral: 0.5, chaotic: 0, evil: 0.5 }
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    icon: "🏹",
    primaryPool: "m",
    secondaryPool: "c",
    disciplines: ["scout", "survival", "archery"],
    baseSkills: { m: 2, w: 0, s: 0, c: 1 },
    growthOrder: GROWTH.ranger,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "ranger_beaststalker",
            name: "Beaststalker",
            kind: "lore",
            pool: "m",
            discipline: "nature_lore",
            note: "+1 M, nature lore"
          },
          {
            id: "ranger_pathfinder",
            name: "Pathfinder",
            kind: "lore",
            pool: "c",
            discipline: "scout",
            maxStamina: 1,
            note: "+1 C, scout"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "ranger_warden_of_the_wild",
            name: "Warden of the Wild",
            kind: "martial",
            pool: "m",
            discipline: "survival",
            note: "+1 M, survival"
          },
          {
            id: "ranger_horizon_walker",
            name: "Horizon Walker",
            kind: "lore",
            pool: "c",
            maxStamina: 1,
            note: "+1 C, travel"
          }
        ]
      }
    ],
    virtueBias: ["resourceful", "adaptable", "curious"],
    temperament: "wary",
    defaultDoctrine: "hunt_lairs",
    cultureValues: { independence: 3, satisfaction: 2, fate: 1, valor: 1 },
    cultureTypeBias: { Hunting: 2, Highland: 1, Nomadic: 1, Naval: 1 },
    alignmentBias: { good: 0.5, lawful: 0.5, neutral: 1, chaotic: 1.5, evil: 0.5 }
  },
  scholar: {
    id: "scholar",
    name: "Scholar",
    icon: "📚",
    primaryPool: "w",
    secondaryPool: "c",
    disciplines: ["investigate", "planar_lore", "tongues"],
    baseSkills: { m: 0, w: 2, s: 0, c: 1 },
    growthOrder: GROWTH.scholar,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "scholar_archaeologist",
            name: "Archaeologist",
            kind: "lore",
            pool: "c",
            discipline: "artifice",
            maxStamina: 1,
            note: "+1 C, artifice"
          },
          {
            id: "scholar_loremaster",
            name: "Loremaster",
            kind: "lore",
            pool: "w",
            discipline: "arcana",
            maxResolve: 1,
            note: "+1 W, arcana"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "scholar_antiquarian",
            name: "Antiquarian",
            kind: "lore",
            pool: "c",
            discipline: "perception",
            note: "+1 C, perception"
          },
          {
            id: "scholar_archivist",
            name: "Archivist",
            kind: "lore",
            pool: "w",
            discipline: "tongues",
            note: "+1 W, tongues"
          }
        ]
      }
    ],
    virtueBias: ["observant", "methodical", "curious"],
    temperament: "detached",
    defaultDoctrine: "excavate",
    cultureValues: { knowledge: 3, truth: 2, advancement: 2, balance: 1 },
    cultureTypeBias: { River: 1 },
    alignmentBias: { good: 0.5, lawful: 1, neutral: 1.5, chaotic: 0.5, evil: 0.5 }
  },
  priest: {
    id: "priest",
    name: "Priest",
    icon: "✨",
    primaryPool: "s",
    secondaryPool: "m",
    disciplines: ["arcana_holy", "healing", "persuasion"],
    baseSkills: { m: 0, w: 1, s: 2, c: 0 },
    growthOrder: GROWTH.priest,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "priest_templar",
            name: "Templar",
            kind: "martial",
            pool: "m",
            discipline: "melee",
            maxResolve: 1,
            note: "+1 M, melee"
          },
          {
            id: "priest_oracle",
            name: "Oracle",
            kind: "support",
            pool: "s",
            discipline: "arcana_divination",
            maxStamina: 1,
            note: "+1 S, divination"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "priest_exorcist",
            name: "Exorcist",
            kind: "support",
            pool: "s",
            discipline: "arcana_abjuration",
            note: "+1 S, abjuration"
          },
          {
            id: "priest_hierophant",
            name: "Hierophant",
            kind: "support",
            pool: "w",
            discipline: "arcana_holy",
            note: "+1 W, holy magic"
          }
        ]
      }
    ],
    virtueBias: ["faithful", "compassionate", "reverent"],
    temperament: "serene",
    defaultDoctrine: "support",
    cultureValues: { empathy: 2, love: 2, honor: 2, loyalty: 1, justice: 1, hatred: 1 },
    cultureTypeBias: {},
    alignmentBias: { good: 2, lawful: 1, neutral: 0.5, chaotic: 0, evil: 0.5 }
  },
  shadow: {
    id: "shadow",
    name: "Shadow",
    icon: "🗡️",
    primaryPool: "c",
    secondaryPool: "m",
    disciplines: ["stealth", "artifice", "perception"],
    baseSkills: { m: 1, w: 0, s: 0, c: 2 },
    growthOrder: GROWTH.shadow,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "shadow_assassin",
            name: "Assassin",
            kind: "martial",
            pool: "m",
            discipline: "melee",
            maxStamina: 1,
            note: "+1 M, melee"
          },
          {
            id: "shadow_spy",
            name: "Spy",
            kind: "stealth",
            pool: "s",
            discipline: "court_etiquette",
            temperament: { teamplay: 0.1 },
            note: "+1 S, court etiquette"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "shadow_nightblade",
            name: "Nightblade",
            kind: "martial",
            pool: "m",
            discipline: "stealth",
            note: "+1 M, stealth"
          },
          {
            id: "shadow_whisper",
            name: "Whisper",
            kind: "stealth",
            pool: "c",
            discipline: "investigate",
            note: "+1 C, investigate"
          }
        ]
      }
    ],
    virtueBias: ["adaptable", "observant", "daring"],
    temperament: "guarded",
    defaultDoctrine: "hunt_troubles",
    cultureValues: { control: 2, greed: 2, impulse: 2, disruption: 2, independence: 1 },
    cultureTypeBias: { Naval: 1 },
    alignmentBias: { good: 0, lawful: 0.5, neutral: 1, chaotic: 2, evil: 2 }
  },
  factor: {
    id: "factor",
    name: "Factor",
    icon: "⚖️",
    primaryPool: "w",
    secondaryPool: "c",
    disciplines: ["barter", "court_etiquette", "investigate"],
    baseSkills: { m: 0, w: 2, s: 0, c: 1 },
    growthOrder: GROWTH.factor,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "factor_quartermaster",
            name: "Quartermaster",
            kind: "support",
            pool: "m",
            discipline: "siegecraft",
            maxResolve: 1,
            note: "+1 M, siegecraft"
          },
          {
            id: "factor_magnate",
            name: "Magnate",
            kind: "social",
            pool: "w",
            temperament: { greed: 0.1 },
            note: "+1 W, +1 greed"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "factor_broker",
            name: "Broker",
            kind: "social",
            pool: "s",
            discipline: "barter",
            note: "+1 S, barter"
          },
          {
            id: "factor_coinlord",
            name: "Coinlord",
            kind: "support",
            pool: "w",
            discipline: "investigate",
            note: "+1 W, investigate"
          }
        ]
      }
    ],
    virtueBias: ["thrifty", "methodical", "dependable"],
    temperament: "calculating",
    defaultDoctrine: "patrol",
    cultureValues: { investment: 3, greed: 2, advancement: 1, satisfaction: 1 },
    cultureTypeBias: { River: 2, Lake: 1, Naval: 1 },
    alignmentBias: { good: 0.5, lawful: 1, neutral: 1.5, chaotic: 1, evil: 0.5 }
  },
  envoy: {
    id: "envoy",
    name: "Envoy",
    icon: "🕊️",
    primaryPool: "s",
    secondaryPool: "c",
    disciplines: ["persuasion", "court_etiquette", "tongues"],
    baseSkills: { m: 0, w: 0, s: 2, c: 1 },
    growthOrder: GROWTH.envoy,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "envoy_diplomat",
            name: "Diplomat",
            kind: "social",
            pool: "s",
            temperament: { teamplay: 0.1 },
            note: "+1 S, +1 teamplay"
          },
          {
            id: "envoy_spymaster",
            name: "Spymaster",
            kind: "stealth",
            pool: "c",
            discipline: "stealth",
            note: "+1 C, stealth"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "envoy_ambassador",
            name: "Ambassador",
            kind: "social",
            pool: "s",
            discipline: "tongues",
            note: "+1 S, tongues"
          },
          {
            id: "envoy_kingmaker",
            name: "Kingmaker",
            kind: "social",
            pool: "c",
            discipline: "investigate",
            note: "+1 C, investigate"
          }
        ]
      }
    ],
    virtueBias: ["eloquent", "tactful", "dependable"],
    temperament: "warm",
    defaultDoctrine: "support",
    cultureValues: { cooperation: 2, trust: 2, justice: 1, order: 1, honor: 1 },
    cultureTypeBias: { River: 1, Lake: 1, Nomadic: 1 },
    alignmentBias: { good: 1.5, lawful: 1.5, neutral: 1, chaotic: 0.5, evil: 0.5 }
  },
  alchemist: {
    id: "alchemist",
    name: "Alchemist",
    icon: "⚗️",
    primaryPool: "w",
    secondaryPool: "s",
    disciplines: ["alchemy", "healing", "nature_lore"],
    baseSkills: { m: 0, w: 2, s: 1, c: 0 },
    growthOrder: GROWTH.alchemist,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "alchemist_physician",
            name: "Physician",
            kind: "support",
            pool: "s",
            discipline: "healing",
            maxResolve: 1,
            note: "+1 S, healing"
          },
          {
            id: "alchemist_bombardier",
            name: "Bombardier",
            kind: "martial",
            pool: "m",
            discipline: "artifice",
            maxStamina: 1,
            note: "+1 M, artifice"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "alchemist_apothecary",
            name: "Apothecary",
            kind: "support",
            pool: "w",
            discipline: "alchemy",
            note: "+1 W, alchemy"
          },
          {
            id: "alchemist_transmuter",
            name: "Transmuter",
            kind: "lore",
            pool: "c",
            discipline: "arcana_transmutation",
            note: "+1 C, transmutation"
          }
        ]
      }
    ],
    virtueBias: ["curious", "meticulous", "prudent"],
    temperament: "intent",
    defaultDoctrine: "support",
    cultureValues: { knowledge: 2, advancement: 2, balance: 1, empathy: 1 },
    cultureTypeBias: { Highland: 1 },
    alignmentBias: { good: 0.5, lawful: 0.5, neutral: 1.5, chaotic: 0.5, evil: 0.5 }
  },
  warlock: {
    id: "warlock",
    name: "Warlock",
    icon: "🔮",
    primaryPool: "c",
    secondaryPool: "s",
    disciplines: ["arcana_shadow", "arcana_evocation", "tongues"],
    baseSkills: { m: 0, w: 0, s: 1, c: 2 },
    growthOrder: GROWTH.warlock,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "warlock_binder",
            name: "Binder",
            kind: "lore",
            pool: "c",
            discipline: "arcana_necromancy",
            maxStamina: 1,
            note: "+1 C, necromancy"
          },
          {
            id: "warlock_seer",
            name: "Seer",
            kind: "support",
            pool: "s",
            discipline: "arcana_divination",
            maxResolve: 1,
            note: "+1 S, divination"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "warlock_summoner",
            name: "Summoner",
            kind: "lore",
            pool: "c",
            discipline: "arcana_evocation",
            note: "+1 C, evocation"
          },
          {
            id: "warlock_hex",
            name: "Hex",
            kind: "stealth",
            pool: "s",
            discipline: "arcana_illusion",
            note: "+1 S, illusion"
          }
        ]
      }
    ],
    virtueBias: ["curious", "daring", "observant"],
    temperament: "hungry",
    defaultDoctrine: "excavate",
    cultureValues: { power: 2, hatred: 2, control: 2, conflict: 1, fate: 1 },
    cultureTypeBias: {},
    alignmentBias: { good: 0, lawful: 0.5, neutral: 0.5, chaotic: 1.5, evil: 2.5 }
  },
  freeblade: {
    id: "freeblade",
    name: "Freeblade",
    icon: "⚔️",
    primaryPool: "m",
    secondaryPool: "c",
    disciplines: ["melee", "survival", "barter"],
    baseSkills: { m: 1, w: 1, s: 0, c: 1 },
    growthOrder: GROWTH.freeblade,
    paths: [
      {
        level: 3,
        options: [
          {
            id: "freeblade_duelist",
            name: "Duelist",
            kind: "martial",
            pool: "m",
            discipline: "melee",
            maxResolve: 1,
            note: "+1 M, melee"
          },
          {
            id: "freeblade_quartermaster",
            name: "Quartermaster",
            kind: "support",
            pool: "w",
            discipline: "barter",
            maxStamina: 1,
            note: "+1 W, barter"
          }
        ]
      },
      {
        level: 6,
        options: [
          {
            id: "freeblade_champion",
            name: "Champion",
            kind: "martial",
            pool: "m",
            discipline: "brawling",
            note: "+1 M, brawling"
          },
          {
            id: "freeblade_captain",
            name: "Captain",
            kind: "support",
            pool: "s",
            discipline: "tactics",
            note: "+1 S, tactics"
          }
        ]
      }
    ],
    virtueBias: ["daring", "resourceful", "independent"],
    temperament: "restless",
    defaultDoctrine: "hunt_troubles",
    cultureValues: { independence: 2, valor: 1, satisfaction: 1, fate: 1 },
    cultureTypeBias: { Hunting: 1, Nomadic: 1 },
    alignmentBias: { good: 0.5, lawful: 0.5, neutral: 1, chaotic: 1.5, evil: 1 }
  }
};

export const HERO_ARCHETYPE_IDS = Object.keys(HERO_ARCHETYPES) as HeroArchetypeId[];

type CultureLike = Pick<Culture, "values" | "alignment" | "type">;

export function archetypeWeight(def: HeroArchetypeDef, culture?: CultureLike): number {
  let weight = 1;
  for (const value of culture?.values ?? []) weight += def.cultureValues[value] ?? 0;
  weight += def.cultureTypeBias[culture?.type ?? ""] ?? 0;
  if (!culture?.values?.length && culture?.alignment) weight += def.alignmentBias[culture.alignment] ?? 0;
  return Math.max(0.2, weight);
}

function pickWeighted(rng: Rng, culture: CultureLike | undefined, excluded: Set<HeroArchetypeId>): HeroArchetypeId {
  const options = HERO_ARCHETYPE_IDS.filter(id => !excluded.has(id)).map(id => ({
    id,
    weight: archetypeWeight(HERO_ARCHETYPES[id], culture)
  }));
  const pool = options.length > 0 ? options : HERO_ARCHETYPE_IDS.map(id => ({ id, weight: 1 }));
  const total = pool.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng.next() * total;
  for (const option of pool) {
    roll -= option.weight;
    if (roll < 0) return option.id;
  }
  return pool[pool.length - 1]!.id;
}

/** Culture-weighted pick, with an optional soft guard against repeating recent archetypes. */
export function rollHeroArchetype(
  rng: Rng,
  culture?: CultureLike,
  avoid: readonly HeroArchetypeId[] = []
): HeroArchetypeId {
  const first = pickWeighted(rng, culture, new Set());
  if (!avoid.includes(first) || avoid.length >= HERO_ARCHETYPE_IDS.length) return first;

  const second = pickWeighted(rng, culture, new Set(avoid));
  return rng.chance(0.65) ? second : first;
}

export function heroArchetype(id: HeroArchetypeId | undefined): HeroArchetypeDef {
  return HERO_ARCHETYPES[id ?? "freeblade"] ?? HERO_ARCHETYPES.freeblade;
}

/** Identity for old figures: role specialty first, then highest pool, then Freeblade. */
export function inferHeroArchetype(figure: Pick<HistoricalFigure, "roles" | "skills">): HeroArchetypeId {
  const specialties: Record<string, HeroArchetypeId> = {
    guardsmen: "warden",
    military: "warden",
    merchant: "factor",
    sage: "scholar",
    prophet: "priest",
    magistrate: "envoy",
    assassin: "shadow",
    diplomat: "envoy",
    bodyguard: "warden"
  };

  for (const role of figure.roles ?? []) {
    const inferred = role.specialty ? specialties[role.specialty] : undefined;
    if (inferred) return inferred;
  }

  const skills = figure.skills;
  if (skills) {
    const pools = [
      ["m", skills.m],
      ["w", skills.w],
      ["s", skills.s],
      ["c", skills.c]
    ] as const;
    const best = pools.reduce((chosen, entry) => (entry[1] > chosen[1] ? entry : chosen), pools[0]!);
    if (best[1] > 0) {
      if (best[0] === "m") return "ranger";
      if (best[0] === "w") return "scholar";
      if (best[0] === "s") return "priest";
      return "shadow";
    }
  }

  return "freeblade";
}

export function figureArchetype(figure: Pick<HistoricalFigure, "archetype" | "roles" | "skills">): HeroArchetypeDef {
  return heroArchetype(figure.archetype ?? inferHeroArchetype(figure));
}

export function figureDisciplines(
  figure: Pick<HistoricalFigure, "archetype" | "roles" | "skills" | "disciplines">
): readonly DisciplineId[] {
  if (figure.disciplines?.length) return figure.disciplines;
  return figureArchetype(figure).disciplines;
}

export function findHeroPath(
  archetype: HeroArchetypeId,
  pathId: string | undefined
): { choice: HeroPathChoice; path: HeroPathDef } | undefined {
  if (!pathId) return undefined;
  for (const choice of HERO_ARCHETYPES[archetype].paths) {
    const path = choice.options.find(option => option.id === pathId);
    if (path) return { choice, path };
  }
  return undefined;
}

/** Auto-pick order when the player ignores a pending path choice. */
export function defaultPathForDoctrine(archetype: HeroArchetypeId, doctrine: HeroDoctrine, level: 3 | 6): HeroPathDef {
  const choice =
    HERO_ARCHETYPES[archetype].paths.find(entry => entry.level === level) ?? HERO_ARCHETYPES[archetype].paths[0]!;
  const preferred: HeroPathKind[] =
    doctrine === "excavate"
      ? ["lore", "support"]
      : doctrine === "support"
        ? ["support", "social"]
        : doctrine === "patrol"
          ? ["social", "support"]
          : ["martial", "stealth"];
  return choice.options.find(option => preferred.includes(option.kind)) ?? choice.options[0];
}

/** The next path level the hero still has to choose. */
export function pendingPathLevel(
  figure: Pick<HistoricalFigure, "archetype" | "roles" | "skills" | "progression">
): 3 | 6 {
  const def = figureArchetype(figure);
  const picks = new Set(figure.progression?.picks ?? []);
  const level3 = def.paths.find(choice => choice.level === 3);
  return level3?.options.some(option => picks.has(option.id)) ? 6 : 3;
}
