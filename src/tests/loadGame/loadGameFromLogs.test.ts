import { describe, it, expect } from "bun:test";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { Game } from "@/models/game";
import { Player } from "@/models/player";
import { shuffle } from "@/utils/auxiliary";
import type { HistoricEntry } from "@/models/historyHandler";
import { string } from "zod";
import type { EffectOnStack } from "@/models/cards";
import type { DetailedState } from "@/shared/api";

function parseLog(path: string): HistoricEntry[] {
  const fs = require('fs');
    const txt = fs.readFileSync(path, "utf8");
    if(txt === "")
      throw new Error("Failed to read logs from file.");
    const log = JSON.parse(txt) as HistoricEntry[];
    return log;
}

function parseState(path: string): DetailedState {
  const fs = require('fs');
    const txt = fs.readFileSync(path, "utf8");
    if(txt === "")
      throw new Error("Failed to read logs from file.");
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
  //         throw new Error(`Failed to load game from log ${file}: ${error}`);
  //       }
  //     }
  //   }
  // });

});
