import { describe, expect, it } from "bun:test";
import { Game } from "@/models/game";
import { GameParameters } from "@/models/gameParameters";
import type { DeckConfigPatch } from "@/shared/api";

describe("Game parameter handoff", () => {
  it("preserves custom deck counts when starting a game", () => {
    const params = new GameParameters(() => {});
    const slug = params.monster.cardsParam[0]!.card.slug;

    params.setParameterByKey("decksConfig", {
      monster: [{ slug, count: 5 }],
    } as DeckConfigPatch);

    const game = new Game("parameter-handoff-test", params);
    const copiedCard = game.gameParameters.monster
      .json()
      .find((card) => card.slug === slug);

    expect(params.deckMode).toBe("custom");
    expect(game.gameParameters.deckMode).toBe("custom");
    expect(copiedCard?.count).toBe(5);
  });
});

describe("Game parameter input guards", () => {
  it("ignores non-finite numeric values and rounds before clamping", () => {
    const params = new GameParameters(() => {});
    const card = params.monster.cardsParam[0]!;
    const before = card.param.value;

    params.monster.setCardParameter(card.card.slug, Number.NaN);
    expect(card.param.value).toBe(before);
    params.monster.setCardParameter(card.card.slug, Infinity);
    expect(card.param.value).toBe(before);

    card.param.value = 2.6;
    expect(card.param.value).toBe(3);
    card.param.value = "4" as unknown as number;
    expect(card.param.value).toBe(3);
  });

  it("ignores non-boolean values for boolean parameters", () => {
    const params = new GameParameters(() => {});
    const before = params.useB2Cards.value;
    params.useB2Cards.value = "false" as unknown as boolean;
    expect(params.useB2Cards.value).toBe(before);
  });
});
