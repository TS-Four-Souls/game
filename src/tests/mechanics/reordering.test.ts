import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "@/models/game";
import { Player } from "@/models/entities/player";
import { EffectOnStack, EffectData, type TreasureCard } from "@/models/cards";
import { setupTestGame } from "@/tests/testHelpers";

describe("Treasure - \"at the end of your turn\" effects", () => {
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

        const treas1 = game.obtainCard("b2-goat_head")! as TreasureCard;
        const treas2 = game.obtainCard("b2-the_blue_map")! as TreasureCard;
        const treas3 = game.obtainCard("b2-the_map")! as TreasureCard;
        game.cardHandler.addInPlay(player1, treas1);
        game.cardHandler.addInPlay(player1, treas2);
        game.cardHandler.addInPlay(player1, treas3);
    });

    function triggerEndTurnEffects() {
        game.emit("on:turn:end", { eventIssuer: player1 });
    }

    function getReorderableEffectsByOwner(ownerId: string) {
        return game.stack.elements.filter(
            (el) => el.json.type === "effect" && el.reordering?.ownerId === ownerId,
        );
    }

    function getEffectIdsForGroup(groupId: string): number[] {
        return game.stack.elements
            .filter((el) => el.reordering?.groupId === groupId)
            .map((el) => el.stackId);
    }

    it("player can reorder their effects", async () => {
        triggerEndTurnEffects();

        const playerEffects = getReorderableEffectsByOwner(player1.id);
        expect(playerEffects.length).toBeGreaterThanOrEqual(2);

        const groupId = playerEffects[0]!.reordering!.groupId;
        const groupIds = playerEffects.map((el) => el.reordering!.groupId);
        expect(groupIds.every((id) => id === groupId)).toBe(true);

        const beforeOrder = getEffectIdsForGroup(groupId);
        game.insertStackElementBefore(player1, beforeOrder[beforeOrder.length - 1]!, beforeOrder[0]!);
        const afterOrder = getEffectIdsForGroup(groupId);

        expect(afterOrder[0]).toBe(beforeOrder[beforeOrder.length - 1]);
    });

    it("Other players can not reorder effects that are not theirs", async () => {
        triggerEndTurnEffects();

        const playerEffects = getReorderableEffectsByOwner(player1.id);
        expect(playerEffects.length).toBeGreaterThanOrEqual(2);

        const groupId = playerEffects[0]!.reordering!.groupId;
        const beforeOrder = getEffectIdsForGroup(groupId);

        expect(() => {
            game.insertStackElementBefore(player2, beforeOrder[beforeOrder.length - 1]!, beforeOrder[0]!);
        }).toThrow("You are not allowed to reorder this trigger group.");
    });

    it("Current active player can reorder game effects", async () => {
        const monsterIssuer = game.monsters[0]!;
        const makeGameEffect = (label: string) => {
            return new EffectOnStack(
                () => true,
                new EffectData(monsterIssuer.card, () => monsterIssuer, []),
                label,
            );
        };

        game.emitter.on("on:turn:end", () => {
            game.addToStack(makeGameEffect("game-A"));
        });
        game.emitter.on("on:turn:end", () => {
            game.addToStack(makeGameEffect("game-B"));
        });

        triggerEndTurnEffects();

        const gameEffects = game.stack.elements.filter(
            (el) => el.json.type === "effect" && el.reordering?.groupId.endsWith(":game"),
        );
        expect(gameEffects.length).toBeGreaterThanOrEqual(2);

        const groupId = gameEffects[0]!.reordering!.groupId;
        const beforeOrder = getEffectIdsForGroup(groupId);

        game.insertStackElementBefore(player1, beforeOrder[beforeOrder.length - 1]!, beforeOrder[0]!);
        const afterOrder = getEffectIdsForGroup(groupId);

        expect(afterOrder[0]).toBe(beforeOrder[beforeOrder.length - 1]);
    });

    it("Multiple reordering can happen", async () => {
        const monsterIssuer = game.monsters[0]!;
        game.emitter.on("on:turn:end", () => {
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-C"));
        });
        game.emitter.on("on:turn:end", () => {
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-D"));
        });

        triggerEndTurnEffects();

        const playerGroup = getReorderableEffectsByOwner(player1.id).find((el) => !el.reordering!.groupId.endsWith(":game"))?.reordering?.groupId;
        const gameGroup = game.stack.elements.find((el) => el.reordering?.groupId.endsWith(":game"))?.reordering?.groupId;

        expect(playerGroup).toBeDefined();
        expect(gameGroup).toBeDefined();

        const beforePlayer = getEffectIdsForGroup(playerGroup!);
        const beforeGame = getEffectIdsForGroup(gameGroup!);

        game.insertStackElementBefore(player1, beforePlayer[beforePlayer.length - 1]!, beforePlayer[0]!);
        game.insertStackElementBefore(player1, beforeGame[beforeGame.length - 1]!, beforeGame[0]!);

        const afterPlayer = getEffectIdsForGroup(playerGroup!);
        const afterGame = getEffectIdsForGroup(gameGroup!);

        expect(afterPlayer[0]).toBe(beforePlayer[beforePlayer.length - 1]);
        expect(afterGame[0]).toBe(beforeGame[beforeGame.length - 1]);
    });

    it("Reordering is remembered next turn", async () => {
        const monsterIssuer = game.monsters[0]!;
        const emittedOrder: string[] = [];

        game.emitter.on("on:turn:end", () => {
            emittedOrder.push("game-A");
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-A"));
        });
        game.emitter.on("on:turn:end", () => {
            emittedOrder.push("game-B");
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-B"));
        });

        triggerEndTurnEffects();
        const gameGroup = game.stack.elements.find((el) => el.reordering?.groupId.endsWith(":game"))?.reordering?.groupId;
        expect(gameGroup).toBeDefined();

        const beforeOrder = getEffectIdsForGroup(gameGroup!);
        game.insertStackElementBefore(player1, beforeOrder[beforeOrder.length - 1]!, beforeOrder[0]!);

        // Clear stack without resolving to keep focus on ordering-memory behavior.
        game.resetStack();
        emittedOrder.length = 0;

        triggerEndTurnEffects();

        // Listener execution order should now be remembered as the reordered one.
        expect(emittedOrder.slice(-2)).toEqual(["game-B", "game-A"]);
    });

    it("Reordering is remembered even with nested emits inside listeners", async () => {
        const monsterIssuer = game.monsters[0]!;
        const emittedOrder: string[] = [];

        game.emitter.on("on:turn:end", () => {
            // Nested emit should not erase outer emission context.
            game.emitter.emit("on:turn:start", { eventIssuer: player1 });
            emittedOrder.push("game-A");
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-A"));
        });
        game.emitter.on("on:turn:end", () => {
            game.emitter.emit("on:turn:start", { eventIssuer: player1 });
            emittedOrder.push("game-B");
            game.addToStack(new EffectOnStack(() => true, new EffectData(monsterIssuer.card, () => monsterIssuer, []), "game-B"));
        });

        triggerEndTurnEffects();
        const gameGroup = game.stack.elements.find((el) => el.reordering?.groupId.endsWith(":game"))?.reordering?.groupId;
        expect(gameGroup).toBeDefined();

        const beforeOrder = getEffectIdsForGroup(gameGroup!);
        game.insertStackElementBefore(player1, beforeOrder[beforeOrder.length - 1]!, beforeOrder[0]!);

        game.resetStack();
        emittedOrder.length = 0;

        triggerEndTurnEffects();

        expect(emittedOrder.slice(-2)).toEqual(["game-B", "game-A"]);
    });
});
