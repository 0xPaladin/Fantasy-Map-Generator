// Characters editor: the table and the sheet dialog. See docs/plans/characters.md.

import { Controllers } from "@/controllers";
import { ACTION_DEFS, ACTIONS, DICE, heroStartingPackage, rollHeroAttributes } from "@/data/character-actions";
import { ALIGNMENTS, type Alignment, rollAlignment, rollFigureTraits, traitsRng } from "@/data/culture-traits";
import { HERO_ARCHETYPE_IDS, HERO_ARCHETYPES } from "@/data/hero-archetypes";
import { defaultHeroCondition, figureLevel } from "@/data/hero-vitals";
import { ensureHeroGuildState } from "@/model/physical/living-heroes";
import { Characters } from "@/model/society/characters";
import { Schemes } from "@/model/story/schemes-generator";
import { Layers } from "@/renderers/layers";
import { Csv } from "@/services/io/csv";
import type { CharacterStatus, HeroCondition, HeroSheet } from "@/types/character";
import type { ActionId, Die } from "@/types/character-actions";
import type { FactionRelation } from "@/types/factions";
import type { Character, HistoricalFigure, HistoricalRole, HistRefKind } from "@/types/history";
import type { HeroArchetypeId } from "@/types/living";
import type { Scheme } from "@/types/schemes";
import { Dialog } from "@/ui/dialog/dialog";
import { bindColumnSorting, sortDataByColumns } from "@/ui/dialog/sorting";
import { dialogState } from "@/ui/dialog/state";
import {
  type EditorColumn,
  initColumnVisibility,
  initEditorTable,
  renderEditorHeader,
  renderEditorPagination,
  type TableView
} from "@/ui/dialog/table";
import { zoomTo } from "@/ui/map/zoom";
import { t } from "@/utils/i18n";
import { ensureEl, findEl } from "@/utils/node-utils";
import { createRng } from "@/utils/rng";
import { capitalize, escapeHtml } from "@/utils/string-utils";

const dialogId = "charactersEditor";
const detailsId = "characterDetailsDialog";
const position = { my: "right top", at: "right-10 top+10", of: "svg" };

const CSV_COLUMNS = [
  "Id",
  "Name",
  "Culture",
  "Birth",
  "Death",
  "Gender",
  "Alignment",
  "Status",
  "Role",
  "Faction",
  "Hero",
  "Tags",
  "Note"
] as const;

const STATUS_FILTERS: readonly (CharacterStatus | "removed")[] = ["active", "dead", "captive", "retired", "removed"];
const ROLE_TYPES: HistoricalRole["type"][] = [
  "ruler",
  "general",
  "prophet",
  "rebel",
  "adventurer",
  "specialist",
  "agent"
];
const REF_KINDS: HistRefKind[] = ["state", "realm", "burg", "culture", "religion", "figure", "polity", "faction"];
const RELATIONS: FactionRelation[] = ["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Enemy"];
const RELATION_KINDS = ["factions", "states", "characters"] as const;
type RelationKind = (typeof RELATION_KINDS)[number];

let filterState: { search: string; status: string; kind: string };

const columns: EditorColumn<HistoricalFigure>[] = [
  { key: "locate", width: "1.2em", permanent: true },
  { key: "name", label: t("Name"), width: "12em", permanent: true, sortBy: c => c.name, sortType: "alpha" },
  { key: "status", label: t("Status"), width: "6em", sortBy: statusOf, sortType: "alpha" },
  { key: "age", label: t("Age"), width: "4em", sortBy: ageOf, sortType: "number" },
  { key: "culture", label: t("Culture"), width: "8em", sortBy: cultureName, sortType: "alpha" },
  { key: "alignment", label: t("Alignment"), width: "6em", sortBy: c => c.alignment ?? "", sortType: "alpha" },
  {
    key: "traits",
    label: t("Virtues/Vices"),
    width: "18em",
    sortBy: c => traitSummary(c),
    sortType: "alpha"
  },
  { key: "role", label: t("Role"), width: "16em", sortBy: roleSummary, sortType: "alpha" },
  { key: "faction", label: t("Faction"), width: "11em", sortBy: factionSummary, sortType: "alpha" },
  { key: "hero", label: t("Hero"), width: "4em", sortBy: c => (c.hero ? 1 : 0), sortType: "number" },
  { key: "villain", label: t("Villain"), width: "5em", sortBy: c => (villainScheme(c) ? 1 : 0), sortType: "number" },
  { key: "details", width: "1.2em" },
  { key: "remove", width: "1.2em", permanent: true }
];

const charactersTable = initEditorTable<HistoricalFigure>({
  dialogId,
  getData: getCharactersData,
  onUpdate: renderCharactersPage
});

function currentYear(): number {
  return options?.map?.lore?.calendar?.year ?? 1000;
}

function cultureName(character: HistoricalFigure): string {
  return pack.cultures?.[character.culture]?.name ?? `Culture ${character.culture}`;
}

/** The character's living scheme, preferring an active one. */
function villainScheme(character: HistoricalFigure): Scheme | undefined {
  const schemes = Schemes.ensureSchemes().filter(scheme => scheme.villainFigure === character.i);
  return schemes.find(scheme => scheme.status === "active") ?? schemes[0];
}

