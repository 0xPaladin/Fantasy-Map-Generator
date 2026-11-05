# Plan — Characters: One Roster for People, Heroes & Historical Figures

**Updated:** 2026-11-05  
**Status:** In progress — Phases 1-6 implemented  
**Companions:** [factions.md](factions.md), [unified-figures.md](unified-figures.md), [culture-traits.md](culture-traits.md), [hero-diversity.md](hero-diversity.md), [living-world.md](living-world.md)  
**Supersedes:** the character-stat portions of [unified-figures.md](unified-figures.md) and [hero-diversity.md](hero-diversity.md); `GuildState` as the home of hero stats.

---

## 1. Executive Summary

Characters become a first-class FMG primitive: one registry of people, one standard table editor, one map layer, and one hero sheet for the few people who need dice.

The design has three layers:

> **Characters are the people. Factions own organizations and assets. Heroes own dice.**

- `pack.history.figures` stays the single registry. There is no new `pack.characters` and no new save record.
- Every person is a **background character** by default: name, culture, birth/death, roles, alignment, virtues/vices, location, relationships.
- A character may also be a **hero**. Only heroes get the full sheet: four attributes, twelve action dice, abilities, condition, progression.
- M/W/S/C disappears from characters. It is replaced by the compact hero sheet, not by another skill list.
- `GuildState` is stubbed and abandoned. Factions already own membership, treasury, HQ, missions, and relics; the guild retires into them.
- Conquest remains a stub. It is not migrated in this plan.
- Checks exist only for heroic missions. Troubles, building, and economy move to progress, not dice; that conversion is a separate effort.
- Renown is not added to characters. Standing uses the same relationship-matrix shape as factions.

### Locked-In Decisions

| # | Decision |
|---|---|
| 1 | **Storage:** `pack.history.figures` remains the registry; `Characters` is a facade over it. No new pack key, no new `.map` record. |
| 2 | **Two tiers:** background characters and heroes. Only heroes carry the full sheet. |
| 3 | **Attributes:** `might`, `agility`, `wits`, `presence`, each rated `-1 .. +2`. Each point is a flat `+1` bonus. |
| 4 | **Actions:** one shared list of twelve actions. Each hero rates each action as a die: `d4`, `d6`, `d8`, `d10`, `d12`. |
| 5 | **Advantage/Disadvantage:** roll two action dice, take the best/worst. Do not use die stepping for advantage. |
| 6 | **Benchmarks:** a competent hero is `2d10, 2d8, 2d6` (the remaining actions are `d4`). Starting heroes are below that. |
| 7 | **M/W/S/C:** killed on characters now. State/faction capacity and conquest economy are out of scope for this plan. |
| 8 | **Renown:** not added to characters. Characters use a faction-style relationship matrix; renown/influence retirement belongs to the faction effort. |
| 9 | **Guild:** stubbed, not improved. Factions own organizations. The guild stub is removed with the faction work. |
| 10 | **Conquest:** stubbed. No migration or stat work in this plan. |
| 11 | **Checks:** `actionCheck` is used by heroic missions only. Troubles and construction use progress. |
| 12 | **Manual/locked characters** survive history regeneration. |
| 13 | **Layer:** the Characters layer auto-enables when the editor opens; otherwise it is optional and off by default. |
| 14 | **Faction ranks:** keep it simple. `leaderId`, `memberIds`, `candidateIds` are enough for now. |

### What this plan does not do

- It does not implement the Civ capacity/upkeep economy or remove capacity from `StatePolitySim`.
- It does not roll conquest into Living/Civ.
- It does not convert troubles or building to progress.
- It does not delete `GuildState`; it only stops writing hero state there and migrates what exists.
- It does not redesign factions, renown, influence, or the relationship matrix beyond the character side.
- It does not add family trees, grudges, or full RPG inventory/ability catalogues. Those are follow-ups.

### Progress

- [x] **Phase 1 — Types, action catalogue, hero sheet** (2026-11-05)
- [x] **Phase 2 - Characters facade and lifecycle** (2026-11-05)
- [x] **Phase 3 - Serialization and legacy migration** (2026-11-05)
- [x] **Phase 4 - Generators and manual preservation** (2026-11-05)
- [x] **Phase 5 - Hero checks and missions** (2026-11-05)
- [x] **Phase 6 - Characters editor** (2026-11-05)
- [ ] Phase 7 — Layer, map entity, omnibar, tool button
- [ ] Phase 8 — Docs, glossary, cleanup

---

## 2. Current State

| Concern | Current home | Problem |
|---|---|---|
| Person identity, birth/death, culture | `HistoricalFigure` in `src/types/history.ts`; `pack.history.figures` | Generated only; no create/edit/delete API |
| Dated roles | `HistoricalRole[]` | Good; keep |
| Alignment, virtues, vices | `src/data/culture-traits.ts` | Good; keep and make traits matter on checks |
| Hero build | `archetype`, `disciplines`, `skills {m,w,s,c}`, `xp`, `progression` on the figure | M/W/S/C is the wrong stat block; disciplines are a second skill list |
| Hero condition | `GuildState.heroes[figureId] = HeroGuildState` in `src/types/living.ts` | Second store; owned by the guild, not the character |
| Guild | `GuildState` in `src/types/living.ts`; `src/model/physical/living-guild.ts` | Shadow copy of an `adventurer_guild` faction, synchronized field by field |
| Conquest agent | Separate `Character` overlay in `src/conquest/` | Third store; out of scope, remains a stub |
| Mission checks | `MissionPhase.pool`, `ActiveGuildMission.pool` (`m/w/s/c`) | Must become action checks |
| Read-only viewing | Legends browser in `src/controllers/history-overview.ts` | No editing, no creation |
| Map layer | No character layer | Planned as "Figures" in `unified-figures.md` |
| Omnibar / map entity | `src/model/map-entities.ts` has `faction`, no `character` | Missing |
| Editor / tool button | None | Missing |
| Save | History JSON is record **55**; snapshots start at **56** | New fields must stay inside the history JSON to avoid renumbering |

