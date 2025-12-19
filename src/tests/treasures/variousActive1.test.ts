import { describe, it, beforeEach, expect } from "bun:test";
import { Game } from "../../models/game";
import { DiceRoll, Player } from "../../models/player";
import { CharacterCard, ItemCard, treasureCard, MonsterCard } from "@/models/cards";
import { Monster } from "@/models/monster";
import type { ChooseOneResult } from "@/models/effectParser";

describe("Tap/Paid effects 1", () => {
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

    it("sack_of_pennies - tap to gain 1¢", () => {
        const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
        game.addInPlay(player1, sackOfPennies);

        const initialCoins = player1.coins;

        // Recharge and activate the item
        game.recharge(sackOfPennies);
        game.activateItem(player1, sackOfPennies);
        game.resolveStack();

        // Player should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("sack_head - look at top card and put it on bottom", () => {
        const sackHead = game.shop.obtainCard("b2-sack_head") as ItemCard;
        game.addInPlay(player1, sackHead);

        // Mock game.select to choose to put card on bottom
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [opts[0]], remaining: [] };
        };

        // Get the top card of the loot deck before activating
        const topCard = game.decks["loot"]!.cards[0];
        const deckSize = game.decks["loot"]!.cards.length;

        // Recharge and activate the item with deck name as target
        game.recharge(sackHead);
        game.activateItem(player1, sackHead, ["loot"]);
        game.resolveStack();

        // The top card should now be at the bottom
        expect(game.decks["loot"]!.cards[game.decks["loot"]!.cards.length - 1]).toBe(topCard);
        expect(game.decks["loot"]!.cards.length).toBe(deckSize);
    });

    it("sack_head - look at top card and keep it on top", () => {
        const sackHead = game.shop.obtainCard("b2-sack_head") as ItemCard;
        game.addInPlay(player1, sackHead);

        // Mock game.select to choose to keep card on top
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [], remaining: [opts[0]] };
        };

        // Get the top card of the loot deck before activating
        const topCard = game.decks["loot"]!.cards[0];

        // Recharge and activate the item with deck name as target
        game.recharge(sackHead);
        game.activateItem(player1, sackHead, ["loot"]);
        game.resolveStack();

        // The top card should still be on top
        expect(game.decks["loot"]!.cards[0]).toBe(topCard);
    });

    it("battery_bum - pay 4¢ to recharge an item", () => {
        const batteryBum = game.shop.obtainCard("b2-battery_bum") as ItemCard;
        const battery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        game.addInPlay(player1, batteryBum);
        game.addInPlay(player1, battery);

        // Recharge then deactivate the battery
        game.recharge(battery);
        game.activateItem(player1, battery);
        game.resolveStack();
        expect(battery.charged).toBe(false);

        // Give player enough coins
        game.gainCoins(player1, 10);
        const initialCoins = player1.coins;

        // Activate battery_bum (paid effect with effectId 0)
        game.activateItem(player1, batteryBum, [[], [battery]], 0);
        game.resolveStack();

        // Battery should be recharged and player should lose 4¢
        expect(battery.charged).toBe(true);
        expect(player1.coins).toBe(initialCoins - 4);
    });

    it("bum_friend - loot 1, then put a card on top of loot deck", () => {
        const bumFriend = game.shop.obtainCard("b2-bum_friend") as ItemCard;
        game.addInPlay(player1, bumFriend);

        const initialHandSize = player1.hand.length;
        const initialDeckSize = game.decks["loot"]!.cards.length;

        // Mock game.select to choose which card to put on top
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [opts[0]], remaining: [] };
        };

        // Recharge and activate the item
        game.recharge(bumFriend);
        game.activateItem(player1, bumFriend);
        game.resolveStack();

        // Player should have the same hand size (loot 1, then put 1 back)
        expect(player1.hand.length).toBe(initialHandSize);

        // Deck should have the same size
        expect(game.decks["loot"]!.cards.length).toBe(initialDeckSize);
    });

    it("flush - choose option 1: put monsters on bottom of monster deck", () => {
        const flush = game.shop.obtainCard("b2-flush") as ItemCard;
        game.addInPlay(player1, flush);

        // Get initial monsters
        const initialMonsters = [...game.monsters];
        const monstersCount = initialMonsters.length;

        // Recharge and activate the item with choose one result
        game.recharge(flush);
        const chooseOneTarget: ChooseOneResult = {
            description: "put each monster not being attacked on the bottom of the monster deck.",
            chosenOptions: []
        };
        game.activateItem(player1, flush, [chooseOneTarget]);
        game.resolveStack();

        // Monsters should be removed from slots and added to bottom of deck
        expect(game.monsters.every(m => !initialMonsters.includes(m))).toBe(true);
    });

    // Put each shop item on the bottom of the treasure deck.
    it("flush - choose option 2: put shop items on bottom of treasure deck", () => {
        const flush = game.shop.obtainCard("b2-flush") as ItemCard;
        game.addInPlay(player1, flush);

        // Get initial shop items count
        const initialShopItems = [...game.shop._slots];

        // Recharge and activate the item with choose one result
        game.recharge(flush);
        const chooseOneTarget: ChooseOneResult = {
            description: "put each shop item on the bottom of the treasure deck.",
            chosenOptions: []
        };
        game.activateItem(player1, flush, [chooseOneTarget]);
        game.resolveStack();

        // Shop should be empty
        const remainingShopItems = game.shop._slots.filter(slot => slot !== undefined).length;
        expect(game.shop._slots.every(s => !initialShopItems.includes(s))).toBe(true);

    });

    it("godhead - change dice roll to 1", () => {
        const godhead = game.shop.obtainCard("b2-godhead") as ItemCard;
        game.addInPlay(player1, godhead);

        // Create a dice roll
        const dice = player1.rollDice();
        dice.value = 3; // Set to some value
        game.addToStack(dice);

        // Mock game.select to choose 1
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [1], remaining: [] };
        };

        // Recharge and activate godhead with the dice as target
        game.recharge(godhead);
        game.activateItem(player1, godhead, [dice]);
        game.resolveStack();

        // Dice value should be changed to 1
        expect(dice.value).toBe(1);
    });

    it("godhead - change dice roll to 6", () => {
        const godhead = game.shop.obtainCard("b2-godhead") as ItemCard;
        game.addInPlay(player1, godhead);

        // Create a dice roll
        const dice = player2.rollDice();
        dice.value = 2; // Set to some value
        game.addToStack(dice);

        // Mock game.select to choose 6
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [6], remaining: [] };
        };

        // Recharge and activate godhead with the dice as target
        game.recharge(godhead);
        game.activateItem(player1, godhead, [dice]);
        game.resolveStack();

        // Dice value should be changed to 6
        expect(dice.value).toBe(6);
    });

    it("golden_razor_blade - pay 5¢ to deal 1 damage to a monster", () => {
        const goldenRazor = game.shop.obtainCard("b2-golden_razor_blade") as ItemCard;
        game.addInPlay(player1, goldenRazor);

        // Give player coins
        player1.gainCoins(10);
        const initialCoins = player1.coins;

        const monster = game.monsters[0]!;
        const initialMonsterHP = monster.currentHealthPoints;

        // Activate golden_razor_blade (paid effect with effectId 0) with monster as target
        game.activateItem(player1, goldenRazor, [[], [monster]], 0);
        game.resolveStack();

        // Monster should take 1 damage and player should lose 5¢
        expect(monster.currentHealthPoints).toBe(initialMonsterHP - 1);
        expect(player1.coins).toBe(initialCoins - 5);
    });

    it("golden_razor_blade - pay 5¢ to deal 1 damage to a player", () => {
        const goldenRazor = game.shop.obtainCard("b2-golden_razor_blade") as ItemCard;
        game.addInPlay(player1, goldenRazor);

        // Give player coins
        player1.gainCoins(10);
        const initialCoins = player1.coins;

        const initialHP = player2.currentHealthPoints;

        // Activate golden_razor_blade (paid effect with effectId 0) with player2 as target
        game.activateItem(player1, goldenRazor, [[],[player2]], 0);
        game.resolveStack();

        // Player2 should take 1 damage and player1 should lose 5¢
        expect(player2.currentHealthPoints).toBe(initialHP - 1);
        expect(player1.coins).toBe(initialCoins - 5);
    });

    it("jawbone - steal 3¢ from a player", () => {
        const jawbone = game.shop.obtainCard("b2-jawbone") as ItemCard;
        game.addInPlay(player1, jawbone);

        // Give player2 some coins
        player2.gainCoins(10);
        const initialCoinsP1 = player1.coins;
        const initialCoinsP2 = player2.coins;

        // Mock game.select to choose player2
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [opts.find((opt: any) => opt === player2)], remaining: [] };
        };

        // Recharge and activate the item
        game.recharge(jawbone);
        game.activateItem(player1, jawbone, [player2]);
        game.resolveStack();

        // Player1 should gain 3¢ and player2 should lose 3¢
        expect(player1.coins).toBe(initialCoinsP1 + 3);
        expect(player2.coins).toBe(initialCoinsP2 - 3);
    });

    it("jawbone - steal from player with less than 3¢", () => {
        const jawbone = game.shop.obtainCard("b2-jawbone") as ItemCard;
        game.addInPlay(player1, jawbone);

        // Give player2 only 2 coins
        player2.gainCoins(2);
        const initialCoinsP1 = player1.coins;
        const initialCoinsP2 = player2.coins;

        // Mock game.select to choose player2
        game.select = (_issuer, _n, opts, _optional) => {
            return { selected: [opts.find((opt: any) => opt === player2)], remaining: [] };
        };

        // Recharge and activate the item
        game.recharge(jawbone);
        game.activateItem(player1, jawbone, [player2]);
        game.resolveStack();

        // Player1 should gain 2¢ (all that player2 had) and player2 should have 0¢
        expect(player1.coins).toBe(initialCoinsP1 + 2);
        expect(player2.coins).toBe(0);
    });

    it("book_of_sin - roll 1-2 to gain 1¢", () => {
        const bookOfSin = game.shop.obtainCard("b2-book_of_sin") as ItemCard;
        game.addInPlay(player1, bookOfSin);

        const initialCoins = player1.coins;

        // Recharge and activate the item (creates and adds dice to stack)
        game.recharge(bookOfSin);
        game.activateItem(player1, bookOfSin);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain 1¢
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("book_of_sin - roll 3-4 to loot 1", () => {
        const bookOfSin = game.shop.obtainCard("b2-book_of_sin") as ItemCard;
        game.addInPlay(player1, bookOfSin);

        const initialHandSize = player1.hand.length;

        // Recharge and activate the item (creates and adds dice to stack)
        game.recharge(bookOfSin);
        game.activateItem(player1, bookOfSin);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        game.resolveStack(); // Resolve the dice roll

        // Player should loot 1
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("book_of_sin - roll 5-6 to gain +1 HP till end of turn", () => {
        const bookOfSin = game.shop.obtainCard("b2-book_of_sin") as ItemCard;
        game.addInPlay(player1, bookOfSin);

        const initialHp = player1.currentHealthPoints;

        // Recharge and activate the item (creates and adds dice to stack)
        game.recharge(bookOfSin);
        game.activateItem(player1, bookOfSin);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain +1 HP
        expect(player1.currentHealthPoints).toBe(initialHp + 1);
    });

    it("mr_boom - deal 1 damage to a monster", () => {
        const mrBoom = game.shop.obtainCard("b2-mr_boom") as ItemCard;
        game.addInPlay(player1, mrBoom);

        // Get a monster from the deck
        const monster = game.decks["monster"]!.getCardFromSlug("b2-clotty")! as MonsterCard;
        game.monsters[0] = new Monster(monster, game.encounters);
        const initialHp = game.monsters[0]!.currentHealthPoints;

        // Recharge and activate the item with the monster as target
        game.recharge(mrBoom);
        game.activateItem(player1, mrBoom, [game.monsters[0]]);
        game.resolveStack();

        // Monster should take 1 damage
        expect(game.monsters[0]!.currentHealthPoints).toBe(initialHp - 1);
    });

    it("mystery_sack - roll 1-2 to loot 1", () => {
        const mysterySack = game.shop.obtainCard("b2-mystery_sack") as ItemCard;
        game.addInPlay(player1, mysterySack);

        const initialHandSize = player1.hand.length;

        // Recharge and activate the item (creates and adds dice to stack)
        game.recharge(mysterySack);
        game.activateItem(player1, mysterySack);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        game.resolveStack(); // Resolve the dice roll

        // Player should loot 1
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("mystery_sack - roll 3-4 to gain 4¢", () => {
        const mysterySack = game.shop.obtainCard("b2-mystery_sack") as ItemCard;
        game.addInPlay(player1, mysterySack);

        const initialCoins = player1.coins;

        // Recharge and activate the item (creates and adds dice to stack)
        game.recharge(mysterySack);
        game.activateItem(player1, mysterySack);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain 4¢
        expect(player1.coins).toBe(initialCoins + 4);
    });

    // it("no - cancel another item's tap ability", () => {
    //     const no = game.shop.obtainCard("b2-no") as ItemCard;
    //     const sackOfPennies = game.shop.obtainCard("b2-sack_of_pennies") as ItemCard;
    //     game.addInPlay(player1, no);
    //     game.addInPlay(player2, sackOfPennies);

    //     const initialCoins = player2.coins;

    //     // Player2 activates sack_of_pennies
    //     game.recharge(sackOfPennies);
    //     game.activateItem(player2, sackOfPennies);

    //     // Player1 uses "no" to cancel it
    //     game.recharge(no);
    //     const stackElement = game.stack.elements[0];
    //     game.activateItem(player1, no, [stackElement]);
    //     game.resolveStack(); // Resolve "no"

    //     // sack_of_pennies effect should be cancelled, coins unchanged
    //     expect(player2.coins).toBe(initialCoins);
    //     expect(game.stack.size).toBe(0);

    //     // sack_of_pennies effect should be cancelled, coins unchanged
    //     expect(player2.coins).toBe(initialCoins);
    //     expect(game.stack.size).toBe(0);
    // });

    it("pay_to_play - pay 10¢ to steal non-eternal item", () => {
        const payToPlay = game.shop.obtainCard("b2-pay_to_play") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, payToPlay);
        game.addInPlay(player2, targetItem);

        // Give player1 enough coins
        player1.gainCoins(15);
        const initialCoins = player1.coins;

        // Activate pay_to_play (paid effect with effectId 0)
        game.activateItem(player1, payToPlay, [[],[targetItem]], 0);
        game.resolveStack();

        // Item should be stolen and player should lose 10¢
        expect(player1.coins).toBe(initialCoins - 10);
        expect(player2.inPlay).not.toContain(targetItem);
        expect(player1.inPlay).toContain(targetItem);
    });

    it("chaos_card - option 1: kill a player", () => {
        const chaosCard = game.shop.obtainCard("b2-chaos_card") as ItemCard;
        game.addInPlay(player1, chaosCard);

        // Give player2 enough HP to survive without dying
        player2.addHealthPoints(10);
        const initialHp = player2.currentHealthPoints;

        // Recharge and activate with choose one result to kill player2
        // Note: "destroy this. if you do, choose one-" requires two target arrays:
        // targets[0] for "destroy this" (empty) and targets[1] for "choose one" (must be array)
        game.recharge(chaosCard);
        const chooseOneTarget: ChooseOneResult = {
            description: "kill a player or monster.",
            chosenOptions: [player2]
        };
        game.activateItem(player1, chaosCard, [[], [chooseOneTarget]]);
        game.resolveStack();

        // chaos_card should be destroyed
        expect(player1.inPlay).not.toContain(chaosCard);
        expect(game.destroyedCards).toContain(chaosCard);

        // Player2 should be killed (HP set to 0 and death triggered)
        expect(player2.currentHealthPoints).toBe(0);
    });

    it("chaos_card - option 2: destroy an item", () => {
        const chaosCard = game.shop.obtainCard("b2-chaos_card") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, chaosCard);
        game.addInPlay(player2, targetItem);

        // Recharge and activate with choose one result to destroy item
        // Note: "destroy this. if you do, choose one-" requires two target arrays:
        // targets[0] for "destroy this" (empty) and targets[1] for "choose one" (must be array)
        game.recharge(chaosCard);
        const chooseOneTarget: ChooseOneResult = {
            description: "destroy an item or soul.",
            chosenOptions: [targetItem]
        };
        game.activateItem(player1, chaosCard, [[], [chooseOneTarget]]);
        game.resolveStack();

        // chaos_card should be destroyed
        expect(player1.inPlay).not.toContain(chaosCard);
        expect(game.destroyedCards).toContain(chaosCard);

        // Target item should be destroyed
        expect(player2.inPlay).not.toContain(targetItem);
        expect(game.destroyedCards).toContain(targetItem);
    });

    it("portable_slot_machine - roll 1-2 to loot 1", () => {
        const portableSlotMachine = game.shop.obtainCard("b2-portable_slot_machine") as ItemCard;
        game.addInPlay(player1, portableSlotMachine);

        // Give player1 enough coins
        player1.gainCoins(10);
        const initialCoins = player1.coins;
        const initialHandSize = player1.hand.length;

        // Activate paid effect (effectId 0)
        game.activateItem(player1, portableSlotMachine, [], 0);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        game.resolveStack(); // Resolve the dice roll

        // Player should lose 3¢ and loot 1
        expect(player1.coins).toBe(initialCoins - 3);
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("portable_slot_machine - roll 3-4 to gain 4¢", () => {
        const portableSlotMachine = game.shop.obtainCard("b2-portable_slot_machine") as ItemCard;
        game.addInPlay(player1, portableSlotMachine);

        // Give player1 enough coins
        player1.gainCoins(10);
        const initialCoins = player1.coins;

        // Activate paid effect (effectId 0)
        game.activateItem(player1, portableSlotMachine, [], 0);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        game.resolveStack(); // Resolve the dice roll

        // Player should lose 3¢ and gain 4¢ (net +1¢)
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("potato_peeler - put top card of each deck into discard", () => {
        const potatoPeeler = game.shop.obtainCard("b2-potato_peeler") as ItemCard;
        game.addInPlay(player1, potatoPeeler);

        // Get top cards before activation
        const topLoot = game.decks["loot"]!.cards[0]!;
        const topTreasure = game.decks["treasure"]!.cards[0]!;
        const topMonster = game.decks["monster"]!.cards[0]!;

        const lootDeckSize = game.decks["loot"]!.cards.length;
        const treasureDeckSize = game.decks["treasure"]!.cards.length;
        const monsterDeckSize = game.decks["monster"]!.cards.length;

        // Recharge and activate
        game.recharge(potatoPeeler);
        game.activateItem(player1, potatoPeeler);
        game.resolveStack();

        // Top cards should be in discard
        expect(game.decks["loot"]!.discard).toContain(topLoot);
        expect(game.decks["treasure"]!.discard).toContain(topTreasure);
        expect(game.decks["monster"]!.discard).toContain(topMonster);

        // Deck sizes should decrease by 1
        expect(game.decks["loot"]!.cards.length).toBe(lootDeckSize - 1);
        expect(game.decks["treasure"]!.cards.length).toBe(treasureDeckSize - 1);
        expect(game.decks["monster"]!.cards.length).toBe(monsterDeckSize - 1);
    });

    it("razor_blade - deal 1 damage to a player", () => {
        const razorBlade = game.shop.obtainCard("b2-razor_blade") as ItemCard;
        game.addInPlay(player1, razorBlade);

        player2.addHealthPoints(10);
        const initialHp = player2.currentHealthPoints;

        // Recharge and activate with player2 as target
        game.recharge(razorBlade);
        game.activateItem(player1, razorBlade, [player2]);
        game.resolveStack();

        // Player2 should take 1 damage
        expect(player2.currentHealthPoints).toBe(initialHp - 1);
    });

    it("smelter - discard loot card to gain 3¢", () => {
        const smelter = game.shop.obtainCard("b2-smelter") as ItemCard;
        game.addInPlay(player1, smelter);

        // Give player1 a loot card
        const lootCard = game.decks["loot"]!.cards[0]!;
        player1.hand.addToHand(lootCard);
        const initialHandSize = player1.hand.length;
        const initialCoins = player1.coins;

        // Activate paid effect (effectId 0) with loot card as target
        game.activateItem(player1, smelter, [lootCard], 0);
        game.resolveStack();

        // Player should gain 3¢ and hand size should decrease
        expect(player1.coins).toBe(initialCoins + 3);
        expect(player1.hand.length).toBe(initialHandSize - 1);
        expect(game.decks["loot"]!.discard).toContain(lootCard);
    });

    it("the_d100 - roll 1 to loot 1", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialHandSize = player1.hand.length;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        game.resolveStack(); // Resolve the dice roll

        // Player should loot 1
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("the_d100 - roll 2 to loot 2", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialHandSize = player1.hand.length;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        game.resolveStack(); // Resolve the dice roll

        // Player should loot 2
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("the_d100 - roll 3 to gain 3¢", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialCoins = player1.coins;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain 3¢
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("the_d100 - roll 4 to gain 4¢", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialCoins = player1.coins;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain 4¢
        expect(player1.coins).toBe(initialCoins + 4);
    });

    it("the_d100 - roll 5 to gain +1 HP till end of turn", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialHp = player1.currentHealthPoints;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain +1 HP
        expect(player1.currentHealthPoints).toBe(initialHp + 1);
    });

    it("the_d100 - roll 6 to gain +1 ATK till end of turn", () => {
        const theD100 = game.shop.obtainCard("b2-the_d100") as ItemCard;
        game.addInPlay(player1, theD100);

        const initialAtk = player1.attackPoints;

        // Recharge and activate
        game.recharge(theD100);
        game.activateItem(player1, theD100);

        // Get the dice from the stack and set its value
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        game.resolveStack(); // Resolve the dice roll

        // Player should gain +1 ATK
        expect(player1.attackPoints).toBe(initialAtk + 1);
    });

    it("the_battery - recharge another item", () => {
        const theBattery = game.shop.obtainCard("b2-the_battery") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, theBattery);
        game.addInPlay(player1, targetItem);

        // Discharge the target item
        targetItem.charged = false;

        // Recharge and activate the_battery with target item
        game.recharge(theBattery);
        game.activateItem(player1, theBattery, [targetItem]);
        game.resolveStack();

        // Target item should be recharged
        expect(targetItem.charged).toBe(true);
    });

    it("the_d20 - reroll an item (destroy and replace)", () => {
        const theD20 = game.shop.obtainCard("b2-the_d20") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.addInPlay(player1, theD20);
        game.addInPlay(player2, targetItem);

        // Get the top card of treasure deck (replacement card)
        const replacementCard = game.decks["treasure"]!.cards[0]!;

        // Recharge and activate the_d20 with target item (needs {player, card} format for reroll)
        game.recharge(theD20);
        game.activateItem(player1, theD20, [{ player: player2.id, card: targetItem }]);
        game.resolveStack();

        // Target item should be destroyed
        expect(player2.inPlay).not.toContain(targetItem);
        expect(game.destroyedCards).toContain(targetItem);

        // Replacement card should be in player2's play area
        expect(player2.inPlay).toContain(replacementCard);
    });

    it("spoon_bender - add 1 to a roll", () => {
        const spoonBender = game.shop.obtainCard("b2-spoon_bender") as ItemCard;
        game.addInPlay(player1, spoonBender);

        // Create a dice roll
        const dice = player1.rollDice();
        game.addToStack(dice);
        dice.value = 3;

        // Recharge and activate spoon_bender with dice as target
        game.recharge(spoonBender);
        game.activateItem(player1, spoonBender, [dice]);
        game.resolveStack();

        // Dice value should be increased by 1
        expect(dice.value).toBe(4);
    });

});