function statusOf(character: HistoricalFigure): string {
  return character.removed ? "removed" : Characters.status(character);
}

function ageOf(character: HistoricalFigure): number {
  return (character.death ?? currentYear()) - character.birth;
}

function openRole(character: HistoricalFigure): HistoricalRole | undefined {
  return character.roles.find(role => role.to === undefined) ?? character.roles.at(-1);
}

function roleSummary(character: HistoricalFigure): string {
  const role = openRole(character);
  if (!role) return "";
  return `${capitalize(role.type)} ${targetName(role.target)}`;
}

function traitSummary(character: HistoricalFigure): string {
  return [...(character.virtues ?? []), ...(character.vices ?? [])].join(", ");
}

/** The name behind a role's target reference, with its kind and id only when the target is gone */
function targetName(target: HistoricalRole["target"]): string {
  const { kind, id } = target;
  const fallback = `${capitalize(kind)} ${id}`;
  switch (kind) {
    case "state":
      return pack.states?.[id]?.name ?? fallback;
    case "burg":
      return pack.burgs?.[id]?.name ?? fallback;
    case "culture":
      return pack.cultures?.[id]?.name ?? fallback;
    case "religion":
      return pack.religions?.[id]?.name ?? fallback;
    case "faction":
      return pack.factions?.find(faction => faction.i === id)?.name ?? fallback;
    case "figure":
      return Characters.get(id)?.name ?? fallback;
    case "realm":
      return pack.history?.realms?.[id]?.name ?? fallback;
    case "polity":
      return pack.history?.polities?.find(polity => polity.id === id)?.name ?? fallback;
  }
}

function factionSummary(character: HistoricalFigure): string {
  return Characters.factionsOf(character.i)
    .map(faction => faction.name)
    .join(", ");
}

function heroSummary(character: HistoricalFigure): string {
  if (!character.hero) return "";
  const actions = Object.values(ACTION_DEFS)
    .map(def => ({ label: def.label, die: character.hero!.actions[def.id] }))
    .sort((a, b) => DICE.indexOf(b.die) - DICE.indexOf(a.die))
    .slice(0, 3)
    .map(entry => `${entry.label} ${entry.die}`)
    .join(" · ");
  return actions;
}

