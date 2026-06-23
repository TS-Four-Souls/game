import type { EffectOnStack } from '@/models/stackElement';
import { ItemCard, MonsterCard, TreasureCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands } from "@/tests/testHelpers";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DiceRoll } from "../../models/stackElement";
import { mockGameSelections, setupTestGame } from "../testHelpers";

describe("Event Monsters - Roll Effects (Chests)", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    // b2-chest: Roll- 1-2: Gain 1¢. 3-4: Gain 3¢. 5-6: Gain 6¢.
    it("chest - roll 1: gain 1¢", async () => {
        const chest = game.obtainCard("b2-chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest);
        
        const initialCoins = player1.coins;
        
        // Discard existing monster and draw the chest event
        game.encounters.discardTop(0);
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack(); // resolve the event addition
        
        const dice = game.stack.elements[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("chest - roll 3: gain 3¢", async () => {
        const chest = game.obtainCard("b2-chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("chest - roll 6: gain 6¢", async () => {
        const chest = game.obtainCard("b2-chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 6);
    });

    // b2-chest_2: Roll- 1-2: Loot 1. 3-4: Loot 2. 5-6: Loot 3.
    it("chest_2 - roll 1: loot 1", async () => {
        const chest2 = game.obtainCard("b2-chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("chest_2 - roll 4: loot 2", async () => {
        const chest2 = game.obtainCard("b2-chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("chest_2 - roll 6: loot 3", async () => {
        const chest2 = game.obtainCard("b2-chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(chest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 3);
    });

    // b2-cursed_chest: Roll- 1-3: Take 1 Damage. 4-5: Take 2 Damage. 6: Search the treasure deck for a Guppy item, gain it, then shuffle the treasure deck.
    it("cursed_chest - roll 2: take 1 damage", async () => {
        const cursedChest = game.obtainCard("b2-cursed_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(cursedChest);
        
        const initialHP = player1.currentHealthPoints;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("cursed_chest - roll 5: take 2 damage", async () => {
        const cursedChest = game.obtainCard("b2-cursed_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(cursedChest);
        
        const initialHP = player1.currentHealthPoints;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    it("cursed_chest - roll 6: search for guppy item", async () => {
        const cursedChest = game.obtainCard("b2-cursed_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(cursedChest);
        
        // Add a Guppy item to treasure deck
        const guppyItem = game.obtainCard("b2-guppys_head") as TreasureCard;
        game.decks["treasure"]!.addTopPosition(guppyItem);
        
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
        expect(player1.inPlay.find(c => c.slug === "b2-guppys_head")).toBeDefined();
        // Search the treasure deck for a Guppy item, gain it, then shuffle the treasure deck.
    });

    // b2-dark_chest: Roll- 1-2: Loot 1. 3-4: Gain 3¢. 5-6: Take 2 damage.
    it("dark_chest - roll 2: loot 1", async () => {
        const darkChest = game.obtainCard("b2-dark_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("dark_chest - roll 4: gain 3¢", async () => {
        const darkChest = game.obtainCard("b2-dark_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("dark_chest - roll 6: take 2 damage", async () => {
        const darkChest = game.obtainCard("b2-dark_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest);
        
        const initialHP = player1.currentHealthPoints;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    // b2-dark_chest_2: Roll- 1-2: Gain 1¢. 3-4: Loot 2. 5-6: Take 2 damage.
    it("dark_chest_2 - roll 1: gain 1¢", async () => {
        const darkChest2 = game.obtainCard("b2-dark_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest2);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("dark_chest_2 - roll 3: loot 2", async () => {
        const darkChest2 = game.obtainCard("b2-dark_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("dark_chest_2 - roll 5: take 2 damage", async () => {
        const darkChest2 = game.obtainCard("b2-dark_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(darkChest2);
        
        const initialHP = player1.currentHealthPoints;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    // b2-gold_chest: Roll- 1-2: Gain +1 Treasure. 3-4: Gain 5¢. 5-6: Gain 7¢.
    it("gold_chest - roll 2: gain +1 treasure", async () => {
        const goldChest = game.obtainCard("b2-gold_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest);
        
        const topTreasure = game.decks["treasure"]!.cards[0]!;
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack();
        expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
        expect(player1.inPlay).toContain(topTreasure);
    });

    it("gold_chest - roll 3: gain 5¢", async () => {
        const goldChest = game.obtainCard("b2-gold_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 5);
    });

    it("gold_chest - roll 6: gain 7¢", async () => {
        const goldChest = game.obtainCard("b2-gold_chest") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 7);
    });

    // b2-gold_chest_2: Roll- 1-2: Gain +1 Treasure. 3-4: Loot 1. 5-6: Loot 2.
    it("gold_chest_2 - roll 1: gain +1 treasure", async () => {
        const goldChest2 = game.obtainCard("b2-gold_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest2);
        
        const topTreasure = game.decks["treasure"]!.cards[0]!;
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack();
        expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
        expect(player1.inPlay).toContain(topTreasure);
    });

    it("gold_chest_2 - roll 4: loot 1", async () => {
        const goldChest2 = game.obtainCard("b2-gold_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("gold_chest_2 - roll 5: loot 2", async () => {
        const goldChest2 = game.obtainCard("b2-gold_chest_2") as MonsterCard;
        game.decks["monster"]!.addTopPosition(goldChest2);
        
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    // b2-secret_room: Roll- 1: Take 3 damage. 2-3: Discard 2 loot cards. 4-5: Gain 7¢. 6: Gain +1 Treasure.
    it("secret_room - roll 1: take 3 damage", async () => {
        const secretRoom = game.obtainCard("b2-secret_room") as MonsterCard;
        game.decks["monster"]!.addTopPosition(secretRoom);
        game.entityHandler.addHealth(player1, 5); // Ensure player has enough health to take damage
        const initialHP = player1.currentHealthPoints;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 3);
    });

    it("secret_room - roll 2: discard 2 loot cards", async () => {
        const secretRoom = game.obtainCard("b2-secret_room") as MonsterCard;
        game.decks["monster"]!.addTopPosition(secretRoom);
        
        // Add loot cards to hand
        game.loot(player1, 5);
        const initialHandSize = player1.hand.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // discard resolution
        
        expect(player1.hand.length).toBe(initialHandSize - 2);
    });

    it("secret_room - roll 4: gain 7¢", async () => {
        const secretRoom = game.obtainCard("b2-secret_room") as MonsterCard;
        game.decks["monster"]!.addTopPosition(secretRoom);
        
        const initialCoins = player1.coins;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 7);
    });

    it("secret_room - roll 6: gain +1 treasure", async () => {
        const secretRoom = game.obtainCard("b2-secret_room") as MonsterCard;
        game.decks["monster"]!.addTopPosition(secretRoom);
        
        const topTreasure = game.decks["treasure"]!.cards[0]!;
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack();
        expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
        expect(player1.inPlay).toContain(topTreasure);
    });
});

describe("Event Monsters - Expansion Effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        mockGameSelections(game);
      dischargeEachItemsAndRemoveCoins(game);
      emptyHands(game);
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, monsterCard);
        game.encounters.forceSetMonsterAtSlot(1, monsterCard2);
        game.decks["treasure"]?.addTopPosition(game.shop.obtainCard("b2-blank_card")!);
    });

    // b2-xl_floor: Expand monster slots by 1
    it("xl_floor - expands monster slots by 1", async () => {
        const xlFloor = game.obtainCard("b2-xl_floor") as MonsterCard;
        game.decks["monster"]!.addTopPosition(xlFloor);
        
        const initialMonsterSlots = game.encounters.slots.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        
        expect(game.encounters.slots.length).toBe(initialMonsterSlots + 1);
    });

    // b2-shop_upgrade: Expand shop slots by 2
    it("shop_upgrade - expands shop slots by 2", async () => {
        const shopUpgrade = game.obtainCard("b2-shop_upgrade") as MonsterCard;
        game.decks["monster"]!.addTopPosition(shopUpgrade);
        
        const initialShopSlots = game.shop.itemsInShop.length;
        
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        expect(game.shop.itemsInShop.length).toBe(initialShopSlots + 2);
    });

    // b2-mom: When this dies, expand monsters slots by 1
    it("mom - expands monster slots by 1 when dies", async () => {
        const mom = game.obtainCard("b2-mom") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mom);
        
        const monster = game.monsters[0]!;
        const initialMonsterSlots = game.encounters._slots.length;
        
        // Kill the monster
        game.entityHandler.kill(player1, monster, mom);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(game.encounters._slots.length).toBe(initialMonsterSlots + 1);
    });

    // b2-mulligan: When this dies, expand monster slots by 1
    it("mulligan - expands monster slots by 1 when dies", async () => {
        const mulligan = game.obtainCard("b2-mulligan") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mulligan);
        
        const monster = game.monsters[0]!;
        const initialMonsterSlots = game.encounters.slots.length;
        
        // Kill the monster
        game.entityHandler.kill(player1, monster, mulligan);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(game.encounters.slots.length).toBe(initialMonsterSlots + 1);
    });

    // b2-hanger: When this dies, expand shop slots by 1
    it("hanger - expands shop slots by 1 when dies", async () => {
        const hanger = game.obtainCard("b2-hanger") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, hanger);
        
        const monster = game.monsters[0]!;
        const initialShopSlots = game.shop.itemsInShop.length;
        
        // Kill the monster
        game.entityHandler.kill(player1, monster, hanger);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(game.shop.itemsInShop.length).toBe(initialShopSlots + 1);
    });
});

describe("Event Monsters - Curse Effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
      dischargeEachItemsAndRemoveCoins(game);
      emptyHands(game);
            for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, monsterCard);
        game.encounters.forceSetMonsterAtSlot(1, monsterCard2);
        game.decks["treasure"]?.addTopPosition(game.shop.obtainCard("b2-blank_card")!);
    });

    // b2-curse_of_amnesia: At the end of your turn, discard 2 loot cards
    it("curse_of_amnesia - discard 2 loot cards at end of turn", async () => {
        const curseOfAmnesia = game.obtainCard("b2-curse_of_amnesia") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfAmnesia);
        
        // Add loot cards to hand
        game.loot(player1, 5);
        const initialHandSize = player1.hand.length;
        
        // Draw the curse to trigger its effect
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, "topDeck", 0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // End player's turn to trigger curse effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.hand.length).toBe(initialHandSize - 2);
        expect(game.encounters._slots[0]).not.toBe(curseOfAmnesia); // Curse should not be in monster slot
    });

    // b2-curse_of_amnesia: remove curse once drawn
    it("curse_of_amnesia - remove curse once drawn", async () => {
        const curseOfAmnesia = game.obtainCard("b2-curse_of_amnesia") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfAmnesia);
        
        // Add loot cards to hand
        game.loot(player1, 5);
        const initialHandSize = player1.hand.length;
        
        // Draw the curse to trigger its effect
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, "topDeck", 0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // End player's turn to trigger curse effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.hand.length).toBe(initialHandSize - 2);
        // expect(false).toBe(true);
        expect(game.encounters._slots[0]).not.toContain(curseOfAmnesia); // Curse should not be in monster slot
    });

    // b2-curse_of_greed: At the end of your turn, lose 4¢
    it("curse_of_greed - lose 4¢ at end of turn", async () => {
        const curseOfGreed = game.obtainCard("b2-curse_of_greed") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfGreed);
        
        // Give player some coins
        game.gainCoins(player1, 10, "gift");
        const initialCoins = player1.coins;
        
        // Draw the curse to trigger its effect
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // End player's turn to trigger curse effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.coins).toBe(initialCoins - 4);
    });

    // b2-curse_of_loss: When you die, destroy a soul you control
    it("curse_of_loss - destroy a soul when you die", async () => {
        const curseOfLoss = game.obtainCard("b2-curse_of_loss") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfLoss);
        
        // Add a soul to player
        const soulCard = game.obtainCard("b2-blank_card") as ItemCard;
        soulCard.soul = 2;
        game.cardHandler.addSoul(player1, soulCard);
        const initialSouls = player1.souls.length;
        
        // Draw the curse
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // Kill the player
        game.entityHandler.kill(player1, player1, curseOfLoss);
        await game.actions.resolveStack(); // death resolution
        const effect = game.stack._stack[0] as EffectOnStack ;
        effect.targets = [soulCard]; // Choose soul to destroy
        await game.actions.resolveStack(); // curse effect resolution
        
        expect(player1.souls.length).toBe(initialSouls - 1);
    });

    // b2-curse_of_pain: At the start of your turn, take 1 damage
    it("curse_of_pain - take 1 damage at start of turn", async () => {
        const curseOfPain = game.obtainCard("b2-curse_of_pain") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfPain);
        
        const initialHP = player1.currentHealthPoints;
        
        // Draw the curse
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // Start next turn to trigger curse effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(initialHP );
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    // b2-curse_of_the_blind: Monsters have +1 [DC] on your turn
    it("curse_of_the_blind - monsters have +1 DC on your turn", async () => {
        const curseOfTheBlind = game.obtainCard("b2-curse_of_the_blind") as MonsterCard;
        game.decks["monster"]!.addTopPosition(curseOfTheBlind);
        
        // Get a monster with known DC
        const fly = game.monsters[0]!;
        const originalDC = fly.evasion;
        
        // Draw the curse
        game.encounters.discardTop(0);
        await game.actions.resolveStack(); // resolve the event addition
        
        // Check DC during player1's turn
        const currentDC = fly.evasion;
        expect(currentDC).toBe(originalDC! + 1);
        
        // Check DC during player2's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const dcOnOtherTurn = fly.evasion;
        expect(game.currentPlayer.id).toBe(player2.id);
        expect(dcOnOtherTurn).toBe(originalDC);
    });
});