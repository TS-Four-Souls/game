import type { RoomCard, TreasureCard } from "@/models/cards";
import type { DeckConfigPatch } from "@/shared/api";
import { Game } from "@/models/game";
import { GameParameters } from "@/models/gameParameters";
import { LOOP_REPETITIONS_BEFORE_VOTE } from "@/models/handlers/loopHandler";
import { TargetBuilder } from "@/models/targetBuilder";
import * as helper from "@/utils/gameRequestHelpers";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { describe, expect, it } from "bun:test";
import { setupTestGame } from "../testHelpers";

// Laser Eye (room): each time a player loots, they take 1 damage. Fanny Pack (item): each time you take damage, loot 1.
const LOOP_ROOM = "r-laser_eye";
const LOOP_ITEM = "b2-fanny_pack";

/** Starts the Laser Eye + Fanny Pack loop; every vote is answered by `answer` (one boolean per player). */
async function setupLoop(answer: (voteIndex: number) => boolean[]) {
    const setup = await setupTestGame({ characters: ["b2-isaac", "b2-judas", "b2-samson"], playerCount: 3, rooms: true });
    const { game, player1 } = setup;
    game.resetStack();
    game.resetCallbacks();
    const votes: number[] = []; // number of resolutions before each vote
    let resolutions = 0;
    game.selectMultiple = (async (selections: any[]) => {
        expect(selections.every(s => s.reason === "infiniteLoop")).toBe(true);
        const ballots = answer(votes.length);
        votes.push(resolutions);
        return selections.map((s, i) => ({ playerId: s.player.id, selected: [ballots[i]], remaining: [!ballots[i]] }));
    }) as any;
    game.rooms!.forceRoomAtSlot(0, game.obtainCard(LOOP_ROOM) as RoomCard);
    game.resetStack();
    game.cardHandler.addInPlay(player1, game.obtainCard(LOOP_ITEM) as TreasureCard);
    game.loot(player1, 1);
    const resolve = async (times: number) => {
        for (let i = 0; i < times && !game.stack.isEmpty(); i++, resolutions++) await game.actions.resolveStack();
    };
    return { ...setup, votes, resolve };
}

describe("infinite loops", () => {
    it("players vote after the same element resolved 10 times; voting to continue asks again 10 repetitions later", async () => {
        const { game, votes, resolve } = await setupLoop(() => [false, false, true]);
        await resolve(100);
        expect(game.stack.isEmpty()).toBe(false); // the loop goes on
        expect(votes.length).toBeGreaterThanOrEqual(3);
        // The loop is 3 elements long (Laser Eye, its damage, Fanny Pack): about 10 more iterations before the next vote.
        for (let i = 1; i < votes.length; i++) {
            expect(votes[i]! - votes[i - 1]!).toBeGreaterThanOrEqual(3 * (LOOP_REPETITIONS_BEFORE_VOTE - 1));
            expect(votes[i]! - votes[i - 1]!).toBeLessThanOrEqual(3 * LOOP_REPETITIONS_BEFORE_VOTE);
        }
    });

    it("a majority voting to reset empties the stack; the cancelled death leaves the player at 1 HP", async () => {
        const { game, player1, votes, resolve } = await setupLoop(() => [true, true, false]);
        await resolve(100);
        expect(votes.length).toBe(1);
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.isDead).toBe(false);
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("a tie resets the stack", async () => {
        const { game, votes, resolve } = await setupLoop(() => [true, false]);
        game.selectMultiple = ((selectMultiple) => (async (selections: any[]) => selectMultiple(selections.slice(0, 2))) as any)(game.selectMultiple);
        await resolve(100);
        expect(votes.length).toBe(1);
        expect(game.stack.isEmpty()).toBe(true);
    });

    it("an action other than resolving restarts the count", async () => {
        const { game, player1, votes, resolve } = await setupLoop(() => [false, false, false]);
        for (let i = 0; i < 5; i++) {
            await resolve(3 * LOOP_REPETITIONS_BEFORE_VOTE - 3);
            helper.executeDebugGainCoinsRequest(game, { coins: 1 } as any, player1);
        }
        expect(votes.length).toBe(0);
        await resolve(3 * LOOP_REPETITIONS_BEFORE_VOTE);
        expect(votes.length).toBe(1);
    });

    it("a replay of the logs votes at the same moments and ends in the same state", async () => {
        const idle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };
        const params = new GameParameters(() => {});
        params.setParameterByKey("decksConfig", { useRooms: { text: "", value: true }, useRCards: { text: "", value: true } } as DeckConfigPatch);
        const game = new Game("infinite-loop", params);
        const players = ["A", "B"].map((id, i) => ({ issuer: id, character: "b2-isaac", user: `u-${id}`, team: i + 1 }));
        game.startOfGameSetup(players);
        game.addToHistory({ type: "Start", players, params: params.toJson() });
        void game.atGameStartDecisions();
        await idle();
        const me = game.currentPlayer;
        const room = game.decks.room.cards.find(c => c.slug === LOOP_ROOM)!;
        const item = [...game.decks.treasure.cards, ...game.shop.itemsInShop].find(c => c?.slug === LOOP_ITEM)!;
        expect(room).toBeDefined();
        expect(item).toBeDefined();
        helper.executeDebugPutRoomRequest(game, { card: room.jsonAPI, toCover: game.rooms!.activeRooms[0]!.jsonAPI }, me);
        helper.executeDebugGainTreasureRequest(game, { cards: [item.jsonAPI] }, me);
        // Resolving the loot step loots: the loop starts.
        let votesCast = 0;
        for (let i = 0; i < 200 && votesCast < 3; i++) {
            const pending = [...game.pendingMultipleSelections.values()];
            if (pending.length > 0) {
                expect(pending.every(p => p.reason === "infiniteLoop")).toBe(true);
                // Continue twice, then player A alone votes to reset (a tie).
                for (const sel of pending) {
                    const reset = votesCast === 2 && sel.playerId === "A";
                    helper.executeSubmitSelectionRequest(game, { requestId: sel.requestId, selections: TargetBuilder.convertToSelectionItems([reset]) },
                        game.entityHandler.getPlayerById(sel.playerId));
                }
                votesCast++;
                await idle();
                continue;
            }
            if (game.stack.isEmpty()) break;
            void helper.executeResolveRequest(game, me); // a vote can open during the resolution
            await idle();
        }
        expect(votesCast).toBe(3);
        expect(game.stack.isEmpty()).toBe(true);
        const log = console.log; console.log = () => {};
        const loaded = await loadGameFromLogs(game.log);
        console.log = log;
        const replayed = loaded.entityHandler.getPlayerById(me.id);
        expect(replayed.hand.length).toBe(me.hand.length);
        expect(replayed.currentHealthPoints).toBe(me.currentHealthPoints);
        expect(loaded.decks.loot._order).toEqual(game.decks.loot._order);
        expect(loaded.stack.isEmpty()).toBe(true);
    });
});
