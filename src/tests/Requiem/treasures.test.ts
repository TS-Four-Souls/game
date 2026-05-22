import type { ItemCard, LootCard, RoomCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { DamageOnStack } from "../../models/stackElement";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";


describe("Requiem Loots ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(() => {
        const setup = setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: [],
                        playerCount: 2,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.resetStack();
        game.resetCallbacks();
    });
    it("abel", async () => {
        let item = game.obtainCard("r-abel") as ItemCard;
        expect(item).toBeDefined();
        game.addInPlay(player1, item);
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[1]!);
        game.random = () => 0.9;
        game.actions.attackRoll(player1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => { //monster 0
            if(Options.includes(game.monsters[0]))
                return {selected: [game.monsters[0]], remaining: []};
            return {selected: Options.toReversed().slice(0, max), remaining: []};
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]?.card.slug).not.toBe("b2-fly");
        game.actions.attackRoll(player1);
        game.random = () => 0.1;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
    });
});