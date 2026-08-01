import { Game } from "../../models/game";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, setupTestGame } from "@/tests/testHelpers";

describe("Tap/Paid effects 2", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac", "b2-lazarus"],
            playerCount: 3,
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
    });

    // b2-remote_detonator: "[Tap Effect] Each player votes on an item in play. Destroy the item with the most votes. If there is a tie, nothing happens."
    it("remote_detonator - destroys item with most votes", async () => {
        const remoteDetonator = game.shop.obtainCard("b2-remote_detonator") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.shop.obtainCard("b2-dinner") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.cardHandler.addInPlay(player1, remoteDetonator);
        game.cardHandler.addInPlay(player1, breakfast);
        game.cardHandler.addInPlay(player2, dinner);
        game.cardHandler.addInPlay(player3, brimstone);
        
        game.cardHandler.recharge(remoteDetonator);
        
        // Mock selectMultiple - all 3 players vote for breakfast
        let voteCount = 0;
        game.selectMultiple = async (selections: any[]) => {
            voteCount = selections.length;
            // All players vote for breakfast
            return selections.map(sel => ({
                playerId: sel.player.id,
                selected: [breakfast as any],
                remaining: sel.options.filter((i: any) => i !== breakfast) as any[]
            }));
        };
        
        expect(player1.inPlay).toContain(breakfast);
        await game.activateItem(player1, remoteDetonator);
        await game.actions.resolveStack();
        
        expect(voteCount).toBe(3); // All 3 players should have voted
        expect(player1.inPlay).not.toContain(breakfast); // breakfast should be destroyed
        expect(game.decks.treasure.discard).toContain(breakfast);
    });

    it("remote_detonator - does nothing on tie", async () => {
        const remoteDetonator = game.shop.obtainCard("b2-remote_detonator") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.shop.obtainCard("b2-dinner") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.cardHandler.addInPlay(player1, remoteDetonator);
        game.cardHandler.addInPlay(player1, breakfast);
        game.cardHandler.addInPlay(player2, dinner);
        game.cardHandler.addInPlay(player3, brimstone);
        const nbVisible = game.visibleItems.length;
        game.cardHandler.recharge(remoteDetonator);
        
        // Mock selectMultiple - create a tie (each item gets 1 vote)
        let voteCount = 0;
        game.selectMultiple = async (selections: any[]) => {
            voteCount = selections.length;
            // Each player votes for a different item (creating a tie)
            return [
                { playerId: player1.id, selected: [breakfast], remaining: selections[0].options.filter((i: any) => i !== breakfast) },
                { playerId: player2.id, selected: [dinner], remaining: selections[1].options.filter((i: any) => i !== dinner) },
                { playerId: player3.id, selected: [brimstone], remaining: selections[2].options.filter((i: any) => i !== brimstone) }
            ] as any;
        };
        
        const initialInPlay1 = [...player1.inPlay];
        const initialInPlay2 = [...player2.inPlay];
        const initialInPlay3 = [...player3.inPlay];
        
        await game.activateItem(player1, remoteDetonator);
        await game.actions.resolveStack();
        
        // Nothing should be destroyed on a tie
        expect(player1.inPlay).toContain(breakfast);
        expect(player2.inPlay).toContain(dinner);
        expect(player3.inPlay).toContain(brimstone);
        expect(nbVisible).toBe(game.visibleItems.length);
    });

    // b2-guppys_paw: "[Tap Effect] Pay 1 [HP]. If you do, choose a player. Prevent the next instance of up to 2 damage they would take this turn."
    it("guppys_paw - prevents up to 2 damage when HP paid", async () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysPaw);
        game.entityHandler.addHealth(player2, 10); // Ensure player1 has enough HP to pay
        const initialHP = player2.currentHealthPoints;
        
        game.cardHandler.recharge(guppysPaw);
        
        expect(player1.currentHealthPoints).toBe(2);
        await game.activateItem(player1, guppysPaw, [player2]);
        await game.actions.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(1); // Paid 1 HP
        
        // Now deal 3 damage to player2
        game.entityHandler.dealDamage(player1, player2, guppysPaw, 3);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // would damage 
        
        expect(player2.currentHealthPoints).toBe(initialHP - 1); // 3 - 2 prevented = 1 damage
    });

    it("guppys_paw - does not activate if player has insufficient HP", async () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysPaw);
        
        // Reduce player1's HP to 0
        game.entityHandler.healthLoss(player1, player1, guppysPaw, player1.currentHealthPoints);
        expect(player1.currentHealthPoints).toBe(0);
        game.entityHandler.addHealth(player2, 10); // Ensure player2 has enough HP to test damage
        const initialHP2 = player2.currentHealthPoints;
        
        game.cardHandler.recharge(guppysPaw);
        
        // Try to activate - should fail because player1 has 0 HP
        await game.activateItem(player1, guppysPaw, [player2]);
        await game.actions.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(0); // No HP paid
        
        // Damage should not be prevented
        game.entityHandler.dealDamage(player1, player2, guppysPaw, 3);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // Resolve the damage
        expect(player2.currentHealthPoints).toBe(initialHP2 - 3); // Full damage taken
    });

    it("guppys_paw - prevents only 2 damage from larger attacks", async () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysPaw);
        game.entityHandler.addHealth(player2, 10); // Ensure player2 has enough HP to test damage

        const initialHP = player2.currentHealthPoints;
        
        game.cardHandler.recharge(guppysPaw);
        
        await game.activateItem(player1, guppysPaw, [player2]);
        await game.actions.resolveStack();
        
        // Deal 5 damage to player2
        game.entityHandler.dealDamage(player1, player2, guppysPaw, 5);
        await game.actions.resolveStack(); // would damage 
        await game.actions.resolveStack(); // Resolve the damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 3); // 5 - 2 prevented = 3 damage
    });

    it("guppys_paw - only prevents one instance of damage", async () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysPaw);
        game.entityHandler.addHealth(player2, 10); // Ensure player2 has enough HP to test damage

        const initialHP = player2.currentHealthPoints;
        
        game.cardHandler.recharge(guppysPaw);
        
        await game.activateItem(player1, guppysPaw, [player2]);
        await game.actions.resolveStack();
        
        // First damage instance - should be prevented
        game.entityHandler.dealDamage(player1, player2, guppysPaw, 1);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // would damage 
        await game.actions.resolveStack(); // would damage 
        expect(player2.currentHealthPoints).toBe(initialHP); // 1 - 1 prevented = 0 damage
        
        // Second damage instance - should NOT be prevented
        game.entityHandler.dealDamage(player1, player2, guppysPaw, 2);
        await game.actions.resolveStack(); // Resolve the damage
        expect(game.stack.isEmpty()).toBe(true);
        expect(player2.currentHealthPoints).toBe(initialHP - 2); // Full damage
    });

    // TODO: Skipped - same issue as above test
    it("guppys_paw - can target self", async () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysPaw);
        
        game.cardHandler.recharge(guppysPaw);
        
        
        expect(player1.currentHealthPoints).toBe(2);
        await game.activateItem(player1, guppysPaw, [player1]);
        await game.actions.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(1); // Paid 1 HP
        
        // Deal damage to player1 - should be prevented
        game.entityHandler.dealDamage(player2, player1, guppysPaw, 2);
        await game.actions.resolveStack(); // Resolve the damage
        expect(player1.currentHealthPoints).toBe(1); // 2 - 2 prevented = 0 damage, still at 1 HP
    });

    // b2-empty_vessel: "While you have 0¢, you have +1 to your attack rolls."
    it("empty_vessel - grants +1 to attack rolls when at 0 coins", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Ensure player1 has 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        
        // Check attack dice modifier
        expect(player1.attackDiceModifier).toBe(1);
    });

    it("empty_vessel - no bonus when player has coins", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Give player1 some coins
        game.gainCoins(player1, 5, ("debug"));
        expect(player1.coins).toBe(5);
        
        // Should have no attack dice modifier
        expect(player1.attackDiceModifier).toBe(0);
    });

    it("empty_vessel - bonus activates when losing coins to 0", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Give player1 some coins
        game.gainCoins(player1, 3, ("debug"));
        expect(player1.coins).toBe(3);
        expect(player1.attackDiceModifier).toBe(0);
        
        // Lose all coins
        game.loseCoins(player1, 3, true);
        expect(player1.coins).toBe(0);
        
        // Bonus should now be active
        expect(player1.attackDiceModifier).toBe(1);
    });

    it("empty_vessel - bonus deactivates when gaining coins from 0", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Ensure player1 has 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        expect(player1.attackDiceModifier).toBe(1);
        
        // Gain coins
        game.gainCoins(player1, 1, ("debug"));
        expect(player1.coins).toBe(1);
        
        // Bonus should be deactivated
        expect(player1.attackDiceModifier).toBe(0);
    });

    it("empty_vessel - bonus reactivates after spending coins back to 0", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Start with 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        expect(player1.attackDiceModifier).toBe(1);
        
        // Gain coins
        game.gainCoins(player1, 5, ("debug"));
        expect(player1.coins).toBe(5);
        expect(player1.attackDiceModifier).toBe(0);
        
        // Spend all coins
        game.loseCoins(player1, 5, false);
        expect(player1.coins).toBe(0);
        
        // Bonus should be active again
        expect(player1.attackDiceModifier).toBe(1);
    });

    // "When you have 0 loot cards in your hand, you have +1 [ATK]."
    it("empty_vessel - grants +1 ATK when player has 0 loot cards in hand", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        
        // Clear player1's hand first (game already started and player looted)
        while (player1.hand.length > 0) {
            game.cardHandler.discardFromHandAtIndex(player1, 0);
        }
        
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();

        // Player1 now has 0 cards
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // 1 base + 1 from empty hand
    });

    it("empty_vessel - no ATK bonus when player has loot cards in hand", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Add cards to hand
        game.loot(player1, 3);
        expect(player1.hand.length).toBe(3);
        expect(player1.attackPoints).toBe(1); // Base only, no bonus
        expect(game.stack.isEmpty()).toBe(true);
    });

    it("empty_vessel - ATK bonus activates when hand becomes empty", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);

        // Start with empty hand and bonus
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
        
        // Loot some cards
        game.loot(player1, 2);
        expect(player1.hand.length).toBe(2);
        expect(player1.attackPoints).toBe(1); // Bonus deactivated
        
        // Discard all cards manually - store references before removal
        const cards = [...player1.hand.cards];
        game.cardHandler.removeCardFromHand(player1, cards[0]! as LootCard);
        game.cardHandler.removeCardFromHand(player1, cards[1]! as LootCard);

        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated!
    });

    it("empty_vessel - ATK bonus responds to discardFromHandAtIndex", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Add a card
        game.loot(player1, 1);
        expect(player1.attackPoints).toBe(1); // No bonus
        
        // Discard the card using game method
        game.cardHandler.discardFromHandAtIndex(player1, 0);

        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated
    });

    it("empty_vessel - ATK bonus responds to giveCard", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();

        // Give player1 some cards
        game.loot(player1, 2);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(1); // No bonus with cards
        
        // Give all cards to player2
        const cards = [...player1.hand.cards];
        for (const card of cards) {
            game.cardHandler.giveCard(player1, player2, card as LootCard);
        }
        await game.actions.resolveStack();
        
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated
    });

    it("empty_vessel - ATK bonus responds to stealLootCard", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();

        // Give player1 one card
        game.loot(player1, 1);
        expect(player1.attackPoints).toBe(1); // No bonus
        
        const stolenCard = player1.hand.cards[0] as LootCard;
        
        // Player2 steals the card
        game.cardHandler.stealLootCard(player2, player1, stolenCard);


        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated after being stolen from
    });

    it("empty_vessel - receiving stolen card deactivates ATK bonus", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();

        // Player1 has empty hand with bonus
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
        
        // Give player2 a card
        game.loot(player2, 1);
        const cardToSteal = player2.hand.cards[0] as LootCard;
        
        // Player1 steals from player2
        game.cardHandler.stealLootCard(player1, player2, cardToSteal);
        
        expect(player1.hand.length).toBe(1);
        expect(player1.attackPoints).toBe(1); // Bonus deactivated
    });

    it("empty_vessel - ATK bonus responds to playCard", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Ensure player has 0 coins first
        game.loseCoins(player1, player1.coins, true);
        
        // Give player1 a card they can play
        const card = game.decks["loot"]!.getCardFromSlug("b2-a_penny")! as LootCard;
        game.cardHandler.addCardToHand(player1, card);
        
        expect(player1.hand.length).toBe(1);
        expect(player1.attackPoints).toBe(1); // No bonus (has card in hand)
        
        // Play the card
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(player1.coins).toBe(1); // Gained 1 coin from penny
        expect(player1.attackPoints).toBe(2); 
        game.loot(player1, 1);
        expect(player1.attackPoints).toBe(1); 
    });

    it("empty_vessel - ATK bonus correctly toggles with rapid hand size changes", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();
        
        expect(player1.attackPoints).toBe(2); // Start with bonus
        
        // Add card
        const card1 = game.decks["loot"]!.draw() as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Add another
        const card2 = game.decks["loot"]!.draw() as LootCard;
        game.cardHandler.addCardToHand(player1, card2);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove one
        game.cardHandler.removeCardFromHand(player1, card1);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove the last
        game.cardHandler.removeCardFromHand(player1, card2);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(2);
        
        // Add again
        const card3 = game.decks["loot"]!.draw() as LootCard;
        game.cardHandler.addCardToHand(player1, card3);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove again
        game.cardHandler.removeCardFromHand(player1, card3);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(2);
    });

    it("empty_vessel - ATK bonus is specific to owner", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();
        
        // Both players have empty hands
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(0);
        
        // Only player1 gets the bonus
        expect(player1.attackPoints).toBe(2);
        expect(player2.attackPoints).toBe(1); // Base only
        
        // Give player2 a card (shouldn't affect player1's bonus)
        game.loot(player2, 1);
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(2); // Still has bonus
        expect(player2.attackPoints).toBe(1);
    });

    it("empty_vessel - ATK bonus works when acquired mid-game with cards", async () => {
        // Player1 starts with cards
        game.loot(player1, 3);
        expect(player1.attackPoints).toBe(1);
        
        // Acquire empty_vessel while having cards
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.cardHandler.addInPlay(player1, emptyVessel);
        
        // Should still not have bonus
        expect(player1.attackPoints).toBe(1);
        
        // Discard all cards
        while (player1.hand.length > 0) {
            game.cardHandler.discardFromHandAtIndex(player1, 0);
        }
        await game.actions.resolveStack();
        
        // Now bonus should activate
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
    });

    it("empty_vessel - ATK bonus deactivates after turn ends due to loot step", async () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        
        // Clear player1's hand
        while (player1.hand.length > 0) {
            game.cardHandler.discardFromHandAtIndex(player1, 0);
        }
        
        // Add empty vessel
        game.cardHandler.addInPlay(player1, emptyVessel);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus active
        
        // Make it player1's turn if it isn't
        while (game.currentPlayer !== player1) {
            await game.endTurn();
            await game.actions.resolveStack();
        }
        
        // When we loop to make it player1's turn, the loot step has already run
        // So check if player1 already has cards from the loot step
        if (player1.hand.length > 0) {
            // Already looted, bonus should be deactivated
            expect(player1.attackPoints).toBe(1);
        } else {
            // If somehow still at 0 (shouldn't happen), bonus should still be active
            expect(player1.attackPoints).toBe(2);
        }
    });

    // b2-shadow: "If another player would pay the death penalty, you choose what item they would destroy and you gain any loot cards and ¢ they would lose."
    it("shadow - redirects death penalty coins and loot to shadow owner", async () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.cardHandler.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.cardHandler.addInPlay(player2, breakfast);
        
        // Give player2 some coins and loot cards
        game.gainCoins(player2, 5, ("debug"));
        const lootCard1 = game.decks["loot"]!.draw() as LootCard;
        const lootCard2 = game.decks["loot"]!.draw() as LootCard;
        player2.hand.addToHand(lootCard1);
        player2.hand.addToHand(lootCard2);
        
        const player1CoinsBeforeDeath = player1.coins;
        const player1HandBeforeDeath = player1.hand.length;
        let selectCount = 0;
        
        // Kill player2
        game.entityHandler.dealDamage(player1, player2, shadow, 999);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // Resolve the death
        
        // Player1 should have gained the coins
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 1); // death penalty is 1 coin
        
        // Player1 should have gained the loot card
        expect(player1.hand.length).toBe(player1HandBeforeDeath + 1);
        expect(player1.hand.cards).toContain(lootCard1);
        
        // Player2 should have lost the item
        expect(player2.inPlay).not.toContain(breakfast);
        
        // Player2 should have lost coins (but they went to player1)
        expect(player2.coins).toBe(4); // 5 - 1 = 4
    });

    it("shadow - shadow owner does not intercept their own death penalty", async () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.cardHandler.addInPlay(player1, shadow);
        
        // Give player1 some coins
        game.gainCoins(player1, 5, ("debug"));
        
        const player1CoinsBeforeDeath = player1.coins;
        
        // Kill player1 (shadow owner)
        game.entityHandler.dealDamage(player2, player1, shadow, 999);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // Resolve the death
        
        // Player1 should have paid normal death penalty (lost 2 coins)
        expect(player1.coins).toBe(player1CoinsBeforeDeath - 1);
    });

    it("shadow - handles death penalty when victim has no items", async () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.cardHandler.addInPlay(player1, shadow);
        expect(player2.hand.length).toBe(0);
        game.loot(player2, 2);
        // Player2 has no non-eternal items (only character)
        // Give player2 coins and loot
        game.gainCoins(player2, 5, ("debug"));
        const lootCard = game.decks["loot"]!.draw() as LootCard;
        player2.hand.addToHand(lootCard);
        expect(player2.hand.length).toBe(3);
        
        const player1CoinsBeforeDeath = player1.coins;
        const player1HandBeforeDeath = player1.hand.length;
        
        // Kill player2
        game.entityHandler.dealDamage(player1, player2, shadow, 999);
        await game.actions.resolveStack(); // Resolve damage
        await game.actions.resolveStack(); // Resolve death
        
        // Player1 should still gain coins and loot
        expect(game.stack.size).toBe(0);
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 1);
        expect(player1.hand.length).toBe(player1HandBeforeDeath + 1);
        expect(player2.hand.length).toBe(2);
    });

    it("shadow - handles death penalty when victim has no loot cards", async () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.cardHandler.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.cardHandler.addInPlay(player2, breakfast);
        
        // Give player2 coins but no loot
        game.gainCoins(player2, 5, ("debug"));
        expect(player2.hand.length).toBe(0);
        
        const player1CoinsBeforeDeath = player1.coins;
        
        // Kill player2
        game.entityHandler.dealDamage(player1, player2, shadow, 999);
        await game.actions.resolveStack(); // Resolve the damage and death
        await game.actions.resolveStack(); // Resolve the damage and death
        
        // Player1 should still gain coins
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 1);
        
        // Player2 should have lost the item
        expect(player2.inPlay.map((c) => c.name)).not.toContain(breakfast.name);
    });

    // TODO: Skipped - same issue as first shadow test
    it("shadow - cannot force destruction of eternal items", async () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.cardHandler.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        breakfast.setEternal(true); // Make it eternal
        game.cardHandler.addInPlay(player2, breakfast);
        
        // Give player2 coins
        game.gainCoins(player2, 5, ("debug"));
        
        const player1CoinsBeforeDeath = player1.coins;

        // Kill player2
        game.entityHandler.dealDamage(player1, player2, shadow, 999);
        await game.actions.resolveStack(); // Resolve the damage
        await game.actions.resolveStack(); // Resolve the death
        
        // Player1 should still gain coins even if no item was destroyed
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 1);
        
        // Breakfast should still be in play
        expect(player2.inPlay.map((c) => c.name)).toContain(breakfast.name);
    });
});

