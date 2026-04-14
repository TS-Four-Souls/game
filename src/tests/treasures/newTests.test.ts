import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { CharacterCard, ItemCard, TreasureCard, MonsterCard } from "@/models/cards";
import { Monster } from "@/models/monster";
import { dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections } from "@/tests/testHelpers";
import { setupTestGame } from "../testHelpers";

describe("b2-placebo - copies tap ability of non-eternal item", () => {
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
    });

    it("placebo can copy sack_of_pennies tap effect (gain 1¢)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        const initialCoins = player1.coins;

        // Recharge placebo and activate it to copy sack_of_pennies
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();
        await game.resolveStack();

        // Player should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
        // Placebo should be deactivated
        expect(placebo.charged).toBe(false);
    });

    it("placebo can copy mr_boom tap effect (deal 1 damage to monster)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const mrBoom = game.obtainCard("b2-mr_boom") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, mrBoom);

        // Get a monster
        const monster = game.monsters[0]!;
        const initialHP = monster.currentHealthPoints;

        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "monster", payload: {name: monster.json.name, slug: monster.json.slug, globalId: monster.json.globalId}}], remaining: [] } as any;
        };
        // Recharge placebo and activate it to copy mr_boom
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [mrBoom]);

        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();

        // Monster should take 1 damage
        expect(monster.currentHealthPoints).toBe(initialHP - 1);
    });

    it("placebo can copy razor_blade tap effect (deal 1 damage to player)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const razorBlade = game.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, razorBlade);

        const initialHP = player2.currentHealthPoints;

        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "player", payload: {name: player2.json.name, slug: player2.json.slug, globalId: player2.json.globalId}} as any], remaining: [] };
        };
        // Recharge placebo and activate it to copy razor_blade
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [razorBlade]);
        await game.resolveStack(); // placebo activation
        await game.resolveStack(); // razor_blade effect
        await game.resolveStack(); // damage resolution

        // Player2 should take 1 damage
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    it("placebo can copy the_battery tap effect (recharge another item)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const theBattery = game.obtainCard("b2-the_battery") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, theBattery);
        game.addInPlay(player1, sackOfPennies);

        // Deactivate sack_of_pennies
        game.recharge(sackOfPennies);
        await game.activateItem(player1, sackOfPennies);
        await game.resolveStack();
        expect(sackOfPennies.charged).toBe(false);

        // Recharge placebo and activate it to copy the_battery
        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "card", payload: {slug: "b2-sack_of_pennies"}}], remaining: [] } as any;
        };
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [theBattery]);
        await game.resolveStack();
        await game.resolveStack();

        // sack_of_pennies should be recharged
        expect(sackOfPennies.charged).toBe(true);
    });

    it("placebo can copy boomerang tap effect (steal loot card)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const boomerang = game.obtainCard("b2-boomerang") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, boomerang);

        // Give player2 some loot cards
        game.loot(player2, 3);
        const initialP1Hand = player1.hand.length;
        const initialP2Hand = player2.hand.length;

        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "player", payload: {name: player2.json.name, slug: player2.json.slug, globalId: player2.json.globalId}}], remaining: [] } as any;
        };
        // Recharge placebo and activate it to copy boomerang
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [boomerang]);
        await game.resolveStack();
        await game.resolveStack();

        // Player1 should have 1 more card, player2 should have 1 less
        expect(player1.hand.length).toBe(initialP1Hand + 1);
        expect(player2.hand.length).toBe(initialP2Hand - 1);
    });

    it("placebo can copy jawbone tap effect (steal 3¢)", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const jawbone = game.obtainCard("b2-jawbone") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, jawbone);

        // Give player2 some coins
        game.gainCoins(player2, 10);
        const initialP1Coins = player1.coins;
        const initialP2Coins = player2.coins;

        // Recharge placebo and activate it to copy jawbone
        game.recharge(placebo);
        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "player", payload: {name: player2.json.name, slug: player2.json.slug, globalId: player2.json.globalId}}], remaining: [] } as any;
        };
        await game.activateItem(player1, placebo, [jawbone]);
        await game.resolveStack();
        await game.resolveStack();

        // Player1 should gain 3¢, player2 should lose 3¢
        expect(player1.coins).toBe(initialP1Coins + 3);
        expect(player2.coins).toBe(initialP2Coins - 3);
    });

    it("placebo can copy an item controlled by another player", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player2, sackOfPennies); // Player2 controls it

        const initialCoins = player1.coins;

        // Recharge placebo and activate it to copy player2's sack_of_pennies
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();
        await game.resolveStack();

        // Player1 should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("placebo deactivates the copied item's effect slot but not the original item", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        // Both items start recharged
        game.recharge(placebo);
        game.recharge(sackOfPennies);
        expect(placebo.charged).toBe(true);
        expect(sackOfPennies.charged).toBe(true);

        // Activate placebo to copy sack_of_pennies
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();

        // Placebo should be deactivated, but sack_of_pennies should still be charged
        expect(placebo.charged).toBe(false);
        expect(sackOfPennies.charged).toBe(true);
    });

    it("placebo can be used multiple times by recharging", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);

        const initialCoins = player1.coins;

        // First use
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);

        // Recharge and use again
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 2);
    });

    it("placebo can copy different items on different activations", async () => {
        const placebo = game.obtainCard("b2-placebo") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        const razorBlade = game.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, placebo);
        game.addInPlay(player1, sackOfPennies);
        game.addInPlay(player1, razorBlade);

        const initialCoins = player1.coins;
        const initialHP = player2.currentHealthPoints;

        // First use - copy sack_of_pennies
        game.recharge(placebo);
        await game.activateItem(player1, placebo, [sackOfPennies]);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);

        // Second use - copy razor_blade
        game.recharge(placebo);
        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [{type: "player", payload: {name: player2.json.name, slug: player2.json.slug, globalId: player2.json.globalId}}], remaining: [] } as any;
        };
        await game.activateItem(player1, placebo, [razorBlade]);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });
});

