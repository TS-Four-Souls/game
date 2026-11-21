import { Game } from "@/models/game";
import { GameError } from "@/models/GameError";
import {
  type HistoricEntry,
  type PrivateData,
  type UserRequest,
  isStackElementJson,
} from "@/models/handlers/historyHandler";
import { TargetBuilder } from "@/models/targetBuilder";
import type { DetailedState } from "@/shared/api";
import * as helper from "@/utils/gameRequestHelpers";
import { toSerializedTranslation } from "./translation";

type SubmitSelectionEntry = Extract<UserRequest, { type: "SubmitSelection" }>;
type RandomSeedEntry = Extract<PrivateData, { type: "randomSeed" }>;

/** Recorded requests that don't change the game: the replay skips them. */
const IGNORED_REQUESTS: ReadonlySet<string> = new Set<string>([
  "CreateRoom", "JoinRoom", "LeaveRoom", "Join", "Rejoin", "IsGameOngoing", "LoadGame",
  "DebugListCardsICanRemove", "DebugListMonsterDeck", "DebugListTreasure", "DebugListLoot", "DebugListDices",
] satisfies UserRequest["type"][]);

const MAX_REPORTED_DIFFERENCES = 25;

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isPrivateEntry(entry: unknown): entry is PrivateData {
  return isObject(entry) && entry.private === true && typeof entry.type === "string";
}

function isUserRequestEntry(entry: HistoricEntry): entry is UserRequest {
  return isObject(entry) && !isPrivateEntry(entry) && typeof entry.type === "string" && !isStackElementJson(entry);
}

function isRandomSeed(entry: HistoricEntry): entry is RandomSeedEntry {
  return isPrivateEntry(entry) && entry.type === "randomSeed" && typeof entry.seed === "string";
}

/** Whether a request (or an answer) that changes the game was recorded after the given index. */
function hasRequestAfter(logs: HistoricEntry[], index: number): boolean {
  return logs.slice(index + 1).some((entry) => isUserRequestEntry(entry) && !IGNORED_REQUESTS.has(entry.type));
}

function replayError(message: string): GameError {
  return new GameError(message, toSerializedTranslation("error.behaviorError", { error: message }));
}

function findInitialSeed(logs: HistoricEntry[]): string {
  const seed = logs.find(isRandomSeed)?.seed;
  if (!seed) throw replayError("No valid randomSeed entry found in logs for game initialization.");
  return seed;
}

/** Clears what legitimately differs between a game and its replay. */
function normalizeState(state: DetailedState): DetailedState {
  const normalized = structuredClone(state);
  normalized.lastStackElementTimeStamp = 0;
  normalized.animations = [];
  for (const element of [...normalized.history, ...normalized.stack])
    if (element.reordering) element.reordering.groupId = "";
  if (normalized.me.pendingSelection) normalized.me.pendingSelection.requestId = 0;
  return normalized;
}

const kindOf = (value: unknown): string => (value === null ? "null" : Array.isArray(value) ? "array" : typeof value);

/** Yields, path by path, how two JSON values differ. */
function* differences(left: unknown, right: unknown, path: string): Generator<string> {
  if (left === right || Object.is(left, right)) return;
  const [leftKind, rightKind] = [kindOf(left), kindOf(right)];
  if (leftKind !== rightKind && (isObject(left) || isObject(right))) {
    yield `${path}: type mismatch (left=${leftKind}, right=${rightKind})`;
  } else if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) yield `${path}: array length mismatch (left=${left.length}, right=${right.length})`;
    for (let i = 0; i < Math.min(left.length, right.length); i++) yield* differences(left[i], right[i], `${path}[${i}]`);
  } else if (isObject(left) && isObject(right)) {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort())
      yield* differences(left[key], right[key], `${path}.${key}`);
  } else {
    yield `${path}: value mismatch (left=${JSON.stringify(left)}, right=${JSON.stringify(right)})`;
  }
}

