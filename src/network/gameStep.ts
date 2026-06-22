import { schemas } from "@/shared/api";
import type { Room, RoomWithGame, Socket, User } from "./types";
import {
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
  leaveCurrentStep,
  errorGuardedEndpoint,
  registerRoomActivity,
  getUserByName,
} from "./utils";
import * as helper from "@/utils/gameRequestHelpers";
import type { ItemCard, LootCard, MonsterCard } from "@/models/cards";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import type { HistoricEntry } from "@/models/handlers/historyHandler";
import { enterStartStep } from "./startStep";
import { globalEndpoints } from "./global";
import { roomManager } from "./roomManager";

export const enterGameStep = (
  socket: Socket,
  room: RoomWithGame,
  user: User,
): void => {
  const activeInstance = user.instances.find((instance) => instance.isActive);
  if (!activeInstance) {
    throw new Error("No active instance found");
  }
  const player = room.game.entityHandler.getPlayerById(activeInstance.name);

  sendRoomChangedToUser(room, user);

  globalEndpoints(socket, room);

  socket.on("saveGame", (callback) =>
    errorGuardedEndpoint(callback, () => {
      const logs = JSON.stringify(room.game.log, null, 2);
      return callback({ status: 200, logs });
    }),
  );

  socket.on("rollback", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      const logs: HistoricEntry[] = room.game.getRollbackLog(player);

      if (!logs) {
        return callback({
          status: 400,
          error: "Logs are not valid JSON or not in the expected format.",
        });
      }

      let newGame;
      try {
        newGame = await loadGameFromLogs(logs);
      } catch (error) {
        console.error("Rollback failed while loading logs:", error);
        return callback({
          status: 400,
          error: error instanceof Error ? error.message : "Failed to load game from logs.",
        });
      }

      room.game = newGame;

      room.game.onStateChange.add(() => {
        sendRoomChangedToAll(room);
      });

      room.game.onRoomBroadcast.add((broadcast) => {
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
          message: "The game has been rolled back to the last action.",
        });
      }

      return callback({ status: 200 });
    }),
  );

  socket.on("declareAttack", (callback) =>
    errorGuardedEndpoint(callback, () => {
      helper.executeDeclareAttackRequest(room.game, player);
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
          await helper.executeAttackMonsterRequest(room.game, payload, player);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("attackRoll", (callback) =>
    errorGuardedEndpoint(callback, () => {
      helper.executeAttackRollRequest(room.game, player);
      return callback({ status: 200 });
    }),
  );

  socket.on("resolve", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      registerRoomActivity(room);
      await helper.executeResolveRequest(room.game, player);
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
          helper.executeSubmitSelectionRequest(room.game, payload, player);
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
          helper.executeInsertStackElementBeforeRequest(room.game, payload, player);
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
          const choices = helper.executePlayCardRequest(room.game, payload, player);
          room.game.addToHistory({
            type: "PlayCard",
            payload,
            issuer: player.id,
          });
          return callback({ response: choices, status: 200 });
        },
      ),
    ),
  );

  socket.on("activateWithID", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.activateRequest,
        callback,
        async (payload) => {
          const choices = await helper.executeActivateRequest(
            room.game,
            payload,
            player,
          );
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
          const choices = await helper.executeActivateRequest(
            room.game,
            payload,
            player,
          );
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
          const choices = await helper.executeActivateRoomRequest(
            room.game,
            payload,
            player,
          );
          return callback({ response: choices, status: 200 });
        },
      ),
    ),
  );

  socket.on("declarePurchase", (callback) =>
    errorGuardedEndpoint(callback, () => {
      helper.executeDeclarePurchaseRequest(room.game, player);
      return callback({ status: 200 });
    }),
  );

  socket.on("cancelPurchase", (callback) =>
    errorGuardedEndpoint(callback, () => {
      helper.executeCancelPurchaseRequest(room.game, player);
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
          helper.executePurchaseRequest(room.game, payload, player);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("endTurn", (callback) =>
    errorGuardedEndpoint(callback, async () => {
      await helper.executeEndTurnRequest(room.game, player);
      return callback({ status: 200 });
    }),
  );

  socket.on("giveCoins", (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.giveCoinsRequest,
        callback,
        async (payload) => {
          await helper.executeGiveCoinsRequest(room.game, payload, player);
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
    ),
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

      roomManager.finalizeGameRecord(room);
      roomManager.saveGameLogs(room.id, false);

      // @ts-ignore we are exiting the game, so we don't need to keep the game instance.
      delete room.game;

      for (const user of room.users) {
        const socket = user.socket;
        leaveCurrentStep(socket);
        enterStartStep(socket, room, user);
      }
      return callback({ status: 200 });
    }),
  );

  if (room.game.gameParameters.allowCheatOptions.value) {
    socket.on("debugLootTop", (callback) =>
      errorGuardedEndpoint(callback, () => {
        helper.executeDebugLootTopRequest(room.game, player);
        return callback({ status: 200 });
      }),
    );

    socket.on("debugGainTreasureTop", (callback) =>
      errorGuardedEndpoint(callback, () => {
        helper.executeDebugGainTreasureTopRequest(room.game, player);
        return callback({ status: 200 });
      }),
    );

    socket.on("debugLoot", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.debugLootRequest,
          callback,
          (payload) => {
            helper.executeDebugLootRequest(room.game, payload, player);
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("debugListLoot", (callback) =>
      errorGuardedEndpoint(callback, () => {
        room.game.addToHistory({
          type: "DebugListLoot",
          issuer: player.id,
        });

        const lootDeck = room.game.decks["loot"];
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
        room.game.addToHistory({
          type: "DebugListCardsICanRemove",
          issuer: player.id,
        });
        const cards = room.game
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
            helper.executeDebugRemoveCardsRequest(room.game, payload, player);
            return callback({
              status: 200,
            });
          },
        ),
      ),
    );

    socket.on("debugListTreasure", (callback) =>
      errorGuardedEndpoint(callback, () => {
        room.game.addToHistory({
          type: "DebugListTreasure",
          issuer: player.id,
        });

        const treasureDeck = room.game.decks["treasure"];
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
            helper.executeDebugGainTreasureRequest(room.game, payload, player);
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
            room.game.addToHistory({
              type: "DebugGainCoins",
              payload,
              issuer: player.id,
            });
            room.game.actions.debugGainCoins(player, payload.coins);
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("debugListMonsterDeck", (callback) =>
      errorGuardedEndpoint(callback, () => {
        room.game.addToHistory({
          type: "DebugListMonsterDeck",
          issuer: player.id,
        });

        const monsterDeck = room.game.decks["monster"];
        if (!monsterDeck) {
          return callback({
            status: 400,
            error: "Monster deck not available",
          });
        }
        const cards = monsterDeck.cards
          .toSorted((a, b) => (a.name + a.slug).localeCompare(b.name + b.slug))
          .map((c) => c.jsonAPI);
        const coverable = room.game.encounters.nonAttackedSlots.map(
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
            room.game.addToHistory({
              type: "DebugPutMonsterCardInSlot",
              payload,
              issuer: player.id,
            });
            const card = room.game.obtainCard(
              payload.card.slug,
              payload.card.globalId,
            ) as MonsterCard;
            if (!card) {
              throw new Error(
                "Card not found in the game: " + payload.card.slug,
              );
            }
            const index = room.game.encounters._slots
              .map((slot) => slot[slot.length - 1]?.globalId)
              .indexOf(payload.toCover.globalId);
            room.game.actions.debugPutMonsterCardInSlot(player, card, index);
            return callback({ status: 200 });
          },
        ),
      ),
    );
  }
};
