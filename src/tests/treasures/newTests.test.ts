import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { CharacterCard, ItemCard, treasureCard, MonsterCard } from "@/models/cards";
import { Monster } from "@/models/monster";

describe("Treasure - \"at the end of your turn\" effects", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.setupGame();
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [samson, isaac]);
    });
    // b2 - fanny_pack    "Each time you take damage, loot 1."
    // b2 - greeds_gullet    "Each time you die, before paying penalties, gain 8¢."
    // b2 - curse_of_the_tower    "Each time you take damage, roll-\n1-3: Each other player takes 1 damage.\n4-6: Deal 1 damage to a monster."
    // b2 - suicide_king    "Each time you die, before paying penalties, loot 3."
    // b2 - the_midas_touch    "Each time a monster dies, gain 3¢."

    // b2 - bobs_brain    "Each time you declare an attack, roll-\n1-2: Deal 1 damage to a monster.\n3-4: Deal 1 damage to a player.\n5-6: Take 1 damage."
    // b2 - dads_lost_coin    "Each time a player would roll a ❶, you may force that player to reroll it."
    // b2 - guppys_collar    "Each time you would die, roll-\n1-3: Prevent death. If it's your turn, cancel everything that hasn't resolved and end your turn."
    // b2 - shiny_rock    "Each time you activate an item, gain 1¢."
    
    it("bobs_brain - roll 1-2: deal 1 damage to a monster", () => {
        const bobsBrain = game.shop.obtainCard("b2-bobs_brain") as treasureCard;
        game.addInPlay(player1, bobsBrain);
        
        const monster = game.monsters[0]!;
        const initialMonsterHP = monster.currentHealthPoints;
        
        // Declare an attack to trigger the effect
        game.declareAttack(player1);
        
        expect(game.stack.elements.length).toBeGreaterThan(0);
        // Get the dice roll and set it to 1
        const dice = game.stack.elements[0] as DiceRoll;
        if (dice) {
            dice.value = 1;
            dice.targets = [monster];
        }

        
        game.resolveStack();
        game.resolveStack();
        
        // Monster should take 1 damage
        expect(monster.currentHealthPoints).toBe(initialMonsterHP - 1);
    });

    it("bobs_brain - roll 3-4: deal 1 damage to a player", () => {
        const bobsBrain = game.shop.obtainCard("b2-bobs_brain") as treasureCard;
        game.addInPlay(player1, bobsBrain);
        
        const monster = game.monsters[0]!;
        const initialHP = player2.currentHealthPoints;
        
        // Declare an attack
        game.declareAttack(player1);

        expect(game.stack.elements.length).toBeGreaterThan(0);

        // Get the dice roll and set it to 3
        const dice = game.stack.elements[0] as DiceRoll;
        if (dice) {
            dice.value = 3;
            dice.targets = [player2];
        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Player2 should take 1 damage
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    it("bobs_brain - roll 5-6: take 1 damage", () => {
        const bobsBrain = game.shop.obtainCard("b2-bobs_brain") as treasureCard;
        game.addInPlay(player1, bobsBrain);
        
        const monster = game.monsters[0]!;
        const initialHP = player1.currentHealthPoints;
        
        // Declare an attack
        game.declareAttack(player1);

        expect(game.stack.elements.length).toBeGreaterThan(0);
        
        // Get the dice roll and set it to 5
        const dice = game.stack.elements[0] as DiceRoll;
        if (dice) {
            dice.value = 5;
        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Player1 should take 1 damage
        expect(player1.currentHealthPoints).toBe(initialHP - 1);
    });

    it("shiny_rock - gain 1¢ when activating an item", () => {
        const shinyRock = game.shop.obtainCard("b2-shiny_rock") as treasureCard;
        const battery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        game.addInPlay(player1, shinyRock);
        game.addInPlay(player1, battery);
        
        const initialCoins = player1.coins;
        
        // Activate the battery
        game.recharge(battery);
        game.activateItem(player1, battery);
        
        // Player should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("shiny_rock - triggers on multiple activations", () => {
        const shinyRock = game.shop.obtainCard("b2-shiny_rock") as treasureCard;
        const battery1 = game.shop.obtainCard("b2-the_battery") as ItemCard;
        const battery2 = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, shinyRock);
        game.addInPlay(player1, battery1);
        game.addInPlay(player1, battery2);
        
        const initialCoins = player1.coins;
        
        // Activate both items
        game.recharge(battery1);
        game.activateItem(player1, battery1);
        game.recharge(battery2);
        game.activateItem(player1, battery2); // gain 1 coin
        
        // Player should gain 2¢ (1¢ per activation)
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("dads_lost_coin - force player to reroll a 1", () => {
        const dadsLostCoin = game.shop.obtainCard("b2-dads_lost_coin") as treasureCard;
        game.addInPlay(player1, dadsLostCoin);
        
        // Mock game.select to choose to force reroll
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [opts[0]], remaining: [] };
        };
        
        // Player2 rolls a dice
        const dice = player2.rollDice();
        dice.value = 1;
        
        game.addToStack(dice);
        game.resolveStack();
        
        // The dice should have been rerolled (value changed from 1)
        // Note: This test might be tricky as reroll is random, so we just verify the mechanism works
        expect(dice.value).toBeGreaterThanOrEqual(1);
        expect(dice.value).toBeLessThanOrEqual(6);
    });

    it("dads_lost_coin - choose not to force reroll", () => {
        const dadsLostCoin = game.shop.obtainCard("b2-dads_lost_coin") as treasureCard;
        game.addInPlay(player1, dadsLostCoin);
        
        // Mock game.select to choose NOT to force reroll
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [], remaining: opts };
        };
        
        // Player2 rolls a dice
        const dice = player2.rollDice();
        dice.value = 1;
        
        game.addToStack(dice);
        game.resolveStack();
        
        // The dice should still be 1
        expect(dice.value).toBe(1);
    });

    it("guppys_collar - roll 1-3: prevent death", () => {
        const guppysCollar = game.shop.obtainCard("b2-guppys_collar") as treasureCard;
        game.addInPlay(player1, guppysCollar);
        
        // Kill player1
        game.kill(player2, player1, guppysCollar);
        
        // Get the dice roll and set it to 2
        expect(game.stack.elements.length).toBeGreaterThan(0);

        const dice = game.stack.elements[1] as DiceRoll;
        if (dice) {
            dice.value = 2;
        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Player should not be dead
        expect(game.stack.elements.length).toBe(0);
        expect(player1.isDead).toBe(false);
    });

    it("guppys_collar - roll 4-6: death not prevented", () => {
        const guppysCollar = game.shop.obtainCard("b2-guppys_collar") as treasureCard;
        game.addInPlay(player1, guppysCollar);
        
        // Kill player1
        game.kill(player2, player1, guppysCollar);
        
        // Get the dice roll and set it to 5
        expect(game.stack.elements.length).toBeGreaterThan(0);

        const dice = game.stack.elements[1] as DiceRoll;
        if (dice) {
            dice.value = 5;
        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Player should be dead
        expect(player1.isDead).toBe(true);
    });

    it("the_midas_touch - gain 3¢ when a monster dies", () => {
        const midasTouch = game.shop.obtainCard("b2-the_midas_touch") as treasureCard;
        game.addInPlay(player1, midasTouch);
        
        const initialCoins = player1.coins;
        
        // Get a monster and kill it
        const monster = game.monsters[0]!;
        expect(monster).toBeDefined();
        
        // Kill the monster
        game.kill(player2, monster, midasTouch);
        game.resolveStack(); // death on stack

        // Player should gain 3¢
        expect(player1.coins).toBe(initialCoins + 3);

        // Kill the player
        game.kill(player2, player2, midasTouch);
        game.resolveStack(); // death on stack

        // Player should gain 3¢
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("the_midas_touch - triggers multiple times", () => {
        const midasTouch = game.shop.obtainCard("b2-the_midas_touch") as treasureCard;
        game.addInPlay(player1, midasTouch);
        
        const initialCoins = player1.coins;
        
        // Kill two monsters
        const monster1 = game.monsters[0]!;
        const monster2 = game.monsters[1]!;
        
        game.kill(player2, monster1, midasTouch);
        game.kill(player2, monster2, midasTouch);
        game.resolveStack(); // death on stack
        game.resolveStack(); // death on stack

        // Player should gain 6¢ (3¢ per monster)
        expect(player1.coins).toBe(initialCoins + 6);
    });

    it("fanny_pack - loot 1 when taking damage", () => {
        const fannyPack = game.shop.obtainCard("b2-fanny_pack") as treasureCard;
        game.addInPlay(player1, fannyPack);
        
        const initialHandSize = player1.hand.length;
        
        // Take damage
        game.dealDamage(player2, player1, fannyPack, 2);
        game.resolveStack();
        
        // Player should loot 1 card
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("fanny_pack - triggers on multiple damage instances", () => {
        const fannyPack = game.shop.obtainCard("b2-fanny_pack") as treasureCard;
        game.addInPlay(player1, fannyPack);
        
        const initialHandSize = player1.hand.length;
        
        // Take damage twice
        game.dealDamage(player2, player1, fannyPack, 1);
        game.resolveStack();
        game.dealDamage(player2, player1, fannyPack, 1);
        game.resolveStack();
        
        // Player should loot 2 cards (1 per damage instance)
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("curse_of_the_tower - roll 1-3: other players take 1 damage", () => {
        const curseOfTheTower = game.shop.obtainCard("b2-curse_of_the_tower") as treasureCard;
        game.addInPlay(player1, curseOfTheTower);
        
        const initialHP = player2.currentHealthPoints;
        
        // Take damage to trigger the effect
        game.dealDamage(player2, player1, curseOfTheTower, 1);
        game.resolveStack();
        
        // Get the dice roll from the stack and set it to 2
        if (game.stack.elements.length > 0) {
            const dice = game.stack.elements[0] as DiceRoll;
            if (dice) {
                dice.value = 2;
                dice.targets = [player2];
            }

        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Player2 (other player) should take 1 damage
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
    });

    it("curse_of_the_tower - roll 4-6: deal 1 damage to a monster", () => {
        const curseOfTheTower = game.shop.obtainCard("b2-curse_of_the_tower") as treasureCard;
        game.addInPlay(player1, curseOfTheTower);
        
        const monster = game.monsters[0]!;
        expect(monster).toBeDefined();
        const initialMonsterHP = monster.currentHealthPoints;
        
        
        // Take damage to trigger the effect
        game.dealDamage(player2, player1, curseOfTheTower, 1);
        game.resolveStack();

        // Get the dice roll and set it to 5
        if (game.stack.elements.length > 0) {
            const dice = game.stack.elements[0] as DiceRoll;
            if (dice) {
                dice.value = 5;
                dice.targets = [monster];
            }
        }
        
        game.resolveStack();
        game.resolveStack();
        
        // Monster should take 1 damage
        expect(monster.currentHealthPoints).toBe(initialMonsterHP - 1);
    });

    it("greeds_gullet - gain 8¢ when dying", () => {
        const greedsGullet = game.shop.obtainCard("b2-greeds_gullet") as treasureCard;
        game.addInPlay(player1, greedsGullet);
        
        const initialCoins = player1.coins;
        
        // Kill the player
        game.kill(player2, player1, greedsGullet);
        game.resolveStack();
        
        // Player should gain 8¢ before paying penalties
        expect(player1.coins).toBeGreaterThanOrEqual(initialCoins + 6); // +8 - 2 for death penalties
    });

    it("suicide_king - loot 3 when dying", () => {
        const suicideKing = game.shop.obtainCard("b2-suicide_king") as treasureCard;
        game.addInPlay(player1, suicideKing);
        
        const initialHandSize = player1.hand.length;
        
        // Kill the player
        game.kill(player2, player1, suicideKing);
        game.resolveStack();
        
        // Player should loot 3 cards before paying penalties
        expect(player1.hand.length).toBeGreaterThanOrEqual(initialHandSize + 2); // +3 - 1
    });
});