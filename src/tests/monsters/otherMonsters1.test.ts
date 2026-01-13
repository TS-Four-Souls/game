import { describe, it, expect, beforeEach, expectTypeOf } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import type { ItemCard, LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { setupTestGame, emptyHands, mockGameSelections } from "../testHelpers";
import { he, pl } from "zod/locales";

describe("Monsters - Various 1", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        mockGameSelections(game);
    });

    it("no damage on attack roll of 4 or 5", async () => {
        const bigSpider = game.obtainCard("b2-carrion_queen") as MonsterCard;
        expect(bigSpider).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, bigSpider);
        const spiderMonster = game.monsters[0]!;
        
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, spiderMonster);
        
        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4
        roll.value = 4;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints);

        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 5
        roll.value = 5;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints);

        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints - 1);
    });

    it("gain damage on damage taken", async () => {
        const card = game.obtainCard("b2-dark_one") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const initAtk = monster.attackPoints;
        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(monster.attackPoints).toBe(initAtk + 1);
    });

    it("gain damage on damage taken multiple times and reset end turn", async () => {
        const card = game.obtainCard("b2-dark_one") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const initAtk = monster.attackPoints;
        game.dealDamage(player1, monster, card, 1);
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        expect(monster.attackPoints).toBe(initAtk + 1);
        
        game.dealDamage(player1, monster, card, 1);
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        expect(monster.attackPoints).toBe(initAtk + 2);

        game.nextTurn(player1);
        await game.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);

        expect(monster.attackPoints).toBe(initAtk);
    });

    it("other monsters have +1 evasion", async () => {
        const card = game.obtainCard("b2-delirium") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        const initEvasion = otherMonster.evasion;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(monster.evasion).toBe(card.evasion);
        expect(monster.evasion).toBe(4);
        expect(otherMonster.evasion).toBe(initEvasion + 1);

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, otherMonster);
        
        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

        game.kill(player1, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve effect

        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

    });

    it(" monsters have +1 evasion", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        const initEvasion = otherMonster.evasion;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(otherMonster.evasion).toBe(initEvasion + 1);

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, otherMonster);
        
        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

        game.kill(player1, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve effect

        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

    });

    it("when another monster dies, this dies", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(monster.isDead).toBe(false);

        game.kill(player1, otherMonster, otherMonster.card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve effect

        expect(monster.isDead).toBe(true);
    });

    it("non attackable monster cannot be attacked: on the board", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(monster.attackable).toBe(false);
        game.declareAttack(player1);
        expect(() => {
            game.declareAttackOnMonster(player1, monster);
        }).toThrowError("This monster cannot be attacked.");
    });

    it("non attackable monster cannot be attacked: on the deck", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.decks["monster"]?.addTopPosition(card);

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, "topDeck", 0);
        const monster = game.encounters.monsterIn(0)!;
        expect(monster.attackable).toBe(false);
        expect(player1.isEngagedInCombat).toBe(false);
    });

    it("non attackable monster cannot be attacked: in the list of monster of monster manual", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const manual = game.obtainCard("b2-monster_manual") as ItemCard;
        game.addInPlay(player2, manual);
        manual.charged = true;
        
        const targetsSel = manual.getEffectTarget("tap");
        expect(targetsSel.length).toBe(1);
        const targetableMonsters = targetsSel[0]?.selector(player2);
        expect(targetableMonsters).toContain(game.monsters[1]);
        expect(targetableMonsters).not.toContain(game.monsters[0]);
    });

});

describe("Monsters - Various 1 - 3 players", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(() => {
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac", "b2-eve"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount:3
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
        mockGameSelections(game);
    });
    // right = previous
    it("damage also dealt to player to the right", async () => {
        const card = game.obtainCard("b2-dople") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.declareAttack(player1);
        game.declareAttackOnMonster(player1, monster);
        
        game.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve damage
        await game.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3-1);
    });

    // // right = previous
    // it("damage also dealt to player to the right (p1)", async () => {
    //     const card = game.obtainCard("b2-dople") as MonsterCard;
    //     expect(card).toBeInstanceOf(MonsterCard);
        
    //     game.monsterSlots.forceSetMonsterAtSlot(0, card);

    //     const monster = game.monsters[0]!;
    //     const initHPPlayer1 = player1.currentHealthPoints;
    //     const initHPPlayer2 = player2.currentHealthPoints;
    //     const initHPPlayer3 = player3.currentHealthPoints;

    //     game.endTurn(); // to player2
    //     game.dealDamage(monster, monster, card, 1);
    //     await game.resolveStack(); // resolve damage
    //     await game.resolveStack(); // resolve effect
    //     await game.resolveStack(); // resolve damage
    //     await game.resolveStack(); // resolve damage
        
    //     expect(game.stack._stack.length).toBe(0);
    //     // Damage should be dealt to both monster and player2
    //     expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
    //     expect(player2.currentHealthPoints).toBe(initHPPlayer2);
    //     expect(player3.currentHealthPoints).toBe(initHPPlayer3);
    //     expect(player1.currentHealthPoints).toBe(initHPPlayer1-1);
    // });
});
