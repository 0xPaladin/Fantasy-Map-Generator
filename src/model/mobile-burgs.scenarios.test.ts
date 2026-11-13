// @vitest-environment jsdom
// Mobile wanderers on real generated maps: placement determinism and shape
import { expect, it } from "vitest";
import { type BurgRealm, Burgs } from "./political/burgs-generator";
import { generateMap, living, riskEdit, violations } from "./real-map.testing";

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

it("a wanderer-enabled map passes every integrity rule", async () => {
  await generateMap({ seed: "wander-a" });
  expect(violations().size).toBe(0);
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

it("the surface map stays byte-identical with and without wanderers", async () => {
  options.map.population.wanderers = 0;
  try {
    await generateMap({ seed: "wander-a" });
    const surfaceOnly = living(pack.burgs).map(burg => [
      burg.i,
      burg.cell,
      burg.state,
      burg.culture,
      burg.capital,
      burg.port ? 1 : 0,
      burg.name
    ]);

    options.map.population.wanderers = 2;
    await generateMap({ seed: "wander-a" });
    const withWanderers = living(pack.burgs)
      .filter(burg => !burg.mobile)
      .map(burg => [burg.i, burg.cell, burg.state, burg.culture, burg.capital, burg.port ? 1 : 0, burg.name]);
    expect(withWanderers).toEqual(surfaceOnly);
  } finally {
    options.map.population.wanderers = 2;
  }
});

it("regenerating burgers keeps a locked mobile and drops the rest, staying consistent", async () => {
  await generateMap({ seed: "wander-a" });
  const mobiles = living(pack.burgs).filter(burg => burg.mobile);
  expect(mobiles.length).toBeGreaterThan(0);

  const locked = mobiles[0]!;
  locked.lock = true;
  Burgs.regenerate();

  const after = living(pack.burgs).filter(burg => burg.mobile);
  expect(after).toHaveLength(1); // the locked wanderer is all that survives
  expect(after[0]!.cell).toBe(locked.cell); // but it kept its place
  expect(after[0]!.mobility).toBe(locked.mobility); // drift is drift
  // the only fallout is the accepted centerless-market state a regenerate leaves until markets are re-rolled; nothing mobile-specific
  expect([...violations().keys()]).toEqual(["market-centers"]);
});

it("a mobile wandering across a water gap survives the restore, keeping its name and treasury", async () => {
  await generateMap({ seed: "wander-a" });
  const wanderer = living(pack.burgs).find(burg => burg.mobile);
  expect(wanderer).toBeDefined();

  const gridCell = pack.cells.g[wanderer!.cell];
  const before = {
    i: wanderer!.i,
    name: wanderer!.name,
    population: wanderer!.population,
    treasury: wanderer!.treasury,
    mobile: wanderer!.mobile,
    titan: wanderer!.titan,
    horde: wanderer!.horde
  };

  riskEdit(heights => {
    heights[gridCell] = 0; // the island the wanderer stands on sinks under the sea
  }, false);

  const restored = pack.burgs.find(burg => burg.i === before.i);
  expect(restored).toBeDefined();
  expect(restored!.removed).toBeFalsy();
  expect(restored!.mobile).toBe(before.mobile); // still a wanderer
  expect(restored!.titan).toBe(before.titan);
  expect(restored!.horde).toBe(before.horde);
  expect(restored!.name).toBe(before.name); // its identity survived the drowning
  expect(restored!.population).toBeCloseTo(before.population!, 2);
  expect(restored!.treasury).toBe(before.treasury);
});
