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
                // expect(item.eternal).toBe(true);
            }
        game.rooms?.discardTop(0);
        for(const player of game.players)
            expect(player.name.interpolates!["content"]).toBe(player.id);
        game.gainTreasure(player2, 1);
        for(const player of game.players)
            for( const item of player.inPlay)
                expect(item.slug).not.toBe("b2-the_d6")
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
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(0);
        game.rollDice(player1, game.monsters[0]!.card);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.totalSouls).toBe(1);
    });
});