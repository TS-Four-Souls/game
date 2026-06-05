// import { TargetBuilder } from "@/models/targetBuilder";
// import { beforeEach, describe, it } from "bun:test";
// import { ActionType, Bot, DeclareAttackOnEntityAction, PlayLootAction, PurchaseAction, UseItemAction } from "../../models/bots";
// import { Player } from "../../models/entities/player";
// import { Game } from "../../models/game";
// import { randomSelect, setupTestGame } from "../testHelpers";


// let fixedSeed: string = "";
// // fixedSeed =  "0.30422119860658786";
// // fixedSeed =  "0.9317227808903745";
// let VERBOSE = fixedSeed !== ""; 
// // VERBOSE = false; 
// let gameId = 0;

// describe(   "Random Games", () => {
//     let game: Game;
//     let player1: Player;
//     let player2: Player;
//     let shouldRerun = true;
//     let uniqueIdCounter = 0;
//     let shouldStop = false; 

//     beforeEach(() => {
//         let seed = fixedSeed === "" ?
//          Math.random().toString()
//           : fixedSeed
//         if(!shouldRerun)return;
//         if(fixedSeed !== "") shouldRerun = false;
//         const setup = setupTestGame({
//                     playerCount: 2,
//                     randomSeed: seed,
//                     rooms: "random",
//                     bonusSouls: "random",
//                     forbiddenCards: ["b2-portable_slot_machine", "b2-battery_bum", "r-keepers_sack", "r-car_battery", "b2-shiny_rock", "b2-placebo"]
//                 });
//         console.log(`${gameId++} Random seed for this test: \"${seed}\"`);
//         game = setup.game;
//         player1 = setup.player1;
//         player2 = setup.player2!;
//         game.select = randomSelect;
//         uniqueIdCounter = 0;
//         shouldStop = false; 
//     });

//     it("100 rounds", async () => {
//         // throw new Error("This test is currently disabled as it can be very flaky and doesn't provide consistent value. It can be re-enabled for specific seeds that are known to cause issues, or after improving the bot's decision making to reduce the chances of it getting stuck in loops or bad states.");
//         Math.random = game.random; // Override Math.random to make the test deterministic and reproducible
//         const bot1 = new Bot(game, player1);
//         const bot2 = new Bot(game, player2);
//         let currentRound = 0;
//         let seen = false;
//         while(game.turnHandler.round < 100 && game.turnHandler.numberOfRoundSinceBeginning < 500 && !shouldStop) {
//             uniqueIdCounter++;
//             if(uniqueIdCounter > Math.min(100000, 100000))
//                 throw new Error("Unique ID counter exceeded 100000, there is likely an infinite loop in the test.");
//             if(game.turnHandler.round > currentRound) {
//                 currentRound = game.turnHandler.round;
//             }
            
//             // await game.resolveEntireStack();
//             // const bot = game.currentPlayer === player1 ? bot1 : bot2;
//             const bot = Math.random() < 0.8 ? 
//                 game.currentPlayer === player1 
//                     ? bot1 
//                     : bot2
//                 : game.currentPlayer === player1 
//                     ? bot2
//                     : bot1;

