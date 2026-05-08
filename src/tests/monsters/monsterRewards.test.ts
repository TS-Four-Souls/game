import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { DiceRoll } from "../../models/stackElement";
import type { MonsterCard } from "@/models/cards";
import { TreasureCard } from "@/models/cards";
import { setupTestGame, dischargeEachItemsAndRemoveCoins, emptyHands } from "@/tests/testHelpers";
import type { Monster } from "@/models/entities/monster";

describe("Monster Rewards - Verification", () => {
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
        
        dischargeEachItemsAndRemoveCoins(game);
        emptyHands(game);
    });

    /**
     * Generic test function to verify a monster's reward is correctly given after killing
     * @param monsterSlug - The slug of the monster to test
     * @param expectedReward - Object describing the expected reward changes
     */
    async function testMonsterReward(
        monsterSlug: string,
        expectedReward: {
            coins?: number;
            loot?: number;
            treasures?: number;
            souls?: number;
            rollValue?: number; // For roll-based rewards
        }
    ): Promise<void> {
        // Setup: Place the monster in a slot
        const monster = game.obtainCard(monsterSlug) as MonsterCard;
        game.monsterSlots.forceSetMonsterAtSlot(0, monster);
        const monsterEntity = game.monsters[0]!;

        // Capture initial state
        const initialCoins = player1.coins;
        const initialHandSize = player1.hand.length;
        const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
        const initialSouls = player1.souls.length;
        const initialHealthPoints = player1.currentHealthPoints;
        const initialInPlayCount = player1.inPlay.length;

        // Kill the monster
        game.kill(player1, monsterEntity, monster);
        // Resolve the death and rewards
        await game.resolveStack();
        if( game.stack.elements.length > 1) // black bony effect add effect on stack on death.
            game.stack.removeAt(0);

        // If roll-based reward, set the roll value
        if (expectedReward.rollValue !== undefined) {
            const diceRoll = game.stack.elements[0] as DiceRoll;
            if (diceRoll && diceRoll instanceof DiceRoll) {
                diceRoll.value = expectedReward.rollValue;
                await game.resolveStack();
            }
        }

        // Verify rewards were granted
        if (expectedReward.coins !== undefined) {
            expect(player1.coins).toBe(initialCoins + expectedReward.coins);
        } else {
            expect(player1.coins).toBe(initialCoins);
        }

        if (expectedReward.loot !== undefined) {
            expect(player1.hand.length).toBe(initialHandSize + expectedReward.loot);
        } else {
            expect(player1.hand.length).toBe(initialHandSize);
        }

        if (expectedReward.treasures !== undefined) {
            const currentTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
            expect(currentTreasures).toBe(initialTreasures + expectedReward.treasures);
        } else {
            const currentTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
            expect(currentTreasures).toBe(initialTreasures);
        }

        if (expectedReward.souls !== undefined) {
            await game.resolveEntireStack(); // Ensure all soul gain effects are resolved
            expect(player1.souls.length).toBe(initialSouls + expectedReward.souls);
        } else {
            expect(player1.souls.length).toBe(initialSouls);
        }

        // Verify health was not affected (no side effects)
        expect(player1.currentHealthPoints).toBe(initialHealthPoints);

        // Verify no other items were added (except treasures which we checked above)
        const finalInPlayCount = player1.inPlay.length;
        const expectedInPlayCount = initialInPlayCount + (expectedReward.treasures || 0);
        expect(finalInPlayCount).toBe(expectedInPlayCount);
    }

    describe("Fixed Coin Rewards", () => {
        it("should give 1 coin for killing Fly", async () => {
            await testMonsterReward("b2-fly", { coins: 1 });
        });

        it("should give 4 coins for killing Clotty", async () => {
            await testMonsterReward("b2-clotty", { coins: 4 });
        });

        it("should give 7 coins for killing Gurdy (boss)", async () => {
            await testMonsterReward("b2-gurdy", { coins: 7, souls: 1 });
        });
    });

    describe("Fixed Loot Rewards", () => {
        it("should give 1 loot for killing Fatty", async () => {
            await testMonsterReward("b2-fatty", { loot: 1 });
        });

        it("should give 1 loot for killing Pooter", async () => {
            await testMonsterReward("b2-pooter", { loot: 1 });
        });
    });

    describe("Fixed Treasure Rewards", () => {
        it("should give 1 treasure and 1 soul for killing Carrion Queen (boss)", async () => {
            await testMonsterReward("b2-carrion_queen", { treasures: 1, souls: 1 });
        });

        it("should give 1 treasure and 1 soul for killing Dark One (boss)", async () => {
            await testMonsterReward("b2-dark_one", { treasures: 1, souls: 1 });
        });

        it("should give 2 treasures for killing Delirium (epic boss)", async () => {
            await testMonsterReward("b2-delirium", { treasures: 2 });
        });
    });

    describe("Roll-based Coin Rewards", () => {
        it("should give coins based on roll value for killing Dinga (roll = 1)", async () => {
            await testMonsterReward("b2-dinga", { coins: 1, rollValue: 1 });
        });

        it("should give coins based on roll value for killing Dinga (roll = 3)", async () => {
            await testMonsterReward("b2-dinga", { coins: 3, rollValue: 3 });
        });

        it("should give coins based on roll value for killing Dinga (roll = 6)", async () => {
            await testMonsterReward("b2-dinga", { coins: 6, rollValue: 6 });
        });
    });

    describe("Roll-based Loot Rewards", () => {
        it("should give loot based on roll value for killing Black Bony (roll = 2)", async () => {
            await testMonsterReward("b2-black_bony", { loot: 2, rollValue: 2 });
        });

        it("should give loot based on roll value for killing Black Bony (roll = 5)", async () => {
            await testMonsterReward("b2-black_bony", { loot: 5, rollValue: 5 });
        });

        it("should give loot based on roll value for killing Black Bony (roll = 6)", async () => {
            await testMonsterReward("b2-black_bony", { loot: 6, rollValue: 6 });
        });
    });

    describe("Boss Soul Rewards", () => {
        it("should give 1 soul for killing Death (boss)", async () => {
            // Death allows player to kill someone. This makes sure active player kills someone else.
            game.select = async (player: Player, min: number, max: number, Options: any[], description: string = "UNDEFINED SHOULD NOT HAPPEN") => {
                return { selected: Options.slice( 1, 2), remaining: Options.slice(1) };
            }
            await testMonsterReward("b2-death", { souls: 1, treasures: 1 });
        });

        it("should give 1 soul for killing Gurdy (boss)", async () => {
            await testMonsterReward("b2-gurdy", { souls: 1, coins: 7 });
        });
    });

    describe("Multiple Rewards Combinations", () => {
        it("should give both treasure and coin for killing Carrion Queen", async () => {
            const monster = game.obtainCard("b2-carrion_queen") as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monster);
            const monsterEntity = game.monsters[0]!;

            const initialCoins = player1.coins;
            const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
            const initialSouls = player1.souls.length;

            game.kill(player1, monsterEntity, monster);
            await game.resolveStack();

            // Should have both treasure and soul
            expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures + 1);
            expect(player1.souls.length).toBe(initialSouls + 1);
            // Should not have gained coins
            expect(player1.coins).toBe(initialCoins);
        });

        it("should give both soul and coins for killing Gurdy", async () => {
            const monster = game.obtainCard("b2-gurdy") as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monster);
            const monsterEntity = game.monsters[0]!;

            const initialCoins = player1.coins;
            const initialSouls = player1.souls.length;
            const initialLoot = player1.hand.length;

            game.kill(player1, monsterEntity, monster);
            await game.resolveStack();

            // Should have both coins and soul
            expect(player1.coins).toBe(initialCoins + 7);
            expect(player1.souls.length).toBe(initialSouls + 1);
            // Should not have gained loot
            expect(player1.hand.length).toBe(initialLoot);
        });
    });

    // describe("No Rewards Monsters", () => {
    //     it("should give no rewards for killing Red Host (no reward in card)", async () => {
    //         const monster = game.obtainCard("b2-red_host") as MonsterCard;
    //         game.monsterSlots.forceSetMonsterAtSlot(0, monster);
    //         const monsterEntity = game.monsters[0]!;

    //         const initialCoins = player1.coins;
    //         const initialHandSize = player1.hand.length;
    //         const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
    //         const initialSouls = player1.souls.length;

    //         game.kill(player1, monsterEntity, monster);
    //         await game.resolveStack();

    //         // Nothing should have changed
    //         expect(player1.coins).toBe(initialCoins);
    //         expect(player1.hand.length).toBe(initialHandSize);
    //         expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures);
    //         expect(player1.souls.length).toBe(initialSouls);
    //     });
    // });

    describe("Reward Isolation - Verify ONLY expected rewards", () => {
        it("coin reward monster should NOT give loot, treasures, or souls", async () => {
            const monster = game.obtainCard("b2-fly") as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monster);
            const monsterEntity = game.monsters[0]!;

            const initialHandSize = player1.hand.length;
            const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
            const initialSouls = player1.souls.length;

            game.kill(player1, monsterEntity, monster);
            await game.resolveStack();

            // Should only gain coins, nothing else
            expect(player1.hand.length).toBe(initialHandSize); // No loot
            expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures); // No treasures
            expect(player1.souls.length).toBe(initialSouls); // No souls
        });

        it("loot reward monster should NOT give coins, treasures, or souls", async () => {
            const monster = game.obtainCard("b2-fatty") as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monster);
            const monsterEntity = game.monsters[0]!;

            const initialCoins = player1.coins;
            const initialTreasures = player1.inPlay.filter(c => c instanceof TreasureCard).length;
            const initialSouls = player1.souls.length;

            game.kill(player1, monsterEntity, monster);
            await game.resolveStack();

            // Should only gain loot, nothing else
            expect(player1.coins).toBe(initialCoins); // No coins
            expect(player1.inPlay.filter(c => c instanceof TreasureCard).length).toBe(initialTreasures); // No treasures
            expect(player1.souls.length).toBe(initialSouls); // No souls
        });

        it("treasure reward boss should NOT give coins (when not specified)", async () => {
            const monster = game.obtainCard("b2-delirium") as MonsterCard;
            game.monsterSlots.forceSetMonsterAtSlot(0, monster);
            const monsterEntity = game.monsters[0]!;

            const initialCoins = player1.coins;
            const initialHandSize = player1.hand.length;
            const initialSouls = player1.souls.length;

            game.kill(player1, monsterEntity, monster);
            await game.resolveStack();

            // Should only gain treasures, nothing else
            expect(player1.coins).toBe(initialCoins); // No coins
            expect(player1.hand.length).toBe(initialHandSize); // No loot
            expect(player1.souls.length).toBe(initialSouls); // No souls (epic boss)
        });
    });
});
