import { Game } from "../../models/game";
import type { ItemCard, RoomCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { describe, expect, it } from "bun:test";
import { setupTestGame } from "../testHelpers";

async function drain(game: Game, max: number = 50) { let i = 0; while (!game.stack.isEmpty() && i++ < max) await game.actions.resolveStack(); }

async function setup(chars: string[]) {
    const s = await setupTestGame({
        characters: chars,
        monsters: ["b2-fly", "b2-fatty"],
        monsterDeck: ["b2-red_host", "b2-pooter", "b2-cod_worm", "b2-spider", "b2-dip", "b2-leech", "b2-gurdy"],
        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card", "b2-the_polaroid", "b2-spoon_bender", "b2-steamy_sale"],
        rooms: true,
        playerCount: 2
    });
    return { game: s.game, p1: s.player1, p2: s.player2! };
}

describe("death and rewards interactions", () => {
    for (const slug of ["rwz-the_collector", "rwz-the_radiance"]) {
        it(`${slug}: a player dying with Ball of Tumors (no death penalty) still counts`, async () => {
            const { game, p1: lilith, p2: ash } = await setup(["b2-lilith", "rwz-ash"]);
            expect(ash.inPlay[0]!.slug).toBe("rwz-ball_of_tumors");
            const card = game.obtainCard(slug) as MonsterCard;
            game.encounters.forceSetMonsterAtSlot(0, card);
            await drain(game);
            game.entityHandler.kill(lilith, lilith, { card, visualEffectBox: null as any });
            await drain(game);
            expect(card.counters.value("normal")).toBe(1);
            game.entityHandler.kill(lilith, ash, { card, visualEffectBox: null as any });
            await drain(game);
            expect(ash.stats.nbDeaths).toBe(1);
            expect(card.counters.value("normal")).toBe(2);
        });
    }

    it("r-blood_puppy levels up when a player with Ball of Tumors dies", async () => {
        const { game, p1: lilith, p2: ash } = await setup(["b2-lilith", "rwz-ash"]);
        const pup = game.obtainCard("r-blood_puppy") as ItemCard;
        game.cardHandler.addInPlay(lilith, pup);
        await drain(game);
        const tumors = ash.inPlay[0]! as ItemCard;
        const level = tumors.counters.value("normal");
        game.entityHandler.kill(lilith, ash, { card: pup, visualEffectBox: null as any });
        await drain(game);
        expect(pup.counters.value("normal")).toBe(1);
        // Ball of Tumors still replaces the penalty.
        expect(tumors.counters.value("normal")).toBe(level - 1);
    });

    it("attacking the monster deck and revealing an indomitable monster attacks it", async () => {
        const { game, p1 } = await setup(["b2-isaac", "b2-lilith"]);
        const mob = game.obtainCard("rwz-the_gorm") as MonsterCard;
        expect(mob.indomitable).toBe(true);
        game.cardHandler.addTopPosition("monster", mob);
        await drain(game);
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, "topDeck", 0);
        await drain(game);
        const engaged = game.entitiesInCombat.filter(e => e !== p1).map(e => e.card.slug);
        expect(engaged).toEqual(["rwz-the_gorm"]);
        expect(game.encounters.visible[0]!.slug).toBe("b2-fly");
    });

    it("rwz-focus LV3 + box-moms_heels: each prevents its own first instance", async () => {
        const { game, p1 } = await setup(["rwz-the_knight", "b2-lilith"]);
        for (let i = 0; i < 3; i++) {
            const card = game.decks.loot.draw();
            card.soul = 1;
            game.cardHandler.addSoul(p1, card);
            await drain(game);
        }
        game.cardHandler.addInPlay(p1, game.obtainCard("box-moms_heels") as ItemCard);
        await drain(game);
        await game.endTurn(); await drain(game);
        await game.endTurn(); await drain(game);
        expect(game.currentPlayer).toBe(p1);
        game.entityHandler.addHealth(p1, 5, "other");
        const hp = p1.currentHealthPoints;
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, game.monsters[0]!);
        await drain(game);
        game.random = () => 0.01;
        game.actions.attackRoll(p1);
        await drain(game);
        expect(p1.currentHealthPoints).toBe(hp);
        game.actions.attackRoll(p1);
        await drain(game);
        expect(p1.currentHealthPoints).toBe(hp - 1);
    });

    it("box-dogma: players killed by 'each player dies' are not killed by the attacking player", async () => {
        const { game, p1, p2 } = await setup(["b2-isaac", "b2-lilith"]);
        const mob = game.obtainCard("box-dogma") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        await drain(game);
        const ent = game.monsters.find(m => m.card === mob)!;
        game.actions.declareAttack(p1);
        await game.actions.declareAttackOnEntity(p1, ent);
        await drain(game);
        game.random = () => 0.01;
        game.actions.attackRoll(p1);
        await drain(game);
        expect(p1.stats.nbDeaths).toBe(1);
        expect(p2.stats.nbDeaths).toBe(1);
        expect(p1.stats.nbPlayerKilled).toBe(0);
        expect(p1.stats.nbSuicides).toBe(0);
    });

    it("r-blessing_of_the_sack doubles the rewards of the player who killed the monster", async () => {
        const { game, p1, p2 } = await setup(["b2-isaac", "b2-lilith"]);
        game.rooms?.forceRoomAtSlot(0, game.obtainCard("r-blessing_of_the_sack") as RoomCard);
        game.resetStack();
        const mob = game.obtainCard("r-ultra_greed") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        await drain(game);
        const ent = game.monsters.find(m => m.card === mob)!;
        const c1 = p1.coins, c2 = p2.coins;
        game.entityHandler.kill(p2, ent, { card: mob, visualEffectBox: null as any });
        await drain(game);
        // Ultra Greed's rewards go to the player who killed it, and so does the doubled part.
        expect(p1.coins - c1).toBe(0);
        expect(p2.coins - c2).toBe(80);
    });

    it("r-blessing_of_the_sack doubles rewards gained by box-greedling_rush", async () => {
        const { game, p1 } = await setup(["b2-isaac", "b2-lilith"]);
        game.rooms?.forceRoomAtSlot(0, game.obtainCard("r-blessing_of_the_sack") as RoomCard);
        game.resetStack();
        const mob = game.obtainCard("box-greedling_rush") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, mob);
        await drain(game);
        const ent = game.monsters.find(m => m.card === mob)!;
        const c1 = p1.coins;
        game.entityHandler.kill(p1, ent, { card: mob, visualEffectBox: null as any });
        await drain(game);
        expect(p1.coins - c1).toBe(12);
    });

    it("r-sibling_rivalry: the helper does not gain an 'each player gains' reward twice", async () => {
        const s = await setupTestGame({
            characters: ["r-jacob_and_esau", "b2-samson"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card", "b2-boomerang", "b2-no", "b2-the_polaroid"],
            playerCount: 2
        });
        const { game, player1, player2 } = s;
        const p2 = player2!;
        const eternal = player1.inPlay[0]!;
        expect(eternal.slug).toBe("r-sibling_rivalry");
        const mob = game.monsters[1]!;
        // No monster card has an "each player gains" reward yet (r-gus is a room): give one to this monster.
        Object.defineProperty(mob.card, "rewards", { get: () => ({ treasure: { all: true, count: 1 } }) });
        game.cardHandler.recharge(eternal);
        await game.activateItem(player1, eternal, [p2], "tap");
        await drain(game);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        await drain(game);
        game.random = () => 0.01;
        game.actions.attackRoll(player1);
        await drain(game);
        const i1 = player1.inPlay.length, i2 = p2.inPlay.length;
        game.entityHandler.kill(player1, mob, { card: mob.card, visualEffectBox: null as any });
        await drain(game);
        expect(player1.inPlay.length - i1).toBe(1);
        expect(p2.inPlay.length - i2).toBe(1);
    });

    it("rwz-dont_starve ends after 3 rounds in a row where nothing changes", async () => {
        const { game, p1, p2 } = await setup(["b2-isaac", "b2-lilith"]);
        p1.hand._hand.splice(0);
        p2.hand._hand.splice(0);
        let p1Rounds = 0;
        game.emitter.on("on:damage:would-take", (e: any) => { if (e.eventIssuer === p1) p1Rounds++; e.damageArray[0] = 0; });
        const card = game.obtainCard("rwz-dont_starve") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card);
        await drain(game, 500);
        expect(game.stack.isEmpty()).toBe(true);
        expect(p1.isDead || p2.isDead).toBe(false);
        // Every round changes nothing here: it stops after the third.
        expect(p1Rounds).toBe(3);
    });
});
