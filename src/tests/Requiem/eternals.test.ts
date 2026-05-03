// import type { ItemCard } from "@/models/cards";
// import { beforeEach, describe, expect, it } from "bun:test";
// import { Game } from "../../models/game";
// import { Player } from "../../models/player";
// import { setupTestGame } from "../testHelpers";

// async function characterAdd1LootPlay(player1: Player, game: Game) {
//     // verify character card works.
//     const lootPlay = player1.remainingLootPlay;
//     game.recharge(player1.inPlay[0] as ItemCard);
//     await game.activateItem(player1, player1.inPlay[0]!, [], "tap");
//     await game.resolveStack();
//     await game.resolveStack();
//     expect(player1.remainingLootPlay).toBe(lootPlay + 1);
// }

// describe("Four Souls+2 Eternal Items", () => {
//     let game: Game;
//     let player1: Player;
//     let player2: Player;

//     beforeEach(() => {
//     });
    
//     it("r-the_empty", async () => {
//         const setup = setupTestGame({
//                     characters: ["r-the_empty", "b2-samson"],
//                     monsters: ["b2-fly", "b2-fatty"],
//                     monsterDeck: ["b2-red_host", "b2-pooter", "b2-gurdy"],
//                     treasureDeck: ["b2-blank_card"],
//                     playerCount: 2
//                 });
//         game = setup.game;
//         player1 = setup.player1;
//         player2 = setup.player2!;
        
//         expect(player1.inPlay[0]!.slug).toBe("r-the_empty");
//         const eternal = player1.inPlay[1]!;
//         expect(eternal.slug).toBe("r-abyss");
//         expect(player1.healthPoints).toBe(2);
//         expect(player1.attackPoints).toBe(1);
//         eternal.tags.counters = 3;
//         game.recharge(player1.inPlay[1] as ItemCard);
//         await game.activateItem(player1, eternal, [], 0);
//         await game.resolveStack();
//         await game.resolveStack();
//         expect(player1.attackPoints).toBe(3);
//         game.recharge(player1.inPlay[1] as ItemCard);
//         await game.activateItem(player1, eternal, [], 0);
//         await game.resolveStack();
//         await game.resolveStack();
//         expect(player1.attackPoints).toBe(3);
//         await characterAdd1LootPlay(player1, game);

//         game.recharge(player1.inPlay[1] as ItemCard);
//         await game.activateItem(player1, eternal, [], 0    );
//         await game.resolveStack();
//         await game.resolveStack();
//         expect(player1.attackPoints).toBe(4);
//         await characterAdd1LootPlay(player1, game);
//     });
    
// });

