import { hcl } from "d3";
import { rollAlignment, rollValues, traitsRng } from "@/data/culture-traits";
import { getLairArchetypeForMarker, isDangerMarker } from "@/data/danger-markers";
import { EPIC_FACTION_IDS, FACTIONS_CATALOG, getFactionArchetype } from "@/data/factions-catalog";
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
import type { BurgSimState } from "@/types/living";
import { createRng, type Rng } from "@/utils/rng";
import { requireAdjustments } from "@/utils/validation-utils";

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
      buildings: [],
      civBuildings,
      construction: null,
      isMajor: true,
      hp: baseHp,
      maxHp: baseHp
    };
  } else {
    node.sim.burgId = burgId;
    node.sim.baseTier = tier;
    node.sim.buildings ??= [];
    node.sim.civBuildings = civBuildings;
    node.sim.construction ??= null;
    node.sim.isMajor = true;
    node.sim.maxHp ??= baseHp;
    node.sim.hp ??= node.sim.maxHp;
  }
  return node.sim;
}

/** Reconcile a Faction's HQ/Outpost BurgSimState nodes and ArmyBlock[] regiments */
export function syncFactionState(faction: Faction): void {
  if (!faction.rosterId) {
    faction.rosterId =
      faction.stateRosterId || assignStateRoster({ culture: faction.culture || 0, type: "Generic" }, pack?.cultures);
  }
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

    const usedTypes = new Set<string>();
    const spawnEpic = (
      type: string,
      hq: FactionHq,
      allegianceOverride?: FactionAllegiance,
      optionsOverride: {
        patronStateId?: number;
        burgName?: string;
        markerName?: string;
        cultureId?: number;
        religionId?: number;
        outposts?: FactionOutpost[];
      } = {}
    ): Faction | null => {
      const arch = getFactionArchetype(type);
      const canonical = arch?.type ?? type;
      if (!arch || usedTypes.has(canonical) || usedTypes.size >= EPIC_FACTION_IDS.length) return null;
      usedTypes.add(canonical);
      return createFaction(canonical, arch.category, hq, allegianceOverride ?? arch.defaultAllegiance, optionsOverride);
    };

    const sortedBurgs = [...burgs].sort((a, b) => (b.population || 0) - (a.population || 0));
    const dangerMarkers = markers.filter(isDangerMarker);

    // 1. Grand Merchant Consortium at the top commercial hub (or largest port)
    const tradeHub = sortedBurgs.find(b => b.port) ?? sortedBurgs[0];
    if (tradeHub) {
      const outposts: FactionOutpost[] = burgs
        .filter(b => b.i !== tradeHub.i && (b.state === tradeHub.state || masterRng.next() > 0.6))
        .slice(0, 2)
        .map(outBurg => ({
          burgId: outBurg.i,
          cell: outBurg.cell,
          tier: 1 as const,
          influence: 40,
          secrecy: 0,
          assets: ["trade_depot"],
          establishedYear: currentYear - 15
        }));
      spawnEpic(
        "merchant_consortium",
        {
          cell: tradeHub.cell,
          burgId: tradeHub.i,
          provinceId: pack.cells?.province?.[tradeHub.cell],
          fortified: false,
          secrecy: 0,
          assets: ["trade_depot", "counting_house"]
        },
        "chartered",
        {
          patronStateId: tradeHub.state || undefined,
          burgName: tradeHub.name,
          cultureId: tradeHub.culture,
          outposts
        }
      );
    }

    // 2. Adventurers' Conclave (guaranteed when burgs exist)
    const advBurg = sortedBurgs[1] ?? sortedBurgs[0];
    if (advBurg) {
      const neighbor = burgs.find(nb => nb.i !== advBurg.i && nb.state === advBurg.state);
      spawnEpic(
        "adventurer_guild",
        {
          cell: advBurg.cell,
          burgId: advBurg.i,
          provinceId: pack.cells?.province?.[advBurg.cell],
          fortified: false,
          secrecy: 0,
          assets: ["chapter_lodge", "seeker_archives"]
        },
        "autonomous",
        {
          patronStateId: advBurg.state || undefined,
          burgName: advBurg.name,
          cultureId: advBurg.culture,
          outposts: neighbor
            ? [
                {
                  burgId: neighbor.i,
                  cell: neighbor.cell,
                  tier: 1,
                  influence: 40,
                  secrecy: 0,
                  assets: ["chapter_lodge"],
                  establishedYear: currentYear - 20
                }
              ]
            : []
        }
      );
    }

    // 3. Arcane Conclave & Frontier Warden Order (when the world has enough settlements)
    const arcaneBurg = sortedBurgs[2] ?? sortedBurgs[0];
    if (arcaneBurg && burgs.length >= 2) {
      spawnEpic(
        "arcane_college",
        {
          cell: arcaneBurg.cell,
          burgId: arcaneBurg.i,
          provinceId: pack.cells?.province?.[arcaneBurg.cell],
          fortified: false,
          secrecy: 0,
          assets: ["seeker_archives", "alchemical_lab"]
        },
        "chartered",
        { patronStateId: arcaneBurg.state || undefined, burgName: arcaneBurg.name, cultureId: arcaneBurg.culture }
      );
    }
    const wardenBurg = sortedBurgs[sortedBurgs.length - 1];
    if (wardenBurg && burgs.length >= 3) {
      spawnEpic(
        "ranger_wardens",
        {
          cell: wardenBurg.cell,
          burgId: wardenBurg.i,
          provinceId: pack.cells?.province?.[wardenBurg.cell],
          fortified: false,
          secrecy: 0,
          assets: ["chapter_lodge", "wayside_shrine"]
        },
        "autonomous",
        { patronStateId: wardenBurg.state || undefined, burgName: wardenBurg.name, cultureId: wardenBurg.culture }
      );
    }

    // 4. Crusader Knightly Order (major organized faith)
    const mainRel = religions.find(r => r.type !== "Cult" && r.type !== "Heresy") ?? religions[0];
    if (mainRel && burgs.length > 0) {
      const relBurg = burgs.find(b => pack.cells?.religion?.[b.cell] === mainRel.i) ?? sortedBurgs[0];
      spawnEpic(
        "holy_order",
        {
          cell: relBurg.cell,
          burgId: relBurg.i,
          provinceId: pack.cells?.province?.[relBurg.cell],
          fortified: true,
          secrecy: 0,
          assets: ["wayside_shrine", "monastic_scriptorium"]
        },
        "chartered",
        {
          patronStateId: relBurg.state || undefined,
          burgName: relBurg.name,
          religionId: mainRel.i,
          cultureId: relBurg.culture
        }
      );
    }

    // 5. Shadow Brotherhood in a major city/port
    const shadowBurg = sortedBurgs.find(b => b.port && b.i !== tradeHub?.i) ?? sortedBurgs[0];
    if (shadowBurg && (burgs.length >= 2 || dangerMarkers.length > 0)) {
      spawnEpic(
        "shadow_syndicate",
        {
          cell: shadowBurg.cell,
          burgId: shadowBurg.i,
          provinceId: pack.cells?.province?.[shadowBurg.cell],
          fortified: false,
          secrecy: 65,
          assets: ["safe_house", "smuggler_tunnel"]
        },
        "clandestine",
        { burgName: shadowBurg.name, cultureId: shadowBurg.culture }
      );
    }

    // 6. Claimant Confederacy in a secondary realm (or second major burg)
    const leagueState = states[1] ?? states[0];
    const leagueBurg = (leagueState?.capital ? pack.burgs?.[leagueState.capital] : undefined) ?? sortedBurgs[1];
    if (leagueBurg && (states.length >= 2 || masterRng.next() < 0.7)) {
      spawnEpic(
        "noble_league",
        {
          cell: leagueBurg.cell,
          burgId: leagueBurg.i,
          provinceId: pack.cells?.province?.[leagueBurg.cell],
          fortified: false,
          secrecy: 0,
          assets: ["informant_ring", "printing_cell"]
        },
        "autonomous",
        { patronStateId: leagueBurg.state || undefined, burgName: leagueBurg.name, cultureId: leagueBurg.culture }
      );
    }

    // 7. Iron Free Company in a prominent settlement
    const mercBurg = sortedBurgs[Math.min(3, sortedBurgs.length - 1)];
    if (mercBurg && burgs.length >= 3 && masterRng.next() < 0.85) {
      spawnEpic(
        "mercenary_company",
        {
          cell: mercBurg.cell,
          burgId: mercBurg.i,
          provinceId: pack.cells?.province?.[mercBurg.cell],
          fortified: true,
          secrecy: 0,
          assets: ["muster_camp", "armory_forge"]
        },
        "autonomous",
        { patronStateId: mercBurg.state || undefined, burgName: mercBurg.name, cultureId: mercBurg.culture }
      );
    }

    // 8. Apocalyptic Cult from heresy/dark site (at most 1)
    const cultRel = religions.find(r => r.type === "Cult" || r.type === "Heresy");
    const occultMarker = dangerMarkers.find(m =>
      ["dungeons", "dungeon", "rifts", "rift", "disturbed-burials", "necropolises"].some(k =>
        (m.type ?? "").toLowerCase().includes(k)
      )
    );
    if (cultRel && burgs.length > 0) {
      const cultBurg = burgs.find(b => pack.cells?.religion?.[b.cell] === cultRel.i) ?? sortedBurgs[0];
      spawnEpic(
        "heretical_cult",
        {
          cell: cultBurg.cell,
          burgId: cultBurg.i,
          provinceId: pack.cells?.province?.[cultBurg.cell],
          fortified: false,
          secrecy: 70,
          assets: ["safe_house", "ritual_sanctum"]
        },
        "clandestine",
        { burgName: cultBurg.name, religionId: cultRel.i, cultureId: cultBurg.culture }
      );
    } else if (occultMarker) {
      const mapping = getLairArchetypeForMarker(occultMarker.type);
      spawnEpic(
        "heretical_cult",
        {
          cell: occultMarker.cell,
          markerId: occultMarker.i,
          provinceId: pack.cells?.province?.[occultMarker.cell],
          maritime: mapping.isMaritime,
          fortified: false,
          secrecy: 65,
          assets: ["safe_house", "ritual_sanctum"]
        },
        "clandestine",
        { markerName: occultMarker.name }
      );
    } else if (sortedBurgs.length >= 2 && masterRng.next() < 0.65) {
      const b = sortedBurgs[sortedBurgs.length - 1]!;
      spawnEpic(
        "heretical_cult",
        {
          cell: b.cell,
          burgId: b.i,
          provinceId: pack.cells?.province?.[b.cell],
          fortified: false,
          secrecy: 70,
          assets: ["safe_house", "wayside_shrine"]
        },
        "clandestine",
        { burgName: b.name, cultureId: b.culture }
      );
    }

    // 9. Dread Sovereign Host anchored at the primary danger marker (at most 1)
    const primaryDanger = dangerMarkers.find(m => m.i !== occultMarker?.i) ?? dangerMarkers[0];
    if (primaryDanger) {
      const mapping = getLairArchetypeForMarker(primaryDanger.type);
      spawnEpic(
        "dread_host",
        {
          cell: primaryDanger.cell,
          markerId: primaryDanger.i,
          provinceId: pack.cells?.province?.[primaryDanger.cell],
          maritime: mapping.isMaritime,
          fortified: true,
          secrecy: 35,
          assets: ["muster_camp"]
        },
        "hostile",
        { markerName: primaryDanger.name }
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
      adjustments: params.adjustments,
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

  /** Set daily revenue/cost adjustments on a faction */
  setAdjustments(id: number, adjustments: { name: string; value: number }[]): void {
    const f = pack.factions?.[id];
    if (!f || f.removed) return;
    f.adjustments = requireAdjustments(adjustments);
  }
}

export const Factions = new FactionsModule();
