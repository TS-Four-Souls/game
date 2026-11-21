import type { ItemCard, LootCard, RoomCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { EffectOnStack, DiceRoll } from "../../models/stackElement";
import { setupTestGame } from "../testHelpers";

async function setup3() {
    const setup = await setupTestGame({
        characters: ["b2-isaac", "b2-judas", "b2-samson"],
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-conjoined_fatty", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
        bonusSouls: [],
        playerCount: 3,
        rooms: true,
    });
    setup.game.resetStack();
    setup.game.resetCallbacks();
    return { ...setup, player2: setup.player2!, player3: setup.player3! };
}

describe("Requiem interactions", () => {
    it("keepers_sack + rib_of_greed: rib prevents the discard", async () => {
        const { game, player1 } = await setup3();
        const rib = game.obtainCard("r-rib_of_greed") as LootCard;
        game.cardHandler.addCardToHand(player1, rib);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        const sack = game.obtainCard("r-keepers_sack") as TreasureCard;
        game.decks.treasure.addTopPosition(sack);
        game.gainTreasure(player1, 1);
        await game.actions.resolveStack();
        game.loot(player1, 2);
        await game.actions.resolveStack();
        const before = player1.hand.length;
        await game.endTurn();
        for (let i = 0; i < 4; i++) await game.actions.resolveStack();
        expect(player1.hand.length).toBe(before); // Rib of Greed: abilities can't make you discard
    });

    it("rib_of_greed does not stop paying a discard cost (rwz-fiend_fire)", async () => {
        const { game, player1 } = await setup3();
        player1.hand._hand.splice(0);
        const rib = game.obtainCard("r-rib_of_greed") as LootCard;
        game.cardHandler.addCardToHand(player1, rib);
        game.actions.playCard(player1, 0, []);
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        expect(player1.inPlay.includes(rib)).toBe(true);
        const ff = game.obtainCard("rwz-fiend_fire") as LootCard;
        game.cardHandler.addCardToHand(player1, ff);
        game.loot(player1, 2);
        game.actions.playCard(player1, player1.hand.cards.indexOf(ff), []);
        expect(player1.hand.length).toBe(0); // the cost is paid
    });

    it("rwz-fiend_fire can be played with nothing else in hand (discarding an empty hand)", async () => {
        const { game, player1 } = await setup3();
        player1.hand._hand.splice(0);
        const ff = game.obtainCard("rwz-fiend_fire") as LootCard;
        game.cardHandler.addCardToHand(player1, ff);
        await game.actions.playCard(player1, 0, []);
        for (let i = 0; i < 6 && !game.stack.isEmpty(); i++) await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(game.decks.loot.discard).toContain(ff);
    });

    it("ultra_greed: extra rolls in turn order (left of active first)", async () => {
        const { game, player1, player2 } = await setup3();
        const mob = game.obtainCard("r-ultra_greed") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.random = () => 0.01;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, ent);
        await game.actions.resolveStack();
        await game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        const effects = game.stack.elements.filter(e => e instanceof EffectOnStack) as EffectOnStack[];
        expect(effects.length).toBe(2);
        const top = game.stack.peek() as any;
        expect(top.data.issuer.id).toBe(player2.id); // player2 is to player1's left, should roll first
    });

    it("null: first attack roll of the next turn deals damage like on the first turn", async () => {
        const { game, player1, player2 } = await setup3();
        const mob = game.obtainCard("r-null") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.addHealth(player1, 5, mob);
        game.entityHandler.addHealth(player2, 5, mob);
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, ent);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        for (let i = 0; i < 3; i++) await game.actions.resolveStack();
        expect(ent.currentHealthPoints).toBe(ent.healthPoints - 1); // turn 1, roll 1: damage
        game.entityHandler.endCombat();
        await game.endTurn();
        for (let i = 0; i < 6; i++) await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        expect(ent.currentHealthPoints).toBe(ent.healthPoints);
        game.actions.declareAttack(player2);
        game.actions.declareAttackOnEntity(player2, ent);
        game.random = () => 0.99;
        game.actions.attackRoll(player2);
        for (let i = 0; i < 3; i++) await game.actions.resolveStack();
        const afterFirst = ent.currentHealthPoints;
        game.actions.attackRoll(player2);
        for (let i = 0; i < 3; i++) await game.actions.resolveStack();
        // like on turn 1: roll 1 hits, roll 2 is prevented
        expect([afterFirst, ent.currentHealthPoints]).toEqual([ent.healthPoints - 1, ent.healthPoints - 1]);
    });

    it("shadow_of_famine: paid abilities count as activated abilities", async () => {
        const { game, player1 } = await setup3();
        const famine = game.obtainCard("r-shadow_of_famine") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, famine);
        const bat = game.obtainCard("r-car_battery") as ItemCard;
        game.cardHandler.addInPlay(player1, bat);
        game.gainCoins(player1, 14, "debug");
        game.cardHandler.deactivateItem(bat);
        await game.activateItem(player1, bat, [], 0);
        for (let i = 0; i < 4; i++) await game.actions.resolveStack();
        expect(player1.coins).toBe(7);
        expect(bat.charged).toBe(true);
        game.cardHandler.deactivateItem(bat);
        // a second activated ability in the same turn must be refused
        expect(game.actions.canActivate(bat, player1)).not.toBe(true);
    });

    for (const [slug, target] of [["r-blind_rage", "topDeck"], ["r-blood_lust", "any"]] as const)
        it(`${slug} applies again on an extra turn of the same player`, async () => {
            const { game, player1 } = await setup3();
            const room = game.obtainCard(slug) as RoomCard;
            game.rooms?.forceRoomAtSlot(0, room);
            game.resetStack();
            expect(player1.mustAttackEntity.some(r => r.targets === target)).toBe(true);
            player1.clearAttackRequirementsFromSource(room); // as if it was satisfied this turn
            game.addExtraTurn(player1);
            await game.endTurn();
            for (let i = 0; i < 6 && !game.stack.isEmpty(); i++) await game.actions.resolveStack();
            expect(game.currentPlayer).toBe(player1);
            expect(player1.mustAttackEntity.some(r => r.targets === target)).toBe(true);
        });

    it("charmed_monstro: cancelling the redirect gives the soul to the active player", async () => {
        const { game, player1, player2, player3 } = await setup3();
        const mob = game.obtainCard("r-charmed_monstro") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        game.entityHandler.kill(player1, game.monsters[0]!, { card: mob, visualEffectBox: undefined });
        let redirect: EffectOnStack | undefined;
        for (let i = 0; i < 6 && !redirect && !game.stack.isEmpty(); i++) {
            redirect = game.stack.elements.find(e => e instanceof EffectOnStack && e.data.it === mob) as EffectOnStack | undefined;
            if (!redirect) await game.actions.resolveStack();
        }
        expect(redirect).toBeDefined();
        game.stack.cancelElement(redirect!);
        for (let i = 0; i < 6 && !game.stack.isEmpty(); i++) await game.actions.resolveStack();
        expect(player1.souls).toContain(mob);
        expect(player2.totalSouls + player3.totalSouls).toBe(0);
    });
});
