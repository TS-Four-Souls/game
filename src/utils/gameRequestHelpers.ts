import type { Game } from "@/models/game";
import { TargetBuilder } from "@/models/targetBuilder";
import { Player } from "@/models/entities/player"
import type { Requests, TargetSelectorResponse } from "@/shared/api";
import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";

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
  await game.actions.declareAttackOnEntity(player, monster, drawInIndex);
  game.addToHistory({
    type: "AttackMonster",
    payload,
    issuer: player.id,
  });
}

export function executePlayCardRequest(
  game: Game,
  payload: Requests.PlayCard,
  player: Player,
): TargetSelectorResponse {
  let partialChoice = payload.targetChoices || [];
  const card = TargetBuilder.getCardFromPlayer(game, player, payload.index, "hand");
  // const { effectId, choice } = card.getEffectIdAndChooseOneChoiceFromSeparatorId(payload.effectIndex);
  // if(choice !== undefined) {
  //   partialChoice = [...TargetBuilder.convertToSelectionItems(choice), ...partialChoice];
  // }
  const choices: TargetSelectorResponse = TargetBuilder.getNextSelector(
    game,
    player,
    card,
    partialChoice,
    payload.effectIndex,
  );

  if (choices.complete) {
    const targets = TargetBuilder.buildTargets(
      game,
      player,
      card,
      partialChoice,
      payload.effectIndex,
    );
    game.actions.playCard(player, payload.index, targets);
    game.addToHistory({
                type: "PlayCard",
                payload,
                issuer: player.id,
              });
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
    await game.actions.activateItemAtIndex(
      player,
      payload.index,
      targets,
      payload.effectIndex,
    );
  }
  if (choices.complete) {
    game.addToHistory({
      type: "Activate",
      payload,
      issuer: player.id,
    });
  }
  return choices;
}

export async function executeActivateWithIdRequest(
  game: Game,
  payload: Requests.ActivateWithID,
  player: Player,
): Promise<TargetSelectorResponse> {
  const item = TargetBuilder.getCardFromPlayer(game, player, payload.index, "inPlay");
  const { effectId, choice } = item.getEffectIdAndChooseOneChoiceFromSeparatorId(payload.effectIndex);

  let partialChoice = payload.targetChoices === undefined ? [] : payload.targetChoices;
  if(choice !== undefined) {
    partialChoice = [...TargetBuilder.convertToSelectionItems(choice), ...partialChoice];
  }
  return await executeActivateRequest(
    game,
    {
      index: payload.index,
      effectIndex: effectId,
      targetChoices: partialChoice,
    },
    player
  );
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
    await game.actions.activateRoom(
      player,
      room,
      targets,
      payload.effectIndex,
    );
  }
  if (choices.complete) {
    game.addToHistory({
      type: "ActivateRoom",
      payload,
      issuer: player.id,
    });
  }
  return choices;
}


export function executeDeclareAttackRequest(
  game: Game,
  player: Player,
): void {
  game.actions.declareAttack(player);
  game.addToHistory({
    type: "DeclareAttack",
    issuer: player.id,
  });
}

export function executeAttackRollRequest(
  game: Game,
  player: Player,
): void {
  game.actions.attackRoll(player);
  game.addToHistory({
    type: "AttackRoll",
    issuer: player.id,
  });
}

export async function executeResolveRequest(
  game: Game,
  player: Player,
): Promise<void> {
  if(player !== game.currentPlayer) {
    throw new Error("Only the current player can resolve the stack");
  }
  game.addToHistory({ type: "Resolve", issuer: player.id });
  await game.actions.resolveStack();
}

