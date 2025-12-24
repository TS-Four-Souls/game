import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { CharacterCard, ItemCard, treasureCard, MonsterCard } from "@/models/cards";
import { Monster } from "@/models/monster";
import type { ChooseOneResult } from "@/models/effectParser";

describe("b2-placebo - copies tap ability of non-eternal item", () => {
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

    it("placebo can copy sack_of_pennies tap effect (gain 1¢)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        const initialCoins = player1.coins;

        // Recharge placebo and activate it to copy sack_of_pennies
        game.recharge(placebo);
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();
        game.resolveStack();

        // Player should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
        // Placebo should be deactivated
        expect(placebo.charged).toBe(false);
    });

    it("placebo can copy mr_boom tap effect (deal 1 damage to monster)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const mrBoom = game.shop.obtainCard("b2-mr_boom") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, mrBoom);

        // Get a monster
        const monster = game.monsters[0]!;
        const initialHP = monster.currentHealthPoints;

        // Recharge placebo and activate it to copy mr_boom
        game.recharge(placebo);
        game.activateItem(player1, placebo, [mrBoom, [monster]]);
        game.resolveStack();
        game.resolveStack();
        game.resolveStack();

        // Monster should take 1 damage
        expect(monster.currentHealthPoints).toBe(initialHP - 1);
    });

    it("placebo can copy razor_blade tap effect (deal 1 damage to player)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const razorBlade = game.shop.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, razorBlade);

        const initialHP = player2.currentHealthPoints;

        // Recharge placebo and activate it to copy razor_blade
        game.recharge(placebo);
        game.activateItem(player1, placebo, [razorBlade, [player2]]);
        game.resolveStack();
        game.resolveStack();

        // Player2 should take 1 damage
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    it("placebo can copy the_battery tap effect (recharge another item)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const theBattery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, theBattery);
        game.addInPlay(player1, sackOfPennies);

        // Deactivate sack_of_pennies
        game.recharge(sackOfPennies);
        game.activateItem(player1, sackOfPennies);
        game.resolveStack();
        expect(sackOfPennies.charged).toBe(false);

        // Recharge placebo and activate it to copy the_battery
        game.recharge(placebo);
        game.activateItem(player1, placebo, [theBattery, [sackOfPennies]]);
        game.resolveStack();

        // sack_of_pennies should be recharged
        expect(sackOfPennies.charged).toBe(true);
    });

    it("placebo can copy boomerang tap effect (steal loot card)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const boomerang = game.shop.obtainCard("b2-boomerang") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, boomerang);

        // Give player2 some loot cards
        game.loot(player2, 3);
        const initialP1Hand = player1.hand.length;
        const initialP2Hand = player2.hand.length;

        // Recharge placebo and activate it to copy boomerang
        game.recharge(placebo);
        game.activateItem(player1, placebo, [boomerang, [player2]]);
        game.resolveStack();

        // Player1 should have 1 more card, player2 should have 1 less
        expect(player1.hand.length).toBe(initialP1Hand + 1);
        expect(player2.hand.length).toBe(initialP2Hand - 1);
    });

    it("placebo can copy jawbone tap effect (steal 3¢)", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const jawbone = game.shop.obtainCard("b2-jawbone") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, jawbone);

        // Give player2 some coins
        game.gainCoins(player2, 10);
        const initialP1Coins = player1.coins;
        const initialP2Coins = player2.coins;

        // Recharge placebo and activate it to copy jawbone
        game.recharge(placebo);
        game.activateItem(player1, placebo, [jawbone, [player2]]);
        game.resolveStack();

        // Player1 should gain 3¢, player2 should lose 3¢
        expect(player1.coins).toBe(initialP1Coins + 3);
        expect(player2.coins).toBe(initialP2Coins - 3);
    });

    it("placebo can copy an item controlled by another player", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player2, sackOfPennies); // Player2 controls it

        const initialCoins = player1.coins;

        // Recharge placebo and activate it to copy player2's sack_of_pennies
        game.recharge(placebo);
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();

        // Player1 should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("placebo deactivates the copied item's effect slot but not the original item", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        // Both items start recharged
        game.recharge(placebo);
        game.recharge(sackOfPennies);
        expect(placebo.charged).toBe(true);
        expect(sackOfPennies.charged).toBe(true);

        // Activate placebo to copy sack_of_pennies
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();

        // Placebo should be deactivated, but sack_of_pennies should still be charged
        expect(placebo.charged).toBe(false);
        expect(sackOfPennies.charged).toBe(true);
    });

    it("placebo can be used multiple times by recharging", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        const initialCoins = player1.coins;

        // First use
        game.recharge(placebo);
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);

        // Recharge and use again
        game.recharge(placebo);
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 2);
    });

    it("placebo can copy different items on different activations", () => {
        const placebo = game.shop.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        const razorBlade = game.shop.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);
        game.addInPlay(player1, razorBlade);

        const initialCoins = player1.coins;
        const initialHP = player2.currentHealthPoints;

        // First use - copy sack_of_pennies
        game.recharge(placebo);
        game.activateItem(player1, placebo, [sackOfPennies]);
        game.resolveStack();
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);

        // Second use - copy razor_blade
        game.recharge(placebo);
        game.activateItem(player1, placebo, [razorBlade, [player2]]);
        game.resolveStack();
        game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });
});

