// import { describe, it, expect } from "bun:test";
// import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
// import { Game } from "@/models/game";
// import { Player } from "@/models/player";
// import { shuffle } from "@/utils/auxiliary";
// import type { HistoricEntry } from "@/models/historyHandler";
// import { string } from "zod";
// import type { EffectOnStack } from "@/models/cards";
// import type { DetailedState } from "@/shared/api";

// function parseLog(path: string): HistoricEntry[] {
//   const fs = require('fs');
//     const txt = fs.readFileSync(path, "utf8");
//     if(txt === "")
//       throw new Error("Failed to read logs from file.");
//     const log = JSON.parse(txt) as HistoricEntry[];
//     return log;
// }

// function parseState(path: string): DetailedState {
//   const fs = require('fs');
//     const txt = fs.readFileSync(path, "utf8");
//     if(txt === "")
//       throw new Error("Failed to read logs from file.");
//   const state = JSON.parse(txt) as DetailedState;
//   return state;
// }

// function compareGameState(original: DetailedState, loaded: DetailedState) {
//   if(original.me.pendingSelection)
//     {
//       const requestId = original.me.pendingSelection?.requestId;
//       if (requestId) {
//         loaded.me.pendingSelection!.requestId = requestId;
//       }
//     }

//   console.log("Loaded state:", JSON.stringify(loaded, null, 2));
//   expect(loaded).toEqual(original);
// }

// async function compareGameStateFromFolder(folderPath: string) {
//   const log = parseLog(`${folderPath}/log.json`);
//   const originalState = parseState(`${folderPath}/state.json`);
//   const loadedGame = await loadGameFromLogs(log);
//   compareGameState(originalState, loadedGame.detailedStateJSON(loadedGame.players[0]!));
// }

// describe("loadGameFromLogs", () => {

//   it("Correctly load new game.", async () => {
//     const initialMonsers = ["b2-pestilence", "b2-the_duke_of_flies"];
//     const initialHeroes = [["fasdgfas", "b2-eve"], ["baboudd","b2-blue_baby"]];
//     const initialShop = ["b2-steamy_sale", "b2-guppys_paw"]
//     const eve_hand = ["b2-butter_bean", "b2-lil_battery_2", "b2-cains_eye"]
//     const log = parseLog("src/tests/loadGame/data/new_game.log");
//     const loadedGame = await loadGameFromLogs(log);

//     expect(loadedGame.isStarted).toBe(true);
//     expect(loadedGame.encounters._monstersInPlay.map(m => m!.card.slug)).toEqual(initialMonsers);
//     expect(loadedGame.players.map(p => [p.id, p.character.slug])).toEqual(initialHeroes);
//     expect(loadedGame.shop._slots.map(s => s!.slug)).toEqual(initialShop);
//     expect(loadedGame.players[0]!.hand.cards.map(c => c.slug)).toEqual(eve_hand);
//     expect(loadedGame.stack.size).toEqual(1);
//     expect((loadedGame.stack.elements[0]! as EffectOnStack).json.card.name!).toEqual("The Curse");
//   });

//   it("Correctly load game with pending selection.", async () => {
//     const log = parseLog("src/tests/loadGame/data/pending_selection.log");
//     const loadedGame = await loadGameFromLogs(log);
//     expect(loadedGame.isStarted).toBe(true);
//     expect(loadedGame.stack.size).toEqual(0);
//     expect(loadedGame.decks.loot._discard.length).toBe(1);
//   });

//   it("Correctly load game in the middle of attack.", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/attack");
//   });

//   it("Correctly load game with purchase", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/purchase");
//   });

//   it("Correctly load long game 1", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/long1");
//   });

//   it("Correctly with custom params", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/customGameParam");
//   });

//   it("Correctly with reset", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/reset");
//   });

//   it("Correctly with debug commands", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/debugTests");
//   });

//   it("Correctly with reload", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/reload");
//   });

//   // it("Correctly with reload 2", async () => {
//   //   await compareGameStateFromFolder("src/tests/loadGame/data/reload2");
//   // });

//   it("Correctly with give coin", async () => {
//     await compareGameStateFromFolder("src/tests/loadGame/data/giveCoin");
//   });

// });
