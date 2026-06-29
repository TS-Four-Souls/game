import { Game } from "../../models/game";
import type { ItemCard, LootCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { DamageOnStack, DiceRoll } from "../../models/stackElement";

describe("Four Souls+2 Treasures", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });
 
    it("fsp2-moms_eye_shadow - If another player declares an attack on a monster, you may choose which monster they attack.", async () => {
        const card1 = game.obtainCard("fsp2-moms_eye_shadow") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [opts[1]], remaining: [] } as any;
        };
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, game.encounters.monsterIn(0)!);
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        expect(game.encounters.monsterIn(1)!.isEngagedInCombat).toBe(true);
        expect(game.encounters.monsterIn(0)!.isEngagedInCombat).toBe(false);
        expect(player2.isEngagedInCombat).toBe(true);
    });

    it("fsp2-mutant_spider - [Tap Effect] The next time a player would roll a dice, they instead roll 4 dice. You choose one of the rolls as the result.", async () => {
        const card1 = game.obtainCard("fsp2-mutant_spider") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        await game.activateItem(player1, card1, [], "tap");
        await game.actions.resolveStack();
        let count = 1;
        game.random = () => count++/6-0.0001;
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [opts[2]], remaining: [] } as any;
        };
        const dice = game.rollDice(player2, true, card1);
        await game.actions.resolveStack();
        expect(dice.value).toBe(3);
    });
    it("fsp2-cursed_eye - When you roll an attack roll of 1, end your turn. Cancel everything that hasn't resolved.", async () => {
        const card1 = game.obtainCard("fsp2-cursed_eye") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(1)!);
        game.random = () => 1/6-.00001;
        game.actions.attackRoll(player1);
        expect(game.stack.size).toBe(2);
        expect(game.currentPlayer).toBe(player1);
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.size).toBe(0);

    });
    it("fsp2-cursed_eye - Combat damage you deal on attack rolls of 6 is increased by 3.", async () => {
        const card1 = game.obtainCard("fsp2-cursed_eye") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(1)!);
        game.random = () => 5/6-.00001;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        const damageOnStack = game.stack.peek() as DamageOnStack;
        expect(damageOnStack.damage[0]).toBe(1);
        
        await game.actions.resolveStack();
        game.random = () => 6/6-.00001;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        const damageOnStack2 = game.stack.peek() as DamageOnStack;
        expect(damageOnStack2.damage[0]).toBe(4);
    });

    it("fsp2-telepathy_for_dummies - At the start of your turn, roll- You may change the result of your next roll this turn to this result.", async () => {
        const card1 = game.obtainCard("fsp2-telepathy_for_dummies") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.random = () => 5/6-0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.random = () => 1/6-0.0001;
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [opts[1]], remaining: [] } as any;
        }
        const dice = game.rollDice(player1, true);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(dice.value).toBe(5);

    }); 
    it("fsp2-game_breaking_bug - Each time a player rolls a ❶, you may reroll an item they control.", async () => {
        const card1 = game.obtainCard("fsp2-game_breaking_bug") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.gainTreasure(player2, 3);
        const slug = player2.inPlay[3]!.slug;
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [player2.inPlay[3]!], remaining: [] } as any;
        }
        game.random = () => 1/6-0.0001; // roll a 1
        game.rollDice(player2, false, card1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        expect(player2.inPlay[3]!.slug).not.toBe(slug);
        
    });

    it("fsp2-hourglass - Each time a player rolls a ❷, you may deactivate an item.", async () => {
        const card1 = game.obtainCard("fsp2-hourglass") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [player2.inPlay[0]!], remaining: [] } as any;
        }
        game.cardHandler.recharge(player2.inPlay[0] as ItemCard);
        game.random = () => 2/6-0.0001; // roll a 2
        game.rollDice(player2, false, card1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        expect(player2.inPlay[0]!.charged).toBe(false);
        
    });

    it("fsp2-hourglass - (select 0 item to deactivate) Each time a player rolls a ❷, you may deactivate an item.", async () => {
        const card1 = game.obtainCard("fsp2-hourglass") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            if(opts.length === 1) 
                return { selected: [opts[0]], remaining: [] } as any;
            return { selected: [], remaining: [] } as any;
        }
        game.cardHandler.recharge(player2.inPlay[0] as ItemCard);
        game.random = () => 2/6-0.0001; // roll a 2
        game.rollDice(player2, false, card1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        expect(player2.inPlay[0]!.charged).toBe(true);
        
    });

    it("fsp2-guppys_eye - Each other player plays with their hand revealed.", async () => {
        const card1 = game.obtainCard("fsp2-guppys_eye") as TreasureCard;
        expect(player1.handRevealed).toBe(false);
        expect(player2.handRevealed).toBe(false);
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.handRevealed).toBe(false);
        expect(player2.handRevealed).toBe(true);
        game.cardHandler.removeInPlay(player1, card1);
        expect(player1.handRevealed).toBe(false);
        expect(player2.handRevealed).toBe(false);
    });

    it("fsp2-red_candle - [Tap Effect] Before a dice is rolled, choose a number. Till the end of turn, each time that number is rolled, deal 1 damage to a monster or player.", async () => {
        const card1 = game.obtainCard("fsp2-red_candle") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);

        game.random = () => 2/6-0.0001; // roll a 2
        await game.activateItem(player1, card1, [2], "tap");
        await game.actions.resolveStack();
        game.rollDice(player2, true);
        await game.actions.resolveStack();
        if(game.stack.size > 0) {
            expect(game.stack.size).toBe(1);
        }
        const hp = player2.currentHealthPoints;
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [player2], remaining: [] } as any;
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(hp-1);

        game.random = () => 1/6-0.0001; // roll a 1
        game.rollDice(player2, true);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player2.currentHealthPoints).toBe(hp-1);

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
         game.random = () => 2/6-0.0001; // roll a 2
        game.rollDice(player2, true);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player2.currentHealthPoints).toBe(hp);
    });

    it("fsp2-divorce_papers - [Tap Effect] Destroy this. If you do, choose another player. They give you half of their ¢ and loot cards rounded down, then gives you an item.", async () => {
        const card1 = game.obtainCard("fsp2-divorce_papers") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.gainCoins(player2, 5, ("debug"));
        game.loot(player2, 3);
        game.gainTreasure(player2, 3);
        await game.activateItem(player1, card1, [player2], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(2);
        expect(player1.hand.cards.length).toBe(1);
        expect(player1.inPlay.length).toBe(3);

        expect(player2.coins).toBe(3);
        expect(player2.hand.cards.length).toBe(2);
        expect(player2.inPlay.length).toBe(4);
        
    });

    it("fsp2-euthanasia - Each time you roll the same result twice in a row on an attack roll on the same turn, kill the monster you're attacking.", async () => {
        const card1 = game.obtainCard("fsp2-euthanasia") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        const monster = game.encounters.monsterIn(1)!;
        await game.actions.declareAttackOnEntity(player1, monster);
        game.random = () => 0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.monsterIn(1)!.card.slug).not.toBe("b2-fatty");
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(0)!);
        game.actions.attackRoll(player1);
        expect(game.stack.size).toBe(1);
    });

    it("fsp2-head_of_the_keeper - Each time you deal damage, gain 1¢., Each time you kill a monster or player, gain 2¢.", async () => {
        const card1 = game.obtainCard("fsp2-head_of_the_keeper") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(1)!); // Fatty
        game.random = () => 0.99;
        const initialCoins = player1.coins;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 1);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 2);
        game.entityHandler.kill(player1, game.encounters.monsterIn(1)!, player1.inPlay[0]!); // kill Fatty
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(initialCoins + 4);
    });

    it("fsp2-1_up - When you would die on your turn, destroy this. If you do, prevent death, heal to full [HP] , and cancel your attack. You may attack an additional time this turn.", async () => {
        const card1 = game.obtainCard("fsp2-1_up") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const hp = player1.currentHealthPoints;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(0)!);
        game.entityHandler.dealDamage(player2, player1, card1, hp);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(hp);
        expect(player1.isDead).toBe(false);
        expect(player1.isEngagedInCombat).toBe(false);
        expect(player1.attackThisTurn).toBe(1);
        expect(game.encounters.monsterIn(0)!.isEngagedInCombat).toBe(false);
    });

    it("fsp2-black_candle - [Tap Effect] Reveal the top 6 cards of the monster deck. Give any curse cards revealed to the player or players of your choosing. Put the rest on the bottom of the deck in any order.", async () => {
        const card1 = game.obtainCard("fsp2-black_candle") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const slugs = [ "b2-curse_of_amnesia","b2-red_host","b2-cod_worm","b2-curse_of_pain","b2-conjoined_fatty", "b2-curse_of_loss"];
        for(const slug of slugs) {
            const card = game.obtainCard(slug) as MonsterCard;
            game.decks.monster.addTopPosition(card);
        }
        let count = 0;
        game.select = (_issuer, _min, _max, opts, _optional) => {
            count += 1;
            if(count === 4)
            return { selected: opts, remaining: [] } as any;
            return { selected: [game.players[count%2]], remaining: [] } as any;
        };
        await game.activateItem(player1, card1, [], "tap");
        await game.actions.resolveStack();
        expect(count ).toBe(4);
        expect(player2.curses.filter(c => c.slug === "b2-curse_of_loss").length).toBe(1);
        expect(player1.curses.filter(c => c.slug === "b2-curse_of_pain").length).toBe(1);
        expect(player2.curses.filter(c => c.slug === "b2-curse_of_amnesia").length).toBe(1);
    });

    it("fsp2-distant_admiration - [Tap Effect] Choose another player. They give you a loot card. Reveal it, then you must play that loot card if able. This doesn't use a loot play.", async () => {
        const card1 = game.obtainCard("fsp2-distant_admiration") as TreasureCard;
        const lootCard = game.obtainCard("b2-a_dime") as LootCard;
        const initlootplay = player1.remainingLootPlay;
        game.loot(player2, 2);
        game.cardHandler.addCardToHand(player2, lootCard);
        game.loot(player2, 2);
        const index = player2.hand.cards.indexOf(lootCard);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [lootCard], remaining: [] } as any;
        }
        game.cardHandler.addInPlay(player1, card1);
        await game.activateItem(player1, card1, [player2], "tap");
        await game.actions.resolveStack();
        expect(player2.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(player1.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(player1.remainingLootPlay).toBe(initlootplay);
        expect(game.stack.size).toBe(1);
    });

    it("fsp2-distant_admiration - (0 remaining loot plays) [Tap Effect] Choose another player. They give you a loot card. Reveal it, then you must play that loot card if able. This doesn't use a loot play.", async () => {
        const card1 = game.obtainCard("fsp2-distant_admiration") as TreasureCard;
        const lootCard = game.obtainCard("b2-a_dime") as LootCard;
        player1.remainingLootPlay = 0;
        const initlootplay = player1.remainingLootPlay;
        game.loot(player2, 2);
        game.cardHandler.addCardToHand(player2, lootCard);
        game.loot(player2, 2);
        const index = player2.hand.cards.indexOf(lootCard);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [lootCard], remaining: [] } as any;
        }
        game.cardHandler.addInPlay(player1, card1);
        await game.activateItem(player1, card1, [player2], "tap");
        await game.actions.resolveStack();
        expect(player2.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(player1.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(player1.remainingLootPlay).toBe(initlootplay);
        expect(game.stack.size).toBe(1);
    });

    it("fsp2-distant_admiration - (not playable) [Tap Effect] Choose another player. They give you a loot card. Reveal it, then you must play that loot card if able. This doesn't use a loot play.", async () => {
        const card1 = game.obtainCard("fsp2-distant_admiration") as TreasureCard;
        const lootCard = game.obtainCard("b2-dice_shard") as LootCard;
        player1.remainingLootPlay = 0;
        const initlootplay = player1.remainingLootPlay;
        game.loot(player2, 2);
        game.cardHandler.addCardToHand(player2, lootCard);
        game.loot(player2, 2);
        const index = player2.hand.cards.indexOf(lootCard);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [lootCard], remaining: [] } as any;
        }
        game.cardHandler.addInPlay(player1, card1);
        await game.activateItem(player1, card1, [player2], "tap");
        await game.actions.resolveStack();
        expect(player2.hand.cards.map((c) => c.slug)).not.toContain(lootCard.slug);
        expect(player1.hand.cards.map((c) => c.slug)).toContain(lootCard.slug);
        expect(player1.remainingLootPlay).toBe(initlootplay);
    });

    it("fsp2-magnet - Each time another player gains ¢, they must give you 1¢.", async () => {
        const card1 = game.obtainCard("fsp2-magnet") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);

        const initialCoins1 = player1.coins;
        const initialCoins2 = player2.coins;

        game.gainCoins(player2, 3, ("debug"));
        await game.actions.resolveStack();
        expect(player2.coins).toBe(initialCoins2 + 2); // player2 gains 3 but gives 1 to player1 for each coin gained
        expect(player1.coins).toBe(initialCoins1 + 1); // player1 gains 1 coin
    });

    it("fsp2-mama_haunt - [Curse Effect] Your character doesn't recharge during your recharge step.", async () => {
        const card1 = game.obtainCard("fsp2-mama_haunt") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.character.charged).toBe(false);
        game.cardHandler.recharge(player1.inPlay[0] as ItemCard);
        expect(player1.character.charged).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // character stay charged if not used.
        expect(player1.character.charged).toBe(true);
    });

    it("fsp2-smart_fly - [Tap Effect] Look at the top card of a deck. You may put it into discard or put it back on top.,  Each time you take damage, you may recharge this.", async () => {
        const card1 = game.obtainCard("fsp2-smart_fly") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            expect(opts.length).toBe(1);
            expect(_max).toBe(1);
            count += 1;
            return { selected: [], remaining: [] } as any;
        };
        await game.activateItem(player1, card1, [game.decks.treasure], "tap");
        let count = 0;
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(count).toBe(1);
    });

    it("fsp2-phd - You may add or subtract 1 from any of your non-attack rolls.", async () => {
        const card1 = game.obtainCard("fsp2-phd") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.random = () => 3/6-0.0001;
        // attack roll don't change
        let diceRoll = game.rollDice(player1, true, card1);
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(diceRoll.value).toBe(3);
        
        // non attack roll change, but can select nothing
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [], remaining: [] } as any;
        }
        diceRoll = game.rollDice(player1, false, card1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(diceRoll.value).toBe(3);
        
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [-1], remaining: [] } as any;
        }
        diceRoll = game.rollDice(player1, false, card1);
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(false);
        await game.actions.resolveStack();
        expect(diceRoll.value).toBe(2);
        expect(game.stack.isEmpty()).toBe(true);

        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [1], remaining: [] } as any;
        }
        diceRoll = game.rollDice(player1, false, card1);
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(false);
        await game.actions.resolveStack();
        expect(diceRoll.value).toBe(4);
        expect(game.stack.isEmpty()).toBe(true);

    });

    it("fsp2-forget_me_now - [Tap Effect] Destroy this. If you do, each player destroys a soul they control.", async () => {
        const card1 = game.obtainCard("fsp2-forget_me_now") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);

        const g1 = game.obtainCard("b2-guppys_head")!;
        const g2 = game.obtainCard("b2-the_dead_cat")!;
        game.cardHandler.addInPlay(player1, g1 as ItemCard);
        game.cardHandler.addInPlay(player1, g2 as ItemCard);
        expect(player1.souls.length).toBe(1);

        game.cardHandler.addCardToHand(player2, game.obtainCard("b2-lost_soul")! as LootCard);
        game.entityHandler.addLootPlay(player2, 1);
        game.actions.playCard(player2, player2.hand.length - 1);
        await game.actions.resolveStack();
        expect(player2.souls.length).toBe(1);

        await game.activateItem(player1, card1, [], "tap");
        await game.actions.resolveStack();
        expect(player1.souls.length).toBe(0);
        expect(player2.souls.length).toBe(0);
    });

    it("daddy_long_legs", async () => {
        const card1 = game.obtainCard("fsp2-daddy_long_legs") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [game.encounters.monsterIn(0)!], remaining: [] } as any;
        }
        const hp = game.encounters.monsterIn(0)!.currentHealthPoints;
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.encounters.monsterIn(0)!.currentHealthPoints).toBe(hp-1);
        await game.actions.resolveStack();

        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [player2], remaining: [] } as any;
        }
        const hp2 = player2.currentHealthPoints;
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(hp2-1);
        
    });

    it("fsp2-libra - [Tap Effect] Change the result of a dice roll to a 3.", async () => {
        const card1 = game.obtainCard("fsp2-libra") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.random = () => 0.99;
        const diceRoll = game.rollDice(player1, true);
        await game.activateItem(player1, card1, [diceRoll, 3], "tap");
        await game.actions.resolveStack();
        expect(game.stack.peek()).toBeInstanceOf(DiceRoll);
        expect(diceRoll.value).toBe(3);
    });


    it("fsp2-the_wiz - Monsters have +1 [DC] on your turn,  Each time you deal combat damage, deal 1 damage to another monster or player.", async () => {
        const card1 = game.obtainCard("fsp2-the_wiz") as TreasureCard;
        const evastion = [game.entityHandler.getDC(game.encounters.monsterIn(0)!), game.entityHandler.getDC(game.encounters.monsterIn(1)!)];
        game.cardHandler.addInPlay(player1, card1);
        expect(game.entityHandler.getDC(game.encounters.monsterIn(0)!)).toBe(evastion[0]!+1);
        expect(game.entityHandler.getDC(game.encounters.monsterIn(1)!)).toBe(evastion[1]!+1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(0)!);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [game.encounters.monsterIn(1)!], remaining: [] } as any;
        }
        await game.actions.resolveStack();
        const next = game.stack.peek() as DamageOnStack;
        expect(next).not.toBeNull();
        expect(next).toBeInstanceOf(DamageOnStack);
        expect(next.receiver).toEqual(game.encounters.monsterIn(1)!);
        expect(next.from).toEqual(player1);
    });

    it("fsp2-abaddon - +3 [ATK], Each time you take damage, die!", async () => {
        const card1 = game.obtainCard("fsp2-abaddon") as TreasureCard;
        expect(player1.attackPoints).toBe(1);
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.attackPoints).toBe(4);
        game.entityHandler.dealDamage(player2, player1, card1, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(0);
        expect(player1.isDead).toBe(true);
    });

    it("fsp2-lard - +2 [HP], Each time you take damage, discard a loot card.", async () => {
        const card1 = game.obtainCard("fsp2-lard") as TreasureCard;
        const hp = player1.currentHealthPoints;
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.currentHealthPoints).toBe(hp+2);
        game.loot(player1, 2);
        game.entityHandler.dealDamage(player2, player1, card1, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(hp+1);
        expect(player1.hand.cards.length).toBe(1);
    });

    it("fsp2-polyphemus - +2 [ATK], +1 [DC]", async () => {
        const card1 = game.obtainCard("fsp2-polyphemus") as TreasureCard;
        expect(player1.attackPoints).toBe(1);
        const evastion = [game.entityHandler.getDC(game.encounters.monsterIn(0)!), game.entityHandler.getDC(game.encounters.monsterIn(1)!)];
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.attackPoints).toBe(3);
        expect(game.entityHandler.getDC(game.encounters.monsterIn(0)!)).toBe(evastion[0]!+1);
        expect(game.entityHandler.getDC(game.encounters.monsterIn(1)!)).toBe(evastion[1]!+1);
    });

    it("fsp2-rainbow_baby - [Tap Effect] Choose one- Each player takes 1 damage.", async () => {
        const card1 = game.obtainCard("fsp2-rainbow_baby") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const healthPoints = game.players.map(p => p.currentHealthPoints);
        await game.activateItem(player1, card1, ["Each player takes 1 damage."], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.players.map(p => p.currentHealthPoints)).toEqual(healthPoints.map(hp => hp-1));
    });
    
    it("fsp2-rainbow_baby - [Tap Effect] Choose one- Each player gains 2¢.", async () => {
        const card1 = game.obtainCard("fsp2-rainbow_baby") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const coins = game.players.map(p => p.coins);
        await game.activateItem(player1, card1, ["Each player gains 2¢."], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.players.map(p => p.coins)).toEqual(coins.map(c => c+2));
    });

    it("fsp2-rainbow_baby - [Tap Effect] Choose one- Each player loots 1.", async () => {
        const card1 = game.obtainCard("fsp2-rainbow_baby") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const handSizes = game.players.map(p => p.hand.cards.length);
        await game.activateItem(player1, card1, ["Each player loots 1."], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.players.map(p => p.hand.cards.length)).toEqual(handSizes.map(hs => hs+1));
        });
    
    it("fsp2-rubber_cement - Each time you miss an attack roll, roll- 1-3: Deal 1 damage to a monster or player.", async () => {
        const card1 = game.obtainCard("fsp2-rubber_cement") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(0)!);
        game.random = () => 0.01;
        game.actions.attackRoll(player1);
        game.select = (_issuer, _min, _max, opts, _optional) => {
            return { selected: [player2], remaining: [] } as any;
        };
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // rubber cement trigger
        await game.actions.resolveStack(); // rubber cement trigger
        const next = game.stack.peek() as DamageOnStack;
        expect(next).not.toBeNull();
        expect(next).toBeInstanceOf(DamageOnStack);
        expect(next.receiver).toEqual(player2);
        expect(next.from).toEqual(player1);
    });

    it("fsp2-head_of_krampus - [Tap Effect] Roll- 1-3: Deal 1 damage to each player", async () => {
        const card1 = game.obtainCard("fsp2-head_of_krampus") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const HPmobs = game.monsters.map(m => m.currentHealthPoints);
        const HPplayers = game.players.map(p => p.currentHealthPoints);
        game.random = () => 0.01; // roll a 1
        await game.activateItem(player1, card1, [], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.currentHealthPoints)).toEqual(HPmobs.map(hp => hp));
        expect(game.players.map(p => p.currentHealthPoints)).toEqual(HPplayers.map(hp => hp-1));
    });

    it("fsp2-head_of_krampus - [Tap Effect] Roll- 4-6: Deal 1 damage to each monster.", async () => {
        const card1 = game.obtainCard("fsp2-head_of_krampus") as TreasureCard;
            game.cardHandler.addInPlay(player1, card1);
            const HPmobs = game.monsters.map(m => m.currentHealthPoints);
            const HPplayers = game.players.map(p => p.currentHealthPoints);
            game.random = () => 0.9; // roll a 6
            await game.activateItem(player1, card1, [], "tap");
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.players.map(p => p.currentHealthPoints)).toEqual(HPplayers.map(hp => hp));
            expect(game.monsters.map(m => m.currentHealthPoints)).toEqual(HPmobs.map(hp => hp-1));
    });

    it("fsp2-20_20 - [Tap Effect] Add up to 2 to an attack roll.", async () => {
        const card1 = game.obtainCard("fsp2-20_20") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.actions.declareAttack(player1);
        const monster = game.encounters.monsterIn(1)!;
        await game.actions.declareAttackOnEntity(player1, monster);
        game.random = () => 0.01; // roll a 1
        game.actions.attackRoll(player1);
        await game.activateItem(player1, card1, [game.stack.peek(), 2], "tap");
        await game.actions.resolveStack();
        expect((game.stack.peek() as DiceRoll).value).toBe(3);
    });
});

