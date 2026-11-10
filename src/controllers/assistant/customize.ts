// The Customize view: the user's own instructions, skills and prompts. Each section edits its store
// directly; the Assistant reads them when it answers (Key tier only).

import {
  activeInstructionsId,
  deleteInstructionsProfile,
  deletePrompt,
  deleteSkill,
  importInstructionsProfileFile,
  importSkillFile,
  instructionsProfileToMarkdown,
  type InstructionsProfile,
  listInstructionsProfiles,
  listPrompts,
  listSkills,
  type Prompt,
  saveInstructionsProfile,
  savePrompt,
  saveSkill,
  setActiveInstructionsProfile,
  type Skill,
  skillToMarkdown
} from "@/services/assistant/customization";
import { downloadFile } from "@/utils/file-utils";
import { t } from "@/utils/i18n";
import { ensureEl as el } from "@/utils/node-utils";
import { errorText, escapeHtml } from "@/utils/string-utils";

let error = "";
let editing:
  | { kind: "skill"; skill: Skill }
  | { kind: "prompt"; prompt: Prompt }
  | { kind: "profile"; profile: InstructionsProfile }
  | null = null;

/** Customize view: render a section, then handle its clicks and submits through one delegate */
class CustomizeSheet {
  /** Rebuild the view; `message` reports what just happened (an Import, a Delete) */
  render(message = ""): void {
    el("assistantCustomizeError").textContent = error || message;
    this.renderProfiles();
    this.renderSkills();
    this.renderPrompts();
    this.renderEditor();
  }

  wire(): void {
    el("assistantCustomize").addEventListener("click", event => this.handleClick(event));
    el("assistantCustomize").addEventListener("submit", event => this.handleSubmit(event));
    el("assistantInstructionsFile").addEventListener("change", event => void this.importFiles(event, "profile"));
    el("assistantSkillFile").addEventListener("change", event => void this.importFiles(event, "skill"));
  }

  /** Fill every section from the store; called when the view opens */
  fill(): void {
    error = "";
    editing = null;
    this.render();
  }

  private renderProfiles(): void {
    const profiles = listInstructionsProfiles();
    const active = activeInstructionsId();
    el("assistantInstructionsProfileList").innerHTML = profiles.length
      ? profiles.map(profile => profileRowHtml(profile, profile.id === active)).join("")
      : `<div class="assistantEmpty">${t("No profiles yet. Import an AGENTS.md or add one.")}</div>`;
  }

  private renderSkills(): void {
    const skills = listSkills();
    el("assistantSkillList").innerHTML = skills.length
      ? skills.map(skillRowHtml).join("")
      : `<div class="assistantEmpty">${t("No skills yet.")}</div>`;
  }

  private renderPrompts(): void {
    const prompts = listPrompts();
    el("assistantPromptList").innerHTML = prompts.length
      ? prompts.map(promptRowHtml).join("")
      : `<div class="assistantEmpty">${t("No prompts yet.")}</div>`;
  }

  /** The one open editor, for a skill or a prompt; hidden when nothing is being edited */
  private renderEditor(): void {
    const editor = el("assistantCustomizeEditor");
    editor.hidden = !editing;
    const target = editing;
    if (!target) return;
    const skill = target.kind === "skill";
    const profile = target.kind === "profile";
    el("assistantEditorTitle").textContent = skill ? t("Skill") : profile ? t("Instructions profile") : t("Prompt");
    el("assistantEditorDescriptionField").hidden = !skill;
    el("assistantEditorEnabledField").hidden = !skill;
    el<HTMLInputElement>("assistantEditorName").value =
      target.kind === "skill" ? target.skill.name : profile ? target.profile.name : target.prompt.name;
    el<HTMLInputElement>("assistantEditorDescription").value =
      target.kind === "skill" ? target.skill.description : "";
    el<HTMLTextAreaElement>("assistantEditorBody").value =
      target.kind === "skill" ? target.skill.body : profile ? target.profile.text : target.prompt.text;
    el("assistantEditorBodyLabel").textContent = skill ? t("Body") : profile ? t("Instructions") : t("Text");
    el<HTMLInputElement>("assistantEditorEnabled").checked = target.kind === "skill" ? target.skill.enabled : false;
  }

