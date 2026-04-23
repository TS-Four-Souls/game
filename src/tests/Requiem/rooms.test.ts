
import type { LootCard, RoomCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/player";
import { setupTestGame } from "../testHelpers";
import { executeActivateRequest } from "@/utils/gameRequestHelpers";


describe("Requiem Rooms", () => {
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
    
    it("laser_eye", async () => {
        game.resetStack();
        const room = game.obtainCard("r-laser_eye") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        game.addCardToHand(player1, loot);
        game.playCard(player1, 0, []);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("isaacs_blessing", async () => {
        game.resetStack();
        const room = game.obtainCard("r-isaacs_blessing") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.99;
        const dice = game.rollDice(player1, false, room);
        await game.resolveStack();
        expect(game.stack.size).toBe(2);
        dice._TEST_setRandom( () => 0.1);
        await game.resolveStack();
        await game.resolveStack();
        expect(game.stack.size).toBe(2);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [], remaining: Options } as any;
        };
        await game.resolveStack();
        expect(game.stack.size).toBe(0);
    });

    it("gus", async () => {
        game.resetStack();
        const room = game.obtainCard("r-gus") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.99;
        game.declareAttack(player1);
        game.declareAttackOnEntity(player1, game.animatedList.all[0]!);
        await game.resolveStack();
        await game.resolveStack();
        game.attackRoll(player1);
        expect(game.stack.size).toBe(2);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(game.animatedList.all[0]?.currentHealthPoints).toBe(7);
        game.kill(player1, game.animatedList.all[0]!, room);
        await game.resolveStack();
        expect(player1.inPlay.length).toBe(3);
        expect(player2.inPlay.length).toBe(3);
    });


    it("haunted", async () => {
        game.resetStack();
        const room = game.obtainCard("r-haunted") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        const soul = game.obtainCard("b2-lost_soul")!;
        soul.soul = 1;
        game.addSoul(player1, soul);
        await game.endTurn();
        expect(game.currentPlayer.id).toBe(player2.id);
        await game.endTurn();
        expect(game.currentPlayer.id).toBe(player2.id);
    });

    it("greed_looms", async () => {
        game.resetStack();
        const room = game.obtainCard("r-greed_looms") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 2);
        game.loot(player2, 2);
        await game.endTurn();
        await game.resolveStack();
        expect(player1.hand.length).toBe(0);
        game.gainCoins(player2, 10, "gift");
        await game.resolveStack();
        game.declarePurchase(player2);
        game.purchase(player2, 0);
        await game.endTurn();
        await game.resolveStack();
        expect(player2.hand.length).toBe(3);
        game.gainCoins(player1, 10, "gift");
        game.declarePurchase(player1);
        game.purchase(player1, "top");
        await game.endTurn();
        await game.resolveStack();
        expect(player1.hand.length).toBe(0);
    });

    it("fortune_teller 4 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, "gift");
        game.random = () => 0.99;
        await game.activateRoom(player1, room, [], 0);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(6);
        expect(game.decks.room.discard.includes(room)).toBe(true);
    });
    it("fortune_teller 3 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, "gift");
        game.random = () => 0.8;
        await game.activateRoom(player1, room, [], 0);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(3);
    });
    it("fortune_teller 2 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, "gift");
        game.random = () => 0.55;
        await game.activateRoom(player1, room, [], 0);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(2);
    });

    it("fortune_teller 1 ", async () => {
        game.resetStack();
        const room = game.obtainCard("r-fortune_teller") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 3, "gift");
        game.random = () => 0.45;
        await game.activateRoom(player1, room, [], 0);
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player1.hand.length).toBe(1);
    });

    it("floor_spikes", async () => {
        game.resetStack();
        const room = game.obtainCard("r-floor_spikes") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.random = () => 0.01;
        game.rollDice(player1, false, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);

        game.rollDice(player2, false, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);

        game.random = () => 0.4;
        game.rollDice(player1, false, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);

        game.rollDice(player2, false, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);

    });
    it("eternal_chest 3", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.99;
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player1.inPlay.length).toBe(3);

    });

    it("eternal_chest 2", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.8;
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(7);
    });

    it("eternal_chest 1", async () => {
        game.resetStack();
        const room = game.obtainCard("r-eternal_chest") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.loot(player1, 1);
        await game.activateRoom(player1, room, [player1.hand.cards[0]!], 0);
        game.random = () => 0.4999;
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.coins).toBe(4);
    });

    it("equality", async () => {
        game.resetStack();
        const room = game.obtainCard("r-equality") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.gainCoins(player1, 10, "gift");
        expect(player1.coins).toBe(10);
        expect(player2.coins).toBe(10);
        game.gainCoins(player2, 10, "gift");
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
        expect(slugsp1.every(s => player1.inPlay.some(c => c.slug === s))).toBe(false);
        expect(slugsp2.every(s => player2.inPlay.some(c => c.slug === s))).toBe(false);
    });

    it("Dice Room 3", async () => {
        game.resetStack();
        const slugs = game.shop.itemsInShop.map(c => c!.slug);
        const room = game.obtainCard("r-dice_room_3") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
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
        expect(slugsp1.every(s => player1.inPlay.some(c => c.slug === s))).toBe(false);
        expect(slugsp2.every(s => player2.inPlay.some(c => c.slug === s))).toBe(true);
        await game.endTurn();
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
        await game.resolveStack();
        expect(player2.inPlay[2]!.slug).not.toBe(card.slug);
    });

    it("Conjoined Twin", async () => {
        const room = game.obtainCard("r-conjoined_twin") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [player2], remaining: Options } as any;
        };
        game.kill(player1, game.monsters[0]!, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player2.currentHealthPoints).toBe(0);
    });
    it("Devil Beggar 3", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.9;
        game.addHealth(player1, 1); // to be able to survive the room effect.
        await game.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(2);
        await game.resolveStack(); // effect
        await game.resolveStack(); // roll
        await game.resolveStack(); // effect
        expect(player1.currentHealthPoints).toBe(1);

    });
    it("Devil Beggar 2", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.4;
        await game.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        await game.resolveStack(); // effect
        await game.resolveStack(); // roll
        await game.resolveStack(); // effect
        expect(player1.hand.length).toBe(1);
    });
    it("Devil Beggar 1", async () => {
        const room = game.obtainCard("r-devil_beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.random = () => 0.1;
        await game.activateRoom(player1, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        await game.resolveStack(); // effect
        await game.resolveStack(); // roll
        await game.resolveStack(); // effect
        expect(player1.hand.length).toBe(2);
    });

    it("Key Master gain 3 treasures", async () => {
        const room = game.obtainCard("r-key_master") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("fsp2-gold_key")! as LootCard;
        const monster = game.monsters[0]!;
        game.addCardToHand(player1, loot);
        game.random = () => 0.99;
        await game.activateRoom(player1, room, [loot], 0);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.inPlay.length).toBe(5);
    });

    it("Challenge Room", async () => {
        const room = game.obtainCard("r-challenge_room") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        expect(player1.hasAttackRequirement).toBe(false);
        game.kill(player1, game.monsters[0]!, room);
        await game.resolveStack();
        game.random = () => 0.9;
        await game.resolveStack();
        await game.resolveStack();
        expect(player1.hasAttackRequirement).toBe(true);
    });
    it("Bomb bum deal 3 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-bomb")! as LootCard;
        const monster = game.monsters[0]!;
        game.addCardToHand(player1, loot);
        game.random = () => 0.5;
        await game.activateRoom(player1, room, [loot], 0);
        await game.resolveStack();
        let count = 0;
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if(count ++ === 1)
                return { selected: [monster], remaining: [] } as any;
            return { selected: [player2], remaining: Options } as any;
        };
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(monster.isDead).toBe(true);
        expect(player2.isDead).toBe(true);
    });

    it("Bomb bum take 3 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-bomb")! as LootCard;
        game.addCardToHand(player1, loot);
        game.addHealth(player1, 2); // to be able to survive the bomb damage and verify the 3 damage are correctly applied
        game.random = () => 0.9;
        await game.activateRoom(player1, room, [loot], 0);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(game.currentPlayer.currentHealthPoints).toBe(1);
    });

    it("Bomb bum deal 1 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        const monster = game.monsters[0]!;
        game.addCardToHand(player1, loot);
        game.random = () => 0.5;
        await game.activateRoom(player1, room, [loot], 0);
        await game.resolveStack();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            return { selected: [monster], remaining: [] } as any;
        };
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(monster.isDead).toBe(true);
    });

    it("Bomb bum take 1 damage", async () => {
        const room = game.obtainCard("r-bomb_bum") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-a_penny")! as LootCard;
        game.addCardToHand(player1, loot);
        game.random = () => 0.9;
        await game.activateRoom(player1, room, [loot], 0);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        expect(game.currentPlayer.currentHealthPoints).toBe(1);
    });
    
    it("Butter Fingers", async () => {
        const room = game.obtainCard("r-butter_fingers") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.loot(player1, 10);
        expect(player1.hand.cards.length).toBe(10); // draw 1 at the begining.
        await game.endTurn();
        await game.resolveStack();
        expect(player1.hand.cards.length).toBe(9);
        
    });
    it("Bumbo is loose", async () => {
        const room = game.obtainCard("r-bum_bo_is_loose") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.gainCoins(player1, 10, "gift");
        await game.endTurn();
        expect(player1.coins).toBe(8);
        
    });
    it("Blood Money", async () => {
        const room = game.obtainCard("r-blood_money") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.kill(player1, player1, room);
        await game.resolveStack();
        expect(player1.coins).toBe(0);
        expect(player2.coins).toBe(4);
        game.kill(player2, player2, room);
        await game.resolveStack();
        expect(player1.coins).toBe(4);
        expect(player2.coins).toBe(2);
        
    });

    it("Spoils Of War", async () => {
        const room = game.obtainCard("r-spoils_of_war") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.kill(player1, player1, room);
        await game.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(1);
        game.kill(player2, player2, room);
        await game.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player2.hand.length).toBe(0);
        
    });

    it("Blood Lust", async () => {
        const room = game.obtainCard("r-blood_lust") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        expect(player1.mustAttackMonster.map((m) => m.target)).toEqual(["any", "any"]);
    });

    it("Blood Lust cleanup on room replace", async () => {
        const bloodLust = game.obtainCard("r-blood_lust") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, bloodLust);
        game.resetStack();
        expect(player1.mustAttackMonster.map((m) => m.target)).toEqual(["any", "any"]);

        const replacement = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, replacement);

        expect(player1.mustAttackMonster.map((m) => m.target)).toEqual([]);
    });

    it("Blood Donation", async () => {
        const room = game.obtainCard("r-blood_donation") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.activateRoom(game.currentPlayer, room, [], 0);
        expect(player1.currentHealthPoints).toBe(1);
        expect(player1.coins).toBe(0);
        await game.resolveStack();
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

        expect(player1.mustAttackMonster.some((m) => m.target === "topDeck")).toBe(false);
    });

    it("Blessing Of The Sack", async () => {
        const room = game.obtainCard("r-blessing_of_the_sack") as RoomCard;
        const old = game.rooms?._slots[0]![0];
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.kill(player1, game.monsters[0]!, room);
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
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
        game.declareAttack(player1);
        await game.resolveStack();
        const after = game.decks.monster.cards.slice(0, 3).map(c => c.slug);
        expect(after).toEqual(slugs);
    });

    it("black_champions - Monsters have +1 [ATK] .", async () => {
        const atk = game.monsters.map(m => game.getAttack(m) + 1);
        const room = game.obtainCard("r-black_champions") as RoomCard;
        game.resetStack();
        game.rooms?.forceRoomAtSlot(0, room);
        expect(game.monsters.map(m => game.getAttack(m))).toEqual(atk);
    });

    it("Beggar 2", async () => {
        
        const room = game.obtainCard("r-beggar") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.gainCoins(player1, 30, "gift");
        for(const card of [... player1.hand.cards]) {
            game.removeCardFromHand(player1, card);
        }
        
        game.random = () => 6/6 - 0.01;
        await game.activateRoom(game.currentPlayer, room, [], 0);
        await game.resolveStack();
        expect(player1.hand.length).toBe(0);
        await game.resolveStack();
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
        game.gainCoins(player1, 30, "gift");
        for(const card of [... player1.hand.cards]) {
            game.removeCardFromHand(player1, card);
        }
        
        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 1/6 - 0.0001;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        let init = player1.coins;
        expect(player1.coins).toBe(27);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 2/6 - 0.0001;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(24);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);

        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 3/6 - 0.0001;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(23);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 4/6 - 0.0001;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(22);
        expect(player1.hand.length).toBe(0);
        expect(player1.inPlay.length).toBe(2);
        
        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 5/6 - 0.0001;
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        await game.resolveStack();
        init = player1.coins;
        expect(player1.coins).toBe(19);
        expect(player1.hand.length).toBe(2);
        expect(player1.inPlay.length).toBe(2);
        
        await game.activateRoom(game.currentPlayer, room, [], 0);
        game.random = () => 6/6 - 0.01;
        await game.resolveStack();
        expect(player1.hand.length).toBe(2);
        await game.resolveStack();
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
        expect(player2.coins).toBe(init + 3);
        
        const room2 = game.obtainCard("r-blessing_of_gluttony") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room2);
        const verif = player1.coins;
        await game.endTurn();
        expect(player1.coins).toBe(verif);
    });

    it("Blessing of Steam - Shop items the active player purchases cost 5¢ less.", async () => {
        const room = game.obtainCard("r-blessing_of_steam") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.endTurn();
        await game.endTurn();
        await game.endTurn();
        game.gainCoins(player2, 10, "gift");
        const init = player2.coins;
        game.declarePurchase(player2);
        game.purchase(player2, 0);
        expect(player2.coins).toBe(init - 5);
    });

    it("Angelic Intervention - Each time the active player attacks the top of the monster deck, after putting it in a monster slot, they may cancel their attack.", async () => {
        const room = game.obtainCard("r-angelic_intervention") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        await game.endTurn();
        await game.endTurn();
        await game.endTurn();
        game.declareAttack(player2);
        await game.declareAttackOnEntity(player2, "topDeck", 0);
        await game.resolveStack();
        expect(player2.isEngagedInCombat).toBe(false);
    });

    it("All Hallows’ Eve - Players can't gain souls.", async () => {
        const room = game.obtainCard("r-all_hallows_eve") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        const loot = game.obtainCard("b2-lost_soul")! as LootCard;
        game.addCardToHand(player1, loot);
        game.playCard(player1, player1.hand.cards.findIndex(c => c === loot));
        await game.resolveStack();
        game.gainCoins(player1, 100, "gift");
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
        game.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(3);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.declareAttackOnEntity(player1, player2);
        game.kill(player1, player2, room);
        await game.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });

    it("Battle Royale 2", async () => {
        const room = game.obtainCard("r-battle_royale_2") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(4);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.declareAttackOnEntity(player1, player2);
        game.kill(player1, player2, room);
        await game.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });

    it("Battle Royale 3", async () => {
        const room = game.obtainCard("r-battle_royale_3") as RoomCard;
        game.rooms?.forceRoomAtSlot(0, room);
        game.resetStack();
        game.declareAttack(player1);
        expect(player1.canAttackThisEntity(player2)).toBe(true);
        expect(player2.evasion).toBe(5);
        game.gainTreasure(player2);

        const init = player1.inPlay.length;
        game.declareAttackOnEntity(player1, player2);
        game.kill(player1, player2, room);
        await game.resolveStack();
        expect(player2.isDead).toBe(true);
        expect(player1.inPlay.length).toBe(init + 1);
    });
});

