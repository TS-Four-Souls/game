import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, treasureCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { effectParser, inplayCurseSelector, inplayUnchargedItemSelector, type ChooseOneOptions, type ChooseOneResult } from "@/models/effectParser";

describe("Treasure - Permanent Modifiers", () => {
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
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [samson, isaac]);
    });
    // "Each time a player rolls a ❺, gain 3¢."
    it("eye_of_greed", () => {

        const eyeOfGreed = game.shop.obtainCard("b2-eye_of_greed")! as treasureCard;
        game.addInPlay(player1, eyeOfGreed);
        const initialCoins = player2.coins;
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);

        // First attack roll - should not trigger the effect
        game.attackRoll(player1, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack();
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins);

        // Second attack roll - should trigger the effect
        game.attackRoll(player1, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = 5; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        expect(player1.coins).toBe(initialCoins + 3);
        expect(game.stack.size).toBe(0);

        // card roll
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const playCard = game.playCard(player1, 1);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = 5; // Triggering roll
        }
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 6);
    });

    // "Each time a player rolls a ❶, loot 1."
    it("the_relic", () => {
        const correctValue = 1;
        const theRelic = game.shop.obtainCard("b2-the_relic")! as treasureCard;
        game.addInPlay(player1, theRelic);
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const initialHandLength = player1.hand.length;
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandLength);

        // Second attack roll - should trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandLength + 1);
        expect(game.stack.size).toBe(0);

        // card roll
        const playCard = game.playCard(player1, 1);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        game.resolveStack();
        expect(player1.hand.length).toBe(initialHandLength + 2);
    });

    // "Each time a player rolls a ❶, you may recharge this."
    it("sack_of_pennies", () => {
        const correctValue = 1;
        const sack = game.shop.obtainCard("b2-sack_of_pennies")! as treasureCard;
        game.addInPlay(player1, sack);
        sack.charged = false;
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(sack.charged).toBe(false);

        // Second attack roll - should trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(sack.charged).toBe(true);
        expect(game.stack.size).toBe(0);
        sack.charged = false;

        // card roll
        const playCard = game.playCard(player1, 1);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        game.resolveStack();
        expect(sack.charged).toBe(true);
    });

    // "Each time a player rolls a ❷, you may recharge an item."
    it("charged_baby", () => {
        const correctValue = 2;
        const baby = game.shop.obtainCard("b2-charged_baby")! as treasureCard;
        const recharged = game.select(player1, 1, inplayUnchargedItemSelector(game)(player1), true).selected[0] as Card;
        game.addInPlay(player1, baby);
        recharged.charged = false;
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(recharged.charged).toBe(false);

        // Second attack roll - should trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(recharged.charged).toBe(true);
        expect(game.stack.size).toBe(0);
        recharged.charged = false;

        // card roll
        const playCard = game.playCard(player1, 1);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        game.resolveStack();
        expect(recharged.charged).toBe(true);
    });
    
    // "Each time a player rolls a ❹, you may loot 1, then discard a loot card."
    it("moms_box", () => {
        
        const correctValue = 4;
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-moms_box")! as treasureCard;
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initialHandSize = player1.hand.length;

        // First attack roll - should not trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandSize);

        let cardToDiscard = game.decks["loot"]!.cards[0]!;
        let cardToAdd = game.decks["loot"]!.cards[0]!;
        // Second attack roll - should trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize); // looted 1, discarded 1
        expect(player1.hand.cards).not.toContain(cardToDiscard);
        expect(game.decks["loot"]!.discard).toContain(cardToDiscard);
        

        // card roll
        player1.hand.addToHand(card);
        game.loot(player1, 1);
        cardToDiscard = player1.hand.cards[1]!;
        cardToAdd = game.decks["loot"]!.cards[0]!;
        expect(game.stack.size).toBe(0);
        const playCard = game.playCard(player1, 1);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        game.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 1 + 3); // looted 1, pill trigger loot 3.
        expect(player1.hand.cards).toContain(cardToAdd);
        expect(player1.hand.cards).not.toContain(cardToDiscard);
        expect(game.decks["loot"]!.discard).toContain(cardToDiscard);
    });

    // b2 - tarot_cloth    "Each time a player rolls a ❹, they must give you a loot card."
    // b2 - cheese_grater    "Each time a player rolls a ❻, reveal the top card of any deck. Put it back or put it into discard."
    // b2 - dead_bird    "Each time a player rolls a ❸, you may look at their hand and steal a loot card from them."
    // b2 - moms_razor    "Each time a player rolls a ❻, you may deal 1 damage to them."

    // "Each time a player rolls a ❹, they must give you a loot card."
    it("tarot_cloth", () => {

        const correctValue = 4;
        const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-tarot_cloth")! as treasureCard;
        game.loot(player2, 1);
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initialHandSize = player1.hand.length;

        // First attack roll - should not trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandSize);

        let cardToSteal = player2.hand.cards[0]!;
        // Second attack roll - should trigger the effect
        game.attackRoll(player2, monster);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        game.resolveStack(); // roll resolution
        game.resolveStack(); // damage resolution
        game.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 1); // steal 1
        expect(player1.hand.cards).toContain(cardToSteal);
        expect(player2.hand.cards).not.toContain(cardToSteal);


        // card roll
        game.loot(player2, 1);
        player2.hand.addToHand(card);
        cardToSteal = player2.hand.cards[0]!;
        expect(game.stack.size).toBe(0);
        const playCard = game.playCard(player2, 2);
        game.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        game.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 2); // stolen 2, pill trigger loot 3.
        expect(player1.hand.cards.map(card => card.slug)).toContain(cardToSteal.slug);
        expect(player2.hand.cards.map(card => card.slug)).not.toContain(cardToSteal.slug);
    });
});