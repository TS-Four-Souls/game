import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/player";
import { CharacterCard, ItemCard, treasureCard, LootCard, MonsterCard } from "@/models/cards";

describe("Tap/Paid effects 2", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        player3 = new Player("Player 3");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.addPlayer(player3);
        game.setupGame();
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lazarus = game.decks["character"]!.getCardFromSlug("b2-lazarus")! as CharacterCard;
        game.start(player1, [samson, isaac, lazarus]);
        for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
    });

    // b2-remote_detonator: "[Tap Effect] Each player votes on an item in play. Destroy the item with the most votes. If there is a tie, nothing happens."
    // TODO: This test is skipped because the voting mechanism needs more investigation.
    // The effect should call game.select for each player to vote, but the mock isn't being called.
    // Needs investigation into how visibleItemSelector works and when the effect is executed.
    it("remote_detonator - destroys item with most votes", () => {
        const remoteDetonator = game.shop.obtainCard("b2-remote_detonator") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.shop.obtainCard("b2-dinner") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, remoteDetonator);
        game.addInPlay(player1, breakfast);
        game.addInPlay(player2, dinner);
        game.addInPlay(player3, brimstone);
        
        game.recharge(remoteDetonator);
        
        // Mock the selection - all 3 players vote for breakfast
        let voteCount = 0;
        game.select = (player: Player, n: number, Options: any[], anyNumber:boolean = false) => {
            voteCount++;
            // All players vote for breakfast
            return { selected: [breakfast as any], remaining: Options.filter(i => i !== breakfast) as any[] };
        };
        
        expect(player1.inPlay).toContain(breakfast);
        game.activateItem(player1, remoteDetonator);
        game.resolveStack();
        
        expect(voteCount).toBe(3); // All 3 players should have voted
        expect(player1.inPlay).not.toContain(breakfast); // breakfast should be destroyed
        expect(game.destroyedCards).toContain(breakfast);
    });

    it("remote_detonator - does nothing on tie", () => {
        const remoteDetonator = game.shop.obtainCard("b2-remote_detonator") as ItemCard;
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        const dinner = game.shop.obtainCard("b2-dinner") as ItemCard;
        const brimstone = game.shop.obtainCard("b2-brimstone") as ItemCard;
        
        game.addInPlay(player1, remoteDetonator);
        game.addInPlay(player1, breakfast);
        game.addInPlay(player2, dinner);
        game.addInPlay(player3, brimstone);
        const nbVisible = game.visibleItems.length;
        game.recharge(remoteDetonator);
        
        // Mock the selection - create a tie (each item gets 1 vote)
        let voteCount = 0;
        game.select = (player: Player, n: number, Options: any[], anyNumber: boolean = false) => {
            voteCount++;
            if (voteCount === 1) return { selected: [breakfast], remaining: Options.filter(i => i !== breakfast) };
            if (voteCount === 2) return { selected: [dinner], remaining: Options.filter(i => i !== dinner) };
            return { selected: [brimstone], remaining: Options.filter(i => i !== brimstone) };
        };
        
        const initialInPlay1 = [...player1.inPlay];
        const initialInPlay2 = [...player2.inPlay];
        const initialInPlay3 = [...player3.inPlay];
        
        game.activateItem(player1, remoteDetonator);
        game.resolveStack();
        
        // Nothing should be destroyed on a tie
        expect(player1.inPlay).toContain(breakfast);
        expect(player2.inPlay).toContain(dinner);
        expect(player3.inPlay).toContain(brimstone);
        expect(nbVisible).toBe(game.visibleItems.length);
    });

    // b2-guppys_paw: "[Tap Effect] Pay 1 [HP]. If you do, choose a player. Prevent the next instance of up to 2 damage they would take this turn."
    it("guppys_paw - prevents up to 2 damage when HP paid", () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.addInPlay(player1, guppysPaw);
        game.addHealth(player2, 10); // Ensure player1 has enough HP to pay
        const initialHP = player2.currentHealthPoints;
        
        game.recharge(guppysPaw);
        
        expect(player1.currentHealthPoints).toBe(2);
        game.activateItem(player1, guppysPaw, [player2]);
        game.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(1); // Paid 1 HP
        
        // Now deal 3 damage to player2
        game.dealDamage(player1, player2, guppysPaw, 3);
        game.resolveStack(); // Resolve the damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 1); // 3 - 2 prevented = 1 damage
    });

    it("guppys_paw - does not activate if player has insufficient HP", () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.addInPlay(player1, guppysPaw);
        
        // Reduce player1's HP to 0
        game.healthLoss(player1, player1, guppysPaw, player1.currentHealthPoints);
        expect(player1.currentHealthPoints).toBe(0);
        game.addHealth(player2, 10); // Ensure player2 has enough HP to test damage
        const initialHP2 = player2.currentHealthPoints;
        
        game.recharge(guppysPaw);
        
        // Try to activate - should fail because player1 has 0 HP
        game.activateItem(player1, guppysPaw, [player2]);
        game.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(0); // No HP paid
        
        // Damage should not be prevented
        game.dealDamage(player1, player2, guppysPaw, 3);
        game.resolveStack(); // Resolve the damage
        game.resolveStack(); // Resolve the damage
        expect(player2.currentHealthPoints).toBe(initialHP2 - 3); // Full damage taken
    });

    it("guppys_paw - prevents only 2 damage from larger attacks", () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.addInPlay(player1, guppysPaw);
        game.addHealth(player2, 10); // Ensure player2 has enough HP to test damage

        const initialHP = player2.currentHealthPoints;
        
        game.recharge(guppysPaw);
        
        game.activateItem(player1, guppysPaw, [player2]);
        game.resolveStack();
        
        // Deal 5 damage to player2
        game.dealDamage(player1, player2, guppysPaw, 5);
        game.resolveStack(); // Resolve the damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 3); // 5 - 2 prevented = 3 damage
    });

    it("guppys_paw - only prevents one instance of damage", () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.addInPlay(player1, guppysPaw);
        game.addHealth(player2, 10); // Ensure player2 has enough HP to test damage

        const initialHP = player2.currentHealthPoints;
        
        game.recharge(guppysPaw);
        
        game.activateItem(player1, guppysPaw, [player2]);
        game.resolveStack();
        
        // First damage instance - should be prevented
        game.dealDamage(player1, player2, guppysPaw, 1);
        game.resolveStack(); // Resolve the damage
        expect(player2.currentHealthPoints).toBe(initialHP); // 1 - 1 prevented = 0 damage
        
        // Second damage instance - should NOT be prevented
        game.dealDamage(player1, player2, guppysPaw, 2);
        game.resolveStack(); // Resolve the damage
        expect(player2.currentHealthPoints).toBe(initialHP - 2); // Full damage
    });

    // TODO: Skipped - same issue as above test
    it("guppys_paw - can target self", () => {
        const guppysPaw = game.shop.obtainCard("b2-guppys_paw") as ItemCard;
        game.addInPlay(player1, guppysPaw);
        
        game.recharge(guppysPaw);
        
        
        expect(player1.currentHealthPoints).toBe(2);
        game.activateItem(player1, guppysPaw, [player1]);
        game.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(1); // Paid 1 HP
        
        // Deal damage to player1 - should be prevented
        game.dealDamage(player2, player1, guppysPaw, 2);
        game.resolveStack(); // Resolve the damage
        expect(player1.currentHealthPoints).toBe(1); // 2 - 2 prevented = 0 damage, still at 1 HP
    });

    // b2-empty_vessel: "While you have 0¢, you have +1 to your attack rolls."
    it("empty_vessel - grants +1 to attack rolls when at 0 coins", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Ensure player1 has 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        
        // Check attack dice modifier
        expect(player1.attackDiceModifier).toBe(1);
    });

    it("empty_vessel - no bonus when player has coins", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Give player1 some coins
        game.gainCoins(player1, 5);
        expect(player1.coins).toBe(5);
        
        // Should have no attack dice modifier
        expect(player1.attackDiceModifier).toBe(0);
    });

    it("empty_vessel - bonus activates when losing coins to 0", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Give player1 some coins
        game.gainCoins(player1, 3);
        expect(player1.coins).toBe(3);
        expect(player1.attackDiceModifier).toBe(0);
        
        // Lose all coins
        game.loseCoins(player1, 3, true);
        expect(player1.coins).toBe(0);
        
        // Bonus should now be active
        expect(player1.attackDiceModifier).toBe(1);
    });

    it("empty_vessel - bonus deactivates when gaining coins from 0", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Ensure player1 has 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        expect(player1.attackDiceModifier).toBe(1);
        
        // Gain coins
        game.gainCoins(player1, 1);
        expect(player1.coins).toBe(1);
        
        // Bonus should be deactivated
        expect(player1.attackDiceModifier).toBe(0);
    });

    it("empty_vessel - bonus reactivates after spending coins back to 0", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Start with 0 coins
        game.loseCoins(player1, player1.coins, true);
        expect(player1.coins).toBe(0);
        expect(player1.attackDiceModifier).toBe(1);
        
        // Gain coins
        game.gainCoins(player1, 5);
        expect(player1.coins).toBe(5);
        expect(player1.attackDiceModifier).toBe(0);
        
        // Spend all coins
        game.loseCoins(player1, 5, false);
        expect(player1.coins).toBe(0);
        
        // Bonus should be active again
        expect(player1.attackDiceModifier).toBe(1);
    });

    // "When you have 0 loot cards in your hand, you have +1 [ATK]."
    it("empty_vessel - grants +1 ATK when player has 0 loot cards in hand", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        
        // Clear player1's hand first (game already started and player looted)
        while (player1.hand.length > 0) {
            game.discardFromHand(player1, 1);
        }
        
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();

        // Player1 now has 0 cards
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // 1 base + 1 from empty hand
    });

    it("empty_vessel - no ATK bonus when player has loot cards in hand", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Add cards to hand
        game.loot(player1, 3);
        expect(player1.hand.length).toBe(3);
        expect(player1.attackPoints).toBe(1); // Base only, no bonus
    });

    it("empty_vessel - ATK bonus activates when hand becomes empty", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();

        // Start with empty hand and bonus
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
        
        // Loot some cards
        game.loot(player1, 2);
        game.resolveStack();
        expect(player1.hand.length).toBe(2);
        expect(player1.attackPoints).toBe(1); // Bonus deactivated
        
        // Discard all cards manually - store references before removal
        const cards = [...player1.hand.cards];
        game.removeCardFromHand(player1, cards[0]! as LootCard);
        game.removeCardFromHand(player1, cards[1]! as LootCard);
        game.resolveStack();

        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated!
    });

    it("empty_vessel - ATK bonus responds to discardFromHand", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        game.resolveStack();
        // Add a card
        game.loot(player1, 1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1); // No bonus
        
        // Discard the card using game method
        game.discardFromHand(player1, 1);
        game.resolveStack();

        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated
    });

    it("empty_vessel - ATK bonus responds to giveCard", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();

        // Give player1 some cards
        game.loot(player1, 2);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1); // No bonus with cards
        
        // Give all cards to player2
        const cards = [...player1.hand.cards];
        for (const card of cards) {
            game.giveCard(player1, player2, card as LootCard);
        }
        game.resolveStack();
        
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated
    });

    it("empty_vessel - ATK bonus responds to stealLootCard", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();

        // Give player1 one card
        game.loot(player1, 1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1); // No bonus
        
        const stolenCard = player1.hand.cards[0] as LootCard;
        
        // Player2 steals the card
        game.stealLootCard(player2, player1, stolenCard);
        game.resolveStack();

        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus reactivated after being stolen from
    });

    it("empty_vessel - receiving stolen card deactivates ATK bonus", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();

        // Player1 has empty hand with bonus
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
        
        // Give player2 a card
        game.loot(player2, 1);
        game.resolveStack();
        const cardToSteal = player2.hand.cards[0] as LootCard;
        
        // Player1 steals from player2
        game.stealLootCard(player1, player2, cardToSteal);
        
        expect(player1.hand.length).toBe(1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1); // Bonus deactivated
    });

    it("empty_vessel - ATK bonus responds to playCard", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Ensure player has 0 coins first
        game.loseCoins(player1, player1.coins, true);
        
        // Give player1 a card they can play
        const card = game.decks["loot"]!.getCardFromSlug("b2-a_penny")! as LootCard;
        game.addCardToHand(player1, card);
        
        expect(player1.hand.length).toBe(1);
        expect(player1.attackPoints).toBe(1); // No bonus (has card in hand)
        
        // Play the card
        game.playCard(player1, 1);
        game.resolveStack();
        
        expect(player1.hand.length).toBe(0);
        expect(player1.coins).toBe(1); // Gained 1 coin from penny
        expect(player1.attackPoints).toBe(1); // Base only (no hand bonus because has coins now)
    });

    it("empty_vessel - ATK bonus correctly toggles with rapid hand size changes", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();
        
        expect(player1.attackPoints).toBe(2); // Start with bonus
        
        // Add card
        const card1 = game.decks["loot"]!.draw() as LootCard;
        game.addCardToHand(player1, card1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Add another
        const card2 = game.decks["loot"]!.draw() as LootCard;
        game.addCardToHand(player1, card2);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove one
        game.removeCardFromHand(player1, card1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove the last
        game.removeCardFromHand(player1, card2);
        game.resolveStack();
        expect(player1.attackPoints).toBe(2);
        
        // Add again
        const card3 = game.decks["loot"]!.draw() as LootCard;
        game.addCardToHand(player1, card3);
        game.resolveStack();
        expect(player1.attackPoints).toBe(1);
        
        // Remove again
        game.removeCardFromHand(player1, card3);
        game.resolveStack();
        expect(player1.attackPoints).toBe(2);
    });

    it("empty_vessel - ATK bonus is specific to owner", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();
        
        // Both players have empty hands
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(0);
        
        // Only player1 gets the bonus
        expect(player1.attackPoints).toBe(2);
        expect(player2.attackPoints).toBe(1); // Base only
        
        // Give player2 a card (shouldn't affect player1's bonus)
        game.loot(player2, 1);
        game.resolveStack();
        expect(player1.attackPoints).toBe(2); // Still has bonus
        expect(player2.attackPoints).toBe(1);
    });

    it("empty_vessel - ATK bonus works when acquired mid-game with cards", () => {
        // Player1 starts with cards
        game.loot(player1, 3);
        expect(player1.attackPoints).toBe(1);
        
        // Acquire empty_vessel while having cards
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        game.addInPlay(player1, emptyVessel);
        
        // Should still not have bonus
        expect(player1.attackPoints).toBe(1);
        
        // Discard all cards
        while (player1.hand.length > 0) {
            game.discardFromHand(player1, 1);
        }
        game.resolveStack();
        
        // Now bonus should activate
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2);
    });

    it("empty_vessel - ATK bonus deactivates after turn ends due to loot step", () => {
        const emptyVessel = game.shop.obtainCard("b2-empty_vessel") as ItemCard;
        
        // Clear player1's hand
        while (player1.hand.length > 0) {
            game.discardFromHand(player1, 1);
        }
        
        // Add empty vessel
        game.addInPlay(player1, emptyVessel);
        game.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player1.attackPoints).toBe(2); // Bonus active
        
        // Make it player1's turn if it isn't
        while (game.currentPlayer !== player1) {
            game.endTurn();
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
    it("shadow - redirects death penalty coins and loot to shadow owner", () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player2, breakfast);
        
        // Give player2 some coins and loot cards
        game.gainCoins(player2, 5);
        const lootCard1 = game.decks["loot"]!.draw() as LootCard;
        const lootCard2 = game.decks["loot"]!.draw() as LootCard;
        player2.hand.addToHand(lootCard1);
        player2.hand.addToHand(lootCard2);
        
        const player1CoinsBeforeDeath = player1.coins;
        const player1HandBeforeDeath = player1.hand.length;
        let selectCount = 0;
        
        // Kill player2
        game.dealDamage(player1, player2, shadow, 999);
        game.resolveStack(); // Resolve the damage
        game.resolveStack(); // Resolve the death
        
        // Player1 should have gained the coins
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 2); // death penalty is 2 coins
        
        // Player1 should have gained the loot card
        expect(player1.hand.length).toBe(player1HandBeforeDeath + 1);
        expect(player1.hand.cards).toContain(lootCard1);
        
        // Player2 should have lost the item
        expect(player2.inPlay).not.toContain(breakfast);
        
        // Player2 should have lost coins (but they went to player1)
        expect(player2.coins).toBe(3); // 5 - 2 = 3
    });

    it("shadow - shadow owner does not intercept their own death penalty", () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.addInPlay(player1, shadow);
        
        // Give player1 some coins
        game.gainCoins(player1, 5);
        
        const player1CoinsBeforeDeath = player1.coins;
        
        // Kill player1 (shadow owner)
        game.dealDamage(player2, player1, shadow, 999);
        game.resolveStack(); // Resolve the damage
        game.resolveStack(); // Resolve the death
        
        // Player1 should have paid normal death penalty (lost 2 coins)
        expect(player1.coins).toBe(player1CoinsBeforeDeath - 2);
    });

    it("shadow - handles death penalty when victim has no items", () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.addInPlay(player1, shadow);
        
        // Player2 has no non-eternal items (only character)
        // Give player2 coins and loot
        game.gainCoins(player2, 5);
        const lootCard = game.decks["loot"]!.draw() as LootCard;
        player2.hand.addToHand(lootCard);
        
        const player1CoinsBeforeDeath = player1.coins;
        const player1HandBeforeDeath = player1.hand.length;
        
        // Kill player2
        game.dealDamage(player1, player2, shadow, 999);
        game.resolveStack(); // Resolve the damage and death
        game.resolveStack(); // Resolve the damage and death
        
        // Player1 should still gain coins and loot
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 2);
        expect(player1.hand.length).toBe(player1HandBeforeDeath + 1);
    });

    it("shadow - handles death penalty when victim has no loot cards", () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        game.addInPlay(player2, breakfast);
        
        // Give player2 coins but no loot
        game.gainCoins(player2, 5);
        expect(player2.hand.length).toBe(0);
        
        const player1CoinsBeforeDeath = player1.coins;
        
        // Kill player2
        game.dealDamage(player1, player2, shadow, 999);
        game.resolveStack(); // Resolve the damage and death
        game.resolveStack(); // Resolve the damage and death
        
        // Player1 should still gain coins
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 2);
        
        // Player2 should have lost the item
        expect(player2.inPlay).not.toContain(breakfast);
    });

    // TODO: Skipped - same issue as first shadow test
    it("shadow - cannot force destruction of eternal items", () => {
        const shadow = game.shop.obtainCard("b2-shadow") as ItemCard;
        game.addInPlay(player1, shadow);
        
        const breakfast = game.shop.obtainCard("b2-breakfast") as ItemCard;
        breakfast.setEternal(true); // Make it eternal
        game.addInPlay(player2, breakfast);
        
        // Give player2 coins
        game.gainCoins(player2, 5);
        
        const player1CoinsBeforeDeath = player1.coins;

        // Kill player2
        game.dealDamage(player1, player2, shadow, 999);
        game.resolveStack(); // Resolve the damage
        game.resolveStack(); // Resolve the death
        
        // Player1 should still gain coins even if no item was destroyed
        expect(player1.coins).toBe(player1CoinsBeforeDeath + 2);
        
        // Breakfast should still be in play
        expect(player2.inPlay).toContain(breakfast);
    });
});