export function executeSubmitSelectionRequest(
  game: Game,
  payload: Requests.SubmitSelection,
  player: Player,
): void {
  game.submitSelection(
    player,
    payload.requestId,
    payload.selections,
  );
  game.addToHistory({
    type: "SubmitSelection",
    payload,
    issuer: player.id,
  });
}
export function executeInsertStackElementBeforeRequest(
  game: Game,
  payload: Requests.InsertStackElementBefore,
  player: Player,
): void {
  game.insertStackElementBefore(
    player,
    payload.elementToMoveStackId,
    payload.targetStackId,
  );
  game.addToHistory({
    type: "InsertStackElementBefore",
    payload,
    issuer: player.id,
  });
}
export function executeDeclarePurchaseRequest(
  game: Game,
  player: Player,
): void {
  game.actions.declarePurchase(player);
  game.addToHistory({
    type: "DeclarePurchase",
    issuer: player.id,
  });
}
export function executeCancelPurchaseRequest(
  game: Game,
  player: Player,
): void {
  game.actions.cancelPurchase(player);
  game.addToHistory({
    type: "CancelPurchase",
    issuer: player.id,
  });
}
export function executePurchaseRequest(
  game: Game,
  payload: Requests.Purchase,
  player: Player,
): void {
  game.actions.purchase(player, payload.index);
  game.addToHistory({
    type: "Purchase",
    payload,
    issuer: player.id,
  });
}
export async function executeEndTurnRequest(
  game: Game,
  player: Player,
): Promise<void> {
  game.addToHistory({ type: "EndTurn", issuer: player.id });
  await game.actions.nextTurn(player);
}
export async function executeGiveCoinsRequest(
  game: Game,
  payload: Requests.GiveCoins,
  player: Player,
): Promise<void> {
  game.assert.noPendingSelection();
  const target = game.entityHandler.getPlayerById(payload.target);
  const amount = payload.coins;
    if (!await game.giveCoins(player, target, amount))
      return;
    game.addToHistory({
    type: "GiveCoins",
    payload,
    issuer: player.id,
  });
}
export function executeDebugLootTopRequest(
  game: Game,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugLootTop",
    issuer: player.id,
  });
  const topCard = game.decks.loot.cards[0];
  if (!topCard) {
    throw new Error("Loot deck is empty");
  }
  game.actions.debugLoot(player, [topCard], false);
}

export function executeDebugGainTreasureTopRequest(
  game: Game,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugGainTreasureTop",
    issuer: player.id,
  });
  const topCard = game.decks.treasure.cards[0];
  if (!topCard) {
    throw new Error("Treasure deck is empty");
  }
  game.actions.debugGainTreasures(player, [topCard], true);
}
export function executeDebugLootRequest(
  game: Game,
  payload: Requests.DebugLoot,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugLoot",
    payload,
    issuer: player.id,
  });
  const cards = payload.cards;
  if (cards && cards.length > 0) {
    const lootDeck = game.decks["loot"];
    if (!lootDeck) {
      throw new Error("Loot deck not available");
    }
    game.actions.debugLoot(player, cards as LootCard[]);
  }
}

export function executeDebugRemoveCardsRequest(
  game: Game,
  payload: Requests.DebugRemoveCards,
  player: Player,
): void {
game.addToHistory({
  type: "DebugRemoveCards",
  payload,
  issuer: player.id,
});
if (payload.cards !== undefined) {
  const cardsToRemove = game
    .playerCardsAndGameOwnedCards(player)
    .filter((c) =>
      payload.cards
        .map((card) => card.globalId)!
        .includes(c.globalId),
    );
  game.actions.debugRemoveCards(player, cardsToRemove);
}
}
export function executeDebugGainTreasureRequest(
  game: Game,
  payload: Requests.DebugGainTreasure,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugGainTreasure",
    payload,
    issuer: player.id,
  });
  const cards = payload.cards;
  if (cards && cards.length > 0) {
    const treasureDeck = game.decks["treasure"];
    if (!treasureDeck) {
      throw new Error("Treasure deck not available");
    }
    game.actions.debugGainTreasures(player, cards as ItemCard[], false);
  }
}
export function executeDebugGainCoinsRequest(
  game: Game,
  payload: Requests.DebugGainCoins,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugGainCoins",
    payload,
    issuer: player.id,
  });
  game.actions.debugGainCoins(player, payload.coins);
}

export function executeDebugPutMonsterCardInSlotRequest(
  game: Game,
  payload: Requests.DebugPutMonsterCardInSlot,
  player: Player,
): void {
  game.addToHistory({
    type: "DebugPutMonsterCardInSlot",
    payload,
    issuer: player.id,
  });
  const card = game.obtainCard(
    payload.card.slug,
    payload.card.globalId,
  ) as MonsterCard;
  if (!card) {
    throw new Error(
      "Card not found in the game: " + payload.card.slug,
    );
  }
  const index = game.encounters._slots
    .map((slot) => slot[slot.length - 1]?.globalId)
    .indexOf(payload.toCover.globalId);
  game.actions.debugPutMonsterCardInSlot(player, card, index);
}