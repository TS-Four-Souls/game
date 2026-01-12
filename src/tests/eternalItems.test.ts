import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, treasureCard } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections } from "./testHelpers";

describe("Eternal Items", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        mockGameSelections(game);
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.setupGame();
    });
    // [tap effect] look at the top 5 cards of a deck. put them back in any order.
    it("The D6", async () => {
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [samson, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-samson");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[1]!.slug).toBe("b2-the_d6");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;

        const theD6 = player2.inPlay[1]! as ItemCard;

        player1.hand.addToHand(card);
        game.playCard(player1, 0, []); // play pills
        await game.resolveStack(); // resolve pills play
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1; // Force roll to 1 for testing
        let sumDiceRoll = 0;
        for (let i=0; i<50; i++){
            game.recharge(theD6);
            await game.activateItem(player2, theD6, [dice]);
            await game.resolveStack();
            sumDiceRoll += dice.value;
        }
        expect(sumDiceRoll).not.toBe(50); // value should change
        await game.resolveStack();
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        expect(theD6.charged).toBe(true);
    }); 
    // [Tap Effect] Put the top card of any discard on top of its deck.
    it("The Curse - active", async () => {
        const eve = game.decks["character"]!.getCardFromSlug("b2-eve")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [eve, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-eve");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-the_curse");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        
        const theCurse = player1.inPlay[1]! as ItemCard;
        game.endTurn();
        await game.resolveStack();
        expect(theCurse.charged).toBe(false);
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack();
        expect(theCurse.charged).toBe(true);

        const cards = game.decks["loot"]!.drawSeveral(5) as LootCard[]
        for(const c of cards)
            game.decks["loot"]!.addDiscardTop(c);
        const topDiscardCard = game.decks["loot"]!.discard[0];

        await game.activateItem(player1, theCurse, ["loot"]);
        await game.resolveStack();
        await game.resolveStack(); // resolve the curse effect
        expect(game.decks["loot"]!.discard.length).toBe(4); // top of loot deck should be the previous top of discard
        expect(game.decks["loot"]!.cards[0]).toBe(topDiscardCard); // top of loot deck should be the previous top of discard
    });

    it("The Curse - passive", async () => {
        const eve = game.decks["character"]!.getCardFromSlug("b2-eve")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [eve, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-eve");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-the_curse");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");

        game.endTurn(); // Isaac's turn
        await game.resolveStack(); // Resolve any stack effects
        const theCurse = player1.inPlay[1]! as ItemCard;
        const shouldBeDiscarded = game.decks["treasure"]!.cards[0];
        game.endTurn(); // back to Eve's turn
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack();
        // treasure by default.
        expect(game.decks["treasure"]!.discard[0]).toBe(shouldBeDiscarded);
        expect(game.decks["treasure"]!.cards[0]).not.toBe(shouldBeDiscarded);
    });

    // "[Tap Effect] Put a counter on this.",
    it("The Bone: active effect (put a counter on this)", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-the_forgotten");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-the_bone");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const theBone = player1.inPlay[1]! as ItemCard;
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        expect(theBone.tags.counters).toBe(1);
        game.endTurn();
        expect(theBone.charged).toBe(false);
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        await game.resolveStack();
        expect(theBone.tags.counters).toBe(2);

    });










    // "[Paid Effect] Remove 1 counter from this: Add +1 to a dice roll."
    it("The Bone: paid effect 1 (remove 1 counter to add +1 to dice roll)", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const theBone = player1.inPlay[1]! as ItemCard;
        
        // Add 2 counters to the bone
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        expect(theBone.tags.counters).toBe(2);
        
        // Create a dice roll scenario
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;
        player1.hand.addToHand(card);
        game.playCard(player1, 0, []); // play pills
        await game.resolveStack(); // resolve pills play
        expect(game.stack.size).toBe(1); // Dice roll should be on stack

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4; // Force roll to 4 for testing
        
        // Use paid effect to add +1 to the roll
        await game.activateItem(player1, theBone, [dice], 0); // Index 0 for first paid effect
        await game.resolveStack();
        await game.resolveStack(); // resolve the paid effect
        expect(dice.value).toBe(5); // Should be 4 + 1
        expect(theBone.tags.counters).toBe(1); // Should have 1 counter left
        
        await game.resolveStack(); // resolve the modified dice roll
    });

    // "[Paid Effect] Remove 2 counters from this: Deal 1 damage to a monster or player."
    it("The Bone: paid effect 2 (remove 2 counters to deal 1 damage to player)", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const theBone = player1.inPlay[1]! as ItemCard;
        
        // Add 3 counters to the bone
        for (let i = 0; i < 3; i++) {
            game.recharge(theBone);
            await game.activateItem(player1, theBone);
            await game.resolveStack();
        }
        expect(theBone.tags.counters).toBe(3);
        
        const initialHP = player2.currentHealthPoints;
        
        // Use paid effect to deal damage to player2
        await game.activateItem(player1, theBone, [player2], 1); // Index 1 for second paid effect
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
        expect(theBone.tags.counters).toBe(1); // Should have 1 counter left
    });

    it("The Bone: paid effect 2 (remove 2 counters to deal 1 damage to monster)", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const theBone = player1.inPlay[1]! as ItemCard;
        
        // Add 2 counters to the bone
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        game.recharge(theBone);
        await game.activateItem(player1, theBone);
        await game.resolveStack();
        expect(theBone.tags.counters).toBe(2);
        
        // Add a monster to the board
        const monster = game.monsters[0]!;
        const initialMonsterHP = monster.currentHealthPoints;
        
        // Use paid effect to deal damage to monster
        await game.activateItem(player1, theBone, [monster], 1); // Index 1 for second paid effect
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve damage
        
        expect(monster.currentHealthPoints).toBe(initialMonsterHP - 1);
        expect(theBone.tags.counters).toBe(0); // Should have 0 counters left
    });

    // "[Paid Effect] Remove 5 counters from this: This becomes a soul and loses all abilities."
    it("The Bone: paid effect 3 (remove 5 counters to become a soul)", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const theBone = player1.inPlay[1]! as ItemCard;
        
        // Add 5 counters to the bone
        for (let i = 0; i < 5; i++) {
            game.recharge(theBone);
            await game.activateItem(player1, theBone);
            await game.resolveStack();
        }
        expect(theBone.tags.counters).toBe(5);
        expect(theBone.eternal).toBe(true);
        
        const initialSouls = player1.totalSouls;
        
        // Use paid effect to convert to soul
        await game.activateItem(player1, theBone, [], 2); // Index 2 for third paid effect
        await game.resolveStack(); // resolve soul conversion
        
        expect(theBone.tags.counters).toBe(0); // Counters should be removed
        expect(player1.totalSouls).toBe(initialSouls + 1); // Should gain a soul
        // The bone should lose its eternal status and abilities
        expect(theBone.eternal).toBe(false);
        expect(player1.inPlay.map(card => card.slug)).not.toContain(theBone.slug);
        expect(player1.souls.map(card => card.slug)).toContain(theBone.slug);
    });

    it("The Bone: paid effect 3 cannot be used with less than 5 counters", async () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const theBone = player1.inPlay[1]! as ItemCard;
        
        // Add only 4 counters to the bone
        for (let i = 0; i < 4; i++) {
            game.recharge(theBone);
            await game.activateItem(player1, theBone);
            await game.resolveStack();
        }
        expect(theBone.tags.counters).toBe(4);
        
        const initialSouls = player1.souls;
        
        // Attempt to use paid effect with insufficient counters
        await expect(async () => {
            await game.activateItem(player1, theBone, [], 2)}
        ).toThrow();
        expect(theBone.tags.counters).toBe(4); // Counters should remain unchanged
        expect(player1.souls).toBe(initialSouls); // Souls should remain unchanged
    });



















    // "[Tap Effect] Add or subtract 1 from a roll."
    it("Book of Belial: add ", async () => {
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [judas, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-judas");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-book_of_belial");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const bookOfBelial = player1.inPlay[1]! as ItemCard;
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;
        game.recharge(bookOfBelial);
        expect(bookOfBelial.charged).toBe(true);

        player1.hand.addToHand(card);
        game.playCard(player1, 0, []); // play pills
        await game.resolveStack(); // resolve pills play
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Force roll to 5 for testing
        const initialHandSize = player1.hand.length;
        
        await game.activateItem(player1, bookOfBelial, [dice, -1]); // subtract 1 to roll
        await game.resolveStack();
        expect(dice.value).toBe(4);
        await game.resolveStack();

        await game.resolveStack(); // resolve pills effect
        expect(player1.hand.length).toBe(initialHandSize + 3); // Loot 3 cards
        
    });

    it("Book of Belial: subtract ", async () => {
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [judas, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-judas");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-book_of_belial");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const bookOfBelial = player1.inPlay[1]! as ItemCard;
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;
        game.recharge(bookOfBelial);
        expect(bookOfBelial.charged).toBe(true);

        player1.hand.addToHand(card);
        game.playCard(player1, 0, []); // play pills
        await game.resolveStack(); // resolve pills play
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2; // Force roll to 5 for testing
        
        const initialHandSize = player1.hand.length;
        await game.activateItem(player1, bookOfBelial, [dice, 1]); // subtract 1 to roll
        await game.resolveStack();
        expect(dice.value).toBe(3);
        await game.resolveStack();

        await game.resolveStack(); // resolve pills effect
        expect(player1.hand.length).toBe(initialHandSize + 3); // Loot 3 cards

    });

    // "[Tap Effect] Look at the top 5 cards of a deck. Put them back in any order."
    it("Sleight of Hand ", async () => {
        const cain = game.decks["character"]!.getCardFromSlug("b2-cain")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [cain, isaac]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-cain");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-sleight_of_hand");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");

        const sleightOfHand = player1.inPlay[1]! as ItemCard;
        game.recharge(sleightOfHand);
        expect(sleightOfHand.charged).toBe(true);

        const top5reverse = game.decks["loot"]!.cards.slice(0, 5).map(c => c.slug);
        await game.activateItem(player1, sleightOfHand, ["loot"]);
        await game.resolveStack();
        await game.resolveStack(); // resolve sleight of hand effect
        const top5After = game.getFirstCardsOfDeck("loot", 5).map(c => c.slug);
        expect(top5After).toEqual(top5reverse); // order should be different

    });

    // "[Tap Effect] Choose a player or monster. Prevent the next instance of damage they would take this turn.",
    it("Yum Heart", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const maggy = game.decks["character"]!.getCardFromSlug("b2-maggy")! as CharacterCard;
        game.start(player1, [isaac, maggy]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-maggy");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-yum_heart");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const yumHeart = player2.inPlay[1]! as ItemCard;
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        expect(yumHeart.charged).toBe(true);
        
        expect(player2.currentHealthPoints).toBe(2);
        await game.activateItem(player2, yumHeart);
        await game.resolveStack();
        // simulate large amount of damage to maggy
        game.dealDamage(player2, player2, dummyLoot, 1000);
        await game.resolveStack(); // resolve the damage prevention
        expect(player2.currentHealthPoints).toBe(2); // damage prevented


        game.dealDamage(player2, player2, dummyLoot, 1);
        await game.resolveStack(); // resolve the damage prevention
        expect(player2.currentHealthPoints).toBe(1); // damage taken

        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        expect(yumHeart.charged).toBe(true);
    });
