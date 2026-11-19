import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Corruption } from "@/model/economy/corruption";
import { Deals } from "@/model/economy/deals";
import { Prosperity } from "@/model/economy/prosperity";
import { Taxes } from "@/model/economy/taxes";
import { noFinance } from "@/model/political/states-generator";
import type { Faction, FactionOutpost } from "@/types/factions";
import {
  canReadUpstreamEconomy,
  computeFactionEconomy,
  factionNodeHostPresence,
  factionUpstreamIncome,
  projectedAssetSeasons,
  SEASON_DAYS
} from "./living-faction-economy";

const HQ_ASSETS: string[] = [];

function faction(overrides: Partial<Faction> = {}): Faction {
  return {
    i: 1,
    name: "Test Faction",
    category: "commercial",
    type: "merchant_consortium",
    allegiance: "autonomous",
    culture: 1,
    treasury: 0,
    influence: 50,
    hq: {
      cell: 5,
      burgId: 1,
      fortified: false,
      secrecy: 0,
      assets: [...HQ_ASSETS],
      personnel: { extraStaff: 24, extraGuards: 9 }
    },
    outposts: [],
    stateRelations: {},
    ...overrides
  } as Faction;
}

describe("Faction upstream income (economy alignment Phase 5 §5.1)", () => {
  let turnover: number;
  let graft: number;
  let tariffs: number;

  beforeEach(() => {
    turnover = 10;
    graft = 0;
    tariffs = 0;

    globalThis.options = {
      map: { goods: [{ i: 0, name: "None" }], units: { population: { scale: 1, urbanization: { rate: 1 } } } }
    } as unknown as typeof options;
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5],
        state: [0, 1, 1, 1, 1, 1],
        province: [0, 1, 1, 1, 1, 1],
        market: [0, 0, 0, 0, 0, 1]
      },
      burgs: [undefined, { i: 1, cell: 5, state: 1, product: 8 }],
      states: [
        undefined,
        {
          i: 1,
          culture: 1,
          economy: {
            ...noFinance(),
            collected: 40,
            pocketed: graft,
            spent: { court: 20, administration: 10, infrastructure: 5, military: 30 },
            tariffs: []
          }
        }
      ],
      cultures: [undefined, { i: 1, values: [] }],
      deals: [[1, 1, 0, 2, 1, 1, 0, 0, 0]],
      markets: [{ i: 1 }],
      history: { figures: [], living: { states: {} } }
    } as unknown as typeof pack;

    vi.spyOn(Deals, "getGoodsValue").mockImplementation(() => turnover);
    vi.spyOn(Corruption, "ofCell").mockReturnValue({ share: 0.5 } as never);
    vi.spyOn(Corruption, "ofCapital").mockReturnValue({ share: 1 } as never);
    vi.spyOn(Taxes, "getTaxesByState").mockImplementation(() => ({ salesTax: [], tariffs: [0, tariffs] }));
    vi.spyOn(Prosperity, "getBurg").mockReturnValue({ prosperity: 0.7 } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is unreadable before the economy has run", () => {
    pack.deals = undefined as unknown as typeof pack.deals;
    expect(canReadUpstreamEconomy()).toBe(false);
    expect(factionUpstreamIncome(faction(), faction().hq).gold).toBe(0);
  });

  it("pays a commercial faction the host burg's product and a cut of its market's turnover", () => {
    const income = factionUpstreamIncome(faction(), faction().hq);
    // 8 × 0.2 product + 10 × 0.05 commission, a season of it
    expect(income.gold).toBeCloseTo((8 * 0.2 + turnover * 0.05) * SEASON_DAYS, 2);
    expect(income.charterTithe).toBe(0);
  });

  it("raises a commercial faction's commission with its trade assets, up to 15%", () => {
    const plain = factionUpstreamIncome(faction(), faction().hq).gold;
    const trader = faction({ hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: ["trade_depot"] } });
    const exchange = faction({
      hq: {
        cell: 5,
        burgId: 1,
        fortified: false,
        secrecy: 0,
        assets: ["trade_depot", "counting_house", "grand_exchange", "bank"]
      }
    });

    expect(factionUpstreamIncome(trader, trader.hq).gold).toBeGreaterThan(plain);
    const capped = factionUpstreamIncome(exchange, exchange.hq).gold;
    expect(capped).toBeCloseTo((8 * 0.2 + turnover * 0.15) * SEASON_DAYS, 2);
  });

  it("takes a cut of the province's graft for an underworld faction", () => {
    const guild = faction({ category: "underworld", type: "thieves_guild" });
    expect(factionUpstreamIncome(guild, guild.hq).gold).toBe(0); // an honest state

    pack.states[1].economy.pocketed = 20;
    const income = factionUpstreamIncome(guild, guild.hq).gold;
    // a half of the pocketed graft, siphoned at 0.1 + 0.3 × 0.5 influence
    expect(income).toBeCloseTo(20 * 0.5 * 0.25 * SEASON_DAYS, 2);
  });

  it("pays smugglers better in an embargoed, tariffed state", () => {
    const ring = faction({ category: "underworld", type: "smugglers_ring" });
    tariffs = 4;
    const taxed = factionUpstreamIncome(ring, ring.hq).gold;

    pack.states[1].economy.tariffs = [{ states: "all", goods: "all", rate: "embargo" }];
    const embargoed = factionUpstreamIncome(ring, ring.hq).gold;
    expect(embargoed).toBeGreaterThan(taxed);
    expect(embargoed - taxed).toBeCloseTo(4 * 0.5 * 0.5 * SEASON_DAYS, 2);
  });

  it("keeps a mercenary company on a friendly patron's military budget", () => {
    const company = faction({ category: "martial", type: "mercenary_company", stateRelations: { 1: "Neutral" } });
    expect(factionUpstreamIncome(company, company.hq).gold).toBe(0);

    company.stateRelations = { 1: "Friendly" };
    expect(factionUpstreamIncome(company, company.hq).gold).toBeCloseTo(30 * 0.05 * SEASON_DAYS, 2);
  });

  it("draws a temple's tithes and a chancery's fees from court spending and local prosperity", () => {
    const temple = faction({ category: "religious" });
    const templeIncome = factionUpstreamIncome(temple, temple.hq);
    expect(templeIncome.gold).toBeCloseTo(20 * 0.05 * (0.5 + 0.7) * SEASON_DAYS, 2);
    expect(templeIncome.influence).toBeGreaterThan(0);

    const chancery = faction({ category: "political" });
    expect(factionUpstreamIncome(chancery, chancery.hq).gold).toBeGreaterThan(templeIncome.gold);
  });

  it("pays a charter's tithe to its patron state", () => {
    const charter = faction({ allegiance: "chartered", patronStateId: 1 });
    const income = factionUpstreamIncome(charter, charter.hq);
    const gross = (8 * 0.2 + turnover * 0.05) * SEASON_DAYS;

    expect(income.charterTithe).toBeCloseTo(gross * 0.15, 2);
    expect(income.gold).toBeCloseTo(gross * 0.85, 2);
    expect(income.patronStateId).toBe(1);
  });

  it("earns nothing in the wildlands, where no state runs an economy", () => {
    const wild = faction({ hq: { cell: 0, fortified: true, secrecy: 0, assets: [] } });
    const outpost: FactionOutpost = {
      burgId: 0,
      cell: 0,
      tier: 1,
      influence: 20,
      secrecy: 0,
      assets: [],
      establishedYear: 1000
    };
    expect(factionUpstreamIncome(wild, wild.hq).gold).toBe(0);
    expect(factionUpstreamIncome(wild, outpost).gold).toBe(0);
  });

  it("computes category revenue lines, 4 expense buckets, corruption, and day balance", () => {
    const charter = faction({ allegiance: "chartered", patronStateId: 1, alignment: "lawful" });
    const nodeInc = factionUpstreamIncome(charter, charter.hq);
    expect(nodeInc.lines.length).toBe(2);

    const economy = computeFactionEconomy(charter, [nodeInc], 0);
    expect(economy.collectedDaily).toBeCloseTo(8 * 0.2 + turnover * 0.05, 2);
    expect(economy.expenses.map(e => e.bucket)).toEqual(["court", "administration", "infrastructure", "military"]);
    // Lawful commercial base corruption is 7%; partial admin provision curbs it below 7%
    expect(economy.corruptionRate).toBeLessThan(7);
    expect(economy.corruptionRate).toBeGreaterThan(3.5);
    expect(economy.charterTitheDaily).toBeCloseTo(economy.collectedDaily * 0.15, 1);
    const spent = economy.expenses.reduce((s, e) => s + e.daily, 0);
    expect(economy.dayBalance).toBeCloseTo(
      economy.collectedDaily - spent - economy.corruptionDaily - economy.charterTitheDaily,
      2
    );
    for (const exp of economy.expenses) {
      expect(exp.requiredDaily).toBeGreaterThan(0);
      expect(exp.provision).toBeGreaterThanOrEqual(0);
      expect(exp.provision).toBeLessThanOrEqual(1);
    }
    expect(economy.prosperity).toBeGreaterThan(0);
    expect(economy.stability).toBeGreaterThan(0);
  });

  it("folds faction adjustments, custom budget shares, required upkeep, and host presence into economy", () => {
    const guild = faction({
      allegiance: "chartered",
      patronStateId: 1,
      adjustments: [
        { name: "Patron Grant", value: 3 },
        { name: "Dock Dues", value: -1 }
      ]
    });
    const nodeInc = factionUpstreamIncome(guild, guild.hq);
    const economy = computeFactionEconomy(guild, [nodeInc], 0);

    expect(economy.adjustmentsDaily).toBe(2);
    expect(economy.collectedDaily).toBeCloseTo(2.1 + 2, 2);
    // Infra budget (22% of 4.1 = 0.902) after 7.4% curbed corruption over-mets the 0.72 required -> projectDaily = 0.84
    expect(economy.projectDaily).toBeCloseTo(0.84, 2);
    expect(projectedAssetSeasons(50, economy.projectDaily)).toBe(1);
    expect(projectedAssetSeasons(200, economy.projectDaily)).toBe(3);
    expect(projectedAssetSeasons(50, 0)).toBeNull();

    // User-adjustable budget overrides category profile and shifts provision + prosperity/stability
    const starvingAdmin = faction({
      adjustments: [{ name: "Grant", value: 2 }],
      budget: { court: 10, administration: 0, infrastructure: 10, military: 10 }
    });
    const customEcon = computeFactionEconomy(starvingAdmin, [nodeInc], 0);
    expect(customEcon.expenses.find(e => e.bucket === "administration")?.provision).toBe(0);
    expect(customEcon.corruptionRate).toBe(10); // zero admin -> uncurbed base corruption
    expect(customEcon.prosperity).toBeLessThan(economy.prosperity);

    // Host presence scales with influence & faction prosperity and sums with local assets
    const lowInf = factionNodeHostPresence(guild, { ...guild.hq, influence: 20 }, true, economy.prosperity);
    const highInf = factionNodeHostPresence(
      guild,
      { ...guild.hq, influence: 80, assets: ["trade_depot"] },
      true,
      economy.prosperity
    );
    expect(highInf.goldDaily).toBeGreaterThan(lowInf.goldDaily);
    expect(highInf.assetGoldDaily).toBe(1);
    expect(highInf.stabilityDelta).toBeGreaterThan(0);

    const underworld = faction({ category: "underworld", allegiance: "clandestine" });
    const uwImpact = factionNodeHostPresence(underworld, { ...underworld.hq, influence: 80 }, true, 0.6);
    expect(uwImpact.goldDaily).toBeLessThan(0);
    expect(uwImpact.stabilityDelta).toBeLessThan(0);
  });

  it("scales node income by influence across all categories and applies extraction rate & burden tradeoffs", () => {
    const guild50 = faction({ hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 50, assets: [] } });
    const guild100 = faction({ hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 100, assets: [] } });
    const g50 = factionUpstreamIncome(guild50, guild50.hq).gold;
    const g100 = factionUpstreamIncome(guild100, guild100.hq).gold;
    expect(g100).toBeCloseTo(g50 * 1.5, 2);

    const temple50 = faction({
      category: "religious",
      hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 50, assets: [] }
    });
    const temple100 = faction({
      category: "religious",
      hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, influence: 100, assets: [] }
    });
    expect(factionUpstreamIncome(temple100, temple100.hq).gold).toBeCloseTo(
      factionUpstreamIncome(temple50, temple50.hq).gold * 1.5,
      2
    );

    // Raising revenue rates increases income & triggers burden + harsher host drain
    const squeezed = faction({
      allegiance: "chartered",
      patronStateId: 1,
      revenue: { primary: 35, secondary: 15, charterTithe: 5 }
    });
    const squeezedInc = factionUpstreamIncome(squeezed, squeezed.hq);
    const squeezedEcon = computeFactionEconomy(squeezed, [squeezedInc], 0);
    expect(squeezedInc.lines[0].rate).toBe(35);
    expect(squeezedEcon.charterTitheRate).toBe(5);
    expect(squeezedEcon.burdenPenalty).toBeGreaterThan(0);

    const normalImpact = factionNodeHostPresence(guild50, guild50.hq, true, 0.6);
    const squeezedImpact = factionNodeHostPresence(squeezed, squeezed.hq, true, 0.6);
    expect(squeezedImpact.goldDaily).toBeLessThan(normalImpact.goldDaily);
    expect(squeezedImpact.stabilityDelta).toBeLessThan(normalImpact.stabilityDelta);
  });
});

