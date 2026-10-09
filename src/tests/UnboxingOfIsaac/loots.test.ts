import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";
import { AttackRollData } from "@/models/stackElement";


describe("Unboxing Loots ", () => {
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

    it("box-pills_3", async () => {
        const bs = game.obtainCard("box-pills_3") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.random = () => 0.9;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.decks.loot.discard.length).toBe(0);
        expect(game.entityHandler.getAttack(player1)).toBe(2);
        expect(player1.inPlay.length).toBe(2);
        game.cardHandler.destroyCardsOrSouls([player1.inPlay[1]!]);
        expect(game.entityHandler.getAttack(player1)).toBe(1);
        expect(player1.inPlay.length).toBe(1);
        expect(game.decks.loot.discard.length).toBe(1);
        game.obtainCard("box-pills_3") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.random = () => 0.1;
        game.entityHandler.addLootPlay(player1, 1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.decks.loot.discard.length).toBe(1);
        expect(game.entityHandler.getAttack(player1)).toBe(1);
        expect(player1.inPlay.length).toBe(1);
        expect(game.stack.isEmpty()).toBe(true);
    });

    it("box-pills_2", async () => {
        const bs = game.obtainCard("box-pills_2") as LootCard;
        game.random = () => 0.9;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.decks.loot.discard.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        game.entityHandler.dealDamage(player1, player1, {card: bs, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        game.cardHandler.destroyCardsOrSouls([player1.inPlay[1]!]);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1);
        game.decks.loot.getFromDiscard(bs);
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.decks.loot.discard.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        game.entityHandler.dealDamage(player1, player1, {card: bs, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
    });

    it("box-pills", async () => {
        const bs = game.obtainCard("box-pills") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.random = () => 0.9;
        game.cardHandler.gainTreasure(player2, 1);
        expect(player2.inPlay.length).toBe(2);
        expect(player1.inPlay.length).toBe(1);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        expect(player2.inPlay.length).toBe(1);
    });

    it("box-butt_penny", async () => {
        const bs = game.obtainCard("box-butt_penny") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
        expect(game.stack.isEmpty()).toBe(false);
        expect(game.stack.peek()!.json.type).toBe("diceRoll");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(1);
    });

});