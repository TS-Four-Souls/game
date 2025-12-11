import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard } from "@/models/cards";
import { InplayType, MonsterCard } from "@/models/cards";
import { effectParser, inplayCurseSelector, type ChooseOneOptions, type ChooseOneResult } from "@/models/effect";
import { chooseOneEffect } from "@/models/effect";
describe("Loot Card", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.start(player1);
    });

    it("Swallowed Penny: should give one coin on player takes damage if player is issuer.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.dealDamage(player2, player1, loot, 1); // No effect yet, not in play
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player2, player1, loot, 1);
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        game.endTurn();
        player1.addHealthPoints(10); // Heal back for clarity

        game.dealDamage(player2, player1, loot, 2);
        expect(player1.coins).toBe(initialCoins + 2);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });

    it("Swallowed Penny: remove in play should remove effect.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.dealDamage(player2, player1, loot, 1); // No effect yet, not in play
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player2, player1, loot, 1);
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        game.removeInPlay(player1, loot);

        game.dealDamage(player2, player1, loot, 2);
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 4);

        game.dealDamage(player1, player2, loot, 1);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });


    it("Bloody Penny: should loot one on any player death.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;

        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2
        expect(player1.hand.cards.length).toBe(initialHandSize + 1); // Looted 1
        expect(player2.isDead).toBe(true);
        
        game.endTurn();
        expect(player2.isDead).toBe(false); // Revived at turn end
        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2 again
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1
        expect(player2.isDead).toBe(true);

        game.dealDamage(player2, player1, loot, player1.currentHealthPoints); // Kill player 1
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1 but discarded on death.
        expect(player1.isDead).toBe(true);

        game.endTurn();
        const handSizeTurn3 = player1.hand.cards.length;
        expect(player1.isDead).toBe(false); // Revived at turn end
        expect(player2.isDead).toBe(false); // Revived at turn end
        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2 again
        expect(player1.hand.cards.length).toBe(handSizeTurn3); // Looted 1
        expect(player2.isDead).toBe(true);
    });

    it("Bloody Penny: should NOT loot on monster death.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;
        const monster = game.monsters[0]!;
        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player1, monster, loot, monster.currentHealthPoints); // Kill monster
        expect(player1.hand.cards.length).toBe(initialHandSize); // Looted 1
    });

    it("Counterfeit Penny: add one coins to your coin gain.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-counterfeit_penny")!;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        // gain x + 1 coins.
        game.gainCoins(player1, 2);
        expect(player1.coins).toBe(initialCoins + 3);
        
        // no gain when gaining 0 coins.
        game.gainCoins(player1, 0);
        expect(player1.coins).toBe(initialCoins + 3);

        // no effect for other players nor on other players' coin gain.
        game.gainCoins(player2, 5);
        expect(player2.coins).toBe(initialCoins2 + 5);
        expect(player1.coins).toBe(initialCoins + 3);

        // lose coins should not be affected.
        expect(game.loseCoins(player1, initialCoins + 3, false)).toBe(initialCoins + 3); // reset coins
        expect(player1.coins).toBe(0);

        game.removeInPlay(player1, loot);

        // gain x coins normally after removal.
        game.gainCoins(player1, 4);
        expect(player1.coins).toBe(4);
    });
});