`living-guild.ts` already contains `getPlayerFaction()`, `setPlayerFaction()`, and `syncPlayerFaction()`, and it writes `guild.roster` ↔ `faction.memberIds`, `guild.gold` ↔ `faction.treasury`, `guild.renown` ↔ `faction.influence`. That bridge is the seam to finish, not a new subsystem.

---

## 3. Target Model

### 3.1 One registry, two tiers

`pack.history.figures` remains the array. The type name `HistoricalFigure` remains for compatibility; new code refers to it as `Character`.

```ts
// src/types/history.ts
export interface Character {
  // identity
  i: number;
  name: string;
  culture: number;
  birth: number;
  death?: number;
  gender?: string;
  portrait?: string;
  tags?: string[];
  note?: string;
  manual?: boolean;     // authored by the user
  lock?: boolean;       // generated, but protected from regeneration
  removed?: boolean;    // soft delete; ids are never reused
  seedKey?: string;     // deterministic anchor for generated rolls

  // chronicle
  roles: HistoricalRole[];
  alignment?: Alignment;
  virtues?: string[];
  vices?: string[];
  cell?: number;
  captor?: number;      // state id holding the character prisoner
  relations?: CharacterRelations;

  // hero only
  hero?: HeroSheet;
}

/** Compatibility alias while call sites migrate. */
export type HistoricalFigure = Character;
```

Rules:

- **No `skills` on `Character`.** No `renown`, no `factionId`, no `alive`.
- **Legacy fields stay out of the public type.** `skills`, top-level `archetype`, `disciplines`, and `progression` are read through a `LegacyFigure` shape in the migration module, never on `Character`.
- **Status is derived:** `dead` if `death`, `captive` if `captor`, `active` if an open role or faction membership exists, otherwise `retired`.
- **Faction membership is derived from the faction:** `memberIds` and `candidateIds` are the source of truth. A character does not store a faction field.
- **Roles remain `HistoricalRole[]`.** No rename; roles already support state, culture, and faction targets through `HistRef`.
- **`HistRefKind = "figure"` stays.** Document that it means character. Renaming it would touch every event.

### 3.2 Hero sheet

```ts
// src/types/history.ts
export interface HeroSheet {
  archetype?: HeroArchetypeId;   // starting-package label, not a permanent class
  attributes: CharacterAttributes;
  actions: Record<ActionId, Die>;
  abilities?: string[];
  inventory?: string[];
  xp: number;
  progression?: HeroProgression;
  condition?: HeroCondition;
  doctrine?: HeroDoctrine;
  temperament?: HeroTemperament;
  cooldownUntil?: number;
}

export interface CharacterAttributes {
  might: number;     // -1 .. +2
  agility: number;   // -1 .. +2
  wits: number;      // -1 .. +2
  presence: number;  // -1 .. +2
}

export interface HeroCondition {
  resolve: number;
  stamina: number;
  maxResolve: number;
  maxStamina: number;
  injuries: HeroInjury[];
  downUntilTick?: number;
  push?: boolean;
}
```

`HeroCondition` absorbs `HeroGuildState`. `HeroGuildState` remains only as a deprecated legacy shape for old saves.

### 3.3 The twelve actions

Every hero has the same twelve actions. What differs is the die rating.

| Action | Default attribute | Covers |
|---|---|---|
| **Strike** | Might | attack, shoot, break |
| **Guard** | Might | defend, hold, shield |
| **Maneuver** | Agility | charge, reposition, retreat |
| **Scout** | Agility | recon, track, stealth |
| **Infiltrate** | Agility | intrusion, disguise, bypass |
| **Survive** | Wits | wilderness, endurance, forage |
| **Investigate** | Wits | clues, research, search |
| **Craft** | Wits | build, repair, sabotage |
| **Treat** | Wits | heal, diagnose, soothe |
| **Persuade** | Presence | bargain, negotiate, inspire |
| **Deceive** | Presence | lie, bluff, misdirect |
| **Command** | Presence | order, lead, intimidate |

The catalogue lives in `src/data/character-actions.ts`:

```ts
export const DICE = ["d4", "d6", "d8", "d10", "d12"] as const;
export type Die = (typeof DICE)[number];

export const ACTIONS = [
  "strike", "guard", "maneuver",
  "scout", "infiltrate", "survive",
  "investigate", "craft", "treat",
  "persuade", "deceive", "command"
] as const;
export type ActionId = (typeof ACTIONS)[number];

export interface ActionDef {
  id: ActionId;
  label: string;
  attribute: keyof CharacterAttributes;
  tags: readonly MissionTag[];
}

export const ACTION_DEFS: Record<ActionId, ActionDef>;
```

If magic is central to the setting, swap `survive` for `channel` in a later data change; the engine only needs a closed `ActionId` union.

### 3.4 Dice, attributes, and benchmarks

**Die ladder:** `d4 → d6 → d8 → d10 → d12`.

- `d4` untrained
- `d6` competent
- `d8` trained
- `d10` expert
- `d12` master

**Benchmarks:**

| Tier | Action dice | Attributes |
|---|---|---|
| **Starting hero** | `1d10, 1d8, 2d6, 8d4` | one `+2`, one `+1`, one `0`, one `-1` |
| **Competent hero** | `2d10, 2d8, 2d6, 6d4` | one `+2`, two `+1`, one `0` |
| **Veteran** | `3d10, 3d8, 3d6, 3d4` | two `+2`, one `+1`, one `0` |

A background character has no dice. If a background character must act personally, use a single `competence` die (`d4–d8`) or resolve it through the faction's assets/tech and role fit. Do not give background characters the twelve-action sheet.

### 3.5 Checks

