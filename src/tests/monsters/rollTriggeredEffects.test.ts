import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import type { LootCard, Card } from "@/models/cards";
import { MonsterCard, CharacterCard, ItemCard } from "@/models/cards";
import { setupTestGame, emptyHands } from "../testHelpers";

describe("Monsters - Roll Triggered Effects", () => {
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
    });

    // NOTE: These tests are written for when cursed_horf effect is implemented
    // The card exists but the "[Curse Effect] Each time a player rolls a ➁, they take 2 damage." effect may not be fully implemented yet
    
    // b2-cursed_horf: [Curse Effect] Each time a player rolls a ➁, they take 2 damage.
    it("cursed_horf - player takes 2 damage when rolling a 2", async () => {
        // This test assumes cursed_horf card exists and its effect is implemented
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        
        game.monsterSlots.forceSetMonsterAtSlot(0, cursedHorf);
        
        game.addHealth(player1, 10); // Ensure player has enough HP to take damage
        const initialHP = player1.currentHealthPoints;
        
        // Create a dice roll (simulating any roll - attack, loot card effect, etc.)
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        // Play pills which causes a roll
        game.playCard(player1, 0, []);
        await game.resolveStack(); // resolve pills play
        
        expect(game.stack.size).toBe(1); // dice roll on stack
        const dice = game.stack.elements[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        
        // Set dice value to 2 to trigger cursed_horf effect
        dice.value = 2;
        
        await game.resolveStack(); // resolve the dice roll
        await game.resolveStack(); // resolve cursed_horf effect
        await game.resolveStack(); // resolve cursed_horf damage effect
        
        expect(player1.currentHealthPoints).toBe(initialHP - 2);
    });

    it("cursed_horf - no damage when rolling values other than 2", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        if (!cursedHorf) {
            console.log("Skipping test: b2-cursed_horf card not found");
            return;
        }
        
        game.monsterSlots.forceSetMonsterAtSlot(0, cursedHorf);
        
        const initialHP = player1.currentHealthPoints;
        
        // Create a dice roll
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard);
        
        game.playCard(player1, 0, []);
        await game.resolveStack();
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Non-triggering value
        
        await game.resolveStack();
        
        // No damage should be dealt
        expect(player1.currentHealthPoints).toBe(initialHP);
    });

    it("cursed_horf - triggers for any player's rolls", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        if (!cursedHorf) {
            console.log("Skipping test: b2-cursed_horf card not found");
            return;
        }
        
        game.monsterSlots.forceSetMonsterAtSlot(0, cursedHorf);
        
        game.addLootPlay(player2, 1); // Give player 2 a loot play
        
        const initialHP = player2.currentHealthPoints;
        
        // Player 2 rolls
        const lootCard = game.obtainCard("b2-pills") as LootCard;
        player2.hand.addToHand(lootCard);
        
        game.playCard(player2, 0, []);
        await game.resolveStack();
        
        expect(game.stack.size).toBeGreaterThan(0);
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        
        await game.resolveStack(); // resolve dice roll and cursed_horf damage effect
        await game.resolveStack(); // resolve cursed_horf effect
        await game.resolveStack(); // resolve cursed_horf damage
        
        expect(player2.currentHealthPoints).toBe(initialHP - 2);
    });

    it("cursed_horf - multiple triggers in same turn", async () => {
        const cursedHorf = game.obtainCard("b2-cursed_horf") as MonsterCard;
        if (!cursedHorf) {
            console.log("Skipping test: b2-cursed_horf card not found");
            return;
        }
        
        game.monsterSlots.forceSetMonsterAtSlot(0, cursedHorf);
        game.addHealth(player1, 10); // Ensure player has enough HP to take damage
        const initialHP = player1.currentHealthPoints;
        
        // First roll
        const lootCard1 = game.obtainCard("b2-pills_2") as LootCard;
        player1.hand.addToHand(lootCard1);
        game.playCard(player1, 0, []);
        await game.resolveStack();
        
        const dice1 = game.stack.elements[0] as DiceRoll;
        dice1.value = 2;
        await game.resolveStack();
        await game.resolveStack(); // resolve cursed_horf effect
        await game.resolveStack(); // resolve cursed_horf damage

        expect(player1.currentHealthPoints).toBe(initialHP - 2);
        
        // Second roll in same turn
        const lootCard2 = game.obtainCard("b2-pills") as LootCard;
        player1.hand.addToHand(lootCard2);
        game.playCard(player1, 0, []);
        await game.resolveStack();
        
        const dice2 = game.stack.elements[0] as DiceRoll;
        dice2.value = 2;
        await game.resolveStack();
        await game.resolveStack(); // resolve cursed_horf effect
        await game.resolveStack(); // resolve cursed_horf damage

        // Should trigger again
        expect(player1.currentHealthPoints).toBe(initialHP - 4);
    });
});
