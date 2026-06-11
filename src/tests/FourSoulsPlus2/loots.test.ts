import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

describe("Four Souls+2 Loot Cards", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupTestGame({
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
 
it("fsp2-gold_key - The active player may attack the monster deck any number of times till end of turn.", async () => {
        const card1 = game.obtainCard("fsp2-gold_key") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        
        for(let i = 0; i < 5; i++){
            game.actions.declareAttack(player1);
            await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
            game.entityHandler.kill(player1, game.encounters.monsterIn(0)!, player1.inPlay[0] as ItemCard);
            await game.actions.resolveStack();
        }
        game.actions.declareAttack(player1);

        expect(game.actions.canDeclareAttackOnEntity(player1, "topDeck", false)).toBe(true);
    });

it("fsp2-tape_worm - Each time you miss an attack roll, deal 1 damage to another player.", async () => {
        const card1 = game.obtainCard("fsp2-tape_worm") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        
        const hp = player2.currentHealthPoints;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 1/6 - 0.001; // roll 1, so attack misses
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [player2], remaining: [] } as any;
        };
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player1 should have 1 more card, player2 should have 1 less
        expect(hp-1).toBe(player2.currentHealthPoints);
    });


    it("fsp2-questionmark_card - As you play this, choose an item. This copies one of that item's ↷ abilities.", async () => {
        const card1 = game.obtainCard("fsp2-questionmark_card") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        const boomerang = game.obtainCard("b2-boomerang") as ItemCard;
        game.cardHandler.addInPlay(player2, boomerang);
        await game.actions.playCard(player1, player1.hand.length - 1, [boomerang]);
        
        // Give player2 some loot cards
        game.loot(player2, 3);
        const initialP1Hand = player1.hand.length;
        const initialP2Hand = player2.hand.length;
        
            game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [{type: "player", payload: {name: player2.json.name, slug: player2.json.slug, globalId: player2.json.globalId}}], remaining: [] } as any;
        };
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player1 should have 1 more card, player2 should have 1 less
        expect(player1.hand.length).toBe(initialP1Hand + 1);
        expect(player2.hand.length).toBe(initialP2Hand - 1);
    });

    it("fsp2-the_left_hand - Each time another player dies, you may recharge an item.", async () => {
        const card1 = game.obtainCard("fsp2-the_left_hand") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        game.gainTreasure(player1, 3);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        player1.inPlay[1]!.charged = false;
        player1.inPlay[2]!.charged = false;
        player1.inPlay[3]!.charged = false;
            game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(Options.includes(player1.inPlay[2]!))
                return { selected: [player1.inPlay[2]!],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        game.entityHandler.kill(player2, player2, player1.inPlay[1]!);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay[1]!.charged).toBe(false);
        expect(player1.inPlay[2]!.charged).toBe(true);
        expect(player1.inPlay[3]!.charged).toBe(false);
    });


    it("fsp2-get_out_of_jail_card - Other players can't play loot cards or activate items till end of turn.", async () => {
        const card1 = game.obtainCard("fsp2-get_out_of_jail_card") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
    
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        expect(player2.canIActivateThisTurn).toBe(false);
        expect(player2.canIUseLootThisTurn).toBe(false);
        game.endTurn();
        await game.resolveEntireStack();
        expect(player2.canIActivateThisTurn).toBe(true);
        expect(player2.canIUseLootThisTurn).toBe(true);
        game.endTurn();
        await game.resolveEntireStack();
        expect(player2.canIActivateThisTurn).toBe(true);
        expect(player2.canIUseLootThisTurn).toBe(true);
    });

    it("fsp2-perthro - Reroll an item.", async () => {
        const card1 = game.obtainCard("fsp2-perthro") as LootCard;
        game.gainTreasure(player1);
        const treasure = player1.inPlay[2]!;
        const expectedRerolledItem = game.decks["treasure"]!.cards[0]!;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, [treasure]);
        await game.actions.resolveStack();
        expect(player1.inPlay[2]).not.toBe(treasure);
        expect(player1.inPlay[2]?.slug).toBe(expectedRerolledItem.slug);
    });

    it("fsp2-pills_3 - 1-2: Deal 1 damage to a player.", async () => {
        const card1 = game.obtainCard("fsp2-pills_3") as LootCard;
        game.random = () => 2/6 - 0.001; // roll 2
        const health = player2.currentHealthPoints;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            expect(Options.length).toBe(2);
            if(Options[1] === player2)
                return { selected: [player2],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // damage
        expect(player2.currentHealthPoints).toBe(health - 1);
    });

    it("fsp2-pills_3 - 3-4: Deal 1 damage to a monster.", async () => {
        const card1 = game.obtainCard("fsp2-pills_3") as LootCard;
        game.random = () => 4/6 - 0.001; // roll 4
        const health = game.monsters[1]!.currentHealthPoints;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            expect(Options.length).toBe(2);
            if(Options[1] === game.monsters[1]!)
                return { selected: [game.monsters[1]!],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // damage
        expect(game.monsters[1]!.currentHealthPoints).toBe(health - 1);
    });

    it("fsp2-pills_3 - 5-6: Take 1 damage.", async () => {
        const card1 = game.obtainCard("fsp2-pills_3") as LootCard;
        game.random = () => 5/6 - 0.001; // roll 5
        const health = player1.currentHealthPoints;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // damage
        expect(player1.currentHealthPoints).toBe(health - 1);
    });

    
    it("fsp2-black_rune - 1-2: Deal 1 damage to each monster.", async () => {
        const card1 = game.obtainCard("fsp2-black_rune") as LootCard;
        game.random = () => 2/6 - 0.001; // roll 2
        const monstersHP = game.monsters.map(m => m.currentHealthPoints);
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);

        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // damage
        await game.actions.resolveStack(); // damage
        // Technically, fly dies but we don't resolve it.
        expect(game.monsters.map(m => m.currentHealthPoints + 1)).toEqual(monstersHP);
    });

    it("fsp2-black_rune - 3-4: Reroll an item.", async () => {
        const card1 = game.obtainCard("fsp2-black_rune") as LootCard;
        game.random = () => 3/6 - 0.001; // roll 3
        game.gainTreasure(player1, 2);
        const treasure = player1.inPlay[2]!;
        const treasure2 = player1.inPlay[3]!;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(Options[1] === treasure2)
                return { selected: [treasure2],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        expect(player1.inPlay[3]).not.toBe(treasure2);
        expect(player1.inPlay[2]).toBe(treasure);
    });

    it("fsp2-black_rune - 5-6: Discard your hand, then loot 3.", async () => {
        const card1 = game.obtainCard("fsp2-black_rune") as LootCard;
        game.random = () => 6/6 - 0.001; // roll 6
        
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.loot(player1, 7);
        const handSize = player1.hand.length;
        const slugs = player1.hand.cards.map(c => c.slug);
        expect(handSize).toBe(7);
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        expect(player1.hand.length).toBe(3);
        for(const slug of slugs)
        {
            expect(player1.hand.cards.find(c => c.slug === slug)).toBeUndefined();
            expect(game.decks.loot.discard.findIndex(c => c.slug === slug)).toBeGreaterThanOrEqual(0);
        }
    });

    it("fsp2-pills_2 - 1-2: Reroll an item you control.", async () => {
        const card1 = game.obtainCard("fsp2-pills_2") as LootCard;
        game.random = () => 1/6 - 0.001; // roll 1
        game.gainTreasure(player1, 2);
        const treasure = player1.inPlay[player1.inPlay.length - 2]!;
        const treasure2 = player1.inPlay[player1.inPlay.length - 1]!;
        const expectedRerolledItem = game.decks["treasure"]!.cards[0]!;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(Options.includes(treasure2))
                return { selected: [treasure2],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        expect(player1.inPlay[player1.inPlay.length - 1]).not.toBe(treasure2);
        expect(player1.inPlay[player1.inPlay.length - 1]?.slug).toBe(expectedRerolledItem.slug);
        expect(player1.inPlay[player1.inPlay.length - 2]).toBe(treasure);
    });

    it("fsp2-pills_2 - 3-4: Reroll an item (from the shop).", async () => {
        const card1 = game.obtainCard("fsp2-pills_2") as LootCard;
        game.random = () => 3/6 - 0.001; // roll 3
        const treasure = game.shop.itemsInShop[1]!;
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(Options.includes(treasure))
                return { selected: [treasure],
                    remaining: []
                };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        expect(game.shop.itemsInShop[1]!).not.toBe(treasure);
    });

    it("fsp2-pills_2 - 5-6: Reroll each item you control.", async () => {
        const card1 = game.obtainCard("fsp2-pills_2") as LootCard;
        game.random = () => 5/6 - 0.001; // roll 1
        game.gainTreasure(player1, 2);
        const treasure = player1.inPlay[player1.inPlay.length - 2]!;
        const treasure2 = player1.inPlay[player1.inPlay.length - 1]!;
        const expectedRerolledItems = game.decks["treasure"]!.cards.slice(0, 2).map(c => c.slug);
        game.cardHandler.addCardToHand(player1, card1);
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack(); // card
        await game.actions.resolveStack(); // roll
        const rerolledItems = player1.inPlay.slice(-2);
        expect(rerolledItems[0]).not.toBe(treasure);
        expect(rerolledItems[1]).not.toBe(treasure2);
        expect(rerolledItems.map(c => c.slug)).toEqual(expectedRerolledItems);

    });

    it("fsp2-ansuz - Look at the top 4 cards of a deck and put them back in any order. ", async () => {
        const card1 = game.obtainCard("fsp2-ansuz") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        const top4reverse = game.decks["loot"]!.cards.slice(0, 4).map(c => c.slug);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: Options.slice(0, max).toReversed(), remaining: Options.slice(max) };
        };
        await game.actions.playCard(player1, player1.hand.length - 1, [game.decks["loot"]!]);

        await game.actions.resolveStack();
        const top4After = game.decks["loot"]!.cards.slice(0, 4).map(c => c.slug).toReversed();
        expect(top4After).toEqual(top4reverse); // order should be reversed
    });

    it("fsp2-aaa_battery - At the end of your turn, roll- 4-6: Recharge an item.", async () => {
        const card1 = game.obtainCard("fsp2-aaa_battery") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        game.random = () => 4/6 - 0.001; // roll 4
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        expect(player1.inPlay[0]!.charged).toBe(false);
        game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.inPlay[0]!.charged).toBe(true);
    });

    it("fsp2-aaa_battery - (roll 3) At the end of your turn, roll- 4-6: Recharge an item.", async () => {
        const card1 = game.obtainCard("fsp2-aaa_battery") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        game.random = () => 3/6 - 0.001; // roll 3
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        expect(player1.inPlay[0]!.charged).toBe(false);
        game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.inPlay[0]!.charged).toBe(false);
    });

    it("fsp2-pills - 1-2: Cancel the effect of a loot being played.", async () => {
        const card1 = game.obtainCard("fsp2-pills") as LootCard;
        const dime = game.obtainCard("b2-a_dime") as LootCard;
        
        game.cardHandler.recharge(player1.inPlay[0] as ItemCard);
        await game.activateItem(player1, player1.inPlay[0]!, [], "tap");
        game.cardHandler.addCardToHand(player1, dime);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        const toBeRemoved = game.stack.peek();
        game.rollDice(player1, true);

        game.cardHandler.addCardToHand(player1, card1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            expect(Options.length).toBe(1);
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        game.random = () => 1/6 - 0.001; // roll 1
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.elements).not.toContain(toBeRemoved);
    });

    it("fsp2-pills - 3-4: Each other player discards a loot card.", async () => {
        const card1 = game.obtainCard("fsp2-pills") as LootCard;
        
        game.loot(player1, 3);
        game.loot(player2, 3);
        game.cardHandler.addCardToHand(player1, card1);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        game.random = () => 3/6 - 0.001; // roll 3
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.hand.cards.length).toBe(2);
        expect(player1.hand.cards.length).toBe(3);
    });

    it("fsp2-poker_chip - 1-3: Gain 1 ¢ instead.", async () => {
        const card1 = game.obtainCard("fsp2-poker_chip") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        const coins = player1.coins;
        game.random = () => 3/6 - 0.001; // roll 3
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        game.gainCoins(player1, 1000, "gift");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(coins + 1);
        game.gainCoins(player1, 10, "gift");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(coins + 11);
        game.endTurn();
        game.gainCoins(player1, 10, "gift"  );
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(coins + 21);
        game.endTurn();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1);
        game.gainCoins(player1, 10, "gift");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(coins + 22);
    });


it("fsp2-poker_chip - 4-6: Gain double the number of ¢ you would've gained.", async () => {
        const card1 = game.obtainCard("fsp2-poker_chip") as LootCard;
        game.cardHandler.addCardToHand(player1, card1);
        const coins = player1.coins;
        game.random = () => 4/6 - 0.001; // roll 4
        await game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        game.gainCoins(player1, 12, "gift");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(2 * (coins + 12));
    });
});

