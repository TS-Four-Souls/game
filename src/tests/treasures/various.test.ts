import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { pl } from "zod/locales";
import type { LootCard, TreasureCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard, ItemCard } from "@/models/cards";
import { setupSamsonIsaacGame } from "../testHelpers";

describe("Treasure - \"at the end of your turn\" effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupSamsonIsaacGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("edens_blessing - gain 6¢ at end of turn if you have 0¢", async () => {
    });
});

describe("Treasure - Passive effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupSamsonIsaacGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    // b2-moms_coin_purse    "Loot +1 during your loot step."
    // b2-moms_purse    "Loot +1 during your loot step."

    it("moms_coin_purse - loot +1 during loot step", async () => {
        const momsCoinPurse = game.shop.obtainCard("b2-moms_coin_purse") as TreasureCard;
        game.addInPlay(player1, momsCoinPurse);

        const initialHandSize = player1.hand.length;

        // End turn to trigger start of next player's turn
        game.endTurn(); // p1 ends
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn(); // p2 ends, p1's turn starts - loot step happens
        await game.resolveStack(); // Resolve any stack effects

        // Player should loot 2 cards instead of 1 (1 base + 1 from item)
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("moms_purse - loot +1 during loot step", async () => {
        const momsPurse = game.shop.obtainCard("b2-moms_purse") as TreasureCard;
        game.addInPlay(player1, momsPurse);

        const initialHandSize = player1.hand.length;

        game.endTurn(); // p1 ends
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn(); // p2 ends, p1's turn starts - loot step happens
        await game.resolveStack(); // Resolve any stack effects

        // Player should loot 2 cards instead of 1
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("moms_coin_purse + moms_purse - stack to loot +2", async () => {
        const momsCoinPurse = game.shop.obtainCard("b2-moms_coin_purse") as TreasureCard;
        const momsPurse = game.shop.obtainCard("b2-moms_purse") as TreasureCard;
        game.addInPlay(player1, momsCoinPurse);
        game.addInPlay(player1, momsPurse);

        const initialHandSize = player1.hand.length;

        game.endTurn(); // p1 ends
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn(); // p2 ends, p1's turn starts - loot step happens
        await game.resolveStack(); // Resolve any stack effects

        // Player should loot 3 cards total (1 base + 1 + 1 from both items)
        expect(player1.hand.length).toBe(initialHandSize + 3);
    });

    // b2-dry_baby    "Damage you would take is reduced to 1."

    it("dry_baby - reduce damage to 1", async () => {
        const dryBaby = game.shop.obtainCard("b2-dry_baby") as TreasureCard;
        game.addInPlay(player1, dryBaby);

        const initialHP = player1.currentHealthPoints;

        // Take 5 damage, should only lose 1 HP due to dry_baby effect
        game.dealDamage(player2, player1, dryBaby, 5);
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("dry_baby - 1 damage stays as 1", async () => {
        const dryBaby = game.shop.obtainCard("b2-dry_baby") as TreasureCard;
        game.addInPlay(player1, dryBaby);

        const initialHP = player1.currentHealthPoints;

        // Take 1 damage, should still lose 1 HP
        game.dealDamage(player2, player1, dryBaby, 1);
        await game.resolveStack();
        await game.resolveStack();

        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("dry_baby - multiple damage instances each reduced to 1", async () => {
        const dryBaby = game.shop.obtainCard("b2-dry_baby") as TreasureCard;
        game.addInPlay(player1, dryBaby);

        const initialHP = player1.currentHealthPoints;

        // Take damage multiple times
        game.dealDamage(player2, player1, dryBaby, 3);
        await game.resolveStack();
        await game.resolveStack();
        game.dealDamage(player2, player1, dryBaby, 4);
        await game.resolveStack();
        await game.resolveStack();

        // Each instance reduced to 1, so total 2 damage
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    // b2-moms_shovel    "This enters play deactivated."

    it("moms_shovel - enters play deactivated", async () => {
        const momsShovel = game.shop.obtainCard("b2-moms_shovel") as ItemCard;

        // Add to play
        game.addInPlay(player1, momsShovel);

        // Should be deactivated (charged = false)
        expect(momsShovel.charged).toBe(false);
    });

    // b2-steamy_sale    "Shop items you purchase cost 5¢ less."

    it("steamy_sale - shop items cost 5¢ less", async () => {
        const steamySale = game.shop.obtainCard("b2-steamy_sale") as TreasureCard;
        game.addInPlay(player1, steamySale);

        // Give player enough coins
        player1.gainCoins(20);
        const initialCoins = player1.coins;

        // Get a shop item to purchase
        const shopItem = game.shop._slots[0]!;
        expect(shopItem).toBeDefined();

        // Purchase the item - normal price is 10¢, should be 5¢ with steamy sale
        game.addPurchaseThisTurn(player1, 1); // allow purchase
        game.declarePurchase(player1);
        game.purchase(player1, 0); // index 0 is first shop slot

        // Should have spent 5¢ instead of 10¢
        expect(player1.coins).toBe(initialCoins - 5);

        // Item should be in player's inPlay
        expect(player1.inPlay.map(card => card.slug)).toContain(shopItem.slug);
    });

    it("steamy_sale - purchasing with exact coins", async () => {
        const steamySale = game.shop.obtainCard("b2-steamy_sale") as TreasureCard;
        game.addInPlay(player1, steamySale);

        // Give player exactly 5 coins (reduced price)
        player1.gainCoins(5);

        // Should be able to purchase with reduced price
        game.addPurchaseThisTurn(player1, 1); // allow purchase
        game.declarePurchase(player1);
        const result = game.purchase(player1, 1);

        expect(result).toContain("successful");
        expect(player1.coins).toBe(0);
    });

    // b2-sacred_heart    "When you would roll a 1, you may change the result to a 6."
    // Note: These tests may need adjustment based on actual implementation

    it("sacred_heart - change roll of 1 to 6", async () => {
        const sacredHeart = game.shop.obtainCard("b2-sacred_heart") as TreasureCard;
        game.addInPlay(player1, sacredHeart);

        // Roll a dice and set it to 1
        const dice = game.rollDice(player1, false, sacredHeart);
        dice.value = 1;
        game.emitter.emit("on:dice:would-roll", { eventIssuer: player1, diceRoll: dice });

        // Add to stack and resolve to trigger the effect
        game.addToStack(dice);
        await game.resolveStack();
        await game.resolveStack();

        // The dice should now be 6
        expect(dice.value).toBe(6);
    });

    it("sacred_heart - choose not to change roll of 1", async () => {
        const sacredHeart = game.shop.obtainCard("b2-sacred_heart") as TreasureCard;
        game.addInPlay(player1, sacredHeart);

        // Roll a dice and set it to 1
        const dice = player1.rollDice(Math.random, false, sacredHeart);
        dice.value = 1;

        game.addToStack(dice);
        await game.resolveStack();

        // The dice should still be 1
        expect(dice.value).toBe(1);
    });

    it("sacred_heart - doesn't affect rolls other than 1", async () => {
        const sacredHeart = game.shop.obtainCard("b2-sacred_heart") as TreasureCard;
        game.addInPlay(player1, sacredHeart);

        // Roll a dice and set it to 3
        const dice = player1.rollDice(Math.random, false, sacredHeart);
        dice.value = 3;

        game.addToStack(dice);
        await game.resolveStack();

        // The dice should still be 3
        expect(dice.value).toBe(3);
    });

    // b2-baby_haunt    "When you die, before paying penalties, give this to another player."
    // Note: Transfer mechanism needs verification

    it("baby_haunt - transfers to another player on death", async () => {
        const initEvastion = game.getDC(game.monsters[0]!);
        const babyHaunt = game.shop.obtainCard("b2-baby_haunt") as TreasureCard;
        game.addInPlay(player1, babyHaunt);

        expect(player1.inPlay.map((c) => c.slug)).toContain(babyHaunt.slug);
        expect(player2.inPlay.map((c) => c.slug)).not.toContain(babyHaunt.slug);
        expect(game.getDC(game.monsters[0]!)).toBe(initEvastion + 1);
        // Kill player1
        game.kill(player1, player1, babyHaunt);
        await game.resolveStack();
        await game.resolveStack();
        expect(game.getDC(game.monsters[0]!)).toBe(initEvastion);

        // baby_haunt should now be with player2
        expect(player1.inPlay.map((c) => c.slug)).not.toContain(babyHaunt.slug);
        expect(player2.inPlay.map((c) => c.slug)).toContain(babyHaunt.slug);

        game.endTurn();
        await game.resolveStack();
        expect(game.getDC(game.monsters[0]!)).toBe(initEvastion + 1);
    });

    // b2-daddy_haunt    "When you die, before paying penalties, give this to another player."

    it("daddy_haunt - transfers to another player on death", async () => {
        const daddyHaunt = game.shop.obtainCard("b2-daddy_haunt") as TreasureCard;
        game.addInPlay(player1, daddyHaunt);

        expect(player1.inPlay.map((c) => c.slug)).toContain(daddyHaunt.slug);
        expect(player2.inPlay.map((c) => c.slug)).not.toContain(daddyHaunt.slug);

        // Kill player1
        game.kill(player1, player1, daddyHaunt);
        await game.resolveStack();
        await game.resolveStack();

        // daddy_haunt should now be with player2
        expect(player1.inPlay.map((c) => c.slug)).not.toContain(daddyHaunt.slug);
        expect(player2.inPlay.map((c) => c.slug)).toContain(daddyHaunt.slug);

        // Kill player1
        game.kill(player2, player2, daddyHaunt);
        await game.resolveStack();
        await game.resolveStack();

        // daddy_haunt should now be with player2
        expect(player2.inPlay.map((c) => c.slug)).not.toContain(daddyHaunt.slug);
        expect(player1.inPlay.map((c) => c.slug)).toContain(daddyHaunt.slug);
    });

    // b2-the_chest    "if this would be destroyed, it becomes a soul instead."

    it("the_chest - becomes a soul when destroyed", async () => {
        const theChest = game.shop.obtainCard("b2-the_chest") as TreasureCard;
        game.addInPlay(player1, theChest);

        const initialSouls = player1.totalSouls;

        // Destroy the chest
        game.destroyCardsOrSouls([theChest]);

        // The chest should no longer be in play
        expect(player1.inPlay.map((c) => c.slug)).not.toContain(theChest.slug);

        // The chest should now be a soul
        expect(player1.souls).toContain(theChest);
        expect(player1.totalSouls).toBe(initialSouls + 1);
    });

    // b2-the_habit    "The first time you take damage each turn, you may recharge an item."

    it("the_habit - recharge item on first damage each turn", async () => {
        const theHabit = game.shop.obtainCard("b2-the_habit") as TreasureCard;
        const battery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        game.addInPlay(player1, theHabit);
        game.addInPlay(player1, battery);

        // Discharge the battery
        battery.charged = false;
        expect(battery.charged).toBe(false);

        // Mock game.select to choose the battery to recharge
        game.select = async (_issuer, _n, opts, _optional) => {
            return { selected: [battery], remaining: [] } as any;
        };

        // Take damage
        game.dealDamage(player2, player1, theHabit, 1);
        await game.resolveStack();
        await game.resolveStack();

        // The battery should be recharged
        expect(battery.charged).toBe(true);
    });

    it("the_habit - only triggers once per turn", async () => {
        const theHabit = game.shop.obtainCard("b2-the_habit") as TreasureCard;
        const battery1 = game.shop.obtainCard("b2-the_battery") as ItemCard;
        const battery2 = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, theHabit);
        game.addInPlay(player1, battery1);
        game.addInPlay(player1, battery2);
        game.addHealth(player1, 10); // Ensure player1 has enough HP
        // Discharge both items
        battery1.charged = false;
        battery2.charged = false;

        let selectCount = 0;
        game.select = async (_issuer, _n, opts, _optional) => {
            selectCount++;
            if (selectCount === 1) {
                return { selected: [battery1], remaining: [] } as any;
            }
            return { selected: [battery2], remaining: [] } as any;
        };

        // Take damage twice
        game.dealDamage(player2, player1, theHabit, 1);
        await game.resolveStack();
        await game.resolveStack();

        // Only battery1 should be recharged
        expect(battery1.charged).toBe(true);
        expect(battery2.charged).toBe(false);

        // Take damage again in same turn
        game.dealDamage(player2, player1, theHabit, 1);
        await game.resolveStack();
        await game.resolveStack();

        // battery2 should still be discharged (habit only triggers once per turn)
        expect(battery2.charged).toBe(false);

        // End turn and start new turn
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack(); // Resolve any stack effects

        // Take damage in new turn
        game.dealDamage(player2, player1, theHabit, 1);
        await game.resolveStack();
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack();

        // Now battery2 should be recharged
        expect(battery2.charged).toBe(true);
    });

    // b2-theres_options    "You may purchase an additional time on your turn."
    
    it("theres_options - allows purchasing twice in one turn", async () => {
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.endTurn(); // end p1 turn
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn(); // end p2 turn, p1's turn starts
        await game.resolveStack(); // Resolve any stack effects
        game.addInPlay(player1, theresOptions);
        
        // Give player enough coins for two purchases
        player1.gainCoins(30);
        
        const shopItemsBefore = game.shop._slots.filter(s => s !== undefined).length;
        
        // Purchase first item
        game.declarePurchase(player1);
        const result1 = game.purchase(player1, 1);
        expect(result1).toContain("successful");
        game.removeInPlay(player1, player1.inPlay[player1.inPlay.length - 1]!); // remove purchased item from inPlay to ensure basic second purchase.
        // Without theres_options, second purchase would fail
        // With theres_options, it should succeed
        game.declarePurchase(player1);
        const result2 = game.purchase(player1, 1);
        expect(result2).toContain("successful");
        
        // Player should have purchased 2 items (spent 20¢)
        expect(player1.coins).toBe(10);
    });

    it("theres_options - cannot purchase three times", async () => {
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.endTurn(); // end p1 turn
        await game.resolveStack(); // Resolve any stack effects
        game.endTurn(); // end p2 turn, p1's turn starts
        await game.resolveStack(); // Resolve any stack effects
        game.addInPlay(player1, theresOptions);
        
        // Give player enough coins
        player1.gainCoins(40);
        
        // Purchase first two items should succeed
        game.declarePurchase(player1);
        game.purchase(player1, 1);
        game.removeInPlay(player1, player1.inPlay[player1.inPlay.length - 1]!); // remove purchased item from inPlay to ensure basic second purchase.
        game.declarePurchase(player1);
        game.purchase(player1, 1);
        
        const initInplayCount = player1.inPlay.length;
        // Third purchase should fail (only +1 additional purchase)
        expect(() => game.declarePurchase(player1)).toThrow();
        expect(player1.inPlay.length).toBe(initInplayCount); // no new item added
        
        // Should only have spent 20¢ (2 purchases)
        expect(player1.coins).toBe(20);
    });

    it("theres_options - resets each turn", async () => {
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.addInPlay(player1, theresOptions);
        
        // Give player enough coins
        player1.gainCoins(50);
        
        // Use both purchases this turn
        game.declarePurchase(player1);
        game.purchase(player1, 1);
        game.removeInPlay(player1, player1.inPlay[3]!); // remove purchased item from inPlay to ensure basic second purchase.
        game.declarePurchase(player1);
        game.purchase(player1, 1);
        game.removeInPlay(player1, player1.inPlay[3]!); // remove purchased item from inPlay to ensure basic second purchase.
        
        // Third purchase should fail
        
        expect(() => game.declarePurchase(player1)).toThrow();
        
        // End turn and start new turn
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack(); // Resolve any stack effects
        expect(game.currentPlayer.id).toBe(player2.id);
        game.endTurn();
        await game.resolveStack(); // Resolve any stack effects
        await game.resolveStack(); // Resolve any stack effects

        expect(game.currentPlayer.id).toBe(player1.id);
        // Should be able to purchase twice again in new turn
        game.declarePurchase(player1);
        const result4 = game.purchase(player1, 1);
        game.removeInPlay(player1, player1.inPlay[3]!); // remove purchased item from inPlay to ensure basic second purchase.
        game.declarePurchase(player1);
        const result5 = game.purchase(player1, 1);
        game.removeInPlay(player1, player1.inPlay[3]!); // remove purchased item from inPlay to ensure basic second purchase.
        expect(result4).toContain("successful");
        expect(result5).toContain("successful");
    });
});
