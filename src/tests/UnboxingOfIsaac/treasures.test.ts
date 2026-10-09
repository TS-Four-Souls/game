import type { ItemCard, LootCard, MonsterCard, RoomCard, TreasureCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";
import { DamageOnStack, DiceRoll } from "../../models/stackElement";


describe("Unboxing Treasure ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(async () => {
        const setup = await setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: [],
                        playerCount: 2,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.resetStack();
        game.resetCallbacks();
    });
    
        it("box-three_dollar_bill dammage complex", async () => {
            let item = game.obtainCard("box-three_dollar_bill") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            player1.receiveDamage(1, null, null);
            game.entityHandler.addHealth(player1, 100, "other");
            game.entityHandler.addHealth(player2, 100, "other");
            game.entityHandler.dealDamage(player1, player2, {card: item, visualEffectBox: undefined}, 1);
            game.random = () => 6/6-0.01;
            await game.actions.resolveStack();
            expect(game.stack.size).toBe(2);
            await game.actions.resolveStack();
            game.entityHandler.dealDamage(player1, player2, {card: item, visualEffectBox: undefined}, 1);
            game.random = () => 5/6-0.01;
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player2.healthPoints).toBe(player2.currentHealthPoints + 1);
            expect(game.stack.size).toBe(2);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player2.healthPoints).toBe(player2.currentHealthPoints + 3);
        });
    
        it("box-three_dollar_bill dammage", async () => {
            let item = game.obtainCard("box-three_dollar_bill") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            player1.receiveDamage(1, null, null);
            game.entityHandler.addHealth(player1, 100, "other");
            game.entityHandler.addHealth(player2, 100, "other");
            game.entityHandler.dealDamage(player1, player2, {card: item, visualEffectBox: undefined}, 1);
            game.random = () => 6/6-0.01;
            await game.actions.resolveStack();
            expect(game.stack.size).toBe(2);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player2.healthPoints).toBe(player2.currentHealthPoints + 2);
        });
    
        it("box-three_dollar_bill heal", async () => {
            let item = game.obtainCard("box-three_dollar_bill") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            player1.receiveDamage(1, null, null);
            game.entityHandler.addHealth(player1, 100, "other");
            game.entityHandler.addHealth(player2, 100, "other");
            game.entityHandler.dealDamage(player1, player2, {card: item, visualEffectBox: undefined}, 1);
            game.random = () => 4/6-0.01;
            await game.actions.resolveStack();
            expect(game.stack.size).toBe(2);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player1.healthPoints).toBe(player1.currentHealthPoints);
        });
    
        it("box-the_nail", async () => {
            let item = game.obtainCard("box-the_nail") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.entityHandler.dealDamage(player1, player2, {card: item, visualEffectBox: undefined}, 2);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.hand.length).toBe(1);
            game.actions.declareAttack(player1);
            expect(game.actions.canDeclareAttackOnEntity(player1, player2, false)).not.toBe(true);
            await game.activateItem(player1, item, [], "tap");
            await game.actions.resolveStack();
            expect(game.actions.canDeclareAttackOnEntity(player1, player2, false)).toBe(true);
        });
    
        it("box-the_mark", async () => {
            let item = game.obtainCard("box-the_mark") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);

            expect(game.entityHandler.getAttack(player1)).toBe(2);
            game.actions.declareAttack(player1);
            for(const player of game.players)
            {
                if(player !== player1)
                    expect(game.actions.canDeclareAttackOnEntity(player1, player)).toBe(true);
            }

            game.entityHandler.endCombat();
            await game.actions.resolveStack();
            await game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            game.actions.declareAttack(player2);
            expect(game.actions.canDeclareAttackOnEntity(player2, player1)).toBe(true);
        });
    
        it("box-seraphim", async () => {
            let item = game.obtainCard("box-seraphim") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);

            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.entityHandler.addHealth(game.monsters[0]!, 100, "other");
            game.entityHandler.addHealth(player1, 100, "other");
            game.random = () => (game.monsters[0]!.evasion -1)/6-0.01;
            const rolls = [1,3,5];
            let expectedHealth = game.monsters[0]!.healthPoints;
            for (let i = 0; i < 10; i++) {
                expectedHealth -=  (rolls.includes(i+1) ? 1 : 0);
                game.actions.attackRoll(player1);
                await game.actions.resolveStack();
                await game.actions.resolveStack();
                await game.actions.resolveStack();
                await game.actions.resolveStack();
                expect(game.stack.isEmpty()).toBe(true);
                expect(game.monsters[0]!.currentHealthPoints).toBe(expectedHealth);
            }
        });
    
        it("box-my_little_unicorn", async () => {
            let item = game.obtainCard("box-my_little_unicorn") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            await game.activateItem(player1, item, [], "tap");

            await game.actions.resolveStack();
            game.entityHandler.dealDamage(player1, player1, {card: item, visualEffectBox: undefined}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(2);

            game.actions.declareAttack(player1);
            game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => 0.3;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();

            expect(game.stack.isEmpty()).toBe(true);
            expect(player2).toBe(game.currentPlayer);
        });
    
        it("box-number_one", async () => {
            let item = game.obtainCard("box-number_one") as ItemCard;
            expect(item).toBeDefined();
            const evasions = game.monsters.map(m => game.entityHandler.getDC(m) + 1);
            game.entityHandler.addHealth(game.monsters[0]!, 10, "other");
            game.cardHandler.addInPlay(player1, item);
            expect(game.monsters.map(m => game.entityHandler.getDC(m))).toEqual(evasions.map(e => e));
            game.actions.declareAttack(player1);
            game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.monsters[0]!.addEvasion(-10);
            game.random = () => 0.99;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
            expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints);
        });
    
        it("box-the_stairway", async () => {
            game.select = async (player: Player, min: number, max: number, Options: any[]) => {
                return { selected: Options.slice(0, max).toReversed(), remaining: Options.slice(max) };
            };
            let item = game.obtainCard("box-the_stairway") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            const slugs = game.decks.treasure.cards.slice(0, 7).map(card => card.slug).toReversed();
            game.actions.declarePurchase(player1);
            expect(game.stack.size).toBe(1);
            await game.actions.resolveStack();
            expect(game.decks.treasure.cards.slice(0, 7).map(card => card.slug)).toEqual(slugs);
        });
    
        it("box-satanic_bible", async () => {
            let item = game.obtainCard("box-satanic_bible") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            const mob = game.monsters[0]!;
            await game.activateItem(player1, item, [game.monsters[0]!], 0);
            await game.actions.resolveStack();
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
            game.entityHandler.dealDamage(player1, game.monsters[0]!, {card: item, visualEffectBox: undefined}, 999);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(mob.healthPoints).toBe(mob.currentHealthPoints);
        });
    
        it("box-moms_underwear", async () => {
            let item = game.obtainCard("box-moms_underwear") as ItemCard;
            expect(item).toBeDefined();
            game.entityHandler.addHealth(game.monsters[0]!, 100 - game.monsters[0]!.healthPoints);
            game.cardHandler.addInPlay(player1, item);
            expect(player1.attackThisTurn).toBe(2);
            game.entityHandler.addAttackThisTurn(player1, 2);
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => 0.99;
            await game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.monsters[0]!.currentHealthPoints).toBe(99);
            game.entityHandler.endCombat();

            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => 0.99;
            await game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.monsters[0]!.currentHealthPoints).toBe(96);

            await game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.monsters[0]!.currentHealthPoints).toBe(93);

            await game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.monsters[0]!.currentHealthPoints).toBe(90);

            game.entityHandler.endCombat();
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            await game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.monsters[0]!.currentHealthPoints).toBe(89);
        });
    
        it("box-moms_heels 2", async () => {
            let item = game.obtainCard("box-moms_heels") as ItemCard;
            expect(item).toBeDefined();
            expect(player1.attackThisTurn).toBe(1);
            game.cardHandler.addInPlay(player1, item);
            expect(player1.attackThisTurn).toBe(2);
            game.entityHandler.dealDamage(player1, player1, {card: item, visualEffectBox: undefined}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(1);
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => 0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(1);
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player1.currentHealthPoints).toBe(0);
        });
    
        it("box-moms_heels", async () => {
            let item = game.obtainCard("box-moms_heels") as ItemCard;
            expect(item).toBeDefined();
            expect(player1.attackThisTurn).toBe(1);
            game.cardHandler.addInPlay(player1, item);
            await game.actions.resolveStack();
            expect(player1.attackThisTurn).toBe(2);
            await game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            game.entityHandler.dealDamage(player1, player1, {card: item, visualEffectBox: undefined}, 1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(1);
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => 0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(1);
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player1.currentHealthPoints).toBe(0);
        });
    
        it("box-lil_delirium", async () => {
            let item = game.obtainCard("box-lil_delirium") as ItemCard;
            const b = game.obtainCard("b2-moms_purse" ) as TreasureCard;
            game.endTurn();
            await game.resolveEntireStack();
            game.decks.treasure.addTopPosition(b!);
            const slugs = game.decks.treasure.cards.slice(0, 3).map(c => c.slug);
            game.cardHandler.addInPlay(player1, item);
            game.endTurn();
            await game.actions.resolveStack();
            expect(item).toBeDefined();
            await game.resolveEntireStack();
            for (const card of game.decks.treasure.cards.slice(0, 3).map(c => c.slug))
                expect(slugs.includes(card)).toBe(false);
            expect(player1.hand.length).toBe(2);
        });
    
        it("box-glitter_bombs", async () => {
            let item = game.obtainCard("box-glitter_bombs") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            const coins = game.decks.loot.getCardFromSlug("b2-a_nickel") as LootCard;
            game.decks.loot.addTopPosition(coins);
            expect(() => game.actions.playCard(player1, "topLootCard",[])).toThrow();
            await game.activateItem(player1, item, [], "tap");
            await game.actions.resolveStack();
            for(const player of game.players) {
                expect(player.canSeeTopOfLootDeck).toBe(true);
                expect(player.canPlayTopOfLootDeck).toBe(player === player1);
            }
            expect(() => game.actions.playCard(player1, "topLootCard",[])).not.toThrow();
            await game.actions.resolveStack();
            game.endTurn();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            for(const player of game.players) {
                expect(player.canSeeTopOfLootDeck).toBe(false);
                expect(player.canPlayTopOfLootDeck).toBe(false);
            }
            game.entityHandler.addLootPlay(player1, 1, "other");
            expect(() => game.actions.playCard(player1, "topLootCard",[])).toThrow();
        });
    
        it("box-cube_of_meat_3", async () => {
            let item = game.obtainCard("box-cube_of_meat_3") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.random = () => 3/6-0.01;
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.entityHandler.addDC(game.monsters[0]!, 6, "other");
            game.entityHandler.addHealth(game.monsters[0]!, 10, "other");
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints);

            game.random = () => 4/6-0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);

            game.cardHandler.addInPlay(player1, item);
            game.random = () => 4/6-0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);
        });
    
        it("box-cube_of_meat_2", async () => {
            let item = game.obtainCard("box-cube_of_meat_2") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.random = () => 2/6-0.01;
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.entityHandler.addDC(game.monsters[0]!, 1, "other");
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints);

             game.random = () => 1/6-0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);

            game.cardHandler.addInPlay(player1, item);
            expect(player1.healthPoints).toBe(4);
        });
    
        it("box-cube_of_meat", async () => {
            let item = game.obtainCard("box-cube_of_meat") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.random = () => 1/6-0.01;
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.entityHandler.addDC(game.monsters[0]!, 1, "other");
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints);

             game.random = () => 2/6-0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(player1.currentHealthPoints).toBe(player1.healthPoints-1);

            game.cardHandler.addInPlay(player1, item);
            expect(game.entityHandler.getAttack(player1)).toBe(3);
        });
    
        it("box-number_two", async () => {
            let item = game.obtainCard("box-number_two") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.random = () => 2/6-0.01;
            game.rollDice(player1, item);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            expect(player1.healthPoints).toBe(player1.healthPoints);
        });
    
        it("box-edens_soul", async () => {
            let item = game.obtainCard("box-edens_soul") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            game.cardHandler.recharge(item, "other");
            expect(item.charged).toBe(true);
            const slugs = game.decks.treasure.cards.slice(0, 2).map(card => card.slug);
            await game.activateItem(player1, item, [], "tap");
            await game.actions.resolveStack();
            expect(player1.inPlay.length).toBe(3);
            for (const slug of slugs) {
                expect(player1.inPlay.map(card => card?.slug)).toContain(slug);
            }
        });
    
        it("box-moms_lipstick", async () => {
            let item = game.obtainCard("box-moms_lipstick") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            expect(player1.attackThisTurn).toBe(2);
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
            game.random = () => game.monsters[0]!.evasion / 6-0.01;
            game.actions.attackRoll(player1);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            // monster death on stack
            expect(player1.currentHealthPoints).toBe(player1.healthPoints);
            expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints-1);
        });
    
        it("box-a_quarter", async () => {
            let item = game.obtainCard("box-a_quarter") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            await game.activateItem(player1, item, [], 0);

            await game.actions.resolveStack();
            expect(player1.coins).toBe(25);
            expect(player1.inPlay.length).toBe(1);
        });

        it("box-a_dollar", async () => {
            let item = game.obtainCard("box-a_dollar") as ItemCard;
            expect(item).toBeDefined();
            game.cardHandler.addInPlay(player1, item);
            const slugs = game.shop.cardsOnTop.map(card => card?.slug!);
            game.cardHandler.addInPlay(player1, item);
            await game.activateItem(player1, item, [], 0);
            expect(player1.inPlay.length).toBe(1);

            await game.actions.resolveStack();
            expect(game.stack.isEmpty()).toBe(true);
            expect(game.shop.cardsOnTop.map(card => card?.slug)).not.toEqual(slugs);
            for (const slug of slugs) {
                expect(player1.inPlay.map(card => card?.slug)).toContain(slug);
            }
        });
});