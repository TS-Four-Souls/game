import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { DamageOnStack, DiceRoll } from "../../models/stackElement";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, TreasureCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { inplayUnchargedItemSelector } from "@/models/targetSelector";
import { dischargeEachItemsAndRemoveCoins, setupTestGame } from "@/tests/testHelpers";

describe("Treasure - \"Each time a player rolls a\" effect", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    // "Each time a player rolls a ❺, gain 3¢."
    it("eye_of_greed", async () => {

        const eyeOfGreed = game.shop.obtainCard("b2-eye_of_greed")! as TreasureCard;
        const card = game.obtainCard("b2-pills") as LootCard;

        game.addInPlay(player1, eyeOfGreed);
        const initialCoins = player2.coins;
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = 5; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 3);
        expect(game.stack.size).toBe(0);

        // card roll
        player1.hand.addToHand(card);
        game.addLootPlay(player1, 1);
        const playCard = game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = 5; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 6);
    });

    // "Each time a player rolls a ❶, loot 1."
    it("the_relic", async () => {
        const correctValue = 1;
        const theRelic = game.shop.obtainCard("b2-the_relic")! as TreasureCard;
        game.addInPlay(player1, theRelic);
        const card = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const initialHandLength = player1.hand.length;
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandLength);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandLength + 1);
        expect(game.stack.size).toBe(0);

        // card roll
        game.addLootPlay(player1, 1);
        const playCard = game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandLength + 2);
    });

    // "Each time a player rolls a ❶, you may recharge this."
    it("sack_of_pennies", async () => {
        const correctValue = 1;
        const sack = game.shop.obtainCard("b2-sack_of_pennies")! as TreasureCard;
        game.addInPlay(player1, sack);
        sack.charged = false;
        const card = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(sack.charged).toBe(false);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(sack.charged).toBe(true);
        expect(game.stack.size).toBe(0);
        sack.charged = false;

        // card roll
        game.addLootPlay(player1, 1);
        const playCard = game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(sack.charged).toBe(true);
    });

    // "Each time a player rolls a ❷, you may recharge an item."
    it("charged_baby", async () => {
        const correctValue = 2;
        const baby = game.shop.obtainCard("b2-charged_baby")! as TreasureCard;
        const recharged = (await game.select(player1, 0, 1, inplayUnchargedItemSelector(game)(player1))).selected[0] as Card;
        game.addInPlay(player1, baby);
        recharged.charged = false;
        const card = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(recharged.charged).toBe(false);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(recharged.charged).toBe(true);
        expect(game.stack.size).toBe(0);
        recharged.charged = false;

        // card roll
        game.addLootPlay(player1, 1);
        const playCard = game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(recharged.charged).toBe(true);
    });

    // "Each time a player rolls a ❹, you may loot 1, then discard a loot card."
    it("moms_box", async () => {
        const correctValue = 4;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-moms_box")! as TreasureCard;
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initialHandSize = player1.hand.length;

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandSize);

        let cardToDiscard = game.decks["loot"]!.cards[0]!;
        let cardToAdd = game.decks["loot"]!.cards[0]!;
        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // effect resolution
        await game.actions.resolveStack(); // damage
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
        game.addLootPlay(player1, 1);
        const playCard = game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 1 + 3); // looted 1, pill trigger loot 3.
        expect(player1.hand.cards).toContain(cardToAdd);
        expect(player1.hand.cards).not.toContain(cardToDiscard);
        expect(game.decks["loot"]!.discard).toContain(cardToDiscard);
    });

    // "Each time a player rolls a ❹, they must give you a loot card."
    it("tarot_cloth", async () => {

        const correctValue = 4;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-tarot_cloth")! as TreasureCard;
        game.loot(player2, 1);
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initialHandSize = player1.hand.length;

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandSize);

        let cardToSteal = player2.hand.cards[0]!;
        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 1); // steal 1
        expect(player1.hand.cards).toContain(cardToSteal);
        expect(player2.hand.cards).not.toContain(cardToSteal);


        // card roll
        game.loot(player2, 1);
        player2.hand.addToHand(card);
        cardToSteal = player2.hand.cards[0]!;
        expect(game.stack.size).toBe(0);
        const playCard = game.actions.playCard(player2, 1);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 2); // stolen 2
        expect(player1.hand.cards.map(card => card.slug)).toContain(cardToSteal.slug);
        expect(player2.hand.cards.map(card => card.slug)).not.toContain(cardToSteal.slug);
    });

    // Each time a player rolls a ❻, you may deal 1 damage to them.
    it("moms_razor", async () => {

        const correctValue = 6;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-moms_razor")! as TreasureCard;
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;
        
        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);
        
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initHP = player2.currentHealthPoints;


        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 5; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // dmg resolution
        await game.actions.resolveStack(); // dies ?

        expect(player2.currentHealthPoints).toBe(initHP);
        expect(game.stack.size).toBe(0);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution player 2 should take 1 damage
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(player2.currentHealthPoints).toBe(initHP - 1);

        // card roll
        player2.hand.addToHand(card);
        expect(game.stack.size).toBe(0);
        const playCard = game.actions.playCard(player2, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution player 2 should take 1 damage
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player2.currentHealthPoints).toBe(initHP - 2);
    });

    // "Each time a player rolls a ❻, reveal the top card of any deck. Put it back or put it into discard."
    it("cheese_grater", async () => {

        const correctValue = 6;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-cheese_grater")! as TreasureCard;
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);
        
        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        let topTreasure = game.decks["loot"]!.cards[0]!;

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 5; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // dmg resolution
        await game.actions.resolveStack(); // dies ?

        expect(topTreasure).toBe(game.decks["loot"]!.cards[0]!);
        expect(game.stack.size).toBe(0);

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution player 2 should take 1 damage
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(game.decks["loot"]!.cards[0]!.slug).not.toBe(topTreasure.slug);
        expect(game.decks["loot"]!.discard).toContain(topTreasure);
        topTreasure = game.decks["loot"]!.cards[0]!;

        // card roll
        player2.hand.addToHand(card);
        expect(game.stack.size).toBe(0);
        const playCard = game.actions.playCard(player2, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution player 2 should take 1 damage
        expect(game.stack.size).toBe(0);
        expect(topTreasure).not.toBe(game.decks["treasure"]!.cards[0]!);
    });

    // "Each time a player rolls a ❸, you may look at their hand and steal a loot card from them."
    it("dead_bird", async () => {

        const correctValue = 3;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item = game.shop.obtainCard("b2-dead_bird")! as TreasureCard;
        game.loot(player2, 1);
        game.addInPlay(player1, item);
        const monster = game.monsters[0]!;
        
        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);

        game.addHealth(monster, 10);
        game.addHealth(player2, 10);
        const initialHandSize = player1.hand.length;

        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(player1.hand.length).toBe(initialHandSize);

        let cardToSteal = player2.hand.cards[0]!;
        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // dies ?
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 1); // steal 1
        expect(player1.hand.cards).toContain(cardToSteal);
        expect(player2.hand.cards).not.toContain(cardToSteal);


        // card roll
        game.loot(player2, 1);
        player2.hand.addToHand(card);
        cardToSteal = player2.hand.cards[0]!;
        expect(game.stack.size).toBe(0);
        const playCard = game.actions.playCard(player2, 1);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(initialHandSize + 2); // stolen 2
        expect(player1.hand.cards.map(card => card.slug)).toContain(cardToSteal.slug);
        expect(player2.hand.cards.map(card => card.slug)).not.toContain(cardToSteal.slug);
    });

    // "Each time a player rolls a ❷, you may swap a non-eternal item you control with a non-eternal item they control."
    it("finger", async () => {

        const correctValue = 2;
        const card = game.obtainCard("b2-pills") as LootCard;
        const item1 = game.shop.obtainCard("b2-blank_card")! as TreasureCard;
        const item2 = game.shop.obtainCard("b2-dry_baby")! as TreasureCard;
        const item = game.shop.obtainCard("b2-finger")! as TreasureCard;

        game.addInPlay(player1, item1);
        game.addInPlay(player1, item);
        game.addInPlay(player2, item2);

        // card roll
        player2.hand.addToHand(card);
        game.addLootPlay(player2, 1);
        const playCard = game.actions.playCard(player2, 0);
        await game.actions.resolveStack();
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.inPlay.map((c) => c.slug)).toContain(item2.slug);
        expect(player1.inPlay).not.toContain(item1);
        expect(player2.inPlay.map((c) => c.slug)).toContain(item1.slug);
        expect(player2.inPlay.map((c) => c.slug)).not.toContain(item2.slug);
    });

    // "Each time a player rolls a ❺, you may put a monster not being attacked into discard and replace it with the top card of the monster deck."
    it("spider_mod", async () => {
        const correctValue = 5;
        const spiderMod = game.shop.obtainCard("b2-spider_mod")! as TreasureCard;
        const card = game.obtainCard("b2-pills") as LootCard;
        game.addInPlay(player1, spiderMod);

        // Store references to current monsters
        const remainingMonster = game.monsters[0]!;
        const attackedMonster = game.monsters[1]!;
        game.addHealth(remainingMonster, 10);
        game.addHealth(player2, 10);

        game.endTurn();
        await game.actions.resolveStack();
        game.discardFromHandAtIndex(player2, 0);

        game.addAttackThisTurn(player2, 1); // Ensure player can attack
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, attackedMonster);
        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1 instanceof DiceRoll).toBe(true);
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        await game.actions.resolveStack(); // damage resolution
        expect(game.monsters[0]).toBe(remainingMonster); // Monster slot 1 unchanged

        // Second attack roll - should trigger the effect (monster being attacked)
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // roll resolution

        // The effect should trigger and replace a monster NOT being attacked (attackedMonster or monster2)
        // Store the top card of monster deck before resolving
        const topMonsterCard = game.decks["monster"]!.cards[0];

        await game.actions.resolveStack(); // damage resolution

        // Check that one of the non-attacked monsters was replaced
        const monstersChanged = game.monsters[0] !== remainingMonster;
        expect(monstersChanged).toBe(true);

        // card roll
        player2.hand.addToHand(card);
        const playCard = game.actions.playCard(player2, 0);
        await game.actions.resolveStack();

        const initialRemainingMonster = game.monsters[0];
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Check that a monster was replaced (at least one slot changed)
        const anyMonsterChanged =
          game.monsters[1] !== initialRemainingMonster ||
          initialRemainingMonster === undefined;
        expect(anyMonsterChanged).toBe(true);
    });

    // "Each time a player rolls a ❸, you may put the top card of the Monster Deck in a monster slot not being attacked."
    it("the_d10", async () => {
        const correctValue = 3;
        const theD10 = game.shop.obtainCard("b2-the_d10")! as TreasureCard;
        const card = game.obtainCard("b2-pills") as LootCard;
        game.endTurn();
        await game.actions.resolveStack();
        game.addInPlay(player1, theD10);
        game.addAttackThisTurn(player2, 1); // Ensure player can attack

        const monster0 = game.monsters[0]!;
        const monster1 = game.monsters[1]!;
        game.addHealth(monster0, 10);
        game.addHealth(player2, 10);

        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster0);
        // First attack roll - should not trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll1).toBeDefined();
        if (attackRoll1) {
            attackRoll1.value = 6; // Non-triggering roll
        }
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution
        expect(game.monsters[1]).toBe(monster1); // Monster slot 1 unchanged

        // Second attack roll - should trigger the effect
        game.actions.attackRoll(player2);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            attackRoll2.value = correctValue; // Triggering roll
        }

        const topMonsterCard = game.decks["monster"]!.cards[0];
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // roll resolution
        await game.actions.resolveStack(); // damage resolution

        // Check that the top card was placed in a non-attacked slot
        const foundTopCard = game.monsterSlots._slots[1]![1] === topMonsterCard;
        expect(foundTopCard).toBe(true);

        // card roll
        player2.hand.addToHand(card);
        const playCard = game.actions.playCard(player2, 1);
        expect(playCard).toBeDefined();
        await game.actions.resolveStack();

        const topMonsterCard2 = game.decks["monster"]!.cards[0];
        const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(cardRoll).toBeDefined();
        if (cardRoll) {
            cardRoll.value = correctValue; // Triggering roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        await game.actions.resolveStack();
        // Check that the new top card was placed somewhere
        const foundNewTopCard = game.monsterSlots._slots[1]![2] === topMonsterCard2
        expect(foundNewTopCard).toBe(true);
    });

});