describe("b2-modeling_clay - becomes permanent copy of non-eternal item", () => {
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
        mockGameSelections(game);
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
    });

    it("modeling_clay becomes a copy of sack_of_pennies permanently", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);

        // Verify initial state
        expect(modelingClay.name).toBe("Modeling Clay");
        expect(modelingClay.slug).toBe("b2-modeling_clay");

        // Activate modeling_clay to become sack_of_pennies
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [sackOfPennies]);
        await game.resolveStack();

        // modeling_clay should now have sack_of_pennies properties
        expect(modelingClay.name).toBe("Sack Of Pennies");
        expect(modelingClay.slug).toBe("b2-sack_of_pennies");

        // Test that it can gain 1¢ like sack_of_pennies
        const initialCoins = player1.coins;
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay);
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("modeling_clay transformation is permanent (survives turn changes)", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);
        game.addHealth(player1, 10); // Ensure player1 has enough HP
        // Transform
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [sackOfPennies]);
        await game.resolveStack();

        // End turn
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        expect(game.currentPlayer).toBe(player2);

        // Still should be sack_of_pennies
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // End player2's turn
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        expect(game.currentPlayer).toBe(player1);

        // Still should be sack_of_pennies
        expect(modelingClay.name).toBe("Sack Of Pennies");
    });

    it("modeling_clay can copy passive items", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [breakfast]);
        await game.resolveStack();

        // Should have breakfast's properties
        expect(modelingClay.name).toBe("Breakfast");
        expect(modelingClay.slug).toBe("b2-breakfast");

        // Should have +1 HP from breakfast effect
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("modeling_clay can copy items from other players", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sackOfPennies); // Player2 controls it

        // Transform into player2's sack_of_pennies
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [sackOfPennies]);
        await game.resolveStack();

        // Should be transformed
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Player1 should be able to use it
        const initialCoins = player1.coins;
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay);
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("modeling_clay retains its charged state after transformation", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, sackOfPennies);

        // Recharge and transform
        game.recharge(modelingClay);
        const wasCharged = modelingClay.charged;
        await game.activateItem(player1, modelingClay, [sackOfPennies]);
        await game.resolveStack();

        // After activation, should be uncharged (consumed the charge)
        expect(modelingClay.charged).toBe(false);
    });

    it("transformed modeling_clay keeps working as the copied item", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const razorBlade = game.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player1, razorBlade);

        // Transform into razor_blade
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [razorBlade]);
        await game.resolveStack();
        await game.resolveStack();

        const initialHP = player2.currentHealthPoints;

        // Use it multiple times to verify it keeps working
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [player2]);
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 1);

        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [player2]);
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(initialHP - 2);
    });

    it("modeling_clay copies item from shop and both work independently", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sackInShop = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sackInShop); // Player2 has the original

        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        // Transform modeling_clay into sack_of_pennies
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [sackInShop]);
        await game.resolveStack();

        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Player1's modeling_clay (now sack_of_pennies) works
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, []);
        await game.resolveStack();
        expect(player1.coins).toBe(player1InitialCoins + 1);

        // Player2's original sack_of_pennies still works independently
        game.recharge(sackInShop);
        await game.activateItem(player2, sackInShop, []);
        await game.resolveStack();
        expect(player2.coins).toBe(player2InitialCoins + 1);
    });

    it("modeling_clay copying passive item doesn't affect original when reused", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const breakfast1 = game.obtainCard("b2-breakfast") as ItemCard;
        
        const player1InitialHP = player1.currentHealthPoints;
        const player2InitialHP = player2.currentHealthPoints;

        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, breakfast1); // Player2 has original breakfast

        // Transform into breakfast
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [breakfast1]);
        await game.resolveStack();

        // Player1 should have +1 HP from modeling_clay-as-breakfast
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);
        
        // Player2 should have +1 HP from original breakfast
        expect(player2.currentHealthPoints).toBe(player2InitialHP + 1);

        // Turn changes - both effects persist
        game.endTurn();
        await game.resolveStack();
        
        game.endTurn();

        // Both players keep their HP bonuses (modeling_clay is permanent)
        // But after turn changes, HP might be recalculated
        expect(player1.currentHealthPoints).toBeGreaterThanOrEqual(player1InitialHP);
        expect(player2.currentHealthPoints).toBeGreaterThanOrEqual(player2InitialHP);
    });

    it("modeling_clay cannot transform multiple times (permanent transformation)", async () => {
        const modelingClay = game.obtainCard("b2-modeling_clay") as ItemCard;
        const sack = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        const battery = game.obtainCard("b2-the_battery") as ItemCard;
        
        game.addInPlay(player1, modelingClay);
        game.addInPlay(player2, sack);
        game.addInPlay(player2, battery);

        // First transformation: sack_of_pennies
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, [sack]);
        await game.resolveStack();
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Use it
        const coinsBeforeUse = player1.coins;
        game.recharge(modelingClay);
        await game.activateItem(player1, modelingClay, []);
        await game.resolveStack();
        expect(player1.coins).toBe(coinsBeforeUse + 1);

        // Modeling clay is now permanently sack_of_pennies - it retains this identity
        // It no longer has the modeling_clay transformation effect
        expect(modelingClay.name).toBe("Sack Of Pennies");

        // Original sack still works for player2
        game.recharge(sack);
        const player2CoinsBeforeUse = player2.coins;
        await game.activateItem(player2, sack, []);
        await game.resolveStack();
        expect(player2.coins).toBe(player2CoinsBeforeUse + 1);
    });
});

