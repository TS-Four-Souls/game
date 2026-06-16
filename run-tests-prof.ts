import { TargetBuilder } from "@/models/targetBuilder";
import { print, shuffle } from "@/utils/auxiliary";
import { beforeEach, describe, expect, it } from "bun:test";
import { ActionType, Bot, DeclareAttackOnEntityAction, PlayLootAction, PurchaseAction, ResolveStackAction, UseItemAction } from "./src/models/bots";
import { Game } from "./src/models/game";
import { Player } from "./src/models/entities/player";
import { setupTestGame, randomSelect } from "./src/tests/testHelpers";
   
let fixedSeed = false;
let VERBOSE = fixedSeed;
let gameId = 0;
for(let i = 0; i < 100; i++){

// console.profile();
    let game: Game;
    let player1: Player;
    let player2: Player;
    let shouldRerun = true;
    let uniqueIdCounter = 0;

        let seed = fixedSeed ? "0.9263096862959573" : Math.random().toString();
        // if(!shouldRerun)return;
        if(fixedSeed) shouldRerun = false;
        const setup = await setupTestGame({
                    playerCount: 2,
                    randomSeed: seed,
                    rooms: true,
                    bonusSouls: "random",
                });
        console.log(`${gameId++} Random seed for this test: \"${seed}\"`);
        game = setup.game;
        player1 = setup.player1;
        player2 = setup.player2!;
        game.select = randomSelect;

        const verbose = VERBOSE;
        function printVerbose(...args: any[]) {
            if(verbose)
                console.log(...args);
        }
        Math.random = game.random; // Override Math.random to make the test deterministic and reproducible
        const bot1 = new Bot(game, player1);
        const bot2 = new Bot(game, player2);
        let remainingActions = 10000;
        let currentRound = 0;
        while(game.turnHandler.round < 100) {
            if(game.turnHandler.round > currentRound) {
                currentRound = game.turnHandler.round;
            }
            
            if(remainingActions <= 0)
                break;
            remainingActions--;
            // await game.resolveEntireStack();
            // console.log(game.encounters.slots.flat().map(c => c ? c.name : "empty").join(", "));
            const bot = game.currentPlayer === player1 ? bot1 : bot2;
            // printVerbose(game.monsters.filter(m => m.isEngagedInCombat).length, " monsters engaged in combat.");
            // printVerbose("compute playable actions... ");
            let action = bot.randomFeasibleAction;
            // printVerbose("Done.", actions.map(a => a.type + (a instanceof UseItemAction ? ` (${a.item.name})` : "")).join(", "));
            // console.log(game.attackableEntities.map(e => e.id));

            if(action === null) {
                
                printVerbose(bot.me.attackThisTurn <= 0, !bot.me.hasAttackRequirement, !bot.me.hasFreeAttackRemaining);
                printVerbose(`${bot.me.isEngagedInCombat ? "Engaged" : "Not engaged"}`);
                printVerbose(game.hasPendingSelections ? " There are pending selections." : "No pending selections.");
                printVerbose(game.actions.canEndTurn(bot.me, false));
                printVerbose(bot.me.attackThisTurn, " attacks remaining.");
                printVerbose(bot.me.isDead ? "Player is dead." : "Player is alive.");
                for(const monster of game.monsters) {
                    printVerbose(monster.id, game.actions.canDeclareAttackOnEntity(bot.me, monster) === true ? "Can declare attack on monster." : game.actions.canDeclareAttackOnEntity(bot.me, monster));
                }
                printVerbose(game.actions.canDeclareAttackOnEntity(bot.me, "topDeck") === true ? "Can declare attack on monster." : game.actions.canDeclareAttackOnEntity(bot.me, "topDeck"));
                printVerbose(bot.me.hasAttackRequirement ? "Player has attack requirement." : "Player has no attack requirement.");
                printVerbose(game.actions.canEndTurn(bot.me, false) === true ? "Player can end turn." : game.actions.canEndTurn(bot.me, false));
                printVerbose(game.stack.isEmpty() ? "Stack is empty." : "Stack is not empty.");
                printVerbose(game.monsters.filter(m => m.isEngagedInCombat).length, " monsters engaged in combat.");
                // printVerbose("Requirement list; ", JSON.stringify(bot.me.requirementListJSON(game)));
                // printVerbose("Monsters: ", game.monsters.map(m => `${m.card.name}(${m.currentHealthPoints}HP)${m.isEngagedInCombat ? " engaged" : ""}${m.isDead ? " dead" : ""}`).join(", "));
                // console.log(JSON.stringify(game.detailedStateJSON(game.currentPlayer)));

                throw new Error(`Seed: ${game.seed}, Player ${bot.me.id} has no playable actions at round ${game.turnHandler.round}. This should not happen.`);
                printVerbose(`Round ${game.turnHandler.round}, Player ${bot.me.id} has no playable actions. Resolving stack...`);
                // Nothing to do, resolve stack and continue
                await game.resolveEntireStack();
                continue;
            }
            // printVerbose("Monsters: ", game.monsters.map(m => `${m.card.name}(${m.currentHealthPoints}HP)${m.isEngagedInCombat ? " engaged" : ""}${m.isDead ? " dead" : ""}`).join(", "));
            
            printVerbose(`${++uniqueIdCounter} Round ${game.turnHandler.round}, Player ${bot.me.id} try execute action: ${action.type}`);
            // printVerbose("attack requirement: ", bot.me.hasAttackRequirement, " free attacks remaining: ", bot.me.hasFreeAttackRemaining, " attacks remaining: ", bot.me.attackThisTurn);
            // printVerbose(bot.me.inPlay.map(i => i.name).join(", "));
                
            switch(action.type) {
                case ActionType.PURCHASE:
                    if(action instanceof PurchaseAction === false)
                        throw new Error("Expected PurchaseAction");
                    const index = Math.floor(Math.random() * (game.shop._slots.length + 1));
                    printVerbose(`    Try ${bot.me.id} executed action: ${action.type}, ${index === game.shop._slots.length ? "top of the treasure deck" : `slot ${index} (${game.shop._slots[index] && game.shop._slots[index]![0] ? game.shop._slots[index]![0].name : "empty"})`}`);
                    if(index === game.shop._slots.length)
                        action.index = "top";
                    else
                        action.index = index;
                    break;
                case ActionType.USE_ITEM:
                    if(action instanceof UseItemAction === false)
                        throw new Error("Expected UseItemAction");
                    printVerbose(`    Try ${bot.me.id} executed action: ${action.type}, ${`item: ${action.item.name}`}`);
                    try {
                        if(bot.game.actions.canActivate(action.item, bot.me) !== true)
                            throw new Error(`Item ${action.item.name} cannot be activated by player ${bot.me.id}`);
                        const result = TargetBuilder.buildRandomValidTargets(game, bot.me, action.item, "inPlay");
                        if(typeof result === "string")                         
                            throw new Error(`Failed to build targets for item ${action.item.name}: ${result}`);
                        action.targets = result.targets;
                        action.index = result.index;
                    } catch (targetErr) {
                        console.error(`      ✗ Error building targets for ${action.item.name}:`, targetErr && (targetErr as Error).message);
                        throw targetErr;
                    }
                    break;
                case ActionType.PLAY_LOOT:
                    if(action instanceof PlayLootAction === false)
                        throw new Error("Expected PlayLootAction");
                    const playAction = action as PlayLootAction;
                    const card = bot.me.hand.cards[playAction.index]!;
                    
                    const res = TargetBuilder.buildRandomValidTargets(game, bot.me, card, "hand");
                    // if(game.currentPlayer.hand.cards[action.index]!.slug.includes("fsp2-questionmark_card"))
                    printVerbose(`    Try ${bot.me.id} executed action: ${action.type}, ${`loot: ${game.currentPlayer.hand.cards[action.index]!.slug}`}`);
                    if(typeof res === "string")
                        throw new Error(`Failed to build targets for loot card ${card.name}: ${res}`);
                    if (typeof res !== "string") {
                        action.targets = res.targets;
                    }
                    break;
                case ActionType.END_TURN:
                    printVerbose(`\n`);
                    break;
                case ActionType.ATTACK:
                    if(action instanceof DeclareAttackOnEntityAction === false)
                        throw new Error("Expected DeclareAttackOnEntityAction");
                    printVerbose(`    declare attack on: ${action.target === "topDeck" ? "top of the monster deck" : action.target.card.name}`);
                    // printVerbose("Monsters: ", game.monsters.map(m => `${m.card.name}(${m.currentHealthPoints}HP)${m.isEngagedInCombat ? " engaged" : ""}${m.isDead ? " dead" : ""}`).join(", "));

                    break;
                case ActionType.RESOLVE_STACK:
                    printVerbose(`    Try ${bot.me.id} executed action: ${action.type} to resolve ${JSON.stringify(game.stack.peek()?.json.type, null, 2)}, stack size: ${game.stack.elements.length}`);
                    if(game.stack.size > 100) {
                        throw new Error("Stack size exceeded 1000");
                    }
                    break;
                case ActionType.DECLARE_ATTACK:
                case ActionType.DECLARE_PURCHASE:
                case ActionType.CANCEL_PURCHASE:
                case ActionType.ROLL:
                    printVerbose(`    Try ${bot.me.id} executed action: ${action.type}`);
                    break;
                default:
                    throw new Error(`Unhandled action type: ${action.type}`);
            }
            try {
                await action.execute(game);
                // printVerbose(`  ✓ ${action.type} executed successfully`);
                // printVerbose(`  Resolving stack...${game.stack.elements.map(e => JSON.stringify(e.json)).join(", ")}`);
                // let maxIterations = 5; // Prevent infinite loops in case of bugs
                // while(!game.stack.isEmpty() && maxIterations > 0) {
                //     await game.resolveEntireStack();
                //     maxIterations--;
                // }
                // expect(game.stack.isEmpty()).toBe(true);
            } catch (execErr) {
                // deck is so empty that even after resetting the discard pile there's not enough cards to draw, skip this action and continue the test, as this is a valid game state (can happen if the bot tries to buy from an empty treasure deck for example)
                if(execErr && 
                    ["Cannot purchase from shop slot 1, it is empty. The deck has 0 cards left.",
                    "Cannot purchase from shop slot 0, it is empty. The deck has 0 cards left.",
                    "Cannot purchase from shop slot 2, it is empty. The deck has 0 cards left.",
                    "Cannot draw card at position 0 from top even after resetting discard, deck of type treasure has only 0 cards.",
                    ].includes((execErr as Error).message) || (execErr as Error).message.includes("The deck has 0 cards left."))
                    continue;
                    // return true;
                // console.log(JSON.stringify(game.detailedStateJSON(game.currentPlayer)));
                console.error(`  ✗ Error round ${game.turnHandler.round} executing ${action.type}:`, execErr && (execErr as Error).message);
                console.log("random seed: ", game.seed);
                throw execErr;
            }
            // printVerbose(`  ✓ Stack resolved`);
        }
      }