```ts
export interface ActionCheck {
  action: ActionId;
  dc?: number;             // absent for an opposed contest
  advantage?: boolean;
  disadvantage?: boolean;
  modifiers?: number;      // traits, gear, faction context
}

export interface ActionCheckResult {
  die: Die;
  roll: number;            // chosen die face
  total: number;
  critical: boolean;
  complication: boolean;
  success?: boolean;
}
```

Resolution:

- Normal: roll one action die, add the action's default attribute, add modifiers.
- Advantage: roll two action dice, take the best.
- Disadvantage: roll two action dice, take the worst.
- `critical` when the chosen die shows its maximum.
- `complication` when the chosen die shows `1`.
- With advantage, a `1` only happens if both dice show `1`; with disadvantage, a critical only happens if both dice show their maximum.
- DC ladder for missions: easy `4`, standard `6`, hard `8`, extreme `10`. Contests compare totals.
- Relevant virtue: `+1` or advantage at the table's discretion. Relevant vice: `-1` or disadvantage.
- Relevant relic, gear, or faction asset/tech: `+1`, or it unlocks the attempt.
- Helpers: `+1` each, capped at `+2`.

`actionCheck` belongs in `src/data/character-actions.ts`. Only heroic mission resolution calls it in this plan.

### 3.6 Progression

- XP and level keep the existing shape (`40 + 20 × level`).
- Each level: step one action die up, capped at `d12`.
- Every third level: gain one **ability** — a named trick tied to an action.
- Every fourth level: raise one attribute by `+1`, capped at `+2`.
- `archetype` is a starting package: it seeds initial dice, one ability, and flavour. It is not a permanent class.
- `disciplines` retire as a separate mechanical list. Fold the useful ones into abilities or tags.
- `HeroProgression.pendingChoices` remains the "unspent die step / ability" counter. `picks` records the chosen action or ability.

### 3.7 Relationships

No `renown`. Standing uses the same relation tiers as factions.

```ts
// src/types/history.ts
import type { FactionRelation } from "@/types/factions";

export interface CharacterRelations {
  characters?: Record<number, FactionRelation>;
  factions?: Record<number, FactionRelation>;
  states?: Record<number, FactionRelation>;
}
```

This mirrors `Faction.stateRelations` and `Faction.factionRelations` and keeps the eventual retirement of `influence`/renown consistent.

- `captor` stays a dedicated field because captivity is a hard status and pauses roles.
- Personal bonds (family, mentor, ward) are a later addition. Do not overload the relation matrix with them in this plan.
- Grudges (`FigureGrudge`) remain a follow-up. The relation matrix covers standing; it does not cover feud weight or decay.

### 3.8 Status and membership

Derived helpers in `Characters`:

```ts
type CharacterStatus = "active" | "dead" | "captive" | "retired";

Characters.status(character): CharacterStatus;
Characters.factionsOf(id): Faction[];
Characters.isCandidate(id, factionId): boolean;
```

- `dead`: `death !== undefined`.
- `captive`: `captor !== undefined`.
- `active`: at least one open role (`to === undefined`) or membership in a non-removed faction.
- `retired`: alive, free, but no open role and no membership.

Faction membership stays on `Faction.memberIds` / `candidateIds`. The Characters editor derives the faction column; it never writes a duplicate field.

---

## 4. Retiring M/W/S/C on Characters

### 4.1 Removed from characters

- `FigureSkills { m, w, s, c }` is removed.
- `HeroPool = "m" | "w" | "s" | "c"` is removed from character-facing code.
- `HeroArchetypeDef.primaryPool`, `secondaryPool`, `baseSkills`, and `growthOrder` are replaced by action dice and `growthOrder: ActionId[]`.
- `HeroPathDef.pool` becomes `action?: ActionId`; `HeroPathDef.discipline` becomes `ability?: string`.
- Mission types lose `pool` and gain `action`:

```ts
// src/types/living.ts
export interface MissionPhase {
  id: string;
  label: string;
  action: ActionId;
  tags: MissionTag[];
  dc: number;
  required: boolean;
}

export interface ActiveGuildMission {
  // ...
  action: ActionId;
  // ...
}
```

`ActiveGuildMission` is legacy guild-stub shape, but its check surface must be action-based for as long as it exists.

### 4.2 Legacy skill conversion

Old saves carry `skills {m,w,s,c}`. Migrate deterministically:

```ts
function dieForRating(rating: number): Die {
  if (rating <= 0) return "d4";
  if (rating === 1) return "d6";
  if (rating === 2) return "d8";
  if (rating === 3) return "d10";
  return "d12";
}

function attributesFromSkills(s: { m: number; w: number; s: number; c: number }): CharacterAttributes {
  return {
    might: clamp(s.m - 1, -1, 2),
    agility: clamp(s.c - 1, -1, 2),
    wits: clamp(s.w - 1, -1, 2),
    presence: clamp(s.s - 1, -1, 2)
  };
}
```

Action dice map by pool family:

| Legacy pool | Actions |
|---|---|
| `m` | Strike, Guard, Maneuver |
| `w` | Investigate, Craft, Treat |
| `s` | Command, Persuade, Deceive |
| `c` | Scout, Infiltrate, Survive |

Old `disciplines` become `abilities` labels. Old `progression.picks` are cleared; pending choices remain as unspent steps.

### 4.3 Temporary compatibility

The following legacy code may keep a deprecated `HeroPool` until the guild stub is deleted, but it must not feed new character sheets:

- `src/data/guild-operations.ts` checks.
- `src/model/physical/living-guild.ts` operator scoring.
- `resolveTrouble()` in the Living simulation.

For those paths, use a deterministic adapter:

| Legacy pool | Default action |
|---|---|
| `m` | Strike |
| `w` | Investigate |
| `s` | Command |
| `c` | Scout |

The adapter is marked `@deprecated` and removed with the guild/trouble work.

### 4.4 Explicitly out of scope

