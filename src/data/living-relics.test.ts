import { describe, expect, it } from "vitest";
import type { GuildState, HistoricalRelic, RelicHolder } from "@/types/living";
import { reserveRelics, vaultHasRoom, vaultLimit, vaultRelics } from "./living-relics";

const relic = (id: number, holder: RelicHolder): HistoricalRelic => ({
  id,
  name: `Relic ${id}`,
  category: "regalia",
  lore: "An old thing of power.",
  originYear: 900,
  bonuses: { s: 2 },
  holder
});

const guild = (tier: number, relics: HistoricalRelic[]): Pick<GuildState, "tier" | "relics"> => ({ tier, relics });

describe("living-relics vault helpers", () => {
  it("allows one active relic per guild tier", () => {
    expect(vaultLimit(guild(3, []))).toBe(3);
    expect(vaultLimit(guild(0, []))).toBe(1);

    const relics = [relic(1, { kind: "vault" }), relic(2, { kind: "reserve" })];
    expect(vaultHasRoom(guild(2, relics))).toBe(true);
    expect(vaultHasRoom(guild(1, relics))).toBe(false);
  });

  it("separates vaulted, reserve and carried relics", () => {
    const relics = [
      relic(1, { kind: "vault" }),
      relic(2, { kind: "reserve" }),
      relic(3, { kind: "figure", id: 5 }),
      relic(4, { kind: "state", id: 1 })
    ];

    expect(vaultRelics(relics).map(relic => relic.id)).toEqual([1]);
    expect(reserveRelics(relics).map(relic => relic.id)).toEqual([2]);
  });
});
