import { hcl } from "d3";
import { rollAlignment, rollValues, traitsRng } from "@/data/culture-traits";
import { getLairArchetypeForMarker, isDangerMarker } from "@/data/danger-markers";
import { FACTIONS_CATALOG, getFactionArchetype } from "@/data/factions-catalog";
import { assignStateRoster } from "@/data/roster-content";
import {
  Military,
  type Regiment,
  reconcileRegimentBlocks,
  syncRegimentTotals
} from "@/model/political/military-generator";
import type {
  Faction,
  FactionAllegiance,
  FactionCategory,
  FactionHq,
  FactionOutpost,
  FactionRelation
} from "@/types/factions";
import type { BurgSimState, YieldValues } from "@/types/living";
import { createRng, type Rng } from "@/utils/rng";

function createEmptyYields(): YieldValues {
  return { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0, happiness: 0 };
}

/** Initialize or reconcile the OpenCiv BurgSimState for a Faction HQ or Outpost */
export function ensureFactionNodeSim(node: FactionHq | FactionOutpost, isHq: boolean): BurgSimState {
  const burgId = node.burgId ?? 0;
  const tier = "tier" in node ? node.tier : 2;
  const civBuildings = Array.from(new Set([...(node.assets ?? []), ...(node.sim?.civBuildings ?? [])]));
  node.assets = [...civBuildings];
  const baseHp = isHq ? 200 : 100;
  if (isHq && node.influence === undefined) node.influence = 70;

  if (!node.sim) {
    node.sim = {
      burgId,
      baseTier: tier,
      development: 0,
      developmentProgress: 0,
      buildings: [],
      civBuildings,
      construction: null,
      unrest: 0,
      isMajor: true,
      citizens: isHq ? 2 : Math.max(1, tier),
      foodStored: 0,
      cultureStored: 0,
      tilesAcquired: 0,
      workedCells: node.cell >= 0 ? [node.cell] : [],
      lockedCells: [],
      productionQueue: [],
      productionProgress: {},
      cityYields: createEmptyYields(),
      hp: baseHp,
      maxHp: baseHp
    };
  } else {
    node.sim.burgId = burgId;
    node.sim.baseTier = tier;
    node.sim.buildings ??= [];
    node.sim.civBuildings = civBuildings;
    node.sim.construction ??= null;
    node.sim.unrest ??= 0;
    node.sim.isMajor = true;
    node.sim.citizens = Math.max(1, node.sim.citizens ?? (isHq ? 2 : Math.max(1, tier)));
    node.sim.foodStored ??= 0;
    node.sim.cultureStored ??= 0;
    node.sim.tilesAcquired ??= 0;
    node.sim.workedCells = node.sim.workedCells?.length ? node.sim.workedCells : node.cell >= 0 ? [node.cell] : [];
    node.sim.lockedCells ??= [];
    node.sim.productionQueue ??= [];
    node.sim.productionProgress ??= {};
    node.sim.cityYields ??= createEmptyYields();
    node.sim.maxHp ??= baseHp;
    node.sim.hp ??= node.sim.maxHp;
  }
  return node.sim;
}

/** Reconcile a Faction's HQ/Outpost BurgSimState nodes, OpenCiv empire fields, and ArmyBlock[] regiments */
export function syncFactionState(faction: Faction): void {
  if (!faction.rosterId) {
    faction.rosterId =
      faction.stateRosterId || assignStateRoster({ culture: faction.culture || 0, type: "Generic" }, pack?.cultures);
  }
  faction.freeTechs ??= 0;
  faction.happiness ??= 0;
  faction.yieldsPerTurn ??= createEmptyYields();

  if (faction.hq) {
    ensureFactionNodeSim(faction.hq, true);
  }
  for (const outpost of faction.outposts ?? []) {
    ensureFactionNodeSim(outpost, false);
  }

  const unitTypes = Military.getUnitTypes();
  for (const regiment of faction.military ?? []) {
    regiment.rosterId ??= faction.rosterId;
    if (!regiment.units?.length && regiment.u && Object.keys(regiment.u).length > 0) {
      reconcileRegimentBlocks(regiment, unitTypes);
    } else if (regiment.units?.length) {
      syncRegimentTotals(regiment, unitTypes);
    }
  }
}

