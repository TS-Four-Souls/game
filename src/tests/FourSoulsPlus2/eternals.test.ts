import type { ItemCard } from "@/models/cards";
import { beforeEach, describe, expect, it } from "bun:test";
import { Game } from "../../models/game";
import { Player } from "../../models/entities/player";
import { setupTestGame } from "../testHelpers";

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

    beforeEach(() => {
    });
    
    it("fsp2-gimpy - (gain 2¢) Each time you take damage, choose one- Gain 2¢. Loot 1, then discard a loot card. Gain +2 [ATK] till end of turn.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-whore_of_babylon", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-whore_of_babylon");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-gimpy");
        const coins = player1.coins;

        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
        if(Options[0] === "gain 2¢.")
            return {
                selected: [Options[0]],
                remaining: []
            };
        return { selected: Options.slice(0, max), remaining: Options.slice(max) };
    };
        game.entityHandler.dealDamage(player1, player1, player1.character!, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.coins).toBe(coins + 2);
        await characterAdd1LootPlay(player1, game);
    });

    it("fsp2-gimpy - (Loot 1, then discard a loot card.) Each time you take damage, choose one- Gain 2¢. Loot 1, then discard a loot card. Gain +2 [ATK] till end of turn.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-whore_of_babylon", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-whore_of_babylon");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-gimpy");
        const handSize = player1.hand.cards.length;
        const firstCard = player1.hand.cards[0];

        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
        if(Options[1] === "loot 1, then discard a loot card.")
            return {
                selected: [Options[1]],
                remaining: []
            };
        return { selected: Options.slice(0, max), remaining: Options.slice(max) };
    };
        game.entityHandler.dealDamage(player1, player1, player1.character!, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.hand.cards.length).toBe(handSize);
        expect(player1.hand.cards).not.toContain(firstCard);
    });

    it("fsp2-gimpy - (Gain +2 [ATK] till end of turn) Each time you take damage, choose one- Gain 2¢. Loot 1, then discard a loot card. Gain +2 [ATK] till end of turn.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-whore_of_babylon", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-whore_of_babylon");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-gimpy");
        const atk = player1.attackPoints;

        game.select = async (player: Player, min: number, max: number, Options: any[]) => {
        if(Options[2] === "gain +2 [atk] till end of turn.")
            return {
                selected: [Options[2]],
                remaining: []
            };
        return { selected: Options.slice(0, max), remaining: Options.slice(max) };
    };
        game.entityHandler.dealDamage(player1, player1, player1.character!, 1);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        
        expect(player1.attackPoints).toBe(atk + 2);
        game.resolveEntireStack();
        await game.endTurn();
        await game.actions.resolveStack();
        game.resolveEntireStack();
        expect(player1.attackPoints).toBe(atk); 
    });

    it("fsp2-dark_arts - Each time another player dies, loot 1.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-dark_judas", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-dark_judas");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-dark_arts");

        const handSize = player1.hand.cards.length;
        game.entityHandler.kill(player2, player2, player1.character!);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(handSize + 1);

        game.entityHandler.kill(player1, player1, player1.character!);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(handSize); // doesn't trigger when the player itself dies.
    });

    it("fsp2-dark_arts - Each time a player rolls a ❻, gain 2¢.", async () => {

        const setup = await setupTestGame({
                    characters: ["fsp2-dark_judas", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        // const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
        // const bumbo = game.decks["character"]!.getCardFromSlug("fsp2-dark_judas")! as CharacterCard;
        // await game.start([bumbo, samson], false);
        expect(player1.character!.slug).toBe("fsp2-dark_judas");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-dark_arts");

        let coins = player1.coins;
        expect(coins).toBe(0); // start with 3 coins.
        for(const player of game.players)
            for(const val of [1, 2, 3, 4, 5, 6])
        {
            game.random = () => (val/ 6) - 0.0001; // ensure we roll a 6.
            const roll = await game.rollDice(player, player1.character!);
            await game.actions.resolveStack();
            await game.actions.resolveStack();
            if(roll.value === 6)
            {
                if(player1.coins !== coins+2)
                    console.log("Unexpected coin gain for player", "after rolling", val, "current coins:", player.coins);
                expect(player1.coins).toBe(coins + 2);
                coins = player1.coins;
            }
            else 
                if(player1.coins !== coins)
                    console.log("Unexpected coin gain for player", "after rolling", val, "current coins:", player.coins);
                // expect(player1.coins).toBe(coins);
        }
        expect(player1.coins).toBe(4); // 3 base, 2 rolls of 6.

        await characterAdd1LootPlay(player1, game);
    });


    it("fsp2-infestation - [Tap Effect] Loot 2, then discard 1 loot card.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-guppy", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-guppy");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-infestation");

        const handSize = player1.hand.cards.length;
        const firstCard = player1.hand.cards[0]!;
        game.cardHandler.recharge(player1.inPlay[0] as ItemCard);
        await game.activateItem(player1, player1.inPlay[0]!, [], "tap");
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(handSize + 1);
        expect(player1.hand.cards).not.toContain(firstCard);

        await characterAdd1LootPlay(player1, game);
    });

    it("fsp2-bag_o_trash - [Paid Effect] Pay 3¢: Play an additional loot card this turn.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-bum_bo", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        const initialLootPlay = player1.remainingLootPlay;
        expect(player1.character!.slug).toBe("fsp2-bum_bo");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-bag_o_trash");
        game.gainCoins(player1, 3, ("debug"));
        await game.activateItem(player1, player1.inPlay[0]!, [], 0);
        expect(player1.coins).toBe(0);
        await game.actions.resolveStack();
        expect(player1.remainingLootPlay).toBe(initialLootPlay + 1);
    });

    it("fsp2-bag_o_trash - [Paid Effect] Pay 4¢: Loot 1.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-bum_bo", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-bum_bo");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-bag_o_trash");

        game.gainCoins(player1, 4, ("debug"));
        expect(player1.coins).toBe(4);
        const handSize = player1.hand.cards.length;
        await game.activateItem(player1, player1.inPlay[0]!, [], 1);
        expect(player1.coins).toBe(0);
        await game.actions.resolveStack();
        expect(player1.hand.cards.length).toBe(handSize + 1);
    });

    it("fsp2-bag_o_trash - [Paid Effect] Pay 6¢: Deal 1 damage to a monster or player.", async () => {
        const setup = await setupTestGame({
                    characters: ["fsp2-bum_bo", "b2-samson"],
                    monsters: ["b2-fly", "b2-fatty"],
                    monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
                    treasureDeck: ["b2-blank_card"],
                    playerCount: 2
                });
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        expect(player1.character!.slug).toBe("fsp2-bum_bo");
        expect(player1.inPlay[0]!.slug).toBe("fsp2-bag_o_trash");

        game.gainCoins(player1, 6, ("debug"));
        expect(player1.coins).toBe(6);
        // deal damage to a player.
        const healthP2 = player2.currentHealthPoints;
        await game.activateItem(player1, player1.inPlay[0]!, [player2], 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(player2.currentHealthPoints).toBe(healthP2 - 1);
        expect(player1.coins).toBe(0);

        // deal damage to a monster.
        game.gainCoins(player1, 6, ("debug"));
        const healthM = game.monsters[0]!.currentHealthPoints;
        await game.activateItem(player1, player1.inPlay[0]!, [game.monsters[0]!], 2);
        await game.actions.resolveStack();
        await game.actions.resolveStack();
        expect(game.monsters[0]!.currentHealthPoints).toBe(healthM - 1);
        expect(player1.coins).toBe(0);

        await characterAdd1LootPlay(player1, game);
    });
    
});

