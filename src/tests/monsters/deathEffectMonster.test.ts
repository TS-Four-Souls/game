import { describe, it, expect, beforeEach, expectTypeOf } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import type { Hand, LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { setupTestGame, emptyHands, mockGameSelections } from "../testHelpers";
import { he, pl } from "zod/locales";

describe("Monsters - On death effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter"],
            treasureDeck: ["b2-blank_card"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        mockGameSelections(game);
    });

    // b2-big_spider: When this dies, the active player may attack the monster deck an additional time.
    describe("b2-big_spider", () => {
        it("active player can choose to attack the monster deck when Big Spider dies", async () => {
            const bigSpider = game.obtainCard("b2-big_spider") as MonsterCard;
            expect(bigSpider).toBeInstanceOf(MonsterCard);
            
            game.monsterSlots.forceSetMonsterAtSlot(0, bigSpider);
            const spiderMonster = game.monsters[0]!;
            
            // Mock selection to choose "Yes" for attacking monster deck
            game.select = async (_p, n, opts) => {
                    return { selected: [opts[0]], remaining: opts.slice(1) } as any;
            };
            game.declareAttack(player1);
            await game.declareAttackOnMonster(player1, spiderMonster);
            // Kill the Big Spider by dealing lethal damage
            game.kill(spiderMonster, spiderMonster, bigSpider);
            
            const newmonster = game.encounters.monsterIn(0);
            await game.resolveStack(); // resolve death
            await game.resolveStack(); // resolve death effect - selection
            // Check that player attack the top deck and the monster has changed.
            expect(game.encounters.monsterIn(0)).not.toBe(newmonster);
            expect(game.encounters.monsterIn(0)).toBeDefined();
            expect(game.encounters.monsterIn(0)?.card.slug).toBe("b2-pooter");
            // Check that the player has declared an attack
            game.declareAttack(player1); // declare attack to engage in combat
            expect(game.canDeclareAttackOnMonster(player1, game.monsters[0]!, false)).not.toBe(true);
            expect(game.canDeclareAttackOnMonster(player1, game.monsters[0]!, false)).not.toBe(true);
            expect(game.canDeclareAttackOnMonster(player1, "topDeck", false)).toBe(true);
        });

        it("active player can choose not to attack the monster deck when Big Spider dies", async () => {
            const bigSpider = game.obtainCard("b2-big_spider") as MonsterCard;
            expect(bigSpider).toBeInstanceOf(MonsterCard);
            
            game.monsterSlots.forceSetMonsterAtSlot(0, bigSpider);
            const spiderMonster = game.monsters[0]!;
            
            
            // Mock selection to choose "No" for attacking monster deck
            game.select = async (_p, n, opts) => {
                return { selected: [], remaining: opts.slice(n) };
            };
            
            // Kill the Big Spider by dealing lethal damage
            game.kill(player1, spiderMonster, bigSpider);
            
            await game.resolveStack(); // resolve death
            await game.resolveStack(); // resolve death effect - selection
            await game.resolveStack(); // resolve death effect - selection
            
            // Check that the player did NOT declare an attack
            expect(player1.isEngagedInCombat).toBe(false);
        });

        it("effect only triggers for the active player when Big Spider dies", async () => {
            const bigSpider = game.obtainCard("b2-big_spider") as MonsterCard;
            expect(bigSpider).toBeInstanceOf(MonsterCard);
            
            game.monsterSlots.forceSetMonsterAtSlot(0, bigSpider);
            const spiderMonster = game.monsters[0]!;
            
            
            let selectionCount = 0;
            game.declareAttack(player1);
            await game.declareAttackOnMonster(player1, spiderMonster);
            game.dealDamage(player1, spiderMonster, bigSpider, 1);
            await game.resolveStack();

            // Kill the Big Spider (player1 is active, effect should trigger)
            game.kill(player1, spiderMonster, bigSpider);
            
            await game.resolveStack(); // resolve death
            await game.resolveStack(); // resolve death effect - should ask player1
            
            // Verify that the selection was made (effect triggered)
            game.declareAttack(player1); // declare attack to engage in combat
            expect(game.canDeclareAttackOnMonster(player1, game.monsters[0]!, false)).not.toBe(true);
            expect(game.canDeclareAttackOnMonster(player1, game.monsters[0]!, false)).not.toBe(true);
            expect(game.canDeclareAttackOnMonster(player1, "topDeck", false)).toBe(true);

        });
    });

    it("active player declare an attack when conquest dies.", async () => {
            const conquestCard = game.obtainCard("b2-conquest") as MonsterCard;
            expect(conquestCard).toBeInstanceOf(MonsterCard);
            
            game.monsterSlots.forceSetMonsterAtSlot(0, conquestCard);
            const conquestMonster = game.monsters[0]!;
            
            const initialAttacks = player1.attackThisTurn;
            
            // Mock selection to choose "Yes" for attacking monster deck
            game.select = async (_p, n, opts) => {
                    return { selected: [opts[0]], remaining: opts.slice(1) } as any;
            };
            
                game.kill(conquestMonster, conquestMonster, conquestCard);
            
            await game.resolveStack(); // resolve death
            await game.resolveStack(); // resolve death effect - selection
            // Check that the player has declared an attack
            expect(player1.isEngagedInCombat).toBe(true);
        });

    it("active player choose a player that discard 2 loot cards when dank_globin dies.", async () => {
            const card = game.obtainCard("b2-dank_globin") as MonsterCard;
            expect(card).toBeInstanceOf(MonsterCard);
            
            game.monsterSlots.forceSetMonsterAtSlot(0, card);
            const monster = game.monsters[0]!;
            
            game.loot( player1, 4); // give some loot cards to player1
                game.kill(monster, monster, card);
            
            await game.resolveStack(); // resolve death
            const initialLength = player1.hand.length;
            await game.resolveStack(); // resolve death effect - selection
            // Check that the player has declared an attack
            expect(player1.hand.length).toBe(initialLength - 2);
        });
    
    it("active player choose another player that discard 2 loot cards when dank_globin dies.", async () => {
        const card = game.obtainCard("b2-dank_globin") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.loot( player2, 4); // give some loot cards to player2
        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        const initialLength = player2.hand.length;
        await game.resolveStack(); // resolve death effect - selection
        // Check that the player has declared an attack
        expect(player2.hand.length).toBe(initialLength - 2);
    });

    it("active player kill a player when death dies.", async () => {
        const card = game.obtainCard("b2-death") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        expect(player2.isDead).toBe(false);

        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve death effect - selection
        
        expect(player2.isDead).toBe(true);
    });

    it("active player skip next turn when famine dies.", async () => {
        const card = game.obtainCard("b2-famine") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        

        // Check that the player has declared an attack
        expect(game.turnHandler.numberOfTurnSkiped(player1)).toBe(1);
        expect(game.turnHandler.numberOfTurnSkiped(player2)).toBe(0);

        game.endTurn(); // end player1 turn
        await game.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(game.currentPlayer.id).toBe(player2.id);

        game.endTurn(); // end player2 turn, player 1 should be skipped
        await game.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(game.currentPlayer.id).toBe(player2.id);
    });

    it("active player choose a player that lose 7 coins when greedling dies.", async () => {
        const card = game.obtainCard("b2-greedling") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.gainCoins(player2, 10);
        const coins = player2.coins;

        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        expect(player2.isDead).toBe(false);

        await game.resolveStack(); // resolve death effect - selection
        
        expect(player2.coins).toBe(coins - 7);
    });

    it("active player deal 3 damage to a player when mulliboom dies.", async () => {
        const card = game.obtainCard("b2-mulliboom") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.addHealth(player2, 10);
        const health = player2.currentHealthPoints;

        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) };
        };
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        
        expect(player2.currentHealthPoints).toBe(health - 3);
    });

    it("active player recharge each item when psy_horf dies.", async () => {
        const card = game.obtainCard("b2-psy_horf") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const item1 = game.obtainCard("b2-tech_x") as LootCard;
        game.addInPlay(player1, item1);
        for(const item of player1.inPlay){
            item.charged = false;
        }
        for(const item of player1.inPlay){
            expect(item.charged).toBe(false);
        }
        game.kill(monster, monster, card);
        
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        
        for(const item of player1.inPlay){
            expect(item.charged).toBe(true);
        }
    });
    

    it("active player steal an item when moms_dead_hand dies.", async () => {
        const card = game.obtainCard("b2-moms_dead_hand") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const item1 = game.obtainCard("b2-tech_x") as LootCard;
        game.addInPlay(player2, item1);
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [item1], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        
        expect(player1.inPlay.map(card => card.slug)).toContain(item1.slug);
        expect(player2.inPlay.map(card => card.slug)).not.toContain(item1.slug);
    });

    it("active player choose not to steal an item when moms_dead_hand dies.", async () => {
        const card = game.obtainCard("b2-moms_dead_hand") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const item1 = game.obtainCard("b2-tech_x") as LootCard;
        game.addInPlay(player2, item1);
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            if (p.id === player1.id)
                return { selected: [], remaining: opts.filter(o => o !== player2) };
            return { selected: opts.slice(0, n), remaining: opts.slice(n) };
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        
        expect(player1.inPlay.map(card => card.slug)).not.toContain(item1.slug);
        expect(player2.inPlay.map(card => card.slug)).toContain(item1.slug);
    });

    it("active player look at a player's hand when moms_eye dies.", async () => {
        const card = game.obtainCard("b2-moms_eye") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.loot( player2, 4); // give some loot cards to player2
        const handSlugs = player2.hand.cards.map(card => card.slug);
        
        game.kill(monster, monster, card);
        let count = 0;
        game.select = async (p, n, opts) => {
            count += 1;
            if(count === 1)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            if(count === 2){
                const selectedPlayer = opts[0] as Player;
                for(const slug of handSlugs){
                    expect(selectedPlayer.hand.cards.map(card => card.slug)).toContain(slug);
                }
                expect(selectedPlayer.hand.cards.length).toBe(handSlugs.length);
                return { selected: [], remaining: opts.filter(o => o !== player2) } as any;
            }
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        expect(count).toBe(2);
    });

    it("active player choose not to look at a player's hand when moms_eye dies.", async () => {
        const card = game.obtainCard("b2-moms_eye") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        game.loot( player2, 4); // give some loot cards to player2
        const handSlugs = player2.hand.cards.map(card => card.slug);
        
        game.kill(monster, monster, card);
        let count = 0;
        game.select = async (p, n, opts) => {
            count += 1;
            if(count === 1)
                return { selected: [], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        expect(count).toBe(1);
    });

    it("active player deals 2 damage to single target when pestilence dies.", async () => {
        const card = game.obtainCard("b2-pestilence") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player2, 10);
        const health = player2.currentHealthPoints;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        expect(player2.currentHealthPoints).toBe(health - 2);
    });

    it("active player deals 2 damage to different targets when pestilence dies.", async () => {
        const card = game.obtainCard("b2-pestilence") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player2, 10);
        const health = player2.currentHealthPoints;
        const healthmonster = game.encounters.monsterIn(1)!.currentHealthPoints;
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            return { selected: [player2, game.encounters.monsterIn(1)], remaining: opts.filter(o => o !== player2) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        await game.resolveStack(); // resolve second damage from death effect
        expect(game.encounters.monsterIn(1)!.currentHealthPoints).toBe(healthmonster - 1);
        expect(player2.currentHealthPoints).toBe(health - 1);
    });

    it("active player steal a soul when the_lamb dies.", async () => {
        const soul = game.obtainCard("b2-lost_soul") as LootCard;
        game.addCardToHand(player2, soul);
        expect(player2.hand.length).toBe(1);
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack(); // resolve playing lost soul

        const card = game.obtainCard("b2-the_lamb") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            if( p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n)};
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        expect(player1.souls.map(s => s.id)).toContain(soul.id);
        expect(player2.souls.map(s => s.id)).not.toContain(soul.id);
    });

    it("active player make a player destroy a soul they control when wizoob dies.", async () => {
        const soul = game.obtainCard("b2-lost_soul") as LootCard;
        game.addCardToHand(player2, soul);
        expect(player2.hand.length).toBe(1);
        game.addLootPlay(player2, 1);
        game.playCard(player2, 0);
        await game.resolveStack(); // resolve playing lost soul

        const card = game.obtainCard("b2-wizoob") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        game.select = async (p, n, opts) => {
            if( p.id === player1.id)
                return { selected: [player2], remaining: opts.filter(o => o !== player2) } as any;
            return { selected: opts.slice(0, n), remaining: opts.slice(n) } as any;
        };
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        await game.resolveStack(); // resolve damage from death effect
        expect(player1.souls.map(s => s.id)).not.toContain(soul.id);
        expect(player2.souls.map(s => s.id)).not.toContain(soul.id);
    });

    // the active player rolls-\n1-3: Each player takes 1 damage.\n4-6: Each player takes 2 damage.
    it("active player has a roll dice effect when wrath dies (1 damage).", async () => {
        const card = game.obtainCard("b2-wrath") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 2; // mock a dice roll of 5
        await game.resolveStack(); // resolve dice roll effect
        await game.resolveStack(); // resolve damage from dice roll effect
        await game.resolveStack(); // resolve damage from dice roll effect
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints - 1);
    });

    
    // the active player rolls-\n1-3: Each player takes 1 damage.\n4-6: Each player takes 2 damage.
    it("active player has a roll dice effect when wrath dies (2 damage).", async () => {
        const card = game.obtainCard("b2-wrath") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect - selection
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 5; // mock a dice roll of 5
        await game.resolveStack(); // resolve dice roll effect
        await game.resolveStack(); // resolve damage from dice roll effect
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve damage from dice roll effect
        await game.resolveStack(); // resolve death
        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 2);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints - 2);
        expect(player1.isDead).toBe(true);
        expect(player2.isDead).toBe(true);
    });

    it("deal 1 damage to killer (p1) when black bony dies.", async () => {
        const card = game.obtainCard("b2-black_bony") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(player1, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve death effect 
        await game.resolveStack(); // resolve damage 

        expect(player1.currentHealthPoints).toBe(player1.healthPoints - 1);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
    });

    it("deal 1 damage to killer (p2) when black bony dies.", async () => {
        const card = game.obtainCard("b2-black_bony") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(player2, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve dice

        await game.resolveStack(); // resolve death effect 
        await game.resolveStack(); // resolve damage 

        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints - 1);
    });

    it("deal 1 damage to killer (monster2, should not take damage) when black bony dies.", async () => {
        const card = game.obtainCard("b2-black_bony") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        const monster2 = game.monsters[1]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        await game.resolveStack(); // resolve damage 

        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints);
        expect(monster2.currentHealthPoints).toBe(monster2.healthPoints);
    });

    it("deal 1 damage to each players when boom_fly dies.", async () => {
        const card = game.obtainCard("b2-boom_fly") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        await game.resolveStack(); // resolve damage 
        await game.resolveStack(); // resolve damage 

        expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints-1);
    });

    it("deal 1 damage to each players when boom_fly dies.", async () => {
        const card = game.obtainCard("b2-boom_fly") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        await game.resolveStack(); // resolve damage 
        await game.resolveStack(); // resolve damage 

        expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
        expect(player2.currentHealthPoints).toBe(player2.healthPoints-1);
    });

    it("put delirium 6 cards from the top of the monster deck when delirium dies.", async () => {
        const card = game.obtainCard("b2-delirium") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveEntireStack(); 
        expect(game.stack.size).toBe(0);

        expect(game.decks["monster"]?.cards[6]!.slug).toBe(card.slug);
    });

    it("put the bloat in a slot when peep dies.", async () => {
        const card = game.obtainCard("b2-peep") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        expect(game.stack.size).toBe(0);
        
        expect(game.encounters.visible.map(m => m.slug)).toContain("b2-the_bloat");
    });

    it("roll when rag_man dies. (1)", async () => {
        const card = game.obtainCard("b2-rag_man") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        expect(game.stack.size).toBe(1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1;
        await game.resolveStack(); // resolve dice roll
        expect(game.stack.size).toBe(0);
        expect(game.decks["monster"]!.cards[0]!.slug).toBe("b2-rag_man");
        expect(game.currentPlayer.souls.length).toBe(0);
    });

    it("roll when rag_man dies. (6)", async () => {
        const card = game.obtainCard("b2-rag_man") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        expect(game.stack.size).toBe(1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 6;
        await game.resolveStack(); // resolve dice roll
        expect(game.stack.size).toBe(0);
        expect(game.decks["monster"]!.cards[0]!.slug).toBe("b2-rag_man");
        expect(game.currentPlayer.souls.length).toBe(0);
    });

    it("roll when rag_man dies. (4)", async () => {
        const card = game.obtainCard("b2-rag_man") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        game.kill(monster, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        expect(game.stack.size).toBe(1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 4;
        await game.resolveStack(); // resolve dice roll
        expect(game.stack.size).toBe(0);
        expect(game.decks["monster"]!.cards[0]!.slug).not.toBe("b2-rag_man");
        expect(game.currentPlayer.souls.length).toBe(1);
    });
    
    it("discard killer hand when sloth dies. (p1)", async () => {
        const card = game.obtainCard("b2-sloth") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        game.loot( player1, 4); // give some loot cards to player1
        game.loot( player2, 4); // give some loot cards to player2
        const monster = game.monsters[0]!;
        
        game.kill(player1, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBeGreaterThanOrEqual(4);
    });

    it("discard killer hand when sloth dies. (p2)", async () => {
        const card = game.obtainCard("b2-sloth") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        game.loot( player1, 4); // give some loot cards to player1
        game.loot( player2, 4); // give some loot cards to player2
        const monster = game.monsters[0]!;
        
        game.kill(player2, monster, card);
        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve death effect 
        
        expect(game.stack.size).toBe(0);
        expect(player2.hand.length).toBe(0);
        expect(player1.hand.length).toBeGreaterThanOrEqual(4);
    });

    it("double rewards when dinga dies on attack roll of 6. (p2)", async () => {
        const card = game.obtainCard("b2-dinga") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;
        
        let currentcoins = player1.coins;
        game.addAttack(player1, 100); // ensure kill
        game.declareAttack(player1);
        await game.declareAttackOnMonster(player1, monster);
        game.attackRoll(player1); // ensure hit
        expect(game.stack._stack.length).toBe(1);
        const roll = game.stack._stack[0] as DiceRoll;
        roll.value = 6;
        await game.resolveStack(); // resolve dice
        await game.resolveStack(); // resolve damage

        await game.resolveStack(); // resolve death
        await game.resolveStack(); // resolve effect
        await game.resolveStack(); // resolve coin gain
        expect(player1.coins).toBeGreaterThan(currentcoins);
        currentcoins = player1.coins;
        await game.resolveStack(); // resolve coin gain
        
        expect(game.stack.size).toBe(0);
        expect(player1.coins).toBeGreaterThan(currentcoins);
    });
});