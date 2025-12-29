// import { describe, it, expect, beforeEach } from "bun:test";
// import { Game } from "../../models/game";
// import { DiceRoll, Player } from "../../models/player";
// import type { LootCard, Card, EffectOnStack } from "@/models/cards";
// import { InplayType, MonsterCard, CharacterCard, ItemCard, treasureCard } from "@/models/cards";

// describe("Event Monsters - Roll Trigger Effects", () => {
//     let game: Game;
//     let player1: Player;
//     let player2: Player;

//     beforeEach(() => {
//         game = new Game();
//         player1 = new Player("Player 1");
//         player2 = new Player("Player 2");
//         game.addPlayer(player1);
//         game.addPlayer(player2);
//         game.setupGame();
//         const samson = game.decks["character"]!.getCardFromSlug("b2-samson")! as CharacterCard;
//         const isaac = game.decks["character"]!.getCardFromSlug("b2-isaac")! as CharacterCard;
//         game.start(player1, [samson, isaac]);
//         for (const slug of ["b2-red_host", "b2-pooter", "b2-gurdy"]) {
//             const monsterCardTop = game.obtainCard(slug) as MonsterCard;
//             game.decks["monster"]!.addTopPosition(monsterCardTop);
//         }
//         const monsterCard = game.obtainCard("b2-fly")! as MonsterCard;
//         const monsterCard2 = game.obtainCard("b2-fatty")! as MonsterCard;
//         game.monsterSlots.forceSetMonsterAtSlot(0, monsterCard);
//         game.monsterSlots.forceSetMonsterAtSlot(1, monsterCard2);
//         game.decks["treasure"]?.addTopPosition(game.shop.obtainCard("b2-blank_card")!);
//     });

//     // b2-holy_squirt: Each time a player rolls a ❺, they loot 1
//     it("holy_squirt - player loots 1 when rolling a 5 (attack roll)", () => {
//         const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
//         game.decks["monster"]!.addTopPosition(holySquirt);
        
//         // Trigger the event
//         game.monsterSlots.discardTop(0);
//         game.resolveStack(); // resolve the event addition
        
//         const monster = game.monsters[0]!;
//         game.addHealth(monster, 10);
//         const initialHandSize = player1.hand.length;
        
//         // Attack roll with non-triggering value
//         game.attackRoll(player1, monster);
//         const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
//         expect(attackRoll1).toBeDefined();
//         if (attackRoll1) {
//             attackRoll1.value = 6; // Non-triggering roll
//         }
//         game.resolveStack(); // roll resolution
//         game.resolveStack(); // damage resolution
//         game.resolveStack(); // dies ?
//         expect(player1.hand.length).toBe(initialHandSize);
        
//         // Attack roll with triggering value
//         game.attackRoll(player1, monster);
//         const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
//         expect(attackRoll2).toBeDefined();
//         if (attackRoll2) {
//             attackRoll2.value = 5; // Triggering roll
//         }
//         game.resolveStack(); // roll resolution
//         game.resolveStack(); // damage resolution
//         game.resolveStack(); // loot effect
        
//         expect(player1.hand.length).toBe(initialHandSize + 1);
//     });

//     it("holy_squirt - player loots 1 when rolling a 5 (card roll)", () => {
//         const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
//         game.decks["monster"]!.addTopPosition(holySquirt);
        
//         // Trigger the event
//         game.monsterSlots.discardTop(0);
//         game.resolveStack(); // resolve the event addition
        
//         const card = game.decks["loot"]?.getCardFromSlug("b2-pills") as LootCard;
//         player1.hand.addToHand(card);
//         const initialHandSize = player1.hand.length;
        
//         // Play card that triggers a roll
//         game.playCard(player1, 1);
//         game.resolveStack(); // card resolution
        
//         const cardRoll = game.stack._stack[0] as DiceRoll | undefined;
//         expect(cardRoll).toBeDefined();
//         if (cardRoll) {
//             cardRoll.value = 5; // Triggering roll
//         }
//         game.resolveStack(); // roll resolution
//         game.resolveStack(); // loot effect
        
//         expect(player1.hand.length).toBe(initialHandSize + 1);
//     });

//     it("holy_squirt - player does not loot when rolling other values", () => {
//         const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
//         game.decks["monster"]!.addTopPosition(holySquirt);
        
//         // Trigger the event
//         game.monsterSlots.discardTop(0);
//         game.resolveStack(); // resolve the event addition
        
//         const monster = game.monsters[0]!;
//         game.addHealth(monster, 10);
//         const initialHandSize = player1.hand.length;
        
//         // Test various non-5 rolls
//         for (const rollValue of [1, 2, 3, 4, 6]) {
//             game.attackRoll(player1, monster);
//             const attackRoll = game.stack._stack[0] as DiceRoll | undefined;
//             if (attackRoll) {
//                 attackRoll.value = rollValue;
//             }
//             game.resolveStack(); // roll resolution
//             game.resolveStack(); // damage resolution
//             game.resolveStack(); // dies ?
//         }
        
//         expect(player1.hand.length).toBe(initialHandSize);
//     });

//     it("holy_squirt - multiple players loot when rolling 5", () => {
//         const holySquirt = game.obtainCard("b2-holy_squirt") as MonsterCard;
//         game.decks["monster"]!.addTopPosition(holySquirt);
        
//         // Trigger the event
//         game.monsterSlots.discardTop(0);
//         game.resolveStack(); // resolve the event addition
        
//         const monster = game.monsters[0]!;
//         game.addHealth(monster, 20);
        
//         const initialHandSizeP1 = player1.hand.length;
//         const initialHandSizeP2 = player2.hand.length;
        
//         // Player 1 rolls a 5
//         game.attackRoll(player1, monster);
//         const attackRoll1 = game.stack._stack[0] as DiceRoll | undefined;
//         if (attackRoll1) {
//             attackRoll1.value = 5;
//         }
//         game.resolveStack(); // roll resolution
//         game.resolveStack(); // damage resolution
//         game.resolveStack(); // loot effect
        
//         expect(player1.hand.length).toBe(initialHandSizeP1 + 1);
        
//         // End player1's turn
//         game.endTurn();
        
//         // Player 2 rolls a 5
//         game.attackRoll(player2, monster);
//         const attackRoll2 = game.stack._stack[0] as DiceRoll | undefined;
//         if (attackRoll2) {
//             attackRoll2.value = 5;
//         }
//         game.resolveStack(); // roll resolution
//         game.resolveStack(); // damage resolution
//         game.resolveStack(); // loot effect
        
//         expect(player2.hand.length).toBe(initialHandSizeP2 + 1);
//     });
// });
