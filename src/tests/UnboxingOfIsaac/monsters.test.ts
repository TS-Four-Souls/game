import { ItemCard, MonsterCard } from "@/models/cards";
import type { DeathOnStack, DiceRoll } from "@/models/stackElement";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";


describe("Unboxing Monsters ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(async () => {
        const setup = await setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: [],
                        playerCount: 2,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.resetStack();
        game.resetCallbacks();
    });

    // it("dogma", async () => {
    //     const mob = game.obtainCard("box-dogma") as MonsterCard;
    //     expect(mob).toBeInstanceOf(MonsterCard);
        
    //     game.encounters.forceSetMonsterAtSlot(0, mob);
    //     const ent = game.monsters[0]!;
    // });

    it("evis", async () => {
        const mob = game.obtainCard("box-evis") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        await game.endTurn();
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.stack.isEmpty()).toBe(true);

        await game.endTurn();
        game.random = () => 0.5;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.stack.isEmpty()).toBe(true);
        game.actions.declareAttack(player1);
        expect(game.actions.canDeclareAttackOnEntity(player1, player2)).toBe(true);
        expect(player2.evasion).toBe(3);
        game.entityHandler.endCombat();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.stack.isEmpty()).toBe(true);
        game.actions.declareAttack(player2);
        expect(game.actions.canDeclareAttackOnEntity(player2, player1)).not.toBe(true);
        
    });

    it("teratoma", async () => {
        const mob = game.obtainCard("box-teratoma") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        for (let i = 0; i < 4; i++) {
            game.entityHandler.dealDamage(player1, ent, {card: mob, visualEffectBox: undefined}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(ent.card.counters.getIfDefined("spider")).toBe(i+1);
        }
        game.entityHandler.dealDamage(player1, ent, {card: mob, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(5);
    });

    it("delirium", async () => {
        const mob = game.obtainCard("box-delirium") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints-1);

        game.entityHandler.addHealth(game.monsters[0]!, 100, "other");
        game.cardHandler.removeSoul(player1, player1.souls[0]!);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints-2);
    });

     it("delirium_2", async () => {
        const mob = game.obtainCard("box-delirium_2") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;

        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        game.random = () => 0.43231;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(1);
        for(const slug of ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot"])
        {
            const card = game.obtainCard(slug);
            game.cardHandler.addInPlay(player1, card as ItemCard);
        }
        const firstItem = player1.inPlay[1]!;
        game.entityHandler.kill(player1, player1, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.includes(firstItem)).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.cardHandler.removeSoul(player1, player1.souls[0]!);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.entityHandler.kill(player1, player1, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.includes(firstItem)).toBe(false);
    });

    it("greedling_rush", async () => {
        const mob = game.obtainCard("box-greedling_rush") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[2]!;
        let val = 0;
        for (let i = 0; i < 5; i++) {
            game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            val += 6;
            expect(game.monsters[2]!.card.slug).toBe("box-greedling_rush");
            expect(player1.coins).toBe(val);
        }

        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        val += 6;
        expect(game.monsters[2]!.card.slug).not.toBe("box-greedling_rush");
        expect(player1.coins).toBe(val);
    });

    it("the_adversary 3", async () => {
        const mob = game.obtainCard("box-the_adversary") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        await game.endTurn();
        game.random = () => 6/6-0.01;
        await game.actions.resolveStack();
        const dcs = game.monsters.map(m => game.entityHandler.getDC(m));
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const dcs2 = game.monsters.map(m => game.entityHandler.getDC(m) - 1);
        expect(dcs).toEqual(dcs2);
    });
    it("the_adversary 2", async () => {
        const mob = game.obtainCard("box-the_adversary") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        await game.endTurn();
        game.random = () => 4/6-0.01;
        await game.actions.resolveStack();
        const slugs = game.encounters.cardsOnTop.filter(c => c != ent.card).map(m => m!.slug);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const slugs2 = game.encounters.cardsOnTop.filter(c => c != ent.card).map(m => m!.slug);
        for (const slug of slugs2) {
            expect(slugs.includes(slug)).toBe(false);
        }
    });

    it("the_adversary 1", async () => {
        const mob = game.obtainCard("box-the_adversary") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        await game.endTurn();
        game.random = () => 1/6-0.01;
        await game.actions.resolveStack();
        const slugs = game.encounters.cardsOnTop.filter(c => c != ent.card).map(m => m!.slug);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const slugs2 = game.encounters.cardsOnTop.filter(c => c != ent.card).map(m => m!.slug);
        for (const slug of slugs2) {
            expect(slugs.includes(slug)).toBe(false);
        }
    });

    it("big_horn", async () => {
        const mob = game.obtainCard("box-big_horn") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, ent);
        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.isDead).toBe(true);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("loki", async () => {
        const mob = game.obtainCard("box-loki") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, ent);
        game.random = () => 1/6-0.01;
        game.entityHandler.addHealth(player1, 100, "other");
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.cardsOnTop.length).toBe(3);
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.cardsOnTop.length).toBe(4);
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.cardsOnTop.length).toBe(5);
        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.cardsOnTop.length).toBe(5);
    });

    it("eggy 1=3", async () => {
        const mob = game.obtainCard("box-eggy") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        game.random = () => 5/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.encounters.cardsOnTop.length).toBe(5);
    });

    it("eggy 2", async () => {
        const mob = game.obtainCard("box-eggy") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        game.random = () => 3/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.encounters.cardsOnTop.length).toBe(4);
    });

    it("eggy 1", async () => {
        const mob = game.obtainCard("box-eggy") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        game.random = () => 1/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.encounters.cardsOnTop.length).toBe(3);
    });

    it("christian_broadcasts", async () => {
        const mob = game.obtainCard("box-christian_broadcasts") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsterSlots.cardsOnTop.length).toBe(4);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(2);
        expect(game.stack.elements[0]!.json.type).toBe("death");
        expect((game.stack.elements[0]! as DeathOnStack).json.receiver.type).toBe("monster");
        expect(game.stack.elements[1]!.json.type).toBe("death");
        expect((game.stack.elements[1]! as DeathOnStack).json.receiver.type).toBe("player");

    });

    it("tv_static", async () => {
        const mob = game.obtainCard("box-tv_static") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        const slugs = game.monsters.map(m => m.card.slug);
        expect(slugs.length).toBe(1);

        await game.actions.resolveStack();
        const slugs2 = game.encounters.cardsOnTop.map(m => m!.slug);
        for (const slug of slugs2) {
            expect(slugs.includes(slug)).toBe(false);
        }
        expect(slugs2.length).toBe(3);
        expect(player1.attackThisTurn).toBe(2);
    });

    it("dogma 2", async () => {
        const mob = game.obtainCard("box-dogma") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        const e2 = game.monsters[1]!;
        game.entityHandler.kill(player1, ent, {card: mob, visualEffectBox: undefined});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(e2.isDead).toBe(true);
        expect(ent.isDead).toBe(true);
    });

    it("dogma", async () => {
        const mob = game.obtainCard("box-dogma") as MonsterCard;
        expect(mob).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, mob);
        const ent = game.monsters[0]!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, ent);
        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1, ent);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.isDead).toBe(true);
        expect(player2.isDead).toBe(true);
    });
});