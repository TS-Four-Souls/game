import type { ItemCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

async function characterAdd1LootPlay(player1: Player, game: Game) {
    // verify character card works.
    const lootPlay = player1.remainingLootPlay;
    game.cardHandler.recharge(player1.character as ItemCard);
    await game.activateItem(player1, player1.character!, [], "tap");
    await game.actions.resolveStack();
    await game.actions.resolveStack();
    expect(player1.remainingLootPlay).toBe(lootPlay + 1);
}

describe.skip("Gold Box 2 Eternal Items", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
    });
    
    it("g2-void discard monster engaged in combat", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-apollyon", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-apollyon");
        expect(eternal.slug).toBe("g2-void");
        game.cardHandler.recharge(eternal);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[1]!);
        const old = game.monsters[1]!.card.globalId;
        expect( async () => {await game.activateItem(player1, eternal, ["Put a monster not being attacked or a shop item into discard.", game.monsters[1]!.card])}).toThrow();
    });
    
    it("g2-void discard monster", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-apollyon", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-apollyon");
        expect(eternal.slug).toBe("g2-void");
        game.cardHandler.recharge(eternal);
        const old = game.monsters[1]!.card.globalId;
        await game.activateItem(player1, eternal, ["Put a monster not being attacked or a shop item into discard.", game.monsters[1]!.card]);
        await game.actions.resolveStack();
        expect(game.monsters[1]!.card.globalId).not.toBe(old);
    });
    
    it("g2-void discard shop", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-apollyon", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-apollyon");
        expect(eternal.slug).toBe("g2-void");
        game.cardHandler.recharge(eternal);
        const old = game.shop.cardsOnTop[1]!.globalId;
        await game.activateItem(player1, eternal, ["Put a monster not being attacked or a shop item into discard.", game.shop.cardsOnTop[1]]);
        await game.actions.resolveStack();
        expect(game.shop.cardsOnTop[1]!.globalId).not.toBe(old);
    });
    
    it("g2-void discard hand", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-apollyon", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-apollyon");
        expect(eternal.slug).toBe("g2-void");
        game.cardHandler.recharge(eternal);
        game.loot(player1, 5, "other");
        const old = player1.hand._hand.map(c=> c.globalId);
        await game.activateItem(player1, eternal, ["Discard your hand, then loot equal to the number of cards discarded."]);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(5);
        for(const card of player1.hand._hand)
            expect(old.includes(card.globalId)).toBe(false);
    });
    
    it("g2-lost stat and effect", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-the_lost", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-the_lost");
        expect(eternal.slug).toBe("g2-holy_mantle");
        expect(player1.healthPoints).toBe(1);
        expect(player1.attackPoints).toBe(1);
        game.cardHandler.deactivateItem(player1.character);
        await game.endTurn();
        await game.resolveEntireStack();
        expect(game.currentPlayer === player2).toBe(true);
        expect(player1.character.charged).toBe(true);
    });
    
    it("g2-holy_mantle dont skip turn if not current player", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-the_lost", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-the_lost");
        expect(eternal.slug).toBe("g2-holy_mantle");
        game.cardHandler.recharge(eternal);
        await game.activateItem(player1, eternal, [player2]);
        await game.actions.resolveStack();
        game.entityHandler.kill(player2, player1, eternal);
        await game.actions.resolveStack();
        expect(game.currentPlayer === player1).toBe(true);
    });
    
    it("g2-holy_mantle", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-the_lost", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-the_lost");
        expect(eternal.slug).toBe("g2-holy_mantle");
        game.cardHandler.recharge(eternal);
        await game.activateItem(player1, eternal, [player1]);
        await game.actions.resolveStack();
        game.entityHandler.kill(player1, player1, eternal);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(3);
        expect(player1.isDead).toBe(false);
        expect(game.currentPlayer === player1).toBe(true);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer === player1).toBe(false);
        // expect(game.entitiesInCombat.length).toBe(0);
        // expect(player1.attackThisTurn).toBe(1);
    });
    
    it("g2-lord_of_the_pit", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-azazel", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-azazel");
        expect(eternal.slug).toBe("g2-lord_of_the_pit");
        game.cardHandler.recharge(eternal);
        expect(async () => {await game.activateItem(player1, eternal, [player2])}).toThrow();
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        expect(player1.attackThisTurn).toBe(0);
        await game.activateItem(player1, eternal, [player1]);
        await game.actions.resolveStack();
        expect(game.entitiesInCombat.length).toBe(0);
        expect(player1.attackThisTurn).toBe(1);
    });
    
    it("g2-wooden_nickel", async () => {
        const setup = await setupTestGame({
                    characters: ["g2-the_keeper", "b2-lilith"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]!;
        expect(player1.character!.slug).toBe("g2-the_keeper");
        expect(eternal.slug).toBe("g2-wooden_nickel");
        game.random = () => 5/6-0.01;
        game.cardHandler.recharge(eternal);
        await game.activateItem(player1, eternal, [player2]);
        await game.actions.resolveStack();
        expect(player2.coins).toBe(0);
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(5);
    });

});

