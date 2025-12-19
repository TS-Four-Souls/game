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
    });

    // it("compost - next loot comes from discard", () => {
    //     const compost = game.shop.obtainCard("b2-compost") as ItemCard;
    //     game.addInPlay(player1, compost);
        
    //     // Put some cards in discard
    //     const lootCard1 = game.decks["loot"]!.draw();
    //     const lootCard2 = game.decks["loot"]!.draw();
    //     game.decks["loot"]!.addDiscardTop(lootCard1!);
    //     game.decks["loot"]!.addDiscardTop(lootCard2!);
        
    //     const topDiscard = game.decks["loot"]!.discard[game.decks["loot"]!.discard.length - 1]!;
        
    //     // Recharge and activate compost (sets up listener)
    //     game.recharge(compost);
    //     game.activateItem(player1, compost);
        
    //     // Loot should come from discard (resolves the effect)
    //     game.loot(player1, 1);
        
    //     expect(player1.hand.cards).toContain(topDiscard);
    // });

    it("compost - does nothing if discard is empty", () => {
        const compost = game.shop.obtainCard("b2-compost") as ItemCard;
        game.addInPlay(player1, compost);
        
        const initialHandSize = player1.hand.length;
        
        // Recharge and activate compost
        game.recharge(compost);
        game.activateItem(player1, compost);
        game.resolveStack();
        
        // Loot from empty discard should still loot from deck
        game.loot(player1, 1);
        
        // Should still loot from deck if discard is empty
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("contract_from_below - destroy 2 items to steal non-eternal item", () => {
        const contractFromBelow = game.shop.obtainCard("b2-contract_from_below") as ItemCard;
        const item1 = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.shop.obtainCard("b2-dry_baby") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-book_of_sin") as ItemCard;
        
        game.addInPlay(player1, contractFromBelow);
        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        game.addInPlay(player2, targetItem);
        
        // Activate paid effect with 2 items to destroy and target item to steal
        game.activateItem(player1, contractFromBelow, [[item1, item2], [targetItem]], 0);
        game.resolveStack();
        
        // Two items should be destroyed
        expect(player1.inPlay).not.toContain(item1);
        expect(player1.inPlay).not.toContain(item2);
        expect(game.destroyedCards).toContain(item1);
        expect(game.destroyedCards).toContain(item2);
        
        // Target item should be stolen
        expect(player2.inPlay).not.toContain(targetItem);
        expect(player1.inPlay).toContain(targetItem);
    });

    it("decoy - swap with non-eternal item from another player", () => {
        const decoy = game.shop.obtainCard("b2-decoy") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        
        game.addInPlay(player1, decoy);
        game.addInPlay(player2, targetItem);
        
        // Recharge and activate decoy with target item
        game.recharge(decoy);
        game.activateItem(player1, decoy, [targetItem]);
        game.resolveStack();
        
        // Items should be swapped
        expect(player1.inPlay).not.toContain(decoy);
        expect(player1.inPlay).toContain(targetItem);
        expect(player2.inPlay).toContain(decoy);
        expect(player2.inPlay).not.toContain(targetItem);
    });

    it("donation_machine - give item to gain 8¢", () => {
        const donationMachine = game.shop.obtainCard("b2-donation_machine") as ItemCard;
        const itemToGive = game.shop.obtainCard("b2-blank_card") as ItemCard;
        
        game.addInPlay(player1, donationMachine);
        game.addInPlay(player1, itemToGive);
        
        const initialCoins = player1.coins;
        
        // Activate paid effect with item to give and player to give to
        game.activateItem(player1, donationMachine, [[itemToGive, player2],[]], 0);
        game.resolveStack();
        
        // Item should be given to player2
        expect(player1.inPlay).not.toContain(itemToGive);
        expect(player2.inPlay).toContain(itemToGive);
        
        // Player1 should gain 8¢
        expect(player1.coins).toBe(initialCoins + 8);
    });

    it("glass_cannon - roll 1-5 destroys this and loots 2", () => {
        const glassCannon = game.shop.obtainCard("b2-glass_cannon") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        
        game.addInPlay(player1, glassCannon);
        game.addInPlay(player1, targetItem);
        
        const initialHandSize = player1.hand.length;
        
        // Recharge and activate glass_cannon with target item
        game.recharge(glassCannon);
        game.activateItem(player1, glassCannon, [targetItem]);
        
        // Target item should be destroyed first (on stack)
        expect(game.stack.size).toBeGreaterThan(0);
        
        // Get the dice from the stack and set its value to 3 (1-5 range)
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        game.resolveStack(); // Resolve the dice roll
        game.resolveStack(); // Resolve destroy target item
        game.resolveStack(); // Resolve destroy glass cannon and loot 2
        
        // Target item should be destroyed
        expect(player1.inPlay).not.toContain(targetItem);
        expect(game.destroyedCards).toContain(targetItem);
        
        // Glass cannon should be destroyed and player loots 2
        expect(player1.inPlay).not.toContain(glassCannon);
        expect(game.destroyedCards).toContain(glassCannon);
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("glass_cannon - roll 6 recharges this", () => {
        const glassCannon = game.shop.obtainCard("b2-glass_cannon") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;
        
        game.addInPlay(player1, glassCannon);
        game.addInPlay(player1, targetItem);
        
        const initialHandSize = player1.hand.length;
        
        // Recharge and activate glass_cannon with target item
        game.recharge(glassCannon);
        game.activateItem(player1, glassCannon, [targetItem]);
        
        // Get the dice from the stack and set its value to 6
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        game.resolveStack(); // Resolve the dice roll
        game.resolveStack(); // Resolve destroy target item
        game.resolveStack(); // Resolve recharge glass cannon
        
        // Target item should be destroyed
        expect(player1.inPlay).not.toContain(targetItem);
        expect(game.destroyedCards).toContain(targetItem);
        
        // Glass cannon should remain and be recharged
        expect(player1.inPlay).toContain(glassCannon);
        expect(glassCannon.charged).toBe(true);
        expect(player1.hand.length).toBe(initialHandSize); // No loot
    });

    it("daddy_haunt - damage increased by 1", () => {
        const daddyHaunt = game.shop.obtainCard("b2-daddy_haunt") as ItemCard;
        game.addInPlay(player1, daddyHaunt);
        game.addHealth(player1, 10); // Heal player1 to full health
        
        const initialHp = player1.currentHealthPoints;
        
        // Deal 2 damage to player1
        game.dealDamage(player2, player1, daddyHaunt, 2);
        game.resolveStack();
        
        // Player should take 3 damage (2 + 1 from curse)
        expect(player1.currentHealthPoints).toBe(initialHp - 3);
    });

    it("daddy_haunt - single damage becomes 2", () => {
        const daddyHaunt = game.shop.obtainCard("b2-daddy_haunt") as ItemCard;
        game.addInPlay(player1, daddyHaunt);
        game.addHealth(player1, 10); // Heal player1 to full health

        const initialHp = player1.currentHealthPoints;
        
        // Deal 1 damage to player1
        game.dealDamage(player2, player1, daddyHaunt, 1);
        game.resolveStack();
        
        // Player should take 2 damage (1 + 1 from curse)
        expect(player1.currentHealthPoints).toBe(initialHp - 2);
    });

    it("baby_haunt - monsters have +1 DC on your turn", () => {
        const babyHaunt = game.shop.obtainCard("b2-baby_haunt") as ItemCard;
        const monster = game.monsters[0]!;
        const initDC = monster.evasion;
        expect(monster.evasion).toBe(initDC);
        game.addInPlay(player1, babyHaunt);
        expect(monster.evasion).toBe(initDC+1);
        game.endTurn();
        expect(monster.evasion).toBe(initDC);
        game.endTurn();
        expect(monster.evasion).toBe(initDC + 1);
        game.endTurn();
        expect(monster.evasion).toBe(initDC);
        game.endTurn();
        expect(monster.evasion).toBe(initDC + 1);
        game.removeInPlay(player1, babyHaunt);
        expect(monster.evasion).toBe(initDC);
    });

    it("boomerang - steal random loot card from another player", () => {
        const boomerang = game.shop.obtainCard("b2-boomerang") as ItemCard;
        game.addInPlay(player1, boomerang);
        
        // Give player2 some loot cards
        game.loot(player2, 3);
        const player2HandSize = player2.hand.length;
        const player1HandSize = player1.hand.length;
        
        // Recharge and activate boomerang targeting player2
        game.recharge(boomerang);
        game.activateItem(player1, boomerang, [player2]);
        game.resolveStack();
        
        // Player2 should have 1 less card, player1 should have 1 more
        expect(player2.hand.length).toBe(player2HandSize - 1);
        expect(player1.hand.length).toBe(player1HandSize + 1);
    });

    it("boomerang - does nothing if target has no loot cards", () => {
        const boomerang = game.shop.obtainCard("b2-boomerang") as ItemCard;
        game.addInPlay(player1, boomerang);
        
        // Make sure player2 has no cards
        while (player2.hand.length > 0) {
            game.discardFromHand(player2, 1);
        }
        
        const player1HandSize = player1.hand.length;
        
        // Recharge and activate boomerang targeting player2
        game.recharge(boomerang);
        game.activateItem(player1, boomerang, [player2]);
        game.resolveStack();
        
        // Nothing should change
        expect(player2.hand.length).toBe(0);
        expect(player1.hand.length).toBe(player1HandSize);
    });

    it("box - destroy to play unlimited loot cards", () => {
        const box = game.shop.obtainCard("b2-box") as ItemCard;
        game.addInPlay(player1, box);
        
        // Give player1 multiple loot cards
        const lootCard1 = game.decks["loot"]!.getCardFromSlug("b2-a_penny");
        const lootCard2 = game.decks["loot"]!.getCardFromSlug("b2-a_penny_2");
        const lootCard3 = game.decks["loot"]!.getCardFromSlug("b2-a_penny_3");
        player1.hand.addToHand(lootCard1!);
        player1.hand.addToHand(lootCard2!);
        player1.hand.addToHand(lootCard3!);
        
        const initialCoins = player1.coins;
        
        // Recharge and activate box
        game.recharge(box);
        game.activateItem(player1, box);
        game.resolveStack();
        
        // Box should be destroyed
        expect(player1.inPlay).not.toContain(box);
        expect(game.destroyedCards).toContain(box);
        
        // Play all 3 loot cards (normally can only play 1 per turn)
        game.playCard(player1, 1);
        game.resolveStack();
        game.playCard(player1, 1);
        game.resolveStack();
        game.playCard(player1, 1);
        game.resolveStack();
        
        // Player should have gained 3¢ (1 from each penny)
        expect(player1.coins).toBe(initialCoins + 3);
    });

    it("chaos - each player gives hand to left", () => {
        const chaos = game.shop.obtainCard("b2-chaos") as ItemCard;
        game.addInPlay(player1, chaos);
        
        // Give each player distinct cards
        const p1Card1 = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;
        const p1Card2 = game.decks["loot"]!.getCardFromSlug("b2-a_penny_2")!;
        const p2Card1 = game.decks["loot"]!.getCardFromSlug("b2-a_dime")!;
        
        player1.hand.addToHand(p1Card1!);
        player1.hand.addToHand(p1Card2!);
        player2.hand.addToHand(p2Card1!);
        
        // Recharge and activate chaos
        game.recharge(chaos);
        game.activateItem(player1, chaos);
        game.resolveStack();
        
        // Player1 should have player2's cards, player2 should have player1's cards
        expect(player1.hand.cards).toContain(p2Card1);
        expect(player1.hand.cards).not.toContain(p1Card1);
        expect(player1.hand.cards).not.toContain(p1Card2);
        expect(player2.hand.cards).toContain(p1Card1);
        expect(player2.hand.cards).toContain(p1Card2);
        expect(player2.hand.cards).not.toContain(p2Card1);
    });

    it("guppys_head - player gives you a loot card ", () => {
        const guppysHead = game.shop.obtainCard("b2-guppys_head") as ItemCard;
        game.addInPlay(player1, guppysHead);
        
        // Give player2 a loot card
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-a_penny");
        player2.hand.addToHand(lootCard!);
        
        const player1HandSize = player1.hand.length;
        const player2HandSize = player2.hand.length;
        
        // Mock game.select to return the loot card
        game.select = (issuer, n, opts, optional) => {
            return { selected: [opts[0]], remaining: [] };
        };
        
        // Recharge and activate guppys_head targeting player2
        game.recharge(guppysHead);
        game.activateItem(player1, guppysHead, [player2]);
        game.resolveStack();
        
        // Player2 should have given a card to player1
        expect(player2.hand.length).toBe(player2HandSize - 1);
        expect(player1.hand.length).toBe(player1HandSize + 1);
    });

    it("guppys_head - does nothing if target has no loot cards", () => {
        const guppysHead = game.shop.obtainCard("b2-guppys_head") as ItemCard;
        game.addInPlay(player1, guppysHead);
        
        // Make sure player2 has no cards
        while (player2.hand.length > 0) {
            game.discardFromHand(player2, 1);
        }
        
        const player1InitialHandSize = player1.hand.length;
        
        // Recharge and activate guppys_head targeting player2
        game.recharge(guppysHead);
        game.activateItem(player1, guppysHead, [player2]);
        game.resolveStack();
        
        // Player2 has no cards, so no card should be transferred
        expect(player2.hand.length).toBe(0);
        // Player1 should not gain any cards
        expect(player1.hand.length).toBe(player1InitialHandSize);
    });

    it("pandoras_box - roll 1 to gain 1¢", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const initialCoins = player1.coins;
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        // Get the dice from the stack and set value to 1
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        game.resolveStack(); // Resolve dice roll
        game.resolveStack(); // Resolve destroy pandoras box
        game.resolveStack(); // Resolve gain 1¢
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(game.destroyedCards).toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("pandoras_box - roll 2 to gain 6¢", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const initialCoins = player1.coins;
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        game.resolveStack();
        game.resolveStack();
        game.resolveStack();
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 6);
    });

    it("pandoras_box - roll 3 to kill a monster", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const monster = game.monsters[0];
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        dice.targets = [monster];
        game.resolveStack(); // Resolve dice
        game.resolveStack(); // Resolve destroy pandoras box
        game.resolveStack(); // Resolve kill monster
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(game.monsters).not.toContain(monster);
    });

    it("pandoras_box - roll 4 to loot 3", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const initialHandSize = player1.hand.length;
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        game.resolveStack();
        game.resolveStack();
        game.resolveStack();
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.hand.length).toBe(initialHandSize + 3);
    });

    it("pandoras_box - roll 5 to gain 9¢", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const initialCoins = player1.coins;
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        game.resolveStack();
        game.resolveStack();
        game.resolveStack();
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 9);
    });

    it("pandoras_box - roll 6 to become a soul", () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.addInPlay(player1, pandorasBox);
        
        const initialSouls = player1.souls.length;
        
        game.recharge(pandorasBox);
        game.activateItem(player1, pandorasBox);
        
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        game.resolveStack();
        game.resolveStack();
        
        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.souls.length).toBe(initialSouls + 1);
        expect(player1.souls).toContain(pandorasBox);
    });

    it("the_shovel - put non-event monster from discard on top of monster deck", () => {
        const theShovel = game.shop.obtainCard("b2-the_shovel") as ItemCard;
        game.addInPlay(player1, theShovel);
        
        // Put some monsters in discard
        const monster1 = game.decks["monster"]!.getCardFromSlug("b2-clotty") as MonsterCard;
        const monster2 = game.decks["monster"]!.getCardFromSlug("b2-big_spider") as MonsterCard;
        game.decks["monster"]!.addDiscardTop(monster1);
        game.decks["monster"]!.addDiscardTop(monster2);
        
        // Mock game.select to choose monster2
        game.select = (issuer, n, opts, optional) => {
            return { selected: [opts[0]], remaining: [] };
        };
        
        game.recharge(theShovel);
        game.activateItem(player1, theShovel);
        game.resolveStack();
        
        // monster2 should be on top of the deck
        expect(game.decks["monster"]!.cards[0]).toBe(monster2);
        expect(game.decks["monster"]!.discard).not.toContain(monster2);
    });

    it("the_d4 - destroy and reroll all items of chosen player", () => {
        const theD4 = game.shop.obtainCard("b2-the_d4") as ItemCard;
        const item1 = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.shop.obtainCard("b2-dry_baby") as ItemCard;
        const item3 = game.shop.obtainCard("b2-book_of_sin") as ItemCard;
        
        game.addInPlay(player1, theD4);
        // Give player1 some non-eternal items to reroll
        game.addInPlay(player1, item1);
        game.addInPlay(player1, item2);
        game.addInPlay(player1, item3);
        
        const initialItemCount = player1.inPlay.length - 1; // -1 for d4 itself
        
        game.recharge(theD4);
        game.activateItem(player1, theD4, [[], [player1]]);
        game.resolveStack(); // Resolve destroy d4
        game.resolveStack(); // Resolve reroll items
        
        // d4 should be destroyed
        expect(player1.inPlay).not.toContain(theD4);
        expect(game.destroyedCards).toContain(theD4);
        
        // player1's non-d4 items should be rerolled (destroyed and replaced)
        expect(player1.inPlay).not.toContain(item1);
        expect(player1.inPlay).not.toContain(item2);
        expect(player1.inPlay).not.toContain(item3);
        expect(game.destroyedCards).toContain(item1);
        expect(game.destroyedCards).toContain(item2);
        expect(game.destroyedCards).toContain(item3);
        expect(player1.inPlay.length).toBe(initialItemCount); // Same count but different items
    });

    it("lucky_foot - add up to 2 to a non-attack roll", () => {
        const luckyFoot = game.shop.obtainCard("b2-lucky_foot") as ItemCard;
        game.addInPlay(player1, luckyFoot);
        
        // Create a dice roll
        const dice = player1.rollDice();
        game.addToStack(dice);
        dice.value = 3;
        
        game.recharge(luckyFoot);
        game.activateItem(player1, luckyFoot, [dice, 2]);
        game.resolveStack();
        
        expect(dice.value).toBe(5);
    });

    it("mini_mush - subtract 2 from a roll", () => {
        const miniMush = game.shop.obtainCard("b2-mini_mush") as ItemCard;
        game.addInPlay(player1, miniMush);
        
        // Create a dice roll
        const dice = player1.rollDice();
        game.addToStack(dice);
        dice.value = 5;
        
        game.recharge(miniMush);
        game.activateItem(player1, miniMush, [dice, 2]);
        game.resolveStack();
        
        expect(dice.value).toBe(3);
    });

    it("mini_mush - subtract 1 from a roll", () => {
        const miniMush = game.shop.obtainCard("b2-mini_mush") as ItemCard;
        game.addInPlay(player1, miniMush);

        // Create a dice roll
        const dice = player1.rollDice();
        game.addToStack(dice);
        dice.value = 5;

        game.recharge(miniMush);
        game.activateItem(player1, miniMush, [dice, 1]);
        // game.resolveStack();

        expect(dice.value).toBe(4);
    });
});