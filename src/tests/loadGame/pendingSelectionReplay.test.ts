// import type { HistoricEntry } from "@/models/handlers/historyHandler";
// import { TargetBuilder } from "@/models/targetBuilder";
// import * as helper from "@/utils/gameRequestHelpers";
// import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
// import { describe, expect, it } from "bun:test";

// /**
//  * A rollback can cut the history while a selection is pending: the replay must end on that selection,
//  * asked again to the player, instead of skipping it.
//  * The log comes from a game rolled back right after p0 was killed by XIII - Death, while choosing the loot card to lose.
//  */
// function parseLog(path: string): HistoricEntry[] {
//   const fs = require("fs");
//   return JSON.parse(fs.readFileSync(path, "utf8")) as HistoricEntry[];
// }

// const LOG_PATH = "src/tests/loadGame/data/rollback_during_death_penalty.log";

// describe("Replay ending on a pending selection", () => {
//   it("asks the pending death penalty selection again.", async () => {
//     const game = await loadGameFromLogs(parseLog(LOG_PATH));
//     const p0 = game.entityHandler.getPlayerById("p0");
//     const pending = [...game.pendingMultipleSelections.values()];
//     expect(pending.length).toBe(1);
//     expect(pending[0]!.playerId).toBe("p0");
//     expect(pending[0]!.reason).toBe("death");
//     expect(pending[0]!.options).toEqual(p0.hand.cards);
//   });

//   it("can answer the selection, and the game saved afterwards loads again.", async () => {
//     const game = await loadGameFromLogs(parseLog(LOG_PATH));
//     const p0 = game.entityHandler.getPlayerById("p0");
//     const handSize = p0.hand.cards.length;
//     const pending = [...game.pendingMultipleSelections.values()][0]!;
//     helper.executeSubmitSelectionRequest(
//       game,
//       { requestId: pending.requestId, selections: TargetBuilder.convertToSelectionItems([pending.options[0]]) },
//       p0,
//     );
//     // The death resolution waiting for the answer goes on in the background, as after a live request.
//     for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
//     expect(game.hasPendingSelections).toBe(false);
//     expect(p0.hand.cards.length).toBe(handSize - 1);

//     const reloaded = await loadGameFromLogs(game.saveLog);
//     expect(reloaded.entityHandler.getPlayerById("p0").hand.cards.length).toBe(handSize - 1);
//     expect(reloaded.hasPendingSelections).toBe(false);
//   });

//   it("refuses a log whose actions continue after an unanswered selection.", async () => {
//     const log = parseLog(LOG_PATH);
//     // The answer to the death penalty is missing, but the game went on.
//     log.push({ type: "EndTurn", issuer: "p2" } as HistoricEntry);
//     expect(loadGameFromLogs(log)).rejects.toThrow();
//   });
// });
