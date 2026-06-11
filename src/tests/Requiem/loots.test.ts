import type { ItemCard, LootCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";


describe("Requiem Loots ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(() => {
        const setup = setupTestGame({
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

    it("magic_marker (loot card)", async () => {
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        game.addCardToHand(player1, bs);
        let loot = game.obtainCard("r-magic_marker") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        game.actions.playCard(player1, 0, [game.stack.peek()!]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
    });

    it("magic_marker (item card)", async () => {
        let loot = game.obtainCard("r-magic_marker") as LootCard;
        game.addCardToHand(player1, loot);
        const bs = game.obtainCard("b2-brimstone") as ItemCard;
        game.addInPlay(player1, bs);
        game.actions.playCard(player1, 0, [bs]);
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(3);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(2);
    });

    it("rib_of_greed", async () => {
        let loot = game.obtainCard("r-rib_of_greed") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        player1.inPlay[2]?.setEternal(true);
        game.gainCoins(player1, 5, loot);
        game.loot(player1, 2);
        game.entityHandler.kill(player1, player1, loot);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(5);
        expect(player1.hand.length).toBe(2);
        expect(player1.isDead).toBe(true);
        expect(game.stack.isEmpty()).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.endTurn();
        game.gainCoins(player1, 7, "gift");
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, "top");
        expect(player1.coins).toBe(2);
        game.loot(player1, 15);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(10);
    });

    it("golden_trinket", async () => {
        let loot = game.obtainCard("r-golden_trinket") as LootCard;
        game.addCardToHand(player1, loot);
        game.gainTreasure(player1, 1);
        const treas = player1.inPlay[2]!;
        game.actions.playCard(player1, 0, []);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => { //monster 0
            if(Options.includes(treas))
                return {selected: [treas], remaining: []};
            return {selected: [Options[0]], remaining: []};
        }
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(treas.tags.goldCounters).toBe(1);
        expect((loot.tags.copiedCards as ItemCard[]).map((c) => c.slug).includes(treas.slug)).toBe(true);
        game.random = () => 0.01;
        const roll = game.rollDice(player1, true, loot);
        expect(game.actions.canActivate(loot, player1)).toBe(true);
        await game.activateItem(player1, loot, [loot.tags.copiedCards[0], roll]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(roll.value).toBe(2);
    });

    it("pills_2 3", async () => {
        let loot = game.obtainCard("r-pills_2") as LootCard;
        game.addCardToHand(player1, loot);
        let idx = 0;
        const tab = [0.01, 0.5, 0.9];
        game.random = () => tab[idx++%tab.length]!;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.entityHandler.getAttack(player1)).toBe(2);
        expect(player1.healthPoints).toBe(3);
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("pills_2 2", async () => {
        let loot = game.obtainCard("r-pills_2") as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.5;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(5);
    });

    it("pills_2 1", async () => {
        let loot = game.obtainCard("r-pills_2") as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.01;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.entityHandler.getAttack(player1)).toBe(4);
    });

    it("tick", async () => {
        let loot = game.obtainCard("r-tick") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        player1.receiveDamage(1);
        expect(player1.currentHealthPoints).toBe(1);
        await game.actions.resolveStack();
        game.entityHandler.kill(player1, game.monsters[0]!, loot);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(2);
        expect(player1.attackThisTurn).toBe(2);
    });

    it("sticky_nickel", async () => {
        let loot = game.obtainCard("r-sticky_nickel") as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.01;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.hand.cards.includes(loot)).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(game.decks.loot.discard.length).toBe(0);
        game.entityHandler.addLootPlay(player2, 1);
        game.random = () => 0.9;
        game.actions.playCard(player2, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(0);
        expect(player2.coins).toBe(5);
        expect(game.decks.loot.discard.length).toBe(1);
    });

    it("pills 2", async () => {
        let loot = game.obtainCard("r-pills") as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.5;
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(2);
    });


    it("pills", async () => {
        let loot = game.obtainCard("r-pills") as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.01;
        const topLoots = game.decks.loot.cards.slice(0, 3).map(c => c.slug);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(game.decks.loot.cards.slice(0, 3).map(c => c.slug)).toEqual(topLoots);
    });

    it("lucky_toe", async () => {
        let loot = game.obtainCard("r-lucky_toe") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.loot(player1, 1);
        expect(player1.hand.length).toBe(2);
        game.entityRewards(game.monsters[1]!);
        expect(player1.hand.length).toBe(4);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(5);
    });

    it("hagalaz", async () => {
        let loot = game.obtainCard("r-hagalaz") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, [game.decks.room]);
        const room = game.rooms?.activeRooms[0]!;
        const mob = game.monsters[0]!.card.slug;
        // game.select = async (player: Player, min: number, max: number, Options: any[]) => { //monster 0
        //     return {selected: Options.toReversed().slice(0, max), remaining: []};
        // }
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(mob).not.toBe(game.monsters[0]!.card.slug);
    });

    it("dads_note", async () => {
        game.encounters.discardTop(0);
        game.encounters.discardTop(0);
        game.encounters.discardTop(0);
        game.encounters.discardTop(0);
        let loot = game.obtainCard("r-dads_note") as LootCard;
        game.addCardToHand(player1, loot);
        const mob1 = game.encounters._deck.discard[0]!;
        game.actions.playCard(player1, 0, [mob1]);
        await game.actions.resolveStack();
        expect(game.encounters._deck.discard.length).toBe(3);
        expect(game.encounters._deck.discard.includes(mob1)).toBe(false);
        expect(game.monsters[0]?.card.slug).toBe(mob1.slug);
    });

    it("bag_lunch", async () => {
        let loot = game.obtainCard("r-bag_lunch") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.destroyCardsOrSouls([player1.inPlay[2]!]);
        expect(player1.inPlay.length).toBe(3);
        expect(player1.inPlay[2]!.slug).toBe(loot.slug);
        expect(loot.tags.counters).toBe(1);
        expect(player1.currentHealthPoints).toBe(3);
        expect(player1.healthPoints).toBe(3);
        game.addToCounter(player1, loot, "counters", -1);
        expect(player1.currentHealthPoints).toBe(2);
        expect(player1.healthPoints).toBe(2);
        game.addToCounter(player1, loot, "counters", 1);
        expect(player1.currentHealthPoints).toBe(3);
        expect(player1.healthPoints).toBe(3);
        game.destroyCardsOrSouls([player1.inPlay[2]!]);
        expect(player1.inPlay.length).toBe(2);
        expect(player1.currentHealthPoints).toBe(2);
        expect(player1.healthPoints).toBe(2);
    });

    it("emergency_contact", async () => {
        let loot = game.obtainCard("r-emergency_contact") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.declareAttack(player1);
        const monster = game.monsters[0]!;
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.playCard(player1, 0, [game.monsters[0]!]);
        await game.actions.resolveStack();
        expect(monster.isEngagedInCombat).toBe(false);
        expect(player1.isEngagedInCombat).toBe(false);
        expect(game.decks.monster.cards[game.decks.monster.cards.length - 1]!.slug).toBe(monster.card.slug);
        expect(game.monsters[0]!.card.slug).not.toBe(monster.card.slug);
    });

    it("broken_remote", async () => {
        let loot = game.obtainCard("r-broken_remote") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => { //monster 0
            await new Promise(resolve => setTimeout(resolve, 0));
            return {selected: [Options[0]], remaining: []};
        };
        await game.actions.resolveStack();
        const room = game.rooms?.activeRooms[0]!;

        game.recharge(player1.character);
        await game.activateItem(player1, player1.inPlay[0]! as ItemCard);
        let mob = game.monsters[0]!;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.card.slug).not.toBe(game.monsters[0]!.card.slug);
        expect(game.rooms?.activeRooms[0]!.slug).toBe(room.slug);


        game.select = async (player: Player, min: number, max: number, Options: any[]) => { //monster 0
            await new Promise(resolve => setTimeout(resolve, 0));
            return {selected: [Options[Options.length - 1]], remaining: []};
        };
        game.recharge(player1.character);
        await game.activateItem(player1, player1.inPlay[0]! as ItemCard);
        mob = game.monsters[0]!;
        await game.actions.resolveStack();
        expect(mob.card.slug).toBe(game.monsters[0]!.card.slug);
        expect(game.rooms?.activeRooms[0]!.slug).not.toBe(room.slug);
    });
    
    it("algiz", async () => {
        let loot = game.obtainCard("r-algiz") as LootCard;
        game.gainTreasure(player1, 5);
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, [player1]);
        await game.actions.resolveStack();
        for(const item of player1.inPlay)
            expect(item.eternal).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        for(let i = 2; i < player1.inPlay.length; i++)
            expect(player1.inPlay[i]!.eternal).toBe(false);
    });
    
    it("a_lucky_penny", async () => {
        let loot = game.obtainCard("r-a_lucky_penny") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
        game.entityHandler.kill(player1, game.monsters[0]!, loot);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(3);

        await game.endTurn();
        await game.actions.resolveStack();
        expect(player2.hand.length).toBe(1);
        game.entityHandler.kill(player1, game.monsters[1]!, loot);
        await game.actions.resolveStack();
        expect(player2.hand.length).toBe(2);
    });
    
    it("wishbone", async () => {
        let loot = game.obtainCard("r-wishbone") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.gainTreasure(player1, 1);
        game.destroyCardsOrSouls([player1.inPlay[3]!]);
        expect(player1.inPlay.length).toBe(3);
        game.destroyCardsOrSouls([player1.inPlay[2]!]);
        expect(player1.inPlay.length).toBe(3);
        expect(player1.inPlay[2]!.slug).not.toBe(loot.slug);
    });

    it("callus", async () => {
        let loot = game.obtainCard("r-callus") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player1, loot, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(2);

        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("ace_of_diamonds", async () => {
        let loot = game.obtainCard("r-ace_of_diamonds") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(2);

        game.entityHandler.addLootPlay(player1, 1);
        // loot = game.obtainCard("r-ace_of_diamonds") as LootCard;
        game.addCardToHand(player1, loot);
        game.loot(player1, 5);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(9);
    });

    it("two_of_spades", async () => {
        let loot = game.obtainCard("r-two_of_spades") as LootCard;
        game.addCardToHand(player1, loot);
        game.loot(player1, 2);
        game.loot(player2, 3);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(5);
    });
});



describe("Requiem Loots (3p games) ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;
    
    beforeEach(() => {
        const setup = setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith", "b2-isaac"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: [],
                        playerCount: 3,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
        game.resetStack();
        game.resetCallbacks();
    });
    it("black_heart", async () => {
        let loot = game.obtainCard("r-black_heart") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player2, loot, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        game.entityHandler.dealDamage(player1, player2, loot, 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(0);
        expect(player3.currentHealthPoints).toBe(0);
        expect(player1.currentHealthPoints).toBe(2);
    });

    it("black_heart 2", async () => {
        let loot = game.obtainCard("r-black_heart") as LootCard;
        game.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, [player1]);
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player1, loot, 3);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(0);
        expect(player2.currentHealthPoints).toBe(0);
        expect(player3.currentHealthPoints).toBe(0);
    });
});