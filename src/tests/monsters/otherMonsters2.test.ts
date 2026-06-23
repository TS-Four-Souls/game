    import type { ItemCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { DiceRoll } from "../../models/stackElement";
import { mockGameSelections, setupTestGame } from "../testHelpers";

describe("Monsters - Various 2", () => {
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

    it("Each time this deals combat damage to a player, they lose 2¢. (b2-keeper_head)", async () => {
        expect(game.stack.isEmpty()).toBe(true);
        if(!game.stack.isEmpty())
            console.log(game.stack._stack[0]?.json);
        const card = game.obtainCard("b2-keeper_head") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage
        expect(game.stack.isEmpty()).toBe(true);
        if(!game.stack.isEmpty())
            console.log(game.stack._stack[0]?.json);
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        if(!game.stack.isEmpty())
            console.log(game.stack._stack[0]?.json);
        expect(game.stack.isEmpty()).toBe(true);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            game.gainCoins(player1, 10, "gift"); // Give some coins to lose
            const init = player1.coins;
            await game.actions.resolveStack(); // dice
            await game.actions.resolveStack(); // damage
            await game.actions.resolveStack(); // effect
            
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.coins).toBe(init - 2);
        }
    });

    it("Each time this deals combat damage to a player, they discard 1. (b2-scolex)", async () => {
        const card = game.obtainCard("b2-scolex") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            game.loot(player1, 3); // Give some cards to lose
            const init = player1.hand.length;
            await game.actions.resolveStack(); // dice
            await game.actions.resolveStack(); // damage
            await game.actions.resolveStack(); // effect

            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.hand.length).toBe(init - 1);
        }
    });

    it("Each time this deals combat damage, it heals 1 [HP] (mega_fatty).", async () => {
        const card = game.obtainCard("b2-mega_fatty") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.entityHandler.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.actions.resolveStack(); // damage

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = monster.currentHealthPoints;
            await game.actions.resolveStack(); // dice
            await game.actions.resolveStack(); // damage
            await game.actions.resolveStack(); // effect

            expect(game.stack.isEmpty()).toBe(true);
            expect(monster.currentHealthPoints).toBe(init + 1);
            game.entityHandler.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
            await game.actions.resolveStack(); // damage
        }
    });

    it("Each time this deals combat damage, it deals 1 damage to each non-active player (the_bloat).", async () => {
        const card = game.obtainCard("b2-the_bloat") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.entityHandler.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.actions.resolveStack(); // damage

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.entityHandler.addHealth(player1, 10); // Prevent death by damage
            game.entityHandler.addHealth(player2, 10); // Prevent death by damage
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = player2.currentHealthPoints;
            await game.actions.resolveStack(); // dice
            await game.actions.resolveStack(); // damage
            await game.actions.resolveStack(); // effect
            await game.actions.resolveStack(); // damage to p2

            expect(game.stack.isEmpty()).toBe(true);
            expect(player2.currentHealthPoints).toBe(init - 1);
        }
    });

    it("Each time this deals damage, each player loses 4¢. (greed).", async () => {
        const card = game.obtainCard("b2-greed") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage
        game.gainCoins(player1, 100, "gift");
        game.gainCoins(player2, 100, "gift");

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.entityHandler.dealDamage(player1, monster, card, monster.currentHealthPoints - 1); // Reduce to 1 HP
        await game.actions.resolveStack(); // damage

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        for(let i=0; i<3; i++) {
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1;

            const init = player1.coins;
            const init2 = player2.coins;
            await game.actions.resolveStack(); // dice
            await game.actions.resolveStack(); // damage
            await game.actions.resolveStack(); // effect
            
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.coins).toBe(init - 4);
            expect(player2.coins).toBe(init2 - 4);
        }
    });

    it("Combat damage this deals is doubled on attack rolls of 1. (mom).", async () => {
        const card = game.obtainCard("b2-mom") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 100); // Prevent death by damage

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        // ATTACK 1 ~ NO DOUBLE DAMAGE
        const baseDamage = game.entityHandler.getAttack(monster);
        let init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do normal damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage);

        // ATTACK 2 ~ DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do double damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage * 2);

        // ATTACK 3 ~ INCREASED ATTACK DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        game.entityHandler.addAttack(monster, 2); // increase attack to test base damage calculation via entities
        monster.addAttackPoints(2);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do double damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage * 2 - 8); // baseDamage increased by 4, then doubled
    });

    it("Combat damage this deals is increased by 1 on attack rolls of 2. (horf).", async () => {
        const card = game.obtainCard("b2-horf") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 100); // Prevent death by damage

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        
        // ATTACK 1 ~ NO DOUBLE DAMAGE
        const baseDamage = game.entityHandler.getAttack(monster);
        let init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1; // should do normal damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage);

        // ATTACK 2 ~ DAMAGE + 1
        init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do double damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage - 1);

        // ATTACK 3 ~ INCREASED ATTACK DOUBLE DAMAGE
        init = player1.currentHealthPoints;
        game.actions.attackRoll(player1);
        game.entityHandler.addAttack(monster, 2); // increase attack to test base damage calculation via entities
        monster.addAttackPoints(2);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // should do double damage

        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(init - baseDamage - 1 - 4); // baseDamage increased by 4, then doubled
    });
    
    it("Each time the attacking player activates an item, they take 1 damage. (gurdy_jr).", async () => {
        const card = game.obtainCard("b2-gurdy_jr") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
    
        game.actions.declareAttack(player1);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage
        const init = player1.currentHealthPoints;
        const chara = player1.inPlay[0]! as ItemCard;

        game.cardHandler.recharge(chara);
        await game.activateItem(player1, chara, []); // Activate first item
        await game.actions.resolveStack(); // item activation
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // damage

        expect(game.stack._stack.length).toBe(0); // effect to deal damage
        expect(player1.currentHealthPoints).toBe(init - 1);
    });

    it("Choose the player with the most ¢ or tied for the most. That player loses all their ¢. (greed_event).", async () => {
        const card = game.obtainCard("b2-greed_event") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.gainCoins(player1, 5, "gift");
        game.gainCoins(player2, 10, "gift");
        const coin1 = player1.coins;
        const coin2 = player2.coins;
        game.encounters.forceSetMonsterAtSlot(0, card);

        expect(game.stack._stack.length).toBe(1); 
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(player1.coins).toBe(coin1);
        expect(player2.coins).toBe(0);
    });

    it("Choose the player with the most ¢ or tied for the most. That player loses all their ¢. (greed_event) test 2.", async () => {
        const card = game.obtainCard("b2-greed_event") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.gainCoins(player1, 10, "gift");
        game.gainCoins(player2, 10, "gift");
        const coin1 = player1.coins;
        const coin2 = player2.coins;
        game.encounters.forceSetMonsterAtSlot(0, card);

        expect(game.stack._stack.length).toBe(1); 
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(coin2);
    });

    it("When an attack is declared on this, the active player chooses a player. That player discards 2 loot cards. (pride)", async () => {
        const card = game.obtainCard("b2-pride") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.loot(player1, 4);
        game.loot(player2, 4);
        const loot1 = player1.hand.length;
        const loot2 = player2.hand.length;
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        expect(game.stack._stack.length).toBe(0); 
        await game.actions.declareAttackOnEntity(player1, monster);
        expect(game.stack._stack.length).toBe(1); 

        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(player1.hand.length).toBe(loot1-2);
        expect(player2.hand.length).toBe(loot2);
    });

    it("When the attacking player rolls an attack roll of 6, cancel everything that hasn't resolved and end the turn. (cursed_moms_hand)", async () => {
        const card = game.obtainCard("b2-cursed_moms_hand") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        expect(game.currentPlayer).toBe(player1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);

        game.actions.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 6; // should cancel everything and end turn
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack._stack.length).toBe(0); 
        expect(game.currentPlayer.id).toBe(player2.id);
    });

    it("Each time this would take damage, the active player rolls-1: Prevent that damage. (the_duke_of_flies)", async () => {
        const card = game.obtainCard("b2-the_duke_of_flies") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        const init = monster.currentHealthPoints;

        game.actions.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 6; 
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.peek() instanceof DiceRoll).toBe(true);
        (game.stack.peek() as DiceRoll).value = 1; // Prevent damage
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack._stack.length).toBe(0); 
        expect(monster.currentHealthPoints).toBe(init);

        game.actions.attackRoll(player1);
        dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 6; 
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.peek() instanceof DiceRoll).toBe(true);
        (game.stack.peek() as DiceRoll).value = 2; // Prevent damage
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack._stack.length).toBe(0); 
        expect(monster.currentHealthPoints).toBe(init-1);
    });

    it("Each time this takes combat damage, it deals 1 damage to the attacking player. (lust) test 2.", async () => {
        const card = game.obtainCard("b2-lust") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);

        const init = player1.currentHealthPoints;

        game.actions.attackRoll(player1);
        let dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 6; 
        await game.actions.resolveStack(); // resolve dice
        await game.actions.resolveStack(); // resolve damage
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack(); // resolve damage

        expect(game.stack._stack.length).toBe(0);
        expect(player1.currentHealthPoints).toBe(init - 1);
    });

    it("Every other time this takes damage each turn, it gains +1 [DC] till end of turn. (the_haunt)", async () => {
        const card = game.obtainCard("b2-the_haunt") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);

        game.entityHandler.addHealth(monster, 100); // Prevent death by damage
        const init = game.entityHandler.getDC(monster);

        for(let i=0; i<10; i++)
        {
            game.actions.attackRoll(player1);
            const dice = game.stack._stack[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 6; 
            await game.actions.resolveStack(); // resolve dice
            await game.actions.resolveStack(); // resolve damage
            await game.actions.resolveStack(); // resolve damage
            expect(game.stack._stack.length).toBe(0);
            expect(game.entityHandler.getDC(monster)).toBe(Math.min(6, init + Math.floor((i+1)/2)));
        }
    });
});