import { Game } from "../../models/game";
import type { ItemCard, LootCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { DamageOnStack, AttackRollData, DiceRoll } from "../../models/stackElement";
import { TargetBuilder } from "@/models/targetBuilder";

describe("Warp Zone Treasures", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    rooms: true,
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("rwz-grubfather", async () => {
        const card1 = game.obtainCard("rwz-grubfather") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        const evasions = game.monsters.map(m => m.evasion);
        game.gainTreasure(player1, 1);
        expect(game.monsters.map(m => m.evasion - 1)).toEqual(evasions);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.evasion)).toEqual(evasions);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.evasion - 1)).toEqual(evasions);

        await game.activateItem(player1, player1.inPlay[1]!, [player1.inPlay[2], player2], 0 );
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(1);
        expect(player2.inPlay.length).toBe(2);
    });

    it("rwz-golden_idol", async () => {
        const card1 = game.obtainCard("rwz-golden_idol") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(10);
        game.actions.declareAttack(player2);
        expect(game.actions.canDeclareAttackOnEntity(player2, player1)).toBe(true);
        game.entityHandler.kill(player2, player1, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.inPlay.length).toBe(2);
        expect(player1.inPlay.length).toBe(1);
    });

    it("rwz-peeper 2", async () => {
        const card1 = game.obtainCard("rwz-peeper") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 1/6-0.01;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.entitiesInCombat.length).toBe(0);
    });
    it("rwz-peeper", async () => {
        const card1 = game.obtainCard("rwz-peeper") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.kill(player1, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        expect(player1.currentHealthPoints).toBe(3);
    });
    it("rwz-nightmare_tick 2", async () => {
        const card1 = game.obtainCard("rwz-nightmare_tick") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        game.random = () => 0.01;
        const dice = game.rollDice(player1, card1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(dice.value).toBe(2);
    });
    it("rwz-nightmare_tick", async () => {
        const card1 = game.obtainCard("rwz-nightmare_tick") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.isDead).toBe(true);
    });
    it("rwz-brea_in_distress 2", async () => {
        const card1 = game.obtainCard("rwz-brea_in_distress") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        expect(player1.currentHealthPoints).toBe(3);
    });

    it("rwz-brea_in_distress 1", async () => {
        const card1 = game.obtainCard("rwz-brea_in_distress") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.resolveEntireStack();
        expect(game.currentPlayer).toBe(player2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.resolveEntireStack();
        expect(game.currentPlayer).toBe(player2);
    });

    it("rwz-balrog", async () => {
        const card1 = game.obtainCard("rwz-balrog") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.kill(player1, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
        await game.activateItem(player1, player1.inPlay[1]!, [player2], "tap" );
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
    });

    it("rwz-the_gorm 2", async () => {
        const card1 = game.obtainCard("rwz-the_gorm") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 1/6-0.01;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints-2);
        game.random = () => 6/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints-3);
    });
 
    it("rwz-the_gorm", async () => {
        const card1 = game.obtainCard("rwz-the_gorm") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.loot(player1, 1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(1);
    });
 
    it("rwz-the_butcher", async () => {
        const card1 = game.obtainCard("rwz-the_butcher") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.kill(mob, player2, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.attackPoints).toBe(3);
        game.entityHandler.kill(mob, player1, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.attackPoints).toBe(4);
        game.random = () => 1/6-0.01;
        game.actions.declareAttack(player2);
        game.entityHandler.addHealth(player2, 9, "other");
        await game.actions.declareAttackOnEntity(player2, mob);
        game.actions.attackRoll(player2);
        await game.actions.resolveStack();
        game.random = () => 5/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
    });
 
    it("rwz-time_eater 2", async () => {
        const card1 = game.obtainCard("rwz-time_eater") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.cardHandler.addToCounter(player1, mob.card, "normal", 11);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.won).toBe(true);
    });
    it("rwz-time_eater", async () => {
        const card1 = game.obtainCard("rwz-time_eater") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.kill(player1, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1);
    });
 
    it("rwz-the_purple_shirted_eye_stabber", async () => {
        const card1 = game.obtainCard("rwz-the_purple_shirted_eye_stabber") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        const loot = game.obtainCard("b2-a_dime") as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        await game.actions.playCard(player1, 0);
        await game.resolveEntireStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(2);
        await game.actions.resolveStack();
    });
 
    it("rwz-shopkeeper 2", async () => {
        const card1 = game.obtainCard("rwz-shopkeeper") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.9;
        game.actions.declarePurchase(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.actions.canPurchase(player1, 0, false)).toBe(true);
    });
 
    it("rwz-shopkeeper", async () => {
        const card1 = game.obtainCard("rwz-shopkeeper") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.4;
        game.actions.declarePurchase(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hasAttackRequirement).toBe(true);
    });
 
    it("rwz-zombie_jesus", async () => {
        const card1 = game.obtainCard("rwz-zombie_jesus") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.isDead).toBe(true);
        game.entityHandler.kill(mob, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
    });
 
    
 
    it("rwz-qwop", async () => {
        const card1 = game.obtainCard("rwz-qwop") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        let value = 6;
        game.random = () => value-- / 6 - 0.01;
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(7);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.isDead).toBe(false);
        expect(player1.inPlay.length).toBe(2);
        expect(player2.inPlay.length).toBe(1);
        expect(player2.coins).toBe(0); // p2 dies
        expect(player1.coins).toBe(1);
    });
 
    it("rwz-lil_hunter", async () => {
        const card1 = game.obtainCard("rwz-lil_hunter") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.actions.resolveStack();
        expect(game.encounters.cardsOnTop.length).toBe(3);
        expect(player1.hasAttackRequirement).toBe(true);
        player1.clearAttackRequirement();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.decks.monster.cards[3]!.slug).toBe("rwz-lil_hunter");
    });
 
    it("rwz-keke_is_you", async () => {
        const card1 = game.obtainCard("rwz-keke_is_you") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.entityHandler.kill(player2, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.isDead).toBe(false);
        expect(player2.hand.length).toBe(4);
        expect(player1.isDead).toBe(true);
    });

 
    it("rwz-javon", async () => {
        const card1 = game.obtainCard("rwz-javon") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        await game.endTurn();
        game.random = () => 0.99;
        const slugs = game.shop.cardsOnTop.map(c => c!.slug);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(slugs).not.toEqual(game.shop.cardsOnTop.map(c => c!.slug));
        expect(player2.currentHealthPoints).toBe(1);
    });
 
    it("rwz-hubert_cumberdale", async () => {
        const card1 = game.obtainCard("rwz-hubert_cumberdale") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.dealCombatDamage(mob, player1, {card: card1, visualEffectBox: null as any}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.entityHandler.kill(mob, mob, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.isDead).toBe(true);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.card.slug)).toContain("rwz-hubert_cumberdale");
        game.entityHandler.kill(mob, game.monsters[1]!, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.card.slug)).not.toContain("rwz-hubert_cumberdale");
    });
 
    it("rwz-exposito", async () => {
        const card1 = game.obtainCard("rwz-exposito") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.cardHandler.addToCounter(mob, card1, "normal", 4);
        game.entityHandler.kill(player1, game.monsters[1]!, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(card1.counters.value("normal")).toBe(5);
        game.entityHandler.kill(player1, game.monsters[1]!, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(card1.counters.value("normal")).toBe(6);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(mob.isDead).toBe(true);
    });
 
    it("rwz-the_radiance", async () => {
        const card1 = game.obtainCard("rwz-the_radiance") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        const initDc = mob.evasion;
        game.entityHandler.kill(player2, player2, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.evasion).toBe(initDc - 1);
        game.entityHandler.kill(player1, player1, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.evasion).toBe(initDc - 2);
        expect(player2.hand.length).toBe(2);
    });
 
    it("rwz-the_collector", async () => {
        const card1 = game.obtainCard("rwz-the_collector") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        const initHealth = mob.healthPoints;
        game.entityHandler.kill(player2, player2, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.healthPoints).toBe(initHealth + 1);
        game.entityHandler.kill(player1, player1, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.healthPoints).toBe(initHealth + 2);
    });
 
    it("rwz-melquiades", async () => {
        const card1 = game.obtainCard("rwz-melquiades") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.entityHandler.addHealth(mob, 1, "other");
        const initEvasion = mob.evasion;
        for( let i=0; i<4; i++) {
            game.entityHandler.dealDamage(mob, mob, {card: card1, visualEffectBox: null as any}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(mob.evasion).toBe(initEvasion);
        }
        game.entityHandler.dealDamage(mob, mob, {card: card1, visualEffectBox: null as any}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(mob.evasion).toBe(initEvasion-2);
    });
 
    it("rwz-leatherneck", async () => {
        const card1 = game.obtainCard("rwz-leatherneck") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.random = () => 0.1;
        game.entityHandler.dealDamage(mob, mob, {card: card1, visualEffectBox: null as any}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
    });
 
    it("rwz-grandparent", async () => {
        const card1 = game.obtainCard("rwz-grandparent") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!

        game.actions.declareAttack(player1);
        const initAtk = mob.attackPoints;
        await game.actions.declareAttackOnEntity(player1, mob);
        await game.actions.resolveStack();
        expect(initAtk+1).toBe(mob.attackPoints);
        game.entityHandler.endCombat();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player2);
         await game.actions.declareAttackOnEntity(player2, mob);
        await game.actions.resolveStack();
        expect(initAtk+2).toBe(mob.attackPoints);
        game.entityHandler.endCombat();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(3);
        expect(game.stack.peek() instanceof DamageOnStack).toBe(true);
        const damage = game.stack.peek() as DamageOnStack;
        expect(damage.damage[0]!).toBe(3);
        
    });
 
    it("rwz-fuck_bloat", async () => {
        const card1 = game.obtainCard("rwz-fuck_bloat") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
    });
 
    it("rwz-dont_starve", async () => {
        const card1 = game.obtainCard("rwz-dont_starve") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player2);
    });
 
    it("rwz-death_trapper", async () => {
        const card1 = game.obtainCard("rwz-death_trapper") as MonsterCard;
        game.encounters.expand(1);
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        const evasions = game.monsters.map(m => game.entityHandler.getDC(m));
        game.entityHandler.dealDamage(mob, mob, {card: card1, visualEffectBox: null as any}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters.map(m => game.entityHandler.getDC(m) - 1)).toEqual(evasions);
        game.entityHandler.addHealth(game.monsters[1]!, 1, "other");
        game.entityHandler.dealDamage(game.monsters[1]!, game.monsters[1]!, {card: card1, visualEffectBox: null as any}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters.map(m => game.entityHandler.getDC(m) - 2)).toEqual(evasions);

    });
 
    it("rwz-curse_of_the_suspicious", async () => {
        const card1 = game.obtainCard("rwz-curse_of_the_suspicious") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player2);
        expect(game.actions.canDeclareAttackOnEntity(player2, player1, false)).toBe(true);
    });
 
    it("rwz-ballos", async () => {
        const card1 = game.obtainCard("rwz-ballos") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        const initAtk = mob.attackPoints;
        game.entityHandler.kill(mob, mob, {card: card1, visualEffectBox: null as any})
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters.map(e=>e.card).includes(card1)).toBe(true);
        expect(game.entityHandler.getAttack(card1.entity!)).toBe(initAtk+2);
        game.entityHandler.kill(game.monsters[1]!, game.monsters[1]!, {card: card1, visualEffectBox: null as any})
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.monsters.map(e=>e.card).includes(card1)).toBe(false);
    });

    it("rwz-a_dead_horse", async () => {
        const card1 = game.obtainCard("rwz-a_dead_horse") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        game.random = () => 3/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(3);
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.entitiesInCombat.length).toBe(0);
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
    });
});


describe("Monster Cards RWZ - 3 players tests", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(async () => {
            const setup = await setupTestGame({
                        characters: ["b2-judas", "b2-isaac", "b2-samson"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                        playerCount: 3
                    });
            game = setup.game;
            player1 = setup.player1;
            player2 = setup.player2!;
            player3 = setup.player3!;
        });

    it("rwz-trial_by_trolley", async () => {
        const card1 = game.obtainCard("rwz-trial_by_trolley") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        let value = 6;
        game.random = () => value-- / 6 - 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.isDead).toBe(true);
        expect(player3.isDead).toBe(false);
    });

    it("rwz-the_impostor", async () => {
        const card1 = game.obtainCard("rwz-the_impostor") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, card1);
        const mob = game.monsters[0]!
        let value = 6;
        game.random = () => value-- / 6 - 0.01;
        game.entityHandler.kill(player1, player2, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.isDead).toBe(true);
        expect(player3.isDead).toBe(false);
    });
});