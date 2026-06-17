import { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { TargetBuilder } from "@/models/targetBuilder";
import { Game } from "@/models/game";
import { type HistoricEntry, type UserRequest, isStackElementJson } from "@/models/handlers/historyHandler";
import { type DetailedState, type IdentifierType, type Issuer } from "@/shared/api";
import { Player } from "../models/entities/player";
import {
  executeActivateRequest,
  executeActivateRoomRequest,
  executeAttackMonsterRequest,
  executePlayCardRequest,
} from "@/utils/gameRequestHelpers";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrivateEntry(
  entry: unknown,
): entry is Extract<HistoricEntry, { private: true }> {
  return isObject(entry) && entry.private === true && typeof entry.type === "string";
}

function isUserRequestEntry(entry: HistoricEntry): entry is UserRequest {
  return (
    isObject(entry) &&
    typeof entry.type === "string" &&
    isStackElementJson(entry) === false
  );
}

function remapIssuer(game: Game, issuer: Issuer): Issuer {
  const player = game.entityHandler.getPlayerById(issuer);
  return player.id;
}

function applySetGameParameter(game: Game, payload: HistoricEntry & { type: "GameParameters" }): void {
  game.gameParameters.loadFromJson(payload.gameParameters as any);
}

function verifyRecordedCharactersAfterStart(
  game: Game,
  characterByPlayer: Map<string, string>,
): void {
  if (characterByPlayer.size === 0 || characterByPlayer.size !== game.players.length) {
    return;
  }

  for (const player of game.players) {
    const expectedSlug = characterByPlayer.get(player.id);
    if (!expectedSlug) {
      continue;
    }
    if (player.character.slug !== expectedSlug) {
      throw new Error(
        `Character mismatch after replay start for player ${player.id}: expected ${expectedSlug}, got ${player.character.slug}`,
      );
    }
  }
}

interface GameStateComparison {
  equal: boolean;
  differences: string[];
}

function normalizeDetailedStateForComparison(state: DetailedState): DetailedState {
  const normalized = structuredClone(state);
  if (normalized.me.pendingSelection) {
    // Request IDs are generated at runtime and can differ between replay and recorded logs.
    normalized.me.pendingSelection.requestId = "<ignored>";
  }
  normalized.animations = [];
  console.log("Normalized game state for comparison:", normalized.animations);
  return normalized;
}


function collectDifferences(
  left: unknown,
  right: unknown,
  path: string,
  differences: string[],
  maxDifferences: number,
): void {
  if (differences.length >= maxDifferences) {
    return;
  }

  if (Object.is(left, right)) {
    return;
  }
  function formatDiffValue(value: unknown): string {
    if (value === undefined) {
      return "undefined";
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray) {
      differences.push(
        `${path}: type mismatch (left=${leftIsArray ? "array" : typeof left}, right=${rightIsArray ? "array" : typeof right})`,
      );
      return;
    }

    const leftArray = left as unknown[];
    const rightArray = right as unknown[];
    if (leftArray.length !== rightArray.length) {
      differences.push(`${path}: array length mismatch (left=${leftArray.length}, right=${rightArray.length})`);
      if (differences.length >= maxDifferences) {
        return;
      }
    }

    const minLength = Math.min(leftArray.length, rightArray.length);
    for (let index = 0; index < minLength; index++) {
      collectDifferences(leftArray[index], rightArray[index], `${path}[${index}]`, differences, maxDifferences);
      if (differences.length >= maxDifferences) {
        return;
      }
    }
    return;
  }

  const leftIsObject = isObject(left);
  const rightIsObject = isObject(right);
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) {
      differences.push(
        `${path}: type mismatch (left=${leftIsObject ? "object" : typeof left}, right=${rightIsObject ? "object" : typeof right})`,
      );
      return;
    }

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set<string>([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);

    for (const key of Array.from(keys).sort()) {
      const leftHasKey = Object.prototype.hasOwnProperty.call(leftRecord, key);
      const rightHasKey = Object.prototype.hasOwnProperty.call(rightRecord, key);
      const leftValue = leftRecord[key];
      const rightValue = rightRecord[key];

      if (!leftHasKey  || !rightHasKey) {
        // Treat missing and explicit undefined as equivalent: JSON serialization
        // frequently drops undefined fields.
        if ((!leftHasKey && rightValue === undefined) || (!rightHasKey && leftValue === undefined)) {
          continue;
        }

        differences.push(
          `${path}.${key}: ${leftHasKey ? "missing on right" : "missing on left"} (left=${formatDiffValue(leftValue)}, right=${formatDiffValue(rightValue)})`,
        );
        if (differences.length >= maxDifferences) {
          return;
        }
        continue;
      }

      collectDifferences(leftValue, rightValue, `${path}.${key}`, differences, maxDifferences);
      if (differences.length >= maxDifferences) {
        return;
      }
    }
    return;
  }

  differences.push(`${path}: value mismatch (left=${formatDiffValue(left)}, right=${formatDiffValue(right)})`);
}