- `StatePolitySim` capacity and court load.
- Unit capacity costs and `UNIT_ROLE_POOLS`.
- Asset yields/upkeep and Civ construction.
- Conquest capacity and economy.
- Trouble progress conversion.

---

## 5. Guild and Conquest Stubs

### 5.1 Guild

The guild is not improved in this plan.

- `GuildState` and `LivingWorldState.guild` remain for old saves but are marked `@deprecated`.
- `GuildState.heroes` is read once during migration into `Character.hero.condition`; new code does not write it.
- `living-guild.ts` remains as a compatibility shim. Do not add features to it.
- `Characters` never requires a guild. A hero can exist with no faction, no guild, and no mission.
- The Faction fields already cover the guild: `treasury`, `influence`, `tier`, `hq`, `outposts`, `memberIds`, `candidateIds`, `leaderId`, `missions`, `relics`, `doctrine`, `seasonsActive`, `stateRelations`, `patronStateId`.
- Keep ranks simple: `leaderId` + `memberIds` + `candidateIds`. No officer model in this plan.

Migration reference, for when the faction work deletes the stub:

| `GuildState` | Faction destination |
|---|---|
| `tier` | `faction.tier` |
| `gold` | `faction.treasury` |
| `renown` | `faction.influence` (legacy only; the faction effort retires it) |
| `ageCount` | `faction.seasonsActive` |
| `hqBurgId` | `faction.hq.burgId` + `hq.cell` |
| `chapterBurgIds` | `faction.outposts` |
| `roster` | `faction.memberIds` |
| `candidates` | `faction.candidateIds` |
| `missions` | `faction.missions` |
| `relics` | `faction.relics` |
| `doctrine` | `faction.doctrine` |
| `favoredStateId` | `faction.patronStateId` / `stateRelations` |
| `heroes` | `Character.hero.condition` |
| `cooldowns` | `Character.hero.cooldownUntil` |
| `popups` | `LivingWorldState.popups` (world-owned) |
| `excavatedMarkers` | the marker, or a faction field |
| `legacyTier` | `faction.legacyTier` |
| `sandboxGodMode` | a Living setting |

### 5.2 Conquest

- The conquest `Character` overlay stays as-is.
- Do not migrate it, do not add `figureId`, do not touch its `{combat, campaign, economy}` skills.
- Mark the overlay `@deprecated` in comments only where it already says it is a stub.
- The eventual conquest roll-in is a separate plan.

---

## 6. Storage, Serialization & Migration

### 6.1 Storage

- Characters stay inside `pack.history.figures`, which serializes as part of history record **55**.
- Do **not** insert a new record before the epoch snapshots. That would require renumbering `HISTORY_RECORD` and `FIRST_SNAPSHOT_RECORD` and a migration.
- All new fields are additive and optional.
- `history.figures` is lazily initialized by `Characters.ensureRegistry()`.

### 6.2 Migration on load

1. **Backfill `seedKey`** for figures without one: `figure:${i}`.
2. **Figure skills → hero sheet** when `skills`, `archetype`, `disciplines`, or `progression` exist; read them through `LegacyFigure` in `src/services/io/characters-migration.ts`.
3. **`GuildState.heroes` → `hero.condition`** for any figure id present in the guild hero map.
4. **`GuildState.cooldowns` → `hero.cooldownUntil`**.
5. Do not synthesize `renown`.
6. Leave legacy fields in place for one release; new writes use only the new shape. Remove the readers when the guild stub is deleted.

### 6.3 Manual and locked characters

- `manual: true` means the user authored the character. `lock: true` means a generated character is protected.
- On history regeneration, preserve every `manual || lock` figure and its id.
- Allocate new generated ids from `max(i) + 1`, never `array.length`.
- Never reuse the id of a `removed` character. Keep the tombstone.
- Preserve events that reference preserved figures. Generated figures and their events may be rebuilt.

### 6.4 Save tests

- New character with hero sheet round-trips through `.map` save/load byte-for-byte.
- Old figure with `skills` loads with a valid hero sheet and no `skills` on new writes.
- Old guild hero state loads into `hero.condition`.
- Removed characters survive a save/load and stay hidden from `active()`.
- Record 55 / 56 layout is unchanged.

---

## 7. Characters Model & Lifecycle

New module: `src/model/society/characters.ts`.

```ts
export interface NewCharacter {
  name?: string;            // generated from culture when absent
  culture: number;
  birth?: number;
  death?: number;
  gender?: string;
  role?: HistoricalRole;
  alignment?: Alignment;
  virtues?: string[];
  vices?: string[];
  cell?: number;
  hero?: boolean;
  archetype?: HeroArchetypeId;
  manual?: boolean;
  lock?: boolean;
  tags?: string[];
  note?: string;
}

export const Characters = {
  all(): Character[],
  active(): Character[],
  get(id: number): Character | undefined,
  add(input: NewCharacter): Character,
  update(id: number, patch: Partial<Character>): Character | undefined,
  remove(id: number): boolean,
  restore(id: number): boolean,
  promoteToHero(id: number, archetype?: HeroArchetypeId): Character | undefined,
  nextId(): number,
  ensureRegistry(): Character[],
  status(character: Character): CharacterStatus,
  factionsOf(characterId: number): Faction[],
  isCandidate(characterId: number, factionId: number): boolean,
  joinFaction(characterId: number, factionId: number): boolean,
  leaveFaction(characterId: number, factionId: number): boolean
};
```

Lifecycle rules:

- `add` validates culture, allocates `nextId()`, and generates a name from `Names.getCulture(culture)` when absent.
- `remove` sets `removed = true`, removes the id from every faction's `memberIds` and `candidateIds`, and closes open roles. It does not delete events.
- `restore` clears `removed` but does not re-add memberships automatically.
- `promoteToHero` seeds a hero sheet from the archetype (or a default package), keeps identity, roles, and traits, and sets `manual` unchanged.
- `joinFaction` appends to `memberIds` and removes from `candidateIds`. `leaveFaction` does the inverse. No duplicate ids.
- All writes go through `Characters`; generators and the editor do not push directly to `pack.history.figures`.

