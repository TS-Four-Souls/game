import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/entities/player";
import { type DetailedState, Team } from "@/shared/api";
import { setTimeout } from "timers/promises";
import { TargetBuilder } from "@/models/targetBuilder";

describe("Game Selection System", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(async () => {
        game = new Game();
        game.cardHandler.setupDecks();
        const chara = [{issuer: "Player 1", character: "b2-isaac", team: Team.Team1}, {issuer: "Player 2", character: "b2-judas", team: Team.Team2}, {issuer: "Player 3", character: "b2-samson", team: Team.Team3}];
        await game.start(chara, false);
        player1 = game.players[0]!;
        player2 = game.players[1]!;
        player3 = game.players[2]!;
    });

    it("select() creates a pending selection with correct data", async () => {
        const options = ["option1", "option2", "option3", "option4"];
        const count = 2;
        
        // Start selection (don't await yet)
        const selectionPromise = game.select(player1, count, count, options);
        
        // Check that pending selection was created via state JSON
        const state = game.detailedStateJSON(player1);
        expect(state.me.pendingSelection).toBeDefined();
        expect(state.me.pendingSelection!.min).toBe(count);
        expect(state.me.pendingSelection!.max).toBe(count);
        expect(state.me.pendingSelection!.requestId).toBeDefined();
        expect(state.me.pendingSelection!.options).toHaveLength(options.length);
        
        // Resolve manually to avoid hanging
        const requestId = state.me.pendingSelection!.requestId;
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[1]!]
        );
        
        const result = await selectionPromise;
        expect(result.selected).toEqual(["option1", "option2"]);
        expect(result.remaining).toEqual(["option3", "option4"]);
    });

    it("pending selection appears in detailedStateJSON for requesting player only", async () => {
        const options = ["option1", "option2", "option3"];
        const count = 1;
        
        // Start selection for player1
        const selectionPromise = game.select(player1, count, count, options);
        
        // Get state for player1
        const state1Str: DetailedState = game.detailedStateJSON(player1);
        const state1: DetailedState = state1Str;
        
        // Player1 should see the pending selection
        expect(state1.me.pendingSelection).toBeDefined();
        expect(state1.me.pendingSelection?.options).toEqual(TargetBuilder.convertToSelectionItems(options));
        expect(state1.me.pendingSelection?.min).toBe(count);
        expect(state1.me.pendingSelection?.max).toBe(count);
        expect(state1.me.pendingSelection?.requestId).toBeDefined();
        
        // Get state for player2
        const state2Str = game.detailedStateJSON(player2);
        const state2: DetailedState = state2Str;
        
        // Player2 should NOT see the pending selection
        expect(state2.me.pendingSelection).toBeUndefined();
        
        // Get state for player3
        const state3Str = game.detailedStateJSON(player3);
        const state3: DetailedState = state3Str;
        
        // Player3 should NOT see the pending selection
        expect(state3.me.pendingSelection).toBeUndefined();
        
        // Clean up
        const requestId = state1.me.pendingSelection!.requestId;
        game.submitSelection(
            player1,
            requestId,
            [state1.me.pendingSelection!.options[0]!]
        );
        await selectionPromise;
    });

    it("submitSelection resolves the promise with correct values", async () => {
        const options = ["red", "blue", "green", "yellow"];
        const count = 2;
        
        const selectionPromise = game.select(player1, count, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Submit selection
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[1]!, state.me.pendingSelection!.options[3]!] // Select "blue" and "yellow"
        );
        
        const result = await selectionPromise;
        expect(result.selected).toEqual(["blue", "yellow"]);
        expect(result.remaining).toEqual(["red", "green"]);
    });

    it("submitSelection clears pending selection after resolution", async () => {
        const options = ["a", "b", "c"];
        const count = 1;
        
        const selectionPromise = game.select(player1, count, count, options);
        const stateBefore = game.detailedStateJSON(player1);
        const requestId = stateBefore.me.pendingSelection!.requestId;
        
        expect(stateBefore.me.pendingSelection).toBeDefined();
        
        game.submitSelection(
            player1,
            requestId,
            [stateBefore.me.pendingSelection!.options[2]!]
        );
        
        await selectionPromise;
        
        // Pending selection should be cleared
        const stateAfter = game.detailedStateJSON(player1);
        expect(stateAfter.me.pendingSelection).toBeUndefined();
    });

    it("submitSelection validates player identity", async () => {
        const options = ["option1", "option2"];
        const count = 1;
        
        const selectionPromise = game.select(player1, count, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Try to submit as different player
        expect(() => {
            game.submitSelection(
                player2,
                requestId,
                TargetBuilder.convertToSelectionItems(["wrong-identifier"]) // This should fail before identifier validation
            );
        }).toThrow("No pending selection found for this request ID");
        
        // Clean up
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!]
        );
        await selectionPromise;
    });

    it("submitSelection validates requestId", async () => {
        const options = ["option1", "option2"];
        const count = 1;
        
        const selectionPromise = game.select(player1, count, count, options);
        
        // Try with wrong requestId
        expect(() => {
            game.submitSelection(
                player1,
                "wrong-request-id",
                TargetBuilder.convertToSelectionItems(["any-identifier"]) // This should fail before identifier validation
            );
        }).toThrow("No pending selection found for this request ID");
        
        // Clean up
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!]
        );
        await selectionPromise;
    });

    it("submitSelection validates exact selection count when asMany is false", async () => {
        const options = ["option1", "option2", "option3"];
        const count = 2;
        
        const selectionPromise = game.select(player1, count, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Try with too few selections
        expect(() => {
            game.submitSelection(
                player1,
                requestId,
                [state.me.pendingSelection!.options[0]!]
            );
        }).toThrow("Must select exactly 2 option(s)");
        
        // Try with too many selections
        expect(() => {
            game.submitSelection(
                player1,
                requestId,
                [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[1]!, state.me.pendingSelection!.options[2]!]
            );
        }).toThrow("Must select exactly 2 option(s)");
        
        // Clean up with correct count
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[1]!]
        );
        await selectionPromise;
    });

    it("submitSelection allows variable count when asMany is true", async () => {
        const options = ["option1", "option2", "option3", "option4"];
        const count = 3;
        
        // Select with asMany = true
        const selectionPromise = game.select(player1, 0, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Should allow selecting fewer than count
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[1]!] // Only 1 selection out of max 3
        );
        
        const result = await selectionPromise;
        expect(result.selected).toEqual(["option2"]);
        expect(result.remaining).toEqual(["option1", "option3", "option4"]);
    });

    it("submitSelection validates max count when asMany is true", async () => {
        const options = ["option1", "option2", "option3"];
        const count = 2;
        
        const selectionPromise = game.select(player1, 0, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Try with too many selections
        expect(() => {
            game.submitSelection(
                player1,
                requestId,
                [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[1]!, state.me.pendingSelection!.options[2]!]
            );
        }).toThrow("Must select at most 2 option(s)");
        
        // Clean up with valid count
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[1]!]
        );
        await selectionPromise;
    });

    it("submitSelection allows zero selections when asMany is true", async () => {
        const options = ["option1", "option2"];
        const count = 2;
        
        const selectionPromise = game.select(player1, 0, count, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        // Should allow selecting 0
        game.submitSelection(
            player1,
            requestId,
            []
        );
        
        const result = await selectionPromise;
        expect(result.selected).toEqual([]);
        expect(result.remaining).toEqual(["option1", "option2"]);
    });

    it("state change is triggered when selection is created", async () => {
        let stateChangeCount = 0;
        const listener = () => {
            stateChangeCount++;
        };
        
        game.onStateChange.add(listener);
        
        const initialCount = stateChangeCount;
        const options = ["option1", "option2"];
        const selectionPromise = game.select(player1, 1, 1, options);
        
        await setTimeout(10); // slight delay to ensure state is updated before clients fetch it
        
        // State change should have been triggered
        expect(stateChangeCount).toBeGreaterThan(initialCount);
        
        // Clean up
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!]
        );
        await selectionPromise;
        game.onStateChange.remove(listener);
    });

    it("multiple sequential selections work correctly", async () => {
        // First selection
        const options1 = ["a", "b", "c"];
        const promise1 = game.select(player1, 1, 1, options1);
        const state1 = game.detailedStateJSON(player1);
        const requestId1 = state1.me.pendingSelection!.requestId;
        
        game.submitSelection(
            player1,
            requestId1,
            [state1.me.pendingSelection!.options[1]!]
        );
        const result1 = await promise1;
        expect(result1.selected).toEqual(["b"]);
        
        // Second selection (different player)
        const options2 = ["x", "y", "z"];
        const promise2 = game.select(player2, 2, 2, options2);
        const state2 = game.detailedStateJSON(player2);
        const requestId2 = state2.me.pendingSelection!.requestId;
        
        game.submitSelection(
            player2,
            requestId2,
            [state2.me.pendingSelection!.options[0]!, state2.me.pendingSelection!.options[2]!]
        );
        const result2 = await promise2;
        expect(result2.selected).toEqual(["x", "z"]);
        
        // Third selection (back to player1)
        const options3 = ["red", "green"];
        const promise3 = game.select(player1, 1, 1, options3);
        const state3 = game.detailedStateJSON(player1);
        const requestId3 = state3.me.pendingSelection!.requestId;
        
        game.submitSelection(
            player1,
            requestId3,
            [state3.me.pendingSelection!.options[0]!]
        );
        const result3 = await promise3;
        expect(result3.selected).toEqual(["red"]);
    });

    it("pending selection is removed from state after submission", async () => {
        const options = ["option1", "option2"];
        const selectionPromise = game.select(player1, 1, 1, options);
        
        // Check state has pending selection
        const stateBefore = game.detailedStateJSON(player1);
        expect(stateBefore.me.pendingSelection).toBeDefined();
        
        // Submit selection
        const requestId = stateBefore.me.pendingSelection!.requestId;
        game.submitSelection(
            player1,
            requestId,
            [stateBefore.me.pendingSelection!.options[0]!]
        );
        await selectionPromise;
        
        // Check state no longer has pending selection
        const stateAfter = game.detailedStateJSON(player1);
        expect(stateAfter.me.pendingSelection).toBeUndefined();
    });

    it("handles selection with object options correctly", async () => {
        const card1 = game.decks.loot.draw();
        expect(card1).toBeDefined();
        const card2 = game.decks.loot.draw();
        expect(card2).toBeDefined();
        const card3 = game.decks.loot.draw();
        expect(card3).toBeDefined();
        const options = [card1, card2, card3];
        const selectionPromise = game.select(player1, 2, 2, options);
        const state = game.detailedStateJSON(player1);
        const requestId = state.me.pendingSelection!.requestId;
        
        game.submitSelection(
            player1,
            requestId,
            [state.me.pendingSelection!.options[0]!, state.me.pendingSelection!.options[2]!]
        );
        
        const result = await selectionPromise;
        expect(result.selected).toEqual([card1, card3]);
        expect(result.remaining).toEqual([card2]);
    });

    it("throws error when submitting without pending selection", () => {
        expect(() => {
            game.submitSelection(
                player1,
                "any-request-id",
                [{type:"string", payload: "any-identifier"}]
            );
        }).toThrow("No pending selection found for this request ID");
    });

    it("requestId is unique for each selection", async () => {
        const options = ["a", "b"];
        
        // First selection
        const promise1 = game.select(player1, 1, 1, options);
        const state1 = game.detailedStateJSON(player1);
        const requestId1 = state1.me.pendingSelection!.requestId;
        game.submitSelection(player1, requestId1, 
            [state1.me.pendingSelection!.options[0]!]);
        await promise1;
        
        // Second selection
        const promise2 = game.select(player1, 1, 1, options);
        const state2 = game.detailedStateJSON(player1);
        const requestId2 = state2.me.pendingSelection!.requestId;
        
        // RequestIds should be different
        expect(requestId1).not.toBe(requestId2);
        
        // Clean up
        game.submitSelection(player1, requestId2, [state2.me.pendingSelection!.options[1]!]);
        await promise2;
    });
});
