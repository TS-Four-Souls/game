import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { effectParser, inplayCurseSelector, type ChooseOneOptions, type ChooseOneResult } from "@/models/effectParser";

describe("Eternal Items", () => {
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
    });
    // [tap effect] look at the top 5 cards of a deck. put them back in any order.
    it("The D6", () => {
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [samson, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-samson");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[1]!.slug).toBe("b2-the_d6");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;

        const theD6 = player2.inPlay[1]! as ItemCard;

        player1.hand.addToHand(card);
        game.playCard(player1, 1, []); // play pills
        game.resolveStack(); // resolve pills play
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Force roll to 5 for testing
        game.endTurn();
        expect(theD6.charged).toBe(true);
        theD6.onTap([dice]);
        expect(dice.value).not.toBe(5); // value should change
        game.endTurn();
        expect(theD6.charged).toBe(true);
    }, {retry: 50}); // retry cause can roll randomly fail due to shuffling
    // [Tap Effect] Put the top card of any discard on top of its deck.
    it("The Curse", () => {
        const eve = game.decks["character"]!.getCardFromSlug("b2-eve")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [eve, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-eve");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-the_curse");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        
        const theCurse = player1.inPlay[1]! as ItemCard;
        game.endTurn();
        expect(theCurse.charged).toBe(false);
        game.endTurn();
        expect(theCurse.charged).toBe(true);

        const cards = game.decks["loot"]!.drawSeveral(5) as LootCard[]
        for(const c of cards)
            game.decks["loot"]!.addDiscardTop(c);
        const topDiscardCard = game.decks["loot"]!.discard[0];

        theCurse.onTap(["loot" ]);
        game.resolveStack(); // resolve the curse effect
        expect(game.decks["loot"]!.discard.length).toBe(4); // top of loot deck should be the previous top of discard
        expect(game.decks["loot"]!.cards[0]).toBe(topDiscardCard); // top of loot deck should be the previous top of discard
    });

    // "[Tap Effect] Put a counter on this.",
    it("The Bone: active effect (put a counter on this)", () => {
        const theForgotten = game.decks["character"]!.getCardFromSlug("b2-the_forgotten")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [theForgotten, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-the_forgotten");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-the_bone");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const theBone = player1.inPlay[1]! as ItemCard;
        game.recharge(theBone);
        theBone.onTap();
        expect(theBone.tags.counters).toBe(1);
        game.endTurn();
        expect(theBone.charged).toBe(false);
        game.recharge(theBone);
        theBone.onTap();
        expect(theBone.tags.counters).toBe(2);

    });

    // "[Tap Effect] Add or subtract 1 from a roll."
    it("Book of Belial: add ", () => {
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [judas, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-judas");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-book_of_belial");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const bookOfBelial = player1.inPlay[1]! as ItemCard;
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;
        game.recharge(bookOfBelial);
        expect(bookOfBelial.charged).toBe(true);

        player1.hand.addToHand(card);
        game.playCard(player1, 1, []); // play pills
        game.resolveStack(); // resolve pills play
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 5; // Force roll to 5 for testing
        const initialHandSize = player1.hand.length;
        
        bookOfBelial.onTap([dice, -1]); // subtract 1 to roll
        expect(dice.value).toBe(4);
        game.resolveStack();

        game.resolveStack(); // resolve pills effect
        expect(player1.hand.length).toBe(initialHandSize + 3); // Loot 3 cards
        
    });

    it("Book of Belial: subtract ", () => {
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [judas, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-judas");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-book_of_belial");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");
        const bookOfBelial = player1.inPlay[1]! as ItemCard;
        const card = game.decks["loot"]!.getCardFromSlug("b2-pills") as LootCard;
        game.recharge(bookOfBelial);
        expect(bookOfBelial.charged).toBe(true);

        player1.hand.addToHand(card);
        game.playCard(player1, 1, []); // play pills
        game.resolveStack(); // resolve pills play
        expect(game.stack.size).toBe(1); // Dice roll should be on stack
        const dice = game.stack.elements[0] as DiceRoll;
        dice.value = 2; // Force roll to 5 for testing
        
        const initialHandSize = player1.hand.length;
        bookOfBelial.onTap([dice, 1]); // subtract 1 to roll
        expect(dice.value).toBe(3);
        game.resolveStack();

        game.resolveStack(); // resolve pills effect
        expect(player1.hand.length).toBe(initialHandSize + 3); // Loot 3 cards

    });

    // "[Tap Effect] Look at the top 5 cards of a deck. Put them back in any order."
    it("Sleight of Hand ", () => {
        const cain = game.decks["character"]!.getCardFromSlug("b2-cain")! as CharacterCard;
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        game.start(player1, [cain, isaac]);
        expect(player1.inPlay[0]!.slug).toBe("b2-cain");
        expect(player1.inPlay[0]!.eternal).toBe(true);
        expect(player1.inPlay[1]!.slug).toBe("b2-sleight_of_hand");
        expect(player1.inPlay[1]!.eternal).toBe(true);
        expect(player2.inPlay[0]!.slug).toBe("b2-isaac");

        const sleightOfHand = player1.inPlay[1]! as ItemCard;
        game.recharge(sleightOfHand);
        expect(sleightOfHand.charged).toBe(true);

        const top5reverse = game.decks["loot"]!.cards.slice(0, 5).map(c => c.slug);
        sleightOfHand.onTap(["loot"]);
        game.resolveStack(); // resolve sleight of hand effect
        const top5After = game.getFirstCardsOfDeck("loot", 5).map(c => c.slug);
        expect(top5After).toEqual(top5reverse); // order should be different

    });

    // "[Tap Effect] Choose a player or monster. Prevent the next instance of damage they would take this turn.",
    it("Yum Heart", () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const maggy = game.decks["character"]!.getCardFromSlug("b2-maggy")! as CharacterCard;
        game.start(player1, [isaac, maggy]);
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-maggy");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-yum_heart");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const yumHeart = player2.inPlay[1]! as ItemCard;
        game.endTurn();
        expect(yumHeart.charged).toBe(true);
        
        expect(player2.currentHealthPoints).toBe(2);
        yumHeart.onTap();
        // simulate large amount of damage to maggy
        game.dealDamage(player2, player2, dummyLoot, 1000);
        game.resolveStack(); // resolve the damage prevention
        expect(player2.currentHealthPoints).toBe(2); // damage prevented


        game.dealDamage(player2, player2, dummyLoot, 1);
        game.resolveStack(); // resolve the damage prevention
        expect(player2.currentHealthPoints).toBe(1); // damage taken

        game.endTurn();
        expect(yumHeart.charged).toBe(true);
    });