Expose `FMG.Characters` in `src/app/fmg.ts`, like `FMG.Factions`.

---

## 8. Generators

### 8.1 History generator

`src/model/physical/history-generator.ts` currently does `figures.push(...)` and seeds traits from `figureTraits(index, culture)`.

Change:

- Mint through `Characters.add`.
- Seed traits from `traitsRng(seed, "figure", seedKey)` (extend `traitsRng` to accept `number | string`).
- Use `Characters.nextId()` for `i`.
- Preserve `manual || lock` figures at the start of regeneration.
- Do not overwrite preserved figures' traits, names, or hero sheets.

### 8.2 Living heroes

`src/model/physical/living-heroes.ts` currently mints candidates directly into `history.figures` and stores vitals in `GuildState.heroes`.

Change:

- `mintCandidate` calls `Characters.add({ hero: true, archetype })`.
- `ensureHeroGuildState` becomes `ensureHeroSheet`, writing only `character.hero.condition`.
- `getHeroState` reads `character.hero.condition`.
- `applyHeroLevels` spends levels on action dice or abilities, not `skills`.
- `chooseHeroPath` grants an ability or a die step.
- `recoverHeroes` writes to `character.hero.condition`, not `guild.heroes`.
- `commanderFor` reads the hero sheet.
- The guild roster remains a legacy list until the faction work; do not add new guild coupling.

### 8.3 Determinism

- Same seed + same registry → same generated characters.
- Generated traits, names, archetypes, and starting dice use `traitsRng` or a character-scoped `createRng`.
- Manual characters never take randomness unless the user asks to roll.
- `seedKey` is stored and stable.

---

## 9. Editor

New controller: `src/controllers/society/characters-editor.ts`.

Register it in `src/controllers/index.ts`:

```ts
CharactersEditor: () => import("@/controllers/society/characters-editor").then(m => m.CharactersEditor)
```

### 9.1 Table

Columns:

1. Name
2. Culture
3. Status (`active`, `dead`, `captive`, `retired`)
4. Age (derived from the map year and `birth`; `death` closes it)
5. Current role (open role span)
6. Faction (derived from `memberIds` / `candidateIds`)
7. Hero (badge + level)
8. Tags

Filters:

- All / Heroes / Background
- Alive / Dead / Captive
- Faction
- Role
- Culture
- Manual only
- Show removed

Actions:

- Add character
- Edit
- Soft delete
- Restore (when showing removed)
- Focus on map
- Open in Legends

### 9.2 Detail dialog

Tabs:

1. **Identity** — name, culture, birth/death, gender, portrait, tags, notes, manual/lock.
2. **Roles** — dated role spans; add/close/edit.
3. **Traits** — alignment, virtues, vices.
4. **Hero** — only when `hero` exists:
   - four attribute steppers (`-1 .. +2`);
   - the twelve actions as a 3×4 or 2×6 grid of die selects;
   - abilities as chips;
   - inventory as a simple list;
   - condition read-only, with a god-mode reset;
   - XP, level, progression, cooldown.
5. **Relations** — matrix rows for characters, factions, and states; relation select per row; add/remove.
6. **Notes / links** — free text and "appears in" counts for events, roles, factions, missions, relics.

### 9.3 Add dialog

Two modes:

- **Background character:** name, culture, birth, role, target, alignment. No hero sheet.
- **Hero:** the same, plus archetype and a preview of the starting dice/attributes.

The user can also promote an existing background character to hero from the row menu.

### 9.4 CSV

- Reuse the Factions CSV pattern.
- Export all characters, including hero columns.
- Action columns use `d4`…`d12`; attributes are integers.
- Import validates dice values, culture ids, and role targets; invalid rows are reported, not silently dropped.
- Hero columns are blank for background characters.

### 9.5 Guild UI

Do not add guild UI. The editor reads faction membership; if the guild stub still exists, it is just another adventuring faction. The eventual faction UI owns the roster view.

---

## 10. Map & Tool Integration

### 10.1 Layer

- New `src/renderers/draw-characters.ts`.
- `src/renderers/layers.ts` entry `characters`, group `#characters`.
- Draw characters with a `cell`: background characters with a small role icon; heroes with a distinct hero marker.
- Click opens the character detail dialog or focuses the editor row.
- Layer default: off. The editor enables it on open; the user may toggle it off.
- Idempotent redraw: same state → same DOM.

### 10.2 Map entity

In `src/model/map-entities.ts`:

- Add `"character"` to `ENTITY_TYPES`.
- Add the `#characters` selector.
- Add a `character` entity definition with `name`, `refs`, `focus`, `subtitle` (role • status).
- Accept `figure` as a legacy alias for old notes and refs.

### 10.3 Omnibar

Search by name, culture, role, faction, tag, and hero/background. Selecting a result focuses the character and opens the detail card.

### 10.4 Tool button and command

- `src/app/map-commands.ts`: add `editCharactersButton` with `run: () => Controllers.CharactersEditor.open()`.
- `src/app/chrome/tabs/tools-tab.ts`: add a **Characters** button next to Factions.
- `src/app/hotkeys.ts`: add `Shift+I` (`KeyI` is free; `Shift+F` is Features, `Shift+C` is Cultures, `Shift+M` is Military).
- Optional regenerate command: none in this plan. History regeneration already owns generated characters.

### 10.5 Legends

Extend `src/controllers/history-overview.ts` so figure rows link to the character detail and show:

- hero badge and level;
- action dice summary (top three actions);
- relationship summary;
- status and faction.

Keep the existing trait rendering.

---

## 11. Phases

### Phase 1 — Types, Action Catalogue, Hero Sheet ✅