const ADJECTIVES = [
  "Crimson",
  "Golden",
  "Iron",
  "Silver",
  "Shadow",
  "Emerald",
  "Azure",
  "Ashen",
  "Silent",
  "Obsidian",
  "Radiant",
  "Gilded",
  "Bronze",
  "Scarlet"
];

const HEROIC_NOUNS = [
  "Dawn",
  "Compass",
  "Shield",
  "Star",
  "Flame",
  "Crown",
  "Banner",
  "Gryphon",
  "Dragon",
  "Phoenix",
  "Sun"
];

const BEAST_NOUNS = ["Viper", "Wolf", "Raven", "Dagger", "Serpent", "Claw", "Jackal", "Spider", "Falcon", "Scorpion"];

const REGIONAL_EPONYMS = [
  "Valen",
  "Aethel",
  "Corvus",
  "Doran",
  "Eldor",
  "Falken",
  "Garrick",
  "Harlan",
  "Ilyon",
  "Jorun",
  "Kael",
  "Lorien",
  "Morven",
  "Niall",
  "Orin",
  "Pyre",
  "Quinn",
  "Roderic",
  "Sylas",
  "Tiber",
  "Ulric",
  "Vance",
  "Wyatt",
  "Xander",
  "Yorick",
  "Zephyr"
];

const CATEGORY_BASE_HUES: Record<FactionCategory, number> = {
  commercial: 45,
  adventuring: 135,
  underworld: 280,
  religious: 200,
  political: 15,
  martial: 350
};

export function getFactionColor(id: number, category: FactionCategory): string {
  const baseHue = CATEGORY_BASE_HUES[category] ?? 0;
  const hue = (baseHue + ((id * 47) % 60) - 30 + 360) % 360;
  const chroma = 45 + ((id * 13) % 25);
  const luminance = 50 + ((id * 17) % 25);
  return hcl(hue, chroma, luminance).formatHex();
}

function pickOne<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

function generateFactionName(
  category: FactionCategory,
  _type: string,
  cultureId: number,
  burgName: string | undefined,
  markerName: string | undefined,
  rng: Rng
): string {
  const cultureName = cultureId && pack?.cultures?.[cultureId]?.name;
  const baseName = burgName || cultureName || pickOne(REGIONAL_EPONYMS, rng);
  const place = burgName || markerName || baseName;
  const adj = pickOne(ADJECTIVES, rng);
  const heroNoun = pickOne(HEROIC_NOUNS, rng);
  const beastNoun = pickOne(BEAST_NOUNS, rng);

  switch (category) {
    case "commercial":
      return pickOne(
        [
          `${place} Trading Consortium`,
          `The ${adj} Compass League`,
          `Merchant Guild of ${place}`,
          `${place} Banking House`,
          `${baseName} Mercantile Syndicate`,
          `The ${adj} Coin Company`
        ],
        rng
      );

    case "adventuring":
      return pickOne(
        [
          `Order of the ${adj} ${heroNoun}`,
          `${place} Adventurers' Fellowship`,
          `Wardens of ${place}`,
          `Seekers of the ${heroNoun}`,
          `${baseName} Explorers' League`,
          `The ${adj} Circle`
        ],
        rng
      );

    case "underworld":
      return pickOne(
        [
          `The ${adj} ${beastNoun} Syndicate`,
          `Shadows of ${place}`,
          `${place} Beggar Brotherhood`,
          `${baseName} Smuggler League`,
          `The ${adj} Hand`,
          `Brotherhood of the ${beastNoun}`
        ],
        rng
      );

    case "religious":
      return pickOne(
        [
          `Order of the ${adj} ${heroNoun}`,
          `Holy Covenant of ${place}`,
          `Knights of the ${heroNoun}`,
          `${place} Inquisitorial Cadre`,
          `Keepers of the ${adj} Flame`,
          `Sect of the ${heroNoun}`
        ],
        rng
      );

    case "political":
      return pickOne(
        [
          `House of ${baseName}`,
          `${place} Liberation League`,
          `Council of ${place}`,
          `The ${baseName} Restoration Front`,
          `Loyalists of ${place}`
        ],
        rng
      );

    default:
      if (markerName) {
        return pickOne(
          [
            `${markerName} Warband`,
            `The ${adj} Free Company`,
            `Host of ${markerName}`,
            `Reavers of ${markerName}`,
            `${markerName} Horde`
          ],
          rng
        );
      }
      return pickOne(
        [`The ${adj} Company`, `Iron Vanguard of ${place}`, `${baseName} Mercenary Cohort`, `The ${adj} Blades`],
        rng
      );
  }
}

