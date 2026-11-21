import { Game } from "@/models/game";
import { GameError } from "@/models/GameError";
import { GameParameters } from "@/models/gameParameters";
import type { HistoricEntry } from "@/models/handlers/historyHandler";
import { TargetBuilder } from "@/models/targetBuilder";
import type { DetailedState } from "@/shared/api";
import * as helper from "@/utils/gameRequestHelpers";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { toSerializedTranslation } from "@/utils/translation";
import { describe, expect, it } from "bun:test";

const idle = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0)); };

async function load(logs: HistoricEntry[]): Promise<Game> {
  const log = console.log; console.log = () => {};
  try {
    const game = await loadGameFromLogs(logs);
    await idle();
    return game;
  } finally {
    console.log = log;
  }
}

/** Starts a game as the server does, and lets it run until it waits for the players. */
async function startGame(characters: string[], mulliganOptions = 1): Promise<Game> {
  const params = new GameParameters(() => {});
  params.setParameterByKey("mulliganCharacterNbOptions", mulliganOptions);
  const game = new Game("load-seed", params);
  const players = characters.map((character, i) => ({ issuer: `P${i}`, character, user: `u${i}`, team: i + 1 }));
  game.startOfGameSetup(players);
  game.addToHistory({ type: "Start", players, params: params.toJson() });
  void game.atGameStartDecisions();
  await idle();
  return game;
}

async function answerFirstPendingSelection(game: Game): Promise<void> {
  const [selection] = game.pendingMultipleSelections.values();
  helper.executeSubmitSelectionRequest(game, { requestId: selection!.requestId, selections: TargetBuilder.convertToSelectionItems([selection!.options[0]]) },
    game.entityHandler.getPlayerById(selection!.playerId));
  await idle();
}

function parseLog(path: string): HistoricEntry[] {
  const fs = require('fs');
    const txt = fs.readFileSync(path, "utf8");
    if(txt === "")
      throw new GameError("Failed to read logs from file.", toSerializedTranslation("error.parsingError", {error: "Failed to read logs from file."}));
    const log = JSON.parse(txt) as HistoricEntry[];
    return log;
}

function parseState(path: string): DetailedState {
  const fs = require('fs');
    const txt = fs.readFileSync(path, "utf8");
    if(txt === "")
      throw new GameError("Failed to read logs from file.", toSerializedTranslation("error.parsingError", {error: "Failed to read logs from file."}));
  const state = JSON.parse(txt) as DetailedState;
  return state;
}

function compareGameState(original: DetailedState, loaded: DetailedState) {
  if(original.me.pendingSelection)
    {
      const requestId = original.me.pendingSelection?.requestId;
      if (requestId) {
        loaded.me.pendingSelection!.requestId = requestId;
      }
    }

  console.log("Loaded state:", JSON.stringify(loaded, null, 2));
  expect(loaded).toEqual(original);
}

async function compareGameStateFromFolder(folderPath: string) {
  const log = parseLog(`${folderPath}/log.json`);
  const originalState = parseState(`${folderPath}/state.json`);
  const loadedGame = await loadGameFromLogs(log);
  compareGameState(originalState, loadedGame.detailedStateJSON(loadedGame.players[0]!));
}

describe("loadGameFromLogs", () => {

  // it("Correctly load a game", async () => {
  //   const log = parseLog(`/Users/sylvain/Documents/foursouls/four-souls-game/src/tests/loadGame/data/four-souls_save_2026-04-09_09-03-46.log`);
  //   const loadedGame = await loadGameFromLogs(log, 0);
  // });

  // it("Correctly load games in data folder.", async () => {
  //   // For each file in data folder, parse the log and expect load game not to throw.
  //   const fs = require('fs');
  //   const path = require('path');
  //   const dataFolder = "src/tests/loadGame/data";
  //   const files = fs.readdirSync(dataFolder);
  //   for (const file of files) {
  //     if (file.endsWith(".log")) {
  //       const logPath = path.join(dataFolder, file);
  //       const log = parseLog(logPath);
  //       try {
  //         await loadGameFromLogs(log);
  //       } catch (error) {
  //         throw new GameError(`Failed to load game from log ${file}: ${error}`);
  //       }
  //     }
  //   }
  // });

  it("loads a game saved right after it started, with no start-of-game prompt", async () => {
    const game = await startGame(["b2-isaac", "b2-lilith"]);
    expect(game.hasPendingSelections).toBe(false);
    const loaded = await load(game.saveLog);
    expect(loaded.currentPlayer.id).toBe(game.currentPlayer.id);
    expect(loaded.stack.elements.length).toBe(game.stack.elements.length);
  });

  it("a rollback while only some players answered their start-of-game prompt asks them again", async () => {
    const game = await startGame(["b2-eden", "b2-eden"]);
    await answerFirstPendingSelection(game);
    expect(game.pendingMultipleSelections.size).toBe(1);
    const rolledBack = await load(game.getRollbackLog(game.players[0]!));
    expect(rolledBack.pendingMultipleSelections.size).toBe(2);
  });

  it("replays every seed recorded right after Start", async () => {
    const game = await startGame(["random", "random"], 3);
    expect(game.hasPendingSelections).toBe(true);
    // Each load during the start-of-game prompts reseeds right after Start.
    const reloaded = await load(game.saveLog);
    const reloadedTwice = await load(reloaded.log);
    while (reloadedTwice.hasPendingSelections)
      await answerFirstPendingSelection(reloadedTwice);
    // The character deck is shuffled once the characters are chosen.
    const replayed = await load(reloadedTwice.saveLog);
    expect(replayed.decks.character._order).toEqual(reloadedTwice.decks.character._order);
  });
});
