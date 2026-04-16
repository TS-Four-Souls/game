import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, TreasureCard } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections, setupTestGame} from "@/tests/testHelpers";

describe("Treasure - Permanent Modifiers", () => {
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
    });
    // [tap effect] look at the top 5 cards of a deck. put them back in any order.
    it("+1 HP", async () => {
        const breakfast = game.shop.obtainCard("b2-breakfast") as TreasureCard;
        const dinner = game.shop.obtainCard("b2-dinner") as TreasureCard;
        const initialHealth = player1.currentHealthPoints;
        game.addInPlay(player1, breakfast);
        expect(player1.currentHealthPoints).toBe(initialHealth + 1);
        game.addInPlay(player1, dinner);
        expect(player1.currentHealthPoints).toBe(initialHealth + 2);

        game.removeInPlay(player1, breakfast);
        expect(player1.currentHealthPoints).toBe(initialHealth + 1);
        
        game.endTurn();
        await game.resolveStack();
        
        expect(player1.currentHealthPoints).toBe(initialHealth + 1);
        game.removeInPlay(player1, dinner);
        expect(player1.currentHealthPoints).toBe(initialHealth);
    });

    it("+1 ATK", async () => {
        const brimstone = game.shop.obtainCard("b2-brimstone") as TreasureCard;
        const ipecac = game.shop.obtainCard("b2-ipecac") as TreasureCard;
        const initialAttack = player1.attackPoints;
        game.addInPlay(player1, brimstone);
        expect(player1.attackPoints).toBe(initialAttack + 1);
        game.addInPlay(player1, ipecac);
        expect(player1.attackPoints).toBe(initialAttack + 2);
        game.removeInPlay(player1, brimstone);
        expect(player1.attackPoints).toBe(initialAttack + 1);
        game.removeInPlay(player1, ipecac);
        expect(player1.attackPoints).toBe(initialAttack);
    });

    it("+1 ATK roll", async () => {
        const meat = game.shop.obtainCard("b2-meat") as TreasureCard;
        const synthoil = game.shop.obtainCard("b2-synthoil") as TreasureCard;
        const initialRoll = player1.attackDiceModifier;
        game.addInPlay(player1, meat);
        expect(player1.attackDiceModifier).toBe(initialRoll + 1);
        game.addInPlay(player1, synthoil);
        expect(player1.attackDiceModifier).toBe(initialRoll + 2);
        game.removeInPlay(player1, meat);
        expect(player1.attackDiceModifier).toBe(initialRoll + 1);
        game.removeInPlay(player1, synthoil);
        expect(player1.attackDiceModifier).toBe(initialRoll);
    });

    it("+1 ATK declaration on your turn", async () => {
        const cb = game.shop.obtainCard("b2-champion_belt")!;
        game.endTurn(); // to player2
        await game.resolveStack();
        game.endTurn(); // back to player1
        await game.resolveStack();
        const initialAtkLim = player1.attackThisTurn;
        expect(initialAtkLim).toBe(1); // because it's his turn
        game.addInPlay(player1, cb);
        expect(player1.attackThisTurn).toBe(initialAtkLim + 1);
        game.endTurn();
        await game.resolveStack();
        expect(player1.attackThisTurn).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.attackThisTurn).toBe(2);
        game.removeInPlay(player1, cb);
        expect(player1.attackThisTurn).toBe(1);
        game.endTurn();
        await game.resolveStack();
        expect(player1.attackThisTurn).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.attackThisTurn).toBe(1);
    });

    it("+1 Loot play on your turn", async () => {
        const cb = game.shop.obtainCard("b2-polydactyly")!;
        game.endTurn(); // to player2
        await game.resolveStack();
        game.endTurn(); // back to player1
        await game.resolveStack();
        const initialLootPlay = player1.remainingLootPlay;
        expect(initialLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value); // because it's his turn
        game.addInPlay(player1, cb);
        expect(player1.remainingLootPlay).toBe(initialLootPlay + 1);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value+1);
        game.removeInPlay(player1, cb);
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
    });

    it("+1 Loot play on your turn", async () => {
        const cb = game.shop.obtainCard("b2-belly_button")!;
        game.endTurn(); // to player2
        await game.resolveStack();
        game.endTurn(); // back to player1
        await game.resolveStack();
        const initialLootPlay = player1.remainingLootPlay;
        expect(initialLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value); // because it's his turn
        game.addInPlay(player1, cb);
        expect(player1.remainingLootPlay).toBe(initialLootPlay + 1);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value + 1);
        game.removeInPlay(player1, cb);
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(0);
        game.endTurn();
        await game.resolveStack();
        expect(player1.remainingLootPlay).toBe(game.gameParameters.lootPlayPerTurn.value);
    });


    it(" +1 [ATK] to first attack roll each turn and not to subsequent attack rolls", async () => {
        for (const name of ["b2-champion_belt", "b2-polydactyly"]) {
            const item = game.shop.obtainCard(name)!;
            const baseAttack = player1.attackPoints;
            game.addInPlay(player1, item);

            const monster = game.monsters[0]!;
            monster.addHealthPoints(10);
            const initialMonsterHealth = monster.currentHealthPoints;
            expect(game.currentPlayer.id).toBe(player1.id);
            // Attack monster
            game.declareAttack(player1);
            await game.declareAttackOnMonster(player1, monster);
            game.attackRoll(player1)
            const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
            expect(attackRoll).toBeDefined();
            if (attackRoll) {
                // The roll should have +1 ATK from Curved Horn
                attackRoll.value = 6; // Mock roll
            }
            await game.resolveStack(); // Resolve dice effects
            await game.resolveStack(); // resolve damage

            expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - 1);

            // Second attack monster
            game.attackRoll(player1)
            const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
            expect(attackRoll2).toBeDefined();
            if (attackRoll2) {
                // The roll should have +1 ATK from Curved Horn
                attackRoll2.value = 6; // Mock roll
            }
            await game.resolveStack();
            await game.resolveStack();

            expect(monster.currentHealthPoints).toBe(initialMonsterHealth - baseAttack - baseAttack - 1);
            game.removeInPlay(player1, item);
            player1.combatEnded();
            monster.combatEnded();
            game.endTurn();
            await game.resolveStack();
            game.endTurn();
            await game.resolveStack();
        }
    });

    it("b2-belly_button: Each time you take damage, you may recharge your character", async () => {
        const bellyButton = game.shop.obtainCard("b2-belly_button") as TreasureCard;
        const dummyCard = { slug: "test", name: "Test" } as any;
        game.addHealth(player1, 10); // Ensure player has enough health
        game.addInPlay(player1, bellyButton);
        
        // Character starts uncharged (based on test failures)
        const character = player1.character;
        expect(character.charged).toBe(false);
        
        // Recharge the character manually first
        game.recharge(character);
        expect(character.charged).toBe(true);
        
        // Tap the character to make it uncharged
        player1.activateItem(character);
        expect(character.charged).toBe(false);
        
        // Deal damage to player1
        const initialHP = player1.currentHealthPoints;
        game.dealDamage(player2, player1, dummyCard, 1);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken

        // Character should be recharged after taking damage
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
        expect(character.charged).toBe(true);
        
        // Tap character again
        player1.activateItem(character);
        expect(character.charged).toBe(false);
        
        // Take damage again - should recharge again
        game.dealDamage(player2, player1, dummyCard, 2);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken
        expect(character.charged).toBe(true);
    });

    it("b2-brimstone: Each time you deal combat damage to a monster, deal 1 damage to another player", async () => {
        // Setup a fresh game with 3 players (minimum required for brimstone)
        const testGame = new Game();
        mockGameSelections(testGame);
        const p1 = new Player("Player 1");
        const p2 = new Player("Player 2");
        const p3 = new Player("Player 3");
        testGame.addPlayer(p1);
        testGame.addPlayer(p2);
        testGame.addPlayer(p3);
        testGame.setupGame();
        const samson = testGame.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = testGame.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const the_forgotten = testGame.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        testGame.start(p1, [samson, isaac, the_forgotten], false);
      dischargeEachItemsAndRemoveCoins(game);
      emptyHands(game);
            for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
          const monsterCardTop = testGame.obtainCard(slug) as MonsterCard;
          testGame.decks["monster"]!.addTopPosition(monsterCardTop);
        }
        const monsterCard = testGame.obtainCard("b2-fly")! as MonsterCard;
        const monsterCard2 = testGame.obtainCard("b2-fatty")! as MonsterCard;
        testGame.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
        testGame.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);

        // IMPORTANT: Get the card from testGame, not from the global game instance!
        const brimstone = testGame.shop.obtainCard("b2-brimstone") as TreasureCard;
        
        testGame.addInPlay(p1, brimstone);
        
        const monster = testGame.monsters[0]!;
        monster.addHealthPoints(10);
        
        const initialP2HP = p2.currentHealthPoints;
        const initialP3HP = p3.currentHealthPoints;
        
        // Player1 attacks monster and deals combat damage
        testGame.declareAttack(testGame.currentPlayer);
        await testGame.declareAttackOnMonster(testGame.currentPlayer, monster);
        testGame.attackRoll(p1);
        const attackRoll = testGame.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        expect(attackRoll instanceof DiceRoll).toBe(true);
        if (attackRoll) {
            attackRoll.value = 6; // Successful hit
        }
        await testGame.resolveStack(); // Resolve dice roll
        await testGame.resolveStack(); // Resolve damage
        await testGame.resolveStack(); // Resolve effect
        await testGame.resolveStack(); // Resolve damage to another player (from brimstone)
        
        // One of the other players should have taken 1 damage
        const totalOtherPlayersDamage = (initialP2HP - p2.currentHealthPoints) + (initialP3HP - p3.currentHealthPoints);
        expect(totalOtherPlayersDamage).toBe(1);
    });

    it("b2-ipecac: Each time you roll an attack roll of 6, deal 1 damage to each other player", async () => {
        const ipecac = game.shop.obtainCard("b2-ipecac") as TreasureCard;
        
        game.addInPlay(player1, ipecac);
        
        const monster = game.monsters[0]!;
        monster.addHealthPoints(10);
        player2.addHealthPoints(10);
        
        const initialP2HP = player2.currentHealthPoints;
        game.declareAttack(game.currentPlayer);
        await game.declareAttackOnMonster(game.currentPlayer, monster);
        // Player1 attacks monster and rolls a 6
        game.attackRoll(player1);
        const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll).toBeDefined();
        if (attackRoll?.value != 6 && attackRoll) {
            attackRoll.value = 6; // Roll a 6
            game.emitter.emit("on:attack:roll", {
                eventIssuer: player1,
                target: monster,
                dice: attackRoll,
                damageDealt: [player1.attackPoints],
                damageReceived: [monster.attackPoints],
                evasion: [monster.evasion],
            });
        }
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();

        expect(game.stack.size).toBe(0);
        // Player2 should have taken 1 damage from ipecac effect
        expect(player2.currentHealthPoints).toBe(initialP2HP - 1);
        
        // Roll another attack with non-6 value
        const initialP2HP2 = player2.currentHealthPoints;
        game.attackRoll(player1);
        const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
        expect(attackRoll2).toBeDefined();
        const additional_damage = attackRoll2?.value === 6 ? 1 : 0;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        
        // Player2 should NOT have taken damage this time
        expect(player2.currentHealthPoints).toBe(initialP2HP2 - additional_damage);
    });


});