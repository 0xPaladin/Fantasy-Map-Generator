import { hcl } from "d3";
import { rollAlignment, rollValues, traitsRng } from "@/data/culture-traits";
import { getLairArchetypeForMarker, isDangerMarker } from "@/data/danger-markers";
import { getFactionAsset } from "@/data/faction-assets";
import { EPIC_FACTION_IDS, FACTIONS_CATALOG, getFactionArchetype } from "@/data/factions-catalog";
import { assignStateRoster } from "@/data/roster-content";
import { defaultFactionBudget, defaultFactionRevenueRates } from "@/model/physical/living-faction-economy";
import {
  Military,
  type Regiment,
  reconcileRegimentBlocks,
  syncRegimentTotals
} from "@/model/political/military-generator";
import type {
  Faction,
  FactionAllegiance,
  FactionBudget,
  FactionCategory,
  FactionHq,
  FactionOutpost,
  FactionRelation,
  FactionRevenueRates
} from "@/types/factions";
import type { BurgSimState } from "@/types/living";
import { minmax } from "@/utils/number-utils";
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
    const hostCountByBurg = new Map<number, number>();
    const markBurgHost = (burgId?: number) => {
      if (burgId) hostCountByBurg.set(burgId, (hostCountByBurg.get(burgId) ?? 0) + 1);
    };

    const pickInitialOutposts = (
      type: string,
      allegiance: FactionAllegiance,
      scope: Faction["expansionScope"],
      hq: FactionHq,
      cultureId: number,
      religionId: number | undefined,
      patronStateId: number | undefined,
      foundingAge: number,
      desiredAssets: readonly string[],
      rng: Rng
    ): FactionOutpost[] => {
      const available = burgs.filter(b => b.i !== hq.burgId);
      if (!available.length) return [];

      let desired = 2;
      switch (type) {
        case "merchant_consortium":
          desired = Math.min(4, Math.max(2, Math.floor(burgs.length / 8)));
          break;
        case "adventurer_guild":
        case "mercenary_company":
        case "holy_order":
        case "shadow_syndicate":
          desired = Math.min(3, Math.max(2, Math.floor(burgs.length / 10)));
          break;
        case "noble_league":
        case "arcane_college":
        case "ranger_wardens":
        case "heretical_cult":
          desired = burgs.length >= 6 ? 2 : 1;
          break;
        case "dread_host":
          desired = 1;
          break;
      }
      const targetCount = Math.min(desired, available.length);

      const hqProv = hq.provinceId ?? (hq.cell ? pack.cells?.province?.[hq.cell] : 0) ?? 0;
      const hqState = patronStateId ?? (hq.burgId ? pack.burgs?.[hq.burgId]?.state : pack.cells?.state?.[hq.cell]) ?? 0;
      const [hqX, hqY] =
        pack.cells?.p?.[hq.cell] ??
        (hq.burgId && pack.burgs?.[hq.burgId] ? [pack.burgs[hq.burgId].x, pack.burgs[hq.burgId].y] : [0, 0]);

      const matchesScope = (b: (typeof available)[number]) => {
        switch (scope) {
          case "province":
            return hqProv ? (pack.cells?.province?.[b.cell] ?? 0) === hqProv : true;
          case "state":
            return !hqState || b.state === hqState;
          case "culture":
            return b.culture === cultureId;
          case "religion":
            return !religionId || (pack.cells?.religion?.[b.cell] ?? 0) === religionId;
          default:
            return true;
        }
      };

      const dangerCells = markers.filter(isDangerMarker).map(m => m.cell);
      const scoreBurg = (b: (typeof available)[number]) => {
        const pop = b.population || 0;
        const dist = Math.hypot((b.x || 0) - hqX, (b.y || 0) - hqY);
        const crowdPenalty = -100 * (hostCountByBurg.get(b.i) ?? 0);
        const provId = pack.cells?.province?.[b.cell] ?? 0;
        const rel = pack.cells?.religion?.[b.cell] ?? 0;
        let affinity = rng.next() * 15;

        switch (type) {
          case "merchant_consortium":
            affinity += pop * 1.5 + (b.port ? 55 : 0) + (hqState && b.state !== hqState ? 35 : 0);
            break;
          case "shadow_syndicate":
            affinity += pop * 1.3 + (b.port ? 45 : 0);
            break;
          case "arcane_college":
            affinity += pop * 1.2;
            break;
          case "adventurer_guild": {
            const nearDanger = dangerCells.some(dc => {
              const [dx, dy] = pack.cells?.p?.[dc] ?? [0, 0];
              return Math.hypot((b.x || 0) - dx, (b.y || 0) - dy) < 120;
            });
            affinity += pop * 0.8 + (nearDanger ? 35 : 0) + (hqState && b.state !== hqState ? 20 : 0);
            break;
          }
          case "mercenary_company":
            affinity +=
              (hqState && b.state !== hqState ? 45 : 0) +
              (b.capital ? 30 : 0) +
              (b.walls || b.citadel ? 35 : 0) +
              pop * 0.6;
            break;
          case "holy_order":
            affinity +=
              (religionId && rel === religionId ? 50 : 0) + (b.temple ? 35 : 0) + (b.walls ? 20 : 0) + pop * 0.8;
            break;
          case "noble_league":
            affinity +=
              (b.capital ? -40 : 40) + (provId && pack.provinces?.[provId]?.burg === b.i ? 45 : 0) + pop * 0.7;
            break;
          case "ranger_wardens":
            affinity += Math.max(0, 60 - pop * 0.5) + dist * 0.05;
            break;
          case "heretical_cult":
            affinity += (religionId && rel === religionId ? 45 : 0) + Math.max(0, 50 - pop * 0.4);
            break;
          case "dread_host":
            affinity += -dist * 0.25 + Math.max(0, 50 - pop * 0.4);
            break;
          default:
            affinity += pop;
        }
        return crowdPenalty + affinity;
      };

      const scoped = available.filter(matchesScope).sort((a, b) => scoreBurg(b) - scoreBurg(a));
      // Global factions span everywhere; non-global factions stay in-scope unless scope yields 0 candidates
      const picked =
        scoped.length > 0
          ? scoped.slice(0, scope === "global" ? targetCount : scoped.length).slice(0, targetCount)
          : available
              .slice()
              .sort((a, b) => scoreBurg(b) - scoreBurg(a))
              .slice(0, 1);

      const starterAsset = desiredAssets.find(aid => {
        const def = getFactionAsset(aid);
        return def && def.location !== "hq_only" && def.location !== "wilderness";
      });

      return picked.map((outBurg, idx) => {
        const isCore = idx === 0;
        const ageShare = isCore ? 0.4 + rng.next() * 0.3 : 0.1 + rng.next() * 0.25;
        const age = Math.max(1, Math.floor(foundingAge * ageShare));
        const influence =
          type === "dread_host"
            ? Math.round(25 + rng.next() * 15)
            : isCore
              ? Math.round(40 + rng.next() * 20)
              : Math.round(20 + rng.next() * 18);
        const secrecy =
          allegiance === "clandestine"
            ? Math.round(45 + rng.next() * 25)
            : allegiance === "hostile"
              ? Math.round(35 + rng.next() * 20)
              : 0;

        return {
          burgId: outBurg.i,
          cell: outBurg.cell,
          tier: 1 as const,
          influence,
          secrecy,
          assets: starterAsset ? [starterAsset] : [],
          establishedYear: Math.max(1, currentYear - age)
        };
      });
    };

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
      const expansionism = Number((0.6 + rng.next() * 1.0).toFixed(2));
      const expansionScope = arch?.defaultExpansionScope || "state";
      if (hq.influence === undefined) {
        const ageFactor = minmax((foundingAge - 20) / 150, 0, 1);
        hq.influence = minmax(Math.round(56 + ageFactor * 16 + (expansionism - 0.6) * 12 + rng.next() * 5), 60, 85);
      }
      markBurgHost(hq.burgId);

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

      const outposts =
        optionsOverride.outposts ??
        pickInitialOutposts(
          type,
          allegiance,
          expansionScope,
          hq,
          cultureId,
          religionId,
          optionsOverride.patronStateId,
          foundingAge,
          arch?.desiredAssets ?? [],
          rng
        );
      for (const op of outposts) markBurgHost(op.burgId);

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
        expansionism,
        expansionScope,
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
          cultureId: tradeHub.culture
        }
      );
    }

    // 2. Adventurers' Conclave (guaranteed when burgs exist)
    const advBurg = sortedBurgs[1] ?? sortedBurgs[0];
    if (advBurg) {
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
          cultureId: advBurg.culture
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
      budget: params.budget,
      revenue: params.revenue,
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

  /** Set 0..100 allocation shares per expense bucket (omitted buckets keep current or default profile share) */
  setBudget(id: number, budget: Partial<FactionBudget>): void {
    const f = pack.factions?.[id];
    if (!f || f.removed) return;
    const base = { ...defaultFactionBudget(f.category), ...(f.budget ?? {}) };
    f.budget = {
      court:
        budget.court !== undefined && Number.isFinite(budget.court)
          ? minmax(Math.round(budget.court), 0, 100)
          : base.court,
      administration:
        budget.administration !== undefined && Number.isFinite(budget.administration)
          ? minmax(Math.round(budget.administration), 0, 100)
          : base.administration,
      infrastructure:
        budget.infrastructure !== undefined && Number.isFinite(budget.infrastructure)
          ? minmax(Math.round(budget.infrastructure), 0, 100)
          : base.infrastructure,
      military:
        budget.military !== undefined && Number.isFinite(budget.military)
          ? minmax(Math.round(budget.military), 0, 100)
          : base.military
    };
  }

  /** Reset custom budget shares back to the faction category's default profile */
  resetBudget(id: number): void {
    const f = pack.factions?.[id];
    if (!f || f.removed) return;
    delete f.budget;
  }

  /** Set 0..100 configurable revenue rates (omitted keys keep current or default category rate) */
  setRevenue(id: number, revenue: Partial<FactionRevenueRates>): void {
    const f = pack.factions?.[id];
    if (!f || f.removed) return;
    const base = { ...defaultFactionRevenueRates(f.category, f.allegiance), ...(f.revenue ?? {}) };
    const clampRate = (v: number | undefined, fallback: number) =>
      v !== undefined && Number.isFinite(v) ? minmax(Math.round(v), 0, 100) : fallback;
    f.revenue = {
      primary: clampRate(revenue.primary, base.primary),
      secondary: clampRate(revenue.secondary, base.secondary),
      ...(revenue.charterTithe !== undefined || base.charterTithe !== undefined
        ? { charterTithe: clampRate(revenue.charterTithe, base.charterTithe ?? 15) }
        : {})
    };
  }

  /** Reset custom revenue rates back to category/allegiance defaults */
  resetRevenue(id: number): void {
    const f = pack.factions?.[id];
    if (!f || f.removed) return;
    delete f.revenue;
  }
}

export const Factions = new FactionsModule();
