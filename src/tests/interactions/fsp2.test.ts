import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";

let game: Game;
let player1: Player;
let player2: Player;

async function setup(characters: string[] = ["fsp2-guppy", "b2-lilith"]): Promise<void> {
    const s = await setupTestGame({
        characters,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
        playerCount: 2,
    });
    game = s.game;
    player1 = s.player1;
    player2 = s.player2!;
    game.resetStack();
    game.resetCallbacks();
}
function buff() { game.entityHandler.addHealth(player1, 10); game.entityHandler.addHealth(player2, 10); }
async function drain(): Promise<void> {
    for (let i = 0; i < 40 && !game.stack.isEmpty(); i++)
        await game.actions.resolveStack();
}
async function nextTurn(): Promise<void> {
    await drain();
    await game.endTurn();
    await drain();
}
function inPlay(player: Player, slug: string): ItemCard {
    const card = game.obtainCard(slug) as ItemCard;
    game.cardHandler.addInPlay(player, card);
    return card;
}
function roll(v: number) { game.random = () => v / 6 - 0.00001; }
function mon(slot: number, slug: string) {
    const c = game.obtainCard(slug) as MonsterCard;
    game.encounters.forceSetMonsterAtSlot(slot, c);
    return game.encounters.monsterIn(slot)!;
}

describe("fsp2 interactions", () => {
    it("telepathy: another player's roll first does not consume it", async () => {
        await setup();
        inPlay(player2, "fsp2-telepathy_for_dummies");
        roll(5);
        await game.endTurn();
        await drain();
        expect(game.currentPlayer).toBe(player2);
        game.select = (_i: any, _min: number, _max: number, opts: any[]) => ({ selected: [opts[1]], remaining: [] }) as any;
        roll(1);
        game.rollDice(player1, player1.character as any); // other player's roll (e.g. their item) on p2's turn
        await drain();
        const d2 = game.rollDice(player2, player2.character as any);
        await drain();
        expect(d2.value).toBe(5);
    });
});
