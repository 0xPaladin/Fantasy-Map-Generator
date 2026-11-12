// The user's own teaching material: standing instructions (AGENTS-style), on-demand skills and
// reusable prompts. Kept in this browser like chats; degrades to in-memory when storage fails.

import { LocalDB } from "@/services/local-db";
import { log } from "@/utils/logger";

export interface Skill {
  id: string;
  name: string; // unique, the read_skill argument
  description: string; // one line, shown in the system prompt's skill index
  body: string; // markdown, returned by read_skill
  enabled: boolean;
  updated: number;
}

export interface Prompt {
  id: string;
  name: string;
  text: string;
  updated: number;
}

/** A named AGENTS.md-style profile; one of them is the active set of standing instructions */
export interface InstructionsProfile {
  id: string;
  name: string;
  text: string;
  updated: number;
}

export const INSTRUCTIONS_LIMIT = 16_000; // about 4k tokens, the built-in prompt's own budget
export const SKILL_LIMIT = 32_000;
export const NAME_LIMIT = 40;
export const DESCRIPTION_LIMIT = 120;
const MAX_SKILLS = 50;
const MAX_PROMPTS = 50;
const MAX_PROFILES = 20;

const INSTRUCTIONS_KEY = "fmg-assistant-instructions"; // legacy single instructions, migrated on load
const PROFILES_KEY = "fmg-assistant-instructions-profiles";
const ACTIVE_KEY = "fmg-assistant-instructions-active";
const SKILLS_KEY = "fmg-assistant-skills";
const PROMPTS_KEY = "fmg-assistant-prompts";

let profiles: InstructionsProfile[] = [];
let activeProfile = "";
let skills: Skill[] = [];
let prompts: Prompt[] = [];
let loaded = false;
let loading: Promise<void> | undefined;

/** Loads once; storage failure leaves the in-memory state and is retried on the next call */
export function load(): Promise<void> {
  loading ??= Promise.all([
    LocalDB.get<{ text: string; updated: number }>(INSTRUCTIONS_KEY),
    LocalDB.get<InstructionsProfile[]>(PROFILES_KEY),
    LocalDB.get<string>(ACTIVE_KEY),
    LocalDB.get<Skill[]>(SKILLS_KEY),
    LocalDB.get<Prompt[]>(PROMPTS_KEY)
  ]).then(
    ([storedInstructions, storedProfiles, storedActive, storedSkills, storedPrompts]) => {
      if (Array.isArray(storedProfiles) && storedProfiles.length) profiles = storedProfiles;
      else if (storedInstructions?.text)
        // the pre-profile instructions become one profile, kept active
        profiles = [
          {
            id: globalThis.crypto?.randomUUID?.() ?? `legacy-${storedInstructions.updated}`,
            name: "Default",
            text: storedInstructions.text,
            updated: storedInstructions.updated
          }
        ];
      activeProfile =
        storedActive && profiles.some(profile => profile.id === storedActive) ? storedActive : (profiles[0]?.id ?? "");
      loaded = true; // lets the migration persist below
      if (storedInstructions && profiles.length && !storedProfiles?.length) {
        // one-time migration; the legacy slot is left empty to prove it migrated
        persist(PROFILES_KEY, profiles);
        persist(ACTIVE_KEY, activeProfile);
        persist(INSTRUCTIONS_KEY, { text: "", updated: 0 });
      }
      if (Array.isArray(storedSkills)) skills = storedSkills;
      if (Array.isArray(storedPrompts)) prompts = storedPrompts;
    },
    () => {
      loading = undefined;
    }
  );
  return loading;
}

const persist = (key: string, value: unknown): void => {
  if (!loaded || !LocalDB.isSupported()) return;
  LocalDB.set(key, value).catch(error => log.error("Assistant customization could not be saved", error));
};

const activeInstructions = (): InstructionsProfile | undefined =>
  profiles.find(profile => profile.id === activeProfile);

/** The active profile's text, what the Assistant reads; empty when there are no profiles */
export const getInstructions = (): string => activeInstructions()?.text ?? "";

export const listInstructionsProfiles = (): InstructionsProfile[] => [...profiles];
export const activeInstructionsId = (): string | null => activeInstructions()?.id ?? null;

export function setActiveInstructionsProfile(id: string): void {
  if (!profiles.some(profile => profile.id === id)) throw new Error("The profile was deleted.");
  activeProfile = id;
  persist(ACTIVE_KEY, id);
}