  private handleClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!target || (target as HTMLButtonElement).disabled) return;
    const { action, id } = target.dataset;
    error = "";
    if (action === "new-instructions") this.editProfile();
    else if (action === "edit-instructions" && id)
      this.editProfile(listInstructionsProfiles().find(profile => profile.id === id));
    else if (action === "delete-instructions" && id) this.removeProfile(id);
    else if (action === "export-instructions" && id) this.exportProfile(id);
    else if (action === "set-active-instructions" && id) this.setActiveProfile(id);
    else if (action === "new-skill") this.editSkill();
    else if (action === "edit-skill" && id) this.editSkill(listSkills().find(skill => skill.id === id));
    else if (action === "delete-skill" && id) this.removeSkill(id);
    else if (action === "export-skill" && id) this.exportSkill(id);
    else if (action === "toggle-skill" && id) this.toggleSkill(id);
    else if (action === "new-prompt") this.editPrompt();
    else if (action === "edit-prompt" && id) this.editPrompt(listPrompts().find(prompt => prompt.id === id));
    else if (action === "delete-prompt" && id) this.removePrompt(id);
    else if (action === "export-prompt" && id) this.exportPrompt(id);
    else if (action === "close-editor") this.closeEditor();
  }

  private handleSubmit(event: SubmitEvent): void {
    if ((event.target as HTMLElement).id !== "assistantCustomizeEditor") return;
    event.preventDefault();
    this.saveEditor();
  }

  private editProfile(profile?: InstructionsProfile): void {
    editing = {
      kind: "profile",
      profile: profile ?? { id: "", name: "", text: "", updated: 0 }
    };
    this.render();
  }

  private removeProfile(id: string): void {
    deleteInstructionsProfile(id);
    if (editing?.kind === "profile" && editing.profile.id === id) editing = null;
    this.render(t("Deleted."));
  }

  private setActiveProfile(id: string): void {
    try {
      setActiveInstructionsProfile(id);
    } catch (failure) {
      error = errorText(failure);
    }
    this.render();
  }

  private exportProfile(id: string): void {
    const profile = listInstructionsProfiles().find(entry => entry.id === id);
    if (!profile) return;
    downloadFile(instructionsProfileToMarkdown(profile), `${safeName(profile.name)}.md`, "text/markdown");
  }

  private editSkill(skill?: Skill): void {
    editing = { kind: "skill", skill: skill ?? { id: "", name: "", description: "", body: "", enabled: true, updated: 0 } };
    this.render();
  }

  private editPrompt(prompt?: Prompt): void {
    editing = { kind: "prompt", prompt: prompt ?? { id: "", name: "", text: "", updated: 0 } };
    this.render();
  }

  private closeEditor(): void {
    editing = null;
    this.render();
  }

  /** Save the open editor; a validation error stays on screen and the editor stays open */
  private saveEditor(): void {
    const target = editing;
    if (!target) return;
    const name = el<HTMLInputElement>("assistantEditorName").value;
    const body = el<HTMLTextAreaElement>("assistantEditorBody").value;
    try {
      if (target.kind === "skill")
        saveSkill({
          id: target.skill.id || undefined,
          name,
          description: el<HTMLInputElement>("assistantEditorDescription").value,
          body,
          enabled: el<HTMLInputElement>("assistantEditorEnabled").checked
        });
      else if (target.kind === "profile")
        saveInstructionsProfile({ id: target.profile.id || undefined, name, text: body });
      else savePrompt({ id: target.prompt.id || undefined, name, text: body });
    } catch (failure) {
      error = errorText(failure);
      this.render();
      return;
    }
    editing = null;
    this.render(t("Saved."));
  }

  private removeSkill(id: string): void {
    deleteSkill(id);
    if (editing?.kind === "skill" && editing.skill.id === id) editing = null;
    this.render(t("Deleted."));
  }

  private removePrompt(id: string): void {
    deletePrompt(id);
    if (editing?.kind === "prompt" && editing.prompt.id === id) editing = null;
    this.render(t("Deleted."));
  }
  private toggleSkill(id: string): void {
    const skill = listSkills().find(entry => entry.id === id);
    if (!skill) return;
    saveSkill({ id, enabled: !skill.enabled });
    this.render();
  }

  private exportSkill(id: string): void {
    const skill = listSkills().find(entry => entry.id === id);
    if (!skill) return;
    downloadFile(skillToMarkdown(skill), `${safeName(skill.name)}.md`, "text/markdown");
  }

  private exportPrompt(id: string): void {
    const prompt = listPrompts().find(entry => entry.id === id);
    if (!prompt) return;
    const content = `---\nname: ${prompt.name}\n---\n\n${prompt.text}`;
    downloadFile(content, `${safeName(prompt.name)}.md`, "text/markdown");
  }

  /** Each file imports as one entry of its own section; names are suffixed when taken */
  private async importFiles(event: Event, section: "profile" | "skill"): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    if (!files.length) return;
    let imported = 0;
    for (const file of files) {
      try {
        if (section === "profile") importInstructionsProfileFile(file.name, await file.text());
        else importSkillFile(file.name, await file.text());
        imported++;
      } catch (failure) {
        error = errorText(failure);
      }
    }
    const message = imported
      ? imported === 1
        ? section === "profile"
          ? t("Profile imported.")
          : t("Skill imported.")
        : t("{{count}} files imported.", { count: imported })
      : "";
    this.render(error || message);
  }
}

