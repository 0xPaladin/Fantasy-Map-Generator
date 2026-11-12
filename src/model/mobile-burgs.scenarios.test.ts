// @vitest-environment jsdom
// Mobile wanderers on real generated maps: placement determinism and shape
import { expect, it } from "vitest";
import type { BurgRealm } from "./political/burgs-generator";
import { generateMap, living } from "./real-map.testing";

it("mobile wanderers appear deterministically for the same seed", async () => {
  await generateMap({ seed: "wander-a" });

  const wanderers = living(pack.burgs).filter(burg => burg.mobile);

  expect(wanderers.length).toBeGreaterThan(0);
  const positions = wanderers.map(burg => [burg.cell, burg.heading, burg.altitude]);

  await generateMap({ seed: "wander-a" });
  const sameSeed = living(pack.burgs)
    .filter(burg => burg.mobile)
    .map(burg => [burg.cell, burg.heading, burg.altitude]);
  expect(sameSeed).toEqual(positions);

  await generateMap({ seed: "wander-b" });
  const otherSeed = living(pack.burgs)
    .filter(burg => burg.mobile)
    .map(burg => [burg.cell, burg.heading, burg.altitude]);
  expect(otherSeed).not.toEqual(positions);
});

it("wanderers span the realm archetypes and keep to their altitude bands", async () => {
  await generateMap({ seed: "wander-a" });

  const wanderers = living(pack.burgs).filter(burg => burg.mobile);

  const realms = new Set<BurgRealm>(
    wanderers.map(burg =>
      burg.flying
        ? "sky"
        : burg.underdark
          ? "underdark"
          : burg.underwater
            ? "underwater"
            : burg.titan
              ? "titan"
              : "horde"
    )
  );

  // wanderers round-robin through the enabled archetypes
  expect(realms.size).toBeGreaterThanOrEqual(2);
  for (const burg of wanderers) {
    expect(burg.mobility).toBe("drift");
    if (burg.flying) expect(burg.altitude).toBeGreaterThanOrEqual(50);
    if (burg.underdark || burg.underwater) expect(burg.altitude).toBeLessThanOrEqual(-50);
    else if (burg.titan || burg.horde) expect(burg.altitude ?? 0).toBe(0);
  }
});
