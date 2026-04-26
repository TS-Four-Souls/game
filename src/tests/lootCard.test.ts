import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard, TreasureCard } from "@/models/cards";
import { setupStandardTestGame, dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections, setupTestGame } from "./testHelpers";

describe("Loot Card", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });


    it("b2-two_cents-2: should increase player coins by 2", async () => {
        player1.gainCoins(3);
        const initialCoins = player1.coins;
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-two_cents-2");
        player1.hand.addToHand(lootCard!);
        game.playCard(player1, 0);
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins + 2);
    });

    it("b2-a_nickel: should increase player coins by 5", async () => {
        player1.gainCoins(3);
        const initialCoins = player1.coins;
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-a_nickel");
        player1.hand.addToHand(lootCard!);
        game.playCard(player1, 0);
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins + 5);
    });
    it("b2-a_dime: should increase player coins by 10", async () => {
        player1.gainCoins(3);
        const initialCoins = player1.coins;
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-a_dime");
        player1.hand.addToHand(lootCard!);
        game.playCard(player1, 0);
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins + 10);
    });


    it("b2-xvii_the_stars: should gain 1 treasure", async () => {
        const nbItems = player1.inPlay.length;
        const treasureDeck = game.decks["treasure"]!;
        const topTreasureCard = treasureDeck.cards[0];

        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-xvii_the_stars");
        player1.hand.addToHand(lootCard!);
        game.playCard(player1, 0);
        await game.resolveStack();
        expect(player1.inPlay.length).toBe(nbItems + 1);
        // Verify the gained treasure is the one from the top of the treasure deck
        expect(player1.inPlay[player1.inPlay.length - 1]).toBe(topTreasureCard);
    });

    it("b2-viii_justice: should gain 7 coins and 3 loot cards", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-viii_justice");

        player1.gainCoins(7);
        game.loot(player1, 3);

        const nbCoinsTarget = player1.coins;
        const nbLootCardsTarget = player1.hand.cards.length;

        player2.hand.addToHand(lootCard!);
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0, [player1]);
        await game.resolveStack();

        expect(player2.coins).toBe(nbCoinsTarget); ``
        expect(player2.hand.cards.length).toBe(nbLootCardsTarget);
    });

    it("b2-viii_justice: should gain 5 coins and 1 loot cards", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-viii_justice");
        player2.hand.addToHand(lootCard!);

        player1.gainCoins(7);
        game.loot(player1, 3);

        player2.gainCoins(2);
        game.loot(player2, 2);


        const nbCoinsTarget = player1.coins;
        const nbLootCardsTarget = player1.hand.cards.length;

        game.addLootPlay(player2, 1);
        game.playCard(player2, 0, [player1]);

        const nbCoins = player2.coins;
        const nbLootCards = player2.hand.cards.length;

        await game.resolveStack();

        const gainedCoins = player1.coins - nbCoins;
        const gainedLootCards = player1.hand.cards.length - nbLootCards;
        expect(player2.coins).toBe(nbCoinsTarget);
        expect(player2.hand.cards.length).toBe(nbLootCardsTarget);
        expect(gainedCoins).toBe(5);
        expect(gainedLootCards).toBe(1);
    });

    it("b2-blank_rune: roll 1 - each player gains 1\u00A2", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);
        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 1;
        await game.resolveStack();

        expect(player1.coins).toBe(player1InitialCoins + 1);
        expect(player2.coins).toBe(player2InitialCoins + 1);
    });

    it("b2-blank_rune: roll 2 - each player loots 2", async () => {
        const player1InitialLoot = player1.hand.cards.length;
        const player2InitialLoot = player2.hand.cards.length;

        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);

        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 2;
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(player1InitialLoot + 2);
        expect(player2.hand.cards.length).toBe(player2InitialLoot + 2);
    });

    it("b2-blank_rune: roll 3 - each player takes 3 damage", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);

        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 3;
        await game.resolveStack(); // Dice 
        await game.resolveStack(); // Damage to player1
        await game.resolveStack(); // Death player 1
        await game.resolveStack(); // Damage to player2

        expect(player1.currentHealthPoints).toBe(0);
        expect(player2.currentHealthPoints).toBe(0);
    });

    it("b2-blank_rune: roll 4 - each player gains 4\u00A2", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);
        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 4;
        await game.resolveStack();

        expect(player1.coins).toBe(player1InitialCoins + 4);
        expect(player2.coins).toBe(player2InitialCoins + 4);
    });

    it("b2-blank_rune: roll 5 - each player loot 5", async () => {
        const player1InitialLoot = player1.hand.cards.length;
        const player2InitialLoot = player2.hand.cards.length;

        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);
        
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 5;
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(player1InitialLoot + 5);
        expect(player2.hand.cards.length).toBe(player2InitialLoot + 5);
    });

    it("b2-blank_rune: roll 6 - each player gains 6\u00A2", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-blank_rune");
        player2.hand.addToHand(lootCard!);
        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;
        
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack();

        const roll = game.stack.elements[0] as DiceRoll;
        roll.value = 6;
        await game.resolveStack();

        expect(player1.coins).toBe(player1InitialCoins + 6);
        expect(player2.coins).toBe(player2InitialCoins + 6);
    });

    it("b2-bomb: should deal 1 damage to a player", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-bomb");
        player1.hand.addToHand(lootCard!);

        const player2InitialHP = player2.currentHealthPoints;

        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        await game.resolveStack();

        expect(player2.currentHealthPoints).toBe(player2InitialHP - 1);
    });

    it("b2-bomb: should deal 1 damage to a monster", async () => {
        // Get the monster that's already in slot 0 from game setup
        const monster = game.monsterSlots.monsterIn(0)!;
        const monsterInitialHP = monster.currentHealthPoints;

        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-bomb");
        player1.hand.addToHand(lootCard!);

        game.playCard(player1, 0, [monster]);
        await game.resolveStack();
        await game.resolveStack();

        expect(monster.currentHealthPoints).toBe(monsterInitialHP - 1);
    });

    it("b2-butter_bean: should cancel the previous non-roll ability", async () => {
        // This tests that butter_bean can cancel an item's tap ability
        // We'll use a simple test where we play an item with a tap effect,
        // then play butter_bean to cancel it

        const dime = game.decks["loot"]!.getCardFromSlug("b2-a_dime");
        const butterBean = game.decks["loot"]!.getCardFromSlug("b2-butter_bean");
        player1.hand.addToHand(dime!);
        player1.hand.addToHand(butterBean!);

        // Play dime first, then butter_bean to cancel it
        game.playCard(player1, 0);
        game.playCard(player1, 0, [game.stack.elements[game.stack.size - 1]]);
        await game.resolveStack();

        // If the stack was properly canceled, we should have no elements left
        expect(game.stack.size).toBe(0);
    });

    it("b2-butter_bean: should work as a reactive card", async () => {
        const dime = game.obtainCard("b2-a_dime") as LootCard;
        const butterBean = game.obtainCard("b2-butter_bean") as LootCard;
        player2.hand.addToHand(butterBean!);
        player1.hand.addToHand(dime);
        game.playCard(player1, 0, []); 
        
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0, [game.stack.elements[game.stack.size - 1]]); // Play butter_bean in response to dime
        await game.resolveStack();

        // Verify butter_bean was played and resolved
        expect(game.stack.size).toBe(0);
        expect(player2.hand.cards.length).toBe(0);
        expect(game.decks.loot.discard.includes(butterBean)).toBe(true);
        expect(game.decks.loot.discard.includes(dime)).toBe(true);
    });

    it("b2-gold_bomb: should deal 3 damage to a player", async () => {
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-gold_bomb");
        player1.hand.addToHand(lootCard!);

        const player2InitialHP = player2.currentHealthPoints;

        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        await game.resolveStack();

        expect(player2.currentHealthPoints).toBe(Math.max(0, player2InitialHP - 3));
    });

    it("b2-gold_bomb: should deal 3 damage to a monster", async () => {
        // Get the monster that's already in slot 0 from game setup
        const monster = game.monsterSlots.monsterIn(0)!;
        const monsterInitialHP = monster.currentHealthPoints;

        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-gold_bomb");
        player1.hand.addToHand(lootCard!);

        game.playCard(player1, 0, [monster]);
        await game.resolveStack();
        await game.resolveStack();

        expect(monster.currentHealthPoints).toBe(Math.max(0, monsterInitialHP - 3));
    });

    it("b2-dice_shard: reroll a dice roll on stack", async () => {
        const diceShard = game.decks["loot"]!.getCardFromSlug("b2-dice_shard");

        // Place a dice roll on the stack
        const roll = player1.rollDice(Math.random, false, diceShard);
        game.stack.push(roll);

        const initialRollValue = roll.value;

        for (let attempt = 0; attempt < 1000; attempt++) {
            player1.hand.addToHand(diceShard!);
            // Play dice_shard to reroll the dice
            game.playCard(player1, 0, [roll]);
            await game.resolveStack();
            if (initialRollValue !== roll.value) {
                break;
            }
        }

        // The roll should have changed (with high probability)
        // Note: There's a small chance it rolls the same number, but probability is low
        expect(roll.value).toBeOneOf([1, 2, 3, 4, 5, 6]);
        expect(roll.value).not.toBe(initialRollValue);
    });

    it("b2-ehwaz: should flush unattacked monsters", async () => {
        const ehwaz = game.decks["loot"]!.getCardFromSlug("b2-ehwaz");
        player1.hand.addToHand(ehwaz!);

        // Get initial monsters
        const initialMonster0 = game.monsterSlots.monsterIn(0)!;
        const initialMonster1 = game.monsterSlots.monsterIn(1)!;

        // Play ehwaz to flush monsters
        game.playCard(player1, 0);
        await game.resolveStack();

        // Get new monsters
        const newMonster0 = game.monsterSlots.monsterIn(0)!;
        const newMonster1 = game.monsterSlots.monsterIn(1)!;

        // Verify monsters were replaced
        expect(newMonster0).not.toBe(initialMonster0);
        expect(newMonster1).not.toBe(initialMonster1);
    });

    it("b2-ehwaz: player dies fighting a monster, ehwaz can flush it next turn.", async () => {
        const ehwaz = game.decks["loot"]!.getCardFromSlug("b2-ehwaz");
        player2.hand.addToHand(ehwaz!);
        game.encounters.draw(0);
        // Get initial monsters
        const initialMonster0 = game.monsterSlots.monsterIn(0)!;
        const initialMonster1 = game.monsterSlots.monsterIn(1)!;

        game.declareAttack(player1);
        await game.declareAttackOnEntity(player1, initialMonster0);
        game.attackRoll(player1);
        const dice = game.stack.elements[game.stack.size - 1] as DiceRoll;
        expect(dice).toBeDefined();
        dice.value = 1;
        await game.resolveStack(); 
        await game.resolveStack(); 

        game.attackRoll(player1);
        const dice2 = game.stack.elements[game.stack.size - 1] as DiceRoll;
        expect(dice2).toBeDefined();
        dice2.value = 1;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(0); // player should be dead
        expect(player1.isDead).toBe(true);
        expect(game.currentPlayer.id).toBe(player1.id); // should be player2's turn
        game.endTurn(); // end player1's turn to move to player2's turn
        await game.resolveStack();
        expect(game.currentPlayer.id).toBe(player2.id); // should be player2's turn
        

        // Play ehwaz to flush monsters
        game.playCard(player2, 0);
        await game.resolveStack();

        // Get new monsters
        const newMonster0 = game.monsterSlots.monsterIn(0)!;
        const newMonster1 = game.monsterSlots.monsterIn(1)!;

        // Verify monsters were replaced
        expect(newMonster0).not.toBe(initialMonster0);
        expect(newMonster1).not.toBe(initialMonster1);

    });

    it("b2-ehwaz: ehwaz can flush monsters that have been uncovered.", async () => {
        const ehwaz = game.decks["loot"]!.getCardFromSlug("b2-ehwaz");
        player2.hand.addToHand(ehwaz!);
        
        game.declareAttack(player1);
        await game.declareAttackOnEntity(player1, "topDeck", 0);
        for (let i = 0; i < 5; i++) {
            game.attackRoll(player1);
            const dice = game.stack.elements[game.stack.size - 1] as DiceRoll;
            expect(dice).toBeDefined();
            dice.value = 6;
            await game.resolveStack(); 
            await game.resolveStack();             
        }
        await game.resolveStack();

        game.endTurn(); // end player1's turn to move to player2's turn
        await game.resolveStack();
        expect(game.currentPlayer.id).toBe(player2.id); // should be player2's turn
        
        // Get initial monsters
        const initialMonster0 = game.monsterSlots.monsterIn(0)!.id;
        const initialMonster1 = game.monsterSlots.monsterIn(1)!.id;
        
        // Play ehwaz to flush monsters
        game.playCard(player2, 0);
        await game.resolveStack();

        // Get new monsters
        const newMonster0 = game.monsterSlots.monsterIn(0)!.id;
        const newMonster1 = game.monsterSlots.monsterIn(1)!.id;

        // Verify monsters were replaced
        expect(newMonster0).not.toBe(initialMonster0);
        expect(newMonster1).not.toBe(initialMonster1);

    });


    it("b2-ehwaz: should replace old monsters with new deck cards", async () => {
        const ehwaz = game.decks["loot"]!.getCardFromSlug("b2-ehwaz");
        player1.hand.addToHand(ehwaz!);

        const monsterDeckInitialSize = game.decks["monster"]!.cards.length;

        // Play ehwaz to flush monsters
        game.playCard(player1, 0);
        await game.resolveStack();

        // Verify new monsters were drawn from deck
        expect(game.monsterSlots._slots[0]).toBeDefined();
        expect(game.monsterSlots._slots[1]).toBeDefined();
    });

    it("b2-i_the_magician: should change a dice roll to chosen number", async () => {
        const magician = game.decks["loot"]!.getCardFromSlug("b2-i_the_magician");
        player1.hand.addToHand(magician!);

        // Place a dice roll on the stack
        const roll = player1.rollDice(Math.random, false, magician);
        game.stack.push(roll);
        roll.value = 6; // initial value
        // Play magician to change the roll
        game.playCard(player1, 0, [game.stack.elements[0], 2]);
        await game.resolveStack();

        expect(roll.value).toBe(2);
    });

    it("b2-i_the_magician: should allow choosing specific roll value", async () => {
        const magician = game.decks["loot"]!.getCardFromSlug("b2-i_the_magician");
        player1.hand.addToHand(magician!);

        // Place a dice roll on the stack
        const roll = player2.rollDice(Math.random, false, magician);
        game.stack.push(roll);

        // Force the roll to be different from what we want
        roll.value = 5;

        // Play magician to change roll to 1
        game.playCard(player1, 0, [roll, 2]);
        await game.resolveStack();

        // Should be able to choose any value 1-6
        expect(typeof roll.value).toBe("number");
        expect(roll.value).toBe(2);
    });

    it("b2-ii_the_high_priestess: should roll and deal damage to a player", async () => {
        const highPriestess = game.decks["loot"]!.getCardFromSlug("b2-ii_the_high_priestess");
        player1.hand.addToHand(highPriestess!);

        const player2InitialHP = player2.currentHealthPoints;

        // Play high priestess
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        await game.resolveStack();
        await game.resolveStack();

        // Should have dealt damage between 1-6
        const damageTaken = player2InitialHP - player2.currentHealthPoints;
        expect(damageTaken).toBe(1);
    });

    it("b2-ii_the_high_priestess: should roll and deal damage to a monster", async () => {
        const highPriestess = game.decks["loot"]!.getCardFromSlug("b2-ii_the_high_priestess");
        player1.hand.addToHand(highPriestess!);

        const monster = game.monsterSlots.monsterIn(0)!;
        const monsterInitialHP = monster.currentHealthPoints;

        // Play high priestess
        game.playCard(player1, 0, [monster]);
        await game.resolveStack();
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        await game.resolveStack();
        await game.resolveStack();

        // Should have dealt damage between 1-6
        const damageTaken = monsterInitialHP - monster.currentHealthPoints;
        expect(damageTaken).toBe(1);
    });

    it("b2-iv_the_emperor: should keep chosen monster card on top", async () => {
        const emperor = game.decks["loot"]!.getCardFromSlug("b2-iv_the_emperor");
        player1.hand.addToHand(emperor!);

        // Snapshot current top 5 monster cards, then restore deck order
        const initialTop5 = game.getFirstCardsOfDeck("monster", 5);
        for (let i = initialTop5.length - 1; i >= 0; i--) {
            game.addTopPosition("monster", initialTop5[i]!);
        }

        game.playCard(player1, 0);
        await game.resolveStack();

        const newTop5 = game.getFirstCardsOfDeck("monster", 5);
        const monsterDeck = game.decks["monster"]!;
        const bottomCards = monsterDeck.cards.slice(monsterDeck.cards.length - 4); // Last 4 cards in deck

        // Selected card should be the previous top card (selection picks first)
        expect(newTop5[0]).toBe(initialTop5[0]);
        // The other four cards should have been moved off the top (pushed to bottom)
        const initialOthers = initialTop5.slice(1);
        const newTopRest = newTop5.slice(1);
        for (const card of initialOthers) {
            expect(newTopRest).not.toContain(card);
        }
        // Verify the unchosen cards are at the end of the deck
        for (const card of initialOthers) {
            expect(bottomCards).toContain(card as MonsterCard);
        }
    });

    it("b2-ix_the_hermit: should keep chosen treasure card on top", async () => {
        const hermit = game.decks["loot"]!.getCardFromSlug("b2-ix_the_hermit");
        player1.hand.addToHand(hermit!);

        // Snapshot current top 5 treasure cards, then restore deck order
        const initialTop5 = game.getFirstCardsOfDeck("treasure", 5);
        for (let i = initialTop5.length - 1; i >= 0; i--) {
            game.addTopPosition("treasure", initialTop5[i]!);
        }
        game.playCard(player1, 0);
        await game.resolveStack();

        const newTop5 = game.getFirstCardsOfDeck("treasure", 5);
        const treasureDeck = game.decks["treasure"]!;
        const bottomCards = treasureDeck.cards.slice( treasureDeck.cards.length - 4); // Last 4 cards in deck

        // Selected card should be the previous top card (selection picks first)
        expect(newTop5[0]).toBe(initialTop5[0]);
        // The other four cards should have been moved off the top (pushed to bottom)
        const initialOthers = initialTop5.slice(1);
        const newTopRest = newTop5.slice(1);
        for (const card of initialOthers) {
            expect(newTopRest).not.toContain(card);
        }
        // Verify the unchosen cards are at the end of the deck
        for (const card of initialOthers) {
            expect(bottomCards).toContain(card as TreasureCard);
        }
    });

    it("b2-xviii_the_moon: should keep chosen loot card on top", async () => {
        const moon = game.decks["loot"]!.getCardFromSlug("b2-xviii_the_moon");
        player1.hand.addToHand(moon!);

        // Snapshot current top 5 loot cards, then restore deck order
        const initialTop5 = game.getFirstCardsOfDeck("loot", 5);
        for (let i = initialTop5.length - 1; i >= 0; i--) {
            game.addTopPosition("loot", initialTop5[i]!);
        }

        game.playCard(player1, 0);
        await game.resolveStack();

        const newTop5 = game.getFirstCardsOfDeck("loot", 5);
        const lootDeck = game.decks["loot"]!;
        const bottomCards = lootDeck.cards.slice(lootDeck.cards.length - 4); // Last 4 cards in deck

        // Selected card should be the previous top card (selection picks first)
        expect(newTop5[0]).toBe(initialTop5[0]);
        // The other four cards should have been moved off the top (pushed to bottom)
        const initialOthers = initialTop5.slice(1);
        const newTopRest = newTop5.slice(1);
        for (const card of initialOthers) {
            expect(newTopRest).not.toContain(card);
        }
        // Verify the unchosen cards are at the end of the deck
        for (const card of initialOthers) {
            expect(bottomCards).toContain(card as LootCard);
        }
    });

    it("b2-lil_battery: should recharge a tapped item", async () => {
        const lilBattery = game.decks["loot"]!.getCardFromSlug("b2-lil_battery");
        player1.hand.addToHand(lilBattery!);

        // Get a treasure item from the deck and give it to player1
        const item = game.shop.obtainCard("b2-blank_card") as ItemCard;
        player1.addInPlay(item);

        // Recharge and tap the item (simulate using it)
        item.charged = false;
        await game.resolveStack();
        expect(item.charged).toBe(false);

        // Play lil battery
        game.playCard(player1, 0, [item]);
        await game.resolveStack();

        // Item should be recharged
        expect(item.charged).toBe(true);
    });

    it("b2-lil_battery: should only recharge one item", async () => {
        const lilBattery = game.decks["loot"]!.getCardFromSlug("b2-lil_battery");
        player1.hand.addToHand(lilBattery!);

        // Give player two items and tap both

        const card1 = game.shop.obtainCard("b2-blank_card");
        const card2 = game.shop.obtainCard("b2-crystal_ball");

        const item1 = card1 as ItemCard;
        const item2 = card2 as ItemCard;

        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        item1.charged = false;
        item2.charged = false;

        // Play lil battery targeting item1
        game.playCard(player1, 0, [item1]);
        await game.resolveStack();

        // Only item1 should be recharged
        expect(item1.charged).toBe(true);
        expect(item2.charged).toBe(false);
    });

    it("b2-mega_battery: should recharge all items controlled by target player", async () => {
        const megaBattery = game.decks["loot"]!.getCardFromSlug("b2-mega_battery");
        player1.hand.addToHand(megaBattery!);

        // Give player2 multiple items and tap them all
        const item1 = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.shop.obtainCard("b2-crystal_ball") as ItemCard;
        const item3 = game.shop.obtainCard("b2-the_shovel") as ItemCard;
        player2.inPlay.push(item1, item2, item3);
        item1.charged = false;
        item2.charged = false;
        item3.charged = false;
        
        // Play mega battery targeting player2
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // All of player2's items should be recharged
        expect(item1.charged).toBe(true);
        expect(item2.charged).toBe(true);
        expect(item3.charged).toBe(true);
    });

    it("b2-mega_battery: should only affect target player's items", async () => {
        const megaBattery = game.decks["loot"]!.getCardFromSlug("b2-mega_battery");
        player1.hand.addToHand(megaBattery!);

        // Give both players items and tap them
        const player1Item = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const player2Item = game.shop.obtainCard("b2-the_shovel") as ItemCard;
        player1.inPlay.push(player1Item);
        player2.inPlay.push(player2Item);
        player1Item.charged = false;
        player2Item.charged = false;

        // Play mega battery targeting player2
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // Only player2's item should be recharged
        expect(player1Item.charged).toBe(false);
        expect(player2Item.charged).toBe(true);
    });

    it("b2-o_the_fool: should end turn and cancel stack", async () => {
        const fool = game.decks["loot"]!.getCardFromSlug("b2-o_the_fool");
        player1.hand.addToHand(fool!);

        // Add another card to the stack to verify it gets cancelled
        const testCard = game.decks["loot"]!.getCardFromSlug("b2-a_dime");
        player1.hand.addToHand(testCard!);

        const initialStackSize = game.stack.elements.length;
        const initialPlayer = game.turnHandler.current;

        game.playCard(player1, 1); // Play dime
        game.playCard(player1, 0); // Play fool

        const stackSizeBeforeFool = game.stack.elements.length;
        expect(stackSizeBeforeFool).toBeGreaterThan(initialStackSize);

        await game.resolveStack();
        await game.resolveStack();

        // Stack should be empty and turn should have ended
        expect(game.turnHandler.current).not.toBe(initialPlayer);
        expect(game.stack.elements.length).toBe(0);
    });

    it("b2-pills: should roll and handle outcomes (loot 1)", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHandSize = player1.hand.cards.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1; // Force roll to 1 for testing
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(initialHandSize + 1);
        // After resolving, hand size should have changed based on roll outcome
        // Roll 1-2: loot 1 (net +1 card including pills played)
        // Roll 3-4: loot 3 (net +3 cards including pills played)
        // Roll 5-6: discard 1 (net 0 cards including pills played)
        // Pills card is removed from hand when played, so we expect:
        // 1-2: initialHandSize - 1 + 1 = initialHandSize
        // 3-4: initialHandSize - 1 + 3 = initialHandSize + 2
        // 5-6: initialHandSize - 1 - 1 = initialHandSize - 2
    });

    it("b2-pills: should roll and handle outcomes (loot 3)", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHandSize = player1.hand.cards.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4; // Force roll to 4 for testing
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(initialHandSize + 3);
    });
    it("b2-pills: should roll and handle outcomes (discard)", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);
        game.loot(player1, 2); // Ensure player has at least 1 card to discard

        const initialHandSize = player1.hand.cards.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Force roll to 5 for testing
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(1);
    });

    it("b2-pills: should roll and handle outcomes (discard empty handed)", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHandSize = player1.hand.cards.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6; // Force roll to 6 for testing
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(0);
    });

    // "Roll-\n1-2: Gain 4\u00A2.\n3-4: Gain 7\u00A2.\n5-6: Lose 4\u00A2."
    it("b2-pills_2: should gain 4 coins", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_2");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1; // Force roll to 1 for testing
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins + 4);
    });

    it("b2-pills_2: should gain 7 coins", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_2");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3; // Force roll to 3 for testing
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins + 7);
    });

    it("b2-pills_2: should lose 4 coins full", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_2");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);
        game.gainCoins(player1, 10, "gift"); // Ensure player has enough coins to lose
        const initialCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Force roll to 5 for testing
        await game.resolveStack();

        expect(player1.coins).toBe(initialCoins - 4);
    });

    it("b2-pills_2: should lose 4 coins (only 3)", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_2");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);
        game.gainCoins(player1, 3, "gift");
        const initialCoins = player1.coins;
        const initialInPlay = player1.inPlay.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6; // Force roll to 6 for testing
        await game.resolveStack();

        expect(player1.coins).toBe(0);
        expect(player1.inPlay.length).toBe(initialInPlay); // Discard a card to make up the difference
    });

    // "Roll-\n1-2: You gain +1 [ATK] till the end of turn.\n3-4: You gain +1 [HP] till the end of turn.\n5-6: Take 1 damage."
    it("b2-pills_3: gain 1 atk till end of turn", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_3");
        player1.hand.addToHand(pills!);
        const initialInPlay = player1.inPlay.length;
        game.playCard(player1, 0);

        const initialAtk = player1.attackPoints;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1; // Force roll to 1 for testing
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk + 1);
        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.inPlay.length).toBe(initialInPlay); // Discard a card to make up the difference

    });

    it("b2-pills_3: gain 1 hp till end of turn", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_3");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHp = player1.currentHealthPoints;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3; // Force roll to 3 for testing
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHp + 1);
        game.endTurn();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHp);
        game.endTurn();

        expect(player1.currentHealthPoints).toBe(initialHp);
    });

    it("b2-pills_3: take 1 damage", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-pills_3");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHp = player1.currentHealthPoints;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6; // Force roll to 6 for testing
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHp - 1);
    });

    // "Look at the top card of each deck. You may put any of those cards on the bottom of their deck, then loot 2."
    it("b2-xii_the_hanged_man: should move top cards to bottom and loot 2", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-xii_the_hanged_man");
        player1.hand.addToHand(card!);

        // Capture current tops
        const topLoot = game.getFirstCardsOfDeck("loot", 1)[0]!;
        const topTreasure = game.getFirstCardsOfDeck("treasure", 1)[0]!;
        const topMonster = game.getFirstCardsOfDeck("monster", 1)[0]!;

        // Stub select to choose all three tops
        const originalSelect = game.select;
        game.select = async (_issuer, _min, _max, opts) => ({ selected: opts, remaining: [] });

        const initialHand = player1.hand.cards.length;

        game.playCard(player1, 0);
        await game.resolveStack();

        const newTopLoot = game.getFirstCardsOfDeck("loot", 1)[0]!;
        const newTopTreasure = game.getFirstCardsOfDeck("treasure", 1)[0]!;
        const newTopMonster = game.getFirstCardsOfDeck("monster", 1)[0]!;
        expect(newTopLoot).not.toBe(topLoot);
        expect(newTopTreasure).not.toBe(topTreasure);
        expect(newTopMonster).not.toBe(topMonster);

        // Loot 2: net +1 card in hand (played 1, drew 2)
        expect(player1.hand.cards.length).toBe(initialHand + 1);

        // Restore stub
        game.select = originalSelect;
    });

    it("b2-xiii_death: should kill target player", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-xiii_death");
        player1.hand.addToHand(card!);

        const originalSelect = game.select;

        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        await game.resolveStack();

        expect(player2.currentHealthPoints).toBe(0);
        expect(player2.isDead).toBe(true);

        game.select = originalSelect;
    });

    it("b2-xix_the_sun: should go to bottom and grant extra turn", async () => {
        const sun = game.decks["loot"]!.getCardFromSlug("b2-xix_the_sun");
        player1.hand.addToHand(sun!);

        const lootDeck = game.decks["loot"]!;
        const beforeSize = lootDeck.length;

        game.playCard(player1, 0);
        await game.resolveStack();

        // Card placed on bottom of loot deck
        // expect(lootDeck.length).toBe(beforeSize + 1);
        expect(lootDeck.cards[lootDeck.cards.length - 1]).toBe(sun);
        expect(lootDeck.discard.length).toBe(0);
        // Extra turn should be scheduled (player1 gets immediate next turn again)
        game.turnHandler.endTurn();
        expect(game.turnHandler.current).toBe(player1);
        game.turnHandler.endTurn();
        expect(game.turnHandler.current).toBe(player2);
    });

    // "Roll-\n1: Gain 1\u00A2.\n2: Take 2 damage.\n3. Loot 3.\n4. Lose 4\u00A2.\n5: Gain 5\u00A2.\n6: Gain +1 treasure."
    it("b2-x_wheel_of_fortune: roll 1 should gain 1 coin", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);
        const beforeCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        await game.resolveStack();

        expect(player1.coins).toBe(beforeCoins + 1);
    });

    it("b2-x_wheel_of_fortune: roll 2 should deal 2 damage", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);
        const beforeHp = player1.currentHealthPoints;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(Math.max(0, beforeHp - 2));
    });

    it("b2-x_wheel_of_fortune: roll 3 should loot 3", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);
        const initialHand = player1.hand.cards.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        await game.resolveStack();

        expect(player1.hand.cards.length).toBe(initialHand + 3);
    });

    it("b2-x_wheel_of_fortune: roll 4 should lose 4 coins", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);
        game.gainCoins(player1, 6, "gift");

        game.playCard(player1, 0);
        const beforeCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        await game.resolveStack();

        expect(player1.coins).toBe(Math.max(0, beforeCoins - 4));
    });

    it("b2-x_wheel_of_fortune: roll 5 should gain 5 coins", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);
        const beforeCoins = player1.coins;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        await game.resolveStack();

        expect(player1.coins).toBe(beforeCoins + 5);
    });

    it("b2-x_wheel_of_fortune: roll 6 should gain +1 treasure", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-x_wheel_of_fortune");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);
        const treasureDeck = game.decks["treasure"]!;
        const topTreasure = treasureDeck.cards[0];
        const beforeInPlay = player1.inPlay.length;

        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        await game.resolveStack();

        expect(player1.inPlay.length).toBe(beforeInPlay + 1);
        expect(player1.inPlay[player1.inPlay.length - 1]).toBe(topTreasure);
    });

    it("b2-xiv_temperance: should choose option 1 (take 1 damage, gain 4 coins)", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-xiv_temperance");
        player1.hand.addToHand(card!);

        const originalSelect = game.select;
        // Stub select to choose the first option

        const beforeHp = player1.currentHealthPoints;
        const beforeCoins = player1.coins;

        const debugTarget = ["Take 1 damage and gain 4¢."];
        game.playCard(player1, 0, debugTarget);
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(beforeHp - 1);
        expect(player1.coins).toBe(beforeCoins + 4);

        game.select = originalSelect;
    });

    it("b2-xv_the_devil: should destroy own item and steal from player", async () => {
        const devil = game.decks["loot"]!.getCardFromSlug("b2-xv_the_devil");
        player1.hand.addToHand(devil!);

        // Give player1 an item to destroy
        const itemToDestroy = game.shop.obtainCard("b2-blank_card") as ItemCard;
        player1.inPlay.push(itemToDestroy);

        // Give player2 an item to steal
        const itemToSteal = game.shop.obtainCard("b2-the_shovel") as ItemCard;
        player2.inPlay.push(itemToSteal);

        const originalSelect = game.select;
        
        expect(player1.inPlay).toContain(itemToDestroy);
        expect(player2.inPlay).toContain(itemToSteal);
        expect(player1.inPlay).not.toContain(itemToSteal);

        game.playCard(player1, 0, [itemToDestroy, itemToSteal]);
        await game.resolveStack();

        // Item should be destroyed from player1
        expect(player1.inPlay).not.toContain(itemToDestroy);
        expect(game.destroyedCards).toContain(itemToDestroy);

        // Item should be stolen from player2 to player1
        expect(player2.inPlay).not.toContain(itemToSteal);
        expect(player1.inPlay).toContain(itemToSteal);

        game.select = originalSelect;
        
    });

    it("b2-xv_the_devil: should destroy own item and steal from shop", async () => {
        const devil = game.decks["loot"]!.getCardFromSlug("b2-xv_the_devil");
        player1.hand.addToHand(devil!);

        // Give player1 an item to destroy
        const itemToDestroy = game.shop.obtainCard("b2-blank_card") as ItemCard;
        player1.inPlay.push(itemToDestroy);

        // Get item from shop
        const shopItem = game.shop.itemsInShop[0] as ItemCard;

        const originalSelect = game.select;
        let selectCallCount = 0;
        
        expect(player1.inPlay).toContain(itemToDestroy);
        expect(game.shop.itemsInShop).toContain(shopItem);

        game.playCard(player1, 0, [itemToDestroy, shopItem]);
        await game.resolveStack();

        // Item should be destroyed from player1
        expect(player1.inPlay).not.toContain(itemToDestroy);
        expect(game.destroyedCards).toContain(itemToDestroy);

        // Item should be stolen from shop to player1
        expect(game.shop.itemsInShop).not.toContain(shopItem);
        expect(player1.inPlay).toContain(shopItem);

        game.select = originalSelect;
    });

    it("b2-xv_the_devil: should not steal if no item to destroy", async () => {
        const devil = game.decks["loot"]!.getCardFromSlug("b2-xv_the_devil");
        player1.hand.addToHand(devil!);
        const itemTargetToSteal = game.shop.obtainCard("b2-blank_card") as ItemCard;
        player2.addInPlay(itemTargetToSteal);

        // Player1 has no items
        const initialInPlayCount = player1.inPlay.filter((card) => card.eternal === false).length;
        expect(initialInPlayCount).toBe(0);

        game.playCard(player1, 0, [[], [itemTargetToSteal]]);
        await game.resolveStack();

        const afterInPlayCount = player1.inPlay.filter((card) => card.eternal === false).length;
        // Nothing should have changed
        expect(afterInPlayCount).toBe(initialInPlayCount);
    });

    // "Roll-\n1-2: Each player takes 1 damage.\n3-4: Each monster takes 1 damage.\n5-6: Each player takes 2 damage."
    it("b2-xvi_the_tower: roll 1 should deal 1 to each player", async () => {
        const tower = game.decks["loot"]!.getCardFromSlug("b2-xvi_the_tower");
        player1.hand.addToHand(tower!);

        const player1Hp = player1.currentHealthPoints;
        const player2Hp = player2.currentHealthPoints;

        game.playCard(player1, 0);
        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(player1Hp - 1);
        expect(player2.currentHealthPoints).toBe(player2Hp - 1);
    });

    it("b2-xvi_the_tower: roll 3 should deal 1 to each monster", async () => {
        const tower = game.decks["loot"]!.getCardFromSlug("b2-xvi_the_tower");
        player1.hand.addToHand(tower!);

        const monsters = [game.monsterSlots.monsterIn(0), game.monsterSlots.monsterIn(1)].filter(Boolean) as any[];
        const initialHps = monsters.map((m) => m.currentHealthPoints);

        game.playCard(player1, 0);
        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        await game.resolveStack(); // dice resolve
        await game.resolveStack(); // damage monster 1
        await game.resolveStack(); // death monster 1 ?
        await game.resolveStack(); // damage monster 2
        
        monsters.forEach((m, idx) => {
            expect(m.currentHealthPoints).toBe(initialHps[idx]! - 1);
        });
    });

    it("b2-xvi_the_tower: roll 5 should deal 2 to each player", async () => {
        const tower = game.decks["loot"]!.getCardFromSlug("b2-xvi_the_tower");
        player1.hand.addToHand(tower!);

        const player1Hp = player1.currentHealthPoints;
        const player2Hp = player2.currentHealthPoints;

        game.playCard(player1, 0);
        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        await game.resolveStack();// dice resolve
        await game.resolveStack();// damage player 1
        await game.resolveStack();// death player 1
        await game.resolveStack();// damage player 2

        expect(player1.currentHealthPoints).toBe(player1Hp - 2);
        expect(player2.currentHealthPoints).toBe(player2Hp - 2);
    });

    it("b2-soul_heart: should prevent 1 damage to chosen player this turn", async () => {

        const soulHeart = game.decks["loot"]!.getCardFromSlug("b2-soul_heart");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(soulHeart!);

        const initialHP = player2.currentHealthPoints;
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // player2 should have prevention shield now - deal 3 damage
        game.dealDamage(player1, player2, dummyCard, 3);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 2); // 3 - 1 prevented = 2 damage taken
    });

    it("b2-soul_heart: shield is one-shot only", async () => {
        const soulHeart = game.decks["loot"]!.getCardFromSlug("b2-soul_heart");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(soulHeart!);

        player2.addHealthPoints(10); // Ensure player2 has enough HP to take damage
        const initialHP = player2.currentHealthPoints;
        // const effect = effectParser(soulHeart!.effectOutcomes[0]!, game);
        // effect(soulHeart!, player1, []);
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        // First damage: 1 prevented, take 2 damage
        game.dealDamage(player1, player2, dummyCard, 3);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 2);

        // Second damage: not prevented, take full damage
        game.dealDamage(player1, player2, dummyCard, 5);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 7);
    });

    it("b2-soul_heart: prevents all damage if damage is 1 or less", async () => {

        const soulHeart = game.decks["loot"]!.getCardFromSlug("b2-soul_heart");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(soulHeart!);


        const initialHP = player2.currentHealthPoints;
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // Deal only 1 damage - should be fully prevented
        game.dealDamage(player1, player2, dummyCard, 1);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP); // No damage taken
    });

    it("b2-soul_heart: only prevents damage to chosen player, not issuer", async () => {

        const soulHeart = game.decks["loot"]!.getCardFromSlug("b2-soul_heart");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(soulHeart!);


        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // player1 takes damage - should NOT be prevented (shield is on player2)
        const initialP1HP = player1.currentHealthPoints;
        game.dealDamage(player2, player1, dummyCard, 2);
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(initialP1HP - 2); // Full damage taken

        game.dealDamage(player2, player2, dummyCard, 2);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialP1HP - 1); // Full damage taken
    });

    it("b2-v_the_hierophant: should prevent 2 damage to chosen player this turn", async () => {

        const hierophant = game.decks["loot"]!.getCardFromSlug("b2-v_the_hierophant");
        const dummyCard = { slug: "test", name: "Test" } as any;
        expect(hierophant).toBeDefined();
        player1.hand.addToHand(hierophant!);
        player2.addHealthPoints(10); // Ensure player2 has enough HP to take damage

        const initialHP = player2.currentHealthPoints;
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // player2 should have prevention shield now - deal 5 damage
        game.dealDamage(player1, player2, dummyCard, 5);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 3); // 5 - 2 prevented = 3 damage taken
    });

    it("b2-v_the_hierophant: should prevent 2 damage to chosen monster this turn", async () => {

        const hierophant = game.decks["loot"]!.getCardFromSlug("b2-v_the_hierophant");
        const dummyCard = { slug: "test", name: "Test" } as any;

        const monster = game.monsterSlots.monsterIn(0)!;
        expect(hierophant).toBeDefined();
        player1.hand.addToHand(hierophant!);

        const initialHP = monster.currentHealthPoints;
        game.playCard(player1, 0, [monster]);
        await game.resolveStack();

        // player2 should have prevention shield now - deal 3 damage
        game.dealDamage(player1, monster, dummyCard, 3);
        await game.resolveStack();
        expect(monster.currentHealthPoints).toBe(initialHP - 1); // 3 - 2 prevented = 1 damage taken
    });

    it("b2-v_the_hierophant: shield is one-shot only", async () => {
        const hierophant = game.decks["loot"]!.getCardFromSlug("b2-v_the_hierophant");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(hierophant!);

        player2.addHealthPoints(10); // Ensure player2 has enough HP to take damage
        const initialHP = player2.currentHealthPoints;
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();
        // First damage: 2 prevented, take 3 damage
        game.dealDamage(player1, player2, dummyCard, 5);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 3);

        // Second damage: not prevented, take full damage
        game.dealDamage(player1, player2, dummyCard, 5);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 8);
    });

    it("b2-v_the_hierophant: prevents all damage if damage is 2 or less", async () => {

        const hierophant = game.decks["loot"]!.getCardFromSlug("b2-v_the_hierophant");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(hierophant!);


        const initialHP = player2.currentHealthPoints;
        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // Deal only 2 damage - should be fully prevented
        game.dealDamage(player1, player2, dummyCard, 2);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP); // No damage taken
    });

    it("b2-v_the_hierophant: only prevents damage to chosen player, not issuer", async () => {

        const hierophant = game.decks["loot"]!.getCardFromSlug("b2-v_the_hierophant");
        const dummyCard = { slug: "test", name: "Test" } as any;
        player1.hand.addToHand(hierophant!);
        player1.addHealthPoints(10); // Ensure player2 has enough HP to take damage
        player2.addHealthPoints(10); // Ensure player2 has enough HP to take damage


        game.playCard(player1, 0, [player2]);
        await game.resolveStack();

        // player1 takes damage - should NOT be prevented (shield is on player2)
        const initialP1HP = player1.currentHealthPoints;
        game.dealDamage(player2, player1, dummyCard, 3);
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(initialP1HP - 3); // Full damage taken

        game.dealDamage(player2, player2, dummyCard, 3);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialP1HP - 1); //Shilded damage taken
    });

    it("b2-dagaz: destroys a chosen curse when that option is selected", async () => {
        const dagaz = game.decks["loot"]!.getCardFromSlug("b2-dagaz");
        const curses = game.decks["monster"]!.cards.filter((c) => c instanceof MonsterCard && c.isCurse);
        expect(curses.length).toBeGreaterThan(0);
        game.addCurse(player1, curses[0]!);
        // console.log("Player1 curses before: ", inplayCurseSelector((player, card) => true, game)(player1));
        // console.log("Player1 in play before: ", player1.inPlay);
        player1.hand.addToHand(dagaz!);

        const debugTarget = ["Destroy a curse.", curses[0]!];
        // console.log("debugTarget: ", debugTarget);
        // console.log("curse: ", curses[0]!);
        game.playCard(player1, 0, debugTarget);
        await game.resolveStack();

        expect(player1.curses).not.toContain(curses[0]!);
        expect(game.destroyedCards).toContain(curses[0]!);
    });

    it("b2-dagaz: destroys a chosen curse when that option is selected", async () => {
        const dagaz = game.decks["loot"]!.getCardFromSlug("b2-dagaz");
        const curses = game.decks["monster"]!.cards.filter((c) => c instanceof MonsterCard && c.isCurse);
        expect(curses.length).toBeGreaterThan(2); // This might be false if curses are drawn at the start of the game.
        game.addCurse(player1, curses[0]!);
        game.addCurse(player1, curses[1]!);
        game.addCurse(player1, curses[2]!);
        // console.log("Player1 curses before: ", inplayCurseSelector((player, card) => true, game)(player1));
        // console.log("Player1 in play before: ", player1.inPlay);
        player1.hand.addToHand(dagaz!);

        const debugTarget = ["Destroy a curse.", curses[1]!];
        // console.log("debugTarget: ", debugTarget);
        // console.log("curse: ", curses[0]!);
        game.playCard(player1, 0, debugTarget);
        player1.removeCurse(curses[1]!); // Simulate curse being removed before resolution
        player2.addCurse(curses[1]!); // Simulate curse being removed before resolution
        await game.resolveStack();

        expect(player1.curses.map(card => card.slug)).not.toContain(curses[1]!.slug);
        expect(player1.curses.map(card => card.slug)).toContain(curses[0]!.slug);
        expect(player1.curses.map(card => card.slug)).toContain(curses[2]!.slug);
        expect(player2.curses.map(card => card.slug)).not.toContain(curses[1]!.slug);
        expect(game.destroyedCards.map(card => card.slug)).toContain(curses[1]!.slug);
    });

    it("b2-dagaz: destroys nothing when the curse is not available anymore.", async () => {
        const dagaz = game.decks["loot"]!.getCardFromSlug("b2-dagaz");
        const curses = game.decks["monster"]!.cards.filter((c) => c instanceof MonsterCard && c.isCurse);
        expect(curses.length).toBeGreaterThan(2);
        game.addCurse(player1, curses[0]!);
        game.addCurse(player1, curses[1]!);
        player1.hand.addToHand(dagaz!);

        const debugTarget = ["Destroy a curse.", curses[2]!];
        // console.log("debugTarget: ", debugTarget);
        // console.log("curse: ", curses[0]!);
        game.playCard(player1, 0, debugTarget);

        await game.resolveStack();

        expect(player1.curses).toContain(curses[0]!);
        expect(player1.curses).toContain(curses[1]!);
    });

    it("b2-dagaz: prevents the next 1 damage to the chosen player when that option is selected", async () => {
        const dagaz = game.decks["loot"]!.getCardFromSlug("b2-dagaz");
        const dummyCard = { slug: "test", name: "Test" } as any;

        player1.hand.addToHand(dagaz!);

        const initialHP = player2.currentHealthPoints;
        const debugTarget = ["Choose a player. Prevent the next 1 damage they would take this turn.", player2];
        game.playCard(player1, 0, debugTarget);
        await game.resolveStack();

        // player2 should have prevention shield now - deal 2 damage
        game.dealDamage(player1, player2, dummyCard, 2);
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 1); // 2 - 1 prevented = 1 damage taken
    });

    it("b2-vi_the_lovers: gain 2 hp till end of turn", async () => {
        const pills = game.decks["loot"]!.getCardFromSlug("b2-vi_the_lovers");
        player1.hand.addToHand(pills!);

        game.playCard(player1, 0);

        const initialHp = player1.currentHealthPoints;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHp + 2);
        expect(player1.healthPoints).toBe(initialHp+2);
        game.endTurn();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHp);
        game.endTurn();

        expect(player1.currentHealthPoints).toBe(initialHp);
    });

    it("b2-vi_the_lovers: give to other player 2 hp till end of turn", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-vi_the_lovers");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0, [player2]);

        const initialHplayer1 = player1.currentHealthPoints;
        const initialHp = player2.currentHealthPoints;

        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHplayer1);
        expect(player2.currentHealthPoints).toBe(initialHp + 2);
        expect(player2.healthPoints).toBe(initialHp + 2);
        game.endTurn();
        await game.resolveStack();

        expect(player2.currentHealthPoints).toBe(initialHp);
        game.endTurn();

        expect(player2.currentHealthPoints).toBe(initialHp);
    });

    it("b2-iii_the_empress: They gain +1 [ATK] and +1 to dice rolls till end of turn.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-iii_the_empress");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);

        const initialAtk = player1.attackPoints;
        const initialDiceMod = player1.diceModifier;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk + 1);
        expect(player1.diceModifier).toBe(initialDiceMod + 1);

        const pill = game.obtainCard("b2-pills")!;
        expect(pill).toBeDefined();
        player1.hand.addToHand(pill as LootCard);
        game.playCard(player1, player1.hand.cards.indexOf(pill as LootCard));
        await game.resolveStack();
        expect(game.stack.size).toBe(1);
        const dice = game.stack.elements[0] as DiceRoll;
        expect(dice instanceof DiceRoll).toBe(true);
        dice.value = 2;
        const initHandSize = player1.hand.cards.length;

        await game.resolveStack();
        
        // Dice roll should have +1 modifier
        expect(dice.value).toBe(3); // 2 + 1 from Empress
        expect(player1.hand.cards.length).toBe(initHandSize + 3); // Looted successfully

        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.diceModifier).toBe(initialDiceMod);
        game.endTurn();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.diceModifier).toBe(initialDiceMod);
    });

    it("b2-iii_the_empress: give to other player +1 [ATK] and +1 to dice rolls till end of turn", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-iii_the_empress");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0, [player2]);

        const initialAtk1 = player1.attackPoints;
        const initialAtk = player2.attackPoints;
        const initialDiceMod1 = player1.diceModifier;
        const initialDiceMod = player2.diceModifier;

        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk + 1);
        expect(player1.attackPoints).toBe(initialAtk1);
        expect(player2.diceModifier).toBe(initialDiceMod + 1);
        expect(player1.diceModifier).toBe(initialDiceMod1);
        game.endTurn();
        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.diceModifier).toBe(initialDiceMod);
        game.endTurn();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.diceModifier).toBe(initialDiceMod);
    });

    it("b2-vii_the_chariot: They gain +1 [ATK] and +1 [HP] till end of turn.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-vii_the_chariot");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);

        const initialAtk = player1.attackPoints;
        const initialHP = player1.healthPoints;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk + 1);
        expect(player1.healthPoints).toBe(initialHP + 1);
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.currentHealthPoints).toBe(initialHP);
        game.endTurn();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.currentHealthPoints).toBe(initialHP);
    });

    it("b2-vii_the_chariot: give to other player +1 [ATK] and +1 [HP] till end of turn", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-vii_the_chariot");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0, [player2]);

        const initialAtk1 = player1.attackPoints;
        const initialAtk = player2.attackPoints;
        const initialHP1 = player1.currentHealthPoints;
        const initialHP = player2.currentHealthPoints;

        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk + 1);
        expect(player1.attackPoints).toBe(initialAtk1);
        expect(player2.currentHealthPoints).toBe(initialHP + 1);
        expect(player2.healthPoints).toBe(initialHP+1);
        expect(player1.currentHealthPoints).toBe(initialHP1);
        game.endTurn();
        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.currentHealthPoints).toBe(initialHP);
        game.endTurn();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.currentHealthPoints).toBe(initialHP);
    });



    it("b2-xi_strength: They gain +1 [ATK] and +1 [ATK this turn] till end of turn.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-xi_strength");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0);

        const initialAtk = player1.attackPoints;
        const initialAtkThisTurn = player1.attackThisTurn;

        // (pills as LootCard).debugSetTargets([player1]);
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk + 1);
        expect(player1.attackThisTurn).toBe(initialAtkThisTurn + 1);
        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.attackThisTurn).toBe(0 ); // not his turn
        game.endTurn();
        await game.resolveStack();

        expect(player1.attackPoints).toBe(initialAtk);
        expect(player1.attackThisTurn).toBe(1); // his turn
    });

    it("b2-xi_strength: give to other player +1 [ATK] and +1 [ATK this turn] till end of turn", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-xi_strength");
        player1.hand.addToHand(card!);

        game.playCard(player1, 0, [player2]);

        const initialAtk1 = player1.attackPoints;
        const initialAtk = player2.attackPoints;
        const initialAtkThisTurn1 = player1.attackThisTurn;
        const initialAtkThisTurn = player2.attackThisTurn;

        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk + 1);
        expect(player1.attackPoints).toBe(initialAtk1);
        expect(player2.attackThisTurn).toBe(initialAtkThisTurn + 1);
        expect(player2.attackThisTurn).toBe(initialAtkThisTurn + 1);
        expect(player1.attackThisTurn).toBe(initialAtkThisTurn1);
        game.endTurn();
        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.attackThisTurn).toBe(initialAtkThisTurn + 1); // his turn
        game.endTurn();
        await game.resolveStack();

        expect(player2.attackPoints).toBe(initialAtk);
        expect(player2.attackThisTurn).toBe(initialAtkThisTurn);
    });

});

