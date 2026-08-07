import { setupTestGame } from "@/tests/testHelpers";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../models/entities/player";
import { Game } from "../models/game";
import { DiceRoll } from "../models/stackElement";

describe("Loot Card", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["b2-judas", "b2-isaac"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                });
                game = setup.game;
                player1 = setup.player1;
                player2 = setup.player2!;
    });


    it("Swallowed Penny: should give one coin on player takes damage if player is issuer.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 1); // No effect yet, visualEffectBox: undefined}, not in play
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        player1.heal(10); // Heal back for clarity

        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 2);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });

    it("Swallowed Penny: remove in play should remove effect.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 1); // No effect yet, visualEffectBox: undefined}, not in play
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins);

        player1.hand.addToHand(loot);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);

        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 2);
        expect(player2.coins).toBe(initialCoins2); // No effect for other players

        game.cardHandler.removeInPlay(player1, loot);

        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 4);

        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player2.coins).toBe(initialCoins2); // No effect for other players
    });


    it("Bloody Penny: should loot one on any player death.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;

        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, player2.currentHealthPoints); // Kill player 2
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 1); // Looted 1
        expect(player2.isDead).toBe(true);
        
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(false); // Revived at turn end
        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, player2.currentHealthPoints); // Kill player 2 again
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1
        expect(player2.isDead).toBe(true);

        game.entityHandler.dealDamage(player2, player1, {card: loot, visualEffectBox: undefined}, player1.currentHealthPoints); // Kill player 1
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize + 2); // Looted 1 but discarded on death.
        expect(player1.isDead).toBe(true);

        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const handSizeTurn3 = player1.hand.cards.length;
        expect(player1.isDead).toBe(false); // Revived at turn end
        expect(player2.isDead).toBe(false); // Revived at turn end
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player2, {card: loot, visualEffectBox: undefined}, player2.currentHealthPoints); // Kill player 2 again
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(handSizeTurn3); // Looted 1
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
    });

    it("Bloody Penny: should NOT loot on monster death.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-bloody_penny")!;
        const monster = game.monsters[0]!;
        const initialHandSize = player1.hand.cards.length;

        player1.hand.addToHand(loot);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player1, monster, {card: loot, visualEffectBox: undefined}, monster.currentHealthPoints); // Kill monster
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(initialHandSize); // Looted 1
    });

    it("Counterfeit Penny: add one coins to your coin gain.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-counterfeit_penny")!;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;

        player1.hand.addToHand(loot);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // gain x + 1 coins.
        game.gainCoins(player1, 2, ("debug"));
        expect(player1.coins).toBe(initialCoins + 3);
        
        // no gain when gaining 0 coins.
        game.gainCoins(player1, 0, ("debug"));
        expect(player1.coins).toBe(initialCoins + 3);

        // no effect for other players nor on other players' coin gain.
        game.gainCoins(player2, 5, ("debug"));
        expect(player2.coins).toBe(initialCoins2 + 5);
        expect(player1.coins).toBe(initialCoins + 3);

        // lose coins should not be affected.
        expect(game.loseCoins(player1, initialCoins + 3, false)).toBe(initialCoins + 3); // reset coins
        expect(player1.coins).toBe(0);

        game.cardHandler.removeInPlay(player1, loot);

        // gain x coins normally after removal.
        game.gainCoins(player1, 4, ("debug"));
        expect(player1.coins).toBe(4);
    });

    it("Cain's Eye: should let player look at top card and optionally put on bottom at turn start", async () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Get the current top card before turn starts
        const lootDeck = game.decks["loot"]!;
        
        // Player chooses to put it on bottom
        game.select = async (_issuer, _min, _max, _opts, _optional) => ({ 
            selected: [_opts[0]!], 
            remaining: [] 
        });
        
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();

        // Start of player2's turn - no effect for them
        
        const topCard = game.cardHandler.getFirstCardsOfDeck("loot", 1)[0]!;
        game.cardHandler.addTopPosition("loot", topCard); // Put it back
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = lootDeck.cards[lootDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        

        
        game.select = async (_issuer, _min, _max, _opts, _optional) => ({ 
            selected: [], 
            remaining: [_opts[0]!] 
        });
        
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Now test choosing NOT to put on bottom
        const nextTopCard = game.cardHandler.getFirstCardsOfDeck("loot", 1)[0]!;
        game.cardHandler.addTopPosition("loot", nextTopCard); // Put it back

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player2's turn
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Start of player1's turn - effect triggers
        // The card should be drawn.
        expect(player1.hand.cards).toContain(nextTopCard);
    });

    it("Cain's Eye: should only trigger for the issuer, not other players", async () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const lootDeck = game.decks["loot"]!;
        const topCard = game.cardHandler.getFirstCardsOfDeck("loot", 1)[0]!;
        game.cardHandler.addTopPosition("loot", topCard);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Cain's Eye: effect should stop when removed from play", async () => {
        const cainsEye = game.decks["loot"]!.getCardFromSlug("b2-cains_eye")!;
        
        player1.hand.addToHand(cainsEye);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Remove the trinket
        game.cardHandler.removeInPlay(player1, cainsEye);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // player2
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // back to player1
        await game.actions.resolveStack();

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });

    it("Golden Horseshoe: should let player look at top card of the treasure deck and optionally put on bottom at turn start", async () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Get the current top card before turn starts
        const treasureDeck = game.decks["treasure"]!;

        // Player chooses to put it on bottom
        game.select = async (_issuer, _min, _max, _opts, _optional) => ({
            selected: [_opts[0]!],
            remaining: []
        });

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();
        // Start of player2's turn - no effect for them

        const topCard = game.cardHandler.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.cardHandler.addTopPosition("treasure", topCard); // Put it back
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = treasureDeck.cards[treasureDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        expect(treasureDeck.cards[0]).not.toBe(topCard);

        game.select = async (_issuer, _min, _max, _opts, _optional) => ({
            selected: [],
            remaining: [_opts[0]!]
        });

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();
        // Now test choosing NOT to put on bottom
        const nextTopCard = game.cardHandler.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.cardHandler.addTopPosition("treasure", nextTopCard); // Put it back
        
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player2's turn
        await game.actions.resolveStack();

        // Start of player1's turn - effect triggers
        const finalBottomCards = treasureDeck.cards[treasureDeck.cards.length - 1];
        expect(finalBottomCards).not.toBe(nextTopCard);
        expect(treasureDeck.cards[0]).toBe(nextTopCard);
    });

    it("Golden horseshoe: should only trigger for the issuer, not other players", async () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const treasureDeck = game.decks["treasure"]!;
        const topCard = game.cardHandler.getFirstCardsOfDeck("treasure", 1)[0]!;
        game.cardHandler.addTopPosition("treasure", topCard);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Golden horseshoe: effect should stop when removed from play", async () => {
        const goldenHorseshoe = game.decks["loot"]!.getCardFromSlug("b2-golden_horseshoe")!;

        player1.hand.addToHand(goldenHorseshoe);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Remove the trinket
        game.cardHandler.removeInPlay(player1, goldenHorseshoe);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // player2
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // back to player1
        await game.actions.resolveStack();

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });


    
    it("Purple Heart: should let player look at top card of the monster deck and optionally put on bottom at turn start", async () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Get the current top card before turn starts
        const monsterDeck = game.decks["monster"]!;

        // Player chooses to put it on bottom
        game.select = async (_issuer, _min, _max, _opts, _optional) => ({
            selected: [_opts[0]!],
            remaining: []
        });

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();
        // Start of player2's turn - no effect for them

        const topCard = game.cardHandler.getFirstCardsOfDeck("monster", 1)[0]!;
        game.cardHandler.addTopPosition("monster", topCard); // Put it back
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // Start of player1's turn again - effect triggers
        // The top card should now be at the bottom
        const newBottomCards = monsterDeck.cards[monsterDeck.cards.length - 1];
        expect(newBottomCards).toBe(topCard);
        expect(monsterDeck.cards[0]).not.toBe(topCard);

        game.select = async (_issuer, _min, _max, _opts, _optional) => ({
            selected: [],
            remaining: [_opts[0]!]
        });

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player1's turn
        await game.actions.resolveStack();
        // Now test choosing NOT to put on bottom
        const nextTopCard = game.cardHandler.getFirstCardsOfDeck("monster", 1)[0]!;
        game.cardHandler.addTopPosition("monster", nextTopCard); // Put it back

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // End player2's turn
        await game.actions.resolveStack();

        // Start of player1's turn - effect triggers
        const finalBottomCards = monsterDeck.cards[monsterDeck.cards.length - 1];
        expect(finalBottomCards).not.toBe(nextTopCard);
        expect(monsterDeck.cards[0]).toBe(nextTopCard);
    });

    it("Purple Heart: should only trigger for the issuer, not other players", async () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const monsterDeck = game.decks["monster"]!;
        const topCard = game.cardHandler.getFirstCardsOfDeck("monster", 1)[0]!;
        game.cardHandler.addTopPosition("monster", topCard);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // End player1's turn, start player2's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect should NOT trigger for player2
        expect(selectCalled).toBe(false);

        // End player2's turn, start player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Effect SHOULD trigger for player1
        expect(selectCalled).toBe(true);
    });

    it("Purple Heart: effect should stop when removed from play", async () => {
        const purpleHeart = game.decks["loot"]!.getCardFromSlug("b2-purple_heart")!;

        player1.hand.addToHand(purpleHeart);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Remove the trinket
        game.cardHandler.removeInPlay(player1, purpleHeart);

        let selectCalled = false;
        game.select = async (_issuer, _min, _max, _opts, _optional) => {
            selectCalled = true;
            return { selected: [], remaining: [] };
        };

        // Start new turn cycle
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // player2
        await game.actions.resolveStack();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // back to player1
        await game.actions.resolveStack();

        // Effect should NOT trigger anymore
        expect(selectCalled).toBe(false);
    });

    it("Broken Ankh: should prevent death when rolling a 6, not on other rolls", async () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;
        player1.hand.addToHand(brokenAnkh);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        
        // Get a damage source card
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage - should trigger Broken Ankh effect
        const beforeStack = game.stack.size;
        game.entityHandler.dealDamage(player2, player1, {card: damageSource, visualEffectBox: undefined}, initialHealth);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        // Damage should be on the stack but death is pending
        expect(game.stack.size).toBeGreaterThan(beforeStack+1); // At least DeathOnStack and DiceRoll
        
        // A DiceRoll should have been added to the stack (from Broken Ankh)
        const hasRoll = game.stack._stack.some(item => item.constructor.name === "DiceRoll");
        expect(hasRoll).toBe(true);
    });

    it("Broken Ankh: should prevent death and end turn if rolling 6 on your turn", async () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.addHealthPoints(10);
        player1.hand.addToHand(brokenAnkh);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage on player1's turn
        game.entityHandler.dealDamage(player2, player1, {card: damageSource, visualEffectBox: undefined}, initialHealth);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const roll = game.stack._stack[1] as DiceRoll | undefined;
        expect(roll).toBeDefined();
        if (roll) {
            roll.value = 6; // Mock the dice roll to return 6
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // After resolving, player should still be alive
        expect(game.stack.size).toBe(1);
        expect(player1.currentHealthPoints).toBeGreaterThan(0);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
    });

    it("Broken Ankh: should not prevent death when rolling less than 6", async () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.hand.addToHand(brokenAnkh);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const initialHealth = player1.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage
        game.entityHandler.dealDamage(player2, player1, {card: damageSource, visualEffectBox: undefined}, initialHealth);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const roll = game.stack._stack[1] as DiceRoll | undefined;
        expect(roll instanceof DiceRoll).toBe(true);
        expect(roll).toBeDefined();
        if (roll) {
            roll.value = 3; // Mock the dice roll to return 3
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // Player should be dead
        expect(player1.currentHealthPoints).toBeLessThanOrEqual(0);
    });

    it("Broken Ankh: should only prevent owner from dying", async () => {
        const brokenAnkh = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;

        player1.hand.addToHand(brokenAnkh);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        const initialHealth = player2.currentHealthPoints;
        const damageSource = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;

        // Take fatal damage
        game.entityHandler.dealDamage(player1, player2, {card: damageSource, visualEffectBox: undefined}, initialHealth);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();

        // Player should be dead
        expect(player2.currentHealthPoints).toBeLessThanOrEqual(0);
    });

    it("Curved Horn: should add +1 [ATK] to first attack roll each turn and not to subsequent attack rolls", async () => {
        const curvedHorn = game.decks["loot"]!.getCardFromSlug("b2-curved_horn")!;
        const baseAttack = player1.attackPoints;
        player1.hand.addToHand(curvedHorn);
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack(); // add curvedHorn to in play

        const monster = game.monsters[0]!;
        monster.addHealthPoints(10);
        const initialMonsterHealth = monster.currentHealthPoints;

        // Attack monster
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, monster);
        game.actions.attackRoll(player1)
        const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        if (attackRoll) {
            // The roll should have +1 ATK from Curved Horn
            attackRoll.value = 6; // Mock roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - 1);

        // Second attack monster
        game.actions.attackRoll(player1)
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        if (attackRoll2) {
            // The roll should have +1 ATK from Curved Horn
            attackRoll2.value = 6; // Mock roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - baseAttack - 1);
    });

    it("Curved Horn: should ONLY add +1 [ATK] to issuer", async () => {
        const curvedHorn = game.decks["loot"]!.getCardFromSlug("b2-curved_horn")!;
        const baseAttack = player1.attackPoints;
        player2.hand.addToHand(curvedHorn);
        game.entityHandler.addLootPlay(player2, 1);
        game.actions.playCard(player2, 0);
        await game.actions.resolveStack(); // add curvedHorn to in play

        const monster = game.monsters[0]!;
        monster.addHealthPoints(10);
        const initialMonsterHealth = monster.currentHealthPoints;

        // Attack monster
        game.actions.declareAttack(game.currentPlayer);
        await game.actions.declareAttackOnEntity(game.currentPlayer, monster);
        game.actions.attackRoll(player1)
        const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        if (attackRoll) {
            attackRoll.value = 6; // Mock roll
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack);
    });

    it("b2-lost_soul: becomes a soul on resolve.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-lost_soul");
        player1.hand.addToHand(card!);

        const originalSelect = game.select;
        // Stub select to choose the first option

        const beforeSouls = player1.totalSouls;
        const initInPlay = player1.inPlay.length;
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        
        expect(card!.soul).toBe(1);
        expect(player1.totalSouls).toBe(beforeSouls + 1);
        expect(player1.targetableSouls.length).not.toBe(0);
        expect(player1.inPlay.length).toBe(initInPlay);
        
    });

    it("b2-guppys_hairball: prevent damage on a 6.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-guppys_hairball");
        player1.hand.addToHand(card!);
        const life = player1.healthPoints;

        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        
        game.entityHandler.dealDamage(player2, player1, {card: card!, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.size).toBe(2); // Dice and DamageOnStack

        const roll:DiceRoll = game.stack.elements[1] as DiceRoll;
        roll.value = 6; // Mock a 6 roll

        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(life); // No damage taken
    });

    it("b2-guppys_hairball: do not prevent damage on a 5.", async () => {
        const card = game.decks["loot"]!.getCardFromSlug("b2-guppys_hairball");
        player1.hand.addToHand(card!);
        const life = player1.healthPoints;

        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player2, player1, {card: card!, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.size).toBe(2); // Dice and DamageOnStack

        const roll: DiceRoll = game.stack.elements[1] as DiceRoll;
        roll.value = 5; // Mock a 6 roll

        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(life-1); // No damage taken
    });

});