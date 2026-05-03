import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "@/models/game";
import { Player } from "@/models/player";
import { EffectOnStack, EffectData, type TreasureCard } from "@/models/cards";
import { setupTestGame } from "@/tests/testHelpers";

describe("Start of Game", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    it("start with same characters", async () => {
        game = new Game();
        for (let i = 0; i < 3; i++) {
            const player = new Player(`player${i + 1}`);
            game.players.push(player);
        }
        const orderedCharacters = [{character: {slug: "b2-judas"}}, {character: {slug: "b2-judas"}}, {character: {slug: "b2-judas"}}];
        const characters = game.getCharactersFromSlugs(orderedCharacters?.map((c) => 
                // c.character === "random" ? "random" : 
        c.character.slug) ?? []);
        expect(() => game.start(characters)).not.toThrow();
        expect(game.players[0]!.inPlay[1]!.globalId).not.toBe(game.players[1]!.inPlay[1]!.globalId);
        expect(game.players[2]!.inPlay[1]!.globalId).not.toBe(game.players[1]!.inPlay[1]!.globalId);
        expect(game.players[2]!.inPlay[1]!.globalId).not.toBe(game.players[0]!.inPlay[1]!.globalId);
        expect(game.players[0]!.character.globalId).not.toBe(game.players[1]!.character.globalId);
        expect(game.players[2]!.character.globalId).not.toBe(game.players[1]!.character.globalId);
        expect(game.players[2]!.character.globalId).not.toBe(game.players[0]!.character.globalId);
    });

    it("start with same characters with random", async () => {
        game = new Game();
        for (let i = 0; i < 3; i++) {
            const player = new Player(`player${i + 1}`);
            game.players.push(player);
        }
        const orderedCharacters = [{character: {slug: "b2-judas"}}, {character: {slug: "b2-judas"}}, {character: {slug: "random"}}];
        const characters = game.getCharactersFromSlugs(orderedCharacters?.map((c) => 
        c.character.slug) ?? []);
        expect(() => game.start(characters)).not.toThrow();
    });

    
});
