// Characters facade over pack.history.figures. See docs/plans/characters.md.
import { heroStartingPackage } from "@/data/character-actions";
import { inferHeroArchetype } from "@/data/hero-archetypes";
import { Names } from "@/model/society/names-generator";
import type { CharacterStatus, HeroSheet } from "@/types/character";
import type { Faction } from "@/types/factions";
import type { Character, HistoricalFigure, HistoricalRole } from "@/types/history";
import type { HeroArchetypeId } from "@/types/living";

export interface NewCharacter extends Omit<Partial<Character>, "i" | "hero"> {
  culture: number;
  role?: HistoricalRole;
  hero?: boolean;
  archetype?: HeroArchetypeId;
}

function currentYear(): number {
  return options?.map?.lore?.calendar?.year ?? 1000;
}

function emptyHistory() {
  return { events: [], realms: [], eras: [], figures: [] };
}

function heroSheet(character: HistoricalFigure, archetype?: HeroArchetypeId): HeroSheet {
  const packageId = archetype ?? inferHeroArchetype(character);
  const start = heroStartingPackage(packageId);
  return {
    archetype: packageId,
    attributes: start.attributes,
    actions: start.actions,
    abilities: [start.ability],
    xp: character.xp ?? 0
  };
}

class CharactersModule {
  /** The registry, created lazily for old maps and bare test packs. */
  ensureRegistry(): HistoricalFigure[] {
    if (!pack.history) pack.history = emptyHistory();
    pack.history.figures ??= [];
    return pack.history.figures;
  }

  /** Every record, including soft-deleted ones. */
  all(): HistoricalFigure[] {
    return this.ensureRegistry();
  }

  /** Living records that have not been removed. */
  active(): HistoricalFigure[] {
    return this.all().filter(character => !character.removed && character.death === undefined);
  }

  get(id: number): HistoricalFigure | undefined {
    return this.all().find(character => character.i === id);
  }

  nextId(): number {
    const figures = this.all();
    let highest = -1;
    for (const character of figures) {
      if (character.i > highest) highest = character.i;
    }
    return highest + 1;
  }

  add(input: NewCharacter): Character {
    if (!Number.isInteger(input.culture) || !pack.cultures?.[input.culture]) {
      throw new Error(`Unknown culture ${input.culture}`);
    }

    const figures = this.ensureRegistry();
    const { role, hero: wantsHero, archetype, roles, ...fields } = input;
    const character: Character = {
      ...fields,
      i: this.nextId(),
      name: fields.name?.trim() || Names.getCulture(input.culture),
      culture: input.culture,
      birth: fields.birth ?? currentYear(),
      roles: [...(roles ?? [])]
    };

    if (role) character.roles.push(role);
    if (wantsHero) character.hero = heroSheet(character as HistoricalFigure, archetype);

    figures.push(character as HistoricalFigure);
    return character;
  }

  update(id: number, patch: Partial<Character>): Character | undefined {
    const figures = this.ensureRegistry();
    const index = figures.findIndex(character => character.i === id);
    if (index === -1) return undefined;

    const next = { ...figures[index], ...patch, i: id } as HistoricalFigure;
    figures[index] = next;
    return next;
  }

  /** Soft delete: closes roles and drops faction membership, but keeps the record. */
  remove(id: number): boolean {
    const character = this.get(id);
    if (!character || character.removed) return false;

    character.removed = true;
    const year = currentYear();
    for (const role of character.roles) {
      if (role.to === undefined) role.to = year;
    }

    for (const faction of this.factions()) {
      faction.memberIds = (faction.memberIds ?? []).filter(memberId => memberId !== id);
      if (faction.candidateIds) {
        faction.candidateIds = faction.candidateIds.filter(candidateId => candidateId !== id);
      }
    }

    return true;
  }

  restore(id: number): boolean {
    const character = this.get(id);
    if (!character?.removed) return false;
    character.removed = false;
    return true;
  }

  promoteToHero(id: number, archetype?: HeroArchetypeId): Character | undefined {
    const character = this.get(id);
    if (!character || character.hero) return character;
    character.hero = heroSheet(character, archetype);
    return character;
  }

  status(character: Character): CharacterStatus {
    if (character.death !== undefined) return "dead";
    if (character.captor !== undefined) return "captive";

    const openRole = character.roles.some(role => role.to === undefined);
    const member = this.factions().some(faction => faction.memberIds?.includes(character.i));
    return openRole || member ? "active" : "retired";
  }

  factionsOf(characterId: number): Faction[] {
    return this.factions().filter(
      faction => faction.memberIds?.includes(characterId) || Boolean(faction.candidateIds?.includes(characterId))
    );
  }

  isCandidate(characterId: number, factionId: number): boolean {
    return Boolean(
      this.factions()
        .find(faction => faction.i === factionId)
        ?.candidateIds?.includes(characterId)
    );
  }

  joinFaction(characterId: number, factionId: number): boolean {
    const faction = this.factions().find(candidate => candidate.i === factionId);
    if (!faction || !this.get(characterId)) return false;

    faction.memberIds = [...new Set([...(faction.memberIds ?? []), characterId])];
    if (faction.candidateIds) {
      faction.candidateIds = faction.candidateIds.filter(candidateId => candidateId !== characterId);
    }
    return true;
  }

  leaveFaction(characterId: number, factionId: number): boolean {
    const faction = this.factions().find(candidate => candidate.i === factionId);
    if (!faction?.memberIds?.includes(characterId)) return false;

    faction.memberIds = faction.memberIds.filter(memberId => memberId !== characterId);
    faction.candidateIds = [...new Set([...(faction.candidateIds ?? []), characterId])];
    return true;
  }

  /** Non-removed factions, including a missing registry as an empty list. */
  private factions(): Faction[] {
    return pack.factions?.filter(faction => faction && !faction.removed) ?? [];
  }
}

export const Characters = new CharactersModule();
