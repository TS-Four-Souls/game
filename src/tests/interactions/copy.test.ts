import type { ItemCard, LootCard, MonsterCard, RoomCard } from "@/models/cards";
import type { TriggerEvent } from "@/models/types/eventTypes";
import { describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";

let game: Game;
let player1: Player;
let player2: Player;

async function setup(characters: string[] = ["fsp2-guppy", "b2-lilith"], rooms = false): Promise<void> {
    const s = await setupTestGame({
        characters,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
        playerCount: 2,
        rooms,
    });
    game = s.game;
    player1 = s.player1;
    player2 = s.player2!;
    game.resetStack();
    game.resetCallbacks();
}

async function drain(): Promise<void> {
    for (let i = 0; i < 30 && !game.stack.isEmpty(); i++)
        await game.actions.resolveStack();
}

/** Ends the current turn and resolves everything until the next player's turn has started. */
async function nextTurn(): Promise<void> {
    await drain();
    await game.endTurn();
    await drain();
}

function listenerCount(event?: TriggerEvent): number {
    const listeners = (game.emitter as any).listeners as Map<TriggerEvent, unknown[]>;
    if (event !== undefined) return listeners.get(event)?.length ?? 0;
    let n = 0;
    for (const l of listeners.values()) n += l.length;
    return n;
}

function inPlay(player: Player, slug: string): ItemCard {
    const card = game.obtainCard(slug) as ItemCard;
    game.cardHandler.addInPlay(player, card);
    return card;
}

async function activate(player: Player, item: ItemCard, targets: any[]): Promise<void> {
    game.cardHandler.recharge(item);
    await game.activateItem(player, item, targets, "tap");
    await drain();
}

async function playCow(target: Player): Promise<void> {
    const cow = game.obtainCard("rwz-cow_on_a_trash_farm") as LootCard;
    game.cardHandler.addCardToHand(player1, cow);
    await game.actions.playCard(player1, player1.hand.cards.indexOf(cow), [target]);
    await drain();
}

describe("copy interactions", () => {
    describe("Cow on a Trash Farm on a copy", () => {
        it("Modeling Clay is still the copy when it regains its abilities", async () => {
            await setup();
            const atk = player1.attackPoints;
            const clay = inPlay(player1, "b2-modeling_clay");
            const brimstone = inPlay(player2, "b2-brimstone");
            await activate(player1, clay, [brimstone]);
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk + 1);
            const listeners = listenerCount();

            await playCow(player1);
            expect(player1.attackPoints).toBe(atk);
            await nextTurn();
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk);
            await nextTurn();
            expect(game.currentPlayer).toBe(player1);
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk + 1);
            expect(listenerCount()).toBe(listeners);
        });

        it("Diplopia gets its own ability back once its copy expired", async () => {
            await setup();
            const atk = player1.attackPoints;
            const diplopia = inPlay(player1, "b2-diplopia");
            const brimstone = inPlay(player2, "b2-brimstone");
            const turnEndListeners = listenerCount("till:turn:end");
            await activate(player1, diplopia, [brimstone]);
            expect(player1.attackPoints).toBe(atk + 1);

            await playCow(player1);
            expect(player1.attackPoints).toBe(atk);
            await nextTurn();
            // The copy expired at the end of the turn, while the abilities were lost.
            expect(diplopia.slug).toBe("b2-diplopia");
            expect(listenerCount("till:turn:end")).toBe(turnEndListeners);
            expect(player1.attackPoints).toBe(atk);
            expect(diplopia.hasTapEffect()).toBe(false);
            await nextTurn();
            expect(game.currentPlayer).toBe(player1);
            expect(diplopia.slug).toBe("b2-diplopia");
            expect(player1.attackPoints).toBe(atk);
            expect(diplopia.hasTapEffect()).toBe(true);
        });
    });

    it("rwz-is_you subscribes the passive abilities it copies", async () => {
        await setup(["rwz-baba", "b2-lilith"]);
        const isYou = player1.inPlay[0]! as ItemCard;
        const hunky = inPlay(player2, "rwz-hunky_boys");
        const select = game.select.bind(game);
        game.select = (async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (options.includes(hunky))
                return { selected: [hunky], remaining: options.filter(o => o !== hunky) };
            return (select as any)(player, min, max, options, ...rest);
        }) as any;
        await drain();
        if (game.currentPlayer !== player1)
            await nextTurn();
        const hp = player1.healthPoints;
        await nextTurn();
        await nextTurn();
        expect(game.currentPlayer).toBe(player1);
        expect(isYou.name).toBe(hunky.name);
        const turnStartListeners = listenerCount("as:turn:start");
        await nextTurn();
        expect(game.currentPlayer).toBe(player2);
        // "+1 [HP] while it's not your turn."
        expect(player1.healthPoints).toBe(hp + 1);
        await nextTurn();
        expect(isYou.name).toBe(hunky.name);
        expect(listenerCount("as:turn:start")).toBe(turnStartListeners);
    });

    describe("Cube of Meat sees copies", () => {
        it("Modeling Clay copying a Cube of Meat", async () => {
            await setup();
            const atk = player1.attackPoints;
            const cube = inPlay(player1, "box-cube_of_meat");
            const clay = inPlay(player1, "b2-modeling_clay");
            expect(player1.attackPoints).toBe(atk);
            await activate(player1, clay, [cube]);
            expect(clay.name).toBe(cube.name);
            expect(player1.attackPoints).toBe(atk + 2);
        });

        it("Diplopia copying a Cube of Meat till end of turn", async () => {
            await setup();
            const atk = player1.attackPoints;
            const cube = inPlay(player1, "box-cube_of_meat");
            const diplopia = inPlay(player1, "b2-diplopia");
            await activate(player1, diplopia, [cube]);
            expect(player1.attackPoints).toBe(atk + 2);
            await nextTurn();
            expect(diplopia.slug).toBe("b2-diplopia");
            expect(player1.attackPoints).toBe(atk);
        });
    });

    describe("copies survive a change of control", () => {
        it("giving and stealing a transformed Modeling Clay", async () => {
            await setup();
            const atk1 = player1.attackPoints;
            const atk2 = player2.attackPoints;
            const clay = inPlay(player1, "b2-modeling_clay");
            const brimstone = inPlay(player2, "b2-brimstone");
            await activate(player1, clay, [brimstone]);
            const listeners = listenerCount();

            game.cardHandler.give(player1, player2, clay);
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk1);
            expect(player2.attackPoints).toBe(atk2 + 2);
            game.cardHandler.stealItemAnywhere(player1, clay);
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk1 + 1);
            expect(player2.attackPoints).toBe(atk2 + 1);
            game.cardHandler.swapItems(clay, brimstone);
            expect(clay.slug).toBe("b2-brimstone");
            expect(player1.attackPoints).toBe(atk1 + 1);
            expect(player2.attackPoints).toBe(atk2 + 1);
            expect(listenerCount()).toBe(listeners);
            await nextTurn();
            expect(clay.slug).toBe("b2-brimstone");

            // Leaving play reverts it; a later copy doesn't use the old restore point.
            game.cardHandler.destroyCardsOrSouls([clay]);
            await drain();
            expect(clay.slug).toBe("b2-modeling_clay");
            expect(clay.tags.restoreIndefinite).toBeUndefined();
            game.obtainCard(clay.slug, clay.globalId);
            game.cardHandler.addInPlay(player1, clay);
            const hp1 = player1.healthPoints;
            const dinner = inPlay(player2, "b2-dinner");
            await activate(player1, clay, [dinner]);
            expect(clay.slug).toBe("b2-dinner");
            expect(player1.healthPoints).toBe(hp1 + 1);
        });

        it("a Diplopia copy given mid-turn still ends at the end of the turn", async () => {
            await setup();
            const atk2 = player2.attackPoints;
            const diplopia = inPlay(player1, "b2-diplopia");
            const brimstone = inPlay(player1, "b2-brimstone");
            const turnEndListeners = listenerCount("till:turn:end");
            await activate(player1, diplopia, [brimstone]);
            game.cardHandler.give(player1, player2, diplopia);
            expect(diplopia.slug).toBe("b2-brimstone");
            expect(player2.attackPoints).toBe(atk2 + 1);
            await nextTurn();
            expect(diplopia.slug).toBe("b2-diplopia");
            expect(player2.attackPoints).toBe(atk2);
            expect(diplopia.hasTapEffect()).toBe(true);
            expect(listenerCount("till:turn:end")).toBe(turnEndListeners);
        });

        it("the Isaac of Isaac room keeps a Modeling Clay copy under the D6", async () => {
            await setup(["fsp2-guppy", "b2-lilith"], true);
            const atk = player1.attackPoints;
            const clay = inPlay(player1, "b2-modeling_clay");
            const brimstone = inPlay(player2, "b2-brimstone");
            await activate(player1, clay, [brimstone]);
            const room = game.obtainCard("rwz-the_isaac_of_isaac_re_isaac") as RoomCard;
            game.decks.room.addTopPosition(room);
            game.rooms?.discardTop(0);
            await drain();
            expect(clay.slug).toBe("b2-the_d6");
            expect(player1.attackPoints).toBe(atk);
            // Changing control while the room is active: still a single D6.
            game.cardHandler.give(player1, player2, clay);
            game.cardHandler.give(player2, player1, clay);
            expect(clay.slug).toBe("b2-the_d6");
            game.rooms?.discardTop(0);
            expect(clay.slug).toBe("b2-brimstone");
            expect(clay.eternal).toBe(false);
            expect(player1.attackPoints).toBe(atk + 1);
        });
    });

    it("box-delirium soul does not leak a listener each time it is gained", async () => {
        await setup();
        const mob = game.obtainCard("box-delirium") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        game.entityHandler.kill(player1, game.monsters[0]!, { card: mob, visualEffectBox: undefined });
        await drain();
        expect(player1.souls).toContain(mob);
        const removedListeners = listenerCount("on:soul:removed");
        game.cardHandler.removeSoul(player1, mob);
        expect(listenerCount("on:soul:removed")).toBe(removedListeners - 1);
    });
});
