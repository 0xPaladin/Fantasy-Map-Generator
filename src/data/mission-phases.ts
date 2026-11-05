// Party mission phases. Each phase is one action check with its own tags.
// See docs/plans/characters.md.
import type { ActionId } from "@/types/character-actions";
import type { GuildMissionKind, MissionPhase, MissionTag } from "@/types/living";

export interface MissionPhaseInput {
  kind: GuildMissionKind;
  dc: number;
  tags: readonly MissionTag[];
  level: number;
  chronicle?: boolean;
}

function tagsFor(base: readonly MissionTag[], context: readonly MissionTag[]): MissionTag[] {
  const wanted = new Set(context);
  const matched = base.filter(tag => wanted.has(tag));
  return matched.length > 0 ? matched : [...base];
}

export function buildMissionPhases(input: MissionPhaseInput): MissionPhase[] {
  const { kind, dc, tags, level, chronicle } = input;
  const threePhase = kind === "excavate" ? Boolean(chronicle) : kind === "lair" ? level >= 5 : level >= 5;

  const phases: MissionPhase[] = [];
  const add = (id: string, label: string, action: ActionId, phaseTags: MissionTag[], offset: number) => {
    phases.push({
      id: `${kind}_${id}`,
      label,
      action,
      tags: phaseTags,
      dc: dc + offset,
      required: true
    });
  };

  if (kind === "lair") {
    add("approach", "Approach", "scout", tagsFor(["wild", "ruin", "lair"], tags), -1);
    add("breach", "Breach", "strike", tagsFor(["combat", "lair"], tags), 0);
    if (threePhase) add("decapitation", "Decapitation", "infiltrate", tagsFor(["lair", "combat"], tags), 1);
  } else if (kind === "excavate") {
    add("survey", "Survey", "investigate", tagsFor(["ruin", "arcane"], tags), -1);
    add("delve", "Delve", "scout", tagsFor(["trap", "arcane", "ruin"], tags), 0);
    if (threePhase) add("extraction", "Extraction", "survive", tagsFor(["ruin"], tags), 1);
  } else if (kind === "pacify") {
    add("parley", "Parley", "persuade", tagsFor(["social", "order"], tags), -1);
    add("enforce", "Enforce", "command", tagsFor(["order", "social"], tags), 0);
    if (threePhase) add("reconcile", "Reconcile", "persuade", tagsFor(["social", "order"], tags), 1);
  } else {
    add("investigate", "Investigate", "investigate", tagsFor(["intrigue", "arcane", "trouble"], tags), -1);
    add("confront", "Confront", "strike", tagsFor(["combat", "social", "trouble"], tags), 0);
    if (threePhase) add("settle", "Settle", "persuade", tagsFor(["social", "order", "trouble"], tags), 1);
  }

  return phases;
}

/** How many phases a mission gets after the party size is known. */
export function phasesForParty(phases: readonly MissionPhase[], partySize: number): MissionPhase[] {
  const maxPhases = Math.max(1, partySize * 2);
  return phases.slice(0, Math.min(phases.length, maxPhases));
}