class FactionsModule {
  /** Generates a procedural ecosystem of factions for the map */
  generate(): void {
    pack.factions = [{ i: 0 } as Faction];

    const seed = (typeof options !== "undefined" && options?.map?.seed) || "factions";
    const masterRng = createRng(`${seed}:factions:master`);
    const currentYear = Number(
      (typeof options !== "undefined" ? options?.map?.lore?.calendar?.year : undefined) ?? 1000
    );

    const burgs = pack.burgs?.filter(b => b?.i && !b.removed) ?? [];
    const states = pack.states?.filter(s => s?.i && !s.removed) ?? [];
    const markers = pack.markers?.filter(m => m?.i && !m.hidden) ?? [];
    const religions = pack.religions?.filter(r => r?.i && !r.removed) ?? [];

    let nextFactionId = 1;

    const createFaction = (
      type: string,
      category: FactionCategory,
      hq: FactionHq,
      allegiance: FactionAllegiance,
      optionsOverride: {
        patronStateId?: number;
        burgName?: string;
        markerName?: string;
        cultureId?: number;
        religionId?: number;
        outposts?: FactionOutpost[];
      } = {}
    ): Faction => {
      const id = nextFactionId++;
      const arch = getFactionArchetype(type) || FACTIONS_CATALOG[type];
      const rng = traitsRng(seed, "faction", id);

      const cell = hq.cell;
      const cultureId =
        optionsOverride.cultureId ?? ((cell && pack.cells?.culture ? pack.cells.culture[cell] : 0) || 1);
      const religionId = optionsOverride.religionId ?? (cell && pack.cells?.religion ? pack.cells.religion[cell] : 0);

      const alignment = arch?.defaultAlignment || rollAlignment(rng);
      const values = arch?.defaultValues ? [...arch.defaultValues] : rollValues(rng, alignment);
      const name = generateFactionName(
        category,
        type,
        cultureId,
        optionsOverride.burgName,
        optionsOverride.markerName,
        rng
      );

      const foundingAge = Math.floor(rng.next() * 150 + 20);
      const foundedYear = Math.max(1, currentYear - foundingAge);
      const color = getFactionColor(id, category);

      const initialTechs = ["pottery", "mining"];
      if (category === "adventuring") initialTechs.push("writing");
      if (category === "commercial") initialTechs.push("currency");
      if (category === "martial") initialTechs.push("archery");
      if (category === "religious") initialTechs.push("philosophy");

      const researchQueue = arch?.desiredTechs ? arch.desiredTechs.filter(t => !initialTechs.includes(t)) : [];

      const stateRelations: Record<number, FactionRelation> = {};
      if (allegiance === "state_arm" && optionsOverride.patronStateId) {
        stateRelations[optionsOverride.patronStateId] = "Ally";
      } else if (allegiance === "hostile") {
        for (const s of states) {
          stateRelations[s.i] = "Enemy";
        }
      } else if (allegiance === "chartered" && optionsOverride.patronStateId) {
        stateRelations[optionsOverride.patronStateId] = "Friendly";
      }

      const factionRelations: Record<number, FactionRelation> = {};

      const outposts = optionsOverride.outposts ?? [];

      let military: Regiment[] = [];
      if (category === "martial" || allegiance === "hostile") {
        const [x, y] = pack.cells?.p?.[hq.cell] ?? [0, 0];
        military = [
          {
            i: 1,
            name: `${name} Garrison`,
            a: 100,
            cell: hq.cell,
            x,
            y,
            bx: x,
            by: y,
            u: { spear: 60, archers: 40 },
            n: hq.maritime ? 1 : 0,
            state: 0,
            icon: arch?.markerIcon || "⚔️"
          }
        ];
      }

      const faction: Faction = {
        i: id,
        name,
        category,
        type,
        allegiance,
        patronStateId: optionsOverride.patronStateId,
        color,
        icon: arch?.markerIcon || "🛡️",
        culture: cultureId,
        religion: religionId,
        foundedYear,
        memberIds: [],
        alignment,
        values,
        expansionism: Number((0.6 + rng.next() * 1.0).toFixed(2)),
        expansionScope: arch?.defaultExpansionScope || "state",
        sovereignAmbition: Boolean(arch?.sovereignAmbition),
        stateForm: arch?.stateForm,
        stateRosterId: arch?.stateRosterId,
        hq,
        outposts,
        science: 2,
        currentTechId: researchQueue[0] ?? null,
        researchQueue,
        researchedTechs: initialTechs,
        researchedProgress: {},
        treasury: Math.floor(rng.next() * 200 + 100),
        influence: Math.floor(rng.next() * 50 + 20),
        military,
        raidThreshold: arch?.raidThreshold,
        stateRelations,
        factionRelations,
        agenda: null,
        seasonsActive: foundingAge * 4
      };

      syncFactionState(faction);
      pack.factions.push(faction);
      return faction;
    };

    // 1. Commercial Guilds (2–4 factions in major trade hubs)
    const sortedBurgs = [...burgs].sort((a, b) => (b.population || 0) - (a.population || 0));
    const commercialHubs = sortedBurgs.slice(0, Math.min(4, sortedBurgs.length));

    for (const hub of commercialHubs) {
      const isPort = Boolean(hub.port);
      const type = isPort ? (masterRng.next() > 0.5 ? "merchant_consortium" : "smuggler_syndicate") : "trade_guild";
      const arch = getFactionArchetype(type);
      const allegiance = arch?.defaultAllegiance || "chartered";

      // Find 1-2 outpost burgs in the same state or nearby
      const outposts: FactionOutpost[] = [];
      const candidateOutposts = burgs.filter(b => b.i !== hub.i && (b.state === hub.state || masterRng.next() > 0.6));
      for (let o = 0; o < Math.min(2, candidateOutposts.length); o++) {
        const outBurg = candidateOutposts[o];
        outposts.push({
          burgId: outBurg.i,
          cell: outBurg.cell,
          tier: 1,
          influence: 40,
          secrecy: allegiance === "clandestine" ? 50 : 0,
          assets: ["trade_depot"],
          establishedYear: currentYear - 15
        });
      }

      createFaction(
        type,
        "commercial",
        {
          cell: hub.cell,
          burgId: hub.i,
          provinceId: pack.cells?.province?.[hub.cell],
          fortified: false,
          secrecy: allegiance === "clandestine" ? 50 : 0,
          assets: ["trade_depot", "counting_house"]
        },
        allegiance,
        {
          patronStateId: hub.state || undefined,
          burgName: hub.name,
          cultureId: hub.culture,
          outposts
        }
      );
    }

    // 2. Adventuring & Scholarly Orders (1–3 factions, guarantee at least 1 adventurer guild)
    const advBurgs = sortedBurgs.slice(1, Math.min(4, sortedBurgs.length));
    const advTypes = ["adventurer_guild", "ranger_wardens", "arcane_college"];

    for (let i = 0; i < Math.max(1, advBurgs.length); i++) {
      const b = advBurgs[i] || sortedBurgs[0];
      if (!b) continue;

      const type = i === 0 ? "adventurer_guild" : advTypes[i % advTypes.length];
      const outposts: FactionOutpost[] = [];
      const neighbor = burgs.find(nb => nb.i !== b.i && nb.state === b.state);
      if (neighbor) {
        outposts.push({
          burgId: neighbor.i,
          cell: neighbor.cell,
          tier: 1,
          influence: 40,
          secrecy: 0,
          assets: ["chapter_lodge"],
          establishedYear: currentYear - 20
        });
      }

      createFaction(
        type,
        "adventuring",
        {
          cell: b.cell,
          burgId: b.i,
          provinceId: pack.cells?.province?.[b.cell],
          fortified: false,
          secrecy: 0,
          assets: ["chapter_lodge", "seeker_archives"]
        },
        "autonomous",
        {
          patronStateId: b.state || undefined,
          burgName: b.name,
          cultureId: b.culture,
          outposts
        }
      );
    }

    // 3. Religious Orders & Cults (seeded from religions)
    for (const rel of religions.slice(0, 3)) {
      const relBurg = burgs.find(b => pack.cells?.religion?.[b.cell] === rel.i) || sortedBurgs[0];
      if (!relBurg) continue;

      const isCult = rel.type === "Cult" || rel.type === "Heresy" || masterRng.next() < 0.25;
      const type = isCult ? "sinister_cult" : "holy_order";
      const allegiance = isCult ? "clandestine" : "chartered";

      createFaction(
        type,
        "religious",
        {
          cell: relBurg.cell,
          burgId: relBurg.i,
          provinceId: pack.cells?.province?.[relBurg.cell],
          fortified: !isCult,
          secrecy: isCult ? 70 : 0,
          assets: isCult ? ["safe_house", "ritual_sanctum"] : ["wayside_shrine", "monastic_scriptorium"]
        },
        allegiance,
        {
          patronStateId: isCult ? undefined : relBurg.state || undefined,
          burgName: relBurg.name,
          religionId: rel.i,
          cultureId: relBurg.culture
        }
      );
    }

    // 4. Underworld Syndicates (in top populated burgs or ports)
    for (const b of sortedBurgs.slice(0, Math.min(2, sortedBurgs.length))) {
      createFaction(
        "thieves_guild",
        "underworld",
        {
          cell: b.cell,
          burgId: b.i,
          provinceId: pack.cells?.province?.[b.cell],
          fortified: false,
          secrecy: 65,
          assets: ["safe_house", "smuggler_tunnel"]
        },
        "clandestine",
        {
          patronStateId: undefined,
          burgName: b.name,
          cultureId: b.culture
        }
      );
    }

    // 5. Political State-Arm Agencies (for prominent states)
    for (const state of states.slice(0, Math.min(3, states.length))) {
      const capBurg = pack.burgs?.[state.capital];
      if (!capBurg) continue;

      createFaction(
        "magistrate_cadre",
        "political",
        {
          cell: capBurg.cell,
          burgId: capBurg.i,
          provinceId: pack.cells?.province?.[capBurg.cell],
          fortified: false,
          secrecy: 0,
          assets: ["informant_ring", "printing_cell"]
        },
        "state_arm",
        {
          patronStateId: state.i,
          burgName: capBurg.name,
          cultureId: capBurg.culture
        }
      );
    }

    // 6. Armed Lair Factions (every danger marker)
    for (const marker of markers) {
      if (!isDangerMarker(marker)) continue;

      const archetypeMapping = getLairArchetypeForMarker(marker.type);
      const type = archetypeMapping.lairId;
      const arch = getFactionArchetype(type);

      createFaction(
        type,
        arch?.category || "martial",
        {
          cell: marker.cell,
          markerId: marker.i,
          provinceId: pack.cells?.province?.[marker.cell],
          maritime: archetypeMapping.isMaritime,
          fortified: Boolean(arch?.sovereignAmbition),
          secrecy: 35,
          assets: ["muster_camp"]
        },
        "hostile",
        {
          markerName: marker.name
        }
      );
    }
  }

