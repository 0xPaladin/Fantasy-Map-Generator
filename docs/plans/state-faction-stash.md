# Plan — State and Faction Stash (Patrimony)

**Status:** Slices 1–4 delivered.
**Goal:** Give states and factions a **stash** — a separate stock of accumulated patrimony: crown jewels, regalia, museums, commissioned art, relics and vaults of bullion. It is not a spending balance. It reflects how much wealth a culture or leader would keep rather than circulate, and it grows from the positive daily balance over a horizon set by that nature.

---

## 1. What exists today

| Piece | State | Faction |
|---|---|---|
| Daily flow | `state.economy.collected - pocketed - spent` (`Taxes.collect`) | `FactionEconomyBreakdown.dayBalance` (`living-faction-economy.ts`) |
| Liquid stock | `state.economy.treasury` — a day's net, used by the Living World for works and armies | `faction.treasury` — `dayBalance × SEASON_DAYS` banked each season |
| Traits | `pack.history.figures` ruler virtues/vices; `pack.cultures[].values` | leader virtues/vices; `faction.values`; `faction.alignment`; `faction.category` |
| Nature | `state.form` | `faction.category`, `faction.type`, `faction.allegiance` |

The treasury is the operating balance. A stash must be a second stock so it does not change what states and factions can spend day to day.

---

## 2. Locked decisions

1. **Soft stock, not a hard ledger.** Slice 1 does not move money out of the treasury. The stash is an appraisal of accumulated patrimony that converges toward a target derived from the positive daily surplus. This keeps the existing economy intact and matches “not spending balance”.
2. **One number.** Store `stash` as a number on `state.economy` and on `Faction`. Composition (bullion, art, regalia, relics) is derived later and is not serialized in slice 1.
3. **Positive balance only.** A negative day balance contributes nothing. The stash decays slowly in hard times instead of vanishing.
4. **Target, not infinite compounding.** A stable polity’s stash settles at `dailySurplus × 30 × hoardMonths`. This is “how many months of surplus the patrimony is worth”, not how long it takes to save it.
5. **Traits and culture bend the horizon.** Ruler/leader virtues and vices and the culture’s/faction’s values multiply the base months. Missing traits, dead rulers and old maps with no trait layer are neutral.
6. **Anarchy keeps no stash.** Neutral lands and removed polities are skipped.
7. **Lazy migration.** `stash` is optional. The first seasonal tick seeds it at `50%` of the current target; after that it grows by `25%` of the gap or decays by `5%`.
8. **Readouts in slice 2.** The number is stored and simulated first; slice 2 adds the cards, badges, overview columns, HUD chip and tooltips.

---

## 3. Formula

```ts
const dailySurplus = Math.max(0, dayBalance);
const target = dailySurplus * STASH_MONTH_DAYS * hoardMonths; // STASH_MONTH_DAYS = 30
const next =
  stash === undefined
    ? target * INITIAL_STASH_SHARE // 0.5
    : stash + (target - stash) * (target > stash ? 0.25 : 0.05);
```

- `hoardMonths` is clamped to `3..36` for positive base natures, and `0` for anarchy.
- A new realm takes roughly two years of seasons to approach a new target; a realm in decline keeps its treasures for much longer.
- The formula uses the flow, not `treasury`, so works, armies, audits and sack booty do not distort the target.

---

## 4. Nature tables

| Faction category | Base months |
|---|---:|
| commercial | 18 |
| underworld | 15 |
| religious | 15 |
| political | 12 |
| martial | 6 |
| adventuring | 6 |

| State form | Base months |
|---|---:|
| Monarchy | 18 |
| Theocracy | 18 |
| Republic | 12 |
| Union | 9 |
| Anarchy | 0 |
| unknown | 12 |

Trait and culture modifiers:

| Modifier | Change |
|---|---:|
| Avarice vice: `greedy`, `stingy`, `selfish`, `boastful`, `domineering`, `paranoid` | `+15%` each |
| Steward virtue: `thrifty`, `temperate`, `prudent`, `methodical`, `disciplined`, `meticulous` | `+10%` each |
| Open-hand virtue: `generous`, `charitable`, `selfless`, `compassionate`, `kind` | `−15%` each |
| Spendthrift vice: `wasteful`, `reckless`, `negligent`, `slothful`, `haphazard` | `−15%` each |
| Hoarding culture/faction value: `greed`, `control`, `power`, `subjugation` | `+10%` each |
| Generous culture/faction value: `generosity`, `empathy`, `cooperation`, `love` | `−10%` each |

The product is clamped to `0.5..1.75`, then multiplied by the base months and clamped to `3..36`.

Examples:

- Thrifty monarchy, daily surplus `80`, base `18 × 1.3 ≈ 23` months → target ≈ **55,000**.
- Greedy syndicate, daily surplus `8`, base `15 × 1.45 ≈ 22` months → target ≈ **5,300**.
- Spendthrift adventuring guild, daily surplus `4`, base `6 × 0.7 ≈ 4` months → target ≈ **500**.

---

## 5. Data model

- `state.economy.stash?: number` — accumulated patrimony, separate from `treasury`.
- `faction.stash?: number` — the same for a faction.
- No other stored fields: composition, loot and transfer are derived from the form/category and current stock.
- Saves without the field load unchanged; the first Living tick seeds it.