function compareGameState(original: DetailedState, loaded: DetailedState): GameStateComparison {
  const normalizedOriginal = normalizeDetailedStateForComparison(original);
  const normalizedLoaded = normalizeDetailedStateForComparison(loaded);
  const differences: string[] = [];
  const maxDifferences = 25;

  collectDifferences(normalizedOriginal, normalizedLoaded, "gameState", differences, maxDifferences);

  return {
    equal: differences.length === 0,
    differences,
  };
}

/**
 * In loading a game, replace asynchronous selection handling with a direct mapping from logged request IDs to the current pending selection request IDs in the game. T
 * his allows us to bypass the complexities of trying to perfectly replay the timing of asynchronous events and directly submit selections as they appear in logs.
 * @param game 
 * @param logs 
 */
function setupLoadingSubmitSelectionHandling(game: Game, logs: HistoricEntry[]): void {
  const submitSelectionEntries = logs.filter(
    (entry): entry is Extract<HistoricEntry, { type: "SubmitSelection" }> =>
      isUserRequestEntry(entry) && entry.type === "SubmitSelection",
  );
  let i = 0;
  game.selectMultiple = async <T>(selections: {
            player: Player;
            min: number;
            max: number;
            options: T[];
            description: string;
            skippable?: boolean;
            canUseOnBoardSelection: boolean;
          }[]): Promise<{ playerId: string; selected: T[]; remaining: T[] }[]> => {
    const results: { playerId: string; selected: T[]; remaining: T[] }[] = [];
    for (const selection of selections) {

      const entry = submitSelectionEntries[i++];
      if(entry === undefined)
        throw new Error("No more SubmitSelection entries in logs to match the game's selectMultiple call. This may indicate a mismatch between the game state and the logs, or an issue with log formatting.");
      const resolvedOptions = entry.payload.selections.map((id) => {
            const option = TargetBuilder["resolveIdentifier"](id, selection.options);
            if (option === undefined) {
              throw new Error(`Invalid selection identifier: ${id.payload}`);
            }
            return option;
          });
      results.push({playerId: entry.issuer, selected: resolvedOptions, remaining: [selection.options.filter((option) => !resolvedOptions.includes(option))] as T[]});
    }
    return results;
  };
}


function findInitialSeed(logs: unknown[]): string {
  const entry = logs.find(
    (log): log is Extract<HistoricEntry, { private: true; type: "randomSeed" }> =>
      isPrivateEntry(log) && log.type === "randomSeed" && typeof log.seed === "string",
  );
  if(!entry || !entry.seed || entry.seed === "")
    throw new Error("No valid randomSeed entry found in logs for game initialization.");
  return entry.seed;
}

