import type { ItemCard, MonsterCard, RoomCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DiceRoll, DiceWillRoll } from "../../models/stackElement";
import { EffectData } from "../../models/types/cardTypes";
import { makeAnAttackRollAfterEachAttackRollEffect } from "../../models/effects/roomEffects";
import { effectParser } from "../../models/effects/parsing/effectParser";
import { setupTestGame } from "../testHelpers";
import { TargetBuilder } from "../../models/targetBuilder";


describe("Slots regressions", () => {
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

    it("rooms - a covered room loses its effects and regains them when uncovered", async () => {
        const champions = game.obtainCard("r-black_champions") as RoomCard;
        game.rooms!.forceRoomAtSlot(0, champions);
        const monster = game.encounters.monsterIn(0)!;
        const atkWithRoom = monster.attackPoints;

        // Cover the room with another one (as lookAtTopXPut1InSlotEffect does)
        const cover = game.obtainCard("r-all_hallows_eve") as RoomCard;
        game.cardHandler.addTopPosition("room", cover);
        game.rooms!.draw(0);
        expect(game.rooms!.roomIn(0)).toBe(cover);
        expect(game.rooms!._slots[0]!.length).toBe(2);
        expect(monster.attackPoints).toBe(atkWithRoom - 1);

        // Removing the covering room reveals Black Champions again
        game.rooms!.discardTop(0);
        expect(game.rooms!.roomIn(0)).toBe(champions);
        expect(monster.attackPoints).toBe(atkWithRoom);

        // Covering again then removing the covering room through removeAtIndices
        game.cardHandler.addTopPosition("room", cover);
        game.rooms!.draw(0);
        expect(monster.attackPoints).toBe(atkWithRoom - 1);
        game.rooms!.removeAtIndices(0, 1);
        expect(game.rooms!.roomIn(0)).toBe(champions);
        expect(monster.attackPoints).toBe(atkWithRoom);

        // Removing the covered room while it is covered doesn't touch the active one
        game.cardHandler.addTopPosition("room", cover);
        game.rooms!.draw(0);
        game.rooms!.removeAtIndices(0, 0);
        expect(game.rooms!.roomIn(0)).toBe(cover);
        expect(monster.attackPoints).toBe(atkWithRoom - 1);
    });

    it("rooms - forceRoomAtSlot on a covered slot puts the room on top", async () => {
        const champions = game.obtainCard("r-black_champions") as RoomCard;
        game.rooms!.forceRoomAtSlot(0, champions);
        const cover = game.obtainCard("r-all_hallows_eve") as RoomCard;
        game.cardHandler.addTopPosition("room", cover);
        game.rooms!.draw(0);
        const forced = game.obtainCard("r-blood_money") as RoomCard;
        game.rooms!.forceRoomAtSlot(0, forced);
        expect(game.rooms!.roomIn(0)).toBe(forced);
        expect(game.rooms!._slots[0]!).toEqual([champions, forced]);
        expect(game.decks.room.discard).toContain(cover);
    });

    it("encounters.flushAndDraw - each monster not attacked is discarded and replaced, covered cards stay covered", async () => {
        game.encounters.draw(0);
        const [covered, top0] = game.encounters._slots[0]!;
        const top1 = game.encounters._slots[1]![0]!;
        expect(game.encounters._slots[0]!.length).toBe(2);

        game.encounters.flushAndDraw();

        const slot0 = game.encounters._slots[0]!;
        const slot1 = game.encounters._slots[1]!;
        expect(slot0.length).toBe(2);
        expect(slot0[0]).toBe(covered!);
        expect(slot0[1]).not.toBe(top0!);
        expect(slot1.length).toBe(1);
        expect(slot1[0]).not.toBe(top1);
        expect(game.decks.monster.discard).toContain(top0!);
        expect(game.decks.monster.discard).toContain(top1);
        expect(game.encounters.monsterIn(0)!.card).toBe(slot0[1]! as MonsterCard);
        expect(game.encounters.monsterIn(1)!.card).toBe(slot1[0]! as MonsterCard);
    });

    it("encounters.draw - an indomitable card goes to a new slot and leaves the slot unchanged", async () => {
        const top0 = game.encounters._slots[0]![0]!;
        const monster0 = game.encounters.monsterIn(0)!;
        const megaSatan = game.obtainCard("r-mega_satan") as MonsterCard;
        game.cardHandler.addTopPosition("monster", megaSatan);

        expect(game.encounters.draw(0)).toBe(false);

        expect(game.encounters._slots[0]).toEqual([top0]);
        expect(game.encounters.monsterIn(0)).toBe(monster0);
        expect(game.encounters._slots.length).toBe(3);
        expect(game.encounters._slots[2]).toEqual([megaSatan]);
        expect(game.encounters.monsterIn(2)!.card).toBe(megaSatan);
    });

    it("encounters.fillEmptySpots - an indomitable card goes to a new slot and the empty slot is still filled", async () => {
        const megaSatan = game.obtainCard("r-mega_satan") as MonsterCard;
        game.cardHandler.addTopPosition("monster", megaSatan);

        game.encounters.discardTop(1);

        expect(game.encounters._slots.length).toBe(3);
        expect(game.encounters._slots[2]).toEqual([megaSatan]);
        expect(game.encounters._slots[1]!.length).toBe(1);
        expect(game.encounters._slots[1]![0]!.indomitable).toBe(false);
        expect(game.encounters.monsterIn(1)!.card).toBe(game.encounters._slots[1]![0]! as MonsterCard);
    });

    it("encounters.flushAndDraw - an indomitable replacement goes to a new slot and the covered card is revealed", async () => {
        game.encounters.draw(0);
        const [covered, top0] = game.encounters._slots[0]!;
        const megaSatan = game.obtainCard("r-mega_satan") as MonsterCard;
        game.cardHandler.addTopPosition("monster", megaSatan);

        game.encounters.flushAndDraw();

        expect(game.decks.monster.discard).toContain(top0!);
        expect(game.encounters._slots[0]).toEqual([covered!]);
        expect(game.encounters.monsterIn(0)!.card).toBe(covered! as MonsterCard);
        expect(game.encounters._slots.length).toBe(3);
        expect(game.encounters._slots[2]).toEqual([megaSatan]);
        expect(game.encounters.monsterIn(2)!.card).toBe(megaSatan);
    });

    it("encounters.flushAndDraw - the monster being attacked stays", async () => {
        const attacked = game.encounters.monsterIn(0)!;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, attacked);
        const other = game.encounters._slots[1]![0]!;
        game.encounters.flushAndDraw();
        expect(game.encounters.monsterIn(0)).toBe(attacked);
        expect(game.encounters._slots[0]!.length).toBe(1);
        expect(game.encounters._slots[1]![0]).not.toBe(other);
        expect(game.encounters._slots[1]!.length).toBe(1);
    });

    it("shop.purchase - empty slot throws without charging coins", async () => {
        game.gainCoins(player1, 20, "debug");
        const coins = player1.coins;
        game.shop._slots[0] = [];
        expect(() => game.shop.purchase(player1, 0, 10, game)).toThrow();
        expect(player1.coins).toBe(coins);
    });

    it("shop.purchase - the purchased card is removed from the shop before entering play", async () => {
        game.gainCoins(player1, 20, "debug");
        const card = game.shop.itemsInShop[0]!;
        let inShopOnEnter: boolean | undefined;
        game.emitter.on("on:enter:play", () => {
            inShopOnEnter = game.shop._slots.some(slot => slot.includes(card));
        });
        expect(game.shop.purchase(player1, 0, 10, game)).toBe(true);
        expect(inShopOnEnter).toBe(false);
        expect(player1.inPlay).toContain(card);
        expect(game.shop._slots.some(slot => slot.includes(card))).toBe(false);
        expect(game.shop.itemsInShop[0]).toBeDefined();
    });

    it("car_battery - can't target itself and can recharge nothing", async () => {
        const battery = game.obtainCard("r-car_battery") as ItemCard;
        game.cardHandler.addInPlay(player1, battery);
        const other = game.obtainCard("b2-tech_x") as ItemCard;
        game.cardHandler.addInPlay(player1, other);
        other.charged = false;

        const effect = battery.getActiveEffect()!;
        const selector = effect.targetsSelector[0]!;
        expect(selector.min).toBe(0);
        const options = selector.selector(player1, battery);
        expect(options).not.toContain(battery);
        expect(options).toContain(other);

        // Activating with no target is allowed
        await game.activateItem(player1, battery, [], "tap");
        await game.actions.resolveStack();
        expect(battery.charged).toBe(false);
        expect(other.charged).toBe(false);
    });

    it("car_battery - no other tap item in play doesn't loop forever when checking targets", async () => {
        // Neither eternal (lazarus_rags, berserk) has a tap effect, so the "up to 3" selector has no option.
        const setup = await setupTestGame({
                    characters: ["b2-lazarus", "r-the_savage"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        const battery = game.obtainCard("r-car_battery") as ItemCard;
        game.cardHandler.addInPlay(player1, battery);
        expect(battery.getActiveEffect()!.targetsSelector[0]!.selector(player1, battery)).toHaveLength(0);

        expect(TargetBuilder.validTargetExists(game, player1, battery, "tap")).toBe(true);
        const random = TargetBuilder.buildRandomValidTargets(game, player1, battery, "inPlay");
        expect(random).toEqual({ index: "tap", targets: [] });
        game.detailedStateJSON(player1);
    });

    it("car_battery - choosing nothing when its targets are built on resolve doesn't prompt again", async () => {
        const battery = game.obtainCard("r-car_battery") as ItemCard;
        game.cardHandler.addInPlay(player1, battery);
        const other = game.obtainCard("b2-tech_x") as ItemCard;
        game.cardHandler.addInPlay(player1, other);
        other.charged = false;

        let prompts = 0;
        game.select = (async () => { prompts++; return { selected: [], remaining: [] }; }) as any;
        const targets = await TargetBuilder.buildTargetsOnResolve(game, player1, battery, "tap");
        expect(prompts).toBe(1);
        expect(targets).toEqual([]);
    });

    it("fsp2-gimpy - choosing +2 [ATK] doesn't prompt for an extra target", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-whore_of_babylon", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        expect(player1.inPlay[0]!.slug).toBe("fsp2-gimpy");
        const atk = player1.attackPoints;
        const prompts: any[][] = [];
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            prompts.push(Options);
            const atkOption = Options.find(o => o?.description === "gain +2 [atk] till end of turn.");
            if (atkOption)
                return { selected: [atkOption], remaining: [] };
            return { selected: Options.slice(0, max), remaining: Options.slice(max) };
        };
        game.entityHandler.dealDamage(player1, player1, {card: player1.character!, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.attackPoints).toBe(atk + 2);
        expect(prompts.length).toBe(1);
        // The "+2 [ATK]" option applies to the issuer: it has no target to choose
        expect(effectParser("gain 2 [atk] till end of turn", game).targetSelectors).toEqual([]);
        expect(effectParser("Gain +2 [ATK] till end of turn.", game).targetSelectors).toEqual([]);
        expect(effectParser("Recharge each item you control.", game).targetSelectors).toEqual([]);
    });

    it("gus - a stale roll can't make a player attack on another turn", async () => {
        const room = game.obtainCard("r-gus") as RoomCard;
        game.rooms!.forceRoomAtSlot(0, room);
        // No combat: the effect must not register anything
        const result = makeAnAttackRollAfterEachAttackRollEffect(game)(new EffectData(room, () => player2, []));
        expect(result).toBe(false);

        // An attack roll of player1 later on must not trigger player2's attack roll
        game.random = () => 0.99;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.encounters.monsterIn(0)!);
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        expect(() => game.resolveEntireStack()).not.toThrow();
    });

    it("gus - ending combat cancels pending rolls wrapped in a DiceWillRoll", async () => {
        const crystalBall = game.obtainCard("b2-crystal_ball") as ItemCard;
        game.cardHandler.addInPlay(player2, crystalBall);
        expect(game.cardHandler.shouldUseDiceWillRoll()).toBe(true);
        const room = game.obtainCard("r-gus") as RoomCard;
        game.rooms!.forceRoomAtSlot(0, room);
        game.random = () => 0.99;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.animatedList.all[0]!);
        // Resolve until the join roll of player2 is waiting behind a DiceWillRoll
        for (let i = 0; i < 5 && !game.stack.elements.some(e => e instanceof DiceWillRoll && e.issuer === player2); i++)
            await game.actions.resolveStack();
        expect(game.stack.elements.some(e => e instanceof DiceWillRoll && e.issuer === player2)).toBe(true);

        game.entityHandler.endCombat();
        expect(game.stack.elements.some(e => (e instanceof DiceWillRoll || e instanceof DiceRoll) && e.issuer === player2)).toBe(false);
    });
});