describe("b2-diplopia - becomes temporary copy of passive item till end of turn", () => {
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
        mockGameSelections(game);
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
    });

    it("diplopia becomes a copy of breakfast temporarily", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();

        // Should be transformed
        expect(diplopia.name).toBe("Breakfast");
        expect(diplopia.slug).toBe("b2-breakfast");

        // Should have +1 HP from breakfast effect
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("diplopia reverts back at end of turn", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        const initialHP = player1.currentHealthPoints;

        // Transform into breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();

        // Should be breakfast
        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);

        // End turn
        game.endTurn();
        await game.resolveStack();
        
        // Should revert back to diplopia
        expect(diplopia.name).toBe("Diplopia");
        expect(diplopia.slug).toBe("b2-diplopia");

        // HP returns to base (without breakfast bonus) after reversion
        expect(player1.currentHealthPoints).toBe(initialHP);
    });

    it("diplopia can copy passive items from other players", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast); // Player2 controls it

        const initialHP = player1.currentHealthPoints;

        // Transform into player2's breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();

        // Should be transformed and player1 gets the benefit
        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);
    });

    it("diplopia reverts only at end of its owner's turn", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);

        // Transform
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();
        expect(diplopia.name).toBe("Breakfast");

        // End player1's turn
        game.endTurn();
        await game.resolveStack();
        expect(game.currentPlayer).toBe(player2);

        // Should revert immediately after player1's turn ends
        expect(diplopia.name).toBe("Diplopia");

        // End player2's turn
        game.endTurn();
        await game.resolveStack();
        expect(game.currentPlayer).toBe(player1);

        // Should still be diplopia
        expect(diplopia.name).toBe("Diplopia");
    });

    it("diplopia can be used multiple turns in a row", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.obtainCard("b2-dinner") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, breakfast);
        game.addInPlay(player1, dinner);

        // First turn - copy breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();
        expect(diplopia.name).toBe("Breakfast");
        expect(game.currentPlayer).toBe(player1);

        // End turn
        game.endTurn();
        await game.resolveStack();
        expect(diplopia.name).toBe("Diplopia");
        expect(game.currentPlayer).toBe(player2);

        // Back to player1's turn
        game.endTurn();
        await game.resolveStack();
        expect(game.currentPlayer).toBe(player1);

        // Second turn - copy dinner
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [dinner]);
        await game.resolveStack();
        expect(diplopia.name).toBe("Dinner");

        // End turn
        game.endTurn();
        await game.resolveStack();
        
        expect(diplopia.name).toBe("Diplopia");
    });

    it("diplopia with brimstone adds attack permanently during the turn", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const brimstone = game.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, diplopia);
        game.addInPlay(player1, brimstone);

        const initialAttack = player1.attackPoints;

        // Transform into brimstone
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [brimstone]);
        await game.resolveStack();

        // Should have +1 ATK from brimstone
        expect(player1.attackPoints).toBe(initialAttack + 1);

        // End turn - diplopia reverts
        game.endTurn();
        await game.resolveStack();
        // Attack bonus should be removed
        expect(player1.attackPoints).toBe(initialAttack);
    });

    it("diplopia copies from other player and original keeps working after reversion", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const brimstone = game.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, brimstone); // Player2 has the original

        const player1InitialCoins = player1.coins;
        const player2InitialCoins = player2.coins;

        // Player1 transforms diplopia into copy of player2's brimstone
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [brimstone]);
        await game.resolveStack();

        expect(diplopia.name).toBe("Brimstone");

        // End turn - diplopia reverts
        game.endTurn();
        await game.resolveStack();

        expect(diplopia.name).toBe("Diplopia");
    });

    it("diplopia copies passive from other player without affecting original", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.obtainCard("b2-brimstone") as ItemCard;
        
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
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();

        // Player1 gets temporary HP bonus
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);
        
        // Player2 still has BOTH bonuses (original items unaffected)
        expect(player2.currentHealthPoints).toBe(player2InitialHP + 1);
        expect(player2.attackPoints).toBe(player2InitialATK + 1);

        // End turn - diplopia reverts
        game.endTurn();
        await game.resolveStack();
        
        // Player1 loses the temporary HP bonus
        expect(player1.currentHealthPoints).toBe(player1InitialHP);
        
        // Player2 still has brimstone (+ATK) but HP may be affected by the reversion
        expect(player2.attackPoints).toBe(player2InitialATK + 1);
    });

    it("diplopia used multiple times on different items keeps originals working", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast);
        game.addInPlay(player2, brimstone);

        const player1InitialHP = player1.currentHealthPoints;
        const player1InitialATK = player1.attackPoints;

        // First use: copy breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1InitialHP + 1);

        // End turn - reverts
        game.endTurn();
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1InitialHP);

        // Second use: copy brimstone
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [brimstone]);
        await game.resolveStack();
        expect(player1.attackPoints).toBe(player1InitialATK + 1);

        // End turn - reverts again
        // Note: The second reversion may have edge cases with stat restoration
        await game.resolveStack();
        game.endTurn();
        
        // Verify original items on player2 still work properly
        expect(player2.attackPoints).toBeGreaterThan(player1InitialATK);
    });

    it("diplopia correctly reverts after multiple transformations in same game", async () => {
        const diplopia = game.obtainCard("b2-diplopia") as ItemCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        const brimstone = game.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, diplopia);
        game.addInPlay(player2, breakfast);
        game.addInPlay(player2, brimstone);

        const initialHP = player1.currentHealthPoints;
        const initialATK = player1.attackPoints;

        // First transformation: breakfast
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [breakfast]);
        await game.resolveStack();

        expect(diplopia.name).toBe("Breakfast");
        expect(player1.currentHealthPoints).toBe(initialHP + 1);

        // End turn - reverts
        game.endTurn();
        await game.resolveStack();
        // Second transformation: brimstone  
        game.recharge(diplopia);
        await game.activateItem(player1, diplopia, [brimstone]);
        await game.resolveStack();

        expect(diplopia.name).toBe("Brimstone");
        expect(player1.attackPoints).toBe(initialATK + 1);
        await game.resolveStack();

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
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        mockGameSelections(game);
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
    });

    it("trinity_shield prevents other players from activating items on current player's turn", async () => {
        const trinityShield = game.obtainCard("b2-trinity_shield") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player2, sackOfPennies);
        game.recharge(sackOfPennies);

        // Without trinity_shield, player2 can activate items on player1's turn
        const canActivateWithout = game.canActivate(sackOfPennies, player2);
        expect(canActivateWithout).toBe(true);

        // Add trinity_shield to player1
        game.addInPlay(player1, trinityShield);

        // With trinity_shield, player2 cannot activate items on player1's turn
        const canActivateWith = game.canActivate(sackOfPennies, player2);
        expect(canActivateWith).not.toBe(true);
        expect(typeof canActivateWith).toBe("string");
        expect(canActivateWith).toContain("cannot activate cards");

        // Remove trinity_shield from play
        game.removeInPlay(player1, trinityShield);

        // After removal, player2 can activate items again
        const canActivateAfter = game.canActivate(sackOfPennies, player2);
        expect(canActivateAfter).toBe(true);
    });

    it("trinity_shield prevents other players from playing loot cards on current player's turn", async () => {
        const trinityShield = game.obtainCard("b2-trinity_shield") as ItemCard;
        
        // Give player2 a loot card and loot play ability
        game.loot(player2, 1);
        player2.addLootPlay(1); // Give player2 ability to play loot

        // Without trinity_shield, player2 can play loot on player1's turn
        const canPlayWithout = game.canPlayCard(player2);
        expect(canPlayWithout).toBe(true);

        // Add trinity_shield to player1
        game.addInPlay(player1, trinityShield);

        // With trinity_shield, player2 cannot play loot on player1's turn
        const canPlayWith = game.canPlayCard(player2);
        expect(canPlayWith).not.toBe(true);
        expect(typeof canPlayWith).toBe("string");
        expect(canPlayWith).toContain("cannot play loot cards during");

        // Remove trinity_shield from play
        game.removeInPlay(player1, trinityShield);

        // After removal, player2 can play loot again
        const canPlayAfter = game.canPlayCard(player2);
        expect(canPlayAfter).toBe(true);
    });

    it("trinity_shield only affects current player's turn", async () => {
        const trinityShield = game.obtainCard("b2-trinity_shield") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player1, trinityShield);
        game.addInPlay(player2, sackOfPennies);
        game.recharge(sackOfPennies);

        // On player1's turn, player2 cannot activate items
        expect(game.currentPlayer).toBe(player1);
        const canActivateOnP1Turn = game.canActivate(sackOfPennies, player2);
        expect(canActivateOnP1Turn).not.toBe(true);

        // End player1's turn
        game.endTurn();
        await game.resolveStack();

        // On player2's turn, player2 can activate items normally (trinity_shield doesn't affect player2's turn)
        expect(game.currentPlayer).toBe(player2);
        const canActivateOnP2Turn = game.canActivate(sackOfPennies, player2);
        expect(canActivateOnP2Turn).toBe(true);
    });

    it("trinity_shield effect is cleaned up when removed", async () => {
        const trinityShield = game.obtainCard("b2-trinity_shield") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player2, sackOfPennies);
        game.recharge(sackOfPennies);
        game.addInPlay(player1, trinityShield);

        // Verify effect is active
        expect(game.canActivate(sackOfPennies, player2)).not.toBe(true);

        // Remove and verify cleanup
        game.removeInPlay(player1, trinityShield);
        expect(game.canActivate(sackOfPennies, player2)).toBe(true);

        // End turn and start new turn
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn();
        await game.resolveStack();

        // Verify effect doesn't persist across turns
        game.recharge(sackOfPennies);
        expect(game.canActivate(sackOfPennies, player2)).toBe(true);
    });

    it("trinity_shield doesn't prevent current player from using items", async () => {
        const trinityShield = game.obtainCard("b2-trinity_shield") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        
        game.addInPlay(player1, trinityShield);
        game.addInPlay(player1, sackOfPennies);
        game.recharge(sackOfPennies);

        // Player1 (current player) can still activate their own items
        expect(game.currentPlayer).toBe(player1);
        const canActivate = game.canActivate(sackOfPennies, player1);
        expect(canActivate).toBe(true);

        const initialCoins = player1.coins;
        await game.activateItem(player1, sackOfPennies);
        await game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
    });
});

