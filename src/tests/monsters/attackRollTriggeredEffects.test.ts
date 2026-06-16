import type { LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DiceRoll } from "../../models/stackElement";
import { emptyHands, mockGameSelections, setupTestGame } from "../testHelpers";

describe("Monsters - Attack Roll Triggered Effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
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

    // b2-swarm_of_flies: Each time the attacking player rolls an attack roll of 5, they take 1 damage.
    describe("b2-swarm_of_flies", () => {
        it("attacking player takes 1 damage when rolling attack roll of 5", async () => {
            const swarmOfFlies = game.obtainCard("b2-swarm_of_flies") as MonsterCard;
            expect(swarmOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, swarmOfFlies);
            
            const swarmMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10); // Ensure player has enough HP to take damage
            const initialHP = player1.currentHealthPoints;
            
            // Declare attack
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, swarmMonster);
            
            game.entityHandler.addHealth(swarmMonster, 10); // Ensure monster has HP to survive
            
            // Make attack roll
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 5; // Triggering value
            
            await game.actions.resolveStack(); // resolve the dice roll
            await game.actions.resolveStack(); // resolve swarm_of_flies effect
            await game.actions.resolveStack(); // resolve swarm_of_flies effect
            await game.actions.resolveStack(); // resolve damage
            
            // Player should have taken 1 damage
            expect(player1.currentHealthPoints).toBe(initialHP - 1);
        });

        it("no damage when rolling attack roll values other than 5", async () => {
            const swarmOfFlies = game.obtainCard("b2-swarm_of_flies") as MonsterCard;
            expect(swarmOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, swarmOfFlies);
            
            const swarmMonster = game.monsters[0]!;
            const initialHP = player1.currentHealthPoints;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, swarmMonster);
            
            game.entityHandler.addHealth(swarmMonster, 10);
            
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 3; // Non-triggering value
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Player should not take damage
            expect(player1.currentHealthPoints).toBe(initialHP);
        });

        it("triggers multiple times if player attacks multiple times", async () => {
            const swarmOfFlies = game.obtainCard("b2-swarm_of_flies") as MonsterCard;
            expect(swarmOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, swarmOfFlies);
            
            const swarmMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10);
            const initialHP = player1.currentHealthPoints;
            
            // First attack
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, swarmMonster);
            game.entityHandler.addHealth(swarmMonster, 10);
            
            game.actions.attackRoll(player1);
            const dice1 = game.stack.elements[0] as DiceRoll;
            dice1.value = 5;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            expect(player1.currentHealthPoints).toBe(initialHP - 1);
            
            // Second attack
            
            game.actions.attackRoll(player1);
            const dice2 = game.stack.elements[0] as DiceRoll;
            dice2.value = 5;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Should trigger again
            expect(player1.currentHealthPoints).toBe(initialHP - 2);
        });
    });

    // b2-chub: Each time the attacking player rolls an attack roll of 1, this heals 2 [HP].
    describe("b2-chub", () => {
        it("monster heals 2 HP when attacking player rolls attack roll of 1", async () => {
            const chub = game.obtainCard("b2-chub") as MonsterCard;
            expect(chub).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, chub);
            
            const chubMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10);
            
            // Reduce chub's health so it can heal
            game.entityHandler.dealDamage(chubMonster, chubMonster, chubMonster.card, 3);
            await game.actions.resolveStack(); // resolve the dice roll and chub healing effect

            const initialMonsterHP = chubMonster.currentHealthPoints;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, chubMonster);
            
            // Make attack roll
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 1; // Triggering value
            
            await game.actions.resolveStack(); // resolve the dice roll and chub healing effect
            await game.actions.resolveStack(); // resolve the dice roll and chub healing effect
            await game.actions.resolveStack(); // resolve the dice roll and chub healing effect
            
            // Monster should have healed 2 HP
            expect(chubMonster.currentHealthPoints).toBe(initialMonsterHP + 2);
        });

        it("no healing when rolling attack roll values other than 1", async () => {
            const chub = game.obtainCard("b2-chub") as MonsterCard;
            expect(chub).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, chub);
            
            const chubMonster = game.monsters[0]!;
            game.entityHandler.dealDamage(chubMonster, chubMonster, chubMonster.card, 2);
            await game.actions.resolveStack();

            const initialMonsterHP = chubMonster.currentHealthPoints;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, chubMonster);
            
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 2; // Non-triggering value
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Monster should not heal
            expect(chubMonster.currentHealthPoints).toBe(initialMonsterHP);
        });

        it("heals multiple times on multiple attack rolls of 1", async () => {
            const chub = game.obtainCard("b2-chub") as MonsterCard;
            expect(chub).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, chub);
            
            const chubMonster = game.monsters[0]!;
            game.entityHandler.dealDamage(chubMonster, chubMonster, chubMonster.card, 3);
            await game.actions.resolveStack();

            const initialMonsterHP = chubMonster.currentHealthPoints;
            
            // First attack roll of 1
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, chubMonster);
            
            game.actions.attackRoll(player1);
            const dice1 = game.stack.elements[0] as DiceRoll;
            dice1.value = 1;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            expect(chubMonster.currentHealthPoints).toBe(initialMonsterHP + 2);
            
            game.actions.attackRoll(player1);
            const dice2 = game.stack.elements[0] as DiceRoll;
            dice2.value = 1;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Should heal again
            expect(chubMonster.currentHealthPoints).toBe(initialMonsterHP + 3);
        });

        it("cannot heal beyond max HP", async () => {
            const chub = game.obtainCard("b2-chub") as MonsterCard;
            expect(chub).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, chub);
            
            const chubMonster = game.monsters[0]!;
            const maxHP = chubMonster.healthPoints;
            
            // Set chub to 1 HP below max
            game.entityHandler.dealDamage(chubMonster, chubMonster, chubMonster.card, 1);
            await game.actions.resolveStack();

            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, chubMonster);
            
            game.actions.attackRoll(player1);
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 1;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Should not exceed max HP
            expect(chubMonster.currentHealthPoints).toBe(maxHP);
        });
    });

    // b2-satan: Each time the attacking player rolls an attack roll of 6, they choose a living player. That player dies.
    describe("b2-satan", () => {
        it("attacking player chooses a living player who dies when rolling attack roll of 6", async () => {
            const satan = game.obtainCard("b2-satan") as MonsterCard;
            expect(satan).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, satan);
            
            const satanMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10);
            game.entityHandler.addHealth(player2, 5);
            
            expect(player2.isDead).toBe(false);
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, satanMonster);
            
            game.entityHandler.addHealth(satanMonster, 10);
            
            // Make attack roll
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 6; // Triggering value
            
            game.select = async (_p, _min, _max, opts) => ({ selected: [player2], remaining: [] } as any);
            await game.actions.resolveStack(); // resolve the dice roll 
            await game.actions.resolveStack(); // resolve effect
            await game.actions.resolveStack(); // resolve player death
            await game.actions.resolveStack(); // resolve damage
            
            // Player2 should be dead
            expect(player2.isDead).toBe(true);
        });

        it("no effect when rolling attack roll values other than 6", async () => {
            const satan = game.obtainCard("b2-satan") as MonsterCard;
            expect(satan).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, satan);
            
            const satanMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player2, 5);
            
            expect(player2.isDead).toBe(false);
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, satanMonster);
            
            game.entityHandler.addHealth(satanMonster, 10);
            
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 2; // Non-triggering value
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Player2 should still be alive
            expect(player2.isDead).toBe(false);
            expect(game.hasPendingSelections).toBe(false);
        });

        it("can kill different players on multiple triggers", async () => {
            // Set up a 4-player game instead
            const setup4 = await setupTestGame({
                characters: ["b2-samson", "b2-isaac", "b2-the_forgotten", "b2-judas"],
                monsters: ["b2-fly", "b2-fatty"],
                monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                playerCount: 4
            });
            const game4 = setup4.game;
            mockGameSelections(game4);
            const player1_4 = setup4.player1;
            const player2_4 = setup4.player2!;
            const player3 = setup4.player3!;
            const player4 = setup4.player4!;
            
            const satan = game4.obtainCard("b2-satan") as MonsterCard;
            expect(satan).toBeInstanceOf(MonsterCard);
            
            game4.encounters.forceSetMonsterAtSlot(0, satan);
            
            const satanMonster = game4.monsters[0]!;
            game4.entityHandler.addHealth(player1_4, 10);
            game4.entityHandler.addHealth(player2_4, 5);
            game4.entityHandler.addHealth(player3, 5);
            game4.entityHandler.addHealth(player4, 5);
            
            // First attack roll of 6 - kill player2
            game4.actions.declareAttack(player1_4);
            await game4.actions.declareAttackOnEntity(player1_4, satanMonster);
            game4.entityHandler.addHealth(satanMonster, 10);
            
            game4.actions.attackRoll(player1_4);
            const dice1 = game4.stack.elements[0] as DiceRoll;
            dice1.value = 6;
            game4.select = async (_p, n, opts) => ({ selected: [player2_4], remaining: [] } as any);
            
            await game4.actions.resolveStack();
            await game4.actions.resolveStack(); // resolve death
            await game4.actions.resolveStack(); // resolve death
            await game4.actions.resolveStack(); // resolve death
            
            expect(player2_4.isDead).toBe(true);
            expect(player3.isDead).toBe(false);
            
            game4.actions.attackRoll(player1_4);
            const dice2 = game4.stack.elements[0] as DiceRoll;
            dice2.value = 6;
            game4.select = async (_p, n, opts) => ({ selected: [player3], remaining: [] } as any);
            
            await game4.actions.resolveStack();
            await game4.actions.resolveStack(); // resolve death
            await game4.actions.resolveStack(); // resolve death
            await game4.actions.resolveStack(); // resolve death
            
            expect(player3.isDead).toBe(true);
            expect(player4.isDead).toBe(false);
        });

        it("attacking player can choose themselves to die", async () => {
            const satan = game.obtainCard("b2-satan") as MonsterCard;
            expect(satan).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, satan);
            
            const satanMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10);
            
            expect(player1.isDead).toBe(false);
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, satanMonster);
            game.entityHandler.addHealth(satanMonster, 10);
            
            game.actions.attackRoll(player1);
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 6;
            
            game.select = async (_p, _min, _max, opts) => ({ selected: [player1], remaining: [] } as any);
            await game.actions.resolveStack();
            await game.actions.resolveStack(); // resolve player death
            await game.actions.resolveStack(); // resolve player death
            await game.actions.resolveStack(); // resolve player death
            
            // Player1 should be dead
            expect(player1.isDead).toBe(true);
        });
    });

    // b2-ring_of_flies: Each time the attacking player rolls an attack roll of 3, they must steal a loot card from another player at random.
    describe("b2-ring_of_flies", () => {
        it("attacking player steals a loot card from another player when rolling attack roll of 3", async () => {
            const ringOfFlies = game.obtainCard("b2-ring_of_flies") as MonsterCard;
            expect(ringOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, ringOfFlies);
            
            const ringMonster = game.monsters[0]!;
            game.entityHandler.addHealth(player1, 10);
            
            // Give player2 some loot cards
            const lootCard1 = game.decks["loot"]!.draw() as LootCard;
            const lootCard2 = game.decks["loot"]!.draw() as LootCard;
            player2.hand.addToHand(lootCard1);
            player2.hand.addToHand(lootCard2);
            
            const initialPlayer1HandSize = player1.hand.length;
            const initialPlayer2HandSize = player2.hand.length;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, ringMonster);
            
            // Make attack roll
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            expect(dice).toBeInstanceOf(DiceRoll);
            dice.value = 3; // Triggering value
            
            await game.actions.resolveStack(); // resolve the dice roll
            await game.actions.resolveStack(); // resolve ring_of_flies effect
            await game.actions.resolveStack(); // resolve ring_of_flies effect
            await game.actions.resolveStack(); // resolve ring_of_flies effect
            
            // Player1 should have gained a card, player2 should have lost one
            expect(player1.hand.length).toBe(initialPlayer1HandSize + 1);
            expect(player2.hand.length).toBe(initialPlayer2HandSize - 1);
        });

        it("no effect when rolling attack roll values other than 3", async () => {
            const ringOfFlies = game.obtainCard("b2-ring_of_flies") as MonsterCard;
            expect(ringOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, ringOfFlies);
            
            const ringMonster = game.monsters[0]!;
            
            const lootCard = game.decks["loot"]!.draw() as LootCard;
            player2.hand.addToHand(lootCard);
            
            const initialPlayer1HandSize = player1.hand.length;
            const initialPlayer2HandSize = player2.hand.length;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, ringMonster);
            game.entityHandler.addHealth(ringMonster, 10);
            
            game.actions.attackRoll(player1);
            
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 5; // Non-triggering value
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // No cards should be stolen
            expect(player1.hand.length).toBe(initialPlayer1HandSize);
            expect(player2.hand.length).toBe(initialPlayer2HandSize);
        });

        it("steals multiple cards on multiple attack rolls of 3", async () => {
            const ringOfFlies = game.obtainCard("b2-ring_of_flies") as MonsterCard;
            expect(ringOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, ringOfFlies);
            
            const ringMonster = game.monsters[0]!;
            
            // Give player2 multiple loot cards
            for (let i = 0; i < 5; i++) {
                const lootCard = game.decks["loot"]!.draw() as LootCard;
                player2.hand.addToHand(lootCard);
            }
            
            const initialPlayer1HandSize = player1.hand.length;
            const initialPlayer2HandSize = player2.hand.length;
            
            // First attack roll of 3
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, ringMonster);
            game.entityHandler.addHealth(ringMonster, 10);
            
            game.actions.attackRoll(player1);
            const dice1 = game.stack.elements[0] as DiceRoll;
            dice1.value = 3;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            expect(player1.hand.length).toBe(initialPlayer1HandSize + 1);
            expect(player2.hand.length).toBe(initialPlayer2HandSize - 1);
            
            // Second attack roll of 3
            game.actions.attackRoll(player1);
            const dice2 = game.stack.elements[0] as DiceRoll;
            dice2.value = 3;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // Should steal again
            expect(player1.hand.length).toBe(initialPlayer1HandSize + 2);
            expect(player2.hand.length).toBe(initialPlayer2HandSize - 2);
        });

        it("no effect when other players have no loot cards", async () => {
            const ringOfFlies = game.obtainCard("b2-ring_of_flies") as MonsterCard;
            expect(ringOfFlies).toBeInstanceOf(MonsterCard);
            
            game.encounters.forceSetMonsterAtSlot(0, ringOfFlies);
            
            const ringMonster = game.monsters[0]!;
            
            // Empty all hands
            emptyHands(game);
            
            const initialPlayer1HandSize = player1.hand.length;
            
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, ringMonster);
            game.entityHandler.addHealth(ringMonster, 10);
            
            game.actions.attackRoll(player1);
            const dice = game.stack.elements[0] as DiceRoll;
            dice.value = 3;
            
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            
            // No cards to steal, hand size should remain the same
            expect(player1.hand.length).toBe(initialPlayer1HandSize);
        });

        it("steals from a different player when multiple players have loot", async () => {
            // Set up a 3-player game
            const setup3 = await setupTestGame({
                characters: ["b2-samson", "b2-isaac", "b2-the_forgotten"],
                monsters: ["b2-fly", "b2-fatty"],
                monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                playerCount: 3
            });
            const game3 = setup3.game;
            mockGameSelections(game3);
            const player1_3 = setup3.player1;
            const player2_3 = setup3.player2!;
            const player3 = setup3.player3!;
            
            const ringOfFlies = game3.obtainCard("b2-ring_of_flies") as MonsterCard;
            expect(ringOfFlies).toBeInstanceOf(MonsterCard);
            
            game3.encounters.forceSetMonsterAtSlot(0, ringOfFlies);
            
            const ringMonster = game3.monsters[0]!;
            
            // Give both player2 and player3 loot cards
            const lootCard2 = game3.decks["loot"]!.draw() as LootCard;
            const lootCard3 = game3.decks["loot"]!.draw() as LootCard;
            player2_3.hand.addToHand(lootCard2);
            player3.hand.addToHand(lootCard3);
            
            const initialPlayer1HandSize = player1_3.hand.length;
            const totalOtherPlayersCards = player2_3.hand.length + player3.hand.length;
            
            game3.actions.declareAttack(player1_3);
            await game3.actions.declareAttackOnEntity(player1_3, ringMonster);
            game3.entityHandler.addHealth(ringMonster, 10);
            
            game3.actions.attackRoll(player1_3);
            const dice = game3.stack.elements[0] as DiceRoll;
            dice.value = 3;
            
            await game3.actions.resolveStack();
            await game3.actions.resolveStack();
            await game3.actions.resolveStack();
            await game3.actions.resolveStack();
            
            // Player1 should gain one card
            expect(player1_3.hand.length).toBe(initialPlayer1HandSize + 1);
            // One of the other players should have lost a card
            expect(player2_3.hand.length + player3.hand.length).toBe(totalOtherPlayersCards - 1);
        });
    });
});
