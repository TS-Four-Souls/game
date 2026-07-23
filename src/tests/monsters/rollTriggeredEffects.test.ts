import type { LootCard } from "@/models/cards";
import { ItemCard, MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DiceRoll } from "../../models/stackElement";
import { setupTestGame } from "../testHelpers";

describe("Monsters - Roll Triggered Effects", () => {
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

    // NOTE: These tests are written for when cursed_horf effect is implemented
    // The card exists but the "[Curse Effect] Each time a player rolls a ➁, they take 2 damage." effect may not be fully implemented yet
    
    // b2-cursed_horf: [Curse Effect] Each time a player rolls a ➁, they take 2 damage.
    it("cursed_horf - player takes 2 damage when rolling a 2", async () => {
        // This test assumes cursed_horf card exists and its effect is implemented
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        
        game.encounters.forceSetMonsterAtSlot(0, cursedHorf);
        
        game.entityHandler.addHealth(player1, 10); // Ensure player has enough HP to take damage
        const initialHP = player1.currentHealthPoints;
        
        // Create a dice roll (simulating any roll - attack, loot card effect, etc.)
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        // Play pills which causes a roll
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack(); // resolve pills play
        
        expect(game.stack.size).toBe(1); // dice roll on stack
        const dice = game.stack.elements[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        
        // Set dice value to 2 to trigger cursed_horf effect
        dice.value = 2;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve cursed_horf effect
        await game.actions.resolveStack(); // resolve cursed_horf damage effect
        
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    it("cursed_horf - no damage when rolling values other than 2", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        expect(cursedHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedHorf);
        
        const initialHP = player1.currentHealthPoints;
        
        // Create a dice roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Non-triggering value
        
        await game.actions.resolveStack();
        
        // No damage should be dealt
        expect(player1.currentHealthPoints).toBe(initialHP);
    });

    it("cursed_horf - triggers for any player's rolls", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        expect(cursedHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedHorf);
        
        game.entityHandler.addLootPlay(player2, 1); // Give player 2 a loot play
        
        const initialHP = player2.currentHealthPoints;
        
        // Player 2 rolls
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player2.hand.addToHand(lootCard);
        
        game.actions.playCard(player2, 0, []);
        await game.actions.resolveStack();
        
        expect(game.stack.size).toBeGreaterThan(0);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack(); // resolve dice roll and cursed_horf damage effect
        await game.actions.resolveStack(); // resolve cursed_horf effect
        await game.actions.resolveStack(); // resolve cursed_horf damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 2);
    });

    it("cursed_horf - multiple triggers in same turn", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        expect(cursedHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedHorf);
        game.entityHandler.addHealth(player1, 10); // Ensure player has enough HP to take damage
        const initialHP = player1.currentHealthPoints;
        
        // First roll
        const lootCard1 = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(lootCard1);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice1 = game.stack.elements[0] as DiceRoll;
        dice1.value = 2;
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve cursed_horf effect
        await game.actions.resolveStack(); // resolve cursed_horf damage

        expect(player1.currentHealthPoints).toBe(initialHP - 2);
        
        // Second roll in same turn
        const lootCard2 = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard2);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice2 = game.stack.elements[0] as DiceRoll;
        dice2.value = 2;
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve cursed_horf effect
        await game.actions.resolveStack(); // resolve cursed_horf damage

        // Should trigger again
        expect(player1.currentHealthPoints).toBe(initialHP - 4);
    });

    // b2-cursed_fatty: [Curse Effect] Each time a player rolls a ➄, they discard a loot card.
    it("cursed_fatty - player discards a loot card when rolling a 5", async () => {
        const cursedFatty = game.obtainCard("b2-cursed_fatty") as MonsterCard;
        expect(cursedFatty).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedFatty);
        
        // Give player 1 a loot card in hand
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        const initialHandSize = player1.hand.length;
        
        // Trigger a roll
        const triggerCard = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(triggerCard);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve cursed_fatty effect
        
        // Player should have discarded one loot card
        expect(player1.hand.length).toBe(initialHandSize - 1);
    });

    it("cursed_fatty - no discard when rolling values other than 5", async () => {
        const cursedFatty = game.obtainCard("b2-cursed_fatty") as MonsterCard;
        expect(cursedFatty).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedFatty);
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        const initialHandSize = player1.hand.length;
        
        const triggerCard = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(triggerCard);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3; // Non-triggering value
        
        await game.actions.resolveStack();
        
        // Hand size should remain the same
        expect(player1.hand.length).toBe(initialHandSize);
    });

    // b2-cursed_gaper: [Curse Effect] Each time a player rolls a ➃, each monster gains +1 [ATK] till end of turn.
    it("cursed_gaper - each monster gains +1 ATK when rolling a 4", async () => {
        const cursedGaper = game.obtainCard("b2-cursed_gaper") as MonsterCard;
        expect(cursedGaper).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedGaper);
        
        // Record initial ATK values
        const initialATK = game.monsters.map(m => m?.attackPoints || 0);
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve cursed_gaper effect
        
        expect(game.encounters.attackModifier).toBe(1);
        // Each monster should have +1 ATK
        const currentATK = game.monsters.map(m => m?.attackPoints || 0);
        initialATK.forEach((atkValue, index) => {
            expect(currentATK[index]).toBe(atkValue + 1);
        });
    });

    it("cursed_gaper - no ATK gain when rolling values other than 4", async () => {
        const cursedGaper = game.obtainCard("b2-cursed_gaper") as MonsterCard;
        expect(cursedGaper).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedGaper);
        
        const initialATK = game.monsters.map(m => m?.attackPoints || 0);
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2; // Non-triggering value
        
        await game.actions.resolveStack();
        
        const currentATK = game.monsters.map(m => m?.attackPoints || 0);
        initialATK.forEach((atkValue, index) => {
            expect(currentATK[index]).toBe(atkValue);
        });
    });

    // b2-cursed_keeper_head: [Curse Effect] Each time a player rolls a ➀, they lose 2¢.
    it("cursed_keeper_head - player loses 2 coins when rolling a 1", async () => {
        const cursedKeeperHead = game.obtainCard("b2-cursed_keeper_head") as MonsterCard;
        expect(cursedKeeperHead).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedKeeperHead);
        
        game.gainCoins(player1, 10, ("debug")); // Ensure player has enough coins
        const initialCoins = player1.coins;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve cursed_keeper_head effect
        
        expect(player1.coins).toBe(initialCoins - 2);
    });

    it("cursed_keeper_head - no coin loss when rolling values other than 1", async () => {
        const cursedKeeperHead = game.obtainCard("b2-cursed_keeper_head") as MonsterCard;
        expect(cursedKeeperHead).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedKeeperHead);
        
        game.gainCoins(player1, 10, ("debug"));
        const initialCoins = player1.coins;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6; // Non-triggering value
        
        await game.actions.resolveStack();
        
        expect(player1.coins).toBe(initialCoins);
    });

    // b2-holy_dip: Each time a player rolls a ❶, they gain 1¢.
    it("holy_dip - player gains 1 coin when rolling a 1", async () => {
        const holyDip = game.obtainCard("b2-holy_dip") as MonsterCard;
        expect(holyDip).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyDip);
        
        const initialCoins = player1.coins;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve holy_dip effect
        
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("holy_dip - no coin gain when rolling values other than 1", async () => {
        const holyDip = game.obtainCard("b2-holy_dip") as MonsterCard;
        expect(holyDip).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyDip);
        
        const initialCoins = player1.coins;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4; // Non-triggering value
        
        await game.actions.resolveStack();
        
        expect(player1.coins).toBe(initialCoins);
    });

    // b2-holy_keeper_head: Each time a player rolls a ❹, they gain 2¢.
    it("holy_keeper_head - player gains 2 coins when rolling a 4", async () => {
        const holyKeeperHead = game.obtainCard("b2-holy_keeper_head") as MonsterCard;
        expect(holyKeeperHead).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyKeeperHead);
        
        const initialCoins = player1.coins;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve holy_keeper_head effect
        
        expect(player1.coins).toBe(initialCoins + 2);
    });

    it("holy_keeper_head - no coin gain when rolling values other than 4", async () => {
        const holyKeeperHead = game.obtainCard("b2-holy_keeper_head") as MonsterCard;
        expect(holyKeeperHead).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyKeeperHead);
        
        const initialCoins = player1.coins;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2; // Non-triggering value
        
        await game.actions.resolveStack();
        
        expect(player1.coins).toBe(initialCoins);
    });

    // b2-holy_moms_eye: Each time a player rolls a ❷, they may recharge an item.
    it("holy_moms_eye - player may recharge an item when rolling a 2", async () => {
        const holyMomsEye = game.obtainCard("b2-holy_moms_eye") as MonsterCard;
        expect(holyMomsEye).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyMomsEye);
        
        // Give player 1 a tapped item
        const item = player1.inPlay[0] as ItemCard;
        item.charged = false;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.actions.resolveStack(); // resolve the dice roll
        
        // Should have a recharge effect on the stack (may recharge an item)
        expect(game.stack.size).toBeGreaterThan(0);
        await game.actions.resolveStack(); // resolve the effect
        expect(item.charged).toBe(true);
    });

    it("holy_moms_eye - no recharge when rolling values other than 2", async () => {
        const holyMomsEye = game.obtainCard("b2-holy_moms_eye") as MonsterCard;
        expect(holyMomsEye).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyMomsEye);
        
        const item = player1.character as ItemCard;
        item.charged = false;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Non-triggering value
        
        await game.actions.resolveStack();
        
        // Item should remain tapped
        expect(item.charged).toBe(false);
    });

    // b2-holy_squirt: Each time a player rolls a ❺, they loot 1.
    it("holy_squirt - player loots 1 when rolling a 5", async () => {
        const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
        expect(holySquirt).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holySquirt);
        
        const initialHandSize = player1.hand.length;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve holy_squirt effect
        await game.actions.resolveStack(); // resolve loot 1
        
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("holy_squirt - no loot when rolling values other than 5", async () => {
        const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
        expect(holySquirt).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holySquirt);
        
        const initialHandSize = player1.hand.length;
        
        const lootCard = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3; // Non-triggering value
        
        await game.actions.resolveStack();
        
        expect(player1.hand.length).toBe(initialHandSize);
    });

    // b2-holy_dinga: Each time a player rolls a ❻, they heal 1 [HP].
    it("holy_dinga - player heals 1 HP when rolling a 6", async () => {
        const holyDinga = game.obtainCard("b2-holy_dinga") as MonsterCard;
        expect(holyDinga).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyDinga);
        
        // Damage player first so they can heal
        game.entityHandler.dealDamage(player1, player1, {card: holyDinga, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        const initialHP = player1.currentHealthPoints;
        
        // Trigger a roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);   
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve holy_dinga effect
        
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("holy_dinga - no healing when rolling values other than 6", async () => {
        const holyDinga = game.obtainCard("b2-holy_dinga") as MonsterCard;
        expect(holyDinga).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, holyDinga);
        
        game.entityHandler.dealDamage(player1, player1, {card: holyDinga, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        const initialHP = player1.currentHealthPoints;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4; // Non-triggering value
        
        await game.actions.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(initialHP);
    });

    // b2-cursed_psy_horf: [Curse Effect] Each time a player activates an item, they take 1 damage.
    it("cursed_psy_horf - player takes 1 damage when activating an item", async () => {
        const cursedPsyHorf = game.obtainCard("b2-cursed_psy_horf") as MonsterCard;
        expect(cursedPsyHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedPsyHorf);
        
        game.entityHandler.addHealth(player1, 10); // Ensure player has enough HP to take damage
        const initialHP = player1.currentHealthPoints;
        
        // Give player 1 an activatable item
        const item = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.cardHandler.addInPlay(player1, item);
        game.cardHandler.recharge(item);

        // Activate the item
        await game.activateItem(player1, item);
        await game.actions.resolveStack(); // resolve cursed_psy_horf effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve item activation
        
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("cursed_psy_horf - triggers for any player activating an item", async () => {
        const cursedPsyHorf = game.obtainCard("b2-cursed_psy_horf") as MonsterCard;
        expect(cursedPsyHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedPsyHorf);
        
        game.entityHandler.addHealth(player2, 10);
        const initialHP = player2.currentHealthPoints;
        
        // Give player 2 an activatable item
        const item = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.cardHandler.addInPlay(player2, item);
        
        // Player 2 activates the item
        await game.activateItem(player2, item);
        await game.actions.resolveStack(); // resolve item activation
        await game.actions.resolveStack(); // resolve cursed_psy_horf effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    it("cursed_psy_horf - multiple activations trigger multiple times", async () => {
        const cursedPsyHorf = game.obtainCard("b2-cursed_psy_horf") as MonsterCard;
        expect(cursedPsyHorf).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedPsyHorf);
        
        const initialHP = player1.currentHealthPoints;
        
        // Give player 1 two activatable items
        const item1 = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.cardHandler.addInPlay(player1, item1);
        game.cardHandler.recharge(item1);
        const item2 = game.obtainCard("b2-tech_x") as ItemCard;
        game.cardHandler.addInPlay(player2, item2);
        game.cardHandler.recharge(item2);
        
        // Activate first item
        await game.activateItem(player1, item1);
        await game.actions.resolveStack(); // resolve item activation
        await game.actions.resolveStack(); // resolve cursed_psy_horf effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
        
        // Activate second item
        await game.activateItem(player2, item2);
        await game.actions.resolveStack(); // resolve item activation
        await game.actions.resolveStack(); // resolve cursed_psy_horf effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    // b2-cursed_moms_hand: [Curse Effect] When the active player rolls a 6, cancel everything that hasn't resolved and end the turn.
    it("cursed_moms_hand - cancels stack and ends turn when active player rolls a 6", async () => {
        const cursedMomsHand = game.obtainCard("b2-cursed_moms_hand") as MonsterCard;
        expect(cursedMomsHand).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedMomsHand);
        
        const initialTurnPlayer = game.currentPlayer;
        expect(initialTurnPlayer).toBe(player1);

        // Add some extra effects to the stack that should be cancelled
        const extraCard = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(extraCard);
        game.actions.playCard(player1, 0, []);
        
        // Active player (player1) rolls
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack(); // resolve pills play
        
        const dice = game.stack.elements[1] as DiceRoll;
        dice.value = 6;
        
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve cursed_moms_hand effect which clears stack and ends turn
        
        await game.actions.resolveStack(); // on turn end effect
        await game.actions.resolveStack(); // on turn end effect
        await game.actions.resolveStack(); // on turn end effect
        
        expect(game.stack.size).toBe(0);
        // Stack should be cleared (the effect itself clears it) and turn should have ended
        expect(game.currentPlayer).not.toBe(initialTurnPlayer);
    });

    it("cursed_moms_hand - does not trigger when active player rolls values other than 6", async () => {
        const cursedMomsHand = game.obtainCard("b2-cursed_moms_hand") as MonsterCard;
        expect(cursedMomsHand).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, cursedMomsHand);
        
        const initialTurnPlayer = game.currentPlayer;
        
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3; // Non-triggering value
        
        await game.actions.resolveStack();
        
        // Turn should not end, player should still be active
        expect(game.currentPlayer).toBe(initialTurnPlayer);
    });

    // b2-daddy_long_legs: Each time the attacking player rolls an attack roll of 1, each monster gains +1 [DC] till end of turn.
    it("daddy_long_legs - each monster gains +1 DC when attacking player rolls a 1", async () => {
        const daddyLongLegs = game.obtainCard("b2-daddy_long_legs") as MonsterCard;
        expect(daddyLongLegs).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, daddyLongLegs);
        
        // Add another monster to test that all monsters gain DC
        const monster2Card = game.obtainCard("b2-pooter") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(1, monster2Card);
        
        // Get the actual Monster entities from slots
        const daddyMonster = game.monsters[0]!;
        
        // Record initial DC values
        const initialDC = game.monsters.map(m => m?.evasion || 0);
        
        // Declare attack
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, daddyMonster);
        
        game.entityHandler.addHealth(daddyMonster, 10);
        
        // Make attack roll
        game.actions.attackRoll(player1);
        
        const dice = game.stack.elements[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // Triggering value
        
        await game.actions.resolveStack(); // resolve the dice roll
        await game.actions.resolveStack(); // resolve daddy_long_legs effect
        
        // Each monster should have +1 DC
        const currentDC = game.monsters.map(m => m?.evasion || 0);
        initialDC.forEach((dcValue, index) => {
            if (game.monsters[index]) {
                expect(currentDC[index]).toBe(dcValue + 1);
            }
        });
    });

    it("daddy_long_legs - no DC gain when rolling values other than 1", async () => {
        const daddyLongLegs = game.obtainCard("b2-daddy_long_legs") as MonsterCard;
        expect(daddyLongLegs).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, daddyLongLegs);
        
        const daddyMonster = game.monsters[0]!;
        const initialDC = game.monsters.map(m => m?.evasion || 0);
        
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, daddyMonster);
        
        game.entityHandler.addHealth(daddyMonster, 10);
        
        game.actions.attackRoll(player1);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Non-triggering value
        
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        const currentDC = game.monsters.map(m => m?.evasion || 0);
        initialDC.forEach((dcValue, index) => {
            expect(currentDC[index]).toBe(dcValue);
        });
    });
});
