import type { ItemCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { DamageOnStack, DiceRoll} from "../../models/stackElement";
import { Player } from "../../models/entities/player";
import { mockGameSelections, setupTestGame } from "../testHelpers";

describe("Monsters - Various 1", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
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

    it("no damage on attack roll of 4 or 5", async () => {
        const bigSpider = game.obtainCard("b2-carrion_queen") as MonsterCard;
        expect(bigSpider).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, bigSpider);
        const spiderMonster = game.monsters[0]!;
        
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, spiderMonster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4
        roll.value = 4;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints);

        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 5
        roll.value = 5;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints);

        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(spiderMonster.currentHealthPoints).toBe(spiderMonster.card.healthPoints - 1);
    });

    it("gain damage on damage taken", async () => {
        const card = game.obtainCard("b2-dark_one") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const initAtk = monster.attackPoints;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(monster.attackPoints).toBe(initAtk + 1);
    });

    it("gain damage on damage taken multiple times and reset end turn", async () => {
        const card = game.obtainCard("b2-dark_one") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const initAtk = monster.attackPoints;
        game.entityHandler.dealDamage(player1, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        expect(monster.attackPoints).toBe(initAtk + 1);
        
        game.entityHandler.dealDamage(player1, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);
        expect(monster.attackPoints).toBe(initAtk + 2);

        await game.actions.nextTurn(player1);
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0);

        expect(monster.attackPoints).toBe(initAtk);
    });

    it("other monsters have +1 evasion", async () => {
        const card = game.obtainCard("b2-delirium") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        const initEvasion = otherMonster.evasion;
        game.encounters.forceSetMonsterAtSlot(0, card);        
        // Rebuild the deck to ensure known order after forceSetMonsterAtSlot shuffles the replaced card
        const monsterDeck = game.decks["monster"]!;
        for (const slug of ["b2-gurdy", "b2-pooter", "b2-red_host"]) {
            const monsterCard = game.obtainCard(slug);
            monsterDeck.addTopPosition(monsterCard as MonsterCard);
        }
        const monster = game.monsters[0]!;
        expect(monster.evasion).toBe(card.evasion);
        expect(monster.evasion).toBe(4);
        expect(otherMonster.evasion).toBe(initEvasion + 1);

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, otherMonster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

        game.entityHandler.kill(player1, monster, card);
        await game.actions.resolveStack(); // resolve death
        await game.actions.resolveStack(); // resolve effect
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

    });

    it(" monsters have +1 evasion", async () => {
        expect(game.decks["monster"]?.cards[0]?.slug).toBe("b2-gurdy");
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        const initEvasion = otherMonster.evasion;
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(otherMonster.evasion).toBe(initEvasion + 1);

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, otherMonster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 (should miss because of evasion +1)
        roll.value = initEvasion;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack
        expect(monster.card.slug).toBe("b2-stoney"); // sanity check
        expect(otherMonster.card.slug).toBe("b2-fatty"); // sanity check

        game.entityHandler.kill(player1, monster, card);
        
        await game.actions.resolveStack(); // resolve death
        await game.actions.resolveStack(); // resolve effect
        expect(game.encounters.visible[0]!.slug).toBe("b2-gurdy"); // sanity check
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        // Force the roll to be 4 
        roll.value = initEvasion;

        expect(game.stack._stack.length).toBe(1);

        await game.actions.resolveStack(); // resolve dice
        expect(game.stack._stack.length).toBe(1);
        expect(game.stack._stack[0]).toBeInstanceOf(DamageOnStack);
        await game.actions.resolveStack(); // resolve damage
        expect(game.stack._stack.length).toBe(0);
        await game.actions.resolveStack(); // resolve damage
        expect(game.stack._stack.length).toBe(0);
        // No damage should be dealt
        expect(otherMonster.currentHealthPoints).toBe(otherMonster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1); // took 1 damage for failed attack

    });

    it("when another monster dies, this dies", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(monster.isDead).toBe(false);

        game.entityHandler.kill(player1, otherMonster, otherMonster.card);
        await game.actions.resolveStack(); // resolve death
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect

        expect(monster.isDead).toBe(true);
    });

    it("non attackable monster cannot be attacked: on the board", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        expect(monster.attackable).toBe(false);
        game.actions.declareAttack(player1);
        await expect(game.actions.declareAttackOnEntity(player1, monster)).rejects.toThrowError(
        "This entity cannot be attacked."
        );
    });

    it("non attackable monster cannot be attacked: on the deck", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.decks["monster"]?.addTopPosition(card);

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const monster = game.encounters.monsterIn(0)!;
        expect(monster.attackable).toBe(false);
        expect(player1.isEngagedInCombat).toBe(false);
    });

    it("non attackable monster cannot be attacked: in the list of monster of monster manual", async () => {
        const card = game.obtainCard("b2-stoney") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        const otherMonster = game.encounters.monsterIn(1)!;
        game.encounters.forceSetMonsterAtSlot(0, card);

        const manual = game.obtainCard("b2-monster_manual") as ItemCard;
        game.cardHandler.addInPlay(player2, manual);
        manual.charged = true;
        
        const targetsSel = manual.getEffectTarget("tap");
        expect(targetsSel.length).toBe(1);
        const targetableMonsters = targetsSel[0]?.selector(player2, manual);
        expect(targetableMonsters).toContain(game.monsters[1]);
        expect(targetableMonsters).not.toContain(game.monsters[0]);
    });

});

