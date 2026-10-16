import { Game } from "../../models/game";
import type { ItemCard, LootCard, TreasureCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { DamageOnStack, AttackRollData, DiceRoll } from "../../models/stackElement";
import { TargetBuilder } from "@/models/targetBuilder";

describe("Warp Zone Treasures", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter","b2-cod_worm","b2-spider","b2-conjoined_fatty", "b2-dip","b2-leech","b2-gurdy"],
                    treasureDeck: ["b2-boomerang", "b2-guppys_head", "b2-no", "b2-blank_card"],
                    rooms: true,
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });


 
    // it("rwz-the_crowdfunder", async () => {
    //     const card1 = game.obtainCard("rwz-the_crowdfunder") as TreasureCard;
    //     game.cardHandler.addInPlay(player1, card1);
    // });
 
    it("rwz-tony", async () => {
        const card1 = game.obtainCard("rwz-tony") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.attackPoints).toBe(3);
        game.gainTreasure(player1, 1);
        expect(player1.attackPoints).toBe(2);
    });
 
    it("rwz-the_crowdfunder", async () => {
        const card1 = game.obtainCard("rwz-the_crowdfunder") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
    it("rwz-spewer", async () => {
        const card1 = game.obtainCard("rwz-spewer") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
    it("rwz-ser_junkan", async () => {
        const card1 = game.obtainCard("rwz-ser_junkan") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
    });
 
 
    it("rwz-newgrounds_tank", async () => {
        const card1 = game.obtainCard("rwz-newgrounds_tank") as TreasureCard;
        const evasions = game.monsters.map(m => game.entityHandler.getDC(m));
        expect(player1.healthPoints).toBe(2);
        expect(player1.attackPoints).toBe(1);
        game.cardHandler.addInPlay(player1, card1);
        expect(player1.healthPoints).toBe(3);
        expect(player1.attackPoints).toBe(2);
        expect(game.monsters.map(m => game.entityHandler.getDC(m) - 1)).toEqual(evasions);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters.map(m => game.entityHandler.getDC(m))).toEqual(evasions);
    });
 
    it("rwz-gun_that_can_kill_the_past", async () => {
        const card1 = game.obtainCard("rwz-gun_that_can_kill_the_past") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        game.activateItem(player1, player1.character, [], "tap");
        game.entityHandler.addLootPlay(player2, 1);
        await game.activateItem(player2, card1, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer).toBe(player1);
    });
    
    it("rwz-george", async () => {
        const card1 = game.obtainCard("rwz-george") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
                return {
                    selected: Options.splice(max),
                    remaining: []
                };
        };

        const monsterCards = game.decks.monster.cards.slice(0, 5).toReversed().map(c => c.slug);
        game.actions.declareAttack(player1);
        expect(game.stack.isEmpty()).toBe(false);
        await game.actions.resolveStack();
        expect(game.decks.monster.cards.slice(0, 5).map(c => c.slug)).toEqual(monsterCards);
    });
    
    it("rwz-doorway rooms", async () => {
        const card1 = game.obtainCard("rwz-doorway") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);

        const room = game.rooms?.activeRooms[0]!;
        await game.activateItem(player1, card1, ["Put each room into discard."], "tap");
        await game.actions.resolveStack();
        expect(game.rooms?.activeRooms[0]!).not.toBe(room);
    });
 
 
    it("rwz-diogenes_pot", async () => {
        const card1 = game.obtainCard("rwz-diogenes_pot") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const mob = game.monsters[0]!;
        game.entityHandler.addDC(mob, 4, card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, mob);
        game.random = () => 3/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);

        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);

        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(mob.healthPoints);
        expect(player1.isDead).toBe(true);
    });
 
    it("rwz-boxing_glove", async () => {
        const card1 = game.obtainCard("rwz-boxing_glove") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        const mob = game.monsters[0]!;
        await game.activateItem(player1, card1, [mob], "tap");
        expect(card1.charged).toBe(false);
        await game.actions.resolveStack();
        expect(mob).not.toBe(game.monsters[0]);
        expect(game.decks.monster.cards.at(-1)?.slug).toBe(mob.card.slug);
        game.entityHandler.kill(player1, game.monsters[1]!, {card: card1, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(card1.charged).toBe(true);
    });
 
    it("rwz-birthday_cake 2", async () => {
        const card1 = game.obtainCard("rwz-birthday_cake") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        await game.endTurn();
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
                return {
                    selected: [],
                    remaining: []
                };
        };
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(1);
    });
 
    it("rwz-birthday_cake", async () => {
        const card1 = game.obtainCard("rwz-birthday_cake") as TreasureCard;
        game.cardHandler.addInPlay(player2, card1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.hand.length).toBe(1);
        expect(player2.hand.length).toBe(2);
    });

    it("rwz-aubrey", async () => {
        const card1 = game.obtainCard("rwz-aubrey") as TreasureCard;
        game.cardHandler.addInPlay(player1, card1);
        game.gainCoins(player1, 11, card1);
        game.actions.declarePurchase(player1);
        game.actions.purchase(player1, 0);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
        expect(player1.hand.length).toBe(3);
    });
});