// This file tests various effects that don't require an entire file.
// It covers:
//  - Bonus Soul effects


import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/player";
import { type ItemCard, type LootCard, type CharacterCard, treasureCard } from "@/models/cards";



describe("Before start effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.setupGame();
    });

    it("Cain plays first", () => {
        const cain = game.decks["character"]!.getCardFromSlug("b2-cain")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [isaac, cain]);
        expect(game.currentPlayer).toBe(player2);
    });

    it("Eden gets a treasure and set it eternal", () => {
        const eden = game.decks["character"]!.getCardFromSlug("b2-eden")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [isaac, eden]);
        expect(player2.inPlay[0]!.slug).toBe("b2-eden");
        expect(player2.inPlay.length).toBe(2);
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[1]! instanceof treasureCard).toBe(true);
    });

});

describe("Bonus Soul effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.setupGame();
        const eve = game.decks["character"]!.getCardFromSlug("b2-eve")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [isaac, eve]);
    });

    it("Greed", () => {
        const initSoul = player1.totalSouls;
        game.gainCoins(player1, 24);
        expect(player1.coins).toBe(24);
        expect(player1.totalSouls).toBe(initSoul);
        game.gainCoins(player1, 1);
        expect(player1.totalSouls).toBe(initSoul + 1);

        // only one player gets the soul bonus
        const player2souls = player2.totalSouls;
        game.gainCoins(player2, 24);
        expect(player2.coins).toBe(24);
        expect(player2.totalSouls).toBe(player2souls);
        game.gainCoins(player2, 1);
        expect(player2.totalSouls).toBe(player2souls);
    });

    it("Gluttony", () => {
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

    it("Guppy combination 1", () => {
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

    it("Guppy combination 2", () => {
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

    it("Guppy combination 3", () => {
        const initSoul = player1.totalSouls;
        const guppyItem1 = game.decks["loot"]!.getCardFromSlug("b2-guppys_hairball");
        const guppyItem2 = game.shop.obtainCard("b2-guppys_collar");
        if (!guppyItem1 || !guppyItem2)
            throw new Error("Guppy items not found in treasure deck");
        player1.hand.addToHand(guppyItem1);
        game.playCard(player1, 1); // Play guppy's hairball
        game.resolveStack();
        expect(player1.totalSouls).toBe(initSoul);
        game.addInPlay(player1, guppyItem2);
        expect(player1.totalSouls).toBe(initSoul + 1);
    });

});