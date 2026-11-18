// Upstream-backed faction income (economy alignment §5.1): trade margins, graft,
// retainers and tithes read off the last economy run rather than abstract cell yields.

import { getFactionAsset } from "@/data/faction-assets";
import { Corruption } from "@/model/economy/corruption";
import { Deals } from "@/model/economy/deals";
import { Prosperity } from "@/model/economy/prosperity";
import { Taxes } from "@/model/economy/taxes";
import { figureBias } from "@/model/physical/figure-bias";
import type { State } from "@/model/political/states-generator";
import type {
  Faction,
  FactionBudget,
  FactionCategory,
  FactionEconomyBreakdown,
  FactionExpenseBucket,
  FactionExpenseLine,
  FactionHq,
  FactionOutpost,
  FactionRevenueLine
} from "@/types/factions";
import { minmax, rn } from "@/utils/number-utils";

export const SEASON_DAYS = 90; // a season of upstream daily flows, as the state and burg ledgers count it

/** What a faction node earns from the upstream economy in a season, before upkeep */
export interface FactionUpstreamIncome {
  gold: number;
  charterTithe: number; // the share paid to its patron state
  patronStateId: number; // 0 without a charter
  influence: number;
  /** Daily revenue lines at this node (gross, before charter tithe and expenses) */
  lines: FactionRevenueLine[];
  /** Host burg manufacturing product (for product-share reporting) */
  hostProduct: number;
}

const NONE: FactionUpstreamIncome = {
  gold: 0,
  charterTithe: 0,
  patronStateId: 0,
  influence: 0,
  lines: [],
  hostProduct: 0
};

export const COMMERCIAL_ASSETS = [
  "trade_depot",
  "counting_house",
  "grand_exchange",
  "bazaar",
  "harbor",
  "seaport",
  "bank"
];
const COMMISSION_BASE = 0.05; // of the market's turnover, a faction's cut
export const COMMISSION_PER_ASSET = 0.03;
const COMMISSION_TOP = 0.15;
const PRODUCT_SHARE = 0.2; // of the host burg's manufacturing product
const SIPHON_BASE = 0.1; // of the province's official graft
const SIPHON_INFLUENCE = 0.3; // more where the faction holds more influence
const SIPHON_TOP = 0.4;
const SMUGGLING_SHARE = 0.5; // of the tariffs the state would have charged
const EMBARGO_BONUS = 1.5; // blocked trade pays smugglers best
const RETAINER_SHARE = 0.05; // of the patron's military budget
const COURT_SHARE = 0.05; // of the court's spending
const ADMINISTRATION_SHARE = 0.05; // of the administration's spending
const INFLUENCE_TOP = 3; // a season
const CHARTER_SHARE = 0.15; // of the node's upstream gold, to the patron state

/** Upstream accounts are readable only after a full economy run on a whole map */
export function canReadUpstreamEconomy(): boolean {
  return Boolean(pack?.deals?.length && pack.cells?.market && options.map.goods?.length);
}

/** A leader's knack for turning trade and graft into coin */
function leaderIncomeFactor(faction: Faction): number {
  const figure = pack.history?.figures?.find(entry => entry.i === faction.leaderId && !entry.removed);
  if (!figure || figure.death !== undefined) return 1;
  const bias = figureBias(figure, pack.cultures?.[faction.culture ?? 0]?.values);
  return 1 + 0.25 * bias.civic + 0.15 * bias.cruel;
}

/** Money a day changing hands at the node's market or through its burg */
function marketTurnover(marketId: number, burgId: number | undefined): number {
  if (!marketId && !burgId) return 0;
  let turnover = 0;
  for (const deal of pack.deals ?? []) {
    const [dealBurg, dealMarket] = deal;
    if (dealMarket !== marketId && dealBurg !== burgId) continue;
    turnover += Deals.getGoodsValue(deal);
  }
  return turnover;
}