//     "Each time you die, after paying penalties, gain +1 treasure."
    it("Lazarus Rags", () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const lazarus = game.decks["character"]!.getCardFromSlug("b2-lazarus")! as CharacterCard;
        game.start(player1, [isaac, lazarus]);
        const dummyLoot = game.decks["loot"]!.draw() as LootCard;

        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-lazarus");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-lazarus_rags");
        expect(player2.inPlay[1]!.eternal).toBe(true);

        // Kill Isaac, verify no treasure gained
        game.kill(player1, player1, dummyLoot);
        game.resolveStack(); // resolve death
        expect(player1.inPlay.length).toBe(2);

        // Kill Lazarus, verify treasure gained
        game.kill(player2, player2, dummyLoot);
        game.resolveStack(); // resolve death
        expect(player2.inPlay.length).toBe(3);
        const firstItemGained = player2.inPlay[2];

        game.endTurn();
        expect(firstItemGained!.eternal).toBe(false);
        // Kill Lazarus, verify treasure gained
        game.kill(player2, player2, dummyLoot);
        game.resolveStack(); // resolve death
        expect(player2.inPlay.length).toBe(3);
        expect(player2.inPlay[2]).not.toBe(firstItemGained);

    });

    it("Blood Lust", () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        game.start(player1, [isaac, samson]);

        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-samson");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-blood_lust");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const bloodlust = player2.inPlay[1]! as ItemCard;

        game.recharge(bloodlust);
        expect(bloodlust.charged).toBe(true);

        expect(player2.attackPoints).toBe(1);
        bloodlust.onTap();
        expect(player2.attackPoints).toBe(2);

        game.endTurn();
        expect(player2.attackPoints).toBe(1);
        expect(bloodlust.charged).toBe(true);

        bloodlust.onTap();
        game.endTurn();
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);
        game.endTurn();
        expect(bloodlust.charged).toBe(true);
    });

    // "[Tap Effect] Choose one-\nSteal 1¢ from another player.\nLook at the top card of a deck.\nDiscard a loot card, then loot 1."
    // "Each time you take damage, recharge this."
