import { Game } from "../../models/game";
import type { ItemCard, LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { setupTestGame } from "../testHelpers";
import { TargetBuilder } from "@/models/targetBuilder";
import { EffectOnStack } from "@/models/stackElement";

async function drain(game: Game, max: number = 60) { let i = 0; while (!game.stack.isEmpty() && i++ < max) await game.actions.resolveStack(); }

async function setup(chars: string[] = ["b2-isaac", "b2-lilith"]) {
    const s = await setupTestGame({
        characters: chars,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card", "b2-the_polaroid", "b2-spoon_bender"],
        playerCount: 2
    });
    return { game: s.game, p1: s.player1, p2: s.player2! };
}

describe("core rules", () => {
    it("r-all_hallows_eve: a killed monster whose soul can't be gained goes to discard (not lost)", async () => {
        const s = await setupTestGame({
            characters: ["b2-isaac", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
            rooms: true,
            playerCount: 2
        });
        const game = s.game, p1 = s.player1;
        const room = game.obtainCard("r-all_hallows_eve") as any;
        game.rooms?.forceRoomAtSlot(0, room);
        await drain(game);
        const boss = game.obtainCard("b2-gurdy") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, boss);
        await drain(game);
        const mob = game.monsters.find(m => m.card === boss)!;
        game.entityHandler.kill(p1, mob, { card: p1.character, visualEffectBox: null as any });
        await drain(game);
        expect(p1.totalSouls).toBe(0);
        const inDiscard = game.decks.monster.discard.includes(boss);
        const inSlots = game.encounters.slots.some(sl => sl.includes(boss));
        const inDeck = game.decks.monster.cards.includes(boss);
        expect(inDiscard || inSlots || inDeck).toBe(true);
    });
    it("r-all_hallows_eve: a bonus soul whose condition is met while souls can't be gained stays available", async () => {
        const s = await setupTestGame({
            characters: ["b2-isaac", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            rooms: true,
            playerCount: 2
        });
        const game = s.game, p1 = s.player1;
        const room = game.obtainCard("r-all_hallows_eve") as any;
        game.rooms?.forceRoomAtSlot(0, room);
        await drain(game);
        game.gainCoins(p1, 30, "debug");
        await drain(game);
        expect(p1.totalSouls).toBe(0);
        const greed = game.bonusSouls?.find(b => b.slug === "b2-soul_of_greed");
        expect(greed?.granted).toBe(false);
    });

    it("r-punching_bag: damage on an attackable item heals at end of turn", async () => {
        const { game, p1, p2 } = await setup();
        const bag = game.obtainCard("r-punching_bag") as ItemCard;
        game.cardHandler.addInPlay(p1, bag);
        await drain(game);
        const ent = bag.entity!;
        expect(ent).toBeDefined();
        game.entityHandler.dealDamage(p2, ent, { card: p2.character, visualEffectBox: null as any }, 1);
        await drain(game);
        expect(ent.currentHealthPoints).toBe(ent.healthPoints - 1);
        await game.endTurn();
        await drain(game);
        expect(ent.currentHealthPoints).toBe(ent.healthPoints);
        expect(ent.damageTakenThisTurn.length).toBe(0);
    });

    it("an ability costing [HP] can't be paid without enough HP", async () => {
        const { game, p1 } = await setup();
        const paw = game.obtainCard("box-satanic_bible") as ItemCard;
        game.cardHandler.addInPlay(p1, paw);
        const cost = paw.activeEffectList.find(e => e.index !== "tap")!.description;
        expect(TargetBuilder.verifyPaiementCanBeMade(game, p1, paw, cost)).toBe(true);
        p1.receiveDamage(p1.currentHealthPoints, null, null, false);
        expect(TargetBuilder.verifyPaiementCanBeMade(game, p1, paw, cost)).not.toBe(true);
    });

    it("each choose-one option of a paid ability maps to its own text box (rwz-spelunking_pack)", async () => {
        const { game, p1 } = await setup();
        const pack = game.obtainCard("rwz-spelunking_pack") as ItemCard;
        game.cardHandler.addInPlay(p1, pack);
        const options = TargetBuilder.getNextSelector(game, p1, pack, [], 0, false, true).options as any[];
        const boxes = options.map(o => o.payload.visualEffectBox.startIndex);
        expect(boxes).toEqual([2, 3, 4]);
        for (const box of boxes)
            expect(TargetBuilder.validTargetExists(game, p1, pack, 0, box)).toBe(true);
    });

    it("choose-one options keep their text box after r-magic_marker changes a number in them", async () => {
        const { game, p1 } = await setup();
        const fa = game.obtainCard("b2-forever_alone") as ItemCard;
        game.cardHandler.addInPlay(p1, fa);
        const mm = game.obtainCard("r-magic_marker") as LootCard;
        game.cardHandler.addCardToHand(p1, mm);
        game.select = async (_player: any, _min: number, _max: number, options: any[]) => {
            // The "1" of "loot 1", then 2.
            const choice = typeof options[0] === "number" ? 2 : options.find(o => o.textThroughNumber?.endsWith("loot 1"));
            return { selected: [choice], remaining: options.filter(o => o !== choice) };
        };
        game.actions.playCard(p1, p1.hand.cards.indexOf(mm), [fa]);
        await drain(game);
        expect(fa.effectOutcomes[0]).toContain("loot 2");
        for (const entry of fa.activeEffectList)
            expect(TargetBuilder.validTargetExists(game, p1, fa, "tap", entry.visualEffectBox.startIndex)).toBe(true);
    });

    it("reading counters does not create them (b2-the_dead_cat still starts with 9)", async () => {
        const { game, p1 } = await setup();
        const cat = game.obtainCard("b2-the_dead_cat") as ItemCard;
        expect(cat.counters.value("normal")).toBe(0);
        expect(cat.counters.json).toBeUndefined();
        game.cardHandler.addInPlay(p1, cat);
        await drain(game);
        expect(cat.counters.value("normal")).toBe(9);
    });

    it("box-my_little_unicorn: the turn still ends when what resolves meanwhile adds an attack requirement (e.g. Lust For Blood!)", async () => {
        const { game, p1, p2 } = await setup();
        const unicorn = game.obtainCard("box-my_little_unicorn") as ItemCard;
        game.cardHandler.addInPlay(p1, unicorn);
        await game.activateItem(p1, unicorn, [], "tap");
        await game.actions.resolveStack();
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, game.monsters[0]!);
        game.random = () => 0.3; // rolls a 2: cancel everything and end the turn
        game.actions.attackRoll(p1);
        // Finishes once the stack is cancelled, and adds an effect adding a requirement before the turn ends.
        void game.executeWhenStackSubset([], () => {
            game.addToStack(new EffectOnStack(async () => { game.entityHandler.playerMustAttack(p1, "any", unicorn, false); return true; },
                { issuer: p1, it: unicorn, targets: [], selectedOnResolve: [] } as any, "requirement", "passive"));
        }, false);
        await drain(game);
        expect(game.currentPlayer).toBe(p2);
    });
});