export async function loadGameFromLogs(logs: HistoricEntry[], verbose: number = 0): Promise<Game> {
  if(verbose >= 1)
    console.log(`Loading game from logs with ${logs.length} entries...`);
  const game = new Game(findInitialSeed(logs));
  const characterByPlayer = new Map<string, string>();

  const normalMultipleSelection = game.selectMultiple;
  setupLoadingSubmitSelectionHandling(game, logs);

  for (const [index, entry] of logs.entries()) {
      if (!isUserRequestEntry(entry) && !isPrivateEntry(entry)) {
        // Stack element snapshots are not replayed directly.
        continue;
      }

      if(verbose >= 1)
        console.log(`Replaying log entry ${index}: ${JSON.stringify(entry)}\n`);
      switch (entry.type) {
        case "CreateRoom":
        case "JoinRoom":
        case "LeaveRoom":
        case "Rejoin":
        case "IsGameOngoing":
        case "LoadGame":
        case "DebugListCardsICanRemove":
        case "DebugListMonsterDeck":
        case "DebugListTreasure":
        case "DebugListLoot":
        case "Join": 
        // SubmitSelection is handled by the custom selectMultiple override, so we skip it here.
        case "SubmitSelection": 
          // Transport/lifecycle events that don't mutate core game state directly.
          break;

        case "character": {
          characterByPlayer.set(entry.playerId, entry.slug);
          break;
        }


        case "randomSeed": {
          game.seed = entry.seed;
          break;
        }

        case "GameParameters": {
          applySetGameParameter(game, entry as HistoricEntry & { type: "GameParameters" });
          break;
        }

        case "SetGameParameter": {
          const payload = entry.payload;
          game.gameParameters.setParameterByKey(payload.parameter, payload.value);
          break;
        }

        case "Start": {
          await game.start(entry.players);
          verifyRecordedCharactersAfterStart(game, characterByPlayer);
          break;
        }

        case "Reset": {
          throw new Error("Reset are supposed to be handled by creating a new game instance, but a Reset entry was found in logs. This may indicate an issue with log formatting or replay logic.");
          break;
        }

        case "DeclareAttack": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          game.actions.declareAttack(player);
          break;
        }

        case "AttackMonster": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          await executeAttackMonsterRequest(game, entry.payload, player);
          break;
        }

        case "GameState": {
          const state = entry.gameState;
          if (!state) {
            throw new Error("GameState entry is missing gameState payload");
          }
          if(game.players[0] === undefined)
            throw new Error("GameState entry is missing player data");
          const comparison = compareGameState(game.detailedStateJSON(game.players[0]), state);
          if (!comparison.equal) {
            const differencesMessage = comparison.differences
              .map((difference, index) => `${index + 1}. ${difference}`)
              .join("\n");
            throw new Error(
              `Current game state does not match GameState entry from logs. Differences:\n${differencesMessage}`,
            );
          }
          break;
        }

        case "AttackRoll": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          game.actions.attackRoll(player);
          break;
        }

        case "Resolve": {
          // Start resolution and track the promise so we can wait for it after selections are submitted
            await Promise.resolve(); // Ensure any synchronous effects are processed before checking for pending selections
            await Promise.resolve(); // Ensure any synchronous effects are processed before checking for pending selections
            await Promise.resolve(); // Ensure any synchronous effects are processed before checking for pending selections
            await Promise.resolve(); // Ensure any synchronous effects are processed before checking for pending selections
            await Promise.resolve(); // Ensure any synchronous effects are processed before checking for pending selections
            await game.actions.resolveStack();
          break;
        }

        case "InsertStackElementBefore": {
          game.insertStackElementBefore(
            game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer)),
            entry.payload.elementToMoveStackId,
            entry.payload.targetStackId,
          );
          break;
        }

        case "PlayCard": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          executePlayCardRequest(game, entry.payload, player);
          break;
        }

        case "Activate": {
          try {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          await executeActivateRequest(game, entry.payload, player);
          break;
          } catch (error) {
            // In some cases (e.g. activating a card that was just purchased in the same turn) the exact request may not be reproducible due to differences in request IDs or game state at the time of the request. In those cases, we can log a warning and skip the activation to allow the rest of the log replay to continue.
            throw new Error(`Failed to replay Activate request from logs: ${error instanceof Error ? error.message : error}`);
            break;
          }
        }

        case "ActivateRoom": {
          try {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          await executeActivateRoomRequest(game, entry.payload, player);
          break;
          } catch (error) {
            // In some cases (e.g. activating a card that was just purchased in the same turn) the exact request may not be reproducible due to differences in request IDs or game state at the time of the request. In those cases, we can log a warning and skip the activation to allow the rest of the log replay to continue.
            throw new Error(`Failed to replay ActivateRoom request from logs: ${error instanceof Error ? error.message : error}`);
            break;
          }
        }

        case "DeclarePurchase": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          game.actions.declarePurchase(player);
          break;
        }

        case "CancelPurchase": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          game.actions.cancelPurchase(player);
          break;
        }

        case "Purchase": {
          game.actions.purchase(game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer)), entry.payload.index);
          break;
        }

        case "EndTurn": {
          await game.actions.nextTurn(game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer)));
          break;
        }

        case "GiveCoins": {
          const from = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const to = game.entityHandler.getPlayerById(entry.payload.target);
          // Match live server behavior: request is not awaited, and resolution continues
          // once SubmitSelection arrives in subsequent log entries.
          await game.giveCoins(from, to, entry.payload.coins);
          break;
        }

        case "DebugLootTop": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const topCard = game.decks.loot.cards[0];
          if(topCard)
            game.actions.debugLoot(player, [topCard], false);
          break;
        }

        case "DebugGainTreasureTop": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const topCard = game.decks.treasure.cards[0];
          if(topCard)
            game.actions.debugGainTreasures(player, [topCard]);
          break;
        }

        case "DebugLoot": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const cards = entry.payload.cards;
          if (cards && cards.length > 0) {
            for (const ref of cards) {
              const card = game.obtainCard(ref.slug, ref.globalId) as LootCard;
              game.cardHandler.addCardToHand(player, card);
            }
          }
          break;
        }

        case "DebugGainCoins": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          game.actions.debugGainCoins(player, entry.payload.coins);
          break;
        }

        case "DebugPutMonsterCardInSlot": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const cardRef = entry.payload.card;
          if (cardRef) {
            const card = game.obtainCard(cardRef.slug, cardRef.globalId) as MonsterCard;
            if (!card) {
              throw new Error(`Card not found in the game: ${cardRef.slug}`);
            }
            const index = game.encounters._slots.map((slot) => slot[slot.length - 1]?.globalId).indexOf(entry.payload.toCover.globalId);
            game.actions.debugPutMonsterCardInSlot(player, card, index);
          }
          break;
        }

        case "DebugGainTreasure": {
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const cards = entry.payload.cards;
          if (cards && cards.length > 0) {
            for (const ref of cards) {
              const card = game.obtainCard(ref.slug, ref.globalId);
              if (!(card instanceof ItemCard)) {
                throw new Error(`Card ${ref.slug} is not an ItemCard`);
              }
              game.cardHandler.addInPlay(player, card);
            }
          }
          break;
        }

        
        case "DebugRemoveCards":
          const player = game.entityHandler.getPlayerById(remapIssuer(game, entry.issuer));
          const payload = entry.payload;
          if (payload.cards !== undefined) {
                const refs = payload.cards;
                const cardsToRemove = game
                  .playerCardsAndGameOwnedCards(player)
                  .filter((c) => refs.some((ref: IdentifierType) => c.slug === ref.slug && c.globalId === ref.globalId));
                game.actions.debugRemoveCards(player, cardsToRemove);
              }
          break;

        default:
          // Exhaustiveness safeguard for future request types.
          throw new Error(`Unsupported log entry type for replay: ${entry.type}`);
      }
  }
    game.selectMultiple = normalMultipleSelection;

  game.loadHistory(logs);
  for(const player of game.players)
    player.animations(true);
  game.seed = ""; // Change the seed to avoid cheating by saving and reloading to predict random outcomes.
  return game;
}
