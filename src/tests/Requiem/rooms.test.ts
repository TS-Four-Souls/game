import type { ItemCard, LootCard, RoomCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DamageOnStack } from "../../models/stackElement";
import { setupTestGame } from "../testHelpers";


describe("Requiem Rooms", () => {
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

    it("tax_for_the_mighty - blocks attack if you cannot pay each other player", async () => {
        const room = game.obtainCard("r-tax_for_the_mighty") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);

        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 2;
        game.cardHandler.addSoul(player1, soul);

        game.loseCoins(player1, player1.coins, true);
        game.gainCoins(player1, 1, ("debug"));

        expect(game.actions.canDeclareAttack(player1)).not.toBe(true);
        expect(() => game.actions.declareAttack(player1)).toThrow();
    });

    it("tax_for_the_mighty - charges coins on attack declaration when affordable", async () => {
        const room = game.obtainCard("r-tax_for_the_mighty") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);

        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 1;
        soul.soul = 1;
        game.cardHandler.addSoul(player1, soul);

        game.loseCoins(player1, player1.coins, true);
        game.loseCoins(player2, player2.coins, true);
        game.gainCoins(player1, 2, ("debug"));

        expect(game.actions.canDeclareAttack(player1)).toBe(true);
        game.actions.declareAttack(player1);
        await game.actions.resolveStack();

        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(2);
    });

    it("red_champions", async () => {
        const room = game.obtainCard("r-red_champions") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.monsters.map(m => m.healthPoints)).toEqual([2,5]);
        game.entityHandler.kill(player1, game.monsters[1]!, room);
        await game.actions.resolveStack();
        expect(game.monsters.map(m => m.healthPoints)).toEqual([2,6]);
        game.cardHandler.discard(room);
        expect(game.monsters.map(m => m.healthPoints)).toEqual([1,5]);
    });

    it("shadow_of_famine", async () => {
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        const room = game.obtainCard("r-shadow_of_famine") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.cardHandler.addCardToHand(player1, loot);
        game.cardHandler.addCardToHand(player1, game.cardHandler.copyCard(loot) as LootCard);
        game.entityHandler.addLootPlay(player1, 10);
        game.cardHandler.recharge(player1.character);
        await game.activateItem(player1, player1.inPlay[0]!, [], "tap");
        await game.actions.resolveStack();
        expect(game.actions.canActivate(player1.character, player1)).not.toBe(true);
        expect(game.actions.canPlayCard(player1)).toBe(true);
        game.cardHandler.recharge(player1.character);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        expect(game.actions.canPlayCard(player1)).not.toBe(true);
    });

    it("social_goals discard", async () => {
        const room = game.obtainCard("r-social_goals") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.rooms?.activeRooms[0]).toBe(room);
    });

    it("social_goals - loot play", async () => {
        const room = game.obtainCard("r-social_goals") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(room.counters.value("normal")).toBe(0);
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        for(let i = 0; i < 4; i++) {
            const copy = game.cardHandler.copyCard(loot) as LootCard;
            game.cardHandler.addCardToHand(player1, copy);
            game.actions.playCard(player1, player1.hand.length-1, []);
            expect(room.counters.value("normal")).toBe(0);
        }
        const copy = game.cardHandler.copyCard(loot) as LootCard;
        game.cardHandler.addCardToHand(player1, copy);
        game.actions.playCard(player1, player1.hand.length-1, []);
        expect(room.counters.value("normal")).toBe(1);
    });

    it("social_goals can not be discarded", async () => {
        const room = game.obtainCard("r-social_goals") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(room.counters.value("normal")).toBe(0);
        // Test purchase goal
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.rooms?.activeRooms[0]!.slug).toBe(room.slug);
    });

    it("social_goals", async () => {
        const room = game.obtainCard("r-social_goals") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(room.counters.value("normal")).toBe(0);
        // Test purchase goal
        game.gainCoins(player1, 60, ("debug"));
        game.entityHandler.addPurchaseThisTurn(player1, 3);
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, "top");
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, "top");
        expect(room.counters.value("normal")).toBe(0);
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, "top");
        expect(room.counters.value("normal")).toBe(1);

        // test murder goal
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        expect(room.counters.value("normal")).toBe(1);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        expect(room.counters.value("normal")).toBe(2);

        // test coin given goal
        game.gainCoins(player1, 10, ("debug"));
        game.giveCoins(player1, player2, 6);
        await Promise.resolve();
        expect(room.counters.value("normal")).toBe(3);

        game.random = () => 0.99
        game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        expect(room.counters.value("normal")).toBe(3);
        game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        expect(room.counters.value("normal")).toBe(4);

        expect(player1.inPlay.length).toBe(7);
        expect(player2.inPlay.length).toBe(4);
    });

    it("restock_machine flush monster", async () => {
        const room = game.obtainCard("r-restock_machine") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: ["monster"], remaining: Options } as any;
        };
        game.gainCoins(player1, 3, ("debug"));
        const slugs = game.monsters.map(i => i!.card.slug);
        await game.actions.activateRoom(player1, room, ["treasure"], 0);
        await game.actions.resolveStack();
        expect(game.monsters.every(i => i === null || !slugs.includes(i!.card.slug))).toBe(true);
        expect(slugs.every(s => game.decks.monster.discard.map(c => c.slug).includes(s!))).toBe(true);
    });

    it("restock_machine flush shop", async () => {
        const room = game.obtainCard("r-restock_machine") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, ("debug"));
        const slugs = game.shop.itemsInShop.map(i => i!.slug);
        await game.actions.activateRoom(player1, room, ["treasure"], 0);
        await game.actions.resolveStack();
        expect(game.shop.itemsInShop.every(i => i === null || !slugs.includes(i!.slug))).toBe(true);
        expect(slugs.every(s => game.decks.treasure.discard.map(c => c.slug).includes(s!))).toBe(true);
    });

    it("pity_for_the_poor become weak was strong become weak", async () => {
        const room = game.obtainCard("r-pity_for_the_poor") as RoomCard;
        for(let i = 0; i < 10; i++) 
            game.cardHandler.addTopPosition("treasure", game.cardHandler.copyCard(game.decks.treasure.cards[0]!)!);
        game.shop.removeTop(0);
        game.rooms?.forceRoomAtSlot(0, room);
        const soul = game.obtainCard("b2-lost_soul")!;
        const soul2 = game.cardHandler.copyCard(soul);
        soul2.soul = 1;
        soul.soul = 2;
        game.cardHandler.addSoul(player1, soul2);
        game.gainCoins(player1, 10, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.inPlay.length).toBe(3);
        game.cardHandler.removeInPlay(player1, player1.inPlay[2]!);
        game.resetStack();
        expect(player1.coins).toBe(0);
        game.cardHandler.addSoul(player2, soul);
        game.entityHandler.addPurchaseThisTurn(player1, 1);
        game.gainCoins(player1, 10, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.inPlay.length).toBe(3);
        expect(player1.coins).toBe(10);

    });

    it("pity_for_the_poor become weak", async () => {
        const room = game.obtainCard("r-pity_for_the_poor") as RoomCard;
        for(let i = 0; i < 10; i++) 
            game.cardHandler.addTopPosition("treasure", game.cardHandler.copyCard(game.decks.treasure.cards[0]!)!);
        game.shop.removeTop(0);
        game.rooms?.forceRoomAtSlot(0, room);
        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 2;
        game.cardHandler.addSoul(player2, soul);
        game.gainCoins(player1, 10, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.coins).toBe(10);
        expect(player1.inPlay.length).toBe(3);
    });

    it("pity_for_the_poor become powerful", async () => {
        const room = game.obtainCard("r-pity_for_the_poor") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        for(let i = 0; i < 10; i++) 
            game.cardHandler.addTopPosition("treasure", game.cardHandler.copyCard(game.decks.treasure.cards[0]!)!);
        game.shop.removeTop(0);
        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 2;
        game.cardHandler.addSoul(player1, soul);
        game.gainCoins(player1, 10, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.coins).toBe(0);
        expect(player1.inPlay.length).toBe(3);
    });

    it("pity_for_the_poor ", async () => {
        const room = game.obtainCard("r-pity_for_the_poor") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        for(let i = 0; i < 10; i++) 
            game.cardHandler.addTopPosition("treasure", game.cardHandler.copyCard(game.decks.treasure.cards[0]!)!);
        game.shop.removeTop(0);
        game.gainCoins(player1, 3, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.coins).toBe(3);
        expect(player1.inPlay.length).toBe(3);

        game.entityHandler.addPurchaseThisTurn(player1, 1);
        game.gainCoins(player1, 7, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        expect(player1.coins).toBe(0);
        expect(player1.inPlay.length).toBe(4);

    });

     it("might_for_the_meek gain soul but still have less let you keep the free attack.", async () => {
        const room = game.obtainCard("r-might_for_the_meek") as RoomCard;
        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 2;
        game.cardHandler.addSoul(player2, soul);
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.players.map(p => game.entityHandler.getAttack(p))).toEqual([2,1]);
       
         expect(player1.attackThisTurn).toBe(2);
        expect(player2.attackThisTurn).toBe(0);
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        expect(player1.attackThisTurn).toBe(1);
        expect(game.players.map(p => game.entityHandler.getAttack(p))).toEqual([2,1]);
    });
    it("might_for_the_meek become powerful second attack does not give it back.", async () => {
        const room = game.obtainCard("r-might_for_the_meek") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.players.map(p => game.entityHandler.getAttack(p))).toEqual([2,2]);
        expect(player1.attackThisTurn).toBe(2);
        expect(player2.attackThisTurn).toBe(0);
         game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        expect(player1.attackThisTurn).toBe(1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        expect(game.players.map(p => game.entityHandler.getAttack(p))).toEqual([1,2]);
        expect(player1.attackThisTurn).toBe(0);
    });
    it("might_for_the_meek become powerful => lose free attack", async () => {
        const room = game.obtainCard("r-might_for_the_meek") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.players.map(p => game.entityHandler.getAttack(p))).toEqual([2,2]);
        expect(player1.attackThisTurn).toBe(2);
        expect(player2.attackThisTurn).toBe(0);
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        expect(player1.attackThisTurn).toBe(0);
    });
    it("splash_damage 2", async () => {
        const room = game.obtainCard("r-splash_damage") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.entityHandler.dealDamage(player2, game.monsters[0]!, room, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        expect(player1.currentHealthPoints).toBe(1);
    });
    it("splash_damage 1", async () => {
        const room = game.obtainCard("r-splash_damage") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.entityHandler.dealDamage(player2, game.monsters[0]!, room, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        expect(player1.currentHealthPoints).toBe(1);
    });
    it("the_mirror 2", async () => {
        const room = game.obtainCard("r-the_mirror") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [], remaining: Options } as any;
        };
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        game.entityHandler.kill(player2, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.inPlay.length).toBe(2);
    });
    it("the_mirror", async () => {
        const room = game.obtainCard("r-the_mirror") as RoomCard;
        expect(room).toBeDefined();
        game.rooms?.forceRoomAtSlot(0, room);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);
        game.entityHandler.kill(player2, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.inPlay.length).toBe(3);
    });
    it("spider_webs", async () => {
        const room = game.obtainCard("r-spider_webs") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.cardHandler.recharge(player1.character);
        expect(player1.character.charged).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.character.charged).toBe(false);
    });
    it("shadow_of_war", async () => {
        const room = game.obtainCard("r-shadow_of_war") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainTreasure(player1, 3);
        game.entityHandler.kill(player1, player1, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(3);
    });
    it("red_vise", async () => {
        const room = game.obtainCard("r-red_vise") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        expect(player1.hand.length).toBe(0);
        await game.endTurn();
        await game.actions.resolveStack();
        const request = game.stack.peek()!;
        expect(request.json.type).toBe("damage");
        expect((request as DamageOnStack).receiver).toBe(player1);
    });
    it("planetarium", async () => {
        const room = game.obtainCard("r-planetarium") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer.inPlay.length).toEqual(3);
    });
    it("samsons_blessing", async () => {
        const room = game.obtainCard("r-samsons_blessing") as RoomCard;
        const health = game.players.map(p => p.attackPoints);
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.players.map(p => p.attackPoints - 1)).toEqual(health);
    });
    it("maggys_blessing", async () => {
        const room = game.obtainCard("r-maggys_blessing") as RoomCard;
        const health = game.players.map(p => p.healthPoints);
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.players.map(p => p.healthPoints - 1)).toEqual(health);
    });
    it("i_am_error 4", async () => {
        const room = game.obtainCard("r-i_am_error") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player2, 1);
        const item = game.obtainCard("b2-blank_card")! as ItemCard;
        game.cardHandler.addInPlay(player2, item);
        const monst1 = game.monsters[0]!.card.slug;
        const monst2 = game.monsters[1]!.card.slug;
        const card = player2.hand.cards[0]!;
        game.random = () => 6/6-0.001;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        expect(player2.hand.length).toBe(4);
        expect(player2.hand.cards.some(c => c.slug === card.slug)).toBe(false);
        expect(player2.inPlay[2]!.slug).not.toBe(item.slug);
        expect(game.monsters[0]!.card.slug).not.toBe(monst1);
        expect(game.monsters[1]!.card.slug).toBe(monst2);
    });
    
    it("i_am_error 3", async () => {
        const room = game.obtainCard("r-i_am_error") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player2, 1);
        const card = player2.hand.cards[0]!;
        game.random = () => 5/6-0.001;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        expect(game.stack.isEmpty()).toBe(true);
        expect(player2.hand.length).toBe(4);
        if(player2.hand.cards.some(c => c.slug === card.slug))
            console.log(player2.hand.cards.map(c => c.slug), card.slug);
        expect(player2.hand.cards.some(c => c.slug === card.slug)).toBe(false);
    });
    
    it("i_am_error 2", async () => {
        const room = game.obtainCard("r-i_am_error") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.5;
        const card = game.obtainCard("b2-blank_card")! as ItemCard;
        const monst = game.monsters[0]!.card.slug;
        game.cardHandler.addInPlay(player2, card);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.inPlay[2]!.slug).not.toBe(card.slug);
    });
    
    it("i_am_error 1", async () => {
        const room = game.obtainCard("r-i_am_error") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.01;
        const monst1 = game.monsters[0]!.card.slug;
        const monst2 = game.monsters[1]!.card.slug;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.card.slug).not.toBe(monst1);
        expect(game.monsters[1]!.card.slug).toBe(monst2);
    });
    
    it("heavy_is_the_head", async () => {
        game.resetStack();
        const room = game.obtainCard("r-heavy_is_the_head") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);

        for(const slug of ["b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush"])
        {
            const card = game.obtainCard(slug)! as ItemCard;
            game.cardHandler.addInPlay(player1, card);
        }
        game.cardHandler.rechargeMultiple(player1);
        for(const card of player1.inPlay) 
            card.deactivate();
        expect(player1.inPlay.every(c => c.charged)).toBe(false);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player1.inPlay.every(c => c.charged)).toBe(false);
        await game.actions.resolveStack(); // resolve effect
        await game.actions.resolveStack();
        expect(player1.inPlay[0]!.charged).toBe(true);
        for(let i = 1; i < player1.inPlay.length; i++) 
            expect(player1.inPlay[i]!.charged).toBe(false);
    });

    it("laser_eye", async () => {
        game.resetStack();
        const room = game.obtainCard("r-laser_eye") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("isaacs_blessing", async () => {
        game.resetStack();
        const room = game.obtainCard("r-isaacs_blessing") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.99;
        const dice = game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(2);
        dice._TEST_setRandom( () => 0.1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(2);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [], remaining: Options } as any;
        };
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
    });

    it("gus", async () => {
        game.resetStack();
        const room = game.obtainCard("r-gus") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.99;
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.animatedList.all[0]!);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        expect(game.stack.size).toBe(2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.animatedList.all[0]?.currentHealthPoints).toBe(7);
        game.entityHandler.kill(player1, game.animatedList.all[0]!, room);
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(3);
        expect(player2.inPlay.length).toBe(3);
    });


    it("haunted", async () => {
        game.resetStack();
        const room = game.obtainCard("r-haunted") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 1;
        game.cardHandler.addSoul(player1, soul);
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        expect(game.currentPlayer.id).toBe(player2.id);
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        expect(game.currentPlayer.id).toBe(player2.id);
    });

    it("greed_looms", async () => {
        game.resetStack();
        const old = game.rooms?.activeRooms[0];
        const room = game.obtainCard("r-greed_looms") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 2);
        game.loot(player2, 2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        game.gainCoins(player2, 10, ("debug"));
        await game.actions.resolveStack();
        game.actions.declarePurchase(player2);
        game.actions.purchase(player2, 0);
        game.cardHandler.removeInPlay(player2, player2.inPlay[2]!);
        game.resetStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.hand.length).toBe(3);
        game.gainCoins(player1, 10, ("debug"));
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, "top");
        game.cardHandler.removeInPlay(player1, player1.inPlay[2]!);
        game.resetStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
    });

    it("fortune_teller 4 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, ("debug"));
        game.random = () => 0.99;
        await game.actions.activateRoom(player1, room, [], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(6);
        expect(game.decks.room.discard.includes(room)).toBe(true);
    });
    it("fortune_teller 3 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, ("debug"));
        game.random = () => 0.8;
        await game.actions.activateRoom(player1, room, [], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(3);
    });
    it("fortune_teller 2 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, ("debug"));
        game.random = () => 0.55;
        await game.actions.activateRoom(player1, room, [], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(2);
    });

    it("fortune_teller 1 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, ("debug"));
        game.random = () => 0.45;
        await game.actions.activateRoom(player1, room, [], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(1);
    });

    it("floor_spikes", async () => {
        game.resetStack();
        const room = game.obtainCard("r-floor_spikes") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.01;
        game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);

        game.rollDice(player2, false, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);

        game.random = () => 0.4;
        game.rollDice(player1, false, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);

        game.rollDice(player2, false, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);

    });
    it("eternal_chest 3", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.actions.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player1.inPlay.length).toBe(3);

    });

    it("eternal_chest 2", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.actions.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.8;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(7);
    });

    it("eternal_chest 1", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.actions.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.4999;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(4);
    });

    it("equality", async () => {
        game.resetStack();
        const room = game.obtainCard("r-equality") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 10, ("debug"));
        expect(player1.coins).toBe(10);
        expect(player2.coins).toBe(10);
        game.gainCoins(player2, 10, ("debug"));
        expect(player1.coins).toBe(20);
        expect(player2.coins).toBe(20);
        game.gainCoins(player1, 10, room);
        expect(player1.coins).toBe(30);
        expect(player2.coins).toBe(20);
    });

    it("Dice Room 6", async () => {
        game.resetStack();
        game.gainTreasure(player1, 2);
        const shopslugs = game.shop.itemsInShop.map(c => c!.slug);
        const slugs =game.monsters.map(c => c.card.slug);
        game.gainTreasure(player2, 2);
        game.loot(player1, 1);
        const slug = player1.hand.cards[0]!.slug;
        game.loot(player2, 1);
        const slug2 = player2.hand.cards[0]!.slug;
        const room = game.obtainCard("r-dice_room_6") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        expect(slugs.every(s => game.monsters.some(c => c.card.slug === s))).toBe(false);
        expect(player1.hand.cards.some(c => c.slug === slug)).toBe(false);
        expect(player2.hand.cards.some(c => c.slug === slug2)).toBe(false);
        expect(player1.hand.length).toBe(3);
        expect(player2.hand.length).toBe(3);
        for(const s of shopslugs) {
            expect(game.shop.itemsInShop.map(c => c!.slug)).not.toContain(s);
        }
    });

    it("Dice Room 5", async () => {
        game.resetStack();
        game.gainTreasure(player1, 2);
        const slugs =game.monsters.map(c => c.card.slug);
        game.gainTreasure(player2, 2);
        const room = game.obtainCard("r-dice_room_5") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        expect(slugs.every(s => game.monsters.some(c => c.card.slug === s))).toBe(false);
    });

    it("Dice Room 4", async () => {
        game.resetStack();
        game.gainTreasure(player1, 2);
        const slugsp1 = player1.inPlay.slice(2, 4).map(c => c.slug);
        game.gainTreasure(player2, 2);
        const slugsp2 = player2 .inPlay.slice(2, 4).map(c => c.slug);
        const room = game.obtainCard("r-dice_room_4") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        expect(slugsp1.every(s => player1.inPlay.some(c => c.slug === s))).toBe(false);
        expect(slugsp2.every(s => player2.inPlay.some(c => c.slug === s))).toBe(false);
    });

    it("Dice Room 3", async () => {
        game.resetStack();
        const slugs = game.shop.itemsInShop.map(c => c!.slug);
        const room = game.obtainCard("r-dice_room_3") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        for(const slug of slugs) {
            expect(game.shop.itemsInShop.map(c => c!.slug)).not.toContain(slug);
        }
    });

    it("Dice Room 2", async () => {
        game.resetStack();
        game.loot(player1, 1);
        const slug = player1.hand.cards[0]!.slug;
        game.loot(player2, 1);
        const slug2 = player2.hand.cards[0]!.slug;
        const room = game.obtainCard("r-dice_room_2") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        expect(player1.hand.cards.some(c => c.slug === slug)).toBe(false);
        expect(player2.hand.cards.some(c => c.slug === slug2)).toBe(false);
        expect(player1.hand.length).toBe(3);
        expect(player2.hand.length).toBe(3);
    });

    it("Dice Room 1", async () => {
        game.resetStack();
        game.gainTreasure(player1, 2);
        const slugsp1 = player1.inPlay.slice(2, 4).map(c => c.slug);
        game.gainTreasure(player2, 2);
        const slugsp2 = player2 .inPlay.slice(2, 4).map(c => c.slug);
        const room = game.obtainCard("r-dice_room_1") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        await game.actions.resolveStack(); // resolve the event addition
        expect(slugsp1.every(s => player1.inPlay.some(c => c.slug === s))).toBe(false);
        expect(slugsp2.every(s => player2.inPlay.some(c => c.slug === s))).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.rooms?._slots[0]![0]?.slug).not.toBe("r-dice_room_1");
        expect(slugsp1.every(s => player1.inPlay.some(c => c.slug === s))).toBe(false);
        expect(slugsp2.every(s => player2.inPlay.some(c => c.slug === s))).toBe(true);
    });

    it("Eden Blessing", async () => {
        game.resetStack();
        const room = game.obtainCard("r-edens_blessing") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainTreasure(player2);
        const card = player2.inPlay[2]!;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.inPlay[2]!.slug).not.toBe(card.slug);
    });

    it("Conjoined Twin", async () => {
        const room = game.obtainCard("r-conjoined_twin") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [player2], remaining: Options } as any;
        };
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player2.currentHealthPoints).toBe(0);
    });
    it("Devil Beggar 3", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.9;
        game.entityHandler.addHealth(player1, 1); // to be able to survive the room effect.
        await game.actions.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(2);
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // effect
        expect(player1.currentHealthPoints).toBe(1);

    });
    it("Devil Beggar 2", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.4;
        await game.actions.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // effect
        expect(player1.hand.length).toBe(1);
    });
    it("Devil Beggar 1", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.1;
        await game.actions.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        await game.actions.resolveStack(); // effect
        await game.actions.resolveStack(); // roll
        await game.actions.resolveStack(); // effect
        expect(player1.hand.length).toBe(2);
    });

    it("Key Master gain 3 treasures", async () => {
        const room = game.obtainCard("r-key_master") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("fsp2-gold_key")! as LootCard;
        const monster = game.monsters[0]!;
        game.cardHandler.addCardToHand(player1, loot);
        game.random = () => 0.99;
        await game.actions.activateRoom(player1, room, [loot], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(5);
    });

    it("Challenge Room", async () => {
        const room = game.obtainCard("r-challenge_room") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        expect(player1.hasAttackRequirement).toBe(false);
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        game.random = () => 0.9;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hasAttackRequirement).toBe(true);
    });
    it("Bomb bum deal 3 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-bomb")! as LootCard;
        const monster = game.monsters[0]!;
        game.cardHandler.addCardToHand(player1, loot);
        game.random = () => 0.5;
        await game.actions.activateRoom(player1, room, [loot], 0);
        await game.actions.resolveStack();
        let count = 0;
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(count ++ === 1)
                return { selected: [monster], remaining: [] } as any;
            return { selected: [player2], remaining: Options } as any;
        };
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.isDead).toBe(true);
        expect(player2.isDead).toBe(true);
    });

    it("Bomb bum take 3 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-bomb")! as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.entityHandler.addHealth(player1, 2); // to be able to survive the bomb damage and verify the 3 damage are correctly applied
        game.random = () => 0.9;
        await game.actions.activateRoom(player1, room, [loot], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer.currentHealthPoints).toBe(1);
    });

    it("Bomb bum deal 1 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        const monster = game.monsters[0]!;
        game.cardHandler.addCardToHand(player1, loot);
        game.random = () => 0.5;
        await game.actions.activateRoom(player1, room, [loot], 0);
        await game.actions.resolveStack();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [monster], remaining: [] } as any;
        };
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.isDead).toBe(true);
    });

    it("Bomb bum take 1 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.random = () => 0.9;
        await game.actions.activateRoom(player1, room, [loot], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer.currentHealthPoints).toBe(1);
    });
    
    it("Butter Fingers", async () => {
        const room = game.obtainCard("r-butter_fingers") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.loot(player1, 10);
        expect(player1.hand.cards.length).toBe(10); // draw 1 at the begining.
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(9);
        
    });
    it("Bumbo is loose", async () => {
        const room = game.obtainCard("r-bum_bo_is_loose") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.gainCoins(player1, 10, ("debug"));
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(8);
        
    });
    it("Blood Money", async () => {
        const room = game.obtainCard("r-blood_money") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.entityHandler.kill(player1, player1, room);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(4);
        game.entityHandler.kill(player2, player2, room);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(4);
        expect(player2.coins).toBe(3);
        
    });

    it("Spoils Of War", async () => {
        const room = game.obtainCard("r-spoils_of_war") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.entityHandler.kill(player1, player1, room);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(1);
        game.entityHandler.kill(player2, player2, room);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player2.hand.length).toBe(0);
        
    });

    it("Blood Lust", async () => {
        const room = game.obtainCard("r-blood_lust") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        expect(player1.mustAttackEntity.map((m) => m.target)).toEqual(["any", "any"]);
    });

    it("Blood Lust cleanup on room replace", async () => {
        const bloodLust = game.obtainCard("r-blood_lust") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, bloodLust);
        game.resetStack();
        expect(player1.mustAttackEntity.map((m) => m.target)).toEqual(["any", "any"]);

        const replacement = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, replacement);

        expect(player1.mustAttackEntity.map((m) => m.target)).toEqual([]);
    });

    it("Blood Donation", async () => {
        const room = game.obtainCard("r-blood_donation") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        expect(player1.coins).toBe(0);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(3);
    });

    it("Blind Rage", async () => {
        const room = game.obtainCard("r-blind_rage") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        expect(player1.mustAttackTopDeck()).toBe(true);
    });

    it("Blind Rage cleanup on room replace", async () => {
        const blindRage = game.obtainCard("r-blind_rage") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, blindRage);
        game.resetStack();
        expect(player1.mustAttackTopDeck()).toBe(true);

        const replacement = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, replacement);

        expect(player1.mustAttackEntity.some((m) => m.target === "topDeck")).toBe(false);
    });

    it("Blessing Of The Sack", async () => {
        const room = game.obtainCard("r-blessing_of_the_sack") as RoomCard;
        const old = game.rooms?._slots[0]![0];
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.entityHandler.kill(player1, game.monsters[0]!, room);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        if(player1.coins !== 2)
            console.log(old?.slug);
        expect(player1.coins).toBe(2);
    });

    it("Blessing Of The Inner Eye", async () => {
        const room = game.obtainCard("r-blessing_of_the_inner_eye") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const slugs = game.decks.monster.cards.slice(0, 3).toReversed().map(c => c.slug);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: Options.toReversed(), remaining: [] } as any;
        };
        game.actions.declareAttack(player1);
        await game.actions.resolveStack();
        const after = game.decks.monster.cards.slice(0, 3).map(c => c.slug);
        expect(after).toEqual(slugs);
    });

    it("black_champions - Monsters have +1 [ATK] .", async () => {
        const atk = game.monsters.map(m => game.entityHandler.getAttack(m) + 1);
        const room = game.obtainCard("r-black_champions") as RoomCard;
        game.resetStack();
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.monsters.map(m => game.entityHandler.getAttack(m))).toEqual(atk);
    });

    it("Beggar 2", async () => {
        
        const room = game.obtainCard("r-beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.gainCoins(player1, 30, ("debug"));
        for(const card of [... player1.hand.cards]) {
            game.cardHandler.removeCardFromHand(player1, card);
        }
        
        game.random = () => 6/6 - 0.01;
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(3);
        expect(player1.hand.length).toBe(0);
        expect(player1.coins).toBe(27);
        expect(player1.hand.length).toBe(0);
        expect(game.decks.room.discard.includes(room)).toBe(true);
        expect(game.rooms?._slots[0]![0]?.slug).not.toBe("r-beggar");
    });

    it("Beggar", async () => {
        
        const room = game.obtainCard("r-beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.gainCoins(player1, 30, ("debug"));
        for(const card of [... player1.hand.cards]) {
            game.cardHandler.removeCardFromHand(player1, card);
        }
        
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 1/6 - 0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        let init = player1.coins;
        expect(player1.coins).toBe(27);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 2/6 - 0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(24);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);

        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 3/6 - 0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(23);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 4/6 - 0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(22);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 5/6 - 0.0001;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(19);
        expect(player1.hand.length).toBe(2);
        expect(player1.inPlay.length).toBe(2);
        
        await game.actions.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 6/6 - 0.01;
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(3);
        if(player1.hand.length !== 2 ){
            console.log(game.monsters.map(m => m.card.slug));
            console.log(game.shop.itemsInShop.map(c => c?.slug));
            console.log(player1.inPlay.map(c => c.slug));
            console.log("Player 1 hand:", player1.hand.cards.map(c => c.id));
        }
        expect(player1.hand.length).toBe(2);
        init = player1.coins;
        expect(player1.coins).toBe(16);
        expect(player1.hand.length).toBe(2);
        expect(game.decks.room.discard.includes(room)).toBe(true);
        expect(game.rooms?._slots[0]![0]?.slug).not.toBe("r-beggar");
    });

    it("Blessing of Gluttony - The active player loots +1 during their loot step.", async () => {
        const room = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const initCards = player2.hand.length;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        if(player2.hand.length !== initCards + 2) {
            console.log("Player 2 hand:", player2.hand.cards.map(c => c.id));
        }
        expect(player2.hand.length).toBe(initCards + 2);
    });

    it("Blessing of Greed - At the start of each turn, the active player gains 3¢.", async () => {
        const room = game.obtainCard("r-blessing_of_greed") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const init = player2.coins;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        expect(player2.coins).toBe(init + 3);
        
        const room2 = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room2);
        const verif = player1.coins;
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(verif);
    });

    it("Blessing of Steam - Shop items the active player purchases cost 5¢ less.", async () => {
        const room = game.obtainCard("r-blessing_of_steam") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        game.gainCoins(player2, 10, ("debug"));
        const init = player2.coins;
        game.actions.declarePurchase(player2);
        game.actions.purchase(player2, 0);
        expect(player2.coins).toBe(init - 5);
    });

    it("Angelic Intervention - Each time the active player attacks the top of the monster deck, after putting it in a monster slot, they may cancel their attack.", async () => {
        const room = game.obtainCard("r-angelic_intervention") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve effect
        game.actions.declareAttack(player2);
        await game.actions.declareAttackOnEntity(player2, "topDeck", 0);
        await game.actions.resolveStack();
        expect(player2.isEngagedInCombat).toBe(false);
    });

    it("All Hallows’ Eve - Players can't gain souls.", async () => {
        const room = game.obtainCard("r-all_hallows_eve") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-lost_soul")! as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.actions.playCard(player1, player1.hand.cards.findIndex(c => c === loot));
        await game.actions.resolveStack();
        game.gainCoins(player1, 100, ("debug"));
        expect(player1.totalSouls).toBe(0);
        const room2 = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room2);
        game.loot(player1, 10);
        expect(player1.totalSouls).toBe(1);
    });
    
    it("Battle Royale 1", async () => {
        const room = game.obtainCard("r-battle_royale") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(3);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.actions.declareAttackOnEntity(player1, player2);
        game.entityHandler.kill(player1, player2, room);
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });

    it("Battle Royale 2", async () => {
        const room = game.obtainCard("r-battle_royale_2") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(4);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.actions.declareAttackOnEntity(player1, player2);
        game.entityHandler.kill(player1, player2, room);
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });

    it("Battle Royale 3", async () => {
        const room = game.obtainCard("r-battle_royale_3") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.actions.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(5);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.actions.declareAttackOnEntity(player1, player2);
        game.entityHandler.kill(player1, player2, room);
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });
});

