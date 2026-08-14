import { GameError } from "@/models/GameError";
import type { HistoricEntry } from "@/models/handlers/historyHandler";
import type { DetailedState } from "@/shared/api";
import { loadGameFromLogs, normalizeDetailedStateForComparison, setupLoadingSubmitSelectionHandling } from "@/utils/loadGameFromLogs";
import { toSerializedTranslation } from "@/utils/translation";
import { describe, expect, it } from "bun:test";
import { setupStandardTestGame } from "../testHelpers";

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

  it("ignores rollback timestamps when comparing saved replay state", async () => {
    const { game, player1 } = await setupStandardTestGame();
    const currentState = structuredClone(game.detailedStateJSON(player1));
    currentState.lastRollbackTimeStamp = Date.now();
    const { lastRollbackTimeStamp, ...oldSavedState } = structuredClone(currentState);

    expect(lastRollbackTimeStamp).toBeGreaterThan(0);
    expect(normalizeDetailedStateForComparison(currentState).lastRollbackTimeStamp).toBe(0);
    expect(normalizeDetailedStateForComparison(oldSavedState).lastRollbackTimeStamp).toBe(0);
  });

  it("matches simultaneous selection responses to the player that received each prompt", async () => {
    const { game, player1, player2 } = await setupStandardTestGame();
    if (!player2) throw new Error("Expected the standard test game to include two players.");
    const logs = [
      {
        type: "SubmitSelection",
        issuer: player2.id,
        payload: {
          requestId: 10,
          selections: [{ type: "string", payload: "player-2-choice" }],
        },
      },
      {
        type: "SubmitSelection",
        issuer: player1.id,
        payload: {
          requestId: "player-1_legacy_1",
          selections: [{ type: "string", payload: "player-1-choice" }],
        },
      },
    ];

    setupLoadingSubmitSelectionHandling(game, logs);

    const results = await game.selectMultiple([
      {
        player: player1,
        min: 1,
        max: 1,
        options: ["player-1-choice"],
        description: toSerializedTranslation("introStep.loadingMessage"),
        canUseOnBoardSelection: false,
      },
      {
        player: player2,
        min: 1,
        max: 1,
        options: ["player-2-choice"],
        description: toSerializedTranslation("introStep.loadingMessage"),
        canUseOnBoardSelection: false,
      },
    ]);

    expect(results.map((result) => result.playerId)).toEqual([
      player1.id,
      player2.id,
    ]);
    expect(results.map((result) => result.selected)).toEqual([
      ["player-1-choice"],
      ["player-2-choice"],
    ]);
  });

  it("rejects when a prompted player has no recorded response", async () => {
    const { game, player1, player2 } = await setupStandardTestGame();
    if (!player2) throw new Error("Expected the standard test game to include two players.");
    const logs = [
      {
        type: "SubmitSelection",
        issuer: player2.id,
        payload: { requestId: 10, selections: [] },
      },
    ];

    setupLoadingSubmitSelectionHandling(game, logs);

    await expect(game.selectMultiple([
      {
        player: player1,
        min: 0,
        max: 0,
        options: [],
        description: toSerializedTranslation("introStep.loadingMessage"),
        canUseOnBoardSelection: false,
      },
    ])).rejects.toThrow(`No SubmitSelection entry in the logs matches player ${player1.id}.`);
  });

  it("keeps request ID order for multiple prompts sent to the same player", async () => {
    const { game, player1 } = await setupStandardTestGame();
    const logs = [
      {
        type: "SubmitSelection",
        issuer: player1.id,
        payload: {
          requestId: 20,
          selections: [{ type: "string", payload: "second-choice" }],
        },
      },
      {
        type: "SubmitSelection",
        issuer: player1.id,
        payload: {
          requestId: "player-1_legacy_0",
          selections: [{ type: "string", payload: "first-choice" }],
        },
      },
    ];

    setupLoadingSubmitSelectionHandling(game, logs);

    const first = await game.selectMultiple([
      {
        player: player1,
        min: 1,
        max: 1,
        options: ["first-choice"],
        description: toSerializedTranslation("introStep.loadingMessage"),
        canUseOnBoardSelection: false,
      },
    ]);
    const second = await game.selectMultiple([
      {
        player: player1,
        min: 1,
        max: 1,
        options: ["second-choice"],
        description: toSerializedTranslation("introStep.loadingMessage"),
        canUseOnBoardSelection: false,
      },
    ]);

    expect(first[0]?.selected).toEqual(["first-choice"]);
    expect(second[0]?.selected).toEqual(["second-choice"]);
  });

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

});
