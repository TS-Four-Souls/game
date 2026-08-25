import { GameError } from "@/models/GameError";
import type { Game } from "@/models/game";
import { toSerializedTranslation } from "@/utils/translation";

export function serializeGameForSave(game: Game): string {
  if (game.hasPendingSelections) {
    const error = "Finish the current selection before saving the game.";
    throw new GameError(
      error,
      toSerializedTranslation("error.behaviorError", { error }),
    );
  }

  return JSON.stringify(game.log, null, 2);
}