function assertStateMatches(game: Game, recorded: DetailedState | undefined): void {
  if (!recorded) throw replayError("GameState entry is missing gameState payload");
  const viewer = game.players[0];
  if (viewer === undefined) throw replayError("GameState entry is missing player data");
  const found = differences(normalizeState(game.detailedStateJSON(viewer)), normalizeState(recorded), "gameState")
    .take(MAX_REPORTED_DIFFERENCES)
    .toArray();
  if (found.length > 0)
    throw replayError(`Current game state does not match GameState entry from logs. Differences:\n${found.map((difference, i) => `${i + 1}. ${difference}`).join("\n")}`);
}

/** Answers the game's prompts with the SubmitSelection entries of the logs instead of waiting for the players. */
function answerPromptsFromLogs(game: Game, logs: HistoricEntry[]): void {
  // Prompts open in requestId order: each one takes the first remaining answer of its player.
  const answers = logs
    .filter((entry): entry is SubmitSelectionEntry => isUserRequestEntry(entry) && entry.type === "SubmitSelection")
    .sort((a, b) => a.payload.requestId - b.payload.requestId);
  game.setSelectionHandlerNextId(answers.length);
  // Prompts open at the same time (e.g. each player chooses) resolve in the order they were answered (log order),
  // not in the order they were opened: the order can matter (cards put on the bottom of a deck, history).
  const logPosition = new Map(logs.map((entry, index) => [entry, index]));
  const waiting: { position: number; release: () => void }[] = [];
  const releaseNext = (): void => {
    waiting.sort((a, b) => a.position - b.position);
    waiting.shift()?.release();
  };

  game.selectMultiple = async (selections) => {
    const results = [];
    for (const selection of selections) {
      const index = answers.findIndex((answer) => answer.issuer === selection.player.id);
      if (index === -1)
        throw replayError(`No SubmitSelection entry left in logs to answer a selection of player ${selection.player.id}.`);
      const answer = answers.splice(index, 1)[0]!;
      // Let the prompts opened at the same time claim their answer, then resolve them in log order.
      const turn = new Promise<void>((release) => waiting.push({ position: logPosition.get(answer)!, release }));
      if (waiting.length === 1)
        queueMicrotask(releaseNext);
      await turn;

      const selected = answer.payload.selections.map((id) => {
        const option = TargetBuilder.resolveIdentifier(id, selection.options);
        if (option === undefined)
          throw new GameError(`Invalid selection identifier: ${JSON.stringify(id)}`, toSerializedTranslation("error.invalidSelectionIdentifier"));
        return option;
      });
      results.push({ playerId: answer.issuer, selected, remaining: selection.options.filter((option) => !selected.includes(option)) });
      if (waiting.length > 0)
        queueMicrotask(releaseNext);
    }
    return results;
  };
}

