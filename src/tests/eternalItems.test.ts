import { describe, it, expect, beforeEach } from "bun:test";
import { Game } from "../models/game";
import { DiceRoll, Player } from "../models/player";
import { pl } from "zod/locales";
import type { LootCard, ItemCard } from "@/models/cards";
import { InplayType, MonsterCard, CharacterCard } from "@/models/cards";
import { effectParser, inplayCurseSelector, type ChooseOneOptions, type ChooseOneResult } from "@/models/effect";
import { chooseOneEffect } from "@/models/effect";

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

    // "[Tap Effect] Look at the top 5 cards of a deck. Put them back in any order."
    // it("Sleight of Hand ", () => {
    //     const cain = game.decks["character"]!.getCardFromSlug("b2-cain")! as CharacterCard;
    //     const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
    //     game.start(player1, [cain, isaac]);
    //     expect(player1.inPlay[0]!.slug).toBe("b2-cain");
    //     expect(player1.inPlay[0]!.eternal).toBe(true);
    //     expect(player1.inPlay[1]!.slug).toBe("b2-sleight_of_hand");
    //     expect(player1.inPlay[1]!.eternal).toBe(true);
    //     expect(player2.inPlay[0]!.slug).toBe("b2-isaac");

    //     const sleightOfHand = player1.inPlay[1]! as ItemCard;
    //     game.recharge(sleightOfHand);
    //     expect(sleightOfHand.charged).toBe(true);

    //     const top5reverse = game.decks["loot"]!.cards.slice(0, 5).map(c => c.slug).reverse();
    //     sleightOfHand.onTap();
    //     game.resolveStack(); // resolve sleight of hand effect
    //     const top5After = game.getFirstCardsOfDeck("loot", 5).map(c => c.slug);
    //     expect(top5After).toEqual(top5reverse); // order should be different

    // });

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