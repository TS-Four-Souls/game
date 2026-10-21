import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/entities/player";
import { setupStandardTestGame } from "./testHelpers";

describe("Free loot play", () => {
    let game: Game;
    let player1: Player;
    let source: ItemCard;

    beforeEach(async () => {
        const setup = await setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        source = player1.character!;
    });

    it("free card is listed after hand cards in playableCards", () => {
        const handCard = game.obtainCard("b2-a_dime") as LootCard;
        const freeCard = game.obtainCard("b2-a_nickel") as LootCard;
        player1.hand.addToHand(handCard);
        player1.hand.addFreeCard(freeCard, source);

        const playable = player1.hand.playableCards;
        expect(playable.at(-1)).toBe(freeCard);
        expect(playable.indexOf(handCard)).toBeLessThan(player1.hand.cards.length);
        expect(player1.hand.cards).not.toContain(freeCard);
    });

    it("free card can be played without remaining loot play and does not consume one", async () => {
        player1.remainingLootPlay = 0;
        const freeCard = game.obtainCard("b2-a_nickel") as LootCard;
        player1.hand.addFreeCard(freeCard, source);

        expect(game.actions.canPlayCard(player1)).not.toBe(true);
        expect(game.actions.canPlayCard(player1, false, freeCard)).toBe(true);

        const initialCoins = player1.coins;
        game.actions.playCard(player1, player1.hand.cards.length);
        await game.actions.resolveStack();

        expect(player1.coins).toBe(initialCoins + 5);
        expect(player1.remainingLootPlay).toBe(0);
        expect(player1.hand.freeCards.length).toBe(0);
    });

    it("playing a free card keeps the regular loot play available", async () => {
        player1.remainingLootPlay = 1;
        const freeCard = game.obtainCard("b2-a_nickel") as LootCard;
        player1.hand.addFreeCard(freeCard, source);

        game.actions.playCard(player1, player1.hand.cards.length);
        await game.actions.resolveStack();

        expect(player1.remainingLootPlay).toBe(1);
    });

    it("revoking a free card removes it", () => {
        const freeCard = game.obtainCard("b2-a_nickel") as LootCard;
        const revoke = player1.hand.addFreeCard(freeCard, source);
        revoke();

        expect(player1.hand.isFree(freeCard)).toBe(false);
        expect(player1.hand.playableCards).not.toContain(freeCard);
    });

    it("serializes free cards in hand with their source", () => {
        const freeCard = game.obtainCard("b2-a_nickel") as LootCard;
        player1.hand.addFreeCard(freeCard, source);

        const hand = game.detailedStateJSON(player1).me.hand;
        const last = hand.at(-1)!;
        expect(last.slug).toBe(freeCard.slug);
        expect(last.free?.slug).toBe(source.slug);
    });
});