//     "Each time you die, after paying penalties, gain +1 treasure."
    it("Lazarus Rags", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lazarus = game.decks["character"]!.getCardFromSlug("b2-lazarus")! as CharacterCard;
        game.start(player1, [isaac, lazarus]);
        // Wait for async event handlers to complete
        await new Promise(resolve => setTimeout(resolve, 10));
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;

        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-lazarus");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-lazarus_rags");
        expect(player2.inPlay[1]!.eternal).toBe(true);

        // Kill Isaac, verify no treasure gained
        game.kill(player1, player1, dummyLoot);
        await game.resolveStack(); // resolve death
        expect(player1.inPlay.length).toBe(2);

        const blankcard = game.obtainCard("b2-blank_card") as treasureCard; 
        game.decks["treasure"]!.addTopPosition(blankcard); // ensure blank card is on top of treasure deck, to avoid random death prevention items.
        // Kill Lazarus, verify treasure gained
        game.kill(player2, player2, dummyLoot);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve any additional async effects
        expect(player2.inPlay.length).toBe(3);
        const firstItemGained = player2.inPlay[2];

        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        expect(firstItemGained!.eternal).toBe(false);
        expect(firstItemGained!).toBe(blankcard);

        // Kill Lazarus, verify treasure gained
        game.kill(player2, player2, dummyLoot);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack(); // resolve any additional async effects
        expect(player2.inPlay.length).toBe(3);
        expect(player2.inPlay[2]).not.toBe(firstItemGained);

    });

    it("Blood Lust", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        game.start(player1, [isaac, samson]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);

        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-samson");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-blood_lust");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const bloodlust = player2.inPlay[1]! as ItemCard;

        game.recharge(bloodlust);
        expect(bloodlust.charged).toBe(true);

        expect(player2.attackPoints).toBe(1);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(player2.attackPoints).toBe(2);

        game.endTurn();
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.attackPoints).toBe(1);
        expect(bloodlust.charged).toBe(true);

        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
    });

    // "[Tap Effect] Choose one-\nSteal 1\u00A2 from another player.\nLook at the top card of a deck.\nDiscard a loot card, then loot 1."
    // "Each time you take damage, recharge this."
    it("Forever Alone - Option 1: Steal 1\u00A2 from another player", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
        game.start(player1, [isaac, blueBaby]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        expect(player2.inPlay[0]!.slug).toBe("b2-blue_baby");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-forever_alone");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        
        const foreverAlone = player2.inPlay[1]! as ItemCard;
        game.recharge(foreverAlone);
        expect(foreverAlone.charged).toBe(true);
        
        // Give player1 some coins
        player1.gainCoins(5);
        expect(player1.coins).toBe(5);
        expect(player2.coins).toBe(0);
        
        await game.activateItem(player2,
            foreverAlone, ["Steal 1¢ from another player.", player1]);
        await game.resolveStack();
        
        expect(player1.coins).toBe(4); // Lost 1 coin
        expect(player2.coins).toBe(1); // Gained 1 coin
        expect(foreverAlone.charged).toBe(false);
    });

    it("Forever Alone - Option 2: Look at the top card of a deck", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
        game.start(player1, [isaac, blueBaby]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const foreverAlone = player2.inPlay[1]! as ItemCard;
        game.recharge(foreverAlone);
        
        const topLootCard = game.getFirstCardsOfDeck("loot", 1)[0]!;
        
        let peekCalled = false;
        // Mock game.select to choose option 2 (look at top card)
        await game.activateItem(player2,
            foreverAlone, ["Look at the top card of a deck.", "treasure"]);
        await game.resolveStack();
        
        expect(foreverAlone.charged).toBe(false);
    });

    it("Forever Alone - Option 3: Discard a loot card, then loot 1", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
        game.start(player1, [isaac, blueBaby]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const foreverAlone = player2.inPlay[1]! as ItemCard;
        game.recharge(foreverAlone);

        // Give player2 a loot card to discard
        const initialHandSizeT1 = player2.hand.length;
        // The discarded card is chosen on resolve stack, so no need to specify here
        await game.activateItem(player2,
            foreverAlone, ["Discard a loot card, then loot 1."]);
        await game.resolveStack();
        expect(player2.hand.length).toBe(initialHandSizeT1 + 1); // discard nothing, loot 1
        expect(foreverAlone.charged).toBe(false);

        // Recharge and test again
        
        game.recharge(foreverAlone);

        // Give player2 a loot card to discard
        const lootCard = player2.hand.cards[0] as LootCard;
        const initialHandSizeT2 = player2.hand.length;
        // The discarded card is chosen on resolve stack, so no need to specify here
        await game.activateItem(player2,
            foreverAlone, ["Discard a loot card, then loot 1.", lootCard]);
        await game.resolveStack();
        
        // Should discard 1 card and loot 1 card (net 0 change)
        expect(player2.hand.length).toBe(initialHandSizeT2);
        expect(player2.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(foreverAlone.charged).toBe(false);
    });

    it("Forever Alone - Recharges when taking damage", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
        game.start(player1, [isaac, blueBaby]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const foreverAlone = player2.inPlay[1]! as ItemCard;
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
        game.recharge(foreverAlone);
        expect(foreverAlone.charged).toBe(true);
        
        await game.activateItem(player2,
            foreverAlone, ["Steal 1¢ from another player.", player1]);
        await game.resolveStack();
        expect(foreverAlone.charged).toBe(false);
        
        // Deal damage to player2 (Blue Baby)
        game.dealDamage(player1, player2, dummyLoot, 1);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken

        // Forever Alone should recharge after taking damage
        expect(foreverAlone.charged).toBe(true);
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("Forever Alone - Multiple damage instances recharge each time", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
        game.start(player1, [isaac, blueBaby]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const foreverAlone = player2.inPlay[1]! as ItemCard;
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
        // Discharge the item
        foreverAlone.charged = false;
        expect(foreverAlone.charged).toBe(false);
        
        // Deal damage
        game.dealDamage(player1, player2, dummyLoot, 1);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken
        expect(foreverAlone.charged).toBe(true);
        
        // Heal player2
        player2.heal();

        await game.activateItem(player2,
            foreverAlone, ["Steal 1¢ from another player.", player1]);
        await game.resolveStack();
        expect(foreverAlone.charged).toBe(false);
        
        // Deal damage again
        game.dealDamage(player1, player2, dummyLoot, 1);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken
        expect(foreverAlone.charged).toBe(true);
    });

    // "[Tap Effect] Choose one-\nLook at a player's hand. You may swap a card from your hand with one of theirs.\nLoot 1, then put a card from your hand on top of the loot deck."
    it("Incubus - Option 1: Look at a player's hand and swap a card", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lilith = game.decks["character"]!.getCardFromSlug("b2-lilith")! as CharacterCard;
        game.start(player1, [isaac, lilith]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        expect(player2.inPlay[0]!.slug).toBe("b2-lilith");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-incubus");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        
        const incubus = player2.inPlay[1]! as ItemCard;
        game.recharge(incubus);
        expect(incubus.charged).toBe(true);
        
        // Give both players some loot cards
        const cardForPlayer1 = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;
        const cardForPlayer2 = game.decks["loot"]!.getCardFromSlug("b2-a_nickel")!;
        player1.hand.addToHand(cardForPlayer1);
        player2.hand.addToHand(cardForPlayer2);
        
        const player1InitialHand = player1.hand.cards.slice();
        const player2InitialHand = player2.hand.cards.slice();
        
        await game.activateItem(player2,
            incubus, ["Look at a player's hand. You may swap a card from your hand with one of theirs."]);
        await game.resolveStack();
        
        // The swap should have occurred - player1 should have player2's card and vice versa
        expect(player1.hand.cards).toContain(cardForPlayer2);
        expect(player2.hand.cards).toContain(cardForPlayer1);
        expect(player1.hand.cards).not.toContain(cardForPlayer1);
        expect(player2.hand.cards).not.toContain(cardForPlayer2);
        expect(incubus.charged).toBe(false);
    });

    it("Incubus - Option 2: Loot 1, then put a card from your hand on top of the loot deck", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lilith = game.decks["character"]!.getCardFromSlug("b2-lilith")! as CharacterCard;
        game.start(player1, [isaac, lilith]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);

        const incubus = player2.inPlay[1]! as ItemCard;
        game.recharge(incubus);

        const dummyCard = game.decks["loot"]!.draw() as LootCard;
        player2.hand.addToHand(dummyCard);

        const initialHandSize = player2.hand.length;
        const topLootCardBefore = game.decks["loot"]!.cards[0]!;

        await game.activateItem(player2,
            incubus, ["Loot 1, then put a card from your hand on top of the loot deck."]);
        await game.resolveStack();

        // After looting 1 and putting 1 back, hand size should be the same
        expect(player2.hand.length).toBe(initialHandSize);

        // The top card of loot deck should be different (the card put back)
        const topLootCardAfter = game.decks["loot"]!.cards[0]!;
        expect(topLootCardAfter).not.toBe(topLootCardBefore);
        expect(topLootCardAfter).toBe(dummyCard);

        expect(incubus.charged).toBe(false);
    });

    it("Incubus - Option 2: Does nothing with empty hand", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lilith = game.decks["character"]!.getCardFromSlug("b2-lilith")! as CharacterCard;
        game.start(player1, [isaac, lilith]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const incubus = player2.inPlay[1]! as ItemCard;
        game.recharge(incubus);
        
        // Empty player2's hand
        while (player2.hand.length > 0) {
            game.discardFromHandAtIndex(player2, 1);
        }
        
        expect(player2.hand.length).toBe(0);
        
        await game.activateItem(player2,
            incubus, ["Loot 1, then put a card from your hand on top of the loot deck."]);
        await game.resolveStack();
        
        // Should have 1 card after looting (can't put back if hand was empty)
        expect(player2.hand.length).toBe(0);
        expect(incubus.charged).toBe(false);
    });

    it("Incubus - Charges at start of turn", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lilith = game.decks["character"]!.getCardFromSlug("b2-lilith")! as CharacterCard;
        game.start(player1, [isaac, lilith]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        
        const incubus = player2.inPlay[1]! as ItemCard;
        
        // Start with incubus discharged
        incubus.charged = false;
        
        game.endTurn(); // Isaac's turn ends
        await game.resolveStack();
        expect(incubus.charged).toBe(true);
        
    });
});

describe("Eternal Items - 3 players tests", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(() => {
        game = new Game();
        mockGameSelections(game);
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        player3 = new Player("Player 3");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.addPlayer(player3);
        game.setupGame();
    });
    
    it("Blood Lust - recharge on end turn", async () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        game.start(player1, [isaac, samson, judas]);
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
        for( const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]){
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-samson");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-blood_lust");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const bloodlust = player2.inPlay[1]! as ItemCard;

        game.endTurn(); // samson turn
        await game.resolveStack();
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(false);
        game.endTurn(); // samson turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);;
        expect(player1.attackPoints).toBe(1);
        await game.activateItem(player2, bloodlust, [player1]);
        await game.resolveStack();
        expect(player1.attackPoints).toBe(2);
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(false); 
        game.endTurn(); // samson turn
        await game.resolveStack();
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(true);
        await game.activateItem(player2, bloodlust);
        await game.resolveStack();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        await game.resolveStack(); // Resolve any stack effects
        expect(bloodlust.charged).toBe(false);
    });
});