//     it("Forever Alone - Option 1: Steal 1¢ from another player", () => {
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
//         game.start(player1, [isaac, blueBaby]);
        
//         expect(player2.inPlay[0]!.slug).toBe("b2-blue_baby");
//         expect(player2.inPlay[0]!.eternal).toBe(true);
//         expect(player2.inPlay[1]!.slug).toBe("b2-forever_alone");
//         expect(player2.inPlay[1]!.eternal).toBe(true);
        
//         const foreverAlone = player2.inPlay[1]! as ItemCard;
//         game.recharge(foreverAlone);
//         expect(foreverAlone.charged).toBe(true);
        
//         // Give player1 some coins
//         player1.gainCoins(5);
//         expect(player1.coins).toBe(5);
//         expect(player2.coins).toBe(0);
        
//         foreverAlone.onTap([{
//             description: "steal 1¢ from another player.",
//             chosenOptions: [player1]}]);
//         game.resolveStack();
        
//         expect(player1.coins).toBe(4); // Lost 1 coin
//         expect(player2.coins).toBe(1); // Gained 1 coin
//         expect(foreverAlone.charged).toBe(false);
//     });

//     it("Forever Alone - Option 2: Look at the top card of a deck", () => {
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
//         game.start(player1, [isaac, blueBaby]);
        
//         const foreverAlone = player2.inPlay[1]! as ItemCard;
//         game.recharge(foreverAlone);
        
//         const topLootCard = game.getFirstCardsOfDeck("loot", 1)[0]!;
        
//         let peekCalled = false;
//         // Mock game.select to choose option 2 (look at top card)
//         foreverAlone.onTap();
//         game.resolveStack();
        
//         expect(peekCalled).toBe(true);
//         expect(foreverAlone.charged).toBe(false);
//     });

//     it("Forever Alone - Option 3: Discard a loot card, then loot 1", () => {
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
//         game.start(player1, [isaac, blueBaby]);
        
//         const foreverAlone = player2.inPlay[1]! as ItemCard;
//         game.recharge(foreverAlone);
        
//         // Give player2 a loot card to discard
//         const lootCard = game.decks["loot"]!.draw() as LootCard;
//         player2.hand.addToHand(lootCard);
//         const initialHandSize = player2.hand.length;
        
//         // Mock game.select to choose option 3 (discard & loot)
//         game.select = (_issuer, _n, opts, _optional) => {
//             // First call is for choose-one options
//             if (Array.isArray(opts) && opts.length === 3) {
//                 return { selected: [2], remaining: [] }; // Choose option 3
//             }
//             // Second call is for selecting card to discard
//             return { selected: [lootCard], remaining: [] };
//         };
        
//         foreverAlone.onTap();
//         game.resolveStack();
        
//         // Should discard 1 card and loot 1 card (net 0 change)
//         expect(player2.hand.length).toBe(initialHandSize);
//         expect(foreverAlone.charged).toBe(false);
//     });

//     it("Forever Alone - Recharges when taking damage", () => {
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
//         game.start(player1, [isaac, blueBaby]);
        
