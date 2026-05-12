import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "@/models/game";
import { Player } from "@/models/entities/player";
import { EffectOnStack, EffectData, type TreasureCard } from "@/models/cards";
import { setupTestGame } from "@/tests/testHelpers";

describe("Start of Game", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    it("start with same characters", async () => {
        game = new Game();
        const orderedCharacters = [{issuer: "Player 1", character: "b2-judas"}, {issuer: "Player 2", character: "b2-judas"}, {issuer: "Player 3", character: "b2-judas"}];
        expect(() => game.start(orderedCharacters)).not.toThrow();
        expect(game.players[0]!.inPlay[1]!.globalId).not.toBe(game.players[1]!.inPlay[1]!.globalId);
        expect(game.players[2]!.inPlay[1]!.globalId).not.toBe(game.players[1]!.inPlay[1]!.globalId);
        expect(game.players[2]!.inPlay[1]!.globalId).not.toBe(game.players[0]!.inPlay[1]!.globalId);
        expect(game.players[0]!.character.globalId).not.toBe(game.players[1]!.character.globalId);
        expect(game.players[2]!.character.globalId).not.toBe(game.players[1]!.character.globalId);
        expect(game.players[2]!.character.globalId).not.toBe(game.players[0]!.character.globalId);
    });

    it("start with same characters with random", async () => {
        game = new Game();
        const orderedCharacters = [{issuer: "Player 1", character: "b2-judas"}, {issuer: "Player 2", character: "b2-judas"}, {issuer: "Player 3", character: "b2-judas"}];
        expect(() => game.start(orderedCharacters)).not.toThrow();
    });

    
});
