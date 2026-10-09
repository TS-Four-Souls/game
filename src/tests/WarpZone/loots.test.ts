import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";
import { AttackRollData } from "@/models/stackElement";


describe("Warp Zone Loots ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(async () => {
        const setup = await setupTestGame({
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

    // it("rwz-demon_form", async () => {
    //     const bs = game.obtainCard("rwz-demon_form") as LootCard;
    //     game.cardHandler.addCardToHand(player1, bs);
    //     game.actions.playCard(player1, 0, []);
    //     await game.actions.resolveStack();
    // });

    // it("rwz-blanks", async () => {
    //     const bs = game.obtainCard("rwz-demon_form") as LootCard;
    //     game.cardHandler.addCardToHand(player1, bs);
    //     game.actions.playCard(player1, 0, []);
    //     await game.actions.resolveStack();
    // });

    it("rwz-blanks", async () => {
        const bs = game.obtainCard("rwz-blanks") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player2, {card: bs, visualEffectBox: null as any}, 4);
        game.entityHandler.addHealth(player1, 10, bs);
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(8);
    });

    it("rwz-chunk_of_amber", async () => {
        const bs = game.obtainCard("rwz-chunk_of_amber") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        game.random = () => 0.9;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(12);
    });

    it("rwz-demon_form", async () => {
        const bs = game.obtainCard("rwz-demon_form") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(3);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(1);
    });

    it("rwz-bible_thump", async () => {
        const bs = game.obtainCard("rwz-bible_thump") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
    });

    it("rwz-bible_thump 2", async () => {
        const bs = game.obtainCard("rwz-bible_thump") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        for (const p of game.players) {
            game.entityHandler.kill(p,p,{card: bs, visualEffectBox: null as any});
            await game.actions.resolveStack();
        }
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(6);
    });

});