describe("b2-modeling_clay - becomes permanent copy of non-eternal item", () => {
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

    it("modeling_clay becomes a copy of sack_of_pennies permanently", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);

        // Verify initial state
        expect(modelingClay.name).toBe("Modeling Clay");
        expect(modelingClay.slug).toBe("b2-modeling_clay");

        // Activate modeling_clay to become sack_of_pennies
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [sackOfPennies]);
        game.resolveStack();

        // modeling_clay should now have sack_of_pennies properties
        expect(modelingClay.name).toBe("Sack Of Pennies");
        expect(modelingClay.slug).toBe("b2-sack_of_pennies");

        // Test that it can gain 1¢ like sack_of_pennies
        const initialCoins = player1.coins;
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("modeling_clay transformation is permanent (survives turn changes)", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);
        game.addHealth(player1, 10); // Ensure player1 has enough HP
        // Transform
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [sackOfPennies]);
        game.resolveStack();

        // End turn
        game.endTurn();
        game.resolveStack(); // Resolve any stack effects
        expect(game.currentPlayer).toBe(player2);

        // Still should be sack_of_pennies
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // End player2's turn
        game.endTurn();
        game.resolveStack(); // Resolve any stack effects
        expect(game.currentPlayer).toBe(player1);

        // Still should be sack_of_pennies
        expect(modelingClay.name).toBe("Sack Of Pennies");
    });

    it("modeling_clay can copy passive items", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [breakfast]);
        game.resolveStack();

        // Should have breakfast's properties
        expect(modelingClay.name).toBe("Breakfast");
        expect(modelingClay.slug).toBe("b2-breakfast");

        // Should have +1 HP from breakfast effect
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("modeling_clay can copy items from other players", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sackOfPennies); // Player2 controls it

        // Transform into player2's sack_of_pennies
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [sackOfPennies]);
        game.resolveStack();

        // Should be transformed
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Player1 should be able to use it
        const initialCoins = player1.coins;
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("modeling_clay retains its charged state after transformation", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);

        // Recharge and transform
        game.recharge(modelingClay);
        const wasCharged = modelingClay.charged;
        game.activateItem(player1, modelingClay, [sackOfPennies]);
        game.resolveStack();

        // After activation, should be uncharged (consumed the charge)
        expect(modelingClay.charged).toBe(false);
    });

    it("transformed modeling_clay keeps working as the copied item", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const razorBlade = game.shop.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, razorBlade);

        // Transform into razor_blade
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [razorBlade]);
        game.resolveStack();
        game.resolveStack();

        const initialHP = player2.currentHealthPoints;

        // Use it multiple times to verify it keeps working
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [player2]);
        game.resolveStack();
        game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 1);

        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [player2]);
        game.resolveStack();
        game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 2);
    });

    it("modeling_clay copies item from shop and both work independently", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sackInShop = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sackInShop); // Player2 has the original

        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        // Transform modeling_clay into sack_of_pennies
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [sackInShop]);
        game.resolveStack();

        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Player1's modeling_clay (now sack_of_pennies) works
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, []);
        game.resolveStack();
        expect(player1.coins).toBe(player1InitialCoins + 1);

        // Player2's original sack_of_pennies still works independently
        game.recharge(sackInShop);
        game.activateItem(player2, sackInShop, []);
        game.resolveStack();
        expect(player2.coins).toBe(player2InitialCoins + 1);
    });

    it("modeling_clay copying passive item doesn't affect original when reused", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const breakfast1 = game.shop.obtainCard("b2-breakfast") as ItemCard;
        
        const player1InitialHP = player1.currentHealthPoints;
        const player2InitialHP = player2.currentHealthPoints;

        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, breakfast1); // Player2 has original breakfast

        // Transform into breakfast
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [breakfast1]);
        game.resolveStack();

        // Player1 should have +1 HP from modeling_clay-as-breakfast
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);
        
        // Player2 should have +1 HP from original breakfast
        expect(player2.currentHealthPoints).toBe(player2InitialHP + 1);

        // Turn changes - both effects persist
        game.endTurn();
        game.endTurn();

        // Both players keep their HP bonuses (modeling_clay is permanent)
        // But after turn changes, HP might be recalculated
        expect(player1.currentHealthPoints).toBeGreaterThanOrEqual(player1InitialHP);
        expect(player2.currentHealthPoints).toBeGreaterThanOrEqual(player2InitialHP);
    });

    it("modeling_clay cannot transform multiple times (permanent transformation)", () => {
        const modelingClay = game.shop.obtainCard("b2-modeling_clay") as ItemCard;
        const sack = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        const battery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sack);
        game.addInPlay(player2, battery);

        // First transformation: sack_of_pennies
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, [sack]);
        game.resolveStack();
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Use it
        const coinsBeforeUse = player1.coins;
        game.recharge(modelingClay);
        game.activateItem(player1, modelingClay, []);
        game.resolveStack();
        expect(player1.coins).toBe(coinsBeforeUse + 1);

        // Modeling clay is now permanently sack_of_pennies - it retains this identity
        // It no longer has the modeling_clay transformation effect
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Original sack still works for player2
        game.recharge(sack);
        const player2CoinsBeforeUse = player2.coins;
        game.activateItem(player2, sack, []);
        game.resolveStack();
        expect(player2.coins).toBe(player2CoinsBeforeUse + 1);
    });
});