  /** Retrieve a faction by its unique index */
  get(id: number): Faction | undefined {
    const f = pack.factions?.[id];
    return f && !f.removed ? f : undefined;
  }

  /** Return all active non-removed factions */
  active(): Faction[] {
    return pack.factions?.filter(f => f && f.i > 0 && !f.removed) ?? [];
  }

  /** Return all active factions with an HQ or active outpost in a burg */
  atBurg(burgId: number): Faction[] {
    return this.active().filter(
      f => f.hq.burgId === burgId || f.outposts.some(o => o.burgId === burgId && !o.pillaged)
    );
  }

  /** Return all active factions present at a cell */
  atCell(cell: number): Faction[] {
    return this.active().filter(f => f.hq.cell === cell || f.outposts.some(o => o.cell === cell));
  }

  /** Return all active factions affiliated with or holding footholds in a sovereign state */
  byState(stateId: number): Faction[] {
    return this.active().filter(
      f =>
        f.patronStateId === stateId ||
        (f.hq.burgId && pack.burgs?.[f.hq.burgId]?.state === stateId) ||
        f.outposts.some(o => pack.burgs?.[o.burgId]?.state === stateId)
    );
  }

  /** Return all active factions of a specific category */
  byCategory(category: FactionCategory): Faction[] {
    return this.active().filter(f => f.category === category);
  }

