import type { Game } from "@/models/game";
import { TargetBuilder } from "@/models/targetBuilder";
import { Player } from "@/models/entities/player"
import type { Requests, TargetSelectorResponse } from "@/shared/api";

export async function executeAttackMonsterRequest(
  game: Game,
  payload: Requests.AttackMonster,
  player: Player,
): Promise<void> {
  const monster =
    payload.index === "top" ? "topDeck" : game.encounters.monsterIn(payload.index);

  if (!monster) {
    throw new Error(`No monster at index ${payload.index}`);
  }

  const drawInIndex = payload.index === "top" ? payload.replaceIndex : -1;
  await game.declareAttackOnEntity(player, monster, drawInIndex);
}

export function executePlayCardRequest(
  game: Game,
  payload: Requests.PlayCard,
  player: Player,
): TargetSelectorResponse {
  const partialChoices = payload.targetChoices || [];
  const card = TargetBuilder.getCardFromPlayer(game, player, payload.index, "hand");

  const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(
    game,
    player,
    card,
    partialChoices,
    payload.effectIndex,
  );

  if (choices.complete) {
    const targets = TargetBuilder.buildTargets(
      game,
      player,
      card,
      partialChoices,
      payload.effectIndex,
    );
    game.playCard(player, payload.index, targets);
  }

  return choices;
}

export async function executeActivateRequest(
  game: Game,
  payload: Requests.Activate,
  player: Player,
): Promise<TargetSelectorResponse> {
  const partialChoices = payload.targetChoices || [];
  const item = TargetBuilder.getCardFromPlayer(game, player, payload.index, "inPlay");

  const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(
    game,
    player,
    item,
    partialChoices,
    payload.effectIndex,
  );

  if (choices.complete) {
    const targets = TargetBuilder.buildTargets(
      game,
      player,
      item,
      partialChoices,
      payload.effectIndex,
    );
    await game.activateItemAtIndex(
      player,
      payload.index,
      targets,
      payload.effectIndex,
    );
  }

  return choices;
}

export async function executeActivateRoomRequest(
  game: Game,
  payload: Requests.ActivateRoom,
  player: Player,
): Promise<TargetSelectorResponse> {
  const partialChoices = payload.targetChoices || [];
  const room = game.rooms?.roomIn(payload.index);
  if(!room) {
    throw new Error(`No room at index ${payload.index}`);
  }
  const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(
    game,
    player,
    room,
    partialChoices,
    payload.effectIndex,
  );

  if (choices.complete) {
    const targets = TargetBuilder.buildTargets(
      game,
      player,
      room,
      partialChoices,
      payload.effectIndex,
    );
    await game.activateRoom(
      player,
      room,
      targets,
      payload.effectIndex,
    );
  }

  return choices;
}