describe("Loot Cards - 3 players tests", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(() => {
            const setup = setupTestGame({
                        characters: ["b2-judas", "b2-isaac", "b2-samson"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                        playerCount: 3
                    });
            game = setup.game;
            player1 = setup.player1;
            player2 = setup.player2!;
            player3 = setup.player3!;
        });

    it("b2-xx_judgement: tie for most souls chooses target to destroy soul", async () => {

        const judgement = game.decks["loot"]!.getCardFromSlug("b2-xx_judgement");
        player1.hand.addToHand(judgement!);

        // Give each player one soul
        const soul1 = game.decks["loot"]!.cards[0]!; soul1.soul = 1; game.addSoul(player1, soul1);
        const soul2 = game.decks["loot"]!.cards[1]!; soul2.soul = 1; game.addSoul(player2, soul2);
        const soul3 = game.decks["loot"]!.cards[2]!; soul3.soul = 1; game.addSoul(player3, soul3);


        game.playCard(player1, 0, [player2]);
        // Choose player2 among the tied leaders
        // (judgement as LootCard).debugSetTargets([player2]);
        await game.resolveStack();

        expect(player2.totalSouls).toBe(0);
        expect(player1.totalSouls).toBe(1);
        expect(player3.totalSouls).toBe(1);
    });

    it("b2-xx_judgement: issuer with most souls destroys one of their souls", async () => {

        const judgement = game.decks["loot"]!.getCardFromSlug("b2-xx_judgement");
        player1.hand.addToHand(judgement!);

        // player1 has 2 souls, others have 1
        const s1 = game.decks["loot"]!.cards[0]!; s1.soul = 2; game.addSoul(player1, s1);
        const s2 = game.decks["loot"]!.cards[1]!; s2.soul = 1; game.addSoul(player1, s2);
        const s3 = game.decks["loot"]!.cards[2]!; s3.soul = 1; game.addSoul(player2, s3);

        game.playCard(player1, 0, [player1]);
        await game.resolveStack();

        expect(player1.totalSouls).toBe(1);
        expect(player2.totalSouls).toBe(1);
        expect(player3.totalSouls).toBe(0);
    });

    it("b2-xx_judgement: issuer with most souls destroys one of their souls invalid target", async () => {

        const judgement = game.decks.loot?.getCardFromSlug("b2-xx_judgement");
        // ["loot"]!.getCardFromSlug("b2-xx_judgement");
        player1.hand.addToHand(judgement!);

        // player1 has 2 souls, others have 1
        const s1 = game.decks["loot"]!.cards[0]!; s1.soul = 2; game.addSoul(player1, s1);
        const s2 = game.decks["loot"]!.cards[1]!; s2.soul = 1; game.addSoul(player1, s2);
        const s3 = game.decks["loot"]!.cards[2]!; s3.soul = 1; game.addSoul(player2, s3);

        game.playCard(player1, 0, [player1]);
        s1.soul = 0; // Invalidate target during resolution
        await game.resolveStack();

        expect(player1.totalSouls).toBe(1);
        expect(player2.totalSouls).toBe(1);
        expect(player3.totalSouls).toBe(0);
    });
});