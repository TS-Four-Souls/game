import { GameError } from "@/models/GameError";
import { detailedStateSchema } from "@/shared/api";
import { describe, expect, it } from "bun:test";
import { setupStandardTestGame } from "./testHelpers";

describe("rollback cooldown", () => {
  it("defaults the rollback timestamp when parsing state from an older save", async () => {
    const { game, player1 } = await setupStandardTestGame();
    const oldState = structuredClone(game.detailedStateJSON(player1)) as Partial<
      ReturnType<typeof game.detailedStateJSON>
    >;
    delete oldState.lastRollbackTimeStamp;

    expect(detailedStateSchema.parse(oldState).lastRollbackTimeStamp).toBe(0);
  });

  it("blocks a player from rolling back their own action when cheats are disabled", async () => {
    const { game, player1 } = await setupStandardTestGame();
    game.gameParameters.allowCheatOptions.value = false;
    game.addToHistory({ type: "EndTurn", issuer: player1.id });

    expect(() => game.getRollbackLog(player1)).toThrow(GameError);
  });

  it("uses a separate timestamp from the resolve cooldown", async () => {
    const { game } = await setupStandardTestGame();
    game.gameParameters.resolveCooldown.value = 10;
    game.assert.lastTimedAction = Date.now();

    expect(() => game.assert.canRollbackNow()).not.toThrow();
  });

  it("blocks rollback for the configured resolve cooldown duration", async () => {
    const { game } = await setupStandardTestGame();
    game.gameParameters.resolveCooldown.value = 10;
    game.assert.lastRollbackAction = Date.now();

    expect(() => game.assert.canRollbackNow()).toThrow(GameError);

    game.assert.lastRollbackAction = Date.now() - 10_001;
    expect(() => game.assert.canRollbackNow()).not.toThrow();
  });
});