describe("Force Attack Monster", () => {
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
        game.entityHandler.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack

    });

    it("should prevent ending turn when forced attack is not satisfied", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack([monster], monster.card, false);

        // Try to end turn without attacking
        expect(async() => {
            await game.endTurn();
            await game.actions.resolveStack();
        }).toThrow("You must attack the required monster(s)");
    });

    it("should allow ending turn after attacking the forced monster", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack([monster], monster.card, false);

        // Attack the forced monster
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, monster);

        // Should be able to end turn now (mustAttackEntity was cleared)
        expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
        game.entityHandler.endCombat();

        expect(async () => {
            await game.endTurn();
            await game.actions.resolveStack();
        }).not.toThrow();
    });

    it("should allow ending turn if forced monster dies", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack([monster], monster.card, false);

        // Kill the monster
        game.entityHandler.death(monster, game.currentPlayer, monster.card);
        await game.actions.resolveStack();

        // Should be able to end turn (constraint lifted)
        expect(async () => {
            await game.endTurn();
            await game.actions.resolveStack();
        }).not.toThrow();
    });

    it("should allow ending turn if player dies", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack([monster], monster.card, false);
        game.entityHandler.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack

        // Kill the player
        game.entityHandler.dealDamage(player2, game.currentPlayer, monster.card, 999);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(game.currentPlayer.isDead).toBe(true);

        // Should be able to end turn (player dead, constraint doesn't apply)
        expect(async () => {
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
        }).not.toThrow();
        expect(game.currentPlayer.isDead).toBe(false);
    });

    it("should clear mustAttackEntity at start of next turn", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack and satisfy it
        game.currentPlayer.mustAttack([monster], monster.card, false);
        game.entityHandler.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, monster);

        expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
        game.entityHandler.endCombat();
        // End turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Go back to player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // mustAttackEntity should still be null
        expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
    });

    it("should clear constraint when monster is removed from encounters", async () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack([monster] , monster.card, false);

        // Discard the monster (remove it from play)
        game.encounters.discardTop(0);

        // Constraint should be lifted because monster is gone
        expect(async () => {
            await game.endTurn();
            await game.actions.resolveStack();
        }).not.toThrow();
    });

    describe("b2-monster_manual", () => {
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
        });

        it("forces active player to attack chosen monster", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[1]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Active player (player1) should have forced attack constraint
            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);
        });

        it("prevents ending turn without attacking the forced monster", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Try to end turn without attacking
            expect(async () => {
                await game.endTurn();
                await game.actions.resolveStack();
            }).toThrow("You must attack the required monster(s)");
        });

        it("allows ending turn after attacking the forced monster", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Attack the forced monster
            game.actions.declareAttack(game.currentPlayer);
            await game.actions.declareAttackOnEntity(game.currentPlayer, targetMonster);

            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
            game.entityHandler.kill(targetMonster, targetMonster, monsterManual);
            await game.actions.resolveStack();
            // Should be able to end turn now
            expect(async () => {
                await game.endTurn();
                await game.actions.resolveStack();
            }).not.toThrow();
        });

        it("DOES NOT allow attack even when attackThisTurn is 0", async () => {
            // Player starts with attackThisTurn = 0 after await game.start()
            dischargeEachItemsAndRemoveCoins(game);
            emptyHands(game);
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

                // Use up any attacks by attacking another monster first
            if (game.currentPlayer.attackThisTurn !== 0) {
                game.actions.declareAttack(game.currentPlayer);
                await game.actions.declareAttackOnEntity(game.currentPlayer, game.monsters[1]!);
            }
            game.entityHandler.kill(game.currentPlayer, game.monsters[1]!, monsterManual);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.currentPlayer.attackThisTurn).toBeLessThanOrEqual(0);

            // Now activate monster manual
            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Player should still be forced to attack despite having 0 or negative attacks
            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);

            // Player can still attack the forced monster (bypasses limit)
            expect(game.actions.canDeclareAttack(game.currentPlayer)).not.toBe(true);
            // await game.actions.declareAttackOnEntity(game.currentPlayer, targetMonster);

            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
        });

        it("constraint is only valid for one turn", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);

            // Attack the monster to satisfy constraint
            game.actions.declareAttack(game.currentPlayer);
            await game.actions.declareAttackOnEntity(game.currentPlayer, targetMonster);
            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
            game.entityHandler.kill(targetMonster, targetMonster, monsterManual);
            await game.actions.resolveStack();
            // End turn
            await game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();

            // On next turn, player2 should not have the constraint
            expect(game.currentPlayer).toBe(player2);
            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);

            // End player2's turn
            await game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();

            // Back to player1 - constraint should not persist
            expect(game.currentPlayer).toBe(player1);
            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
        });

        it("clears constraint if forced monster dies", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);

            // Kill the monster directly
            game.entityHandler.kill(player1, targetMonster, monsterManual);
            await game.actions.resolveStack();

            // Constraint should be cleared
            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);

            // Should be able to end turn
            expect(async () => {
                await game.endTurn();
                await game.actions.resolveStack();
            }).not.toThrow();
        });

        it("clears constraint if forced monster is discarded", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;
            const monsterPosition = game.monsters.indexOf(targetMonster);

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);

            // Discard the monster
            game.discardMonster(player1, monsterPosition);

            // Constraint should be cleared (monster no longer in play)
            expect(player1.hasMandatoryAttackRequirement).toBe(false);

            // Should be able to end turn
            expect(async () => {
                await game.endTurn();
                await game.actions.resolveStack();
            }).not.toThrow();
        });

        it("clears constraint if player dies", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            expect(game.currentPlayer.mustAttackEntity![0]!.targets[0]).toBe(
              targetMonster
            );

            // Kill the player
            game.entityHandler.kill(player1, player1, monsterManual);
            await game.actions.resolveStack();

            // Constraint should be cleared (player dead)
            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);
        });

        it("does not force non-active player", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Only current player (player1) should have the constraint
            expect(player1.mustAttackEntity![0]!.targets[0]).toBe(targetMonster);
            expect(player2.mustAttackEntity.length).toBe(0);
        });

        it("does not prevent attacking other monsters after forced monster is attacked", async () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.cardHandler.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;
            const otherMonster = game.monsters[1]!;

            // Give player multiple attacks
            game.entityHandler.addAttackThisTurn(game.currentPlayer, 2);

            game.cardHandler.recharge(monsterManual);
            await game.activateItem(player1, monsterManual, [targetMonster]);
            await game.actions.resolveStack();

            // Attack the forced monster first
            game.actions.declareAttack(game.currentPlayer);
            await game.actions.declareAttackOnEntity(game.currentPlayer, targetMonster);
            game.entityHandler.kill(targetMonster, targetMonster, monsterManual);
            await game.actions.resolveStack();

            expect(game.currentPlayer.hasMandatoryAttackRequirement).toBe(false);

            // Can now attack other monsters
            game.actions.declareAttack(game.currentPlayer);
            await game.actions.declareAttackOnEntity(game.currentPlayer, otherMonster);

            game.entityHandler.endCombat();
            expect(async () => {
                await game.endTurn();
                await game.actions.resolveStack();
            }).not.toThrow();
        });

        // This test assumed that a player constrained to attack monster A could first attack 
        // monster B if he had at least 2 attack this turn. Acording to the rules it is not the case.
        
    //     it("targeting specific monster works correctly", async () => {
    //         const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
    //         game.cardHandler.addInPlay(player1, monsterManual);

    //         const firstMonster = game.monsters[0]!;
    //         const secondMonster = game.monsters[1]!;

    //         game.cardHandler.recharge(monsterManual);
    //         await game.activateItem(player1, monsterManual, [secondMonster]);
    //         await game.actions.resolveStack();

    //         // Should force attack on second monster specifically
    //         expect(game.currentPlayer.mustAttackEntity![0]).toBe(secondMonster);

    //         // Attacking first monster should not clear the constraint
    //         game.actions.declareAttack(game.currentPlayer);
    //         await game.actions.resolveStack();
    //         await game.declareAttackOnMonster(game.currentPlayer, firstMonster);
    //         await game.actions.resolveStack();
    //         expect(game.currentPlayer.mustAttackEntity![0]).toBe(secondMonster);

    //         game.entityHandler.kill(firstMonster, firstMonster, monsterManual);
    //         await game.actions.resolveStack();
            
    //         game.actions.declareAttack(game.currentPlayer);
    //         await game.actions.resolveStack();
    //         await game.declareAttackOnMonster(game.currentPlayer, secondMonster);
    //         await game.actions.resolveStack();
    //         game.entityHandler.kill(secondMonster, secondMonster, monsterManual);
    //         await game.actions.resolveStack();

    //         // Must attack the second monster to clear constraint
    //         expect(game.currentPlayer.hasAttackRequirement).toBe(false);
    //     });
    });
});