//             // let findDuplicates = arr => arr.filter((item, index) => arr.indexOf(item) !== index)
//             // if(findDuplicates(game.decks.loot._discard.concat(game.decks.loot._order)).length > 0)
//             //     throw new Error(`Duplicate cards found in the loot deck.`);
//             // if(game.decks.treasure.cards.some(c => game.visibleItems.some(v => v.globalId === c.globalId)))
//             //     throw new Error(`The Dead Cat is in the treasure deck and in play for player ${bot1.me.id} at the same time, which should not happen. This may indicate a bug in card obtaining or state updates between turns.`);
//             // if(bot2.me.hand.cards.some(c => game.decks.loot.cards.includes(c)))
//             //     throw new Error(`Player ${bot2.me.id} has a card in hand that is still in the loot deck, which should not happen. This may indicate a bug in card obtaining or state updates between turns.`);
//             // if(game.decks.loot.discard.some(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1))
//             //     throw new Error(`in discard, Duplicate card ${game.decks.loot.cards.find(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1)?.name} with global ID ${game.decks.loot.cards.find(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1)?.globalId} found in loot deck, which should not happen. This may indicate a bug in card obtaining or state updates between turns.`);
//             // if(game.decks.loot.cards.some(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1))
//             //     throw new Error(`Duplicate card ${game.decks.loot.cards.find(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1)?.name} with global ID ${game.decks.loot.cards.find(c => game.decks.loot.cards.filter(deckCard => deckCard.globalId === c.globalId).length > 1)?.globalId} found in loot deck, which should not happen. This may indicate a bug in card obtaining or state updates between turns.`);
//                 // printVerbose(bot.me.id,"Has ", bot.me.inPlay.length, " items in play: ", bot.me.inPlay.map(i => i.name));
//             // if(bot1.me.inPlay.some(c => c.owner !== bot1.me) || bot2.me.inPlay.some(c => c.owner !== bot2.me))
//             //     throw new Error(`Player ${bot1.me.id} or ${bot2.me.id} has an item (${bot1.me.inPlay.find(c => c.owner !== bot1.me)?.name || bot2.me.inPlay.find(c => c.owner !== bot2.me)?.name}) in play that is not owned by them. This should not happen and may indicate a bug in state updates between turns.`);
//             // if(game.shop.itemsInShop.some(i => i === undefined))
//             //     throw new Error("Shop deck is empty, which should not happen. Check for potential bugs in card obtaining or shop refill." + game.shop._deck.length + ", discard: " + game.shop._deck.discard.length);
//             // printVerbose(game.monsters.filter(m => m.isEngagedInCombat).length, " monsters engaged in combat.");
//             // printVerbose("compute playable actions... ");
//             // const actions = bot.playableActions;
//             // let action = actions[Math.floor(Math.random() * actions.length)]!;
//             let action = bot.randomFeasibleAction;
//             // printVerbose("Done.", actions.map(a => a.type + (a instanceof UseItemAction ? ` (${a.item.name})` : "")).join(", "));
//             // if(bot.me.inPlay.length < 2)
//             //     throw new Error(`Player ${bot.me.id} has less than 2 items in play, which should not happen as the starting item is eternal. This may indicate a bug in item removal or state updates between turns.`);
//             // if(game.getAttack(game.currentPlayer)=== 0)
//             //     throw new Error("Player has 0 attack, but it's still their turn. This should not happen.");
//             // printVerbose("Monsters: ", game.monsters.map(m => `${m.card.name}(${m.currentHealthPoints}HP)${m.isEngagedInCombat ? " engaged" : ""}${m.isDead ? " dead" : ""}`));
//             // printVerbose("slots: ", game.encounters.slots.map(slot => slot[slot.length - 1]?.slug).join(", "));
//             // if(game.currentPlayer.diceModifier + game.currentPlayer.attackDiceModifier >= 2)
//             //     throw new Error("Player has 5 or more dice modifier, which should not be possible. Check for potential bugs in stat modification or stacking.");
//             if(game.decks.loot.cards.some(c => c.name === "Soulbond"))
//                 throw new Error("Soulbond is in the loot deck, which should not happen. This may indicate a bug in card obtaining or state updates between turns.");
//             if(action === null && bot.me !== game.currentPlayer)
//                 continue;
//             if(action === null) {
//                 displayPlentyOfInfo(bot);
//                 throw new Error(`Seed: ${game.seed}, Player ${bot.me.id} has no playable actions at round ${game.turnHandler.round}. This should not happen.`);
//             }
//             // if(!seen && game.monsters.some(m => m.card.slug === "b2-cod_worm"))
//             //     seen = true;
//             // if((seen && !game.monsters.some(m => m.card.slug === "b2-cod_worm")))
//             //     throw new Error("Nerve Ending was seen but is no longer present, it may have been killed or removed from combat. This should be possible but is worth investigating if it happens consistently with the same seed.");
//             // if(game.entitiesInCombat.some(e => e.card.slug === "b2-cod_worm"))
//             // console.log("Both have donation machines ?, ", player1.inPlay.map(i => i.slug).includes("b2-donation_machine"), player2.inPlay.map(i => i.slug).includes("b2-donation_machine"));
//             //                     throw new Error("Nerve Ending was seen but is no longer present, it may have been killed or removed from combat. This should be possible but is worth investigating if it happens consistently with the same seed.");
//         // printVerbose(`${uniqueIdCounter} Round ${game.turnHandler.round}:${game.turnHandler.current.id},  Player ${bot.me.id} try execute action: ${action.type}`);
//             // printVerbose("attack requirement: ", bot.me.hasAttackRequirement, " free attacks remaining: ", bot.me.hasFreeAttackRemaining, " attacks remaining: ", bot.me.attackThisTurn);
//             // printVerbose("engaged in combat: ", game.entitiesInCombat.map(e => e.id).join(", "));
//             switch(action.type) {
//                 case ActionType.PURCHASE:
//                     if(action instanceof PurchaseAction === false)
//                         throw new Error("Expected PurchaseAction");
//                     const index = Math.floor(Math.random() * (game.shop._slots.length + 1));
//                     printVerbose(`    Try ${bot.me.id} executed action: ${action.type}, ${index === game.shop._slots.length ? "top of the treasure deck" : `slot ${index} (${game.shop._slots[index] && game.shop._slots[index]![0] ? game.shop._slots[index]![0].name : "empty"})`}`);
//                     if(index === game.shop._slots.length)
//                     {
//                         if(game.actions.canPurchase(bot.me, "top", false) !== true)
//                             action.index = Math.floor(Math.random() * (game.shop._slots.length));
//                         else
//                             action.index = "top";
//                     }
//                     else
//                         action.index = index;
//                     break;
//                 case ActionType.USE_ITEM:
//                     if(action instanceof UseItemAction === false)
//                         throw new Error("Expected UseItemAction");
//                     // printVerbose(` inPlay: ${player2.inPlay.map(i => i.name).join(", ")}`);
//                     // printVerbose(` coins: ${player2.coins}`);
//                     printVerbose(`    Try ${bot.me.id} executed action: use_item, ${`item: ${action.item.name}`}, global id: ${action.item.globalId}, owner: ${action.item.owner.id}, stack size: ${game.stack.elements.length} with in play items: ${bot.me.inPlay.map(i => i.name).join(", ")}, targets: ${action.targets === undefined ? [] : TargetBuilder.convertToSelectionItems(action.targets)}`);
//                     if(!bot.me.inPlay.includes(action.item))
//                         throw new Error(`Bot tried to use item ${action.item.name} which is not in their in-play area. This should not happen and may indicate a bug in action feasibility checking or state updates between action selection and execution.`);
//                     try {
//                         if(bot.game.actions.canActivate(action.item, bot.me) !== true)
//                             throw new Error(`Item ${action.item.name} cannot be activated by player ${bot.me.id}`);
//                         const result = TargetBuilder.buildRandomValidTargets(game, bot.me, action.item, "inPlay");
//                         if(typeof result === "string")                         
//                             throw new Error(`Failed to build targets for item ${action.item.name}: ${result} ${game.players.map(p => p.inPlay.length)}`);
//                         action.targets = result.targets;
//                         action.index = result.index;
//                     } catch (targetErr) {
//                         console.error(`      ✗ Error building targets for ${action.item.name}:`, targetErr && (targetErr as Error).message);
//                         throw targetErr;
//                     }
//                     break;
//                 case ActionType.PLAY_LOOT:
//                     if(action instanceof PlayLootAction === false)
//                         throw new Error("Expected PlayLootAction");
//                     const playAction = action as PlayLootAction;
//                     const card = bot.me.hand.cards[playAction.index]!;
                    