/** The node's commercial cut of its host market and burg, decomposed into daily streams */
function commercialLines(
  faction: Faction,
  node: FactionHq | FactionOutpost,
  burgId: number | undefined
): FactionRevenueLine[] {
  const hostBurg = burgId ? pack.burgs?.[burgId] : undefined;
  const marketId = Number(pack.cells.market?.[node.cell] ?? 0);
  const assets = node.assets ?? [];
  const commerce = assets.filter(asset => COMMERCIAL_ASSETS.includes(asset)).length;
  const commission = Math.min(COMMISSION_TOP, COMMISSION_BASE + COMMISSION_PER_ASSET * commerce);
  const factor = leaderIncomeFactor(faction);
  const mfgDaily = (hostBurg?.product ?? 0) * PRODUCT_SHARE * factor;
  const marketDaily = marketTurnover(marketId, burgId) * commission * factor;
  return [
    { key: "mfg_cut", label: "Manufacturing cut", daily: mfgDaily },
    { key: "market_comm", label: "Market commissions", daily: marketDaily }
  ];
}

/** What the underworld takes of official graft, and of the trade tariffs it helps avoid */
function underworldLines(state: State, node: FactionHq | FactionOutpost): FactionRevenueLine[] {
  const influence = Math.max(0, Math.min(100, node.influence ?? 50));
  const siphon = Math.min(SIPHON_TOP, SIPHON_BASE + (SIPHON_INFLUENCE * influence) / 100);
  const province = Corruption.ofCell(node.cell) ?? Corruption.ofCapital(state);
  const pocketed = Number(state.economy?.pocketed ?? 0) * (province?.share ?? 1);
  const tariffs = Taxes.getTaxesByState().tariffs[state.i] || 0;
  const embargo = (state.economy?.tariffs ?? []).some(rule => rule.rate === "embargo");
  const smuggling = tariffs * SMUGGLING_SHARE * (embargo ? EMBARGO_BONUS : 1);
  return [
    { key: "graft_siphon", label: "Graft siphon", daily: pocketed * siphon },
    { key: "smuggling", label: "Smuggling & tariffs", daily: smuggling }
  ];
}

/** A mercenary retainer from a patron that keeps the company, or raiding tribute for hostile warbands */
function martialLines(faction: Faction, stateId: number, burgId: number | undefined): FactionRevenueLine[] {
  const relation = faction.stateRelations?.[stateId];
  const retainer =
    relation === "Ally" || relation === "Friendly"
      ? Number(pack.states?.[stateId]?.economy?.spent?.military ?? 0) * RETAINER_SHARE
      : 0;
  const hostBurg = burgId ? pack.burgs?.[burgId] : undefined;
  const tribute = faction.allegiance === "hostile" ? (hostBurg?.product ?? 0) * 0.05 : 0;
  return [
    { key: "retainers", label: "Military retainers", daily: retainer },
    ...(faction.allegiance === "hostile" ? [{ key: "tribute", label: "Raiding & tribute", daily: tribute }] : [])
  ];
}

/** What the temples and the chancery draw of the court's and the administration's spending */
function courtLines(state: State, burgId: number | undefined, political: boolean): FactionRevenueLine[] {
  const prosperity = burgId ? (Prosperity.getBurg(burgId)?.prosperity ?? 0.5) : 0.5;
  const spent = state.economy?.spent;
  const scale = 0.5 + prosperity;
  const court = Number(spent?.court ?? 0) * COURT_SHARE * scale;
  const administration = political ? Number(spent?.administration ?? 0) * ADMINISTRATION_SHARE * scale : 0;
  const lines: FactionRevenueLine[] = [
    { key: "court_patronage", label: political ? "Court patronage" : "Court & clergy patronage", daily: court }
  ];
  if (political) lines.push({ key: "admin_share", label: "Admin appropriation", daily: administration });
  return lines;
}

/** What adventuring guilds draw from charters and local frontier bounties */
function adventuringLines(state: State, burgId: number | undefined): FactionRevenueLine[] {
  const hostBurg = burgId ? pack.burgs?.[burgId] : undefined;
  const prosperity = burgId ? (Prosperity.getBurg(burgId)?.prosperity ?? 0.5) : 0.5;
  const charter = Number(state.economy?.spent?.administration ?? 0) * 0.03 * (0.5 + prosperity);
  const bounties = (hostBurg?.product ?? 0) * 0.08;
  return [
    { key: "guild_charters", label: "Guild charters", daily: charter },
    { key: "bounties", label: "Bounties & contracts", daily: bounties }
  ];
}

