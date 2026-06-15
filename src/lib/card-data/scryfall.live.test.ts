import { describe, it, expect } from "vitest";
import { resolveCards } from "./resolve";

/**
 * Opt-in live smoke test against the real Scryfall API. Skipped unless RUN_LIVE
 * is set, so the default `npm run test` never touches the network. Run with:
 *
 *   RUN_LIVE=1 npx vitest run src/lib/card-data/scryfall.live.test.ts
 */
const RUN_LIVE = Boolean(process.env.RUN_LIVE);

describe.skipIf(!RUN_LIVE)("Scryfall live smoke test", () => {
  it("resolves real cards, a DFC, and suggests a correction for a typo", { timeout: 20000 }, async () => {
    const result = await resolveCards(["Sol Ring", "Llanowar Elves", "Delver of Secrets", "Lightnig Bolt", "Notacard"]);

    const llanowar = result.resolved.find((card) => card.name === "Llanowar Elves");
    expect(llanowar).toBeDefined();
    expect(llanowar?.category).toBe("creature");
    expect(llanowar?.imageUrl).toBeTruthy();
    expect(llanowar?.priceUsd ?? llanowar?.priceEur).not.toBeNull();

    const delver = result.resolved.find((card) => card.name.startsWith("Delver of Secrets"));
    expect(delver).toBeDefined();
    expect(delver?.category).toBe("creature");
    expect(delver?.imageUrl).toBeTruthy();

    const typo = result.unresolved.find((entry) => entry.name === "Lightnig Bolt");
    expect(typo?.suggestion).toBe("Lightning Bolt");

    const gibberish = result.unresolved.find((entry) => entry.name === "Notacard");
    expect(gibberish?.reason).toBe("not-found");
    expect(gibberish?.suggestion).toBeNull();
  });
});