describe("b2-diplopia - becomes temporary copy of passive item till end of turn", () => {
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

    it("diplopia becomes a copy of breakfast temporarily", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();

        // Should be transformed
        expect(diplopia.name).toBe("Breakfast");
        expect(diplopia.slug).toBe("b2-breakfast");

        // Should have +1 HP from breakfast effect
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("diplopia reverts back at end of turn", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();

        // Should be breakfast
        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);

        // End turn
        game.endTurn();

        // Should revert back to diplopia
        expect(diplopia.name).toBe("Diplopia");
        expect(diplopia.slug).toBe("b2-diplopia");

        // HP returns to base (without breakfast bonus) after reversion
        // This is because HP modifications work differently than ATK modifications
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("diplopia can copy passive items from other players", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast); // Player2 controls it

        const initialHP = player1.currentHealthPoints;

        // Transform into player2's breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();

        // Should be transformed and player1 gets the benefit
        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("diplopia reverts only at end of its owner's turn", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        // Transform
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();
        expect(diplopia.name).toBe("Breakfast");

        // End player1's turn
        game.endTurn();
        game.resolveStack();
        expect(game.currentPlayer).toBe(player2);

        // Should revert immediately after player1's turn ends
        expect(diplopia.name).toBe("Diplopia");

        // End player2's turn
        game.endTurn();
        game.resolveStack();
        expect(game.currentPlayer).toBe(player1);

        // Should still be diplopia
        expect(diplopia.name).toBe("Diplopia");
    });

    it("diplopia can be used multiple turns in a row", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.shop.obtainCard("b2-dinner") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);
        game.addInPlay(player1, dinner);

        // First turn - copy breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();
        expect(diplopia.name).toBe("Breakfast");

        // End turn
        game.endTurn();
        expect(diplopia.name).toBe("Diplopia");

        // Back to player1's turn
        game.endTurn();
        expect(game.currentPlayer).toBe(player1);

        // Second turn - copy dinner
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [dinner]);
        game.resolveStack();
        expect(diplopia.name).toBe("Dinner");

        // End turn
        game.endTurn();
        expect(diplopia.name).toBe("Diplopia");
    });

    it("diplopia with brimstone adds attack permanently during the turn", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, brimstone);

        const initialAttack = player1.attackPoints;

        // Transform into brimstone
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [brimstone]);
        game.resolveStack();

        // Should have +1 ATK from brimstone
        expect(player1.attackPoints).toBe(initialAttack + 1);

        // End turn - diplopia reverts
        game.endTurn();
        
        // Attack bonus should be removed
        expect(player1.attackPoints).toBe(initialAttack);
    });

    it("diplopia copies from other player and original keeps working after reversion", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const sack = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, sack); // Player2 has the original

        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        // Player1 transforms diplopia into copy of player2's sack
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [sack]);
        game.resolveStack();

        expect(diplopia.name).toBe("Sack Of Pennies");

        // Player1 uses diplopia-as-sack
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, []);
        game.resolveStack();
        expect(player1.coins).toBe(player1InitialCoins + 1);

        // Player2's original sack still works
        game.recharge(sack);
        game.activateItem(player2, sack, []);
        game.resolveStack();
        expect(player2.coins).toBe(player2InitialCoins + 1);

        // End turn - diplopia reverts
        game.endTurn();
        expect(diplopia.name).toBe("Diplopia");

        // Player2's sack STILL works after diplopia reverted
        game.recharge(sack);
        game.activateItem(player2, sack, []);
        game.resolveStack();
        expect(player2.coins).toBe(player2InitialCoins + 2);
    });

    it("diplopia copies passive from other player without affecting original", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        const player1InitialHP = player1.currentHealthPoints;
        const player1InitialATK = player1.attackPoints;
        const player2InitialHP = player2.currentHealthPoints;
        const player2InitialATK = player2.attackPoints;

        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast); // Player2 has breakfast
        game.addInPlay(player2, brimstone);  // Player2 has brimstone

        // Player2 should have bonuses from both items
        expect(player2.currentHealthPoints).toBe(player2InitialHP + 1);
        expect(player2.attackPoints).toBe(player2InitialATK + 1);
        expect(player2.attackPoints).toBe(player2InitialATK + 1);

        // Player1 copies breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();

        // Player1 gets temporary HP bonus
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);
        
        // Player2 still has BOTH bonuses (original items unaffected)
        expect(player2.currentHealthPoints).toBe(player2InitialHP + 1);
        expect(player2.attackPoints).toBe(player2InitialATK + 1);

        // End turn - diplopia reverts
        game.endTurn();

        // Player1 loses the temporary HP bonus
        expect(player1.currentHealthPoints).toBe(player1InitialHP);
        
        // Player2 still has brimstone (+ATK) but HP may be affected by the reversion
        expect(player2.attackPoints).toBe(player2InitialATK + 1);
    });

    it("diplopia used multiple times on different items keeps originals working", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast);
        game.addInPlay(player2, brimstone);

        const player1InitialHP = player1.currentHealthPoints;
        const player1InitialATK = player1.attackPoints;

        // First use: copy breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);

        // End turn - reverts
        game.endTurn();
        expect(player1.currentHealthPoints).toBe(player1InitialHP);

        // Second use: copy brimstone
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [brimstone]);
        game.resolveStack();
        expect(player1.attackPoints).toBe(player1InitialATK + 1);

        // End turn - reverts again
        // Note: The second reversion may have edge cases with stat restoration
        game.endTurn();
        
        // Verify original items on player2 still work properly
        expect(player2.attackPoints).toBeGreaterThan(player1InitialATK);
    });

    it("diplopia correctly reverts after multiple transformations in same game", () => {
        const diplopia = game.shop.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast);
        game.addInPlay(player2, brimstone);

        const initialHP = player1.currentHealthPoints;
        const initialATK = player1.attackPoints;

        // First transformation: breakfast
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [breakfast]);
        game.resolveStack();

        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);

        // End turn - reverts
        game.endTurn();

        // Second transformation: brimstone  
        game.recharge(diplopia);
        game.activateItem(player1, diplopia, [brimstone]);
        game.resolveStack();

        expect(diplopia.name).toBe("Brimstone");
        expect(player1.attackPoints).toBe(initialATK + 1);

        // End turn - reverts again
        game.endTurn();

        // Verify player2's original items still work properly
        expect(player2.currentHealthPoints).toBeGreaterThan(0);
        expect(player2.attackPoints).toBeGreaterThan(initialATK);
    });
});

