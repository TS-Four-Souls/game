import { schemas } from "@/shared/api";
import type { Room, Socket, User } from "./types";
import {
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
  leaveCurrentStep,
  errorGuardedEndpoint,
  registerRoomActivity,
  getUserByName,
} from "./utils";
import {
  executeActivateRequest,
  executeActivateRoomRequest,
  executeAttackMonsterRequest,
  executePlayCardRequest,
} from "@/utils/gameRequestHelpers";
import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import type { Game } from "@/models/game";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import type { HistoricEntry } from "@/models/historyHandler";
import { enterStartStep } from "./startStep";
import { globalEndpoints } from "./global";
import { roomManager } from "./roomManager";

export const enterGameStep = (socket: Socket, room: Room, user: User): void => {
  if (!room.game) {
    throw new Error("Game not found");
  }

  const game: Game = room.game;

  const activeInstance = user.instances.find((instance) => instance.isActive);
  if (!activeInstance) {
    throw new Error("No active instance found");
  }
  const player = game.entityHandler.getPlayerById(activeInstance.name);

  sendRoomChangedToUser(room, user);

  globalEndpoints(socket, room);

  socket.on("saveGame", (callback) =>
    errorGuardedEndpoint(callback, () => {
      const logs = JSON.stringify(game.log, null, 2);
      return callback({ status: 200, logs });
    }),
  );

  socket.on("rollback", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      const logs: HistoricEntry[] = game.getRollbackLog(player);
      // console.log("Rollback logs", logs.at(-1)!.type);
      if (!logs)
        throw new Error(
          "Logs are not valid JSON or not in the expected format.",
        );
      room.game = await loadGameFromLogs(logs);

      room.game.onStateChange.add(() => {
        sendRoomChangedToAll(room);
      });

      game.onRoomBroadcast.add((broadcast) => {
        room.users.forEach((user) => {
          user.instances.forEach((instance) => {
            if (!instance.isActive) return;
            if (broadcast.players.includes(instance.name)) {
              user.socket.emit("on:room:broadcast", {
                type: broadcast.type,
                title: broadcast.title,
                message: broadcast.message,
              });
            }
          });
        });
      });

      sendRoomChangedToAll(room);

      for (const user of room.users) {
        leaveCurrentStep(user.socket);
        enterGameStep(user.socket, room, user);
        user.socket.emit("on:room:broadcast", {
          type: "info",
          title: `Game rolled back by ${player.id}`,
          message: "The game has been rolled back the last action.",
        });
      }

      return callback({ status: 200 });
    }),
  );

  socket.on("declareAttack", (callback) =>
    errorGuardedEndpoint(callback, () => {
      game.actions.declareAttack(player);
      game.addToHistory({
        type: "DeclareAttack",
        issuer: player.id,
      });
      return callback({ status: 200 });
    }),
  );

  socket.on("attackMonster", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.attackMonsterRequest,
        callback,
        async (payload) => {
          await executeAttackMonsterRequest(game, payload, player);
          game.addToHistory({
            type: "AttackMonster",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("attackRoll", (callback) =>
    errorGuardedEndpoint(callback, () => {
      game.actions.attackRoll(player);
      game.addToHistory({
        type: "AttackRoll",
        issuer: player.id,
      });
      return callback({ status: 200 });
    }),
  );

  socket.on("resolve", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      registerRoomActivity(room);
      game.addToHistory({ type: "Resolve", issuer: player.id });
      await game.actions.resolveStack();
      return callback({ status: 200 });
    }),
  );

  socket.on("submitSelection", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.submitSelectionRequest,
        callback,
        (payload) => {
          game.submitSelection(player, payload.requestId, payload.selections);
          game.addToHistory({
            type: "SubmitSelection",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("insertStackElementBefore", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.insertStackElementBeforeRequest,
        callback,
        (payload) => {
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
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("playCard", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.playCardRequest,
        callback,
        (payload) => {
          const choices = executePlayCardRequest(game, payload, player);
          game.addToHistory({ type: "PlayCard", payload, issuer: player.id });
          return callback({ response: choices, status: 200 });
        },
      ),
    ),
  );

  socket.on("activate", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.activateRequest,
        callback,
        async (payload) => {
          const choices = await executeActivateRequest(game, payload, player);
          if (choices.complete) {
            game.addToHistory({
              type: "Activate",
              payload,
              issuer: player.id,
            });
          }
          return callback({ response: choices, status: 200 });
        },
      ),
    ),
  );

  socket.on("activateRoom", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.activateRoomRequest,
        callback,
        async (payload) => {
          const choices = await executeActivateRoomRequest(
            game,
            payload,
            player,
          );
          if (choices.complete) {
            game.addToHistory({
              type: "ActivateRoom",
              payload,
              issuer: player.id,
            });
          }
          return callback({ response: choices, status: 200 });
        },
      ),
    ),
  );

  socket.on("declarePurchase", (callback) =>
    errorGuardedEndpoint(callback, () => {
      game.actions.declarePurchase(player);
      game.addToHistory({
        type: "DeclarePurchase",
        issuer: player.id,
      });
      return callback({ status: 200 });
    }),
  );

  socket.on("cancelPurchase", (callback) =>
    errorGuardedEndpoint(callback, () => {
      game.actions.cancelPurchase(player);
      game.addToHistory({
        type: "CancelPurchase",
        issuer: player.id,
      });
      return callback({ status: 200 });
    }),
  );

  socket.on("purchase", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.purchaseRequest,
        callback,
        (payload) => {
          game.actions.purchase(player, payload.index);
          game.addToHistory({ type: "Purchase", payload, issuer: player.id });
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("endTurn", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      game.addToHistory({ type: "EndTurn", issuer: player.id });
      await game.actions.nextTurn(player);
      return callback({ status: 200 });
    }),
  );

  socket.on("giveCoins", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.giveCoinsRequest,
        callback,
        (payload) => {
          const target = game.entityHandler.getPlayerById(payload.target);
          const amount = payload.coins;
          if (!game.giveCoins(player, target, amount))
            throw new Error("amount of coins invalid");
          game.addToHistory({
            type: "GiveCoins",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("switchToCopy", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.switchToCopyRequest,
        callback,
        (payload) => {
          const targetUser = getUserByName(room, payload.name);
          if (!targetUser) {
            return callback({ status: 400, error: "User not found" });
          }
          if (targetUser.user.socket.id !== socket.id) {
            return callback({
              status: 400,
              error: "You cannot switch to another player.",
            });
          }
          if (targetUser.instance.name === activeInstance.name) {
            return callback({
              status: 400,
              error: "You cannot switch to yourself",
            });
          }

          activeInstance.isActive = false;
          targetUser.instance.isActive = true;
          leaveCurrentStep(user.socket);
          enterGameStep(targetUser.user.socket, room, targetUser.user);

          return callback({ status: 200 });
        },
      ),
    )
  );

  socket.on("quitGame", (callback) =>
    errorGuardedEndpoint(callback, () => {
      for (const user of room.users) {
        const socket = user.socket;
        socket.emit("on:room:broadcast", {
          type: "info",
          title: `Game exited by ${player.id}`,
          message: "The game has been exited.",
        });
      }

      roomManager.saveGameLogs(room.id, false);
      room.game = undefined;
      for (const user of room.users) {
        const socket = user.socket;
        leaveCurrentStep(socket);
        enterStartStep(socket, room, user);
      }
      return callback({ status: 200 });
    }),
  );

  if (game.gameParameters.allowCheatOptions.value) {
    socket.on("debugLootTop", (callback) =>
      errorGuardedEndpoint(callback,
          () => {
            game.addToHistory({
              type: "DebugLootTop",
              issuer: player.id,
            });
            const topCard = game.decks.loot.cards[0];
            if(!topCard) {
              return callback({
                status: 400,
                error: "Loot deck is empty",
              });
            }
            game.actions.debugLoot(player, [topCard], false);
            return callback({ status: 200 });
          },
      ),
    );

    socket.on("debugGainTreasureTop", (callback) =>
      errorGuardedEndpoint(callback,
          () => {
            game.addToHistory({
              type: "DebugGainTreasureTop",
              issuer: player.id,
            });
            const topCard = game.decks.treasure.cards[0];
            if(!topCard) {
              return callback({
                status: 400,
                error: "Treasure deck is empty",
              });
            }
            game.actions.debugGainTreasures(player, [topCard]);
            return callback({ status: 200 });
          },
      ),
    );


    socket.on("debugLoot", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugLootRequest,
          callback,
          (payload) => {
            game.addToHistory({
              type: "DebugLoot",
              payload,
              issuer: player.id,
            });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const lootDeck = game.decks["loot"];
              if (!lootDeck) {
                return callback({
                  status: 400,
                  error: "Loot deck not available",
                });
              }
              game.actions.debugLoot(player, cards as LootCard[]);
              return callback({ status: 200 });
            }
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("debugListLoot", (callback) =>
      errorGuardedEndpoint(callback, () => {
        game.addToHistory({
          type: "DebugListLoot",
          issuer: player.id,
        });

        const lootDeck = game.decks["loot"];
        if (!lootDeck) {
          return callback({
            status: 400,
            error: "Loot deck not available",
          });
        }
        const cards = lootDeck.cards
          .toSorted((a, b) => (a.name + a.slug).localeCompare(b.name + b.slug))
          .map((c) => c.jsonAPI);

        return callback({ status: 200, cards });
      }),
    );

    socket.on("debugListCardsICanRemove", (callback) =>
      errorGuardedEndpoint(callback, () => {
        game.addToHistory({
          type: "DebugListCardsICanRemove",
          issuer: player.id,
        });
        const cards = game
          .playerCardsAndGameOwnedCards(player)
          .map((c) => c.jsonAPI);
        return callback({ status: 200, cards });
      }),
    );

    socket.on("debugRemoveCards", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugRemoveCardsRequest,
          callback,
          (payload) => {
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
            return callback({
              status: 200,
            });
          },
        ),
      ),
    );

    socket.on("debugListTreasure", (callback) =>
      errorGuardedEndpoint(callback, () => {
        game.addToHistory({
          type: "DebugListTreasure",
          issuer: player.id,
        });

        const treasureDeck = game.decks["treasure"];
        if (!treasureDeck) {
          return callback({
            status: 400,
            error: "Treasure deck not available",
          });
        }
        const cards = treasureDeck.cards
          .toSorted((a, b) => (a.name + a.slug).localeCompare(b.name + b.slug))
          .map((c) => c.jsonAPI);

        return callback({ status: 200, cards });
      }),
    );

    socket.on("debugGainTreasure", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugGainTreasureRequest,
          callback,
          (payload) => {
            game.addToHistory({
              type: "DebugGainTreasure",
              payload,
              issuer: player.id,
            });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const treasureDeck = game.decks["treasure"];
              if (!treasureDeck) {
                return callback({
                  status: 400,
                  error: "Treasure deck not available",
                });
              }
              game.actions.debugGainTreasures(player, cards as ItemCard[]);
              return callback({
                status: 200,
              });
            }
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("debugGainCoins", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugGainCoinsRequest,
          callback,
          (payload) => {
            game.addToHistory({
              type: "DebugGainCoins",
              payload,
              issuer: player.id,
            });
            game.actions.debugGainCoins(player, payload.coins);
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("debugListMonsterDeck", (callback) =>
      errorGuardedEndpoint(callback, () => {
        game.addToHistory({
          type: "DebugListMonsterDeck",
          issuer: player.id,
        });

        const monsterDeck = game.decks["monster"];
        if (!monsterDeck) {
          return callback({
            status: 400,
            error: "Monster deck not available",
          });
        }
        const cards = monsterDeck.cards
          .toSorted((a, b) => (a.name + a.slug).localeCompare(b.name + b.slug))
          .map((c) => c.jsonAPI);
        const coverable = game.encounters.nonAttackedSlots.map(
          (elem) => elem.jsonAPI,
        );
        return callback({ status: 200, cards, coverable });
      }),
    );

    socket.on("debugPutMonsterCardInSlot", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugPutMonsterCardInSlotRequest,
          callback,
          (payload) => {
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
            return callback({ status: 200 });
          },
        ),
      ),
    );
  }
};