//         const foreverAlone = player2.inPlay[1]! as ItemCard;
//         const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
//         game.recharge(foreverAlone);
//         expect(foreverAlone.charged).toBe(true);
        
//         // Use the item
//         game.select = (_issuer, _n, opts, _optional) => {
//             if (Array.isArray(opts) && opts.length === 3) {
//                 return { selected: [1], remaining: [] }; // Choose option 2 (peek)
//             }
//             return { selected: ["loot"], remaining: [] };
//         };
        
//         foreverAlone.onTap();
//         game.resolveStack();
//         expect(foreverAlone.charged).toBe(false);
        
//         // Deal damage to player2 (Blue Baby)
//         game.dealDamage(player1, player2, dummyLoot, 1);
//         game.resolveStack();
        
//         // Forever Alone should recharge after taking damage
//         expect(foreverAlone.charged).toBe(true);
//         expect(player2.currentHealthPoints).toBe(1);
//     });

//     it("Forever Alone - Multiple damage instances recharge each time", () => {
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         const blueBaby = game.decks["character"]!.getCardFromSlug("b2-blue_baby")! as CharacterCard;
//         game.start(player1, [isaac, blueBaby]);
        
//         const foreverAlone = player2.inPlay[1]! as ItemCard;
//         const dummyLoot = game.decks["loot"]!.draw() as LootCard;
        
//         // Discharge the item
//         foreverAlone.charged = false;
//         expect(foreverAlone.charged).toBe(false);
        
//         // Deal damage
//         game.dealDamage(player1, player2, dummyLoot, 1);
//         game.resolveStack();
//         expect(foreverAlone.charged).toBe(true);
        
//         // Heal player2
//         player2.heal();
        
//         // Use the item again
//         game.select = (_issuer, _n, opts, _optional) => {
//             if (Array.isArray(opts) && opts.length === 3) {
//                 return { selected: [1], remaining: [] };
//             }
//             return { selected: ["loot"], remaining: [] };
//         };
        
//         foreverAlone.onTap();
//         game.resolveStack();
//         expect(foreverAlone.charged).toBe(false);
        
//         // Deal damage again
//         game.dealDamage(player1, player2, dummyLoot, 1);
//         game.resolveStack();
//         expect(foreverAlone.charged).toBe(true);
//     });
});

describe("Eternal Items - 3 players tests", () => {
    let game: Game;
    let player1: Player;
    let player2: Player;
    let player3: Player;

    beforeEach(() => {
        game = new Game();
        player1 = new Player("Player 1");
        player2 = new Player("Player 2");
        player3 = new Player("Player 3");
        game.addPlayer(player1);
        game.addPlayer(player2);
        game.addPlayer(player3);
        game.setupGame();
    });
    
    it("Blood Lust - recharge on end turn", () => {
        const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
        const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        const judas = game.decks["character"]!.getCardFromSlug("b2-judas")! as CharacterCard;
        game.start(player1, [isaac, samson, judas]);
        expect(player1.inPlay[0]!.slug).toBe("b2-isaac");
        expect(player2.inPlay[0]!.slug).toBe("b2-samson");
        expect(player2.inPlay[0]!.eternal).toBe(true);
        expect(player2.inPlay[1]!.slug).toBe("b2-blood_lust");
        expect(player2.inPlay[1]!.eternal).toBe(true);
        const bloodlust = player2.inPlay[1]! as ItemCard;

        game.endTurn(); // samson turn
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        expect(bloodlust.charged).toBe(false);
        game.endTurn(); // samson turn
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        expect(bloodlust.charged).toBe(true);;
        expect(player1.attackPoints).toBe(1);
        bloodlust.onTap([player1]);
        expect(player1.attackPoints).toBe(2);
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        expect(bloodlust.charged).toBe(false); game.endTurn(); // samson turn
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // eve turn
        expect(bloodlust.charged).toBe(true);
        bloodlust.onTap();
        expect(bloodlust.charged).toBe(false);

        game.endTurn(); // isaac turn
        expect(bloodlust.charged).toBe(false);
    });
});