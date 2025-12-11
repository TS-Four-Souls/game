import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard } from "@/models/cards";
import { InplayType, MonsterCard } from "@/models/cards";
import { effectParser, inplayCurseSelector, type ChooseOneOptions, type ChooseOneResult } from "@/models/effect";
import { chooseOneEffect } from "@/models/effect";
describe("Loot Card", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.start(player1);
    });

    it("Swallowed Penny: should give one coin on player takes damage if player is issuer.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.dealDamage(player2, player1, loot, 1); // No effect yet, not in play
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player2, player1, loot, 1);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        game.endTurn();
        player1.addHealthPoints(10); // Heal back for clarity

        game.dealDamage(player2, player1, loot, 2);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 2);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        game.resolveStack();
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });

    it("Swallowed Penny: remove in play should remove effect.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.dealDamage(player2, player1, loot, 1); // No effect yet, not in play
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player2, player1, loot, 1);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.dealDamage(player1, player2, loot, 1);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        game.removeInPlay(player1, loot);

        game.dealDamage(player2, player1, loot, 2);
        game.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 4);

        game.dealDamage(player1, player2, loot, 1);
        game.resolveStack();
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });


    it("Bloody Penny: should loot one on any player death.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;

        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2
        game.resolveStack();
        game.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 1); // Looted 1
        expect(player2.isDead).toBe(true);
        
        game.endTurn();
        expect(player2.isDead).toBe(false); // Revived at turn end
        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2 again
        game.resolveStack();
        game.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1
        expect(player2.isDead).toBe(true);

        game.dealDamage(player2, player1, loot, player1.currentHealthPoints); // Kill player 1
        game.resolveStack();
        game.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1 but discarded on death.
        expect(player1.isDead).toBe(true);

        game.endTurn();
        const handSizeTurn3 = player1.hand.cards.length;
        expect(player1.isDead).toBe(false); // Revived at turn end
        expect(player2.isDead).toBe(false); // Revived at turn end
        game.resolveStack();
        game.dealDamage(player1, player2, loot, player2.currentHealthPoints); // Kill player 2 again
        game.resolveStack();
        expect(player1.hand.cards.length).toBe(handSizeTurn3); // Looted 1
        expect(player2.isDead).toBe(true);
    });

    it("Bloody Penny: should NOT loot on monster death.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;
        const monster = game.monsters[0]!;
        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        game.dealDamage(player1, monster, loot, monster.currentHealthPoints); // Kill monster
        game.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize); // Looted 1
    });

    it("Counterfeit Penny: add one coins to your coin gain.", () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-counterfeit_penny")!;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;

        player1.hand.addToHand(loot);
        game.playCard(player1, 1);
        game.resolveStack();

        // gain x + 1 coins.
        game.gainCoins(player1, 2);
        expect(player1.coins).toBe(initialCoins + 3);
        
        // no gain when gaining 0 coins.
        game.gainCoins(player1, 0);
        expect(player1.coins).toBe(initialCoins + 3);

        // no effect for other players nor on other players' coin gain.
        game.gainCoins(player2, 5);
        expect(player2.coins).toBe(initialCoins2 + 5);
        expect(player1.coins).toBe(initialCoins + 3);

        // lose coins should not be affected.
        expect(game.loseCoins(player1, initialCoins + 3, false)).toBe(initialCoins + 3); // reset coins
        expect(player1.coins).toBe(0);

        game.removeInPlay(player1, loot);

        // gain x coins normally after removal.
        game.gainCoins(player1, 4);
        expect(player1.coins).toBe(4);
    });

    it("Cain's Eye: should let player look at top card and optionally put on bottom at turn start", () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.playCard(player1, 1);
        game.resolveStack();

        // Get the current top card before turn starts
        const lootDeck = game.decks["loot"]!;
        
        // Player chooses to put it on bottom
        game.select = (_issuer, _n, _opts, _optional) => ({ 
            selected: [_opts[0]], 
            remaining: [] 
        });
        
        game.endTurn(); // End player1's turn
        // Start of player2's turn - no effect for them
        
        const topCard = game.getFirstCardsOfDeck("loot", 1)[0]!;
        game.addTopPosition("loot", topCard); // Put it back
        game.endTurn();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = lootDeck.cards[lootDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        

        
        game.select = (_issuer, _n, _opts, _optional) => ({ 
            selected: [], 
            remaining: [_opts[0]] 
        });
        
        game.endTurn(); // End player1's turn

        // Now test choosing NOT to put on bottom
        const nextTopCard = game.getFirstCardsOfDeck("loot", 1)[0]!;
        game.addTopPosition("loot", nextTopCard); // Put it back

        game.endTurn(); // End player2's turn
        
        // Start of player1's turn - effect triggers
        // The card should be drawn.
        expect(player1.hand.cards).toContain(nextTopCard);
    });

    it("Cain's Eye: should only trigger for the issuer, not other players", () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.playCard(player1, 1);
        game.resolveStack();

        const lootDeck = game.decks["loot"]!;
        const topCard = game.getFirstCardsOfDeck("loot", 1)[0]!;
        game.addTopPosition("loot", topCard);

        let selectCalled = false;
        game.select = (_issuer, _n, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        game.endTurn();
        
        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        game.endTurn();
        
        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Cain's Eye: effect should stop when removed from play", () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.playCard(player1, 1);
        game.resolveStack();

        // Remove the trinket
        game.removeInPlay(player1, cainsEye);

        let selectCalled = false;
        game.select = (_issuer, _n, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        game.endTurn(); // player2
        game.endTurn(); // back to player1

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });

    it("Golden Horseshoe: should let player look at top card of the treasure deck and optionally put on bottom at turn start", () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.playCard(player1, 1);
        game.resolveStack();

        // Get the current top card before turn starts
        const treasureDeck = game.decks["treasure"]!;

        // Player chooses to put it on bottom
        game.select = (_issuer, _n, _opts, _optional) => ({
            selected: [_opts[0]],
            remaining: []
        });

        game.endTurn(); // End player1's turn
        // Start of player2's turn - no effect for them

        const topCard = game.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.addTopPosition("treasure", topCard); // Put it back
        game.endTurn();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = treasureDeck.cards[treasureDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        expect(treasureDeck.cards[0]).not.toBe(topCard);

        game.select = (_issuer, _n, _opts, _optional) => ({
            selected: [],
            remaining: [_opts[0]]
        });

        game.endTurn(); // End player1's turn
        // Now test choosing NOT to put on bottom
        const nextTopCard = game.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.addTopPosition("treasure", nextTopCard); // Put it back
        
        game.endTurn(); // End player2's turn

        // Start of player1's turn - effect triggers
        const finalBottomCards = treasureDeck.cards[treasureDeck.cards.length - 1];
        expect(finalBottomCards).not.toBe(nextTopCard);
        expect(treasureDeck.cards[0]).toBe(nextTopCard);
    });

    it("Golden horseshoe: should only trigger for the issuer, not other players", () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.playCard(player1, 1);
        game.resolveStack();

        const treasureDeck = game.decks["treasure"]!;
        const topCard = game.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.addTopPosition("treasure", topCard);

        let selectCalled = false;
        game.select = (_issuer, _n, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        game.endTurn();

        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        game.endTurn();

        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Golden horseshoe: effect should stop when removed from play", () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.playCard(player1, 1);
        game.resolveStack();

        // Remove the trinket
        game.removeInPlay(player1, goldenHorseshoe);

        let selectCalled = false;
        game.select = (_issuer, _n, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        game.endTurn(); // player2
        game.endTurn(); // back to player1

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });


    
    it("Purple Heart: should let player look at top card of the monster deck and optionally put on bottom at turn start", () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.playCard(player1, 1);
        game.resolveStack();

        // Get the current top card before turn starts
        const monsterDeck = game.decks["monster"]!;

        // Player chooses to put it on bottom
        game.select = (_issuer, _n, _opts, _optional) => ({
            selected: [_opts[0]],
            remaining: []
        });

        game.endTurn(); // End player1's turn
        // Start of player2's turn - no effect for them

        const topCard = game.getFirstCardsOfDeck("monster", 1)[0]!;
        game.addTopPosition("monster", topCard); // Put it back
        game.endTurn();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = monsterDeck.cards[monsterDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        expect(monsterDeck.cards[0]).not.toBe(topCard);

        game.select = (_issuer, _n, _opts, _optional) => ({
            selected: [],
            remaining: [_opts[0]]
        });

        game.endTurn(); // End player1's turn
        // Now test choosing NOT to put on bottom
        const nextTopCard = game.getFirstCardsOfDeck("monster", 1)[0]!;
        game.addTopPosition("monster", nextTopCard); // Put it back

        game.endTurn(); // End player2's turn

        // Start of player1's turn - effect triggers
        const finalBottomCards = monsterDeck.cards[monsterDeck.cards.length - 1];
        expect(finalBottomCards).not.toBe(nextTopCard);
        expect(monsterDeck.cards[0]).toBe(nextTopCard);
    });

    it("Purple Heart: should only trigger for the issuer, not other players", () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.playCard(player1, 1);
        game.resolveStack();

        const monsterDeck = game.decks["monster"]!;
        const topCard = game.getFirstCardsOfDeck("monster", 1)[0]!;
        game.addTopPosition("monster", topCard);

        let selectCalled = false;
        game.select = (_issuer, _n, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        game.endTurn();

        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        game.endTurn();

        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Purple Heart: effect should stop when removed from play", () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.playCard(player1, 1);
        game.resolveStack();

        // Remove the trinket
        game.removeInPlay(player1, purpleHeart);

        let selectCalled = false;
        game.select = (_issuer, _n, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        game.endTurn(); // player2
        game.endTurn(); // back to player1

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });

    it("Broken Ankh: should prevent death when rolling a 6, not on other rolls", () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;
        player1.hand.addToHand(brokenAnkh);
        game.playCard(player1, 1);
        game.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        
        // Get a damage source card
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage - should trigger Broken Ankh effect
        const beforeStack = game.stack.size;
        game.dealDamage(player2, player1, damageSource, initialHealth);
        game.resolveStack();
        
        // Damage should be on the stack but death is pending
        expect(game.stack.size).toBeGreaterThan(beforeStack+1); // At least DeathOnStack and DiceRoll
        
        // A DiceRoll should have been added to the stack (from Broken Ankh)
        const hasRoll = game.stack._stack.some(item => item.constructor.name === "DiceRoll");
        expect(hasRoll).toBe(true);
    });

    it("Broken Ankh: should prevent death and end turn if rolling 6 on your turn", () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.addHealthPoints(10);
        player1.hand.addToHand(brokenAnkh);
        game.playCard(player1, 1);
        game.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage on player1's turn
        game.dealDamage(player2, player1, damageSource, initialHealth);
        game.resolveStack();
        const roll = game.stack._stack[1] as DiceRoll | undefined;
        expect(roll).toBeDefined();
        if (roll) {
            roll.value = 6; // Mock the dice roll to return 6
        }
        game.resolveStack();

        // After resolving, player should still be alive
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBeGreaterThan(0);
    });

    it("Broken Ankh: should not prevent death when rolling less than 6", () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.hand.addToHand(brokenAnkh);
        game.playCard(player1, 1);
        game.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage
        game.dealDamage(player2, player1, damageSource, initialHealth);
        game.resolveStack();
        const roll = game.stack._stack[1] as DiceRoll | undefined;
        expect(roll).toBeDefined();
        if (roll) {
            roll.value = 3; // Mock the dice roll to return 3
        }
        game.resolveStack();
        game.resolveStack();
        // Player should be dead
        expect(player1.currentHealthPoints).toBeLessThanOrEqual(0);
    });

    it("Broken Ankh: should only prevent owner from dying", () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.hand.addToHand(brokenAnkh);
        game.playCard(player1, 1);
        game.resolveStack();

        const initialHealth = player2.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage
        game.dealDamage(player1, player2, damageSource, initialHealth);
        game.resolveStack();
        expect(game.stack.size).toBe(1);
        game.resolveStack();

        // Player should be dead
        expect(player2.currentHealthPoints).toBeLessThanOrEqual(0);
    });

    it("Curved Horn: should add +1 [ATK] to first attack roll each turn and not to subsequent attack rolls", () => {
        const curvedHorn = game.decks["loot"]!.getCardFromSlug("b2-curved_horn")!;
        const baseAttack = player1.attackPoints;
        player1.hand.addToHand(curvedHorn);
        game.playCard(player1, 1);
        game.resolveStack(); // add curvedHorn to in play

        const monster = game.monsters[0]!;
        monster.addHealthPoints(10);
        const initialMonsterHealth = monster.currentHealthPoints;

        // Attack monster
        game.attackRoll(player1, monster)
        const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        if (attackRoll) {
            // The roll should have +1 ATK from Curved Horn
            attackRoll.value = 6; // Mock roll
        }
        game.resolveStack();
        game.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - 1);

        // Second attack monster
        game.attackRoll(player1, monster)
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            // The roll should have +1 ATK from Curved Horn
            attackRoll2.value = 6; // Mock roll
        }
        game.resolveStack();
        game.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - baseAttack - 1);
    });

    it("Curved Horn: should ONLY add +1 [ATK] to issuer", () => {
        const curvedHorn = game.decks["loot"]!.getCardFromSlug("b2-curved_horn")!;
        const baseAttack = player1.attackPoints;
        player2.hand.addToHand(curvedHorn);
        game.playCard(player2, 1);
        game.resolveStack(); // add curvedHorn to in play

        const monster = game.monsters[0]!;
        monster.addHealthPoints(10);
        const initialMonsterHealth = monster.currentHealthPoints;

        // Attack monster
        game.attackRoll(player1, monster)
        const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        if (attackRoll) {
            attackRoll.value = 6; // Mock roll
        }
        game.resolveStack();
        game.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack);
    });


    it("b2-xiv_temperance: should choose option 1 (take 1 damage, gain 4 coins)", () => {
            const card = game.decks["loot"]!.getCardFromSlug("b2-xiv_temperance");
            player1.hand.addToHand(card!);
    
            const originalSelect = game.select;
            // Stub select to choose the first option
    
            const beforeHp = player1.currentHealthPoints;
            const beforeCoins = player1.coins;
    
            game.playCard(player1, 1);
            const debugTarget: ChooseOneResult[] = [{ description: "take 1 damage and gain 4¢.", chosenOptions: [] }];
    
            (card as LootCard).debugSetTargets(debugTarget);
            game.resolveStack();
            game.resolveStack();
            game.stack.displayStack();
    
            expect(player1.currentHealthPoints).toBe(beforeHp - 1);
            expect(player1.coins).toBe(beforeCoins + 4);
    
            game.select = originalSelect;
        });
    
});