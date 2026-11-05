# Battle Engine

The combined-arms battle engine resolves every Living World field battle and siege. It lives in
`src/model/battle/`, uses roster content from `src/data/rosters/`, and is driven by the seasonal
tick in `src/model/physical/living-generator.ts`.

## Units and army stacks

A regiment is an army of up to 20 `ArmyBlock`s (`{ type, hp, exp }`). Unit stats come from the
resolved roster (`src/data/roster-content.ts`):

```
unitPower = (attack + defense + charge / 2 + missile * 0.6) * expMult * fill
```

`MATCHUP` is a 6×6 category matrix applied to both sides, so composition matters:

- cavalry beats ranged (×1.3) and casters (×1.5);
- ranged punishes slow melee (×1.1) and monsters (×1.25);
- spears blunt cavalry (×0.8);
- casters punish dense melee (×1.25) and artillery (×1.2);
- monsters overrun melee (×1.3), artillery (×1.4) and casters (×1.4).

## Attrition

The engine blends Lanchester's linear law (melee frontage) with the square law (aimed fire).
Effective power is shared between the sides and converted into a per-round loss rate:

```ts
const aEff = effectivePower(attackerUnits, defenderUnits, attackerMult, types);
const dEff = effectivePower(defenderUnits, attackerUnits, defenderMult, types);
const totalEff = aEff + dEff;

const aLossRate = Math.min(0.45, (dEff / totalEff) * pressure);
const dLossRate = Math.min(0.45, (aEff / totalEff) * pressure);
```

An army breaks when it falls below `routThreshold` (25% by default, raised by enemy `terror`), so
a decisive winner usually routs the loser instead of annihilating it.

### Lanchester background

The engine sits between Lanchester's two classical laws:

- **Linear law** (limited frontage, melee, unaimed area fire): casualties scale with the fighting
  line, `dB/dt = -k_R · R · B`, so combat power is proportional to `N`.
- **Square law** (aimed fire, concentration of fire): `dB/dt = -a · R`, with the invariant
  `b(B₀² − B²) = a(R₀² − R²)`, so combat power is proportional to `N²`.

Melee categories lean linear, ranged and artillery lean square, and `MATCHUP` shifts the effective
mix; walls, river crossings and entrenchment compress the attacker's usable frontage.

## Modifiers

`BattleModifiers` (`src/model/battle/battle.ts`) carries the strategic situation into the fight:

| Modifier | Effect |
|---|---|
| walls | +30% defender per fortification tier (reduced by `arcaneSiege`) |
| encamp / fortify | +10% defender |
| ambush | +30% attacker on contact |
| river crossing | +15% defender; drains the attacker's remaining movement |
| terrain | +25% defender on hill / forest / jungle / marsh |

Stances feed these values (`src/model/physical/living-generator.ts`): **march** grants ×1.5
movement but cannot open a battle, **encamp/ambush** grant ×0.7 movement, and a war army resting
in the open outside its own land conceals itself for an ambush.

## Magic

Magic bends the attrition rate rather than adding headcount:

- `ward` / `hex` scale the loss fraction, clamped to `[0.02, 0.50]`;
- `heal` restores casualties up to each unit's battle-start strength;
- `arcaneSiege` cancels wall tiers before combat;
- `resistArcane` dampens enemy `ward`, `hex` and `terror`.

## Where it is used

- `src/model/physical/living-generator.ts` — seasonal battles, sieges and capture policies.
- `src/controllers/political/military/battle-screen.ts` — steppable, round-by-round simulator.
- `src/data/battle-config.ts` — tunable constants and defaults.
- `src/data/rosters/*.json` — shipped faction rosters.

## Further reading

- Army model and economy: [`docs/plans/living-openciv-armies.md`](../plans/living-openciv-armies.md)
- Seasonal simulation: [`docs/plans/living-world.md`](../plans/living-world.md)
- Living World player guide: [`Living-World.md`](Living-World.md)
