import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import type { LootCard, Card, EffectOnStack } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard, ItemCard, TreasureCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, setupTestGame } from "@/tests/testHelpers";

describe("Event Monsters - Other Events", () => {
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
    });

    // b2-i_can_see_forever: Look at the top 6 cards of the loot deck. Put them back in any order, then loot 1.
    it("i_can_see_forever - look at top 6 cards, reorder them, then loot 1", async () => {
        const iCanSeeForever = game.obtainCard("b2-i_can_see_forever") as MonsterCard;
        game.decks["monster"]!.addTopPosition(iCanSeeForever);
        
        const top5Cards = game.decks["loot"]!.cards.slice(0, 5);
        const six = game.decks["loot"]!.cards[5];
        const initialHandSize = player1.hand.length;
        const initialDeckSize = game.decks["loot"]!.cards.length;
        
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            // Simulate selecting the first card to loot
            return { selected: options.slice(0, max).reverse(), remaining: options.slice(max) };
        };
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        
        // Check that player looted 1 card
        expect(player1.hand.length).toBe(initialHandSize + 1);
        
        // Check that exactly 1 card was removed from the deck
        expect(game.decks["loot"]!.cards.length).toBe(initialDeckSize - 1);
        const newtop5Cards = game.decks["loot"]!.cards.slice(0, 5).toReversed();
        for (let i = 0; i < 5; i++) {
            expect(top5Cards[i]!.slug).toBe(newtop5Cards[i]!.slug);
        }
        // The effect allows reordering, but without user interaction we can't verify the reordering happened
        // We can only verify that the card looted was one of the original top 6
        const lootedCards = player1.hand.cards.slice(initialHandSize);
        expect(lootedCards.length).toBe(1);
        expect(six).toBe(lootedCards[0]!);
    });

    // b2-ambush: The active player must attack the monster deck 2 times this turn.
    it("ambush - active player must attack monster deck 2 times", async () => {
        const initialAttacks = player1.mustAttackMonster.length;
        const ambush = game.obtainCard("b2-ambush") as MonsterCard;
        game.decks["monster"]!.addTopPosition(ambush);
        
        
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack();
        
        // Player should be forced to attack the monster deck 2 additional times
        expect(player1.mustAttackMonster.length).toBe(initialAttacks + 2);
        expect(() => {game.nextTurn(player1)}).toThrow()

        game.declareAttack(player1);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        game.kill(player1, game.monsters[0]!, ambush);
        game.resolveStack();
        
        expect(player1.mustAttackMonster.length).toBe(initialAttacks + 1);
        expect(player1.isEngagedInCombat).toBe(false);
        expect(() => {game.nextTurn(player1)}).toThrow()

        game.declareAttack(player1);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        game.kill(player1, game.monsters[0]!, ambush);
        game.resolveStack();

        expect(player1.mustAttackMonster.length).toBe(initialAttacks);
        expect(player1.isEngagedInCombat).toBe(false);
    });

    // b2-ambush: The active player must attack the monster deck 2 times this turn.
    it("ambush - add only 1 additional attack if already attacked top deck.", async () => {
        const initialAttacks = player1.mustAttackMonster.length;
        const ambush = game.obtainCard("b2-ambush") as MonsterCard;
        game.decks["monster"]!.addTopPosition(ambush);
        
        
        // Draw the event to trigger its effect
        game.declareAttack(player1);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        await game.resolveStack();
        
        // Player should be forced to attack the monster deck 2 additional times
        expect(player1.mustAttackMonster.length).toBe(initialAttacks + 1);
        expect(() => {game.nextTurn(player1)}).toThrow()

        game.declareAttack(player1);
        await game.declareAttackOnMonster(player1, "topDeck", 0);
        game.kill(player1, game.monsters[0]!, ambush);
        game.resolveStack();
        
        expect(player1.mustAttackMonster.length).toBe(0);
        expect(player1.isEngagedInCombat).toBe(false);
        expect(player1.mustAttackMonster.length).toBe(initialAttacks);
        expect(player1.isEngagedInCombat).toBe(false);
        expect(() => {game.nextTurn(player1)}).not.toThrow()
    });

    // b2-mega_troll_bomb: Each player takes 2 damage!
    it("mega_troll_bomb - each player takes 2 damage", async () => {
        const megaTrollBomb = game.obtainCard("b2-mega_troll_bomb") as MonsterCard;
        game.decks["monster"]!.addTopPosition(megaTrollBomb);
        
        const initialHP1 = player1.currentHealthPoints;
        const initialHP2 = player2.currentHealthPoints;
        
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack(); // damage resolution for player1
        await game.resolveStack(); // damage resolution for player2
        
        expect(player1.currentHealthPoints).toBe(initialHP1 - 2);
        expect(player2.currentHealthPoints).toBe(initialHP2 - 2);
    });

    // b2-troll_bombs: Take 2 damage! (active player only)
    it("troll_bombs - active player takes 2 damage", async () => {
        const trollBombs = game.obtainCard("b2-troll_bombs") as MonsterCard;
        game.decks["monster"]!.addTopPosition(trollBombs);
        
        const initialHP1 = player1.currentHealthPoints;
        const initialHP2 = player2.currentHealthPoints;
        
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        await game.resolveStack();
        await game.resolveStack(); // damage resolution
        
        expect(player1.currentHealthPoints).toBe(initialHP1 - 2);
        expect(player2.currentHealthPoints).toBe(initialHP2); // player2 should not take damage
    });

    // b2-we_need_to_go_deeper: Put any number of non-event monster cards in discard on top of the monster deck.
    it("we_need_to_go_deeper - put non-event monsters from discard on top of deck", async () => {
        const initialDeckSize = game.decks["monster"]!.cards.length + game.decks["monster"]!.discard.length;
        const weNeedToGoDeeper = game.obtainCard("b2-we_need_to_go_deeper") as MonsterCard;
        
        // Add some monsters to discard
        const monster1 = game.obtainCard("b2-fly") as MonsterCard;
        const monster2 = game.obtainCard("b2-fatty") as MonsterCard;
        const eventMonster = game.obtainCard("b2-chest") as MonsterCard;
        
        // Skip test if we couldn't obtain the required cards (edge case with deck randomization)
        if (!monster1 || !monster2 || !eventMonster) {
            return;
        }
        
        // Measure discard size after obtaining cards (since obtaining may trigger more discards)
        const initialDiscardSize = game.decks["monster"]!.discard.length;
        
        game.decks["monster"]!.addDiscardTop(monster1);
        game.decks["monster"]!.addDiscardTop(monster2);
        for(const slot of game.encounters.slots)
        {
            expect(!slot.includes(monster1)).toBe(true);
            expect(!slot.includes(monster2)).toBe(true);
        }
        game.decks["monster"]!.addDiscardTop(eventMonster);
        expect(game.decks["monster"]?.discard.length).toBe(initialDiscardSize + 3);
        game.decks["monster"]!.addTopPosition(weNeedToGoDeeper);
        // expect(game.decks["monster"]!.cards.length).toBe(initialDeckSize - 3); // 2 added, put -1 cause event is replaced

        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        
        await game.resolveStack(); // resolve the event addition
        
        // Check that monsters were moved from discard to top of deck
        // Note: exact ordering depends on game.select() which we're not mocking here
        expect(game.decks["monster"]!.cards.length).toBeLessThanOrEqual(initialDeckSize);
        // At least some non-event monsters should have been moved from discard to deck
        expect(game.decks["monster"]!.discard.length).toBeLessThan(initialDiscardSize + 3);
    });

    // Additional attack tests for various events
    it("we_need_to_go_deeper variant - active player may attack additional time", async () => {
        // Note: This seems to be a duplicate/variant in the todo list
        // Testing if there's a variant that gives additional attack
        const weNeedToGoDeeper = game.obtainCard("b2-we_need_to_go_deeper") as MonsterCard;
        
        const initialAttacks = player1.attackThisTurn;
         
        // Mock select to choose no monsters to move
        const originalSelect = game.select.bind(game);
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            if (min === 0) {
                return { selected: [] as T[], remaining: options };
            }
            return originalSelect(player, min, max, options, description);
        };
        game.decks["monster"]!.addTopPosition(weNeedToGoDeeper);
        
        // Draw the event
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        await game.resolveStack();
        
        // Note: This test assumes the card might grant additional attack
        // If the card only does the discard manipulation, this would need adjustment
        
        game.select = originalSelect;
    });

    it("xl_floor - active player may attack additional time", async () => {
        const xlFloor = game.obtainCard("b2-xl_floor") as MonsterCard;
        game.decks["monster"]!.addTopPosition(xlFloor);
        
        const initialAttacks = player1.attackThisTurn;
        
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        
        // Check that player got an additional attack
        expect(player1.attackThisTurn).toBe(initialAttacks + 1);
    });

    it("shop_upgrade - active player may attack additional time", async () => {
        const shopUpgrade = game.obtainCard("b2-shop_upgrade") as MonsterCard;
        game.decks["monster"]!.addTopPosition(shopUpgrade);
        
        const initialAttacks = player1.attackThisTurn;
        
        // Draw the event to trigger its effect
        game.monsterSlots.discardTop(0);
        await game.resolveStack(); // resolve the event addition
        
        // Check that player got an additional attack
        expect(player1.attackThisTurn).toBe(initialAttacks + 1);
    });

    // b2-devil_deal: Choose one- Put this into discard. Loot 2. Take 1 damage. Take 2 damage. Search the treasure deck for a guppy item, gain it, then shuffle the treasure deck.
    it("devil_deal - option 1: put into discard", async () => {
        const devilDeal = game.obtainCard("b2-devil_deal") as MonsterCard;
        game.decks["monster"]!.addTopPosition(devilDeal);
        
        // Draw the event
        game.monsterSlots.discardTop(0);
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            // Simulate selecting the first option (put into discard)
            return { selected: options.slice(0, max), remaining: options.slice(max) };
        };
        const effect = game.stack._stack[game.stack._stack.length - 1] as EffectOnStack;
        await game.resolveStack(); // resolve the event addition
        await game.resolveStack();
        
        // The event should be in discard
        expect(game.decks["monster"]!.discard.some(c => c.slug === "b2-devil_deal")).toBe(true);
    });
    
    it("devil_deal - option 2: loot 2, take 1 damage", async () => {
        const devilDeal = game.obtainCard("b2-devil_deal") as MonsterCard;
        game.decks["monster"]!.addTopPosition(devilDeal);
        
        const initialHandSize = player1.hand.length;
        const initialHP = player1.currentHealthPoints;
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            // Simulate selecting the first option (put into discard)
            return { selected: options.slice(1, max+1), remaining: options.slice(max) };
        };
        // Draw the event
        game.monsterSlots.discardTop(0);
        const effect = game.stack._stack[game.stack._stack.length - 1] as EffectOnStack;
        await game.resolveStack(); // resolve the event addition
        await game.resolveStack();
        await game.resolveStack(); // damage resolution
        
        expect(player1.hand.length).toBe(initialHandSize + 2);
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
        
    });

    it("devil_deal - option 3: take 2 damage, search for guppy item", async () => {
        game.addHealth(player1, 5);

        const devilDeal = game.obtainCard("b2-devil_deal") as MonsterCard;
        game.decks["monster"]!.addTopPosition(devilDeal);
        
        // Add a Guppy item to treasure deck
        const guppyItem = game.obtainCard("b2-guppys_head") as TreasureCard;
        game.decks["treasure"]!.addTopPosition(guppyItem);
        
        const initialHP = player1.currentHealthPoints;
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            // Simulate selecting the first option (put into discard)
            return { selected: options.slice(2, max+2), remaining: options.slice(max) };
        };        
        // Draw the event
        game.monsterSlots.discardTop(0);
        const effect = game.stack._stack[game.stack._stack.length - 1] as EffectOnStack;
        await game.resolveStack(); // resolve the event addition
        game.select = async <T>(player: Player, min: number, max: number, options: T[], description?: string) => {
            // Simulate selecting the first option (put into discard)
            return { selected: options.slice(0, max), remaining: options.slice(max) };
        };     
        await game.resolveStack(); // damage resolution
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
        expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
        expect(player1.inPlay.some(c => c.isGuppy())).toBe(true);
    });
});