import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import type { ItemCard, LootCard } from "@/models/cards";

describe("Four Souls+2 Attack Requirements", () => {
let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
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
        it("modelling clay copy punching bag, magic marker modify numbers.", async () => {
        const mc = game.obtainCard("b2-modeling_clay") as ItemCard;
        const pb = game.obtainCard("r-punching_bag") as ItemCard;
        const mm = game.obtainCard("r-magic_marker") as LootCard;
        game.addInPlay(player1, mc);
        game.addInPlay(player2, pb);
        game.addCardToHand(player1, mm);

        game.recharge(pb);
        await game.activateItem(player1, mc, [pb], "tap");
        await game.actions.resolveStack();
        expect(player1.healthPoints).toBe(4);
        await game.actions.playCard(player1, player1.hand.cards.findIndex(c => c.slug === "r-magic_marker")!, [mc]);
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.inPlay.map(c => c.slug)).toContain("r-punching_bag");
        expect(player1.healthPoints).toBe(3);
        await game.endTurn();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.healthPoints).toBe(4);
    });
    
    it("magic_marker (loot card)", async () => {
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        game.addCardToHand(player1, bs);
        let loot = game.obtainCard("r-magic_marker") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        game.actions.playCard(player1, 0, [game.stack.peek()!]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
        await game.endTurn();
        game.obtainCard(bs.slug, bs.globalId);
        game.entityHandler.addLootPlay(player1, 1, loot);
        game.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(3);
    });

    it("magic_marker (item card)", async () => {
        let loot = game.obtainCard("r-magic_marker") as LootCard;
        game.addCardToHand(player1, loot);
        const bs = game.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, bs);
        game.actions.playCard(player1, 0, [bs]);
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(3);
        await game.endTurn();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.entityHandler.getAttack(player1)).toBe(2);
    });

    it("Diplopia copies, recharge, copies. Should end up only with copy 2 active.", async () => {
        const diplo = game.obtainCard("b2-diplopia") as ItemCard;
        const a = game.obtainCard("b2-dinner") as ItemCard;
        const b = game.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, diplo);
        game.addInPlay(player2, a);
        game.addInPlay(player2, b);

        game.recharge(diplo);
        await game.activateItem(player1, diplo, [a], "tap");
        game.recharge(diplo);
        await game.activateItem(player1, diplo, [b], "tap");
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(2);
        await game.actions.resolveStack();
        expect(player1.healthPoints).toBe(3);
        expect(player1.attackPoints).toBe(1);
    });


    it("Does not preserve flip data when a card becomes a copy", () => {
        const source = game.decks["eternal"]!.getCardFromSlug("r-anima_sola")!;
        const target = game.decks["treasure"]!.getCardFromSlug("b2-battery_bum")!;

        expect(source.flipData).toBeTruthy();
        expect(target.flipData).toBeUndefined();

        target.becomesCopyOf(source);

        expect(target.name).toBe("Anima Sola");
        expect(target.flipData).toBeUndefined();
    });
    
    it("modelling clay copying diplopia, should reverse to diplopia by the end of the turn.", async () => {
        const diplo = game.obtainCard("b2-diplopia") as ItemCard;
        const a = game.obtainCard("b2-modeling_clay") as ItemCard;
        const b = game.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, a);
        game.addInPlay(player2, diplo);
        game.addInPlay(player2, b);

        game.recharge(diplo);
        await game.activateItem(player1, a, [diplo], "tap");
        await game.actions.resolveStack();
        game.recharge(a);
        await game.activateItem(player1, a, [b], "tap");
        await game.actions.resolveStack();
        expect(a.slug).toBe("b2-brimstone");
        expect(player1.attackPoints).toBe(2);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(a.slug).toBe("b2-diplopia");
    });
    
    it("undefined listeners do not stack.", async () => {
        const diplo = game.obtainCard("r-undefined") as ItemCard;
        game.addInPlay(player2, diplo);
        game.shop.discardTop(1);
        const item = game.shop.itemsInShop[1]!;
        
        game.recharge(diplo);
        await game.activateItem(player2, diplo, [item], "tap");
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();

        game.recharge(diplo);
        await game.actions.resolveStack();
        await game.activateItem(player2, diplo, [item], "tap");
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        
        await game.endTurn();
        expect(game.stack.size).toBe(1);
    });

    it("copying an attackable card.", async () => {
        const a = game.obtainCard("b2-modeling_clay") as ItemCard;
        const b = game.obtainCard("r-punching_bag") as ItemCard;
        game.addInPlay(player1, a);
        game.addInPlay(player2, b);

        game.recharge(a);
        await game.activateItem(player1, a, [b], "tap");
        await game.actions.resolveStack();
        expect(a.entity).toBeDefined();
    });
});