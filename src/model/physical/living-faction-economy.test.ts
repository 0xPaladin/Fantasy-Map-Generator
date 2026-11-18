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
    hq: { cell: 5, burgId: 1, fortified: false, secrecy: 0, assets: [...HQ_ASSETS] },
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
    // Infra budget (22% of 4.1 = 0.902) after 5.4% curbed corruption fully meets 0.45 required -> projectDaily = 0.85
    expect(economy.projectDaily).toBeCloseTo(0.85, 2);
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
});
