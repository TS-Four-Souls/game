import { Game } from "../../models/game";
import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

async function drain(game: Game, max = 50) { let i = 0; while (!game.stack.isEmpty() && i++ < max) await game.actions.resolveStack(); return game.stack.isEmpty(); }

describe("base set item interactions", () => {
    // Bum-bo replaces coin gains with nothing: Counterfeit Penny must not add +1 to that 0 gain.
    describe("Counterfeit Penny", () => {
        it("bum_bo then counterfeit_penny: gaining coins gives no coins", async () => {
            const { game, player1: p1 } = await setupTestGame({ characters: ["b2-isaac", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
            await drain(game);
            const bb = game.obtainCard("b2-bum_bo") as ItemCard; game.cardHandler.addInPlay(p1, bb);
            game.cardHandler.addInPlay(p1, game.obtainCard("b2-counterfeit_penny") as any);
            await drain(game);
            const c = p1.coins;
            game.gainCoins(p1, 3, p1.character);
            expect(p1.coins).toBe(c);            // received c+1
            expect(bb.counters.value("normal")).toBeGreaterThanOrEqual(3);
        });
    });

    // Blank Card copying XIX - The Sun: a copy can't be put on the bottom of the loot deck.
    describe("Blank Card", () => {
        it("blank_card + xix_the_sun: copy must not be added to the loot deck", async () => {
            const { game, player1: p1 } = await setupTestGame({ characters: ["b2-isaac", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
            await drain(game);
            const bc = game.obtainCard("b2-blank_card") as ItemCard; game.cardHandler.addInPlay(p1, bc);
            await game.activateItem(p1, bc, []);
            await drain(game);
            const sun = game.decks.loot.getCardFromSlug("b2-xix_the_sun") as LootCard;
            p1.hand.addToHand(sun);
            const before = game.decks.loot.cards.length;
            game.actions.playCard(p1, p1.hand.cards.indexOf(sun));
            await drain(game);
            expect(game.decks.loot.cards.filter(c => c.slug === "b2-xix_the_sun").length).toBe(1); // received 2 (one with parentCard "b2-blank_card")
            expect(game.decks.loot.cards.length).toBe(before + 1);
        });
    });

    // Daddy Haunt adds +1 only to damage that still exists: damage prevented by The Dead Cat stays 0.
    describe("Daddy Haunt", () => {
        let game: Game; let p1: Player; let p2: Player;
        beforeEach(async () => {
            const s = await setupTestGame({ characters: ["b2-isaac", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
            game = s.game; p1 = s.player1; p2 = s.player2!; await drain(game);
            game.entityHandler.addHealth(p1, 5);
        });
        const give = (p: Player, slug: string) => { const c = game.obtainCard(slug) as ItemCard; game.cardHandler.addInPlay(p, c); return c; };
        async function soulHeart(target: Player) {
            const sh = game.decks.loot.getCardFromSlug("b2-soul_heart") as LootCard;
            p1.hand.addToHand(sh); game.actions.playCard(p1, p1.hand.cards.indexOf(sh), [target]); await drain(game);
        }
        const hit = async (n: number) => { game.entityHandler.dealDamage(p2, p1, { card: p2.character, visualEffectBox: undefined } as any, n); await drain(game); };

        it("daddy_haunt + dead_cat: 1 damage fully prevented -> 0 taken", async () => {
            give(p1, "b2-the_dead_cat"); await drain(game);
            give(p1, "b2-daddy_haunt"); await drain(game);
            const h = p1.currentHealthPoints; await hit(1);
            expect(p1.currentHealthPoints).toBe(h);
        });
    });

    // Mom's Bra reduces the damage to 1: it never raises damage already prevented to 0.
    describe("Mom's Bra", () => {
        let game: Game; let p1: Player; let p2: Player;
        beforeEach(async () => {
            const s = await setupTestGame({ characters: ["b2-isaac", "b2-samson"], monsters: ["b2-fly", "b2-fatty"] });
            game = s.game; p1 = s.player1; p2 = s.player2!; await drain(game);
            game.entityHandler.addHealth(p1, 5);
        });
        const give = (p: Player, slug: string) => { const c = game.obtainCard(slug) as ItemCard; game.cardHandler.addInPlay(p, c); return c; };
        async function soulHeart(target: Player) {
            const sh = game.decks.loot.getCardFromSlug("b2-soul_heart") as LootCard;
            p1.hand.addToHand(sh); game.actions.playCard(p1, p1.hand.cards.indexOf(sh), [target]); await drain(game);
        }
        const hit = async (n: number) => { game.entityHandler.dealDamage(p2, p1, { card: p2.character, visualEffectBox: undefined } as any, n); await drain(game); };

        it("moms_bra then soul_heart order", async () => {
            const bra = give(p2, "b2-moms_bra");
            await game.activateItem(p2, bra, [p1]); await drain(game);
            await soulHeart(p1);
            const h = p1.currentHealthPoints; await hit(1);
            expect(p1.currentHealthPoints).toBe(h);
        });
    });

    // Shadow copied by Modeling Clay: only one of them gets the dying player's lost coins.
    describe("Shadow", () => {
        it("shadow + modeling_clay copy: dying player's lost coins are not duplicated", async () => {
            const { game, player1: p1, player2: p2, player3: p3 } = await setupTestGame({ characters: ["b2-isaac", "b2-samson", "b2-lilith"], monsters: ["b2-fly", "b2-fatty"], playerCount: 3 });
            await drain(game);
            const shadow = game.obtainCard("b2-shadow") as ItemCard; game.cardHandler.addInPlay(p1, shadow);
            const clay = game.obtainCard("b2-modeling_clay") as ItemCard; game.cardHandler.addInPlay(p2!, clay);
            await drain(game);
            await game.activateItem(p2!, clay, [shadow]); await drain(game);
            game.gainCoins(p3!, 5, "debug");
            const c1 = p1.coins, c2 = p2!.coins, c3 = p3!.coins;
            game.entityHandler.kill(p1, p3!, { card: p1.character, visualEffectBox: undefined } as any); await drain(game);
            const lost = c3 - p3!.coins;
            expect((p1.coins - c1) + (p2!.coins - c2)).toBe(lost);
        });
    });
});
