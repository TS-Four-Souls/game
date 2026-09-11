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