const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function saveInstructionsProfile(input: { id?: string; name?: string; text?: string }): InstructionsProfile {
  const existing = profiles.find(entry => entry.id === input.id);
  if (input.id && !existing) throw new Error("The profile was deleted.");
  const name = (input.name ?? existing?.name ?? "").trim().slice(0, NAME_LIMIT);
  if (!name) throw new Error("Enter a profile name.");
  const profile: InstructionsProfile = {
    id: input.id ?? newId(),
    name,
    text: (input.text ?? existing?.text ?? "").slice(0, INSTRUCTIONS_LIMIT),
    updated: Date.now()
  };
  if (profiles.some(entry => entry.id !== profile.id && entry.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`A profile named "${name}" already exists.`);
  profiles = existing ? profiles.map(entry => (entry.id === profile.id ? profile : entry)) : [...profiles, profile];
  if (!existing && profiles.length > MAX_PROFILES) {
    profiles = profiles.filter(entry => entry.id !== profile.id);
    throw new Error(`At most ${MAX_PROFILES} profiles can be kept.`);
  }
  if (!existing && profiles.length === 1) activeProfile = profile.id;
  persist(PROFILES_KEY, profiles);
  persist(ACTIVE_KEY, activeProfile); // the active id may have healed or adopted the first profile
  return profile;
}

export function deleteInstructionsProfile(id: string): void {
  profiles = profiles.filter(profile => profile.id !== id);
  if (activeProfile === id) {
    activeProfile = profiles[0]?.id ?? "";
    persist(ACTIVE_KEY, activeProfile);
  }
  persist(PROFILES_KEY, profiles);
}

export const listSkills = (): Skill[] => [...skills];
export const listPrompts = (): Prompt[] => [...prompts];

/** The enabled skills' names and descriptions, for the system prompt's skill index */
export const enabledSkills = (): { name: string; description: string }[] =>
  skills.filter(skill => skill.enabled).map(({ name, description }) => ({ name, description }));

/** The body of an enabled skill by name, case-insensitive; undefined when there is none */
export function readSkill(name: string): string | undefined {
  const query = name.trim().toLowerCase();
  return skills.find(skill => skill.enabled && skill.name.toLowerCase() === query)?.body;
}

export function saveSkill(input: {
  id?: string;
  name?: string;
  description?: string;
  body?: string;
  enabled?: boolean;
}): Skill {
  const existing = skills.find(entry => entry.id === input.id);
  if (input.id && !existing) throw new Error("The skill was deleted.");
  const name = (input.name ?? existing?.name ?? "").trim().slice(0, NAME_LIMIT);
  if (!name) throw new Error("Enter a skill name.");
  const skill: Skill = {
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    description: (input.description ?? existing?.description ?? "").trim().slice(0, DESCRIPTION_LIMIT),
    body: (input.body ?? existing?.body ?? "").slice(0, SKILL_LIMIT),
    enabled: input.enabled ?? existing?.enabled ?? true,
    updated: Date.now()
  };
  if (skills.some(entry => entry.id !== skill.id && entry.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`A skill named "${name}" already exists.`);
  skills = existing ? skills.map(entry => (entry.id === skill.id ? skill : entry)) : [...skills, skill];
  if (!existing && skills.length > MAX_SKILLS) {
    skills = skills.filter(entry => entry.id !== skill.id);
    throw new Error(`At most ${MAX_SKILLS} skills can be kept.`);
  }
  persist(SKILLS_KEY, skills);
  return skill;
}

export function deleteSkill(id: string): void {
  skills = skills.filter(skill => skill.id !== id);
  persist(SKILLS_KEY, skills);
}

export function savePrompt(input: { id?: string; name?: string; text?: string }): Prompt {
  const existing = prompts.find(entry => entry.id === input.id);
  if (input.id && !existing) throw new Error("The prompt was deleted.");
  const name = (input.name ?? existing?.name ?? "").trim().slice(0, NAME_LIMIT);
  if (!name) throw new Error("Enter a prompt name.");
  const prompt: Prompt = {
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    text: (input.text ?? existing?.text ?? "").slice(0, INSTRUCTIONS_LIMIT),
    updated: Date.now()
  };
  if (prompts.some(entry => entry.id !== prompt.id && entry.name.toLowerCase() === name.toLowerCase()))
    throw new Error(`A prompt named "${name}" already exists.`);
  prompts = existing ? prompts.map(entry => (entry.id === prompt.id ? prompt : entry)) : [...prompts, prompt];
  if (!existing && prompts.length > MAX_PROMPTS) {
    prompts = prompts.filter(entry => entry.id !== prompt.id);
    throw new Error(`At most ${MAX_PROMPTS} prompts can be kept.`);
  }
  persist(PROMPTS_KEY, prompts);
  return prompt;
}

export function deletePrompt(id: string): void {
  prompts = prompts.filter(prompt => prompt.id !== id);
  persist(PROMPTS_KEY, prompts);
}

// --- Markdown files: front matter in, front matter out ---

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** `name` and `description` fields over the rest of the file as the body */
function parseMarkdown(content: string): { fields: Record<string, string>; body: string } {
  const match = content.match(FRONT_MATTER);
  if (!match) return { fields: {}, body: content.trim() };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(\w+):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return { fields, body: content.slice(match[0].length).trim() };
}

const toMarkdown = (name: string, description: string, body: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;

/** A skill as a shareable markdown file */
export const skillToMarkdown = (skill: Skill): string => toMarkdown(skill.name, skill.description, skill.body);

/** An instructions profile as a shareable markdown file */
export const instructionsProfileToMarkdown = (profile: InstructionsProfile): string =>
  `---\nname: ${profile.name}\n---\n\n${profile.text}`;

/** Import one markdown file as a new instructions profile; a name the user already uses is suffixed */
export function importInstructionsProfileFile(fileName: string, content: string): InstructionsProfile {
  const { fields, body } = parseMarkdown(content);
  let name = (fields.name || fileName.replace(/\.md$/i, "")).trim().slice(0, NAME_LIMIT);
  for (let n = 2; profiles.some(profile => profile.name.toLowerCase() === name.toLowerCase()); n++)
    name = `${fields.name || fileName.replace(/\.md$/i, "")} ${n}`.slice(0, NAME_LIMIT);
  return saveInstructionsProfile({ name, text: body });
}

/** Import one markdown file as a new skill; a name the user already uses is suffixed */
export function importSkillFile(fileName: string, content: string): Skill {
  const { fields, body } = parseMarkdown(content);
  let name = (fields.name || fileName.replace(/\.md$/i, "")).trim().slice(0, NAME_LIMIT);
  for (let n = 2; skills.some(skill => skill.name.toLowerCase() === name.toLowerCase()); n++)
    name = `${fields.name || fileName.replace(/\.md$/i, "")} ${n}`.slice(0, NAME_LIMIT);
  const description = fields.description || body.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const enabled = fields.enabled !== "false";
  return saveSkill({ name, description, body, enabled });
}