**Status:** Implemented 2026-11-05.  
**Goal:** Define the new character shape and the compact hero sheet without changing generation.

1. `src/types/character-actions.ts`
   - `DICE`, `Die`, `ACTIONS`, `ActionId`, `ActionCheck`, `ActionCheckResult`.
2. `src/types/character.ts`
   - `CharacterAttributes`, `HeroCondition`, `HeroSheet`, `HeroProgression`, `CharacterRelations`, `CharacterStatus`.
3. `src/types/history.ts`
   - Add `Character` with `manual`, `lock`, `removed`, `seedKey`, `portrait`, `gender`, `tags`, `note`, `relations`, `hero`, `captor`.
   - `HistoricalFigure = Character & LegacyFigureFields` for pre-Phase-3 compatibility.
   - `LegacyFigureFields` keeps deprecated `skills`, `xp`, `archetype`, `disciplines`, and `progression`; migration removes them in Phase 3.
   - Re-export the character and action types from `history.ts` so existing imports keep working.
4. `src/data/character-actions.ts`
   - `ACTION_DEFS`, the twelve actions, `HERO_STARTING_PACKAGES` for all ten archetypes.
   - `heroStartingPackage`, `dieForRating`, `attributesFromSkills`, `legacyActionForPool`, `actionCheck`.
   - Starting packages are one `d10`, one `d8`, two `d6`, eight `d4`; attributes stay in `-1..+2`.
5. `src/types/living.ts`
   - Mark `HeroGuildState` deprecated.
   - Add optional `action?: ActionId` to `MissionPhase` and `ActiveGuildMission` alongside the deprecated `pool`; Phase 5 makes `action` the required check surface.
6. `src/data/hero-archetypes.ts`
   - Left unchanged in Phase 1. The legacy pool fields remain temporarily; the new starting packages live in `character-actions.ts`. Phase 4 removes the pool fields from archetypes.
7. `src/data/hero-vitals.ts`, `src/data/hero-aspects.ts`
   - No changes: neither file reads M/W/S/C directly.

**Verification:** `src/data/character-actions.test.ts` covers the catalogue, all ten starting packages, legacy conversion, normal/advantage/disadvantage rolls, criticals, complications, and success. 9 tests pass. The new files add no `tsc --noEmit` errors; the repository still reports pre-existing unrelated errors in `factions-editor`, `living-generator`, and several tests.

**Acceptance:** the new types and action catalogue are in place, generation is untouched, and `HistoricalFigure`-based call sites still compile through the legacy intersection. The project-wide type-check remains blocked by pre-existing errors outside this phase.

---

### Phase 2 — Characters Facade & Lifecycle ✅

**Status:** Implemented 2026-11-05.  
**Goal:** One API for every person; no direct writes to `pack.history.figures`.

1. `src/model/society/characters.ts`
   - `ensureRegistry`, `all`, `active`, `get`, `nextId`, `add`, `update`.
   - `remove` closes open roles at the current year and clears the id from every faction's `memberIds` / `candidateIds`; `restore` only clears `removed`.
   - `promoteToHero` infers an archetype when none is passed and seeds the Phase 1 starting package, keeping identity, roles, and traits; already-hero records are left unchanged.
   - `status`, `factionsOf`, `isCandidate`, `joinFaction`, `leaveFaction`; membership stays on `Faction`.
   - `NewCharacter` accepts a partial `Character` plus `culture`, one optional `role`, `hero: true`, and `archetype`.
2. `src/app/fmg.ts`
   - Exposed `FMG.Characters`.
3. `src/model/society/characters.test.ts`
   - create/read/update and monotonic ids;
   - generated names and unknown-culture rejection;
   - soft delete, role closure, membership cleanup, restore;
   - promotion preserving identity and traits, and promotion idempotence;
   - `active()` hiding removed and dead records;
   - status derivation, membership moves, and a missing faction registry.

**Verification:** 9 lifecycle tests pass. `biome check` is clean on the three changed files. The new files add no `tsc --noEmit` errors; the repository still reports the same pre-existing errors elsewhere.

**Acceptance:** a character can be created, promoted, edited, soft-deleted, restored, and joined to a faction entirely through `Characters`.

---

### Phase 3 — Serialization & Legacy Migration ✅

**Status:** Implemented 2026-11-05.  
**Goal:** Old maps load without loss; new maps save only the new shape.

1. `src/services/io/characters-migration.ts`
   - `LegacyFigure` reads the Phase 1 bridge fields.
   - `migrateCharacters(history)` backfills `seedKey` and builds `hero` from `skills`, `archetype`, `disciplines`, or `progression`.
   - `skills` map through `legacyActionsFromSkills` and `attributesFromSkills`; old disciplines become abilities; `xp` moves onto the sheet; progression keeps pending choices but clears `picks`.
   - `GuildState.heroes` fills `hero.condition`, `doctrine`, and `temperament`; `GuildState.cooldowns` fills `hero.cooldownUntil`.
   - An existing new-format sheet is never overwritten; only missing guild state is filled.
   - Legacy fields stay readable for one release.
2. `src/data/character-actions.ts`
   - Added `legacyActionsFromSkills` for the pool-family to action mapping.
3. `src/services/io/auto-update.ts`
   - Runs `migrateCharacters(pack.history)` after the legacy-map migration, before the loaded map is used.
4. `src/services/io/epochs-format.ts`
   - Unchanged: characters stay in history record 55; snapshot records still start at 56.
5. `src/services/io/characters-migration.test.ts`
   - legacy skills to sheet;
   - old guild hero state, cooldowns, and doctrine;
   - existing sheet preservation;
   - background figures stay sheetless;
   - idempotence;
   - hero and removed-character round-trips through record 55.

**Verification:** 7 migration/round-trip tests pass alongside the 9 action tests. `biome check` is clean. The new files add no `tsc --noEmit` errors.