describe("Faction hinterland dues for burg-less nodes (faction-hinterland-dues.md)", () => {
  const EARNED: Record<number, number> = { 2: 2, 3: 4, 4: 6 };

  beforeEach(() => {
    globalThis.options = {
      map: { goods: [{ i: 0, name: "None" }], units: { population: { scale: 1, urbanization: { rate: 1 } } } }
    } as unknown as typeof options;
    // a line of cells: a wild HQ at 1, rural cells 2-4, a rival wild HQ at 5, a burg cell at 6
    globalThis.pack = {
      cells: {
        i: [0, 1, 2, 3, 4, 5, 6],
        c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5]],
        pop: [0, 10, 10, 10, 10, 10, 10],
        burg: [0, 0, 0, 0, 0, 0, 7],
        state: [0, 0, 0, 0, 0, 0, 0],
        province: [0, 0, 0, 0, 0, 0, 0],
        market: [0, 1, 1, 1, 1, 1, 1]
      },
      burgs: [undefined, undefined, undefined, undefined, undefined, undefined, { i: 7, cell: 6 }],
      states: [undefined],
      factions: [],
      deals: [[1, 1, 0, 2, 1, 1, 0, 0, 0]],
      markets: [{ i: 1 }],
      history: { figures: [], living: { states: {} } }
    } as unknown as typeof pack;

    vi.spyOn(Prosperity, "getRuralCell").mockImplementation(
      (cellId: number) => ({ earned: EARNED[cellId] ?? 0 }) as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function wildFaction(id: number, cell: number, influence = 80): Faction {
    const wild = faction({
      i: id,
      name: `Wild ${id}`,
      category: "religious",
      hq: { cell, fortified: true, secrecy: 0, assets: [], influence }
    });
    wild.hq.personnel = { extraStaff: 8, extraGuards: 4 };
    pack.factions.push(wild);
    return wild;
  }

  it("pays a burg-less HQ a share of the rural earnings in its reach, under its category label", () => {
    const wild = wildFaction(1, 1);
    // cells 2-4 within five hops: 2 + 4 + 6 earned; 5% tithes × 1.3 influence factor (80)
    const income = factionUpstreamIncome(wild, wild.hq);
    const line = income.lines.find(entry => entry.key === "hinterland_dues");
    expect(line).toBeDefined();
    expect(line!.label).toBe("Rural tithes");
    expect(line!.daily).toBeCloseTo((2 + 4 + 6) * 0.05 * 1.3, 2);
    expect(income.gold).toBeCloseTo((2 + 4 + 6) * 0.05 * 1.3 * SEASON_DAYS, 2);
  });

  it("earns dues in the wildlands, where no host state runs an economy", () => {
    const wild = wildFaction(1, 1);
    const income = factionUpstreamIncome(wild, wild.hq);
    expect(income.lines.length).toBe(1); // dues alone
    expect(income.gold).toBeGreaterThan(0);
  });

  it("claims each cell only for the nearest burg-less node, ties by influence", () => {
    const west = wildFaction(1, 1, 80);
    const east = wildFaction(2, 5, 40);

    // west: cells 2 (1 hop) and 3 (2 hops, tie with east) → 2 + 4; east: cell 4
    const westLine = factionUpstreamIncome(west, west.hq).lines.find(entry => entry.key === "hinterland_dues");
    const eastLine = factionUpstreamIncome(east, east.hq).lines.find(entry => entry.key === "hinterland_dues");
    expect(westLine!.daily).toBeCloseTo(6 * 0.05 * 1.3, 2);
    expect(eastLine!.daily).toBeCloseTo(6 * 0.05 * 0.9, 2);
  });

  it("scales with influence, skips burg and unpeopled cells, and stops when pillaged", () => {
    const quiet = wildFaction(1, 1, 12);
    const quietDues = factionUpstreamIncome(quiet, quiet.hq).lines.find(
      entry => entry.key === "hinterland_dues"
    )!.daily;

    pack.factions.length = 0;
    const loud = wildFaction(1, 1, 100);
    const loudDues = factionUpstreamIncome(loud, loud.hq).lines.find(entry => entry.key === "hinterland_dues")!;
    expect(loudDues.daily).toBeGreaterThan(quietDues);
    // cell 6 hosts a burg and pays nothing: 12 × 0.05 × 1.5 is the ceiling with cells 2-4 only
    expect(loudDues.daily).toBeCloseTo(12 * 0.05 * 1.5, 2);

    loud.hq.pillaged = true;
    expect(factionUpstreamIncome(loud, loud.hq).lines.length).toBe(0);
  });

  it("leaves burg-hosted nodes on their host lines only", () => {
    const burgFaction = faction({ hq: { cell: 6, burgId: 7, fortified: false, secrecy: 0, assets: [] } });
    const income = factionUpstreamIncome(burgFaction, burgFaction.hq);
    expect(income.lines.some(entry => entry.key === "hinterland_dues")).toBe(false);
  });
});

describe("Faction personnel requirements and node host adjustments (faction-personnel.md Phase 2)", () => {
  beforeEach(() => {
    globalThis.options = {
      map: { goods: [{ i: 0, name: "None" }], units: { population: { scale: 1, urbanization: { rate: 1 } } } }
    } as unknown as typeof options;
    globalThis.pack = {
      cells: { i: [0, 5], state: [0, 1], province: [0, 1], market: [0, 0] },
      burgs: [undefined, { i: 1, cell: 5, state: 1, product: 8 }],
      states: [undefined, { i: 1, culture: 1, economy: { ...noFinance() } }],
      deals: [],
      markets: [],
      history: { figures: [], living: { states: {} } }
    } as unknown as typeof pack;
  });

  /** The plan's stock faction: HQ at 60 influence + 3 outposts at 35, four starter assets */
  function stock(): Faction {
    return faction({
      hq: {
        cell: 5,
        burgId: 1,
        fortified: false,
        secrecy: 0,
        influence: 60,
        assets: ["trade_depot", "chapter_lodge"],
        personnel: { extraStaff: 24, extraGuards: 9 }
      },
      outposts: [
        {
          burgId: 1,
          cell: 5,
          tier: 1,
          influence: 35,
          secrecy: 0,
          assets: ["safe_house"],
          establishedYear: 1000,
          personnel: { extraStaff: 7, extraGuards: 3 }
        },
        {
          burgId: 1,
          cell: 5,
          tier: 1,
          influence: 35,
          secrecy: 0,
          assets: ["wayside_shrine"],
          establishedYear: 1000,
          personnel: { extraStaff: 7, extraGuards: 3 }
        },
        {
          burgId: 1,
          cell: 5,
          tier: 1,
          influence: 35,
          secrecy: 0,
          assets: [],
          establishedYear: 1000,
          personnel: { extraStaff: 7, extraGuards: 3 }
        }
      ]
    });
  }

  it("derives each bucket's required cost from effective staff and guards", () => {
    const f = stock();
    // 45 extra staff/guards + asset crew 4 (depot, lodge, shrine) + garrison 5 (lodge 3, safe house 2)
    const economy = computeFactionEconomy(f, [], 0);
    expect(economy.personnel).toEqual({ staff: 49, guards: 23 });
    const required = Object.fromEntries(economy.expenses.map(e => [e.bucket, e.requiredDaily]));
    expect(required.administration).toBeCloseTo(0.06 * 49, 2); // 2.94
    expect(required.court).toBeCloseTo(0.05 * 49, 2); // 2.45
    expect(required.infrastructure).toBeCloseTo(0.03 * 49, 2); // 1.47
    expect(required.military).toBeCloseTo(0.05 * 23, 2); // 1.15, the guards floor
    expect(economy.requiredTotalDaily).toBeCloseTo(8.01, 2);
  });

  it("raises court need for religious and political factions", () => {
    const temple = computeFactionEconomy(faction({ category: "religious" }), [], 0);
    expect(temple.expenses.find(e => e.bucket === "court")?.requiredDaily).toBeCloseTo(0.05 * 24 * 1.2, 2);
    const chancery = computeFactionEconomy(faction({ category: "political" }), [], 0);
    expect(chancery.expenses.find(e => e.bucket === "court")?.requiredDaily).toBeCloseTo(0.05 * 24 * 1.2, 2);
  });

  it("lets regiment upkeep set the military need over the guards floor", () => {
    const guardsOnly = computeFactionEconomy(stock(), [], 0);
    expect(guardsOnly.expenses.find(e => e.bucket === "military")?.requiredDaily).toBeCloseTo(1.15, 2);
    const regimented = computeFactionEconomy(stock(), [], 180); // 2 🪙/day of block upkeep
    expect(regimented.expenses.find(e => e.bucket === "military")?.requiredDaily).toBe(2);
  });

  it("drops pillaged nodes and grows requirements with assets", () => {
    const f = stock();
    f.outposts[0].pillaged = true;
    const razed = computeFactionEconomy(f, [], 0);
    expect(razed.personnel).toEqual({ staff: 41, guards: 18 }); // loses the safe house node: -8 staff, -5 guards

    f.outposts[2].assets = ["muster_camp"]; // crew 1, garrison 4
    const mustered = computeFactionEconomy(f, [], 0);
    expect(mustered.personnel).toEqual({ staff: 42, guards: 22 });
  });

  it("adds node host adjustments flat, unscaled by influence, and skips razed or stateless nodes", () => {
    const f = faction({ allegiance: "chartered", patronStateId: 1 });
    const plain = factionNodeHostPresence(f, { ...f.hq, influence: 60 }, true, 0.6);
    const boosted = factionNodeHostPresence(
      f,
      { ...f.hq, influence: 60, hostAdjustments: { gold: 5, stability: 2 } },
      true,
      0.6
    );
    expect(boosted.goldDaily - plain.goldDaily).toBeCloseTo(5, 2);
    expect(boosted.stabilityDelta - plain.stabilityDelta).toBeCloseTo(2, 1);

    const wild = faction({ hq: { cell: 0, fortified: true, secrecy: 0, assets: [] } });
    const wildImpact = factionNodeHostPresence(
      wild,
      { ...wild.hq, hostAdjustments: { gold: 5, stability: 2 } },
      true,
      0.6
    );
    expect(wildImpact.goldDaily).toBe(0); // no host burg to adjust
    expect(wildImpact.stabilityDelta).toBe(0); // no host state to adjust
  });

  it("counts sim-owned daily lines in adjustments and the day balance", () => {
    const base = computeFactionEconomy(faction(), [], 0);
    const charged = computeFactionEconomy(
      faction({ simAdjustments: [{ name: "Scheme 1: Divine Ascension", value: -3 }] }),
      [],
      0
    );
    expect(charged.adjustmentsDaily).toBeCloseTo(base.adjustmentsDaily - 3, 2);
    expect(charged.collectedDaily).toBeCloseTo(base.collectedDaily - 3, 2);
    expect(charged.dayBalance).toBeCloseTo(base.dayBalance - 3, 2);
  });
});
