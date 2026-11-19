// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { living, charactersOpen } = vi.hoisted(() => ({
  living: {
    forceSchemeStep: vi.fn(() => true),
    exposeScheme: vi.fn(() => true),
    abortScheme: vi.fn(() => true),
    rerollScheme: vi.fn(() => true)
  },
  charactersOpen: vi.fn()
}));

vi.mock("@/model/physical/living-generator", () => ({ Living: living }));
vi.mock("@/controllers", () => ({ Controllers: { CharactersEditor: { openDetails: charactersOpen } } }));

import { SchemesOverview } from "@/controllers/schemes-overview";
import type { PackedGraph } from "@/types/packed-graph";
import { Dialog } from "@/ui/dialog/dialog";

describe("SchemesOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="dialogs"></div>`;
    globalThis.options = { map: { lore: { calendar: { year: 1000 } } } } as unknown as typeof options;
    globalThis.pack = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Testland" }
      ],
      states: [{ i: 0 }, { i: 1, name: "Aeloria" }],
      burgs: [{ i: 0 }, { i: 1, name: "Aelor", cell: 1 }],
      religions: [
        { i: 0, name: "None" },
        { i: 1, name: "Nerath's Creed" }
      ],
      factions: [{ i: 0 }],
      history: {
        events: [],
        realms: [],
        eras: [],
        figures: [{ i: 0, name: "Nerath", culture: 1, birth: 900, roles: [] }],
        schemes: [
          {
            i: 1,
            goal: "divine_ascension",
            mastermind: { kind: "religion", id: 1 },
            keystone: "religion:1",
            villainFigure: 0,
            template: "holy_crusade",
            secrecy: 34,
            steps: [
              { verb: "research_lore", targets: [{ kind: "burg", id: 1 }], status: "active", progress: 2, attempts: 1 },
              { verb: "perform_ritual", targets: [], status: "pending" }
            ],
            status: "active",
            startedYear: 990
          }
        ]
      }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    Dialog.destroy("schemeOverview");
  });

  it("renders a villain's scheme and runs its actions", () => {
    SchemesOverview.open({ schemeId: 1 });

    const dialog = document.getElementById("schemeOverview")!;
    expect(dialog.textContent).toContain("Divine Ascension");
    expect(dialog.textContent).toContain("Holy Crusade");
    expect(dialog.textContent).toContain("Nerath");
    expect(dialog.textContent).toContain("Research lore");
    expect(dialog.textContent).toContain("2 seasons left");
    expect(dialog.textContent).toContain("1 push");

    (dialog.querySelector('[data-god="scheme-force"]') as HTMLButtonElement).click();
    expect(living.forceSchemeStep).toHaveBeenCalledWith(1);

    (dialog.querySelector('[data-open="figure"]') as HTMLButtonElement).click();
    expect(charactersOpen).toHaveBeenCalledWith(0);
  });
});
