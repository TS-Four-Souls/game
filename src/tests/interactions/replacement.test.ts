import type { ItemCard, MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { DiceRoll } from "../../models/stackElement";
import { mockGameSelections, setupTestGame } from "../testHelpers";

async function drain(game: Game, max = 50) { let i = 0; while (!game.stack.isEmpty() && i++ < max) await game.actions.resolveStack(); return game.stack.isEmpty(); }
async function setup() {
    const s = await setupTestGame({ characters: ["b2-samson", "b2-isaac"], monsters: ["b2-fly", "b2-fatty"], monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"], treasureDeck: ["b2-blank_card", "b2-placebo", "b2-tech_x"] });
    mockGameSelections(s.game);
    await drain(s.game);
    return { game: s.game, p1: s.player1, p2: s.player2! };
}
const give = (game: Game, p: Player, slug: string) => { const c = game.obtainCard(slug) as ItemCard; game.cardHandler.addInPlay(p, c); return c; };

describe("damage modifiers after a prevention", () => {
    it("three dollar bill 6 must not raise damage fully prevented by dead cat", async () => {
        const { game, p1, p2 } = await setup();
        give(game, p1, "box-three_dollar_bill");
        give(game, p2, "b2-the_dead_cat"); await drain(game);
        game.entityHandler.addHealth(p2, 10, "other");
        const h = p2.currentHealthPoints;
        game.random = () => 6/6 - 0.01;
        game.entityHandler.dealDamage(p1, p2, { card: p1.character, visualEffectBox: undefined } as any, 1);
        await drain(game);
        expect(p2.currentHealthPoints).toBe(h);
    });

    it("horf +1 on roll 2 must not raise combat damage prevented by dead cat", async () => {
        const { game, p1 } = await setup();
        give(game, p1, "b2-the_dead_cat"); await drain(game);
        game.entityHandler.addHealth(p1, 100);
        const card = game.obtainCard("b2-horf") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, monster);
        await drain(game);
        const init = p1.currentHealthPoints;
        const atk = game.entityHandler.getAttack(monster);
        game.actions.attackRoll(p1);
        const dice = game.stack._stack[0] as DiceRoll;
        dice.value = 2;
        await drain(game);
        expect(atk).toBe(1);
        expect(p1.currentHealthPoints).toBe(init);
    });

    it("dead cat with 0 counters works again after regaining counters", async () => {
        const { game, p1, p2 } = await setup();
        const cat = give(game, p1, "b2-the_dead_cat"); await drain(game);
        game.entityHandler.addHealth(p1, 20, "other");
        game.cardHandler.addToCounter(p1, cat, "normal", -cat.counters.value("normal"));
        expect(cat.counters.value("normal")).toBe(0);
        let h = p1.currentHealthPoints;
        game.entityHandler.dealDamage(p2, p1, { card: p2.character, visualEffectBox: undefined } as any, 1);
        await drain(game);
        expect(p1.currentHealthPoints).toBe(h - 1);
        game.cardHandler.addToCounter(p1, cat, "normal", 3);
        h = p1.currentHealthPoints;
        game.entityHandler.dealDamage(p2, p1, { card: p2.character, visualEffectBox: undefined } as any, 1);
        await drain(game);
        expect(p1.currentHealthPoints).toBe(h);
    });
});

describe("Shadow and a copy of it", () => {
    async function s3() {
        const { game, player1: p1, player2: p2, player3: p3 } = await setupTestGame({ characters: ["b2-isaac", "b2-samson", "b2-lilith"], monsters: ["b2-fly", "b2-fatty"], playerCount: 3 });
        await drain(game);
        const shadow = game.obtainCard("b2-shadow") as ItemCard; game.cardHandler.addInPlay(p1, shadow);
        const clay = game.obtainCard("b2-modeling_clay") as ItemCard; game.cardHandler.addInPlay(p2!, clay);
        await drain(game);
        await game.activateItem(p2!, clay, [shadow]); await drain(game);
        const item = game.obtainCard("b2-placebo") as ItemCard; game.cardHandler.addInPlay(p3!, item);
        await drain(game);
        const choosers: Player[] = [];
        const orig = game.select.bind(game);
        (game as any).select = async (...args: any[]) => { choosers.push(args[0]); return (orig as any)(...args); };
        return { game, p1, p2: p2!, p3: p3!, shadow, clay, choosers };
    }
    it("original shadow leaves: the clay copy's owner still chooses", async () => {
        const { game, p1, p2, p3, shadow, choosers } = await s3();
        game.cardHandler.destroyCardsOrSouls([shadow]); await drain(game);
        expect(p1.inPlay.includes(shadow)).toBe(false);
        game.entityHandler.kill(p1, p3, { card: p1.character, visualEffectBox: undefined } as any); await drain(game);
        expect(choosers).toContain(p2);
    });
    it("both leave (original first): nobody else chooses afterwards", async () => {
        const { game, p1, p2, p3, shadow, clay, choosers } = await s3();
        game.cardHandler.destroyCardsOrSouls([shadow]); await drain(game);
        game.cardHandler.destroyCardsOrSouls([clay]); await drain(game);
        game.entityHandler.kill(p1, p3, { card: p1.character, visualEffectBox: undefined } as any); await drain(game);
        expect(choosers).not.toContain(p1);
        expect(choosers).not.toContain(p2);
    });
});

import { EffectData } from "../../models/types/cardTypes";
import * as passive from "../../models/effects/passiveEffect";
describe("prevent the first damage each turn", () => {
    it("prevent first 1 damage each turn gained after taking damage this turn must not prevent the second damage", async () => {
        const { game, p1, p2 } = await setup();
        game.entityHandler.addHealth(p1, 10, "other");
        const hit = async () => { game.entityHandler.dealDamage(p2, p1, { card: p2.character, visualEffectBox: undefined } as any, 1); await drain(game); };
        let h = p1.currentHealthPoints; await hit(); expect(p1.currentHealthPoints).toBe(h - 1);
        const item = give(game, p1, "b2-placebo");
        passive.preventFirstDamageEachTurnEffect(1, game)(new EffectData(item, () => p1, [], undefined as any));
        h = p1.currentHealthPoints; await hit();
        expect(p1.currentHealthPoints).toBe(h - 1);
    });
});
