import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { setTimeout } from "timers/promises";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { AttackRollData } from "@/models/stackElement";

async function characterAdd1LootPlay(player1: Player, game: Game) {
    // verify character card works.
    const lootPlay = player1.remainingLootPlay;
    game.cardHandler.recharge(player1.character as ItemCard);
    await game.activateItem(player1, player1.character!, [], "tap");
    await game.actions.resolveStack();
    await game.actions.resolveStack();
    expect(player1.remainingLootPlay).toBe(lootPlay + 1);
}
describe("Four Souls+2 Eternal Items", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let rs: () => Promise<void>;
    
    beforeEach(() => {
    });
    
    // it("rwz-edmund", async () => {
    //     const setup = await setupTestGame({
    //         characters: ["rwz-edmund", "b2-lilith"],
    //         monsters: ["b2-fly", "b2-fatty"],
    //         monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
    //         treasureDeck: ["b2-blank_card"],
    //         playerCount: 2
    //     });
    //     game = setup.game;
    //     player1 = setup.player1;
    //     player2 = setup.player2!;
        // const eternal = player1.inPlay[0]! as ItemCard;
        // game.cardHandler.recharge(eternal, "other");
    // });
    
    it("rwz-johnny", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.endTurn()
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(2);
        await game.activateItem(player1, eternal, [player2], "tap");
        await game.actions.resolveStack();
        game.random = () => 1/6-0.01;
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(0);
        expect(player2.inPlay.length).toBe(2);
    });
    
    it("rwz-steven eternal", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-steven", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        
        game.entityHandler.kill(player2, player2, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(1);
        game.entityHandler.kill(player2, game.monsters[0]!, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(2);
        game.cardHandler.addToCounter(player1, eternal, "normal", 9);
        expect(game.currentPlayer === player1).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.activateItem(player1, eternal, [], 0);
        await game.actions.resolveStack();
        expect(game.currentPlayer === player2).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer === player2).toBe(true);
        expect(eternal.counters.getCounter("normal").value).toBe(1);
    });
    
    it("rwz-steven", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-steven", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(player1.remainingLootPlay).toBe(10);

        const card = game.decks.loot.draw();
        card.soul = 3;
        game.cardHandler.addSoul(player1, card);
        game.cardHandler.recharge(player1.character, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.remainingLootPlay).toBe(13);
    });
    
    it("rwz-blind_johnny eternal", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blind_johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, eternal, [player2], "tap");
        await game.actions.resolveStack()
        await game.actions.resolveStack()
        expect(player2.currentHealthPoints).toBe(1);
        game.entityHandler.kill(player2, player2, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.charged).toBe(true);
    });
    
    it("rwz-blind_johnny", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blind_johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.loot(player2, 1, "other");
        const card = player2.hand.cards[0]!;
        await game.activateItem(player1, player1.character, [player2], "tap");
        await game.actions.resolveStack()
        expect( player1.hand.length).toBe(1);
        expect( player2.hand.length).toBe(0);
        expect(player1.hand.cards[0]! === card).toBe(true);
    });
    
    it("rwz-yung_venuz", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-yung_venuz", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;

        game.cardHandler.recharge(eternal, "other");
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        game.activateItem(player1, eternal, [game.stack.elements[0]!], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(4);
    });
    
    it("rwz-the_silent", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-the_silent", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        expect(player1.character.charged).toBe(false);
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.resolveStack();
        expect(player1.character.charged).toBe(true);
        expect(player1.hand.length).toBe(1);
    });
    
    it("rwz-psycho_goreman", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-psycho_goreman", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        expect(player1.currentHealthPoints).toBe(2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        expect(player1.currentHealthPoints).toBe(3);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("rwz-captain_viridian", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-captain_viridian", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        const dice = game.rollDice(player1, eternal);
        const value = dice.value;
        await game.activateItem(player1, eternal, [dice], "tap");
        await game.actions.resolveStack();
        expect(dice.value).toBe(7 - value);
        await game.activateItem(player1, player1.character, [eternal], "tap");
        await game.actions.resolveStack();
        expect(eternal.charged).toBe(true);
    });
    
    it("rwz-blue_archer", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blue_archer", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        const mob = game.monsters[0]!;
        const initDc = mob.evasion;
        await game.activateItem(player1, eternal, [mob], "tap");
        await game.actions.resolveStack();
        expect(mob.evasion).toBe(initDc - 1);
        game.entityHandler.kill(player1, mob, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(4);

    });
    
    it("rwz-edmund", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-edmund", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.activateItem(player1, eternal, [game.stack.peek()!]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
    });

});

