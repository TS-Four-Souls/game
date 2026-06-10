import { Game } from "@/models/game";
import { Player } from "@/models/entities/player";
import { ItemCard, LootCard, CharacterCard, MonsterCard } from "@/models/cards";
import type { HistoricEntry, UserRequest } from "@/models/historyHandler";
import { isParameterKey, type Issuer, type IdentifierType, type DetailedState } from "@/shared/api";
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

function isUserRequestEntry(entry: unknown): entry is UserRequest {
  return (
    isObject(entry) &&
    typeof entry.type === "string" &&
    (entry.type !== "death" &&
      entry.type !== "damage" &&
      entry.type !== "effect" &&
      entry.type !== "LootCardEffect" &&
      entry.type !== "diceRoll")
  );
}

function remapIssuer(game: Game, issuer: Issuer): Issuer {
  const player = game.getPlayerById(issuer);
  return player.id;
}

function remapSubmitSelectionRequestId(
  game: Game,
  issuer: Issuer,
  loggedRequestId: string,
  requestIdMap: Map<string, string>,
): string {
  const mapped = requestIdMap.get(loggedRequestId);
  if (mapped) {
    return mapped;
  }
  const player = game.getPlayerByIssuer(issuer);
  const pendingRequestId = game.detailedStateJSON(player).me.pendingSelection?.requestId;
  if (!pendingRequestId) {
    return loggedRequestId;
  }

  requestIdMap.set(loggedRequestId, pendingRequestId);
  return pendingRequestId;
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

type GameStateComparison = {
  equal: boolean;
  differences: string[];
};

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

function parseLogLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // Fallback for file format like: "<isoDate> - <historyId> - {json}"
    const firstJsonChar = Math.min(
      ...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0),
    );
    if (!Number.isFinite(firstJsonChar) || firstJsonChar < 0) {
      return null;
    }
    return JSON.parse(trimmed.slice(firstJsonChar));
  }
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
  // console.log(`Loading game from logs with ${logs.length} entries...`);
  const game = new Game(findInitialSeed(logs));
  const characterByPlayer = new Map<string, string>();
  const submitSelectionRequestIdMap = new Map<string, string>();
  let activeResolutionPromise: Promise<void> | null = null;
  let activeTurnCallbackPromise: Promise<void> | null = null;
  let activeGiveCoinsPromise: Promise<boolean> | null = null;

  const waitForPendingSelectionRequestId = async (
    issuer: Issuer,
    maxTicks: number = 25,
  ): Promise<string | undefined> => {
    for (let i = 0; i < maxTicks; i++) {
      const player = game.getPlayerByIssuer(issuer);
      const requestId = game.detailedStateJSON(player).me.pendingSelection?.requestId;
      if (requestId) {
        return requestId;
      }
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return undefined;
  };

  const awaitPromiseUntilSettledOrPendingSelection = async <T>(
    promise: Promise<T> | null,
    clear: () => void,
    maxTicks: number = 200,
  ): Promise<void> => {
    if (!promise) {
      return;
    }

    for (let i = 0; i < maxTicks; i++) {
      if (game.hasPendingSelections) {
        return;
      }

      const outcome = await Promise.race([
        promise.then(() => "settled" as const),
        new Promise<"tick">((resolve) => setTimeout(() => resolve("tick"), 0)),
      ]);

      if (outcome === "settled") {
        clear();
        return;
      }
    }
  };

  const settleActivePromisesAfterSubmitSelection = async (): Promise<void> => {
    await awaitPromiseUntilSettledOrPendingSelection(activeResolutionPromise, () => {
      activeResolutionPromise = null;
    });
    await awaitPromiseUntilSettledOrPendingSelection(activeTurnCallbackPromise, () => {
      activeTurnCallbackPromise = null;
    });
    await awaitPromiseUntilSettledOrPendingSelection(activeGiveCoinsPromise, () => {
      activeGiveCoinsPromise = null;
    });
  };

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
          game.start(entry.players);
          verifyRecordedCharactersAfterStart(game, characterByPlayer);
          break;
        }

        case "Reset": {
          throw new Error("Reset are supposed to be handled by creating a new game instance, but a Reset entry was found in logs. This may indicate an issue with log formatting or replay logic.");
          break;
        }

        case "DeclareAttack": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          game.actions.declareAttack(player);
          break;
        }

        case "AttackMonster": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          executeAttackMonsterRequest(game, entry.payload, player);
          break;
        }

        case "GameState": {
          const state = entry.gameState;
          if (!state) {
            throw new Error("GameState entry is missing gameState payload");
          }
          const comparison = compareGameState(game.detailedStateJSON(game.players[0]!), state);
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
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          game.actions.attackRoll(player);
          break;
        }

        case "Resolve": {
          // Start resolution and track the promise so we can wait for it after selections are submitted
          activeResolutionPromise = game.actions.resolveStack();
          await Promise.resolve(); // Ensure any synchronous effects are processed before potentially awaiting resolution
          await Promise.resolve(); // Ensure any synchronous effects are processed before potentially awaiting resolution
          await Promise.resolve(); // Ensure any synchronous effects are processed before potentially awaiting resolution
          await Promise.resolve(); // Ensure any synchronous effects are processed before potentially awaiting resolution
          await Promise.resolve(); // Ensure any synchronous effects are processed before potentially awaiting resolution
          if(!game.hasPendingSelections) {
            await activeResolutionPromise;
            activeResolutionPromise = null;
          }
          break;
        }

        case "SubmitSelection": {
          const issuer = remapIssuer(game, entry.issuer);
          const requestId = remapSubmitSelectionRequestId(
            game,
            issuer,
            entry.payload.requestId,
            submitSelectionRequestIdMap,
          );

          try {
            const player = game.getPlayerByIssuer(issuer);
            game.submitSelection(player, requestId, entry.payload.selections);
            await settleActivePromisesAfterSubmitSelection();
          } catch (error) {
            if (
              !(error instanceof Error) ||
              error.message !== "No pending selection found for this request ID"
            ) {
              throw error;
            }

            const fallbackRequestId = await waitForPendingSelectionRequestId(issuer);
            if (!fallbackRequestId) {
              throw error;
            }

            const player = game.getPlayerByIssuer(issuer);
            submitSelectionRequestIdMap.set(entry.payload.requestId, fallbackRequestId);
            game.submitSelection(player, fallbackRequestId, entry.payload.selections);
            await settleActivePromisesAfterSubmitSelection();
          }
          break;
        }

        case "InsertStackElementBefore": {
          game.insertStackElementBefore(
            game.getPlayerByIssuer(remapIssuer(game, entry.issuer)),
            entry.payload.elementToMoveStackId,
            entry.payload.targetStackId,
          );
          break;
        }

        case "PlayCard": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          executePlayCardRequest(game, entry.payload, player);
          break;
        }

        case "Activate": {
          try {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
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
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          await executeActivateRoomRequest(game, entry.payload, player);
          break;
          } catch (error) {
            // In some cases (e.g. activating a card that was just purchased in the same turn) the exact request may not be reproducible due to differences in request IDs or game state at the time of the request. In those cases, we can log a warning and skip the activation to allow the rest of the log replay to continue.
            throw new Error(`Failed to replay ActivateRoom request from logs: ${error instanceof Error ? error.message : error}`);
            break;
          }
        }

        case "DeclarePurchase": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          game.actions.declarePurchase(player);
          break;
        }

        case "CancelPurchase": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          game.actions.cancelPurchase(player);
          break;
        }

        case "Purchase": {
          game.actions.purchase(game.getPlayerByIssuer(remapIssuer(game, entry.issuer)), entry.payload.index);
          break;
        }

        case "EndTurn": {
          activeTurnCallbackPromise = game.actions.nextTurn(game.getPlayerByIssuer(remapIssuer(game, entry.issuer)));
          if(!game.hasPendingSelections) {
            await activeTurnCallbackPromise;
            activeTurnCallbackPromise = null;
          }
          break;
        }

        case "GiveCoins": {
          const from = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const to = game.getPlayerById(entry.payload.target);
          // Match live server behavior: request is not awaited, and resolution continues
          // once SubmitSelection arrives in subsequent log entries.
          activeGiveCoinsPromise = game.giveCoins(from, to, entry.payload.coins);
          if(!game.hasPendingSelections) {
            await activeGiveCoinsPromise;
            activeGiveCoinsPromise = null;
          }
          break;
        }

        case "DebugLootTop": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const topCard = game.decks.loot.cards[0];
          if(topCard)
            game.actions.debugLoot(player, [topCard], false);
          break;
        }

        case "DebugGainTreasureTop": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const topCard = game.decks.treasure.cards[0];
          if(topCard)
            game.actions.debugGainTreasures(player, [topCard]);
          break;
        }

        case "DebugLoot": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const cards = (entry.payload as any).cards;
          if (cards && cards.length > 0) {
            for (const ref of cards) {
              const card = game.obtainCard(ref.slug, ref.globalId) as LootCard;
              game.addCardToHand(player, card);
            }
          }
          break;
        }

        case "DebugGainCoins": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          game.actions.debugGainCoins(player, entry.payload.coins);
          break;
        }

        case "DebugPutMonsterCardInSlot": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const cardRef = entry.payload.card;
          if (cardRef) {
            const card = game.obtainCard(cardRef.slug, cardRef.globalId) as MonsterCard;
            if (!card) {
              throw new Error(`Card not found in the game: ${cardRef.slug}`);
            }
            const index = game.monsterSlots._slots.map((slot) => slot[slot.length - 1]?.globalId).indexOf(entry.payload.toCover.globalId);
            game.actions.debugPutMonsterCardInSlot(player, card, index);
          }
          break;
        }

        case "DebugGainTreasure": {
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const cards = (entry.payload as any).cards;
          if (cards && cards.length > 0) {
            for (const ref of cards) {
              const card = game.obtainCard(ref.slug, ref.globalId);
              if (!(card instanceof ItemCard)) {
                throw new Error(`Card ${ref.slug} is not an ItemCard`);
              }
              game.addInPlay(player, card);
            }
          }
          break;
        }

        
        case "DebugRemoveCards":
          const player = game.getPlayerByIssuer(remapIssuer(game, entry.issuer));
          const payload = entry.payload as any;
          if (payload.cards !== undefined || payload.slugs !== undefined) {
                const refs = (payload.cards ?? payload.slugs)!;
                const cardsToRemove = game
                  .playerCardsAndGameOwnedCards(player)
                  .filter((c) => refs.some((ref: IdentifierType) => c.slug === ref.slug && c.globalId === ref.globalId));
                game.actions.debugRemoveCards(player, cardsToRemove);
              }
          break;

        default:
          // Exhaustiveness safeguard for future request types.
          throw new Error(`Unsupported log entry type for replay: ${(entry as any).type}`);
      }
  }
  game.loadHistory(logs);
  for(const player of game.players)
    player.animations(true);
  game.seed = ""; // Change the seed to avoid cheating by saving and reloading to predict random outcomes.
  return game;
}