const profileRowHtml = (profile: InstructionsProfile, active: boolean): string => {
  const name = escapeHtml(profile.name);
  const firstLine = profile.text.split("\n").find(line => line.trim())?.trim() ?? "";
  const preview = escapeHtml(firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine);
  return /* html */ `<div class="assistantCustomRow${active ? " active" : ""}">
    <label class="assistantCustomToggle">
      <input type="radio" name="assistantInstructionsActive" ${active ? "checked" : ""} data-action="set-active-instructions" data-id="${profile.id}" aria-label="${t("Use {{- name}}", { name })}" />
      <span class="assistantCustomName">${name}</span>
    </label>
    <small>${preview || `<em>${t("Empty profile")}</em>`}</small>
    <button type="button" class="assistantLink" data-action="edit-instructions" data-id="${profile.id}">${t("Edit")}</button>
    <button type="button" class="assistantLink" data-action="export-instructions" data-id="${profile.id}">${t("Export")}</button>
    <button type="button" class="assistantDelete icon-trash" data-action="delete-instructions" data-id="${profile.id}" aria-label="${t("Delete {{- name}}", { name })}"></button>
  </div>`;
};

const skillRowHtml = (skill: Skill): string => {
  const name = escapeHtml(skill.name);
  return /* html */ `<div class="assistantCustomRow${skill.enabled ? "" : " off"}">
    <label class="assistantCustomToggle">
      <input type="checkbox" ${skill.enabled ? "checked" : ""} data-action="toggle-skill" data-id="${skill.id}" aria-label="${t("Use {{- name}}", { name })}" />
      <span class="assistantCustomName">${name}</span>
    </label>
    <small>${escapeHtml(skill.description) || `<em>${t("No description")}</em>`}</small>
    <button type="button" class="assistantLink" data-action="edit-skill" data-id="${skill.id}">${t("Edit")}</button>
    <button type="button" class="assistantLink" data-action="export-skill" data-id="${skill.id}">${t("Export")}</button>
    <button type="button" class="assistantDelete icon-trash" data-action="delete-skill" data-id="${skill.id}" aria-label="${t("Delete {{- name}}", { name })}"></button>
  </div>`;
};

const promptRowHtml = (prompt: Prompt): string => {
  const name = escapeHtml(prompt.name);
  const preview = escapeHtml(prompt.text.length > 60 ? `${prompt.text.slice(0, 60).trimEnd()}…` : prompt.text);
  return /* html */ `<div class="assistantCustomRow">
    <span class="assistantCustomName">${name}</span>
    <small>${preview || `<em>${t("No text")}</em>`}</small>
    <button type="button" class="assistantLink" data-action="edit-prompt" data-id="${prompt.id}">${t("Edit")}</button>
    <button type="button" class="assistantLink" data-action="export-prompt" data-id="${prompt.id}">${t("Export")}</button>
    <button type="button" class="assistantDelete icon-trash" data-action="delete-prompt" data-id="${prompt.id}" aria-label="${t("Delete {{- name}}", { name })}"></button>
  </div>`;
};

const safeName = (name: string): string => name.replace(/[^\w\-. ]+/g, "").trim() || "skill";

export const Customize = new CustomizeSheet();