**Acceptance:** a pre-Characters save opens, roster figures get a hero sheet, background figures stay sheetless, and character data round-trips inside history record 55 without renumbering.

---

### Phase 4 — Generators & Manual Preservation ✅

**Status:** Implemented 2026-11-05.  
**Goal:** History and living heroes mint through one API; user canon survives regeneration.

1. `src/model/physical/history-generator.ts`
   - Figures mint through `Characters.add` and `Characters.nextId`.
   - Traits are keyed by `seedKey` (`figure:<id>`) through `traitsRng`.
   - `manual`, `lock`, and `removed` records survive regeneration with their ids; events that reference them are kept.
   - Generated ids start above every preserved id.
2. `src/model/physical/living-heroes.ts`
   - `mintCandidate`, `spawnProtege`, and `commanderFor` mint through `Characters.add` with `hero: true`.
   - `ensureHeroSheet` is the single sheet accessor; legacy `skills` / `xp` / `archetype` / `disciplines` remain as temporary mirrors for the guild stub and HUD.
   - `ensureHeroGuildState` returns a cached view backed by `hero.condition`, `hero.doctrine`, and `hero.temperament`.
   - `applyHeroLevels` steps action dice; `chooseHeroPath` steps an action and adds an ability.
   - `recoverHeroes` and path auto-picks read the sheet.
3. `src/model/physical/living-guild.ts`
   - `GuildState.heroes` is no longer initialized or written; `isHeroIdle` reads the sheet condition.
   - Legacy operator scoring still reads the temporary skill mirrors until Phase 5.
4. `src/data/hero-archetypes.ts`
   - **Deferred:** pool fields remain because the guild HUD and mission scoring still read them. Phase 5 rewires mission checks; the pool fields are removed with the guild shim afterward.
5. Tests
   - `history-generator.test.ts`: seed keys, manual hero preservation, removed tombstones, generated-id isolation.
   - `living-heroes.test.ts`: vitals live on `hero.condition`, not `GuildState.heroes`.
   - `living-generator.test.ts`: hero vitals round-trip through the chronicle on the sheet.

**Verification:** 263 tests pass across the history, hero, and living suites. The new code adds no `tsc --noEmit` errors; pre-existing errors in the guild/HUD and test harness remain.

**Acceptance:** regenerating a map preserves manual/locked/removed characters with their ids and sheets, new figures rebuild around them, and living hero vitals live on the character sheet.

---

### Phase 5 — Hero Checks & Missions ✅

**Status:** Implemented 2026-11-05.  
**Goal:** Replace pool checks with action checks on the character-facing surface.

1. `src/data/mission-phases.ts`
   - Every phase now carries a required `action`.
   - Lair: scout / strike / infiltrate.
   - Excavation: investigate / scout / survive.
   - Pacify: persuade / command / persuade.
   - Trouble: investigate / strike / persuade.
2. Mission types and dispatch
   - `MissionPhase.action` and `ActiveGuildMission.action` are required; the deprecated `pool` is gone.
   - Old mission saves fall back through `legacyActionForPool` when resolving.
   - `missionPhaseInput` converts legacy d20 DCs onto the action ladder (`4`–`10`).
   - `resolveMission` calls `actionCheck`; phase results store critical/complication.
   - `phaseScore`, `pickPhaseHero`, and `missionChance` use action dice and attributes.
3. Legacy adapters
   - `legacyActionForPool` and `figureCheckRoll` are marked deprecated for guild operations and trouble resolution.
   - Guild operations, operator scoring, and trouble conversion keep the old d20 surface until the progress conversion.
4. UI and tests
   - `living-hud` shows action labels instead of pool letters.
   - `mission-phases.test.ts` asserts actions.
   - `character-actions.test.ts` covers advantage/disadvantage, criticals, complications, attribute bounds, and the legacy adapter.
   - `living-generator.test.ts` covers mission dispatch and action-based resolution.

**Verification:** 189 living tests pass; the mission-phase and HUD suites pass. No new `tsc --noEmit` errors from the mission changes.

**Acceptance:** character-facing missions resolve with action dice and attributes; guild operations and troubles still run through the deprecated pool adapter until their progress conversion.

---

### Phase 6 — Characters Editor ✅

**Status:** Implemented 2026-11-05.  
**Goal:** A standard table editor and detail sheet for every person.

1. `src/controllers/society/characters-editor.ts`
   - Standard editor table with search, status/tier filters, column sorting and visibility.
   - Add, detail, locate, soft delete, restore, focus.
   - CSV export and import; imports update by id or add a manual character.
   - The faction column stays derived from `Characters.factionsOf`.
   - `Layers.show("characters")` runs only when the layer exists, so Phase 7 can register it.
2. Detail dialog
   - Identity: name, culture, birth/death, gender, cell, tags, notes, manual/lock.
   - Traits: alignment, virtues, vices.
   - Roles: add/remove rows with type, target kind/id, span, specialty.
   - Relations: faction-style matrix with add/remove rows for factions, states, and characters.
3. Hero sheet controls
   - Four bounded attribute inputs.
   - Twelve action die selects.
   - Abilities, inventory, XP, condition, push, and progression.
   - Background characters expose **Promote to hero**.
4. `src/controllers/index.ts`
   - Registered `CharactersEditor`.
5. `src/controllers/society/characters-editor.test.ts`
   - hero and background rows;
   - derived faction column;
   - delete and restore;
   - promote, set attributes/dice, add a relation, save/load persistence;
   - CSV import/export shape.

**Verification:** 5 editor tests pass. `biome check` is clean on the new files; the editor adds no `tsc --noEmit` errors.

**Acceptance:** create a background character, promote it, set its dice, add a relation, delete it, restore it, and round-trip it through save/load — all from the editor.

---

### Phase 7 — Layer, Map Entity, Omnibar, Tool Button