  /** Adds a new runtime faction, recomputes scale, and appends to pack.factions */
  add(params: Partial<Faction>): Faction {
    pack.factions ??= [{ i: 0 } as Faction];
    const id = pack.factions.length;

    const faction: Faction = {
      i: id,
      name: params.name || `Faction ${id}`,
      category: params.category || "adventuring",
      type: params.type || "adventurer_guild",
      allegiance: params.allegiance || "autonomous",
      patronStateId: params.patronStateId,
      color: params.color || getFactionColor(id, params.category || "adventuring"),
      icon: params.icon || "🛡️",
      culture: params.culture || 1,
      religion: params.religion,
      foundedYear: params.foundedYear || 1000,
      memberIds: params.memberIds || [],
      candidateIds: params.candidateIds,
      alignment: params.alignment || "neutral",
      values: params.values || ["honor"],
      expansionism: params.expansionism ?? 1.0,
      expansionScope: params.expansionScope || "state",
      sovereignAmbition: Boolean(params.sovereignAmbition),
      stateForm: params.stateForm,
      stateRosterId: params.stateRosterId,
      hq: params.hq || { cell: 0, fortified: false, secrecy: 0, assets: [] },
      outposts: params.outposts || [],
      science: params.science || 2,
      currentTechId: params.currentTechId ?? null,
      researchQueue: params.researchQueue || [],
      researchedTechs: params.researchedTechs || ["pottery", "mining"],
      researchedProgress: params.researchedProgress || {},
      treasury: params.treasury ?? 150,
      influence: params.influence ?? 30,
      rosterId: params.rosterId,
      military: params.military || [],
      threatLevel: params.threatLevel,
      raidThreshold: params.raidThreshold,
      raidPending: params.raidPending,
      stateRelations: params.stateRelations || {},
      factionRelations: params.factionRelations || {},
      doctrine: params.doctrine,
      agenda: params.agenda ?? null,
      seasonsActive: params.seasonsActive || 0,
      tags: params.tags,
      lock: params.lock,
      removed: false,
      note: params.note
    };

    syncFactionState(faction);
    pack.factions.push(faction);
    return faction;
  }

  /** Marks a faction as removed */
  remove(id: number): boolean {
    const f = pack.factions?.[id];
    if (!f || f.removed) return false;
    f.removed = true;
    return true;
  }
}

export const Factions = new FactionsModule();
