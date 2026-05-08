// This file tests various effects that don't require an entire file.
// It covers:
//  - Bonus Soul effects


import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/entities/player";
import { type ItemCard, type LootCard, type CharacterCard, TreasureCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections, setupTestGame, type GameSetupResult } from "@/tests/testHelpers";


function setupGameWithCharacters(characterSlugs: string[]): GameSetupResult
{
    return setupTestGame({
        characters: characterSlugs,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
        treasureDeck: ["b2-blank_card", "b2-placebo", "b2-tech_x"],
        playerCount: characterSlugs.length,
    });
}
    
describe("Before start effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
    });

    it("Cain plays first", async () => {
        const setup = setupGameWithCharacters(["b2-isaac", "b2-cain"]);
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(game.currentPlayer).toBe(player2);
    });

    it("Eden gets a treasure and set it eternal", async () => {
        const setup = setupGameWithCharacters(["b2-isaac", "b2-eden"]);
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        // Wait for async event handlers to complete
        await new Promise(resolve => setTimeout(resolve, 10));
      dischargeEachItemsAndRemoveCoins(game);
      emptyHands(game);
            expect(player2.inPlay[0]!.slug).toBe("b2-eden");
        expect(player2.inPlay.length).toBe(2);
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[1]! instanceof TreasureCard).toBe(true);
    });

    it("Character card activation gives a loot play (random characters)", async () => {
        const setup = setupGameWithCharacters(["b2-samson", "b2-isaac"]);
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(game.players.length).toBe(2);
        const character1 = player1.inPlay[0] as CharacterCard;
        const character2 = player2.inPlay[0] as CharacterCard;
        game.resolveEntireStack();
        expect(game.stack.size).toBe(0);
        if(!character1 || !character2)
            throw new Error("Characters not found");
        const initialLootPlays1 = player1.remainingLootPlay;
        const initialLootPlays2 = player2.remainingLootPlay;
        character1.recharge();
        await game.activateItem(player1, character1, );
        await game.resolveEntireStack();
        expect(game.stack.size).toBe(0);
        expect(player1.remainingLootPlay).toBe(initialLootPlays1 + 1);
        expect(game.activateItem(player1, character1, )).rejects.toThrow(); // uncharged tap should do nothing
        await game.resolveEntireStack();
        expect(player1.remainingLootPlay).toBe(initialLootPlays1 + 1);
        character2.recharge();
        await game.activateItem(player2, character2, );
        await game.resolveEntireStack();
        expect(player2.remainingLootPlay).toBe(initialLootPlays2 + 1);

        game.currentPlayer.clearAttackRequirement(); // If krampus is visible, the test can fail because of it requiring an attack declaration before ending the turn
        await game.endTurn();
        await game.resolveEntireStack();
        // Ensure the loot play resets at the start of the turn
        expect(game.players.filter(p => p.id !== game.currentPlayer.id)[0]!.remainingLootPlay).toBe(0);
        expect(game.currentPlayer.remainingLootPlay).toBeGreaterThanOrEqual(1);
    });

});

describe("Bonus Soul effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
                            characters: ["b2-judas", "b2-isaac"],
                            monsters: ["b2-fly", "b2-fatty"],
                            monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                            treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                            bonusSouls: [],
                            playerCount: 2
                        });
            game = setup.game;
            player1 = setup.player1;
            player2 = setup.player2!;
        });

    it("Greed", async () => {
        const initSoul = player1.totalSouls;
        game.gainCoins(player1, 24, "gift");
        expect(player1.coins).toBe(24);
        expect(player1.totalSouls).toBe(initSoul);
        game.gainCoins(player1, 1, "gift");
        expect(player1.totalSouls).toBe(initSoul + 1);

        // only one player gets the soul bonus
        const player2souls = player2.totalSouls;
        game.gainCoins(player2, 24, "gift");
        expect(player2.coins).toBe(24);
        expect(player2.totalSouls).toBe(player2souls);
        game.gainCoins(player2, 1, "gift");
        expect(player2.totalSouls).toBe(player2souls);
    });

    it("Gluttony", async () => {
        const initSoul = player1.totalSouls;
        game.loot(player1, 9);
        expect(player1.totalSouls).toBe(initSoul);
        game.loot(player1, 1);
        expect(player1.totalSouls).toBe(initSoul + 1);

        // only one player gets the soul bonus
        const player2souls = player2.totalSouls;
        game.loot(player2, 9);
        expect(player2.totalSouls).toBe(player2souls);
        game.loot(player2, 1);
        expect(player2.totalSouls).toBe(player2souls);
    });

    it("Guppy combination 1", async () => {
        const initSoul = player1.totalSouls;
        const guppyItem1 = game.shop.obtainCard("b2-guppys_head");
        const guppyItem2 = game.shop.obtainCard("b2-guppys_collar");
        if(!guppyItem1 || !guppyItem2)
            throw new Error("Guppy items not found in treasure deck");
        game.addInPlay(player1, guppyItem1);
        expect(player1.totalSouls).toBe(initSoul);
        game.addInPlay(player1, guppyItem2);
        expect(player1.totalSouls).toBe(initSoul + 1);

        // only one player gets the soul bonus
        const player2souls = player2.totalSouls;
        game.addInPlay(player2, guppyItem1);
        expect(player2.totalSouls).toBe(player2souls);
        game.addInPlay(player2, guppyItem2);
        expect(player2.totalSouls).toBe(player2souls);

    });

    it("Guppy combination 2", async () => {
        const initSoul = player1.totalSouls;
        const guppyItem1 = game.shop.obtainCard("b2-guppys_paw")
        const guppyItem2 = game.shop.obtainCard("b2-guppys_collar");
        if (!guppyItem1 || !guppyItem2)
            throw new Error("Guppy items not found in treasure deck");
        game.addInPlay(player1, guppyItem1);
        expect(player1.totalSouls).toBe(initSoul);
        game.addInPlay(player1, guppyItem2);
        expect(player1.totalSouls).toBe(initSoul + 1);
    });

    it("Guppy combination 3", async () => {
        const initSoul = player1.totalSouls;
        const guppyItem1 = game.obtainCard("b2-guppys_hairball") as LootCard;
        const guppyItem2 = game.shop.obtainCard("b2-guppys_collar");
        if (!guppyItem1 || !guppyItem2)
            throw new Error("Guppy items not found in treasure deck");
        player1.hand.addToHand(guppyItem1);
        game.addInPlay(player1, guppyItem2);
        expect(player1.totalSouls).toBe(initSoul);
        game.playCard(player1, 0); // Play guppy's hairball
        await game.resolveStack();
        expect(player1.totalSouls).toBe(initSoul + 1);
    });
});