/** §5.1: a faction node's income from the upstream economy, net of the charter tithe it owes */
export function factionUpstreamIncome(faction: Faction, node: FactionHq | FactionOutpost): FactionUpstreamIncome {
  if (!canReadUpstreamEconomy() || !faction?.i) return NONE;

  const burgId = node.burgId;
  const hostStateId = burgId ? (pack.burgs?.[burgId]?.state ?? 0) : (pack.cells.state?.[node.cell] ?? 0);
  const state = pack.states?.[hostStateId];

  let lines: FactionRevenueLine[] = [];
  let influence = 0;
  if (hostStateId && state?.i && !state.removed) {
    switch (faction.category) {
      case "commercial":
        lines = commercialLines(faction, node, burgId);
        break;
      case "underworld":
        lines = underworldLines(state, node);
        break;
      case "martial":
        lines = martialLines(faction, hostStateId, burgId);
        break;
      case "religious":
      case "political":
        lines = courtLines(state, burgId, faction.category === "political");
        influence = Math.min(
          INFLUENCE_TOP,
          (Number(state.economy?.spent?.court ?? 0) + Number(state.economy?.spent?.administration ?? 0)) / 20
        );
        break;
      case "adventuring":
        lines = adventuringLines(state, burgId);
        break;
      default:
        break;
    }
  }

  const assetDaily = (node.assets ?? []).reduce((sum, aid) => sum + (getFactionAsset(aid)?.yields?.gold ?? 0), 0);
  if (assetDaily > 0) lines.push({ key: "asset_extraction", label: "Asset extraction", daily: assetDaily });
  if (!lines.length && (!hostStateId || !state?.i || state.removed)) return NONE;

  const dailyGross = lines.reduce((sum, line) => sum + line.daily, 0);
  const gold = dailyGross * SEASON_DAYS;
  const chartered = faction.allegiance === "chartered" || faction.allegiance === "state_arm";
  const charterTithe = chartered && gold > 0 ? gold * CHARTER_SHARE : 0;
  const hostProduct = burgId ? Number(pack.burgs?.[burgId]?.product ?? 0) : 0;

  return {
    gold: rn(gold - charterTithe, 2),
    charterTithe: rn(charterTithe, 2),
    patronStateId: charterTithe > 0 ? (faction.patronStateId ?? hostStateId) : 0,
    influence: rn(influence, 2),
    lines,
    hostProduct
  };
}

export const FACTION_EXPENSE_PROFILES: Record<FactionCategory, FactionBudget> = {
  commercial: { court: 10, administration: 18, infrastructure: 22, military: 18 },
  underworld: { court: 8, administration: 24, infrastructure: 12, military: 22 },
  martial: { court: 6, administration: 12, infrastructure: 12, military: 42 },
  religious: { court: 26, administration: 18, infrastructure: 14, military: 14 },
  political: { court: 22, administration: 26, infrastructure: 12, military: 16 },
  adventuring: { court: 8, administration: 16, infrastructure: 20, military: 28 }
};

export function defaultFactionBudget(category: FactionCategory): FactionBudget {
  return { ...(FACTION_EXPENSE_PROFILES[category] ?? FACTION_EXPENSE_PROFILES.commercial) };
}

export function factionBudgetFor(faction: Faction): FactionBudget {
  const fallback = defaultFactionBudget(faction.category);
  const custom = faction.budget;
  if (!custom) return fallback;
  return {
    court: Number.isFinite(custom.court) ? minmax(Math.round(custom.court), 0, 100) : fallback.court,
    administration: Number.isFinite(custom.administration)
      ? minmax(Math.round(custom.administration), 0, 100)
      : fallback.administration,
    infrastructure: Number.isFinite(custom.infrastructure)
      ? minmax(Math.round(custom.infrastructure), 0, 100)
      : fallback.infrastructure,
    military: Number.isFinite(custom.military) ? minmax(Math.round(custom.military), 0, 100) : fallback.military
  };
}

