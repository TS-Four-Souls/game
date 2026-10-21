import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { setTimeout } from "timers/promises";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";
import { AttackRollData, DiceRoll } from "@/models/stackElement";

async function characterAdd1LootPlay(player1: Player, game: Game) {
    // verify character card works.
    const lootPlay = player1.remainingLootPlay;
    game.cardHandler.recharge(player1.character as ItemCard);
    await game.activateItem(player1, player1.character!, [], "tap");
    await game.actions.resolveStack();
    await game.actions.resolveStack();
    expect(player1.remainingLootPlay).toBe(lootPlay + 1);
}
describe("Four Souls+2 Eternal Items", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let rs: () => Promise<void>;
    
    beforeEach(() => {
    });
    
    // it("rwz-edmund", async () => {
    //     const setup = await setupTestGame({
    //         characters: ["rwz-edmund", "b2-lilith"],
    //         monsters: ["b2-fly", "b2-fatty"],
    //         monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
    //         treasureDeck: ["b2-blank_card"],
    //         playerCount: 2
    //     });
    //     game = setup.game;
    //     player1 = setup.player1;
    //     player2 = setup.player2!;
        // const eternal = player1.inPlay[0]! as ItemCard;
        // game.cardHandler.recharge(eternal, "other");
    // });
    // "At the start of your turn each player loots 1.",
    // "[Tap Effect] Choose a player. They put a random loot card from their hand under this. Till end of turn, you may play that loot card without using a loot play.",
    // "At the end of your turn, recharge this."
    it("rwz-salad_fingers", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-salad_fingers", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
    });
    
    it("rwz-ash all lvl 1", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-ash", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.cardHandler.addToCounter(player1, eternal, "normal", -5);

        expect(player1.remainingLootPlay).toBe(10);
        game.cardHandler.loot(player1, 1);
        const card = player1.hand._hand[0] as LootCard;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player1.hand.cards.includes(card)).toBe(true);
    });

    it("rwz-ash all lvl 3", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-ash", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");

        expect(player1.remainingLootPlay).toBe(11);
        game.cardHandler.loot(player1, 1);
        game.cardHandler.addToCounter(player1, eternal, "normal", -3);
        const card = player1.hand._hand[0] as LootCard;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player1.hand.cards.includes(card)).toBe(true);
    });
    
    it("rwz-ash all effects", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-ash", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");

        expect(player1.remainingLootPlay).toBe(11);
        game.cardHandler.loot(player1, 1);
        const card = player1.hand._hand[0] as LootCard;
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
        expect(player1.hand.cards.includes(card)).toBe(false);
        game.gainCoins(player1, 1, "debug");
        game.gainTreasure(player1, 1);
        game.entityHandler.kill(player1, player1, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(2);
        expect(player1.coins).toBe(1);
        expect(player1.inPlay.length).toBe(2);
        expect(eternal.counters.getCounter("normal").value).toBe(5);
    });
    
    it("rwz-boyfriend your turn when double dice", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-boyfriend", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");

        game.random = () => 3/6-0.01;
        let dice = game.rollDice(player1, eternal);
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(0);
        game.random = () => 4/6-0.01;
        dice = game.rollDice(player1, eternal);
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, eternal, [dice, 1], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(dice.value).toBe(3);
        expect(eternal.counters.getCounter("normal").value).toBe(1);
    });
    
    it("rwz-boyfriend not your turn when double dice", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-boyfriend", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");

        game.cardHandler.addToCounter(player1, eternal, "normal", 11);
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(7);
        game.entityHandler.kill(player1, player1, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(6);
        await game.actions.resolveStack();
        game.random = () => 3/6-0.01;
        let dice = game.rollDice(player1, eternal);
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(6);
        game.random = () => 4/6-0.01;
        dice = game.rollDice(player1, eternal);
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, eternal, [dice, 1], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(dice.value).toBe(3);
        expect(eternal.counters.getCounter("normal").value).toBe(6);
    });
    
    it("rwz-the_knight 3 counter", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-the_knight", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        for(let i = 0; i < 3; i++) {
            const card = game.decks.loot.draw();
            card.soul = 1;
            game.cardHandler.addSoul(player1, card);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
        }
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        
        // "[LV1 Effect] You have +1 [ATK] for your first attack roll each turn.",
        game.random = () => 2/6-0.01;
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.attackRoll(player1);
        const initHP = game.monsters[0]!.currentHealthPoints;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(initHP - 2);

        // "[LV2 Effect] The first time you activate your character each round, recharge it.",
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.character.charged).toBe(true);
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.character.charged).toBe(false);
        // "[LV3 Effect] Prevent the first instance of damage you would take each turn."
        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("rwz-the_knight 2 counter", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-the_knight", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        for(let i = 0; i < 2; i++) {
            const card = game.decks.loot.draw();
            card.soul = 1;
            game.cardHandler.addSoul(player1, card);
            await game.actions.resolveStack();
        }
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        
        // "[LV1 Effect] You have +1 [ATK] for your first attack roll each turn.",
        game.random = () => 2/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.attackRoll(player1);
        const initHP = game.monsters[0]!.currentHealthPoints;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(initHP - 2);

        // "[LV2 Effect] The first time you activate your character each round, recharge it.",
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.character.charged).toBe(true);
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.character.charged).toBe(false);
        // "[LV3 Effect] Prevent the first instance of damage you would take each turn."
        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });
    
    it("rwz-the_knight 1 counter", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-the_knight", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        const card = game.decks.loot.draw();
        card.soul = 1;
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        game.cardHandler.addSoul(player1, card);
        
        // "[LV1 Effect] You have +1 [ATK] for your first attack roll each turn.",
        game.random = () => 2/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.attackRoll(player1);
        const initHP = game.monsters[0]!.currentHealthPoints;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(initHP - 2);

        // "[LV2 Effect] The first time you activate your character each round, recharge it.",
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.character.charged).toBe(false);
        // "[LV3 Effect] Prevent the first instance of damage you would take each turn."
        game.random = () => 1/6-0.01;
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(1);
    });
    
    it("rwz-quote add 3 to roll", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-quote", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        await game.activateItem(player1, player1.character, [eternal], "tap");
        await game.actions.resolveStack();
        game.random = () => 1/6-0.01;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.attackRoll(player1);
        const dice = game.stack.elements[0]! as DiceRoll;
        game.entityHandler.addDC(game.monsters[0]!, 5);
        game.cardHandler.addToCounter(player1, eternal, "normal", 5);
        await game.activateItem(player1, eternal, ["Remove any number of counters from this. Add 1 to a roll for each counter removed in this way.", 5, dice], "tap");
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(game.monsters[0]!.healthPoints - 1);
        expect(player1.currentHealthPoints).toBe(player1.healthPoints);
    });
    
    it("rwz-quote add 3 atk", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-quote", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.entityHandler.addHealth(game.monsters[0]!, 10);
        game.cardHandler.addToCounter(player1, eternal, "normal", 5);
        await game.activateItem(player1, eternal, ["Remove any number of counters from this. Gain +1 [ATK] for your next attack roll this turn for each counter removed this way.", 3], "tap");
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(2);
        game.random = () => 6/6-0.01;
        game.actions.declareAttack(player1);
        await game.actions.declareAttackOnEntity(player1, game.monsters[0]!);
        game.actions.attackRoll(player1);
        const initHP = game.monsters[0]!.currentHealthPoints;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(initHP - 4);
        game.actions.attackRoll(player1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(initHP - 5);
    });
    
    it("rwz-quote add counters", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-quote", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, eternal, ["Put a counter on this."], "tap");
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(1);
        await game.activateItem(player1, player1.character, [eternal], "tap");
        await game.actions.resolveStack();
        expect(eternal.charged).toBe(true);
        await game.activateItem(player1, eternal, ["Put a counter on this."], "tap");
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(2);
    });
    
    it("rwz-guy_spelunky", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-guy_spelunky", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        expect(eternal.counters.getCounter("normal").value).toBe(3);

        game.entityHandler.kill(player1, game.monsters[0]!, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(5);
        expect(player1.coins).toBe(1);

        // Choose one-\n+1 to your next roll\nGain 3¢\nPut a shop item into discard.
        await game.activateItem(player1, eternal, ["Gain 3¢"], 0);
        await game.actions.resolveStack();
        expect(player1.coins).toBe(4);

        await game.activateItem(player1, eternal, ["+1 to your next roll"], 0);
        await game.actions.resolveStack();
        game.random = () => 1/6-0.01;
        let dice = game.rollDice(player1, eternal);
        await game.actions.resolveStack();
        expect(dice.value).toBe(2);
        dice = game.rollDice(player1, eternal);
        await game.actions.resolveStack();
        expect(dice.value).toBe(1);

        const shopItem = game.shop.cardsOnTop[0]!;
        await game.activateItem(player1, eternal, ["Put a shop item into discard.", shopItem], 0);
        await game.actions.resolveStack();
        expect(game.shop.cardsOnTop[0]!).not.toBe(shopItem);

    });
    
    it("rwz-pink_knight their kill", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-pink_knight", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.monsters[0]!.card.json.rewards = {coin: 10}
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        game.entityHandler.kill(player2, game.monsters[0]!, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.coins).toBe(10);
        expect(player1.coins).toBe(5);
    });
    
    it("rwz-pink_knight my kill", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-pink_knight", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.monsters[0]!.card.json.rewards = {coin: 10}
        game.entityHandler.kill(player1, game.monsters[0]!, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(10);
        expect(player2.coins).toBe(10);
    });
    
    it("rwz-johnny", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.endTurn()
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(0);
        expect(player2.hand.length).toBe(2);
        await game.activateItem(player1, eternal, [player2], "tap");
        game.random = () => 1/6-0.01;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(0);
        expect(player2.inPlay.length).toBe(2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.length).toBe(1);
        expect(player2.hand.length).toBe(4);
        game.random = () => 6/6-0.01;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player2, eternal, [player1], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.inPlay.length).toBe(1);
        expect(player2.inPlay.length).toBe(1);
        expect(player2.hand.length).toBe(2);
        expect(player1.hand.length).toBe(3);
    });
    
    it("rwz-steven eternal", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-steven", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        
        game.entityHandler.kill(player2, player2, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(1);
        game.entityHandler.kill(player2, game.monsters[0]!, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.counters.getCounter("normal").value).toBe(2);
        game.cardHandler.addToCounter(player1, eternal, "normal", 9);
        expect(game.currentPlayer === player1).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.activateItem(player1, eternal, [], 0);
        await game.actions.resolveStack();
        expect(game.currentPlayer === player2).toBe(true);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(game.currentPlayer === player2).toBe(true);
        expect(eternal.counters.getCounter("normal").value).toBe(1);
    });
    
    it("rwz-steven", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-steven", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        expect(player1.remainingLootPlay).toBe(10);

        const card = game.decks.loot.draw();
        card.soul = 3;
        game.cardHandler.addSoul(player1, card);
        game.cardHandler.recharge(player1.character, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.remainingLootPlay).toBe(13);
    });
    
    it("rwz-blind_johnny eternal", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blind_johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, eternal, [player2], "tap");
        await game.actions.resolveStack()
        await game.actions.resolveStack()
        expect(player2.currentHealthPoints).toBe(1);
        game.entityHandler.kill(player2, player2, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(eternal.charged).toBe(true);
    });
    
    it("rwz-blind_johnny", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blind_johnny", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.loot(player2, 1, "other");
        const card = player2.hand.cards[0]!;
        await game.activateItem(player1, player1.character, [player2], "tap");
        await game.actions.resolveStack()
        expect( player1.hand.length).toBe(1);
        expect( player2.hand.length).toBe(0);
        expect(player1.hand.cards[0]! === card).toBe(true);
    });
    
    it("rwz-yung_venuz", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-yung_venuz", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;

        game.cardHandler.recharge(eternal, "other");
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        game.activateItem(player1, eternal, [game.stack.elements[0]!], "tap");
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(4);
    });
    
    it("rwz-the_silent", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-the_silent", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        await game.activateItem(player1, player1.character, [], "tap");
        expect(player1.character.charged).toBe(false);
        await game.actions.resolveStack();
        game.actions.declareAttack(player1);
        await game.actions.resolveStack();
        expect(player1.character.charged).toBe(true);
        expect(player1.hand.length).toBe(1);
    });
    
    it("rwz-psycho_goreman", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-psycho_goreman", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        expect(player1.currentHealthPoints).toBe(2);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);
        expect(player1.currentHealthPoints).toBe(3);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.currentHealthPoints).toBe(2);
    });
    
    it("rwz-captain_viridian", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-captain_viridian", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        const dice = game.rollDice(player1, eternal);
        const value = dice.value;
        await game.activateItem(player1, eternal, [dice], "tap");
        await game.actions.resolveStack();
        expect(dice.value).toBe(7 - value);
        await game.activateItem(player1, player1.character, [eternal], "tap");
        await game.actions.resolveStack();
        expect(eternal.charged).toBe(true);
    });
    
    it("rwz-blue_archer", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-blue_archer", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        const mob = game.monsters[0]!;
        const initDc = mob.evasion;
        await game.activateItem(player1, eternal, [mob], "tap");
        await game.actions.resolveStack();
        expect(mob.evasion).toBe(initDc - 1);
        game.entityHandler.kill(player1, mob, {card: eternal, visualEffectBox: null as any});
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.isEmpty()).toBe(true);
        expect(player1.coins).toBe(4);

    });
    
    it("rwz-edmund", async () => {
        const setup = await setupTestGame({
            characters: ["rwz-edmund", "b2-lilith"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 2
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const bs = game.obtainCard("b2-two_cents") as LootCard;
        const eternal = player1.inPlay[0]! as ItemCard;
        game.cardHandler.recharge(eternal, "other");
        game.cardHandler.addCardToHand(player1, bs);
        game.actions.playCard(player1, 0, []);
        await game.activateItem(player1, eternal, [game.stack.peek()!]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.coins).toBe(1);
    });

});

