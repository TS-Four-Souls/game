import type { ItemCard, LootCard, RoomCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { setupTestGame } from "../testHelpers";
import { AttackRollData } from "@/models/stackElement";
import { pl } from "zod/locales";
import { TargetBuilder } from "@/models/targetBuilder";


describe("Warp Zone Loots ", () => {
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

    // it("rwz-demon_form", async () => {
    //     const bs = game.obtainCard("rwz-demon_form") as LootCard;
    //     game.cardHandler.addCardToHand(player1, bs);
    //     game.actions.playCard(player1, 0, []);
    //     await game.actions.resolveStack();
    // });

    it("rwz-cow_on_a_trash_farm", async () => {
        const bs = game.obtainCard("rwz-cow_on_a_trash_farm") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        game.cardHandler.recharge(player2.inPlay[0]!);
        expect(game.actions.canActivate(player2.inPlay[0]!, player2)).not.toBe(true);
    });

    it("rwz-fiend_fire", async () => {
        const ff = game.obtainCard("rwz-fiend_fire") as LootCard;
        while (player1.hand.length > 0)
            game.cardHandler.discardFromHandAtIndex(player1, 0, "effect");
        game.cardHandler.addCardToHand(player1, ff);
        game.loot(player1, 3);
        const targets: any[] = [player2, game.monsters[1]!, game.monsters[1]!];
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            if (typeof Options[0] === "number")
                return { selected: [1], remaining: Options.slice(1) };
            const target = targets.shift();
            return { selected: [target], remaining: Options.filter(o => o !== target) };
        };
        const p2Health = player2.currentHealthPoints;
        const monster = game.monsters[1]!;
        const monsterHealth = monster.currentHealthPoints;

        game.actions.playCard(player1, 0, []);
        // The cost is paid when the card is played, before it resolves.
        expect(player1.hand.length).toBe(0);
        while (!game.stack.isEmpty())
            await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(p2Health - 1);
        expect(monster.currentHealthPoints).toBe(monsterHealth - 2);
        expect(game.decks.loot.discard.includes(ff)).toBe(true);
    });

    it("rwz-fiend_fire - cost stays paid when cancelled", async () => {
        const ff = game.obtainCard("rwz-fiend_fire") as LootCard;
        game.cardHandler.addCardToHand(player1, ff);
        game.loot(player1, 2);
        game.actions.playCard(player1, player1.hand.cards.indexOf(ff), []);
        expect(player1.hand.length).toBe(0);
        game.stack.elements.at(-1)!.onCancel(game);
        expect(game.decks.loot.discard.includes(ff)).toBe(true);
    });

    it("rwz-cheep_cheep_cheep", async () => {
        const bs = game.obtainCard("rwz-cheep_cheep_cheep") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        expect(player2.name.key).toBe("name.chicken");
        expect(game.actions.canEndTurn(player1, false)).not.toBe(true);
        expect(player2.evasion).toBe(3);
        game.actions.declareAttack(player1);
        game.random = () =>0.999;
        await game.actions.declareAttackOnEntity(player1, player2);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);
        game.entityHandler.endCombat();
        await game.endTurn();
        await game.actions.resolveStack();
        expect(player2.name.key).not.toBe("name.chicken");
        expect(player2.attackable).toBe(false);
    });

    it("rwz-the_isaac_of_isaac_re_isaac", async () => {
        const bs = game.obtainCard("rwz-the_isaac_of_isaac_re_isaac") as RoomCard;
        game.gainTreasure(player1, 1);
        game.gainTreasure(player2, 1);
        for(const player of game.players)
            expect(player.name.interpolates!["content"]).toBe(player.id);
        game.decks.room.addTopPosition(bs);
        game.rooms?.discardTop(0);
        await game.actions.resolveStack();
        for(const player of game.players)
            expect(player.name.interpolates!["content"]).toBe("Isaac");
        game.gainTreasure(player2, 1);
        for(const player of game.players)
            for( const item of player.inPlay)
            {
                expect(item.slug).toBe("b2-the_d6");
                expect(item.eternal).toBe(true);
                expect(item.hasTapEffect()).toBe(true);
                expect(item.effectOutcomes.length).toBe(1);
            }
        game.rooms?.discardTop(0);
        for(const player of game.players)
            expect(player.name.interpolates!["content"]).toBe(player.id);
        game.gainTreasure(player2, 1);
        for(const player of game.players)
            for( const item of player.inPlay)
                expect(item.slug).not.toBe("b2-the_d6")
    });

    it("rwz-the_isaac_of_isaac_re_isaac items lose their abilities till the room leaves", async () => {
        const bs = game.obtainCard("rwz-the_isaac_of_isaac_re_isaac") as RoomCard;
        const breakfast = game.obtainCard("b2-breakfast") as ItemCard;
        game.cardHandler.addInPlay(player1, breakfast);
        const hp = player1.healthPoints;
        expect(breakfast.eternal).toBe(false);
        game.decks.room.addTopPosition(bs);
        game.rooms?.discardTop(0);
        await game.actions.resolveStack();
        // Breakfast lost its +1 HP, and has only the reroll ability.
        expect(player1.healthPoints).toBe(hp - 1);
        expect(breakfast.slug).toBe("b2-the_d6");
        expect(breakfast.eternal).toBe(true);
        expect(breakfast.hasTapEffect()).toBe(true);
        // An item gained while the room is active is changed too.
        const gained = game.obtainCard("b2-boomerang") as ItemCard;
        game.cardHandler.addInPlay(player2, gained);
        expect(gained.slug).toBe("b2-the_d6");
        expect(gained.eternal).toBe(true);
        // An item leaving play while the room is active gets back to normal.
        const removed = game.obtainCard("b2-lucky_foot") as ItemCard;
        game.cardHandler.addInPlay(player2, removed);
        expect(removed.eternal).toBe(true);
        game.cardHandler.removeInPlay(player2, removed);
        expect(removed.slug).toBe("b2-lucky_foot");
        expect(removed.eternal).toBe(false);
        // No "At the end of your turn, recharge this."
        breakfast.charged = false;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(breakfast.charged).toBe(false);
        game.rooms?.discardTop(0);
        expect(breakfast.slug).toBe("b2-breakfast");
        expect(breakfast.eternal).toBe(false);
        expect(player1.healthPoints).toBe(hp);
        expect(gained.slug).toBe("b2-boomerang");
        expect(gained.eternal).toBe(false);
        expect(gained.hasTapEffect()).toBe(true);
    });

    it("rwz-greed_butt", async () => {
        const bs = game.obtainCard("rwz-greed_butt") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [game.monsters[0]!.card]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.card.slug).toBe(bs.slug);
        expect(game.encounters.cardsOnTop.length).toBe(3);
        const mob = game.monsters[0]!;
        game.actions.declareAttack(player1);
        game.random = () =>0.999;
        game.actions.declareAttackOnEntity(player1, mob);
        expect(mob.currentHealthPoints).toBe(8);
        expect(mob.evasion).toBe(2);
        expect(mob.attackPoints).toBe(1);
        game.entityHandler.kill(player1, mob, {card: bs, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(13);
        expect(game.decks.monster.discard.length).toBe(0);
        expect(game.decks.loot.discard.length).toBe(1);
    });

    it("rwz-murder 2", async () => {
        const bs = game.obtainCard("rwz-murder") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        game.random = () =>0.999;
        game.actions.declareAttackOnEntity(player1, player2);
        game.entityHandler.endCombat();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.decks.loot.discard.includes(bs)).toBe(true);
        expect(player1.hand.cards.includes(bs)).toBe(false);
    });

    it("rwz-murder", async () => {
        const bs = game.obtainCard("rwz-murder") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        game.random = () =>0.999;
        game.actions.declareAttackOnEntity(player1, player2);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.isDead).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.decks.loot.discard.includes(bs)).toBe(false);
        expect(player1.hand.cards.includes(bs)).toBe(true);
    });

    it("rwz-loot_card", async () => {
        const bs = game.obtainCard("rwz-loot_card") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(2);
        expect(player1.hand.cards.includes(bs)).toBe(true);
        game.entityHandler.addLootPlay(player1, 1, bs);
        game.actions.playCard(player1, 1, []);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(3);
    });

    it("rwz-loot_card leaves play when returned, a single prompt per turn after replays", async () => {
        const bs = game.obtainCard("rwz-loot_card") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        let prompts = 0;
        const select = game.select.bind(game);
        game.select = async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (rest[0]?.key === "pending.useItemEffect" && rest[0]?.interpolates?.card?.key === "cardNames.rwz-loot_card")
                prompts++;
            return (select as any)(player, min, max, options, ...rest);
        };
        for (let turn = 0; turn < 3; turn++) {
            game.entityHandler.addLootPlay(player1, 1, bs);
            game.actions.playCard(player1, player1.hand.cards.indexOf(bs), []);
            while (!game.stack.isEmpty()) await game.actions.resolveStack();
            expect(player1.inPlay.includes(bs)).toBe(true);
            prompts = 0;
            await game.endTurn();
            while (!game.stack.isEmpty()) await game.actions.resolveStack();
            expect(prompts).toBe(1);
            expect(player1.inPlay.includes(bs)).toBe(false);
            expect(player1.hand.cards.includes(bs)).toBe(true);
            await game.endTurn();
            while (!game.stack.isEmpty()) await game.actions.resolveStack();
        }
    });

    it("rwz-witch 4", async () => {
        const bs = game.obtainCard("rwz-witch") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);

        const tech = game.obtainCard("b2-portable_slot_machine") as ItemCard;
        game.gainCoins(player1, 5, "debug");
        game.cardHandler.addInPlay(player1, tech);
        await game.activateItem(player1, tech, [], 0);
        expect(bs.targetStillValid(player1, "tap", ["Cancel the effect of an active item or loot card being played.", game.stack.elements[0]!])).toBe(false);
    });

    it("rwz-witch 3", async () => {
        const bs = game.obtainCard("rwz-witch") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);

        const tech = game.obtainCard("b2-tech_x") as ItemCard;
        game.cardHandler.addInPlay(player1, tech);
        await game.activateItem(player1, tech, [], "tap");
        game.actions.playCard(player1, 0, ["Cancel the effect of an active item or loot card being played.", game.stack.elements[0]!]);
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
    });

    it("rwz-witch 2", async () => {
        const bs = game.obtainCard("rwz-witch") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.random = () => 0.01;
        const dice = game.rollDice(player1, bs);
        game.actions.playCard(player1, 0, ["Add or subtract 1 from a roll.", dice, 1]);
        await game.actions.resolveStack();
        expect(dice.value).toBe(2);
    });

    it("rwz-witch", async () => {
        const bs = game.obtainCard("rwz-witch") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, ["Deal 1 damage to a monster or player.", player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(1);
    });

    it("rwz-blanks", async () => {
        const bs = game.obtainCard("rwz-blanks") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [player2]);
        await game.actions.resolveStack();
        game.entityHandler.dealDamage(player1, player2, {card: bs, visualEffectBox: null as any}, 4);
        game.entityHandler.addHealth(player1, 10, bs);
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(8);
    });

    it("rwz-blanks can protect yourself and deal the prevented damage to a monster", async () => {
        const bs = game.obtainCard("rwz-blanks") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, [player1]);
        await game.actions.resolveStack();
        const monster = game.monsters[1]!;
        monster.addHealthPoints(5);
        const monsterHp = monster.currentHealthPoints;
        let offered: any[] = [];
        const select = game.select.bind(game);
        game.select = async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (rest[0]?.key === "pending.targetToDealDamageTo") {
                offered = options;
                return { selected: [monster], remaining: options.filter(o => o !== monster) };
            }
            return (select as any)(player, min, max, options, ...rest);
        };
        game.entityHandler.dealDamage(player2, player1, {card: bs, visualEffectBox: null as any}, 2);
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
        expect(offered).toContain(player2);
        expect(offered).toContain(monster);
        expect(offered).not.toContain(player1);
        expect(monster.currentHealthPoints).toBe(monsterHp - 2);
    });

    it("b2-host_hat retaliation still only offers other players", async () => {
        const hostHat = game.obtainCard("b2-host_hat") as ItemCard;
        game.cardHandler.addInPlay(player1, hostHat);
        player1.addHealthPoints(10);
        await game.activateItem(player1, hostHat);
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        let offered: any[] = [];
        const select = game.select.bind(game);
        game.select = async (player: Player, min: number, max: number, options: any[], ...rest: any[]) => {
            if (rest[0]?.key === "pending.playerToDealDamageTo")
                offered = options;
            return (select as any)(player, min, max, options, ...rest);
        };
        game.entityHandler.dealDamage(player1, player1, {card: hostHat, visualEffectBox: null as any}, 3);
        while (!game.stack.isEmpty()) await game.actions.resolveStack();
        expect(offered).toEqual([player2]);
    });

    it("rwz-chunk_of_amber", async () => {
        const bs = game.obtainCard("rwz-chunk_of_amber") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        game.random = () => 0.9;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(12);
    });

    it("rwz-demon_form", async () => {
        const bs = game.obtainCard("rwz-demon_form") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(3);
        await game.endTurn();
        await game.actions.resolveStack();
        expect(game.entityHandler.getAttack(player1)).toBe(1);
    });

    it("rwz-bible_thump", async () => {
        const bs = game.obtainCard("rwz-bible_thump") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
    });

    it("rwz-bible_thump 2", async () => {
        const bs = game.obtainCard("rwz-bible_thump") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        for (const p of game.players) {
            game.entityHandler.kill(p,p,{card: bs, visualEffectBox: null as any});
            await game.actions.resolveStack();
        }
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(6);
    });

});