/** Rebuilds a game by replaying the requests of its logs; the prompts they open get the recorded answers. */
export async function loadGameFromLogs(
  logs: HistoricEntry[],
  verbose: number = 0,
): Promise<Game> {
  if (verbose >= 1)
    console.log(`Loading game from logs with ${logs.length} entries...`);

  const game = new Game(findInitialSeed(logs));
  const liveSelectMultiple = game.selectMultiple;
  answerPromptsFromLogs(game, logs);
  const playerOf = (request: { issuer: string }) => game.entityHandler.getPlayerById(request.issuer);
  const seedsAppliedDuringStart = new Set<HistoricEntry>();
  let startNotAwaited = false;

  try {
    for (const [index, entry] of logs.entries()) {
      if ((!isUserRequestEntry(entry) && !isPrivateEntry(entry)) || IGNORED_REQUESTS.has(entry.type))
        continue;
      if (verbose >= 1)
        console.log(`Replaying log entry ${index}\n`);

      switch (entry.type) {
        case "character": // Recorded again by start().
          break;
        case "SubmitSelection": // Given to its prompt by answerPromptsFromLogs.
          game.addToHistory(entry);
          break;
        case "randomSeed":
          if (!seedsAppliedDuringStart.has(entry))
            game.seed = entry.seed;
          break;
        case "GameParameters":
          game.gameParameters.loadFromJson(entry.gameParameters);
          break;
        case "SetGameParameter":
          game.gameParameters.setParameterByKey(entry.payload.parameter, entry.payload.value);
          game.addToHistory(entry);
          break;
        case "Start": {
          if (!hasRequestAfter(logs, index)) {
            // Saved during a start-of-game prompt: start() waits for the players' live answers.
            game.selectMultiple = liveSelectMultiple;
            void game.start(entry.players);
            game.addToHistory(entry);
            startNotAwaited = true;
            break;
          }
          const started = game.start(entry.players);
          game.addToHistory(entry);
          // Seeds right after Start come from loads that reseeded (see the end of this function) without awaiting
          // start() (branch above): apply them at the same point so the rest of start() consumes the same random values.
          for (const next of logs.slice(index + 1)) {
            if (!isRandomSeed(next)) break;
            game.seed = next.seed;
            seedsAppliedDuringStart.add(next);
          }
          await started;
          await game.awaitPromises();
          break;
        }
        case "Reset":
          throw replayError("Reset are supposed to be handled by creating a new game instance, but a Reset entry was found in logs.");
        case "GameState":
          // The state was recorded after start() completed: not reached yet if start() was not awaited.
          if (!startNotAwaited)
            assertStateMatches(game, entry.gameState);
          break;
        case "DeclareAttack":
          helper.executeDeclareAttackRequest(game, playerOf(entry));
          break;
        case "AttackMonster":
          await helper.executeAttackMonsterRequest(game, entry.payload, playerOf(entry));
          break;
        case "AttackRoll":
          helper.executeAttackRollRequest(game, playerOf(entry));
          break;
        case "Resolve":
          // Let the effects of the previous requests settle before Resolve checks that it is allowed.
          for (let tick = 0; tick < 5; tick++)
            await Promise.resolve();
          await helper.executeResolveRequest(game, playerOf(entry));
          break;
        case "InsertStackElementBefore":
          helper.executeInsertStackElementBeforeRequest(game, entry.payload, playerOf(entry));
          break;
        case "Activate":
          try {
            await helper.executeActivateRequest(game, entry.payload, playerOf(entry));
          } catch (error) {
            throw replayError(`Failed to replay Activate request from logs: ${error instanceof Error ? error.message : error}`);
          }
          break;
        case "DeclarePurchase":
          helper.executeDeclarePurchaseRequest(game, playerOf(entry));
          break;
        case "CancelPurchase":
          helper.executeCancelPurchaseRequest(game, playerOf(entry));
          break;
        case "Purchase":
          helper.executePurchaseRequest(game, entry.payload, playerOf(entry));
          break;
        case "EndTurn":
          await helper.executeEndTurnRequest(game, playerOf(entry));
          break;
        case "GiveCoins":
          await helper.executeGiveCoinsRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugLootTop":
          helper.executeDebugLootTopRequest(game, playerOf(entry));
          break;
        case "DebugGainTreasureTop":
          helper.executeDebugGainTreasureTopRequest(game, playerOf(entry));
          break;
        case "DebugLoot":
          helper.executeDebugLootRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugGainCoins":
          helper.executeDebugGainCoinsRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugPutMonsterCardInSlot":
          helper.executeDebugPutMonsterCardInSlotRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugGainTreasure":
          helper.executeDebugGainTreasureRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugChangeDiceResult":
          helper.executeDebugChangeDiceResultRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugPutRoom":
          helper.executeDebugPutRoomRequest(game, entry.payload, playerOf(entry));
          break;
        case "DebugRemoveCards":
          helper.executeDebugRemoveCardsRequest(game, entry.payload, playerOf(entry));
          break;
        default:
          throw replayError(`Unsupported log entry type for replay: ${(entry as HistoricEntry).type}`);
      }
    }
    for (const player of game.players)
      player.animations(true);
    game.seed = "";
    if (game.stack.isEmpty())
      game.assert.lastTimedAction = 0;
    return game;
  } finally {
    game.selectMultiple = liveSelectMultiple;
  }
}