//                     const res = TargetBuilder.buildRandomValidTargets(game, bot.me, card, "hand");
//                     // if(game.currentPlayer.hand.cards[action.index]!.slug.includes("fsp2-questionmark_card"))
//                     printVerbose(`    Try ${bot.me.id} executed action: ${action.type}, ${`loot: ${bot.me.hand.cards[action.index]!.slug}`}`);
//                     if(typeof res === "string")
//                         throw new Error(`Failed to build targets for loot card ${card.name}: ${res}`);
//                     if (typeof res !== "string") {
//                         printVerbose("targets:", TargetBuilder.convertToSelectionItems(res.targets));
//                         action.targets = res.targets;
//                     }
//                     break;
//                 case ActionType.END_TURN:
//                     printVerbose(`Turn ends \n`);
//                     break;
//                 case ActionType.ATTACK:
//                     if(action instanceof DeclareAttackOnEntityAction === false)
//                         throw new Error("Expected DeclareAttackOnEntityAction");
//                     // printVerbose(`    declare attack on: ${action.target === "topDeck" ? "top of the monster deck" : action.target.card.name}`);
//                     // printVerbose("Monsters: ", game.monsters.map(m => `${m.card.name}(${m.currentHealthPoints}HP)${m.isEngagedInCombat ? " engaged" : ""}${m.isDead ? " dead" : ""}`).join(", "));

