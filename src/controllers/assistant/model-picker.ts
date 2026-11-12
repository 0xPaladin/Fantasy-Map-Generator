// The model picker: a small modal with a filter input and a dropdown, opened from the footer's model name

import { Dialog } from "@/ui/dialog/dialog";
import { t } from "@/utils/i18n";

/** Open the picker over the current model; `onSelect` gets the chosen id, only when one is picked */
export function openModelPicker(models: string[], current: string, onSelect: (model: string) => void): void {
  const wrapper = document.createElement("div");
  wrapper.id = "assistantModelPicker";
  const filter = document.createElement("input");
  filter.id = "assistantModelFilter";
  filter.className = "assistantModelPickerFilter";
  filter.type = "text";
  filter.placeholder = t("Filter");
  filter.autocomplete = "off";
  filter.spellcheck = false;
  filter.setAttribute("aria-label", t("Filter"));
  const select = document.createElement("select");
  select.id = "assistantModelSelect";
  select.className = "assistantModelPickerSelect";

  const wanted = [...new Set([current, ...models].filter(Boolean))];
  const render = (): void => {
    const query = filter.value.trim().toLowerCase();
    const matching = wanted.filter(model => !query || model.toLowerCase().includes(query));
    const previous = select.value;
    select.replaceChildren(
      ...(matching.length ? matching.map(model => new Option(model, model)) : [new Option(t("No models match"), "")])
    );
    select.disabled = !matching.length;
    select.value = matching.includes(previous) ? previous : (matching[0] ?? "");
  };
  filter.addEventListener("input", render);
  select.addEventListener("dblclick", () => selectButton().click());
  filter.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      selectButton().click();
    }
  });

  wrapper.append(filter, select);

  /** The dialog's first button is Select; it keeps the window open when nothing is picked */
  const selectButton = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>(".dialog-window .dialog-buttonset > button")!;

  /** The window's Select handler; `false` keeps it open when the filter matched nothing */
  const onConfirm = (): boolean => {
    if (select.disabled) return false;
    const model = select.value;
    if (model) onSelect(model);
    return true;
  };

  Dialog.message({
    id: "assistantModelPicker",
    title: t("Models"),
    message: wrapper,
    width: "26em",
    modal: true,
    buttons: [{ label: t("Select"), onClick: onConfirm }, { label: t("Cancel") }]
  });
  render();
  filter.focus();
}