---

## 6. Slices

### Slice 1 — Formula, storage and seasonal update (delivered)

**Files:** `src/model/physical/living-stash.ts`, `src/model/physical/living-stash.test.ts`, `src/types/factions.ts`, `src/model/political/states-generator.ts`, `src/model/physical/living-generator.ts`, `src/model/physical/living-generator.test.ts`.

1. Pure `living-stash.ts`:
   - base months by faction category and state form;
   - `stashMultiplier()` from traits and values;
   - `stashMonths()`, `stashTarget()`, `advanceStash()`;
   - `stateDailySurplus()` and `stateStashTarget()` / `factionStashTarget()`.
2. Add optional `stash` to `StateFinance` and `Faction`.
3. Factions: update after `applyFactionTreasury` in `stepFactionEmpire`, using the same breakdown.
4. States: a new `stepStateStash()` after `stepEconomy` in `stepBackgroundSync`, using `collected - pocketed - spent`.
5. Skip neutrals, removed polities and maps without a readable upstream economy. Anarchy sets the stash to `0`.
6. Tests for the formula, trait/value modifiers, seeding, growth, decay and both hooks.

**Exit:** a state and a faction both grow a stash from a positive day balance; negative days do not grow it; old saves seed lazily; no UI changes.

### Slice 2 — Readouts

- State Economy dialog and faction Manage dialog: `Stash`, “≈ N months of surplus”, and a short nature label.
- Optional Stash columns in the States and Factions overviews; HUD state card.
- Tooltip explains that it is patrimony, not spending money.

**Delivery notes:** `living-stash.ts` now exposes `stateStashSummary`, `factionStashSummary`, `stateStashLabel` and `factionStashLabel`. The state Economy dialog gets a Stash card after Day Balance; the faction Manage dialog gets a ledger line with months and nature; the States and Factions overviews get hidden-by-default Stash columns; the HUD state card gets a stash chip. The labels are Royal collection, Temple treasure, Civic collection, Common treasury, Commercial reserves, Hidden vaults, Crown regalia, War chest and Relics and curios. Nothing is spendable yet.

### Slice 3 — Composition and events

- Derive `bullion / art / regalia / relics` from nature; use it for flavour and loot.
- Sack, pillage, faction ascension and state collapse transfer or destroy a share.
- A `museum` building shifts the art share upward; a future Crown Jewels work could add regalia.
- News dispatches for great hoards and famous collections.

**Delivery notes:** `StashSummary` now carries a `mix` and a `composition`; states split by form, factions by category, and a museum in the state capital moves ten points from bullion to art. `seizeStash` takes a share, the victor keeps half and the rest is lost. City captures take 10/20/30% on loot/sack/raze; razing a faction node takes 10% (outpost) or 25% (HQ); a faction's stash transfers to its new state on ascension; a fallen state leaves 35% of its remaining stash to its remnant faction. Crossing 24 or 36 months of surplus produces a hoard dispatch. UI tooltips show the four shares.

### Slice 4 — Prestige and temptation

- Derived `splendor = stash / max(1, annualSurplus)`.
- Small stability/influence bonus at high splendor; small corruption temptation.
- Optional explicit “sell treasures” action at a loss, never an automatic treasury refill.

**Delivery notes:** `StashSummary.splendor` is the stash divided by a year's daily surplus. A state gets a sim-owned `Patrimony` stability line of +1/+2/+3 points at half a year, a year and two years of splendor; a faction gains +1 influence a season at a year. `Corruption.effectiveBudget` adds up to 3 points of temptation. The state Economy dialog and faction Manage dialog both offer a confirmed **sell treasures** button: a quarter of the stash is sold for half its value, and the proceeds go to the treasury. No automatic liquidation.

---

## 7. Tests

- `living-stash.test.ts`: surplus, base months, multipliers, clamps, target, seed, growth, decay, anarchy/neutral, missing traits, labels, summaries, composition, museum shift, seizure, hoard labels, splendor, prestige effects and selling.
- `living-generator.test.ts`: a state seeds and then grows its stash across ticks; a faction seeds its stash after a seasonal economy step; city sack, faction-node pillage, ascension transfer, remnant inheritance, the Patrimony stability line and explicit sales.
- `states-editor.test.ts` / `factions-editor.test.ts`: the Stash column and Manage readout render, including a set value.
- `living-hud.test.ts`: the state card survives packs without an economy object (old mocks and saves).

---

## 8. Docs

- `docs/architecture/data-model.md`: `stash` on `StateFinance` and `Faction`; Living World written fields.
- `docs/domain/economy.md`: module table, “money exists only” note, Living World bridge paragraph.
- `docs/wiki/Economy.md`: Treasury/Patrimony paragraph and Living World economy bullet.
- `docs/wiki/Factions.md`: faction treasury bullet mentions the stash.
- `docs/wiki/Living-World.md`: “economy underneath” bullet.

---

## 9. Open decisions

- Keep the soft stock, or later add a hard ledger that diverts treasury?
- Should old maps always seed at 50%, or start at 0 and grow?
- Are the current splendor thresholds (+1/+2/+3 stability, +1 influence, up to +3 corruption) tuned right in play?
- Composition: derive it on demand, or store it once events can alter individual shares?
- Should war, rebellion or bankruptcy force a partial liquidation, or remain purely narrative?