//                     break;
//                 case ActionType.RESOLVE_STACK:
//                     // printVerbose(`in Play: ${bot.me.inPlay.map(i => i.name).join(", ")}`);
//                     // if(game.stack.peek()?.json.type === "LootCardEffect")
//                         printVerbose(`    Try ${bot.me.id} executed action: resolve_stack to resolve ${game.stack.peek()?.debugLogs}, coins :${bot.me.coins},stack size: ${game.stack.elements.length}`);
//                     // if(game.stack.peek()?.json.card?.slug === "b2-steamy_sale" && game.stack.peek()?.json.effect === "Steal 1¢ from another player when they gain coins.")
//                     //     throw new Error("Stack contains Tech X steal effect, which can cause infinite loops if the bot keeps trying to resolve it while there are no coins to steal. This should be investigated if it happens consistently with the same seed.");
//                     if(game.stack.size > 1000) {
//                             game.stack.elements.forEach(e => {
//                                 if("card" in e.json && e.json.card)
//                                     console.log(`  Stack element ${e.json}: ${e.json.card.slug}, effect: ${"effect" in e.json ? e.json.effect : "none"}, issuer: ${e.json.issuer?.name}`);
//                                 else
//                                     console.log(`  Stack element: ${JSON.stringify(e.json)}`);
//                             });
//                         throw new Error("Stack size exceeded 1000");
//                     }
//                     break;
//                 case ActionType.DECLARE_ATTACK:
//                 case ActionType.DECLARE_PURCHASE:
//                 case ActionType.CANCEL_PURCHASE:
//                 case ActionType.ROLL:
//                     printVerbose(`    Try ${bot.me.id} executed action: ${action.type}`);
//                     break;
//                 default:
//                     throw new Error(`Unhandled action type: ${action.type}`);
//             }
//             try {
//                 await action.execute(game);
//                 // printVerbose(`  ✓ ${action.type} executed successfully`);
//                 // printVerbose(`  Resolving stack...${game.stack.elements.map(e => JSON.stringify(e.json)).join(", ")}`);
//                 // let maxIterations = 5; // Prevent infinite loops in case of bugs
//                 // while(!game.stack.isEmpty() && maxIterations > 0) {
//                 //     await game.resolveEntireStack();
//                 //     maxIterations--;
//                 // }
//                 // expect(game.stack.isEmpty()).toBe(true);
//             } catch (execErr) {
//                 // deck is so empty that even after resetting the discard pile there's not enough cards to draw, skip this action and continue the test, as this is a valid game state (can happen if the bot tries to buy from an empty treasure deck for example)
//                 if(execErr && 
//                     ["Cannot purchase from shop slot 1, it is empty. The deck has 0 cards left.",
//                     "Cannot purchase from shop slot 0, it is empty. The deck has 0 cards left.",
//                     "Cannot purchase from shop slot 2, it is empty. The deck has 0 cards left.",
//                     "Cannot draw card at position 0 from top even after resetting discard, deck of type treasure has only 0 cards.",
//                     "Cannot draw card at position 0 from top even after resetting discard, deck of type loot has only 0 cards.",
//                     ].includes((execErr as Error).message) || (execErr as Error).message.includes("The deck has 0 cards left.") || (execErr as Error).message.includes("has only 0 cards."))
//                     {
//                         console.log(`  ✗ ${action.type} failed due to empty deck.`);
//                             // , skipping action. This can happen if the bot tries to purchase from an empty shop slot or draw from an empty deck. Error message: ${(execErr as Error).message}`);
//                         shouldStop = true;
//                     }
//                     else
//                     {
//                         console.error(`  ✗ Error round ${game.turnHandler.round} executing ${action.type}:`, execErr && (execErr as Error).message);
//                         throw execErr;
//                     }
//             }
//             if(shouldStop)
//             {
//                 console.log(`Stopping test after ${uniqueIdCounter} actions due to empty deck.`);
//                 break;
//             }
//             // printVerbose(`  ✓ Stack resolved`);
//         }
//         // printVerbose(JSON.stringify(game.detailedStateJSON(game.players[0]!)));
//     }, {repeats: 10000});


