describe("Warp Zone Loots ", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    
    beforeEach(async () => {
        const setup = await setupTestGame({
                        characters: ["fsp2-guppy", "b2-lilith"],
                        monsters: ["b2-fly", "b2-fatty"],
                        monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                        treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-blank_card", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
                        bonusSouls: ["rwz-strawberry"],
                        playerCount: 2,
                        rooms: true,
                    });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.resetStack();
        game.resetCallbacks();
    });

    it("rwz-strawberry success", async () => {
        game.entityHandler.addHealth(player1, 5, "other");
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.entityHandler.addDC(game.monsters[0]!, 2, "other");
        game.random = () => 0.001;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(0);
        game.random = () => 0.001;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(1);
    });

    it("rwz-strawberry fail over turn", async () => {
        game.entityHandler.addHealth(player1, 5, "other");
        game.random = () => 0.001;
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        // Player 1 is no longer the active player: their rolls don't count.
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(0);
        // The active player's count started over at the start of the turn.
        game.rollDice(player2, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player2, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.totalSouls).toBe(0);
        game.rollDice(player2, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.totalSouls).toBe(1);
        expect(player1.totalSouls).toBe(0);
    });

    it("rwz-strawberry is gained only once", async () => {
        game.random = () => 0.001;
        for(let i = 0; i < 6; i++) {
            game.rollDice(player1, game.monsters[0]!.card);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
        }
        expect(player1.totalSouls).toBe(1);
        expect(player1.souls.filter(c => c.slug === "rwz-strawberry").length).toBe(1);
    });
});