import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

describe("Four Souls+2 Attack Requirements", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("Attack a player.", async () => {
        player2.attackable = true;
        player2.evasion = 3;
        game.actions.declareAttack(player1);
        game.random = () => 0.6;
        game.actions.declareAttackOnEntity(player1, player2);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // damage
        expect(player1.currentHealthPoints).toBe(2);
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("Attack a player and take damage.", async () => {
        player2.attackable = true;
        player2.evasion = 3;
        game.actions.declareAttack(player1);
        game.random = () => 0.1;
        game.actions.declareAttackOnEntity(player1, player2);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // damage
        expect(player1.currentHealthPoints).toBe(1);
        expect(player2.currentHealthPoints).toBe(2);
    });
});

