import type { LootCard, TreasureCard } from "@/models/cards";
import { Deck, MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, expectTypeOf, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

describe("Gold Box 2 Monsters", () => {
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

    it("g2-round_worm", async () => {
        const card1 = game.obtainCard("g2-round_worm") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const mob = game.monsters[0]!;
        game.random = () => 4/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
        expect(mob.isDead).toBe(true);
    });

    it("g2-polycephalus", async () => {
        const card1 = game.obtainCard("g2-polycephalus") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const mob = game.monsters[0]!;
        game.random = () => 4/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("g2-parabite", async () => {
        const card1 = game.obtainCard("g2-parabite") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const mob = game.monsters[0]!;
        game.random = () => 0.499;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("g2-knight", async () => {
        const card1 = game.obtainCard("g2-knight") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.addHealth(player1, 10, "other");
        const mob = game.monsters[0]!;
        game.random = () => 0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(11);
        expect(mob.currentHealthPoints).toBe(1);
    });

    it("g2-gaper", async () => {
        const card1 = game.obtainCard("g2-gaper") as MonsterCard;
        game.cardHandler.attachEffectsToCard(card1);
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.addAttack(player1, 10, "other");
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hasMandatoryAttackRequirement).toBe(true);
    });

    it("g2-imp", async () => {
        const card1 = game.obtainCard("g2-imp") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const mob = game.monsters[0]!;
        game.random = () => 3/6-0.01;
        game.actions.attackRoll(player1, mob);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.entityHandler.getDC(mob)).toBe(6);
    });

    it("g2-gurglings", async () => {
        const card1 = game.obtainCard("g2-gurglings") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        const mob = game.monsters[0]!;
        let init = game.entityHandler.getDC(mob);
        game.entityHandler.dealCombatDamage(player1, mob, {card: card1, visualEffectBox: undefined}, mob.currentHealthPoints-2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(mob.currentHealthPoints).toBe(2);
        expect(game.entityHandler.getDC(mob)).toBe(init-1);
        game.entityHandler.dealCombatDamage(player1, mob, {card: card1, visualEffectBox: undefined}, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(mob.currentHealthPoints).toBe(1);
        expect(game.entityHandler.getDC(mob)).toBe(init-1);
        game.entityHandler.heal(mob, 2);
        expect(game.entityHandler.getDC(mob)).toBe(init);
    });

    it("g2-i_am_error 5", async () => {
        const card1 = game.obtainCard("g2-i_am_error") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.random = () => 5/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(2);
    });

    it("g2-i_am_error 3", async () => {
        const card1 = game.obtainCard("g2-i_am_error") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.random = () => 3/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(3);
    });

    it("g2-i_am_error 1", async () => {
        const card1 = game.obtainCard("g2-i_am_error") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.random = () => 1/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hasAttackRequirement).toBe(true);
    });

    it("g2-steven", async () => {
        const card1 = game.obtainCard("g2-steven") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.entityHandler.addHealth(player1, 10);
        game.random = () => 2/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.currentHealthPoints).toBe(10);
        game.random = () => 6/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer === player2).toBe(true);
    });

    it("g2-trap_door roll 6", async () => {
        const card1 = game.obtainCard("g2-trap_door") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.random = () => 0.99;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });

    it("g2-trap_door roll 1", async () => {
        const card1 = game.obtainCard("g2-trap_door") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.random = () => 0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.attackThisTurn).toBe(1);
    });

    it("g2-curse_of_fatigue", async () => {
        const card1 = game.obtainCard("g2-curse_of_fatigue") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        game.gainTreasure(player1, 2);
        await game.actions.resolveStack();
        expect(player1.curses.length).toBe(1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        for(const item of player1.inPlay)
            item.charged = false;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer === player1).toBe(true);
        expect(player1.inPlay[0]!.charged).toBe(true);
        expect(player1.inPlay[1]!.charged).toBe(false);
        expect(player1.inPlay[2]!.charged).toBe(false);
    });

    it("g2-curse_of_tiny_hands", async () => {
        const card1 = game.obtainCard("g2-curse_of_tiny_hands") as MonsterCard;
        game.decks.monster.addTopPosition(card1);
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, "topDeck", 0);
        await game.actions.resolveStack();
        game.loot(player1, 10);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
        game.cardHandler.removeCurse(player1, card1);
        game.loot(player1, 20);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(23);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(10);
    });

});