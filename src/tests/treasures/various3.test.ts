import { CharacterCard, ItemCard, MonsterCard, TreasureCard } from "@/models/cards";
import { setupTestGame } from "@/tests/testHelpers";
import { beforeEach, describe, expect, it } from "bun:test";
import { Player } from "../../models/entities/player";
import { Game } from "../../models/game";
import { DiceRoll } from "../../models/stackElement";

describe("Tap/Paid effects 1", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card", "b2-boomerang", "b2-guppys_head", "b2-tech_x", "b2-the_battery", "b2-lucky_foot", "b2-mini_mush", "b2-spoon_bender"],
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
    });

    it("sack_of_pennies - tap to gain 1¢", async () => {
    });

    it("compost - next loot comes from discard", async () => {
        const compost = game.shop.obtainCard("b2-compost") as ItemCard;
        game.cardHandler.addInPlay(player1, compost);

        // Put some cards in discard
        const lootCard1 = game.decks["loot"]!.draw();
        const lootCard2 = game.decks["loot"]!.draw();
        game.decks["loot"]!.addDiscardTop(lootCard1!);
        game.decks["loot"]!.addDiscardTop(lootCard2!);

        const topDiscard = game.decks["loot"]!.discard[0]!;

        // Recharge and activate compost (sets up listener)
        game.cardHandler.recharge(compost);
        await game.activateItem(player1, compost, [player1]);
        await game.actions.resolveStack();

        // Loot should come from discard (resolves the effect)
        game.loot(player1, 1);

        expect(player1.hand.cards).toContain(topDiscard);

        const topDiscard2 = game.decks["loot"]!.discard[0]!;
        expect(topDiscard).not.toBe(topDiscard2);

        game.loot(player1, 1);

        expect(player1.hand.cards).not.toContain(topDiscard2);
    });

    it("compost - does nothing if discard is empty", async () => {
        const compost = game.shop.obtainCard("b2-compost") as ItemCard;
        game.cardHandler.addInPlay(player1, compost);

        const initialHandSize = player1.hand.length;

        // Recharge and activate compost
        game.cardHandler.recharge(compost);
        await game.activateItem(player1, compost);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Loot from empty discard should still loot from deck
        game.loot(player1, 1);

        // Should still loot from deck if discard is empty
        expect(player1.hand.length).toBe(initialHandSize + 1);
    });

    it("contract_from_below - destroy 2 items to steal non-eternal item", async () => {
        const contractFromBelow = game.shop.obtainCard("b2-contract_from_below") as ItemCard;
        const item1 = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.shop.obtainCard("b2-dry_baby") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-book_of_sin") as ItemCard;

        game.cardHandler.addInPlay(player1, contractFromBelow);
        game.cardHandler.addInPlay(player1, item1);
        game.cardHandler.addInPlay(player1, item2);
        game.cardHandler.addInPlay(player2, targetItem);

        // Activate paid effect with 2 items to destroy and target item to steal
        await game.activateItem(player1, contractFromBelow, [item1, item2, targetItem], 0);
        await game.actions.resolveStack();

        // Two items should be destroyed
        expect(player1.inPlay).not.toContain(item1);
        expect(player1.inPlay).not.toContain(item2);
        expect(game.decks.treasure.discard).toContain(item1);
        expect(game.decks.treasure.discard).toContain(item2);

        // Target item should be stolen
        expect(player2.inPlay).not.toContain(targetItem);
        expect(player1.inPlay).toContain(targetItem);
    });

    it("decoy - swap with non-eternal item from another player", async () => {
        const decoy = game.shop.obtainCard("b2-decoy") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;

        game.cardHandler.addInPlay(player1, decoy);
        game.cardHandler.addInPlay(player2, targetItem);

        // Recharge and activate decoy with target item
        game.cardHandler.recharge(decoy);
        await game.activateItem(player1, decoy, [targetItem]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Items should be swapped
        expect(player1.inPlay).not.toContain(decoy);
        expect(player1.inPlay).toContain(targetItem);
        expect(player2.inPlay).toContain(decoy);
        expect(player2.inPlay).not.toContain(targetItem);
    });

    it("donation_machine - give item to gain 8¢", async () => {
        const donationMachine = game.shop.obtainCard("b2-donation_machine") as ItemCard;
        const itemToGive = game.shop.obtainCard("b2-blank_card") as ItemCard;

        game.cardHandler.addInPlay(player1, donationMachine);
        game.cardHandler.addInPlay(player1, itemToGive);

        const initialCoins = player1.coins;

        // Activate paid effect with item to give and player to give to
        await game.activateItem(player1, donationMachine, [itemToGive, player2], 0);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Item should be given to player2
        expect(player1.inPlay).not.toContain(itemToGive);
        expect(player2.inPlay).toContain(itemToGive);

        // Player1 should gain 8¢
        expect(player1.coins).toBe(initialCoins + 8);
    });

    it("glass_cannon - roll 1-5 destroys this and loots 2", async () => {
        const glassCannon = game.shop.obtainCard("b2-glass_cannon") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;

        game.cardHandler.addInPlay(player1, glassCannon);
        game.cardHandler.addInPlay(player1, targetItem);

        const initialHandSize = player1.hand.length;

        // Recharge and activate glass_cannon with target item
        game.cardHandler.recharge(glassCannon);
        await game.activateItem(player1, glassCannon, [targetItem]);
        await game.actions.resolveStack();

        // Target item should be destroyed first (on stack)
        expect(game.stack.size).toBeGreaterThan(0);

        // Get the dice from the stack and set its value to 3 (1-5 range)
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        await game.actions.resolveStack(); // Resolve the dice roll
        await game.actions.resolveStack(); // Resolve destroy target item
        await game.actions.resolveStack(); // Resolve destroy glass cannon and loot 2

        // Target item should be destroyed
        expect(player1.inPlay).not.toContain(targetItem);
        expect(game.decks.treasure.discard).toContain(targetItem);

        // Glass cannon should be destroyed and player loots 2
        expect(player1.inPlay).not.toContain(glassCannon);
        expect(game.decks.treasure.discard).toContain(glassCannon);
        expect(player1.hand.length).toBe(initialHandSize + 2);
    });

    it("glass_cannon - roll 6 recharges this", async () => {
        const glassCannon = game.shop.obtainCard("b2-glass_cannon") as ItemCard;
        const targetItem = game.shop.obtainCard("b2-blank_card") as ItemCard;

        game.cardHandler.addInPlay(player1, glassCannon);
        game.cardHandler.addInPlay(player1, targetItem);

        const initialHandSize = player1.hand.length;

        // Recharge and activate glass_cannon with target item
        game.cardHandler.recharge(glassCannon);
        await game.activateItem(player1, glassCannon, [targetItem]);
        await game.actions.resolveStack();

        // Get the dice from the stack and set its value to 6
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        await game.actions.resolveStack(); // Resolve the dice roll
        await game.actions.resolveStack(); // Resolve destroy target item
        await game.actions.resolveStack(); // Resolve recharge glass cannon

        // Target item should be destroyed
        expect(player1.inPlay).not.toContain(targetItem);
        expect(game.decks.treasure.discard).toContain(targetItem);

        // Glass cannon should remain and be recharged
        expect(player1.inPlay).toContain(glassCannon);
        expect(glassCannon.charged).toBe(true);
        expect(player1.hand.length).toBe(initialHandSize); // No loot
    });

    it("daddy_haunt - damage increased by 1", async () => {
        const daddyHaunt = game.shop.obtainCard("b2-daddy_haunt") as ItemCard;
        game.cardHandler.addInPlay(player1, daddyHaunt);
        game.entityHandler.addHealth(player1, 10); // Heal player1 to full health

        const initialHp = player1.currentHealthPoints;

        // Deal 2 damage to player1
        game.entityHandler.dealDamage(player2, player1, daddyHaunt, 2);
        await game.actions.resolveStack();

        // Player should take 3 damage (2 + 1 from curse)
        expect(player1.currentHealthPoints).toBe(initialHp - 3);
    });

    it("daddy_haunt - single damage becomes 2", async () => {
        const daddyHaunt = game.shop.obtainCard("b2-daddy_haunt") as ItemCard;
        game.cardHandler.addInPlay(player1, daddyHaunt);
        game.entityHandler.addHealth(player1, 10); // Heal player1 to full health

        const initialHp = player1.currentHealthPoints;

        // Deal 1 damage to player1
        game.entityHandler.dealDamage(player2, player1, daddyHaunt, 1);
        await game.actions.resolveStack();

        // Player should take 2 damage (1 + 1 from curse)
        expect(player1.currentHealthPoints).toBe(initialHp - 2);
    });

    it("baby_haunt - monsters have +1 DC on your turn", async () => {
        const babyHaunt = game.shop.obtainCard("b2-baby_haunt") as ItemCard;
        const monster = game.monsters[0]!;
        const initDC = monster.evasion;
        expect(monster.evasion).toBe(initDC);
        game.cardHandler.addInPlay(player1, babyHaunt);
        expect(monster.evasion).toBe(initDC + 1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.evasion).toBe(initDC);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.evasion).toBe(initDC + 1);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.evasion).toBe(initDC);
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(monster.evasion).toBe(initDC + 1);
        game.cardHandler.removeInPlay(player1, babyHaunt);
        expect(monster.evasion).toBe(initDC);
    });

    it("boomerang - steal random loot card from another player", async () => {
        const boomerang = game.shop.obtainCard("b2-boomerang") as ItemCard;
        game.cardHandler.addInPlay(player1, boomerang);

        // Give player2 some loot cards
        game.loot(player2, 3);
        const player2HandSize = player2.hand.length;
        const player1HandSize = player1.hand.length;

        // Recharge and activate boomerang targeting player2
        game.cardHandler.recharge(boomerang);
        await game.activateItem(player1, boomerang, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player2 should have 1 less card, player1 should have 1 more
        expect(player2.hand.length).toBe(player2HandSize - 1);
        expect(player1.hand.length).toBe(player1HandSize + 1);
    });

    it("boomerang - does nothing if target has no loot cards", async () => {
        const boomerang = game.shop.obtainCard("b2-boomerang") as ItemCard;
        game.cardHandler.addInPlay(player1, boomerang);

        // Make sure player2 has no cards
        while (player2.hand.length > 0) {
            game.cardHandler.discardFromHandAtIndex(player2, 0);
        }

        const player1HandSize = player1.hand.length;

        // Recharge and activate boomerang targeting player2
        game.cardHandler.recharge(boomerang);
        await game.activateItem(player1, boomerang, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Nothing should change
        expect(player2.hand.length).toBe(0);
        expect(player1.hand.length).toBe(player1HandSize);
    });

    it("box - destroy to play unlimited loot cards", async () => {
        const box = game.shop.obtainCard("b2-box") as ItemCard;
        game.cardHandler.addInPlay(player1, box);

        // Give player1 multiple loot cards
        const lootCard1 = game.decks["loot"]!.getCardFromSlug("b2-a_penny");
        const lootCard2 = game.decks["loot"]!.getCardFromSlug("b2-a_penny_2");
        const lootCard3 = game.decks["loot"]!.getCardFromSlug("b2-a_dime");
        player1.hand.addToHand(lootCard1!);
        player1.hand.addToHand(lootCard2!);
        player1.hand.addToHand(lootCard3!);

        const initialCoins = player1.coins;

        // Recharge and activate box
        game.cardHandler.recharge(box);
        await game.activateItem(player1, box);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Box should be destroyed
        expect(player1.inPlay).not.toContain(box);
        expect(game.decks.treasure.discard).toContain(box);

        // Play all 3 loot cards (normally can only play 1 per turn)
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();
        game.actions.playCard(player1, 0);
        await game.actions.resolveStack();

        // Player should have gained 12¢ (2 pennies, 1 dime)
        expect(player1.coins).toBe(initialCoins + 12);
    });

    it("chaos - each player gives hand to left", async () => {
        const chaos = game.shop.obtainCard("b2-chaos") as ItemCard;
        game.cardHandler.addInPlay(player1, chaos);

        // Give each player distinct cards
        const p1Card1 = game.decks["loot"]!.getCardFromSlug("b2-a_penny")!;
        const p1Card2 = game.decks["loot"]!.getCardFromSlug("b2-a_penny_2")!;
        const p2Card1 = game.decks["loot"]!.getCardFromSlug("b2-a_dime")!;

        player1.hand.addToHand(p1Card1!);
        player1.hand.addToHand(p1Card2!);
        player2.hand.addToHand(p2Card1!);

        // Recharge and activate chaos
        game.cardHandler.recharge(chaos);
        await game.activateItem(player1, chaos);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player1 should have player2's cards, player2 should have player1's cards
        expect(player1.hand.cards).toContain(p2Card1);
        expect(player1.hand.cards).not.toContain(p1Card1);
        expect(player1.hand.cards).not.toContain(p1Card2);
        expect(player2.hand.cards).toContain(p1Card1);
        expect(player2.hand.cards).toContain(p1Card2);
        expect(player2.hand.cards).not.toContain(p2Card1);
    });

    it("guppys_head - player gives you a loot card ", async () => {
        const guppysHead = game.shop.obtainCard("b2-guppys_head") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysHead);

        // Give player2 a loot card
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-a_penny");
        player2.hand.addToHand(lootCard!);

        const player1HandSize = player1.hand.length;
        const player2HandSize = player2.hand.length;

        // Mock game.select to return the loot card
        game.select = async (issuer, _min, _max, opts, optional) => {
            return { selected: [opts[0]], remaining: [] } as any;
        };

        // Recharge and activate guppys_head targeting player2
        game.cardHandler.recharge(guppysHead);
        await game.activateItem(player1, guppysHead, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player2 should have given a card to player1
        expect(player2.hand.length).toBe(player2HandSize - 1);
        expect(player1.hand.length).toBe(player1HandSize + 1);
    });

    it("guppys_head - does nothing if target has no loot cards", async () => {
        const guppysHead = game.shop.obtainCard("b2-guppys_head") as ItemCard;
        game.cardHandler.addInPlay(player1, guppysHead);

        // Make sure player2 has no cards
        while (player2.hand.length > 0) {
            game.cardHandler.discardFromHandAtIndex(player2, 0);
        }

        const player1InitialHandSize = player1.hand.length;

        // Recharge and activate guppys_head targeting player2
        game.cardHandler.recharge(guppysHead);
        await game.activateItem(player1, guppysHead, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player2 has no cards, so no card should be transferred
        expect(player2.hand.length).toBe(0);
        // Player1 should not gain any cards
        expect(player1.hand.length).toBe(player1InitialHandSize);
    });

    it("pandoras_box - roll 1 to gain 1¢", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const initialCoins = player1.coins;

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        // Get the dice from the stack and set value to 1
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 1;
        await game.actions.resolveStack(); // Resolve dice roll
        await game.actions.resolveStack(); // Resolve destroy pandoras box
        await game.actions.resolveStack(); // Resolve gain 1¢

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(game.decks.treasure.discard).toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 1);
    });

    it("pandoras_box - roll 2 to gain 6¢", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const initialCoins = player1.coins;

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 6);
    });

    it("pandoras_box - roll 3 to kill a monster", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const monster = game.monsters[0];

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 3;
        await game.actions.resolveStack(); // Resolve dice
        await game.actions.resolveStack(); // Resolve destroy pandoras box
        await game.actions.resolveStack(); // Resolve kill monster

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(game.monsters).not.toContain(monster);
    });

    it("pandoras_box - roll 4 to loot 3", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const initialHandSize = player1.hand.length;

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 4;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.hand.length).toBe(initialHandSize + 3);
    });

    it("pandoras_box - roll 5 to gain 9¢", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const initialCoins = player1.coins;

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5;
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.coins).toBe(initialCoins + 9);
    });

    it("pandoras_box - roll 6 to become a soul", async () => {
        const pandorasBox = game.shop.obtainCard("b2-pandoras_box") as ItemCard;
        game.cardHandler.addInPlay(player1, pandorasBox);

        const initialSouls = player1.souls.length;

        game.cardHandler.recharge(pandorasBox);
        await game.activateItem(player1, pandorasBox);
        await game.actions.resolveStack();

        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 6;
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.inPlay).not.toContain(pandorasBox);
        expect(player1.souls.length).toBe(initialSouls + 1);
        expect(player1.souls).toContain(pandorasBox);
    });

    it("the_shovel - put non-event monster from discard on top of monster deck", async () => {
        const theShovel = game.shop.obtainCard("b2-the_shovel") as ItemCard;
        game.cardHandler.addInPlay(player1, theShovel);

        // Put some monsters in discard
        const monster1 = game.obtainCard("b2-clotty") as MonsterCard;
        const monster2 = game.obtainCard("b2-fatty") as MonsterCard;
        game.decks["monster"]!.addDiscardTop(monster1);
        game.decks["monster"]!.addDiscardTop(monster2);

        // Mock game.select to choose monster2
        game.select = async (issuer, _min, _max, opts, optional) => {
            return { selected: [opts[0]], remaining: [] }as any;
        };

        game.cardHandler.recharge(theShovel);
        await game.activateItem(player1, theShovel);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // monster2 should be on top of the deck
        expect(game.decks["monster"]!.cards[0]).toBe(monster2);
        expect(game.decks["monster"]!.discard).not.toContain(monster2);
    });

    it("the_d4 - destroy and reroll all items of chosen player", async () => {
        const theD4 = game.shop.obtainCard("b2-the_d4") as ItemCard;
        const item1 = game.shop.obtainCard("b2-blank_card") as ItemCard;
        const item2 = game.shop.obtainCard("b2-dry_baby") as ItemCard;
        const item3 = game.shop.obtainCard("b2-book_of_sin") as ItemCard;

        game.cardHandler.addInPlay(player1, theD4);
        // Give player1 some non-eternal items to reroll
        game.cardHandler.addInPlay(player1, item1);
        game.cardHandler.addInPlay(player1, item2);
        game.cardHandler.addInPlay(player1, item3);

        const initialItemCount = player1.inPlay.length - 1; // -1 for d4 itself

        game.cardHandler.recharge(theD4);
        await game.activateItem(player1, theD4, [player1]);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // Resolve destroy d4
        await game.actions.resolveStack(); // Resolve reroll items

        // d4 should be destroyed
        expect(player1.inPlay).not.toContain(theD4);
        expect(game.decks.treasure.discard).toContain(theD4);

        // player1's non-d4 items should be rerolled (destroyed and replaced)
        expect(player1.inPlay).not.toContain(item1);
        expect(player1.inPlay).not.toContain(item2);
        expect(player1.inPlay).not.toContain(item3);
        expect(game.decks.treasure.discard).toContain(item1);
        expect(game.decks.treasure.discard).toContain(item2);
        expect(game.decks.treasure.discard).toContain(item3);
        if(player1.inPlay.length !== initialItemCount) {
            console.log("Expected item count:", initialItemCount);
            console.log("Actual item count:", player1.inPlay.length);
            console.log("In play cards:", player1.inPlay.map(c => c.slug));
        }
        expect(player1.inPlay.length).toBe(initialItemCount); // Same count but different items
    });

    it("lucky_foot - add up to 2 to a non-attack roll", async () => {
        const luckyFoot = game.shop.obtainCard("b2-lucky_foot") as ItemCard;
        game.cardHandler.addInPlay(player1, luckyFoot);

        // Create a dice roll
        const dice = player1.rollDice(Math.random, false, luckyFoot);
        game.addToStack(dice);
        dice.value = 3;

        game.cardHandler.recharge(luckyFoot);
        await game.activateItem(player1, luckyFoot, [dice, 2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(dice.value).toBe(5);
    });

    it("lucky_foot - add up to 2 to a non-attack roll should not work for attack rolls", async () => {
        const luckyFoot = game.shop.obtainCard("b2-lucky_foot") as ItemCard;
        game.cardHandler.addInPlay(player1, luckyFoot);

        // Create a dice roll
        const dice = player1.rollDice(Math.random, true, luckyFoot);
        game.addToStack(dice);
        dice.value = 3;

        game.cardHandler.recharge(luckyFoot);
        expect( game.activateItem(player1, luckyFoot, [dice, 2]) ).rejects.toThrowError("Targets are not valid for this effect.");
    });

    it("mini_mush - subtract 2 from a roll", async () => {
        const miniMush = game.shop.obtainCard("b2-mini_mush") as ItemCard;
        game.cardHandler.addInPlay(player1, miniMush);

        // Create a dice roll
        const dice = player1.rollDice(Math.random, false, miniMush);
        game.addToStack(dice);
        dice.value = 5;

        game.cardHandler.recharge(miniMush);
        await game.activateItem(player1, miniMush, [dice, 2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(dice.value).toBe(3);
    });

    it("mini_mush - subtract 1 from a roll", async () => {
        const miniMush = game.shop.obtainCard("b2-mini_mush") as ItemCard;
        game.cardHandler.addInPlay(player1, miniMush);

        // Create a dice roll
        const dice = player1.rollDice(Math.random, false, miniMush);
        game.addToStack(dice);
        dice.value = 5;

        game.cardHandler.recharge(miniMush);
        await game.activateItem(player1, miniMush, [dice, 1]);
        await game.actions.resolveStack();
        // await game.actions.resolveStack();

        expect(dice.value).toBe(4);
    });

    it("moms_shovel - destroy to steal a soul from another player", async () => {
        const momsShovel = game.shop.obtainCard("b2-moms_shovel") as ItemCard;
        const soul = game.shop.obtainCard("b2-blank_card") as ItemCard;
        soul.soul = 1;

        game.cardHandler.addInPlay(player1, momsShovel);
        game.cardHandler.addSoul(player2, soul);

        const player1InitialSouls = player1.souls.length;
        const player2InitialSouls = player2.souls.length;

        // Mock game.select to choose the soul
        game.select = async (issuer, _min, _max, opts, optional) => {
            return { selected: [soul], remaining: [] }as any;
        };

        game.cardHandler.recharge(momsShovel);
        await game.activateItem(player1, momsShovel);
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // Resolve destroy moms_shovel
        await game.actions.resolveStack(); // Resolve steal soul

        // moms_shovel should be destroyed
        expect(player1.inPlay).not.toContain(momsShovel);
        expect(game.decks.treasure.discard).toContain(momsShovel);


        // Soul should be stolen
        expect(player1.souls.length).toBe(player1InitialSouls + 1);
        expect(player2.souls.length).toBe(player2InitialSouls - 1);
        expect(player1.souls).toContain(soul);
        expect(player2.souls).not.toContain(soul);
    });

    it("moms_bra - reduce monster damage to 1", async () => {
        const momsBra = game.shop.obtainCard("b2-moms_bra") as ItemCard;
        game.cardHandler.addInPlay(player1, momsBra);

        const monster = game.monsters[0]!;
        const initialHp = monster.currentHealthPoints;

        // Mock game.select to choose the monster
        game.select = async (issuer, _min, _max, opts, optional) => {
            return { selected: [monster], remaining: [] } as any;
        };

        game.cardHandler.recharge(momsBra);
        await game.activateItem(player1, momsBra, [monster]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Deal 5 damage to monster - should be reduced to 1
        game.entityHandler.dealDamage(player1, monster, momsBra, 5);
        await game.actions.resolveStack();

        expect(monster.currentHealthPoints).toBe(initialHp - 1);
    });

    it("moms_bra - reduce player damage to 1", async () => {
        const momsBra = game.shop.obtainCard("b2-moms_bra") as ItemCard;
        game.cardHandler.addInPlay(player1, momsBra);

        player2.addHealthPoints(10);
        const initialHp = player2.currentHealthPoints;

        game.cardHandler.recharge(momsBra);
        await game.activateItem(player1, momsBra, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Deal 5 damage to player2 - should be reduced to 1
        game.entityHandler.dealDamage(player1, player2, momsBra, 5);
        await game.actions.resolveStack();

        expect(player2.currentHealthPoints).toBe(initialHp - 1);
    });

    it("two_of_clubs - double loot for chosen player", async () => {
        const twoOfClubs = game.shop.obtainCard("b2-two_of_clubs") as ItemCard;
        game.cardHandler.addInPlay(player1, twoOfClubs);

        const initialHandSize = player2.hand.length;

        game.cardHandler.recharge(twoOfClubs);
        await game.activateItem(player1, twoOfClubs, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Player2 loots 2, should get 4 cards instead
        game.loot(player2, 2);

        expect(player2.hand.length).toBe(initialHandSize + 4);
    });

    it("two_of_clubs - effect ends at end of turn", async () => {
        const twoOfClubs = game.shop.obtainCard("b2-two_of_clubs") as ItemCard;
        game.cardHandler.addInPlay(player1, twoOfClubs);

        game.cardHandler.recharge(twoOfClubs);
        await game.activateItem(player1, twoOfClubs, [player2]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Loot during turn - doubled
        const handSizeAfterActivation = player2.hand.length;
        game.loot(player2, 1);
        expect(player2.hand.length).toBe(handSizeAfterActivation + 2);

        // End turn to clear temporary effects
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Loot after turn - not doubled
        const handSizeAfterTurn = player2.hand.length;
        game.loot(player2, 1);
        expect(player2.hand.length).toBe(handSizeAfterTurn + 1);
    });

    // TODO: These tests require further investigation - the card effects may not be fully implemented yet
    // crystal_ball, blank_card, and host_hat seem to have issues with their passive effects

    it("crystal_ball - correct guess loots 3", async () => {
        const crystalBall = game.shop.obtainCard("b2-crystal_ball") as ItemCard;
        game.cardHandler.addInPlay(player1, crystalBall);

        const initialHandSize = player1.hand.length;

        // // Mock game.select to choose number 4
        // game.select = (issuer, n, opts, optional) => {
        //     return { selected: [4], remaining: [] };
        // };

        game.cardHandler.recharge(crystalBall);
        await game.activateItem(player1, crystalBall, [4]);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Roll a 4 - should loot 3
        const dice = player1.rollDice(Math.random, false, crystalBall);
        dice.value = 4;
        game.addToStack(dice);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.hand.length).toBe(initialHandSize + 3);
    });

    it("crystal_ball - wrong guess does not loot", async () => {
        const crystalBall = game.shop.obtainCard("b2-crystal_ball") as ItemCard;
        game.cardHandler.addInPlay(player1, crystalBall);

        const initialHandSize = player1.hand.length;

        // Mock game.select to choose number 4
        game.select = async (issuer, _min, _max, opts, optional) => {
            return { selected: [4], remaining: [] } as any;
        };

        game.cardHandler.recharge(crystalBall);
        await game.activateItem(player1, crystalBall);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Roll a 5 (not 4) - should not loot
        const dice = player1.rollDice(Math.random, false, crystalBall);
        dice.value = 5;
        game.addToStack(dice);
        await game.actions.resolveStack();

        expect(player1.hand.length).toBe(initialHandSize);
    });

    it("blank_card - copies next loot card played", async () => {
        const blankCard = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.cardHandler.addInPlay(player1, blankCard);

        // Give player1 a loot card to play
        const lootCard = game.decks["loot"]!.getCardFromSlug("b2-a_penny");
        player1.hand.addToHand(lootCard!);

        const initialCoins = player1.coins;
        const lootCardIndex = player1.hand.cards.indexOf(lootCard!);

        game.cardHandler.recharge(blankCard);
        await game.activateItem(player1, blankCard);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Play a penny - effect should be copied (gain 1¢ twice)
        game.actions.playCard(player1, lootCardIndex);
        expect(game.stack.size).toBe(2); // Copy should be on stack
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(player1.coins).toBe(initialCoins + 2); // 1 from original + 1 from copy
    });

    it("blank_card - does not copy trinkets", async () => {
        const blankCard = game.shop.obtainCard("b2-blank_card") as ItemCard;
        game.cardHandler.addInPlay(player1, blankCard);

        // Give player1 a trinket to play
        const trinket = game.decks["loot"]!.getCardFromSlug("b2-broken_ankh")!;
        player1.hand.addToHand(trinket!);

        const trinketIndex = player1.hand.cards.indexOf(trinket!);

        game.cardHandler.recharge(blankCard);
        await game.activateItem(player1, blankCard);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Play trinket - should not be copied
        player1.playLootCard(trinketIndex);
        await game.actions.resolveStack();

        expect(player1.inPlay).toContain(trinket);
        // No additional effect from blank_card
    });

    it("host_hat - prevent 1 damage and deal 1 to another player", async () => {
        const hostHat = game.shop.obtainCard("b2-host_hat") as ItemCard;
        game.cardHandler.addInPlay(player1, hostHat);

        player1.addHealthPoints(10);
        player2.addHealthPoints(10);
        const player1InitialHp = player1.currentHealthPoints;
        const player2InitialHp = player2.currentHealthPoints;

        game.cardHandler.recharge(hostHat);
        await game.activateItem(player1, hostHat);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Deal 3 damage to player1 - should prevent 1 and deal 1 to player2
        game.entityHandler.dealDamage(player1, player1, hostHat, 3);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // Resolve any stack effects

        expect(player1.currentHealthPoints).toBe(player1InitialHp - 2); // Prevented 1 of 3
        expect(player2.currentHealthPoints).toBe(player2InitialHp - 1); // Took 1 damage
    });

    it("host_hat - only works once per turn", async () => {
        const hostHat = game.shop.obtainCard("b2-host_hat") as ItemCard;
        game.cardHandler.addInPlay(player1, hostHat);

        player1.addHealthPoints(10);
        player2.addHealthPoints(10);

        game.cardHandler.recharge(hostHat);
        await game.activateItem(player1, hostHat);
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        const player1HpAfterActivation = player1.currentHealthPoints;
        const player2HpAfterActivation = player2.currentHealthPoints;

        // First damage - prevented
        game.entityHandler.dealDamage(player1, player1, hostHat, 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack(); // Resolve any stack effects

        expect(player1.currentHealthPoints).toBe(player1HpAfterActivation - 1);
        expect(player2.currentHealthPoints).toBe(player2HpAfterActivation - 1);

        const player1HpAfterFirstDamage = player1.currentHealthPoints;
        const player2HpAfterFirstDamage = player2.currentHealthPoints;

        // Second damage - not prevented (already used)
        game.entityHandler.dealDamage(player1, player1, hostHat, 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.stack.size).toBe(0);
        expect(player1.currentHealthPoints).toBe(player1HpAfterFirstDamage - 2);
        expect(player2.currentHealthPoints).toBe(player2HpAfterFirstDamage); // No additional damage
    });
});


interface DetailedState {
    me: {
        name: string;
        hand: any[];
        inPlay: any[];
        souls: any[];
        coins: number;
        currentAttackPoints: number;
        currentHealthPoints: number;
        remainingLootPlay: number;
    };
    players: any[];
    topDiscards: any;
    monsters: any[];
    shop: any[];
    turn: string;
    stack: any[];
    firstCardTreasureDeck?: any;
}

describe("b2-theres_options treasure deck visibility", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;
    let samson: CharacterCard;
    let isaac: CharacterCard;
    let the_forgotten: CharacterCard;

    beforeEach(async () => {
        const setup = await setupTestGame({
            characters: ["b2-samson", "b2-isaac", "b2-the_forgotten"],
            monsters: ["b2-fly", "b2-fatty"],
            monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
            treasureDeck: ["b2-blank_card"],
            playerCount: 3
        });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        player3 = setup.player3!;
    });

    it("player can see top of treasure deck during their turn", async () => {

        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Get the state for player1 during their turn
        const state = game.detailedStateJSON(player1);

        // Should have firstCardTreasureDeck property
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();
        expect(state.treasure.firstCardTreasureDeck).not.toBeUndefined();
    });

    it("player cannot see top of treasure deck when not their turn", async () => {
        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // End player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        // Now it's player2's turn
        expect(game.currentPlayer).toBe(player2);

        // Get the state for player1 during player2's turn
        const state = game.detailedStateJSON(player1);

        // Should NOT have firstCardTreasureDeck property
        expect(state.treasure.firstCardTreasureDeck).toBeUndefined();
    });

    it("other players cannot see top of treasure deck even when someone has the item", async () => {
        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Get the state for player2 during player1's turn
        const state = game.detailedStateJSON(player2);

        // Player2 should NOT see firstCardTreasureDeck
        expect(state.treasure.firstCardTreasureDeck).toBeUndefined();
    });

    it("visibility updates when turn changes", async () => {
        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Player1's turn - should see deck
        let state = game.detailedStateJSON(player1);
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();

        // End turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(game.currentPlayer).toBe(player2);

        // Player2's turn - player1 should NOT see deck
        state = game.detailedStateJSON(player1);
        expect(state.treasure.firstCardTreasureDeck).toBeUndefined();

        // End player2's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();

        expect(game.currentPlayer).toBe(player3);

        // End player3's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1)

        // Back to player1's turn - should see deck again
        state = game.detailedStateJSON(player1);
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();
    });

    it("removing the item removes visibility", async () => {
        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Player can see deck
        let state = game.detailedStateJSON(player1);
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();

        // Remove the item
        game.cardHandler.removeInPlay(player1, theresOptions);

        // Player can no longer see deck
        state = game.detailedStateJSON(player1);
        expect(state.treasure.firstCardTreasureDeck).toBeUndefined();
    });

    it("visibility is specific to player who owns the item", async () => {

        // Give player2 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player2, theresOptions);

        // Player1's turn - nobody sees deck
        let state1 = game.detailedStateJSON(player1);
        let state2 = game.detailedStateJSON(player2);
        expect(state1.treasure.firstCardTreasureDeck).toBeUndefined();
        expect(state2.treasure.firstCardTreasureDeck).toBeUndefined();

        // End turn to player2
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);

        // Player2's turn - only player2 sees deck
        state1 = game.detailedStateJSON(player1);
        state2 = game.detailedStateJSON(player2);
        expect(state1.treasure.firstCardTreasureDeck).toBeUndefined();
        expect(state2.treasure.firstCardTreasureDeck).toBeDefined();
    });

    it("property canSeeTopOfTreasureDeck is correctly set", async () => {
        // Initially, player1 cannot see top of deck
        expect(player1.canSeeTopOfTreasureDeck).toBe(false);

        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Now player1 can see top of deck (during their turn)
        expect(player1.canSeeTopOfTreasureDeck).toBe(true);

        // End turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);

        // Player1 cannot see during other's turn
        expect(player1.canSeeTopOfTreasureDeck).toBe(false);
        
        // End turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player3);

        // Player1 cannot see during other's turn
        expect(player1.canSeeTopOfTreasureDeck).toBe(false);
        // Back to player1's turn
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player1);

        // Player1 can see again
        expect(player1.canSeeTopOfTreasureDeck).toBe(true);
    });

    it("adding the item mid-game works correctly", async () => {
        // End first turn without the item
        await game.endTurn();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.currentPlayer).toBe(player2);

        // Give player2 theres_options during their turn
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player2, theresOptions);

        // Player2 should immediately see deck (it's their turn)
        let state = game.detailedStateJSON(player2);
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();
        expect(player2.canSeeTopOfTreasureDeck).toBe(true);
    });

    it("correct top card is returned in state", async () => {
        // Give player1 theres_options
        const theresOptions = game.shop.obtainCard("b2-theres_options") as TreasureCard;
        game.cardHandler.addInPlay(player1, theresOptions);

        // Get the actual top card from the deck
        const topCard = game.decks["treasure"]!.cards[0]!;

        // Get the state
        const state = game.detailedStateJSON(player1);

        // Verify the firstCardTreasureDeck matches the actual top card
        expect(state.treasure.firstCardTreasureDeck).toBeDefined();
        expect(state.treasure.firstCardTreasureDeck!.slug).toBe(topCard.slug);
    });

});