describe("Force Attack Monster", () => {
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
        for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
            const monsterCardTop = game.obtainCard(slug) as MonsterCard;
            game.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        game.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack

    });

    it("should prevent ending turn when forced attack is not satisfied", () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack(monster);

        // Try to end turn without attacking
        expect(() => {
            game.endTurn();
        }).toThrow("You must attack the required monster(s) before ending your turn");
    });

    it("should allow ending turn after attacking the forced monster", () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack(monster);

        // Attack the forced monster
        game.declareAttack(game.currentPlayer);
        game.declareAttackOnMonster(game.currentPlayer, monster);

        // Should be able to end turn now (mustAttackMonster was cleared)
        expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
        expect(() => {
            game.endTurn();
        }).not.toThrow();
    });

    it("should allow ending turn if forced monster dies", () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack(monster);

        // Kill the monster
        game.death(monster, game.currentPlayer, monster.card);
        game.resolveStack();

        // Should be able to end turn (constraint lifted)
        expect(() => {
            game.endTurn();
        }).not.toThrow();
    });

    it("should allow ending turn if player dies", () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack(monster);
        game.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack

        // Kill the player
        game.dealDamage(player2, game.currentPlayer, monster.card, 999);
        game.resolveStack();
        game.resolveStack();

        expect(game.currentPlayer.isDead).toBe(true);

        // Should be able to end turn (player dead, constraint doesn't apply)
        expect(() => {
            game.endTurn();
        }).not.toThrow();
    });

    it("should clear mustAttackMonster at start of next turn", () => {
        const monster = game.monsters[0]!;

        // Set forced attack and satisfy it
        game.currentPlayer.mustAttack(monster);
        game.addAttackThisTurn(game.currentPlayer, 1); // Ensure player can attack
        game.declareAttack(game.currentPlayer);
        game.declareAttackOnMonster(game.currentPlayer, monster);

        expect(game.currentPlayer.hasAttackRequirement()).toBe(false);

        // End turn
        game.endTurn();

        // Go back to player1's turn
        game.endTurn();

        // mustAttackMonster should still be null
        expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
    });

    it("should clear constraint when monster is removed from encounters", () => {
        const monster = game.monsters[0]!;

        // Set forced attack
        game.currentPlayer.mustAttack(monster);

        // Discard the monster (remove it from play)
        game.encounters.discardTop(0);

        // Constraint should be lifted because monster is gone
        expect(() => {
            game.endTurn();
        }).not.toThrow();
    });

    describe("b2-monster_manual", () => {
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
            for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
                const monsterCardTop = game.obtainCard(slug) as MonsterCard;
                game.decks["monster"]!.addTopPosition(monsterCardTop);
            }
            const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
            const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
            game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
        });

        it("forces active player to attack chosen monster", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[1]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Active player (player1) should have forced attack constraint
            expect(game.currentPlayer.mustAttackMonster![0]).toBe(targetMonster);
        });

        it("prevents ending turn without attacking the forced monster", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Try to end turn without attacking
            expect(() => {
                game.endTurn();
            }).toThrow("You must attack the required monster(s) before ending your turn");
        });

        it("allows ending turn after attacking the forced monster", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Attack the forced monster
            game.declareAttack(game.currentPlayer);
            game.declareAttackOnMonster(game.currentPlayer, targetMonster);

            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);

            // Should be able to end turn now
            expect(() => {
                game.endTurn();
            }).not.toThrow();
        });

        it("allows attack even when attackThisTurn is 0 (bypasses limit)", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            // Player starts with attackThisTurn = 0 after game.start()
            // Use up any attacks by attacking another monster first
            if (game.currentPlayer.attackThisTurn !== 0) {
                game.declareAttack(game.currentPlayer);
                game.declareAttackOnMonster(game.currentPlayer, game.monsters[1]!);
            }
            expect(game.currentPlayer.attackThisTurn).toBeLessThanOrEqual(0);

            // Now activate monster manual
            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Player should still be forced to attack despite having 0 or negative attacks
            expect(game.currentPlayer.mustAttackMonster![0]).toBe(targetMonster);

            // Player can still attack the forced monster (bypasses limit)
            game.declareAttack(game.currentPlayer);
            game.declareAttackOnMonster(game.currentPlayer, targetMonster);

            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
        });

        it("constraint is only valid for one turn", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            expect(game.currentPlayer.mustAttackMonster![0]).toBe(targetMonster);

            // Attack the monster to satisfy constraint
            game.declareAttack(game.currentPlayer);
            game.declareAttackOnMonster(game.currentPlayer, targetMonster);

            // End turn
            game.endTurn();
            game.resolveStack();

            // On next turn, player2 should not have the constraint
            expect(game.currentPlayer).toBe(player2);
            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);

            // End player2's turn
            game.endTurn();
            game.resolveStack();

            // Back to player1 - constraint should not persist
            expect(game.currentPlayer).toBe(player1);
            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
        });

        it("clears constraint if forced monster dies", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            expect(game.currentPlayer.mustAttackMonster![0]).toBe(targetMonster);

            // Kill the monster directly
            game.kill(player1, targetMonster, monsterManual);
            game.resolveStack();

            // Constraint should be cleared
            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);

            // Should be able to end turn
            expect(() => {
                game.endTurn();
            }).not.toThrow();
        });

        it("clears constraint if forced monster is discarded", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;
            const monsterPosition = game.monsters.indexOf(targetMonster) + 1;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            expect(game.currentPlayer.mustAttackMonster![0]).toBe(targetMonster);

            // Discard the monster
            game.discardMonster(player1, monsterPosition);

            // Constraint should be cleared (monster no longer in play)
            expect(game.playerMustAttackList(player1).length).toBe(0);

            // Should be able to end turn
            expect(() => {
                game.endTurn();
            }).not.toThrow();
        });

        it("clears constraint if player dies", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            expect(game.currentPlayer.mustAttackMonster![0]).toBe(
              targetMonster
            );

            // Kill the player
            game.kill(player1, player1, monsterManual);
            game.resolveStack();

            // Constraint should be cleared (player dead)
            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
        });

        it("does not force non-active player", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Only current player (player1) should have the constraint
            expect(player1.mustAttackMonster![0]).toBe(targetMonster);
            expect(player2.mustAttackMonster.length).toBe(0);
        });

        it("does not prevent attacking other monsters after forced monster is attacked", () => {
            const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
            game.addInPlay(player1, monsterManual);

            const targetMonster = game.monsters[0]!;
            const otherMonster = game.monsters[1]!;

            // Give player multiple attacks
            game.addAttackThisTurn(game.currentPlayer, 2);

            game.recharge(monsterManual);
            game.activateItem(player1, monsterManual, [targetMonster]);
            game.resolveStack();

            // Attack the forced monster first
            game.declareAttack(game.currentPlayer);
            game.declareAttackOnMonster(game.currentPlayer, targetMonster);
            game.kill(targetMonster, targetMonster, monsterManual);
            game.resolveStack();

            expect(game.currentPlayer.hasAttackRequirement()).toBe(false);

            // Can now attack other monsters
            game.declareAttack(game.currentPlayer);
            game.declareAttackOnMonster(game.currentPlayer, otherMonster);

            expect(() => {
                game.endTurn();
            }).not.toThrow();
        });

        // This test assumed that a player constrained to attack monster A could first attack 
        // monster B if he had at least 2 attack this turn. Acording to the rules it is not the case.
        
    //     it("targeting specific monster works correctly", () => {
    //         const monsterManual = game.shop.obtainCard("b2-monster_manual") as ItemCard;
    //         game.addInPlay(player1, monsterManual);

    //         const firstMonster = game.monsters[0]!;
    //         const secondMonster = game.monsters[1]!;

    //         game.recharge(monsterManual);
    //         game.activateItem(player1, monsterManual, [secondMonster]);
    //         game.resolveStack();

    //         // Should force attack on second monster specifically
    //         expect(game.currentPlayer.mustAttackMonster![0]).toBe(secondMonster);

    //         // Attacking first monster should not clear the constraint
    //         game.declareAttack(game.currentPlayer);
    //         game.resolveStack();
    //         game.declareAttackOnMonster(game.currentPlayer, firstMonster);
    //         game.resolveStack();
    //         expect(game.currentPlayer.mustAttackMonster![0]).toBe(secondMonster);

    //         game.kill(firstMonster, firstMonster, monsterManual);
    //         game.resolveStack();
            
    //         game.declareAttack(game.currentPlayer);
    //         game.resolveStack();
    //         game.declareAttackOnMonster(game.currentPlayer, secondMonster);
    //         game.resolveStack();
    //         game.kill(secondMonster, secondMonster, monsterManual);
    //         game.resolveStack();

    //         // Must attack the second monster to clear constraint
    //         expect(game.currentPlayer.hasAttackRequirement()).toBe(false);
    //     });
    });
});
