import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DamageOnStack, DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard, Card } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { setupStandardTestGame, dischargeEachItemsAndRemoveCoins, emptyHands, mockGameSelections } from "./testHelpers";

describe("Known bugs that have be corrected", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        const setup = setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });
    it("playing question mark on chaos card should destroy question mark.", async () => {
        const chaosCard = game.obtainCard("b2-chaos_card") as ItemCard;
        game.addInPlay(player1, chaosCard);
        const questionMark = game.obtainCard("fsp2-questionmark_card") as LootCard;
        game.addCardToHand(player1, questionMark);
        game.playCard(player1, player1.hand.length - 1, [chaosCard]);
        await game.resolveStack();
        expect(game.destroyedCards).toContain(questionMark);
        expect(game.decks.loot.discard.map(c=>c.slug)).not.toContain(questionMark.slug);
    });
    it("discard 1 loots on death", async () => {
        game.loot(player1, 10);
        const handSize = player1.hand.length;
        game.kill(player1, player1, player1.hand._hand[0] as Card);
        await game.resolveEntireStack();
        expect(game.stack.size).toBe(0);
        expect(player1.hand.length).toBe(handSize - 1);
    });

    it("Swallowed Penny: should give one coin on player takes damage if player is issuer and damage > 0.", async () => {
        const loot = game.decks["loot"]!.getCardFromSlug("b2-swallowed_penny")!;

        player1.addHealthPoints(10);
        const initialHealth = player1.currentHealthPoints;
        const initialCoins = player1.coins;
        const initialCoins2 = player2.coins;
        player1.hand.addToHand(loot);
        game.playCard(player1, 0);
        await game.resolveStack();

        game.dealDamage(player2, player1, loot, 1);
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 1);

        game.dealDamage(player2, player1, loot, 1);
        const dmgOnStck = game.stack.peek()! as DamageOnStack;
        dmgOnStck.damage = [0]; // modify damage to 0
        await game.resolveStack();
        await game.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 1);
    });


    it("stealing does not remove card correctly", async () => {
        const payToPlay = game.shop.obtainCard("b2-pay_to_play") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-brimstone") as ItemCard;
        expect(player1.attackPoints).toBe(1);
        expect(player2.attackPoints).toBe(1);
        game.addInPlay(player2, payToPlay);
        game.addInPlay(player1, targetItem);
        expect(player1.attackPoints).toBe(2);
        expect(player2.attackPoints).toBe(1);

        // Give player2 enough coins
        player2.gainCoins(10);
        const initialCoins = player2.coins;

        // Activate pay_to_play (paid effect with effectId 0)
        await game.activateItem(player2, payToPlay, [targetItem], 0);
        await game.resolveStack();

        expect(player1.attackPoints).toBe(1);
        expect(player2.attackPoints).toBe(2);
        // Item should be stolen and player should lose 10¢
        expect(player2.coins).toBe(initialCoins - 10);
        expect(player1.inPlay).not.toContain(targetItem);
        expect(player2.inPlay).toContain(targetItem);

        expect(player1.inPlay.length).toBe(2);
        expect(player2.inPlay.length).toBe(4);
        expect(player2.inPlay.map((c) => c.slug)).toContain("b2-brimstone");
    });


    it("curse removed on death", async () => {
        const pain = game.obtainCard("b2-curse_of_pain") as MonsterCard;
        const blank = game.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, blank); // to discard on death
        game.decks["monster"]?.addTopPosition(pain);

        game.encounters.draw(0);
        await game.resolveStack();

        expect(player1.curses.length).toBe(1);
        expect(player1.curses[0]!.slug).toBe("b2-curse_of_pain");
        game.endTurn();
        await game.resolveStack();

        game.endTurn();
        await game.resolveStack(); // end turn effect d6
        await game.resolveStack(); // on turn start
        await game.resolveStack(); // damage
        expect(game.currentPlayer).toBe(player1);
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(1);

        game.kill(player1, player1, pain);
        await game.resolveStack(); // death on stack
        expect(player1.curses.length).toBe(0);

        game.endTurn();
        await game.resolveStack();

        game.endTurn();
        await game.resolveStack(); // end turn effect d6
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(2);
    });

    it("curse removed on destruction (dagaz)", async () => {
        const pain = game.obtainCard("b2-curse_of_pain") as MonsterCard;
        const blank = game.obtainCard("b2-blank_card") as ItemCard;
        const dagaz = game.obtainCard("b2-dagaz") as LootCard;
        game.addInPlay(player1, blank); // to discard on death
        game.decks["monster"]?.addTopPosition(pain);

        game.encounters.draw(0);
        await game.resolveStack();

        expect(player1.curses.length).toBe(1);
        expect(player1.curses[0]!.slug).toBe("b2-curse_of_pain");
        game.endTurn();
        await game.resolveStack();

        game.endTurn();
        await game.resolveStack(); // end turn effect d6
        await game.resolveStack(); // on turn start
        await game.resolveStack(); // damage
        expect(game.currentPlayer).toBe(player1);
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(1);

        game.addCardToHand(player1, dagaz);
        game.playCard(player1, player1.hand.length - 1, ["Destroy a curse.", pain]);
        await game.resolveStack(); // death on stack
        expect(player1.curses.length).toBe(0);

        game.endTurn();
        await game.resolveStack();

        game.endTurn();
        await game.resolveStack(); // end turn effect d6
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("remove something on top of a monster work", async () => {
        game.declareAttack(player1);
        game.drawMonster(player1, 0);
        const monster = game.monsters[0]!;
        game.kill(player1, monster, player1.inPlay[0]!);
        await game.resolveEntireStack();
        expect(game.monsters[0]).not.toBe(monster);
        expect(game.encounters.visible[0]?.slug).not.toBe(monster.card.slug);
    });
    
    it("start of the turn resolve after loot", async () => {

        const loot = game.obtainCard("b2-cains_eye") as LootCard;
        game.addCardToHand(player1, loot);
        game.playCard(player1, player1.hand.length - 1, []);
        await game.resolveStack();
        game.endTurn();
        await game.resolveEntireStack();
        const initcard = player1.hand.length;
        game.endTurn();
        await game.resolveStack();
        expect(player1.hand.length).toBe(initcard);
        const card = game.decks.loot.cards[0] as LootCard;
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            await new Promise(resolve => setTimeout(resolve, 0));
            return {selected: [], remaining: []};
        };
        expect(player1.hand._hand.map((c) => c.slug)).not.toContain(card.slug);
        await game.resolveStack();
        expect(player1.hand.length).toBe(initcard + 1);
        expect(player1.hand._hand.map((c) => c.slug)).toContain(card.slug);
    });

    it("Psy horf dies into gold chest order in stack", async () => {
        const psy = game.obtainCard("b2-psy_horf") as MonsterCard;
        const chest = game.obtainCard("b2-gold_chest") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, psy);
        game.decks.monster.addTopPosition(chest);

        game.declareAttack(player1);
        await game.declareAttackOnEntity(player1, game.monsters[0]!);
        game.kill(player1, game.monsters[0]!, player1.inPlay[0]!);
        await game.resolveStack(); // when this dies 
        expect(game.stack.size).toBe(1);
        await game.resolveStack(); // gold chest top deck
        expect(game.stack.size).toBe(1);
        await game.resolveStack(); // gold chest dice
        expect(game.stack.size).toBe(1);
        expect(game.stack.peek()).toBeInstanceOf(DiceRoll);
    });

    it("b2-keeper_head - Prevented damage should not steal coins.", async () => {
        const card = game.obtainCard("b2-keeper_head") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.addHealth(player1, 10); // Prevent death by damage

        game.monsterSlots.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.declareAttack(player1);
        await game.declareAttackOnEntity(player1, monster);
        const loot = game.obtainCard("b2-soul_heart") as LootCard;
        game.addCardToHand(player1, loot);
        game.playCard(player1, player1.hand.length - 1, [player1]);
        await game.resolveStack(); // damage
        game.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1;

        game.gainCoins(player1, 10, "gift"); // Give some coins to lose
        const init = player1.coins;
        await game.resolveStack(); // dice
        await game.resolveStack(); // damage
        expect(game.stack.size).toBe(0);
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(init);

    });
});