import { beforeEach, describe } from "bun:test";
import { Game } from "../models/game";
import { Player } from "../models/entities/player";
import { setupStandardTestGame } from "./testHelpers";

describe("History and targets", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    // 
});