export const FACTION_EXPENSE_LABELS: Record<FactionExpenseBucket, string> = {
  court: "Court and patronage",
  administration: "Administration",
  infrastructure: "Infrastructure",
  military: "Military"
};

const FACTION_CORRUPTION_BASE: Record<FactionCategory, number> = {
  commercial: 10,
  underworld: 16,
  martial: 10,
  religious: 8,
  political: 12,
  adventuring: 8
};

/** Effective footprint weight driving daily upkeep needs across active HQ and outposts */
export function factionNodeScale(faction: Faction): number {
  let scale = 0;
  if (faction.hq && !faction.hq.pillaged) {
    const hqInf = minmax(faction.hq.influence ?? 70, 0, 100);
    scale += 1.5 * (0.5 + hqInf / 100);
  }
  for (const op of faction.outposts ?? []) {
    if (op.pillaged) continue;
    const inf = minmax(op.influence ?? 0, 0, 100);
    scale += 0.5 + inf / 100;
  }
  return rn(scale, 2);
}

export interface FactionNodePresenceImpact {
  goldDaily: number;
  stabilityDelta: number;
  presenceGoldDaily: number;
  presenceStabilityDelta: number;
  assetGoldDaily: number;
  assetStabilityDelta: number;
}

/** Combined local host impact (presence + local completed assets) for one active faction node */
export function factionNodeHostPresence(
  faction: Faction,
  node: FactionHq | FactionOutpost,
  isHq: boolean,
  factionProsperity = 0.5
): FactionNodePresenceImpact {
  if (node.pillaged) {
    return {
      goldDaily: 0,
      stabilityDelta: 0,
      presenceGoldDaily: 0,
      presenceStabilityDelta: 0,
      assetGoldDaily: 0,
      assetStabilityDelta: 0
    };
  }

  const defaultInf = isHq ? 70 : 35;
  const influence = minmax(node.influence ?? defaultInf, 0, 100);
  const weight = (influence / 100) * (isHq ? 1.35 : 1.0) * (0.5 + 0.5 * minmax(factionProsperity, 0, 1));

  const burg = node.burgId ? pack.burgs?.[node.burgId] : undefined;
  const hasBurg = Boolean(burg?.i && !burg.removed);
  const cell = hasBurg ? (burg!.cell ?? node.cell) : node.cell;
  const hostStateId = hasBurg ? (burg!.state ?? 0) : (pack.cells?.state?.[cell] ?? 0);
  const hasState = Boolean(hostStateId && pack.states?.[hostStateId] && !pack.states[hostStateId].removed);
  const relation = hostStateId ? faction.stateRelations?.[hostStateId] : undefined;

  let baseGold = 0;
  let baseStab = 0;
  if (hasState) {
    switch (faction.category) {
      case "commercial":
        baseGold = 2.5;
        baseStab =
          faction.allegiance === "chartered" || faction.allegiance === "state_arm" ? 3 : influence >= 70 ? -2 : 0;
        break;
      case "underworld":
        baseGold = -2.0;
        baseStab = -7;
        break;
      case "adventuring":
        baseGold = 1.0;
        baseStab = 5;
        break;
      case "religious":
        baseGold = -0.8;
        baseStab = faction.allegiance === "chartered" || faction.allegiance === "state_arm" ? 6 : -8;
        break;
      case "political":
        baseGold = -0.5;
        baseStab = relation === "Friendly" || relation === "Ally" ? 4 : -7;
        break;
      case "martial":
        baseGold = faction.allegiance === "hostile" ? -2.0 : 0;
        baseStab = relation === "Friendly" || relation === "Ally" ? 4 : faction.allegiance === "hostile" ? -9 : -4;
        break;
    }
  }

  const presenceGoldDaily = hasBurg ? rn(baseGold * weight, 2) : 0;
  const presenceStabilityDelta = hasState ? rn(baseStab * weight, 1) : 0;

  let assetGoldDaily = 0;
  let assetStabilityDelta = 0;
  for (const aid of node.assets ?? []) {
    const def = getFactionAsset(aid);
    if (!def?.burgImpact) continue;
    if (hasBurg && def.burgImpact.gold) assetGoldDaily += def.burgImpact.gold;
    if (hasState && def.burgImpact.stability) assetStabilityDelta += def.burgImpact.stability;
  }

  assetGoldDaily = rn(assetGoldDaily, 2);
  assetStabilityDelta = rn(assetStabilityDelta, 1);

  return {
    goldDaily: rn(presenceGoldDaily + assetGoldDaily, 2),
    stabilityDelta: rn(presenceStabilityDelta + assetStabilityDelta, 1),
    presenceGoldDaily,
    presenceStabilityDelta,
    assetGoldDaily,
    assetStabilityDelta
  };
}

