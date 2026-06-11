import { describe, it, expect } from "bun:test";
import { Game } from "@/models/game";
import { Player } from "@/models/entities/player";
import { Team } from "@/shared/api";

describe("Start of Game", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    it("start with same characters", async () => {
        game = new Game();
        const orderedCharacters = [{issuer: "Player 1", character: "b2-judas", team: Team.Team1}, {issuer: "Player 2", character: "b2-judas", team: Team.Team2}, {issuer: "Player 3", character: "b2-judas", team: Team.Team3}];
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
        const orderedCharacters = [{issuer: "Player 1", character: "b2-judas", team: Team.Team1}, {issuer: "Player 2", character: "b2-judas", team: Team.Team2}, {issuer: "Player 3", character: "b2-judas", team: Team.Team3}];
        expect(() => game.start(orderedCharacters)).not.toThrow();
    });

    it("start with teams", async () => {
        game = new Game();
        const orderedCharacters = [{issuer: "Player 1", character: "b2-judas", team: Team.Team1}, {issuer: "Player 2", character: "b2-judas", team: Team.Team1}, {issuer: "Player 3", character: "b2-judas", team: Team.Team3}];
        game.start(orderedCharacters);
        
        const player1 = game.players.find(p => p.id === "Player 1")!;
        const player2 = game.players.find(p => p.id === "Player 2")!;
        const player3 = game.players.find(p => p.id === "Player 3")!;

        const card1 = game.decks.loot.draw();
        card1.soul = 1;
        game.cardHandler.addSoul(player1, card1);

        expect(player1.totalSouls).toBe(1);
        expect(player2.totalSouls).toBe(1);
        expect(player3.totalSouls).toBe(0);
        
        const card2 = game.decks.loot.draw();
        card2.soul = 1;
        game.cardHandler.addSoul(player2, card2);

        expect(player1.totalSouls).toBe(2);
        expect(player2.totalSouls).toBe(2);
        expect(player3.totalSouls).toBe(0);
        
        const card3 = game.decks.loot.draw();
        card3.soul = 1;
        game.cardHandler.addSoul(player3, card3);

        expect(player1.totalSouls).toBe(2);
        expect(player2.totalSouls).toBe(2);
        expect(player3.totalSouls).toBe(1);
    });
    
});