function getCharactersData(): HistoricalFigure[] {
  let list = Characters.all();
  const search = filterState.search.toLowerCase().trim();

  if (filterState.status === "removed") {
    list = list.filter(character => character.removed);
  } else if (filterState.status !== "all") {
    list = list.filter(character => !character.removed && Characters.status(character) === filterState.status);
  }
  if (filterState.kind === "hero") list = list.filter(character => Boolean(character.hero));
  if (filterState.kind === "background") list = list.filter(character => !character.hero);

  if (search) {
    list = list.filter(character => {
      const haystack = [
        character.name,
        cultureName(character),
        roleSummary(character),
        factionSummary(character),
        heroSummary(character),
        character.alignment ?? "",
        character.note ?? "",
        ...(character.tags ?? [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return findEl(`${dialogId}Header`) ? sortDataByColumns(dialogId, list, columns) : list;
}

function open(focusId?: number): void {
  Dialog.closeAll(`#${dialogId}, .stable`);
  if (Layers.has("characters")) Layers.show("characters");

  filterState = dialogState.get(dialogId, "filters", () => ({ search: "", status: "all", kind: "all" }));
  filterState.search ??= "";
  filterState.status ??= "all";
  filterState.kind ??= "all";

  renderDialog();
  updateFilters();
  charactersTable.reset();

  Dialog.open(dialogId, { title: t("Characters"), onClose: close, position });
  if (focusId !== undefined) focusRow(focusId);
}

function close(): void {
  const view = charactersTable.view();
  view.rows = [];
  view.all = [];
  Dialog.close(detailsId);
}

function focusRow(id: number): void {
  setTimeout(() => {
    const row = findEl(`characterRow-${id}`);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.style.outline = "2px solid #38bdf8";
    setTimeout(() => {
      row.style.outline = "";
    }, 1500);
  }, 100);
}

function renderDialog(): void {
  Dialog.destroy(dialogId);
  document.body.insertAdjacentHTML(
    "beforeend",
    /* html */ `
    <div id="${dialogId}" class="dialog stable editorDialog">
      ${renderEditorHeader({ dialogId, columns })}
      <div id="charactersBodySection" class="table" data-type="absolute" style="max-height: 480px; overflow-y: auto;"></div>
      <div id="charactersFilters" class="editorFilters" data-tip="${t("Apply a filter")}">
        <label for="charactersSearch">${t("Search")}: <input id="charactersSearch" type="search" /></label>
        <label for="charactersStatusFilter">${t("Status")}:
          <select id="charactersStatusFilter">
            <option value="all">${t("All")}</option>
            ${STATUS_FILTERS.map(status => `<option value="${status}">${capitalize(status)}</option>`).join("")}
          </select>
        </label>
        <label for="charactersKindFilter">${t("Tier")}:
          <select id="charactersKindFilter">
            <option value="all">${t("All")}</option>
            <option value="hero">${t("Heroes")}</option>
            <option value="background">${t("Background")}</option>
          </select>
        </label>
      </div>
      <div id="charactersFooter" class="totalLine" style="display: flex; justify-content: space-between; align-items: center; padding: 6px;">
        <div>${t("Characters")}:&nbsp;<span id="charactersFooterCount">0</span> | ${t("Heroes")}:&nbsp;<span id="charactersFooterHeroes">0</span></div>
        <div style="display: flex; gap: 4px;">
          <button id="addCharacterButton" class="btn" data-tip="${t("Add a background character")}">${t("+ Character")}</button>
          <button id="importCharactersCsv" class="btn" data-tip="${t("Import characters from CSV")}">${t("Import")}</button>
          <button id="exportCharactersCsv" class="btn icon-download" data-tip="${t("Download CSV data")}"></button>
        </div>
      </div>
    </div>`
  );

  initColumnVisibility({ dialogId, columns, onUpdate: () => charactersTable.refresh() });
  bindColumnSorting(dialogId, charactersTable.reset);

  ensureEl<HTMLInputElement>("charactersSearch").addEventListener("input", function () {
    filterState.search = this.value;
    charactersTable.refresh();
  });
  ensureEl<HTMLSelectElement>("charactersStatusFilter").addEventListener("change", function () {
    filterState.status = this.value;
    charactersTable.reset();
  });
  ensureEl<HTMLSelectElement>("charactersKindFilter").addEventListener("change", function () {
    filterState.kind = this.value;
    charactersTable.reset();
  });
  ensureEl("addCharacterButton").addEventListener("click", addCharacter);
  ensureEl("importCharactersCsv").addEventListener("click", importCsv);
  ensureEl("exportCharactersCsv").addEventListener("click", exportCsv);

  const body = ensureEl("charactersBodySection");
  body.addEventListener("click", handleTableClick);
  body.addEventListener("change", handleTableChange);
  renderEditorPagination(ensureEl("charactersFooter"), charactersTable.view(), page => charactersTable.goto(page));
}

function updateFilters(): void {
  ensureEl<HTMLInputElement>("charactersSearch").value = filterState.search;
  ensureEl<HTMLSelectElement>("charactersStatusFilter").value = filterState.status;
  ensureEl<HTMLSelectElement>("charactersKindFilter").value = filterState.kind;
}

function renderCharactersPage(view: TableView<HistoricalFigure>): void {
  const container = findEl("charactersBodySection");
  if (!container) return;

  ensureEl("charactersFooterCount").textContent = String(view.all.length);
  ensureEl("charactersFooterHeroes").textContent = String(view.all.filter(character => character.hero).length);
  renderEditorPagination(ensureEl("charactersFooter"), view, page => charactersTable.goto(page));

  container.innerHTML = view.rows.map(renderRow).join("");
}

function renderRow(character: HistoricalFigure): string {
  const status = statusOf(character);
  const culture = cultureName(character);
  const faction = factionSummary(character) || "—";
  const role = roleSummary(character) || "—";
  const hero = character.hero
    ? `<span class="badge" data-tip="${escapeHtml(heroSummary(character))}">${t("Hero")}</span>`
    : "—";
  const scheme = villainScheme(character);
  const villain = scheme
    ? `<button type="button" data-action="scheme" data-scheme="${scheme.i}" data-tip="${t("Open this villain's scheme")}" style="border:none;background:none;padding:0;color:#3d5a99;text-decoration:underline;cursor:pointer;font-size:inherit;">${t("Yes")}</button>`
    : `<span style="color:#888;">${t("No")}</span>`;
  const traits = traitSummary(character) || "—";
  const locate = character.cell !== undefined ? "icon-dot-circled" : "";
  const removedClass = character.removed ? " removed" : "";
  const removeAction = character.removed ? "restore" : "remove";
  const removeIcon = character.removed ? "icon-ccw" : "icon-trash";
  const removeTip = character.removed ? t("Restore character") : t("Remove character");

  return /* html */ `
    <div id="characterRow-${character.i}" class="states${removedClass}" data-id="${character.i}">
      <div data-col="locate" class="pointer ${locate}" data-action="locate" data-tip="${t("Locate on map")}"></div>
      <span data-col="name" class="pointer" data-action="details" style="text-decoration: underline;">${escapeHtml(character.name)}</span>
      <span data-col="status" class="badge">${capitalize(status)}</span>
      <span data-col="age" style="text-align: center;">${ageOf(character)}</span>
      <span data-col="culture">${escapeHtml(culture)}</span>
      <span data-col="alignment">
        <select data-action="alignment" aria-label="${t("Alignment")}">
          <option value="">${t("None")}</option>
          ${ALIGNMENTS.map(option => `<option value="${option}" ${character.alignment === option ? "selected" : ""}>${capitalize(option)}</option>`).join("")}
        </select>
      </span>
      <span data-col="traits" data-tip="${escapeHtml(traits)}">
        <span class="pointer icon-cw" data-action="reroll-traits" data-tip="${t("Reroll virtues and vices")}"></span>
        ${escapeHtml(traits)}
      </span>
      <span data-col="role">${escapeHtml(role)}</span>
      <span data-col="faction">${escapeHtml(faction)}</span>
      <span data-col="hero" style="text-align: center;">${hero}</span>
      <span data-col="villain" style="text-align: center;">${villain}</span>
      <div data-col="details" class="pointer icon-pencil" data-action="details" data-tip="${t("Open character sheet")}"></div>
      <div data-col="remove" class="pointer ${removeIcon}" data-action="${removeAction}" data-tip="${removeTip}"></div>
    </div>`;
}

function handleTableClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-action]");
  if (!target) return;
  const row = target.closest<HTMLElement>("[data-id]");
  const id = Number(row?.dataset.id);
  const character = Number.isFinite(id) ? Characters.get(id) : undefined;
  if (!character) return;

  if (target.dataset.action === "details") {
    openCharacterDetails(character.i);
  } else if (target.dataset.action === "reroll-traits") {
    rerollTraits(character);
  } else if (target.dataset.action === "locate") {
    locate(character);
  } else if (target.dataset.action === "remove") {
    Dialog.confirm({
      message: `${t("Remove")} ${escapeHtml(character.name)}?`,
      onConfirm: () => {
        Characters.remove(character.i);
        refreshCharacters();
      }
    });
  } else if (target.dataset.action === "restore") {
    Characters.restore(character.i);
    refreshCharacters();
  } else if (target.dataset.action === "scheme") {
    const schemeId = Number(target.dataset.scheme ?? 0);
    if (schemeId) void Controllers.SchemesOverview.open({ schemeId });
  }
}

function handleTableChange(event: Event): void {
  const select = (event.target as HTMLElement)?.closest<HTMLSelectElement>('[data-action="alignment"]');
  if (!select) return;
  const row = select.closest<HTMLElement>("[data-id]");
  const id = Number(row?.dataset.id);
  if (!Number.isFinite(id) || !Characters.get(id)) return;
  Characters.update(id, { alignment: (select.value as Alignment) || undefined });
  if (Layers.has("characters")) Layers.draw("characters");
}

function refreshCharacters(): void {
  charactersTable.refresh();
  if (Layers.has("characters")) Layers.draw("characters");
}

/** Roll new virtues and vices in the counts the character's alignment dictates */
function rerollTraits(character: HistoricalFigure): void {
  const rng = traitsRng(`${options.map?.seed ?? ""}:${Math.random()}`, "figure", character.i);
  const alignment = character.alignment ?? rollAlignment(rng, pack.cultures?.[character.culture]?.alignment);
  const { virtues, vices } = rollFigureTraits(rng, alignment);
  Characters.update(character.i, { alignment, virtues, vices });
  refreshCharacters();
}

/** Reset the hero's attributes, actions, ability and vitals to a fresh archetype roll */
function rerollHero(characterId: number): void {
  const character = Characters.get(characterId);
  const hero = character?.hero;
  if (!character || !hero) return;
  const select = findEl<HTMLSelectElement>("characterArchetype");
  const archetype = (select?.value ?? hero.archetype ?? "freeblade") as HeroArchetypeId;
  const start = heroStartingPackage(archetype);
  const level = figureLevel(hero.xp ?? 0);
  Characters.update(characterId, {
    hero: {
      ...hero,
      archetype,
      attributes: rollHeroAttributes(createRng(`hero-reroll:${characterId}:${Date.now()}`)),
      actions: { ...start.actions },
      abilities: [start.ability],
      condition: defaultHeroCondition(archetype, level, hero.progression?.picks)
    }
  });
  refreshCharacters();
  openCharacterDetails(characterId);
}

function locate(character: HistoricalFigure): void {
  if (character.cell === undefined) return;
  const point = pack.cells?.p?.[character.cell];
  if (point) zoomTo(point[0], point[1], 6, 1400);
}

function addCharacter(): void {
  const culture = pack.cultures?.find(entry => entry?.i && !entry.removed)?.i ?? 0;
  try {
    const character = Characters.add({
      name: t("New Character"),
      culture,
      birth: currentYear() - 25,
      manual: true
    });
    refreshCharacters();
    openCharacterDetails(character.i);
  } catch (error) {
    Dialog.message({ title: t("Cannot add character"), message: escapeHtml(String(error)) });
  }
}

export function openCharacterDetails(characterId: number): void {
  const character = Characters.get(characterId);
  if (!character) return;
  if (character.hero) ensureHeroGuildState(character);

  Dialog.destroy(detailsId);
  document.body.insertAdjacentHTML("beforeend", renderDetails(character));
  Dialog.open(detailsId, {
    title: `${character.name} — ${t("Character Sheet")}`,
    width: 560,
    height: "auto",
    maxHeight: window.innerHeight - 50,
    resizable: true
  });

  ensureEl("saveCharacterButton").addEventListener("click", () => saveCharacter(characterId));
  ensureEl("cancelCharacterButton").addEventListener("click", () => Dialog.close(detailsId));
  ensureEl("deleteCharacterButton").addEventListener("click", () => deleteCharacter(characterId));
  ensureEl("addRoleButton").addEventListener("click", () => appendRoleRow());
  ensureEl("addRelationButton").addEventListener("click", () => appendRelationRow());
  findEl("rerollHeroButton")?.addEventListener("click", () => rerollHero(characterId));
  findEl("delveCharacterButton")?.addEventListener("click", () => {
    void Controllers.DelveScreen.openPartyPickerForCharacter(characterId);
  });

  const promote = findEl("promoteCharacterButton");
  promote?.addEventListener("click", () => {
    Characters.promoteToHero(characterId);
    refreshCharacters();
    openCharacterDetails(characterId);
  });
}

function renderDetails(character: HistoricalFigure): string {
  const cultures = (pack.cultures ?? [])
    .filter(culture => culture?.i)
    .map(
      culture =>
        `<option value="${culture.i}" ${culture.i === character.culture ? "selected" : ""}>${escapeHtml(culture.name ?? `Culture ${culture.i}`)}</option>`
    )
    .join("");

  return /* html */ `
    <div id="${detailsId}" class="dialog stable" style="padding: 8px; font-size: 0.85em;">
      <style>
        #${detailsId} .characterTable { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        #${detailsId} .characterTable th { text-align: left; border-bottom: 1px solid var(--dark-solid); padding: 2px 4px; }
        #${detailsId} .characterTable td { padding: 2px 4px; border-bottom: 1px solid #e5e5e5; }
        #${detailsId} .characterTable td input, #${detailsId} .characterTable td select { width: 100%; margin: 0; }
        #${detailsId} .characterTable th:last-child, #${detailsId} .characterTable td:last-child { width: 1.6em; text-align: right; }
      </style>
      <section class="editorSection">
        <h4>${t("Identity")}</h4>
        <div style="display: flex; gap: 6px; margin-bottom: 4px;">
          <label style="flex: 2; display: flex; flex-direction: column;">${t("Name")}<input id="characterName" value="${escapeHtml(character.name)}" style="width: 100%;" /></label>
          <label style="flex: 2; display: flex; flex-direction: column;">${t("Culture")}<select id="characterCulture" style="width: 100%;">${cultures}</select></label>
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 4px;">
          <label style="flex: 1; display: flex; flex-direction: column;">${t("Birth")}<input id="characterBirth" type="number" value="${character.birth}" style="width: 100%;" /></label>
          <label style="flex: 1; display: flex; flex-direction: column;">${t("Death")}<input id="characterDeath" type="number" value="${character.death ?? ""}" style="width: 100%;" /></label>
          <label style="flex: 1; display: flex; flex-direction: column;">${t("Gender")}<input id="characterGender" value="${escapeHtml(character.gender ?? "")}" style="width: 100%;" /></label>
          <label style="flex: 1; display: flex; flex-direction: column;">${t("Cell")}<input id="characterCell" type="number" value="${character.cell ?? ""}" style="width: 100%;" /></label>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
          <label><input id="characterManual" type="checkbox" ${character.manual ? "checked" : ""}/> ${t("Manual")}</label>
          <label><input id="characterLock" type="checkbox" ${character.lock ? "checked" : ""}/> ${t("Locked")}</label>
        </div>
        <label style="display: flex; flex-direction: column;">${t("Tags")}<input id="characterTags" value="${escapeHtml((character.tags ?? []).join(", "))}" style="width: 100%;" /></label>
        <label style="display: flex; flex-direction: column;">${t("Notes")}<textarea id="characterNote" style="width: 100%; height: 2.5em;">${escapeHtml(character.note ?? "")}</textarea></label>
      </section>

      <section class="editorSection">
        <h4>${t("Roles")}</h4>
        <table class="characterTable">
          <thead><tr>
            <th>${t("Type")}</th><th>${t("Target")}</th><th>${t("Id")}</th><th>${t("From")}</th><th>${t("To")}</th><th>${t("Specialty")}</th><th></th>
          </tr></thead>
          <tbody id="characterRolesRows">${(character.roles ?? []).map(roleRow).join("")}</tbody>
        </table>
        <button id="addRoleButton" class="btn">${t("+ Role")}</button>
      </section>

      <section class="editorSection">
        <h4>${t("Relations")}</h4>
        <table class="characterTable">
          <thead><tr>
            <th>${t("Kind")}</th><th>${t("Target")}</th><th>${t("Relation")}</th><th></th>
          </tr></thead>
          <tbody id="characterRelationsRows">${relationRows(character)}</tbody>
        </table>
        <div style="display: flex; gap: 4px; align-items: center;">
          <select id="newRelationKind" style="flex: 1;" aria-label="${t("Kind")}">${RELATION_KINDS.map(kind => `<option value="${kind}">${capitalize(kind)}</option>`).join("")}</select>
          <input id="newRelationTarget" type="number" min="0" style="flex: 0 0 5em;" aria-label="${t("Target")}" />
          <select id="newRelationTier" style="flex: 1;" aria-label="${t("Relation")}">${RELATIONS.map(rel => `<option value="${rel}">${rel}</option>`).join("")}</select>
          <button id="addRelationButton" class="btn">${t("+ Relation")}</button>
        </div>
      </section>

      ${
        character.hero
          ? `<section class="editorSection">
              <h4>${t("Hero")}</h4>
              ${renderHeroSection(character.hero)}
            </section>`
          : ""
      }

      <div style="display: flex; gap: 6px; align-items: center; margin-top: 8px;">
        <button id="deleteCharacterButton" class="btn icon-trash" data-tip="${t("Remove character")}"></button>
        <span style="flex: 1;"></span>
        <button id="cancelCharacterButton" class="btn">${t("Cancel")}</button>
        ${character.hero ? "" : `<button id="promoteCharacterButton" class="btn">${t("Promote to hero")}</button>`}
        ${character.hero ? `<button id="delveCharacterButton" class="btn">${t("Delve")}</button>` : ""}
        <button id="saveCharacterButton" class="btn">${t("Save")}</button>
      </div>
    </div>`;
}

function renderHeroSection(hero: HeroSheet): string {
  const archetypes = HERO_ARCHETYPE_IDS.map(
    id =>
      `<option value="${id}" ${hero.archetype === id ? "selected" : ""}>${escapeHtml(HERO_ARCHETYPES[id].name)}</option>`
  ).join("");
  const attributes = (["might", "agility", "wits", "presence"] as const)
    .map(
      attribute =>
        `<label style="flex: 1; display: flex; flex-direction: column;">${capitalize(attribute)}<input data-attr="${attribute}" type="number" min="-1" max="2" step="1" value="${hero.attributes[attribute]}" style="width: 100%;" /></label>`
    )
    .join("");
  const actionField = (action: ActionId) =>
    `<label style="display: flex; flex-direction: column;">${escapeHtml(ACTION_DEFS[action].label)}<select data-action="${action}" style="width: 100%;">
      ${DICE.map(die => `<option value="${die}" ${hero.actions[action] === die ? "selected" : ""}>${die}</option>`).join("")}
    </select></label>`;
  const primaryActions = ACTIONS.slice(0, 6).map(actionField).join("");
  const otherActions = ACTIONS.slice(6).map(actionField).join("");
  const condition = hero.condition;

  return /* html */ `
    <div style="display: flex; gap: 4px; align-items: end; margin-bottom: 4px;">
      <label style="flex: 1; display: flex; flex-direction: column;">${t("Archetype")}<select id="characterArchetype" style="width: 100%;">${archetypes}</select></label>
      <button id="rerollHeroButton" type="button" class="btn icon-cw" data-tip="${t("Reroll the stats of this archetype")}"></button>
    </div>
    <div style="display: flex; gap: 4px; margin-bottom: 4px;">
      <label style="flex: 1; display: flex; flex-direction: column;">${t("XP")}<input id="heroXp" type="number" min="0" value="${hero.xp ?? 0}" style="width: 100%;" /></label>
      <label style="flex: 1; display: flex; flex-direction: column;">${t("Resolve")}<input id="heroResolve" type="number" value="${condition?.resolve ?? 0}" style="width: 100%;" /></label>
      <label style="flex: 1; display: flex; flex-direction: column;">${t("Stamina")}<input id="heroStamina" type="number" value="${condition?.stamina ?? 0}" style="width: 100%;" /></label>
      <label style="flex: 1; display: flex; flex-direction: column;">${t("Max Resolve")}<input id="heroMaxResolve" type="number" value="${condition?.maxResolve ?? 0}" style="width: 100%;" /></label>
      <label style="flex: 1; display: flex; flex-direction: column;">${t("Max Stamina")}<input id="heroMaxStamina" type="number" value="${condition?.maxStamina ?? 0}" style="width: 100%;" /></label>
    </div>
    <div style="display: flex; gap: 4px; margin-bottom: 4px;">${attributes}</div>
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 4px;">${primaryActions}</div>
    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 4px;">${otherActions}</div>
    <label style="display: flex; flex-direction: column;">${t("Abilities")}<textarea id="heroAbilities" style="width: 100%; height: 2.5em;">${escapeHtml((hero.abilities ?? []).join("\n"))}</textarea></label>
    <label style="display: flex; flex-direction: column;">${t("Inventory")}<textarea id="heroInventory" style="width: 100%; height: 2em;">${escapeHtml((hero.inventory ?? []).join("\n"))}</textarea></label>`;
}

function roleRow(role: HistoricalRole): string {
  return /* html */ `
    <tr class="characterRoleRow" data-role-row>
      <td><select data-role="type">${ROLE_TYPES.map(type => `<option value="${type}" ${role.type === type ? "selected" : ""}>${capitalize(type)}</option>`).join("")}</select></td>
      <td><select data-role="targetKind">${REF_KINDS.map(kind => `<option value="${kind}" ${role.target.kind === kind ? "selected" : ""}>${capitalize(kind)}</option>`).join("")}</select></td>
      <td><input data-role="targetId" type="number" min="0" value="${role.target.id}"/></td>
      <td><input data-role="from" type="number" value="${role.from}"/></td>
      <td><input data-role="to" type="number" value="${role.to ?? ""}"/></td>
      <td><input data-role="specialty" value="${escapeHtml(role.specialty ?? "")}"/></td>
      <td><button class="btn icon-trash" data-remove-role></button></td>
    </tr>`;
}

function relationRows(character: HistoricalFigure): string {
  return RELATION_KINDS.flatMap(kind => {
    const relations = character.relations?.[kind] ?? {};
    return Object.entries(relations).map(([targetId, tier]) => relationRow(kind, Number(targetId), tier));
  }).join("");
}

function relationRow(kind: RelationKind, targetId: number, tier: FactionRelation): string {
  return /* html */ `
    <tr class="characterRelationRow" data-relation-row data-kind="${kind}" data-target="${targetId}">
      <td>${capitalize(kind)}</td>
      <td>${escapeHtml(relationTargetName(kind, targetId))}</td>
      <td><select data-relation-tier>${RELATIONS.map(rel => `<option value="${rel}" ${tier === rel ? "selected" : ""}>${rel}</option>`).join("")}</select></td>
      <td><button class="btn icon-trash" data-remove-relation></button></td>
    </tr>`;
}

/** The name behind a relation's target, with its kind and id only when the target is gone */
function relationTargetName(kind: RelationKind, targetId: number): string {
  if (kind === "factions")
    return pack.factions?.find(faction => faction.i === targetId)?.name ?? `${t("Faction")} ${targetId}`;
  if (kind === "states") return pack.states?.[targetId]?.name ?? `${t("State")} ${targetId}`;
  return Characters.get(targetId)?.name ?? `${t("Character")} ${targetId}`;
}

function appendRoleRow(): void {
  findEl("characterRolesRows")?.insertAdjacentHTML(
    "beforeend",
    roleRow({ type: "ruler", target: { kind: "state", id: 1 }, from: currentYear() })
  );
}

function appendRelationRow(): void {
  const kind = ensureEl<HTMLSelectElement>("newRelationKind").value as RelationKind;
  const rawTarget = Number(ensureEl<HTMLInputElement>("newRelationTarget").value);
  const tier = ensureEl<HTMLSelectElement>("newRelationTier").value as FactionRelation;
  if (!Number.isInteger(rawTarget) || rawTarget < 0) return;
  ensureEl("characterRelationsRows").insertAdjacentHTML("beforeend", relationRow(kind, rawTarget, tier));
}

function readNumber(id: string, fallback: number): number {
  const input = findEl<HTMLInputElement>(id);
  if (!input || input.value.trim() === "") return fallback;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function readOptionalNumber(id: string): number | undefined {
  const input = findEl<HTMLInputElement>(id);
  if (!input || input.value.trim() === "") return undefined;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : undefined;
}

function readText(id: string): string {
  return findEl<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id)?.value.trim() ?? "";
}

function readList(id: string): string[] {
  const text = readText(id);
  return text
    ? text
        .split(",")
        .map(entry => entry.trim())
        .filter(Boolean)
    : [];
}

function readLines(id: string): string[] {
  const text = readText(id);
  return text
    ? text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
    : [];
}

function readRoles(): HistoricalRole[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-role-row]"))
    .map(row => {
      const type = row.querySelector<HTMLSelectElement>("[data-role='type']")?.value as HistoricalRole["type"];
      const targetKind = row.querySelector<HTMLSelectElement>("[data-role='targetKind']")?.value as HistRefKind;
      const targetId = Number(row.querySelector<HTMLInputElement>("[data-role='targetId']")?.value);
      const from = Number(row.querySelector<HTMLInputElement>("[data-role='from']")?.value);
      const toRaw = row.querySelector<HTMLInputElement>("[data-role='to']")?.value.trim();
      const specialty = row.querySelector<HTMLInputElement>("[data-role='specialty']")?.value.trim();
      if (!type || !targetKind || !Number.isFinite(targetId) || !Number.isFinite(from)) return undefined;
      return {
        type,
        target: { kind: targetKind, id: targetId },
        from,
        ...(toRaw ? { to: Number(toRaw) } : {}),
        ...(specialty ? { specialty } : {})
      } satisfies HistoricalRole;
    })
    .filter((role): role is HistoricalRole => Boolean(role));
}

function readRelations(character: Character): Character["relations"] {
  const relations: NonNullable<Character["relations"]> = { ...(character.relations ?? {}) };
  for (const kind of RELATION_KINDS) relations[kind] = {};

  for (const row of Array.from(document.querySelectorAll<HTMLElement>("[data-relation-row]"))) {
    const kind = row.dataset.kind as RelationKind;
    const target = Number(row.dataset.target);
    const tier = row.querySelector<HTMLSelectElement>("[data-relation-tier]")?.value as FactionRelation;
    if (!kind || !Number.isFinite(target) || !tier) continue;
    relations[kind]![target] = tier;
  }
  return relations;
}

function readHero(character: HistoricalFigure): HeroSheet | undefined {
  if (!character.hero) return undefined;
  const previous = character.hero;
  const archetype = (findEl<HTMLSelectElement>("characterArchetype")?.value ??
    previous.archetype ??
    "freeblade") as HeroArchetypeId;
  const attributes = { ...previous.attributes };
  for (const input of Array.from(document.querySelectorAll<HTMLInputElement>("[data-attr]"))) {
    const key = input.dataset.attr as keyof typeof attributes;
    const value = Number(input.value);
    if (key in attributes && Number.isFinite(value)) attributes[key] = Math.max(-1, Math.min(2, value));
  }

  const actions = { ...previous.actions };
  for (const select of Array.from(document.querySelectorAll<HTMLSelectElement>("[data-action]"))) {
    const key = select.dataset.action as ActionId;
    if (key in actions && DICE.includes(select.value as Die)) actions[key] = select.value as Die;
  }

  const condition: HeroCondition = {
    ...(previous.condition ?? { resolve: 0, stamina: 0, maxResolve: 0, maxStamina: 0, injuries: [] }),
    resolve: readNumber("heroResolve", previous.condition?.resolve ?? 0),
    stamina: readNumber("heroStamina", previous.condition?.stamina ?? 0),
    maxResolve: readNumber("heroMaxResolve", previous.condition?.maxResolve ?? 0),
    maxStamina: readNumber("heroMaxStamina", previous.condition?.maxStamina ?? 0)
  };

  return {
    ...previous,
    archetype,
    attributes,
    actions,
    abilities: readLines("heroAbilities"),
    inventory: readLines("heroInventory"),
    xp: readNumber("heroXp", previous.xp ?? 0),
    condition,
    progression: previous.progression
  };
}

function saveCharacter(characterId: number): void {
  const character = Characters.get(characterId);
  if (!character) return;
  const culture = readNumber("characterCulture", character.culture);

  Characters.update(characterId, {
    name: readText("characterName") || character.name,
    culture,
    birth: readNumber("characterBirth", character.birth),
    death: readOptionalNumber("characterDeath"),
    gender: readText("characterGender") || undefined,
    cell: readOptionalNumber("characterCell"),
    manual: Boolean(findEl<HTMLInputElement>("characterManual")?.checked),
    lock: Boolean(findEl<HTMLInputElement>("characterLock")?.checked),
    tags: readList("characterTags"),
    note: readText("characterNote") || undefined,
    roles: readRoles(),
    relations: readRelations(character),
    hero: readHero(character)
  });

  refreshCharacters();
  Dialog.close(detailsId);
}

function deleteCharacter(characterId: number): void {
  const character = Characters.get(characterId);
  if (!character) return;
  Dialog.confirm({
    message: `${t("Remove")} ${escapeHtml(character.name)}?`,
    onConfirm: () => {
      Characters.remove(characterId);
      refreshCharacters();
      Dialog.close(detailsId);
    }
  });
}

export const CHARACTER_CSV_COLUMNS = CSV_COLUMNS;

export function characterCsvRows(list: readonly HistoricalFigure[]): (string | number)[][] {
  return list.map(character => [
    character.i,
    character.name,
    character.culture,
    character.birth,
    character.death ?? "",
    character.gender ?? "",
    character.alignment ?? "",
    statusOf(character),
    roleSummary(character),
    factionSummary(character),
    character.hero ? "Hero" : "",
    (character.tags ?? []).join(", "),
    character.note ?? ""
  ]);
}

function exportCsv(): void {
  Csv.download("Characters", CSV_COLUMNS, characterCsvRows(Characters.all()));
}

export function importCharacterCsv(text: string): { updated: number; added: number; skipped: number } {
  const table = Csv.read(text, CSV_COLUMNS, { required: ["Name", "Culture"] });
  let updated = 0;
  let added = 0;
  let skipped = 0;

  for (const row of table.rows) {
    const name = row.Name?.trim();
    const culture = Number(row.Culture);
    if (!name || !Number.isInteger(culture) || !pack.cultures?.[culture]) {
      skipped += 1;
      continue;
    }
    const id = Number(row.Id);
    const patch = {
      name,
      culture,
      birth: row.Birth ? Number(row.Birth) : currentYear() - 25,
      death: row.Death ? Number(row.Death) : undefined,
      gender: row.Gender?.trim() || undefined,
      alignment: ALIGNMENTS.includes(row.Alignment as Alignment) ? (row.Alignment as Alignment) : undefined,
      note: row.Note?.trim() || undefined,
      tags: row.Tags
        ? row.Tags.split(",")
            .map(tag => tag.trim())
            .filter(Boolean)
        : []
    };

    if (Number.isInteger(id) && id >= 0 && Characters.get(id)) {
      Characters.update(id, patch);
      updated += 1;
    } else {
      Characters.add({ ...patch, manual: true });
      added += 1;
    }
  }

  return { updated, added, skipped };
}

function importCsv(): void {
  Csv.pick(text => {
    try {
      const result = importCharacterCsv(text);
      Dialog.message({
        title: t("Characters imported"),
        message: t("{{updated}} updated, {{added}} added, {{skipped}} skipped", {
          updated: result.updated,
          added: result.added,
          skipped: result.skipped
        })
      });
      refreshCharacters();
    } catch (error) {
      Dialog.message({ title: t("Import failed"), message: escapeHtml(String(error)) });
    }
  });
}

export const CharactersEditor = {
  open,
  close: () => Dialog.close(dialogId),
  openDetails: openCharacterDetails,
  importCsv: importCharacterCsv
};
