import type { Card, CharacterCard, ItemCard, LootCard } from "@/models/cards";
import { MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../models/entities/player";
import { Game } from "../models/game";
import { DamageOnStack, DiceRoll } from "../models/stackElement";
import { setupStandardTestGame } from "./testHelpers";
import { pl } from "zod/locales";

describe("Known bugs that have be corrected", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupStandardTestGame();
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });
    
    // it("", async () => {
    // });

    it("can not destroy an item in the discard.", async () => {
        const soul = game.decks.loot.draw();
        soul.soul = 1;
        game.cardHandler.addSoul(player1, soul);

        const cc = game.obtainCard("b2-chaos_card") as ItemCard;
        const d20 = game.obtainCard("b2-the_d20") as ItemCard;
        game.cardHandler.addInPlay(player1, cc);
        game.cardHandler.addInPlay(player1, d20);
        game.activateItem(player1, cc, ["Destroy an item or soul.", soul], "tap");
        game.activateItem(player1, d20, [cc], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.totalSouls).toBe(1);
    });
    it("playing question mark on chaos card should NOT destroy question mark.", async () => {
        const chaosCard = game.obtainCard("b2-chaos_card") as ItemCard;
        game.cardHandler.addInPlay(player1, chaosCard);
        const questionMark = game.obtainCard("fsp2-questionmark_card") as LootCard;
        game.cardHandler.addCardToHand(player1, questionMark);
        game.actions.playCard(player1, player1.hand.length - 1, [chaosCard]);
        await game.actions.resolveStack();
        expect(game.decks.loot.discard.map(c=>c.slug)).toContain(questionMark.slug);
    });
    it("Euthanasia only work for owner.", async () => {
        const card = game.obtainCard("fsp2-euthanasia") as ItemCard;
        game.cardHandler.addInPlay(player2, card);
        const mob = game.monsters[0]!;
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        game.actions.declareAttack(player1);
        game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.random = () => 0.99;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(mob.isDead).toBe(false);
        
        
    });
    it("Roll 6 on pandora's box de not leave it in discard.", async () => {
        const card = game.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, card);
        game.random = () => 0.99;
        await game.activateItem(player1, card, [], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.totalSouls).toBe(1);
        expect(game.decks.treasure.discard.length).toBe(0);

    });
    it("discard 1 loots on death", async () => {
        game.loot(player1, 10);
        const handSize = player1.hand.length;
        game.entityHandler.kill(player1, player1, player1.hand._hand[0] as Card);
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
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        game.entityHandler.dealDamage(player2, player1, loot, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 1);

        game.entityHandler.dealDamage(player2, player1, loot, 1);
        const dmgOnStck = game.stack.peek()! as DamageOnStack;
        dmgOnStck.damage = [0]; // modify damage to 0
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // resolve on damage taken
        expect(player1.coins).toBe(initialCoins + 1);
        expect(player1.currentHealthPoints).toBe(initialHealth - 1);
    });

    it("stealing does not remove card correctly", async () => {
        const payToPlay = game.shop.obtainCard("b2-pay_to_play") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-brimstone") as ItemCard;
        expect(player1.attackPoints).toBe(1);
        expect(player2.attackPoints).toBe(1);
        game.cardHandler.addInPlay(player2, payToPlay);
        game.cardHandler.addInPlay(player1, targetItem);
        expect(player1.attackPoints).toBe(2);
        expect(player2.attackPoints).toBe(1);

        // Give player2 enough coins
        player2.gainCoins(10);
        const initialCoins = player2.coins;

        // Activate pay_to_play (paid effect with effectId 0)
        await game.activateItem(player2, payToPlay, [targetItem], 0);
        await game.actions.resolveStack();

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

    it("donation machine can not give itself", async () => {
        const donationMachine = game.obtainCard("b2-donation_machine") as ItemCard;
        game.cardHandler.addInPlay(player1, donationMachine);
        player1.gainCoins(10);
        expect(donationMachine.targetStillValid(player1, 0, [donationMachine])).toBe(false);

        const mc = game.obtainCard("b2-modeling_clay") as ItemCard;
        game.cardHandler.addInPlay(player1, mc);
        game.cardHandler.recharge(mc);
        await game.activateItem(player1, mc, [donationMachine], "tap");
        await game.actions.resolveStack();
        expect(mc.targetStillValid(player1, 0, [donationMachine])).toBe(true);
        expect(mc.targetStillValid(player1, 0, [mc])).toBe(false);
        expect(donationMachine.targetStillValid(player1, 0, [mc])).toBe(true);
    });

    it("stealing bumbo keep counters but not effects", async () => {
        const bumbo = game.obtainCard("b2-bum_bo") as ItemCard;
        game.cardHandler.addInPlay(player1, bumbo);
        game.gainCoins(player1, 40, "gift");
        expect(bumbo.counters.value("normal") || 0).toBe(40);
        await game.actions.resolveStack(); // Resolve any stack effects
        await game.actions.resolveStack(); // Resolve any stack effects
        await game.actions.resolveStack(); // Resolve any stack effects
        expect(game.entityHandler.getAttack(player1)).toBe(2);
        expect(game.entityHandler.getAttack(player2)).toBe(1);
        expect(player1.coins).toBe(0);
        game.cardHandler.stealItemAnywhere(player2, bumbo);
        expect(player1.inPlay).not.toContain(bumbo);
        expect(player2.inPlay).toContain(bumbo);
        expect(bumbo.counters.value("normal") || 0).toBe(40);
        expect(game.entityHandler.getAttack(player1)).toBe(1);
        expect(game.entityHandler.getAttack(player2)).toBe(2);
    });


    it("curse removed on death", async () => {
        const pain = game.obtainCard("b2-curse_of_pain") as MonsterCard;
        const blank = game.obtainCard("b2-blank_card") as ItemCard;
        game.cardHandler.addInPlay(player1, blank); // to discard on death
        game.decks["monster"]?.addTopPosition(pain);

        game.encounters.draw(0);
        await game.actions.resolveStack();

        expect(player1.curses.length).toBe(1);
        expect(player1.curses[0]!.slug).toBe("b2-curse_of_pain");
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // end turn effect d6
        await game.actions.resolveStack(); // on turn start
        await game.actions.resolveStack(); // damage
        expect(game.currentPlayer).toBe(player1);
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(1);

        game.entityHandler.kill(player1, player1, pain);
        await game.actions.resolveStack(); // death on stack
        expect(player1.curses.length).toBe(0);

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // end turn effect d6
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(2);
    });

    it("curse removed on destruction (dagaz)", async () => {
        const pain = game.obtainCard("b2-curse_of_pain") as MonsterCard;
        const blank = game.obtainCard("b2-blank_card") as ItemCard;
        const dagaz = game.obtainCard("b2-dagaz") as LootCard;
        game.cardHandler.addInPlay(player1, blank); // to discard on death
        game.decks["monster"]?.addTopPosition(pain);

        game.encounters.draw(0);
        await game.actions.resolveStack();

        expect(player1.curses.length).toBe(1);
        expect(player1.curses[0]!.slug).toBe("b2-curse_of_pain");
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // end turn effect d6
        await game.actions.resolveStack(); // on turn start
        await game.actions.resolveStack(); // damage
        expect(game.currentPlayer.id).toBe(player1.id);
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(1);

        game.cardHandler.addCardToHand(player1, dagaz);
        game.actions.playCard(player1, player1.hand.length - 1, ["Destroy a curse.", pain]);
        await game.actions.resolveStack(); // death on stack
        expect(player1.curses.length).toBe(0);

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // end turn effect d6
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("remove something on top of a monster work", async () => {
        game.actions.declareAttack(player1);
        game.drawMonster(player1, 0);
        const monster = game.monsters[0]!;
        game.entityHandler.kill(player1, monster, player1.inPlay[0]!);
        await game.resolveEntireStack();
        expect(game.monsters[0]).not.toBe(monster);
        expect(game.encounters.visible[0]?.slug).not.toBe(monster.card.slug);
    });
    
    it("start of the turn resolve after loot", async () => {

        const loot = game.obtainCard("b2-cains_eye") as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.actions.playCard(player1, player1.hand.length - 1, []);
        await game.actions.resolveStack();
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.resolveEntireStack();
        const initcard = player1.hand.length;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initcard);
        const card = game.decks.loot.cards[0] as LootCard;
        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
            await new Promise(resolve => setTimeout(resolve, 0));
            return {selected: [], remaining: []};
        };
        expect(player1.hand._hand.map((c) => c.slug)).not.toContain(card.slug);
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(initcard + 1);
        expect(player1.hand._hand.map((c) => c.slug)).toContain(card.slug);
    });

    it("Psy horf dies into gold chest order in stack", async () => {
        const psy = game.obtainCard("b2-psy_horf") as MonsterCard;
        const chest = game.obtainCard("b2-gold_chest") as MonsterCard;
        game.encounters.forceSetMonsterAtSlot(0, psy);
        game.decks.monster.addTopPosition(chest);

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.entityHandler.kill(player1, game.monsters[0]!, player1.inPlay[0]!);
        await game.actions.resolveStack(); // when this dies 
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack(); // gold chest top deck
        expect(game.stack.size).toBe(1);
        await game.actions.resolveStack(); // gold chest dice
        expect(game.stack.size).toBe(1);
        expect(game.stack.peek()).toBeInstanceOf(DiceRoll);
    });

    it("b2-keeper_head - Prevented damage should not steal coins.", async () => {
        const card = game.obtainCard("b2-keeper_head") as MonsterCard;
        expect(card).toBeInstanceOf(MonsterCard);
        game.entityHandler.addHealth(player1, 10); // Prevent death by damage

        game.encounters.forceSetMonsterAtSlot(0, card);
        const monster = game.monsters[0]!;

        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, monster);
        const loot = game.obtainCard("b2-soul_heart") as LootCard;
        game.cardHandler.addCardToHand(player1, loot);
        game.actions.playCard(player1, player1.hand.length - 1, [player1]);
        await game.actions.resolveStack(); // damage
        game.actions.attackRoll(player1);
        const dice = game.stack._stack[0] as DiceRoll;
        expect(dice).toBeInstanceOf(DiceRoll);
        dice.value = 1;

        game.gainCoins(player1, 10, "gift"); // Give some coins to lose
        const init = player1.coins;
        await game.actions.resolveStack(); // dice
        await game.actions.resolveStack(); // damage
        expect(game.stack.size).toBe(0);
        
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(init);

    });
});