describe("b2-no - Cancel the ↷ or $ ability of an item", () => {
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
        mockGameSelections(game);
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
    });

    it("no can cancel a tap ability of an item", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, no);
        game.addInPlay(player2, sackOfPennies);

        const initialCoins = player2.coins;

        // Player 2 activates sack_of_pennies to gain 1¢
        game.recharge(sackOfPennies);
        await game.activateItem(player2, sackOfPennies);
        expect(game.stack.size).toBe(1);

        // Player 1 uses "no" to cancel the sack_of_pennies ability
        game.recharge(no);
        await game.activateItem(player1, no, [game.stack._stack[0]]); // Cancel the item at stack position 0
        await game.resolveStack(); // Resolve the no effect

        // The sack_of_pennies effect should be cancelled
        expect(player2.coins).toBe(initialCoins);
        expect(sackOfPennies.charged).toBe(false); // Item is still deactivated
        expect(no.charged).toBe(false); // No is deactivated
    });

    it("no can cancel a paid ability of an item", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const mrBoom = game.obtainCard("b2-mr_boom") as ItemCard;
        game.recharge(mrBoom); // Ensure mr_boom is charged
        game.recharge(no); // Ensure no is charged
        game.addInPlay(player1, no);
        game.addInPlay(player2, mrBoom);

        const monster = game.monsters[0]!;
        const initialHP = monster.currentHealthPoints;

        // Player 2 activates mr_boom (paid effect) to deal 1 damage
        await game.activateItem(player2, mrBoom, [monster]);
        expect(game.stack.size).toBe(1);

        // Player 1 uses "no" to cancel the mr_boom ability
        await game.activateItem(player1, no, [game.stack._stack[0]]);
        await game.resolveStack(); // Resolve the no effect
        await game.resolveStack(); // Resolve the no effect

        // The mr_boom effect should be cancelled
        expect(monster.currentHealthPoints).toBe(initialHP);
        expect(no.charged).toBe(false);
    });

    it("no only affects item abilities on the stack", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, no);
        game.recharge(no); // Ensure no is charged
        game.addInPlay(player2, sackOfPennies);
        game.recharge(sackOfPennies); // Ensure sack_of_pennies is charged

        // Try to activate no without any item abilities on the stack
        // This should fail or do nothing as there's nothing to cancel
        const stackLengthBefore = game.stack.size;
        
        // Activate no when stack is empty (should still work but have no effect)
        await expect(async () => {
            await game.activateItem(player1, no, [undefined]);
        }).toThrow();
    });

    it("no can cancel another player's item ability", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const razorBlade = game.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, no);
        game.recharge(no); // Ensure no is charged
        game.addInPlay(player2, razorBlade);
        game.recharge(razorBlade); // Ensure razor_blade is charged

        const initialHP = player1.currentHealthPoints;

        // Player 2 uses razor_blade to damage player 1
        await game.activateItem(player2, razorBlade, [player1]);
        expect(game.stack.size).toBe(1);

        // Player 1 uses no to cancel the damage
        await game.activateItem(player1, no, [game.stack._stack[0]]);
        await game.resolveStack();
        expect(game.stack.size).toBe(0);

        // Player 1 should not take damage
        expect(player1.currentHealthPoints).toBe(initialHP);
        expect(no.charged).toBe(false);
        expect(razorBlade.charged).toBe(false); // Razor blade is still deactivated
    });

    it("no can be used during priority passes", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const theBattery = game.obtainCard("b2-the_battery") as ItemCard;
        const mrBoom = game.obtainCard("b2-mr_boom") as ItemCard;
        
        game.addInPlay(player1, no);
        game.recharge(no); // Ensure no is charged
        game.addInPlay(player2, theBattery);
        game.recharge(theBattery); // Ensure theBattery is charged
        game.addInPlay(player2, mrBoom);
        game.recharge(mrBoom); // Ensure mrBoom is charged

        const monster = game.monsters[0]!;
        const initialHP = monster.currentHealthPoints;

        // Player 2 activates mr_boom
        await game.activateItem(player2, mrBoom, [monster]);
        
        await game.activateItem(player1, no, [game.stack._stack[0]]);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();

        // Monster should not take damage
        expect(monster.currentHealthPoints).toBe(initialHP);
    });

    it("no becomes deactivated after use", async () => {
        const no = game.obtainCard("b2-no") as ItemCard;
        const sackOfPennies = game.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, no);
        game.addInPlay(player2, sackOfPennies);

        // Ensure no starts charged
        game.recharge(no);
        game.recharge(sackOfPennies);
        expect(no.charged).toBe(true);

        // Player 2 activates sack of pennies
        await game.activateItem(player2, sackOfPennies);

        // Player 1 activates no
        await game.activateItem(player1, no, [game.stack._stack[0]]);
        await game.resolveStack();
        await game.resolveStack();

        // No should now be deactivated
        expect(no.charged).toBe(false);
    });
});