describe("Monsters - Various 1 - 3 players", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
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
        
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3-1);
    });

    // // right = previous
    it("damage also dealt to player to the right (p1)", async () => {
        const card = game.obtainCard("b2-dople") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // to player2
        await game.actions.resolveStack(); // resolve damage
        game.entityHandler.dealDamage(monster, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1-1);
    });

    it("damage also dealt to player to the left", async () => {
        const card = game.obtainCard("b2-evil_twin") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2-1);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);
    });

    // // right = previous
    it("damage also dealt to player to the left (p2)", async () => {
        const card = game.obtainCard("b2-evil_twin") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // to player2
        await game.actions.resolveStack(); // resolve damage
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // to player2
        await game.actions.resolveStack(); // resolve damage
        game.entityHandler.dealDamage(monster, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage
        
        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints - 1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1-1);
    });

    it("While this is at 1 [HP] , it has +1 [ATK] . (Gemini)", async () => {
        const card = game.obtainCard("b2-gemini") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        expect(monster.attackPoints).toBe(card.attackPoints);

        game.entityHandler.dealDamage(player1, monster, card, card.healthPoints -1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getAttack(monster)).toBe(card.attackPoints + 1);
        game.entityHandler.heal(monster, 1);
        expect(game.entityHandler.getAttack(monster)).toBe(card.attackPoints);
        expect(game.entityHandler.getAttack(monster)).toBe(card.attackPoints);

        game.entityHandler.dealDamage(player1, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getAttack(monster)).toBe(card.attackPoints + 1);
        game.entityHandler.addHealth(player1, 10);
        const initHealth = player1.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        game.actions.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // fail
        await game.actions.resolveStack(); // Dice
        await game.actions.resolveStack(); // Damage
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(initHealth - 2);
    });

    it("While this is at 1 [HP] , it has +1 [DC] . (mask_of_infamy)", async () => {
        const card = game.obtainCard("b2-mask_of_infamy") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);

        game.entityHandler.dealDamage(player1, monster, card, monster.currentHealthPoints -1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion + 2);
        game.entityHandler.heal(monster, 1);
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);

        game.entityHandler.dealDamage(player1, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion + 2);
        game.entityHandler.addHealth(player1, 10);
        const initHealth = player1.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        game.actions.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = monster.card.evasion + 1;
        await game.actions.resolveStack(); // Dice
        await game.actions.resolveStack(); // Damage
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBeLessThan(initHealth);
    });

    it("While this is at 2 [HP] or less, it has +1 [DC] . (larry_jr)", async () => {
        const card = game.obtainCard("b2-larry_jr") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);

        game.entityHandler.dealDamage(player1, monster, card, card.healthPoints -2);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion + 1);
        game.entityHandler.heal(monster, 1);
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);
        game.entityHandler.dealDamage(player1, monster, card, card.healthPoints -2);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion + 1);
        game.entityHandler.heal(monster, 2);
        expect(monster.currentHealthPoints).toBe(3);
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion);

        game.entityHandler.dealDamage(player1, monster, card, 1);
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        
        expect(game.entityHandler.getDC(monster)).toBe(card.evasion + 1);
        game.entityHandler.addHealth(player1, 10);
        const initHealth = player1.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        game.actions.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = monster.card.evasion;
        await game.actions.resolveStack(); // Dice
        await game.actions.resolveStack(); // Damage
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBeLessThan(initHealth);
    });


    it("damage dealt also dealt to player to the rage_creep", async () => {
        const card = game.obtainCard("b2-rage_creep") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10);
        game.entityHandler.addHealth(player2, 10);
        game.entityHandler.addHealth(player3, 10);
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 1;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1-1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2-1);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);
    });

    it("damage dealt also dealt to player to the rage_creep test 2", async () => {
        const card = game.obtainCard("b2-rage_creep") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10);
        game.entityHandler.addHealth(player2, 10);
        game.entityHandler.addHealth(player3, 10);
        game.encounters.forceSetMonsterAtSlot(0, card);

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // to player2
        await game.actions.resolveStack(); // resolve damage

        const monster = game.monsters[0]!;
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);
        
        game.actions.attackRoll(player2);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 1;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(monster.currentHealthPoints).toBe(monster.card.healthPoints);
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2-1);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3-1);
    });


    it("Each time this takes combat damage on an attack roll of 6, deal 1 damage to the player to the active player's left. (gluttony)", async () => {
        const card = game.obtainCard("b2-gluttony") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10);
        game.entityHandler.addHealth(player2, 10);
        game.entityHandler.addHealth(player3, 10);
        game.encounters.forceSetMonsterAtSlot(0, card);

        
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // to player2
        await game.actions.resolveStack(); // resolve damage
        

        const monster = game.monsters[0]!;
        game.entityHandler.addHealth(monster, 10);
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, monster);
        
        game.actions.attackRoll(player2);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3-1);


        game.actions.attackRoll(player2);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 5;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3-1);
    });

    it("Each time this takes combat damage on an attack roll of 6, deal 1 damage to the player to the active player's left. (gluttony) test 2", async () => {
        const card = game.obtainCard("b2-gluttony") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10);
        game.entityHandler.addHealth(player2, 10);
        game.entityHandler.addHealth(player3, 10);
        game.encounters.forceSetMonsterAtSlot(0, card);

        const monster = game.monsters[0]!;
        game.entityHandler.addHealth(monster, 10);
        const initHPPlayer1 = player1.currentHealthPoints;
        const initHPPlayer2 = player2.currentHealthPoints;
        const initHPPlayer3 = player3.currentHealthPoints;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        let roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 6;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve damage

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2-1);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);


        game.actions.attackRoll(player1);
        expect(game.stack._stack.length).toBe(1);
        roll = game.stack._stack[0] as DiceRoll;
        if(!(roll instanceof DiceRoll)) {
            throw new Error("Expected a DiceRoll on the stack.");
        }
        roll.value = 5;
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect

        expect(game.stack._stack.length).toBe(0);
        // Damage should be dealt to both monster and player2
        expect(player1.currentHealthPoints).toBe(initHPPlayer1);
        expect(player2.currentHealthPoints).toBe(initHPPlayer2-1);
        expect(player3.currentHealthPoints).toBe(initHPPlayer3);
    });
});
