import type { ItemCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll } from "../../models/stackElement";
import { setupTestGame, mockGameSelections } from "../testHelpers";

async function drain(game: Game, max = 60) { let i = 0; while (!game.stack.isEmpty() && i++ < max) await game.actions.resolveStack(); }
async function setup(chars = ["b2-samson", "b2-isaac"], n = 2) {
    const s = await setupTestGame({ characters: chars, playerCount: n,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-no", "b2-blank_card", "b2-spoon_bender", "b2-steamy_sale"] });
    mockGameSelections(s.game);
    return { game: s.game, p1: s.player1, p2: s.player2!, p3: s.player3 };
}
async function attackWith(game: Game, p: any, m: any, v: number) {
    game.actions.attackRoll(p);
    const d = game.stack.elements.find(e => e instanceof DiceRoll) as DiceRoll;
    d.value = v;
    await drain(game);
}

describe("base set monster edge cases", () => {
    it("gurdy_jr: does not punish item activation when attacking another monster", async () => {
        const { game, p1 } = await setup();
        await drain(game);
        const card = game.obtainCard("b2-gurdy_jr") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card); await drain(game);
        const fly = game.monsters[1]!;
        game.entityHandler.addHealth(p1, 10);
        game.entityHandler.addHealth(fly, 10);
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, fly); await drain(game);
        const hp = p1.currentHealthPoints;
        const item = game.obtainCard("b2-spoon_bender") as ItemCard;
        // use samson's eternal? use any tap item
        const tap = p1.inPlay[0]!;
        game.cardHandler.recharge(tap);
        await game.activateItem(p1, tap, [p1]);
        await drain(game);
        expect(p1.currentHealthPoints).toBe(hp);
    });

    it("the_haunt: counter resets each turn", async () => {
        const { game, p1, p2 } = await setup();
        await drain(game);
        const card = game.obtainCard("b2-the_haunt") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card); await drain(game);
        const m = game.monsters[0]!;
        game.entityHandler.addHealth(m, 50);
        game.entityHandler.addHealth(p1, 50);
        const dc0 = game.entityHandler.getDC(m);
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, m); await drain(game);
        await attackWith(game, p1, m, 6); // 1st damage this turn
        expect(game.entityHandler.getDC(m)).toBe(dc0);
        game.entityHandler.endCombat(); await drain(game);
        await game.endTurn(); await drain(game);
        expect(game.currentPlayer).toBe(p2);
        game.entityHandler.addHealth(p2, 50);
        game.actions.declareAttack(p2);
        await game.actions.declareAttackOnEntity(p2, m); await drain(game);
        await attackWith(game, p2, m, 6); // first damage of THIS turn
        expect(game.entityHandler.getDC(m)).toBe(dc0);
    });
});