**Goal:** Characters are visible and reachable like every other FMG entity.

1. `src/renderers/draw-characters.ts` and `layers.ts`
   - `characters` layer, `#characters` group.
2. `src/model/map-entities.ts`
   - `character` entity, `#characters` selector, `figure` alias.
3. Omnibar
   - character results and focus.
4. Tool wiring
   - `editCharactersButton` in `map-commands.ts`;
   - Characters button in `tools-tab.ts`;
   - `Shift+I` in `hotkeys.ts`.
5. Legends
   - link figure rows to the character detail and hero summary.

**Acceptance:** the Characters button opens the editor and enables the layer; a character is searchable in the omnibar; clicking its marker opens the detail; the layer is optional elsewhere.

---

### Phase 8 — Docs, Glossary, Cleanup

**Goal:** Lock the contract and leave no stale claims.

1. `docs/domain/glossary.md`
   - Character, Background Character, Hero, Hero Sheet, Action, Die, Check, Relationship Matrix.
2. `docs/architecture/data-model.md`
   - `pack.history.figures` as the character registry; hero sheet; no M/W/S/C.
3. `docs/plans/unified-figures.md`
   - mark the M/W/S/C and `FigureSkills` sections superseded by this plan.
4. `docs/plans/hero-diversity.md`
   - mark pool/skill sections superseded; keep archetype/path flavour.
5. `docs/plans/living-idle-guild.md`
   - mark `GuildState` as a deprecated stub.
6. `docs/wiki/Living-World.md`
   - character roster and hero sheet.
7. Remove `@deprecated` code only when the guild/faction work lands, not in this plan.

**Acceptance:** no doc claims characters use M/W/S/C or that the guild owns hero stats.

---

## 12. Verification & Invariants

| Invariant | Check |
|---|---|
| **One registry** | Every person resolves through `pack.history.figures`; no `pack.characters`, no second hero store |
| **One write path** | Generators and editor use `Characters`; no direct `figures.push` in new code |
| **No character M/W/S/C** | No `FigureSkills`, `HeroPool`, or `skills.m/w/s/c` in character-facing code |
| **No renown** | `Character` has no `renown`; standing is `relations` |
| **Two tiers** | Background characters have no hero sheet; heroes have a complete sheet |
| **Attribute bounds** | Every attribute is `-1 .. +2` |
| **Action bounds** | Every action has one of `d4/d6/d8/d10/d12` |
| **Advantage** | Two dice, best; disadvantage, two dice, worst |
| **Soft delete** | `removed` hides the character; id is never reused; membership is cleaned |
| **Manual preservation** | `manual || lock` survives regeneration with id, name, traits, and sheet |
| **Derived membership** | Faction column comes from `memberIds` / `candidateIds`; no `factionId` on the character |
| **Derived status** | `dead` / `captive` / `active` / `retired` computed from fields, not stored |
| **Save shape** | Characters stay in history record 55; snapshots still start at 56 |
| **Old saves** | `skills` and `GuildState.heroes` migrate without loss |
| **Layer** | Same state → same DOM; off by default; on with the editor |
| **Guild** | No new guild writes; the shim stays deprecated |
| **Conquest** | Untouched; still a stub |

### Test targets

- `src/data/character-actions.test.ts`
- `src/model/society/characters.test.ts`
- `src/model/physical/history-generator.test.ts`
- `src/model/physical/living-heroes.test.ts`
- `src/services/io/characters-save.test.ts`
- `src/controllers/society/characters-editor.test.ts` (if the editor suite exists)
- `src/model/map-entities.test.ts`
- `src/renderers/draw-characters.test.ts`

---

## 13. Out of Scope / Follow-ups

| Follow-up | Why it is separate |
|---|---|
| **Civ capacity/upkeep** | Replaces state/faction M/W/S/C with Civ upkeep; large economy change |
| **Conquest roll-in** | Conquest remains a stub; migration is its own plan |
| **Trouble progress** | Troubles move from checks to progress; not part of the hero sheet |
| **Guild deletion** | The stub stays until the faction effort absorbs the remaining UI and runtime |
| **Faction improvements** | Ranks, influence retirement, faction UI; "not here" |
| **Renown/influence retirement** | Belongs to the faction relationship-matrix work |
| **Family trees, grudges, bonds** | The relation matrix covers standing; feud weight and kinship are later |
| **Full inventory/ability catalogues** | The hero sheet keeps `abilities` and `inventory` as simple lists |
| **VTT/RPG export** | A natural follow-up once the sheet is stable |
| **Background competence die** | Optional dial; not required for the editor or layer |

---

## 14. Build Order Summary

| # | Phase | Size | Key Modules |
|---|---|---|---|
| 1 | Types, actions, hero sheet | L | `src/types/history.ts`, `src/types/living.ts`, `src/data/character-actions.ts`, `src/data/hero-archetypes.ts` |
| 2 | Characters facade | M | `src/model/society/characters.ts`, `src/app/fmg.ts` |
| 3 | Serialization & migration | M | `src/services/io/{save,load,epochs-format,auto-update}.ts` |
| 4 | Generators & preservation | L | `src/model/physical/{history-generator,living-heroes,living-guild}.ts` |
| 5 | Hero checks & missions | M | `src/data/character-actions.ts`, `src/types/living.ts`, mission dispatch |
| 6 | Editor | L | `src/controllers/society/characters-editor.ts`, `src/controllers/index.ts` |
| 7 | Layer, entity, omnibar, tools | M | `src/renderers/draw-characters.ts`, `layers.ts`, `map-entities.ts`, `map-commands.ts`, `tools-tab.ts`, `hotkeys.ts` |
| 8 | Docs & cleanup | S | `docs/domain/glossary.md`, `docs/architecture/data-model.md`, plan cross-links |

Each phase is shippable. Phases 1–4 make the data correct; phases 5–7 make it usable; phase 8 locks the contract.