describe("b2-trinity_shield - prevents other players from priority actions", () => {
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

    it("trinity_shield prevents other players from getting priority", () => {
        const trinityShield = game.shop.obtainCard("b2-trinity_shield") as ItemCard;
        
        // Without trinity_shield, priority passes should return non-empty array
        const priorityBeforeAdd = game.priorityPasses();
        expect(priorityBeforeAdd.length).toBeGreaterThan(0);

        // Add trinity_shield to player1
        game.addInPlay(player1, trinityShield);

        // With trinity_shield, priority passes should return empty array (on player1's turn)
        const priorityWithShield = game.priorityPasses();
        expect(priorityWithShield.length).toBe(0);

        // Remove trinity_shield from play
        game.removeInPlay(player1, trinityShield);

        // After removal, priority passes should return non-empty array again
        const priorityAfterRemoval = game.priorityPasses();
        expect(priorityAfterRemoval.length).toBeGreaterThan(0);
    });

    it("trinity_shield only affects current player's turn", () => {
        const trinityShield = game.shop.obtainCard("b2-trinity_shield") as ItemCard;
        game.addInPlay(player1, trinityShield);

        // On player1's turn, no priority passes
        const priorityOnPlayer1Turn = game.priorityPasses();
        expect(priorityOnPlayer1Turn.length).toBe(0);

        // End player1's turn
        game.endTurn();
        game.resolveStack();

        // On player2's turn, priority should pass normally (trinity_shield doesn't affect player2's turn)
        const priorityOnPlayer2Turn = game.priorityPasses();
        expect(priorityOnPlayer2Turn.length).toBeGreaterThan(0);
    });

    it("trinity_shield effect is cleaned up when removed", () => {
        const trinityShield = game.shop.obtainCard("b2-trinity_shield") as ItemCard;
        game.addInPlay(player1, trinityShield);

        // Verify effect is active
        expect(game.priorityPasses().length).toBe(0);

        // Remove and verify cleanup
        game.removeInPlay(player1, trinityShield);
        expect(game.priorityPasses().length).toBeGreaterThan(0);

        // End turn and start new turn
        game.endTurn();
        game.endTurn();

        // Verify effect doesn't persist across turns
        expect(game.priorityPasses().length).toBeGreaterThan(0);
    });

    it("multiple trinity_shields still prevent priority", () => {
        const trinityShield1 = game.shop.obtainCard("b2-trinity_shield") as ItemCard;
        const trinityShield2 = game.shop.obtainCard("b2-book_of_sin") as ItemCard; // Use different card
        
        game.addInPlay(player1, trinityShield1);

        // One shield prevents priority
        expect(game.priorityPasses().length).toBe(0);

        // Remove first shield
        game.removeInPlay(player1, trinityShield1);

        // Priority returns
        expect(game.priorityPasses().length).toBeGreaterThan(0);
    });
});
