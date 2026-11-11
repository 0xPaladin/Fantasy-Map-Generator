// Upstream-backed faction income (economy alignment §5.1): trade margins, graft,
// retainers and tithes read off the last economy run rather than abstract cell yields.

import { Corruption } from "@/model/economy/corruption";
import { Deals } from "@/model/economy/deals";
import { Prosperity } from "@/model/economy/prosperity";
import { Taxes } from "@/model/economy/taxes";
import { figureBias } from "@/model/physical/figure-bias";
import type { State } from "@/model/political/states-generator";
import type { Faction, FactionHq, FactionOutpost } from "@/types/factions";
import { rn } from "@/utils/number-utils";

export const SEASON_DAYS = 90; // a season of upstream daily flows, as the state and burg ledgers count it

/** What a faction node earns from the upstream economy in a season, before upkeep */
export interface FactionUpstreamIncome {
  gold: number;
  charterTithe: number; // the share paid to its patron state
  patronStateId: number; // 0 without a charter
  influence: number;
}

const NONE: FactionUpstreamIncome = { gold: 0, charterTithe: 0, patronStateId: 0, influence: 0 };

const COMMERCIAL_ASSETS = ["trade_depot", "counting_house", "grand_exchange", "bazaar", "harbor", "seaport", "bank"];
const COMMISSION_BASE = 0.05; // of the market's turnover, a faction's cut
const COMMISSION_PER_ASSET = 0.03;
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

/** The node's commercial cut of its host market and burg */
function commercialGold(faction: Faction, node: FactionHq | FactionOutpost, burgId: number | undefined): number {
  const hostBurg = burgId ? pack.burgs?.[burgId] : undefined;
  const marketId = Number(pack.cells.market?.[node.cell] ?? 0);
  const assets = [...(node.assets ?? []), ...(node.sim?.civBuildings ?? [])];
  const commerce = assets.filter(asset => COMMERCIAL_ASSETS.includes(asset)).length;
  const commission = Math.min(COMMISSION_TOP, COMMISSION_BASE + COMMISSION_PER_ASSET * commerce);
  const daily = (hostBurg?.product ?? 0) * PRODUCT_SHARE + marketTurnover(marketId, burgId) * commission;
  return daily * SEASON_DAYS * leaderIncomeFactor(faction);
}

/** What the underworld takes of official graft, and of the trade tariffs it helps avoid */
function underworldGold(state: State, node: FactionHq | FactionOutpost): number {
  const influence = Math.max(0, Math.min(100, node.influence ?? 50));
  const siphon = Math.min(SIPHON_TOP, SIPHON_BASE + (SIPHON_INFLUENCE * influence) / 100);
  const province = Corruption.ofCell(node.cell) ?? Corruption.ofCapital(state);
  const pocketed = Number(state.economy?.pocketed ?? 0) * (province?.share ?? 1);
  const tariffs = Taxes.getTaxesByState().tariffs[state.i] || 0;
  const embargo = (state.economy?.tariffs ?? []).some(rule => rule.rate === "embargo");
  const smuggling = tariffs * SMUGGLING_SHARE * (embargo ? EMBARGO_BONUS : 1);
  return (pocketed * siphon + smuggling) * SEASON_DAYS;
}

/** A mercenary retainer from a patron that keeps the company, nothing from one it raids instead */
function retainerGold(faction: Faction, stateId: number): number {
  const relation = faction.stateRelations?.[stateId];
  if (relation !== "Ally" && relation !== "Friendly") return 0;
  return Number(pack.states?.[stateId]?.economy?.spent?.military ?? 0) * RETAINER_SHARE * SEASON_DAYS;
}

/** What the temples and the chancery draw of the court's and the administration's spending */
function courtGold(state: State, burgId: number | undefined, political: boolean): number {
  const prosperity = burgId ? (Prosperity.getBurg(burgId)?.prosperity ?? 0.5) : 0.5;
  const spent = state.economy?.spent;
  const court = Number(spent?.court ?? 0) * COURT_SHARE;
  const administration = political ? Number(spent?.administration ?? 0) * ADMINISTRATION_SHARE : 0;
  return (court + administration) * (0.5 + prosperity) * SEASON_DAYS;
}

/** §5.1: a faction node's income from the upstream economy, net of the charter tithe it owes */
export function factionUpstreamIncome(faction: Faction, node: FactionHq | FactionOutpost): FactionUpstreamIncome {
  if (!canReadUpstreamEconomy() || !faction?.i) return NONE;

  const burgId = node.burgId;
  const hostStateId = burgId ? (pack.burgs?.[burgId]?.state ?? 0) : (pack.cells.state?.[node.cell] ?? 0);
  const state = pack.states?.[hostStateId];
  if (!hostStateId || !state?.i || state.removed) return NONE;

  let gold = 0;
  let influence = 0;
  switch (faction.category) {
    case "commercial":
      gold = commercialGold(faction, node, burgId);
      break;
    case "underworld":
      gold = underworldGold(state, node);
      break;
    case "martial":
      gold = retainerGold(faction, hostStateId);
      break;
    case "religious":
    case "political":
      gold = courtGold(state, burgId, faction.category === "political");
      influence = Math.min(
        INFLUENCE_TOP,
        (Number(state.economy?.spent?.court ?? 0) + Number(state.economy?.spent?.administration ?? 0)) / 20
      );
      break;
    default:
      break;
  }

  const chartered = faction.allegiance === "chartered" || faction.allegiance === "state_arm";
  const charterTithe = chartered && gold > 0 ? gold * CHARTER_SHARE : 0;
  return {
    gold: rn(gold - charterTithe, 2),
    charterTithe: rn(charterTithe, 2),
    patronStateId: charterTithe > 0 ? (faction.patronStateId ?? hostStateId) : 0,
    influence: rn(influence, 2)
  };
}
