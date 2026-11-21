import { describe, expect, it } from "bun:test";
import type { ItemCard, LootCard, MonsterCard, TreasureCard } from "@/models/cards";
import { LootCard as LootCardClass } from "@/models/cards";
import { Game } from "@/models/game";
import { GameParameters } from "@/models/gameParameters";
import { DeathOnStack } from "@/models/stackElement";
import { Team } from "@/shared/api";
import { emptyHands, mockGameSelections, setupTestGame } from "../testHelpers";

describe("game modes and turn effects", () => {
    describe("Cancel everything and end the turn", () => {
        it("O The Fool with a dead monster's leave-play pending and an event on top of the monster deck", async () => {
            const s = await setupTestGame({ characters: ["b2-isaac", "b2-cain"], monsters: ["b2-boom_fly", "b2-pooter"] });
            const game = s.game; const p1 = game.currentPlayer; const p2 = game.players.find(p => p !== p1)!;
            game.decks.monster.addTopPosition(game.obtainCard("b2-cursed_chest") as MonsterCard);
            const fly = game.monsters[0]!;
            const fool = game.obtainCard("b2-o_the_fool") as LootCard;
            game.cardHandler.addCardToHand(p1, fool);
            game.entityHandler.addLootPlay(p1, 5);
            game.entityHandler.kill(p1, fly, { card: p1.character, visualEffectBox: undefined });
            // resolve the death itself; the rewards stay on the stack, so the fly has not left its slot yet
            while (game.stack.elements.some(e => e instanceof DeathOnStack)) await game.actions.resolveStack();
            game.actions.playCard(p1, p1.hand.length - 1);
            let err: unknown = null;
            try { await game.actions.resolveStack(); } catch (e) { err = e; }
            await game.resolveEntireStack();
            expect(err).toBeNull();
            expect(game.currentPlayer).toBe(p2);
        });
    });

    describe("Mini-draft", () => {
        it("the leftover treasure of each draft round goes to the bottom of the treasure deck", async () => {
            const parameters = new GameParameters(() => {});
            parameters.setParameterByKey("miniDraft", true);
            parameters.setParameterByKey("treasuresOnStart", 0);
            const game = new Game("minidraft-probe", parameters);
            mockGameSelections(game);
            game.startOfGameSetup([
                { issuer: "A", character: "b2-isaac", team: Team.Team1 },
                { issuer: "B", character: "b2-cain", team: Team.Team2 },
            ], false);
            const countTreasures = () => game.decks.treasure.length + game.decks.treasure.discard.length + game.shop.itemsInShop.filter(Boolean).length
                + game.players.reduce((n, p) => n + p.inPlay.filter(c => c.type === "treasure").length, 0);
            const before = countTreasures();
            await game.atGameStartDecisions();
            const after = countTreasures();
            expect(after).toBe(before);
        });
    });

    describe("Ambush", () => {
        it("after Greed Butt ambushes, the loot card (and later games) still have loot json", async () => {
            const { game, player1 } = await setupTestGame({ characters: ["fsp2-guppy", "b2-lilith"], monsters: ["b2-fly", "b2-fatty"] });
            const p1 = game.currentPlayer;
            const bs = game.obtainCard("rwz-greed_butt") as LootCard;
            game.cardHandler.addCardToHand(p1, bs);
            game.entityHandler.addLootPlay(p1, 1);
            game.actions.playCard(p1, p1.hand.length - 1, [game.monsters[0]!.card]);
            await game.resolveEntireStack();
            const copy = game.cardHandler.copyCard(bs);
            // a brand-new game in the same process
            const g2 = (await setupTestGame({ characters: ["fsp2-guppy", "b2-lilith"] })).game;
            const fresh = g2.obtainCard("rwz-greed_butt");
            expect((bs.json as any).type).toBe("loot");
            expect(copy).toBeInstanceOf(LootCardClass);
            expect(fresh).toBeInstanceOf(LootCardClass);
        });
    });

    describe("Passing hands", () => {
        it("free cards granted by Rusty Spoons stay with their player after hands are passed", async () => {
            const { game, player1, player2 } = await setupTestGame({ characters: ["rwz-salad_fingers", "b2-lilith"] });
            const p1 = player1, p2 = player2!;
            await game.resolveEntireStack();
            const spoons = p1.inPlay.find(c => c.slug === "rwz-rusty_spoons")! as ItemCard;
            game.cardHandler.recharge(spoons, "other");
            emptyHands(game);
            game.cardHandler.addCardToHand(p2, game.obtainCard("b2-a_dime") as LootCard);
            await game.activateItem(p1, spoons, [p2], "tap");
            await game.resolveEntireStack();
            expect(p1.hand.freeCards.length).toBe(1);
            game.cardHandler.addCardToHand(p1, game.obtainCard("b2-a_penny") as LootCard);
            const chaos = game.obtainCard("b2-chaos") as TreasureCard;
            game.cardHandler.addInPlay(p1, chaos);
            chaos.charged = true;
            await game.activateItem(p1, chaos, [], "tap");
            await game.resolveEntireStack();
            expect(p2.hand.cards.map(c => c.slug)).toEqual(["b2-a_penny"]);
            expect(p1.hand.freeCards.length).toBe(1); // Rusty Spoons' free card belongs to its controller
            expect(p2.hand.freeCards.length).toBe(0);
        });
    });
});
