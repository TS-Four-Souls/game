import { describe, it, expect, beforeEach, expectTypeOf } from "bun:test";
import { Game } from "../../models/game";
import { DamageOnStack, DiceRoll, Player } from "../../models/player";
import type { ItemCard, LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { setupTestGame, emptyHands, mockGameSelections } from "../testHelpers";
import { he, pl } from "zod/locales";

describe("Monsters - Various 2", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card", "b2-placebo", "b2-tech_x"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        mockGameSelections(game);
    });

    it("Each time this deals combat damage to a player, they lose 2¢. (b2-keeper_head)", async () => {
        const card = game.obtainCard("b2-keeper_head") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 10); // Prevent death by damage

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            game.gainCoins(player1, 10); // Give some coins to lose
            const init = player1.coins;
            await game.resolveStack(); // dice
            await game.resolveStack(); // damage
            await game.resolveStack(); // effect
            
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.coins).toBe(init - 2);
        }
    });

    it("Each time this deals combat damage to a player, they discard 1. (b2-scolex)", async () => {
        const card = game.obtainCard("b2-scolex") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 10); // Prevent death by damage

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            game.loot(player1, 3); // Give some cards to lose
            const init = player1.hand.length;
            await game.resolveStack(); // dice
            await game.resolveStack(); // damage
            await game.resolveStack(); // effect

            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.hand.length).toBe(init - 1);
        }
    });

    it("Each time this deals combat damage, it heals 1 [HP] (mega_fatty).", async () => {
        const card = game.obtainCard("b2-mega_fatty") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 10); // Prevent death by damage
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.resolveStack(); // damage

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = monster.currentHealthPoints;
            await game.resolveStack(); // dice
            await game.resolveStack(); // damage
            await game.resolveStack(); // effect

            expect(game.stack.isEmpty()).toBe(true);
            expect(monster.currentHealthPoints).toBe(init + 1);
            game.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
            await game.resolveStack(); // damage
        }
    });

    it("Each time this deals combat damage, it deals 1 damage to each non-active player (the_bloat).", async () => {
        const card = game.obtainCard("b2-the_bloat") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.resolveStack(); // damage

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.addHealth(player1, 10); // Prevent death by damage
            game.addHealth(player2, 10); // Prevent death by damage
            game.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = player2.currentHealthPoints;
            await game.resolveStack(); // dice
            await game.resolveStack(); // damage
            await game.resolveStack(); // effect
            await game.resolveStack(); // damage to p2

            expect(game.stack.isEmpty()).toBe(true);
            expect(player2.currentHealthPoints).toBe(init - 1);
        }
    });

    it("Each time this deals damage, each player loses 4¢. (greed).", async () => {
        const card = game.obtainCard("b2-greed") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 10); // Prevent death by damage
        game.gainCoins(player1, 100);
        game.gainCoins(player2, 100);

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.resolveStack(); // damage

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = player1.coins;
            const init2 = player2.coins;
            await game.resolveStack(); // dice
            await game.resolveStack(); // damage
            await game.resolveStack(); // effect
            
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.coins).toBe(init - 4);
            expect(player2.coins).toBe(init2 - 4);
        }
    });

    it("Combat damage this deals is doubled on attack rolls of 1. (mom).", async () => {
        const card = game.obtainCard("b2-mom") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 100); // Prevent death by damage

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        // ATTACK 1 ~ NO DOUBLE DAMAGE
        const baseDamage = game.getAttack(monster);
        let init = player1.currentHealthPoints;
        game.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do normal damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage);

        // ATTACK 2 ~ DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.attackRoll(player1);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do double damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage * 2);

        // ATTACK 3 ~ INCREASED ATTACK DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.attackRoll(player1);
        game.addAttack(monster, 2); // increase attack to test base damage calculation via entities
        monster.addAttackPoints(2);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do double damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage * 2 - 8); // baseDamage increased by 4, then doubled
    });

    it("Combat damage this deals is increased by 1 on attack rolls of 2. (horf).", async () => {
        const card = game.obtainCard("b2-horf") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 100); // Prevent death by damage

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        // ATTACK 1 ~ NO DOUBLE DAMAGE
        const baseDamage = game.getAttack(monster);
        let init = player1.currentHealthPoints;
        game.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do normal damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage);

        // ATTACK 2 ~ DAMAGE + 1
        init = player1.currentHealthPoints;
        game.attackRoll(player1);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do double damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage - 1);

        // ATTACK 3 ~ INCREASED ATTACK DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.attackRoll(player1);
        game.addAttack(monster, 2); // increase attack to test base damage calculation via entities
        monster.addAttackPoints(2);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do double damage

        await game.resolveStack(); // dice
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage - 1 - 4); // baseDamage increased by 4, then doubled
    });
    
    it("Each time the attacking player activates an item, they take 1 damage. (gurdy_jr).", async () => {
        const card = game.obtainCard("b2-gurdy_jr") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
    
        game.declareAttack(player1);
        game.addHealth(player1, 10); // Prevent death by damage
        const init = player1.currentHealthPoints;
        const chara = player1.inPlay[0]! as ItemCard;

        game.recharge(chara);
        await game.activateItem(player1, chara, []); // Activate first item
        await game.resolveStack(); // item activation
        await game.resolveStack(); // effect
        await game.resolveStack(); // damage

        expect(game.stack._stack.length).toBe(0); // effect to deal damage
        expect(player1.currentHealthPoints).toBe(init - 1);
    });

    it("Choose the player with the most ¢ or tied for the most. That player loses all their ¢. (greed_event).", async () => {
        const card = game.obtainCard("b2-greed_event") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.gainCoins(player1, 5);
        game.gainCoins(player2, 10);
        const coin1 = player1.coins;
        const coin2 = player2.coins;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        expect(game.stack._stack.length).toBe(1); 
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(player1.coins).toBe(coin1);
        expect(player2.coins).toBe(0);
    });

    it("Choose the player with the most ¢ or tied for the most. That player loses all their ¢. (greed_event) test 2.", async () => {
        const card = game.obtainCard("b2-greed_event") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.gainCoins(player1, 10);
        game.gainCoins(player2, 10);
        const coin1 = player1.coins;
        const coin2 = player2.coins;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        expect(game.stack._stack.length).toBe(1); 
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(coin2);
    });
});