/** Projected seasons to fund an asset cost from daily infrastructure revenue */
export function projectedAssetSeasons(cost: number, projectDaily: number): number | null {
  if (cost <= 0) return 1;
  if (projectDaily <= 0) return null;
  return Math.max(1, Math.ceil(cost / (projectDaily * SEASON_DAYS)));
}

/** Compute the daily state-style Revenue & Expenses breakdown for a faction. */
export function computeFactionEconomy(
  faction: Faction,
  nodeIncomes: FactionUpstreamIncome[],
  blockUpkeepSeasonal: number
): FactionEconomyBreakdown {
  const byKey = new Map<string, FactionRevenueLine>();
  let totalHostProduct = 0;
  let charterTitheSeasonal = 0;

  for (const inc of nodeIncomes) {
    totalHostProduct += inc.hostProduct;
    charterTitheSeasonal += inc.charterTithe;
    for (const line of inc.lines) {
      const existing = byKey.get(line.key);
      if (existing) existing.daily += line.daily;
      else byKey.set(line.key, { ...line });
    }
  }

  const revenueLines = [...byKey.values()].map(line => ({ ...line, daily: rn(line.daily, 2) }));
  const streamDaily = revenueLines.reduce((sum, line) => sum + line.daily, 0);
  const adjustmentsDaily = rn(
    (faction.adjustments ?? []).reduce((sum, line) => sum + (Number(line.value) || 0), 0),
    2
  );
  const collectedDaily = rn(streamDaily + adjustmentsDaily, 2);
  const revenueBase = Math.max(0, collectedDaily);
  const hostProductShare = totalHostProduct > 0 ? rn((collectedDaily / totalHostProduct) * 100, 1) : 0;

  const budget = factionBudgetFor(faction);
  const militaryBlockDaily = blockUpkeepSeasonal / SEASON_DAYS;
  const nodeScale = factionNodeScale(faction);

  const activeNodes: (FactionHq | FactionOutpost)[] = [];
  if (faction.hq && !faction.hq.pillaged) activeNodes.push(faction.hq);
  let activeOutposts = 0;
  for (const op of faction.outposts ?? []) {
    if (!op.pillaged) {
      activeNodes.push(op);
      activeOutposts += 1;
    }
  }
  let totalAssets = 0;
  let assetCostSum = 0;
  let hostProsperitySum = 0;
  let hostBurgCount = 0;
  const upstreamReadable = canReadUpstreamEconomy();
  for (const node of activeNodes) {
    for (const aid of node.assets ?? []) {
      totalAssets += 1;
      assetCostSum += getFactionAsset(aid)?.cost ?? 50;
    }
    if (upstreamReadable && node.burgId) {
      try {
        const burgProsperity = Prosperity.getBurg(node.burgId)?.prosperity;
        if (burgProsperity !== undefined && burgProsperity !== null) {
          hostProsperitySum += burgProsperity;
          hostBurgCount += 1;
        }
      } catch {
        // minimal maps without graph dimensions fall back to 0.5 host prosperity
      }
    }
  }
  const hostProsperity = hostBurgCount > 0 ? hostProsperitySum / hostBurgCount : 0.5;

  const requiredMap: Record<FactionExpenseBucket, number> = {
    administration: rn(0.45 * nodeScale + 0.25 * activeOutposts ** 1.2, 2),
    court: rn(
      (0.35 * nodeScale + 0.12 * totalAssets) *
        (faction.category === "religious" || faction.category === "political" ? 1.2 : 1),
      2
    ),
    infrastructure: rn(0.25 * nodeScale + assetCostSum * 0.003, 2),
    military: rn(Math.max(0.2 * nodeScale, militaryBlockDaily), 2)
  };

  let baseCorruption = FACTION_CORRUPTION_BASE[faction.category] ?? 10;
  if (faction.alignment === "lawful") baseCorruption -= 3;
  else if (faction.alignment === "chaotic" || faction.alignment === "evil") baseCorruption += 4;
  baseCorruption = minmax(baseCorruption, 4, 30);

  const adminAllocatedDaily = (revenueBase * budget.administration) / 100;
  const adminProvision =
    requiredMap.administration > 0 ? minmax(adminAllocatedDaily / requiredMap.administration, 0, 1) : 1;
  const corruptionRate = rn(minmax(baseCorruption * (1 - 0.5 * adminProvision), 2, 30), 1);
  const corruptionDaily = rn((revenueBase * corruptionRate) / 100, 2);
  const charterTitheDaily = rn(charterTitheSeasonal / SEASON_DAYS, 2);

  const buckets: FactionExpenseBucket[] = ["court", "administration", "infrastructure", "military"];
  const expenses: FactionExpenseLine[] = buckets.map(bucket => {
    const targetShare = budget[bucket];
    const baseDaily = (revenueBase * targetShare) / 100;
    const daily = bucket === "military" ? Math.max(baseDaily, militaryBlockDaily) : baseDaily;
    const share = revenueBase > 0 ? Math.round((daily / revenueBase) * 100) : daily > 0 ? 100 : 0;
    const requiredDaily = requiredMap[bucket];
    const effectiveDaily = bucket === "administration" ? daily : daily * (1 - corruptionRate / 100);
    const provision = requiredDaily > 0 ? minmax(effectiveDaily / requiredDaily, 0, 1) : 1;
    return {
      bucket,
      label: FACTION_EXPENSE_LABELS[bucket],
      share,
      targetShare,
      daily: rn(daily, 2),
      requiredDaily,
      effectiveDaily: rn(effectiveDaily, 2),
      provision: rn(provision, 3)
    };
  });

  const byBucket = Object.fromEntries(expenses.map(e => [e.bucket, e])) as Record<
    FactionExpenseBucket,
    FactionExpenseLine
  >;
  const infraLine = byBucket.infrastructure;
  const projectDaily = rn(infraLine.effectiveDaily * (0.4 + 0.6 * infraLine.provision), 2);
  const spentDaily = expenses.reduce((sum, e) => sum + e.daily, 0);
  const spentShare = expenses.reduce((sum, e) => sum + e.share, 0);
  const requiredTotalDaily = rn(
    requiredMap.court + requiredMap.administration + requiredMap.infrastructure + requiredMap.military,
    2
  );
  const dayBalance = rn(collectedDaily - spentDaily - corruptionDaily - charterTitheDaily, 2);
  const dayBalanceShare =
    collectedDaily > 0 ? Math.round((dayBalance / collectedDaily) * 100) : dayBalance < 0 ? -100 : 0;

  const prosperity = rn(
    minmax(
      0.2 +
        0.35 * byBucket.infrastructure.provision +
        0.25 * byBucket.administration.provision +
        0.2 * hostProsperity -
        0.2 * (corruptionRate / 30),
      0,
      1
    ),
    3
  );
  const solvency = dayBalance >= 0 ? 1 : -1;
  const stability = rn(
    minmax(
      0.3 +
        0.3 * byBucket.court.provision +
        0.15 * byBucket.administration.provision +
        0.15 * (2 * byBucket.military.provision - 1) +
        0.1 * solvency -
        0.2 * (corruptionRate / 30),
      0,
      1
    ),
    3
  );

  return {
    revenueLines,
    collectedDaily,
    adjustmentsDaily,
    projectDaily,
    hostProductShare,
    expenses,
    spentShare,
    nodeScale,
    requiredTotalDaily,
    corruptionRate,
    corruptionDaily,
    charterTitheDaily,
    dayBalance,
    dayBalanceShare,
    prosperity,
    stability
  };
}