//     function printVerbose(...args: any[]) {
//             if(VERBOSE)
//                 console.log(...args);
//         }

//     function displayPlentyOfInfo(bot: Bot) {
//         printVerbose(bot.me.attackThisTurn <= 0, !bot.me.hasAttackRequirement, !bot.me.hasFreeAttackRemaining);
//         printVerbose(`${bot.me.isEngagedInCombat ? "Engaged" : "Not engaged"}`);
//         printVerbose(game.hasPendingSelections ? " There are pending selections." : "No pending selections.");
//         printVerbose("can end turn:", game.actions.canEndTurn(bot.me, false));
//         printVerbose("Can declare attack: ", game.actions.canDeclareAttack(bot.me, false));
//         printVerbose(bot.me.attackThisTurn, " attacks remaining.");
//         printVerbose(bot.me.isDead ? "Player is dead." : "Player is alive.");
//         for(const monster of game.monsters) {
//             printVerbose(monster.id, game.actions.canDeclareAttackOnEntity(bot.me, monster) === true ? "Can declare attack on monster." : game.actions.canDeclareAttackOnEntity(bot.me, monster));
//         }
//         printVerbose(game.actions.canDeclareAttackOnEntity(bot.me, "topDeck") === true ? "Can declare attack on monster." : game.actions.canDeclareAttackOnEntity(bot.me, "topDeck"));
//         printVerbose(bot.me.hasAttackRequirement ? "Player has attack requirement." : "Player has no attack requirement.");
//         printVerbose(game.actions.canEndTurn(bot.me, false) === true ? "Player can end turn." : game.actions.canEndTurn(bot.me, false));
//         printVerbose(game.stack.isEmpty() ? "Stack is empty." : "Stack is not empty.");
//         printVerbose(game.monsters.filter(m => m.isEngagedInCombat).length, " monsters engaged in combat.");
//         // printVerbose("Requirement list; ", JSON.stringify(bot.me.requirementListJSON(game), null, 2));
//         // bot.me.requirementListPRINT();

//     }
// });