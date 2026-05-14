import { schemas } from "@/shared/api";
import type { Room, Socket, User } from "./types";
import {
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
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

export const enterGameStep = (
  socket: Socket,
  rooms: Map<string, Room>,
  room: Room,
  user: User,
) => {
  const leaveGameStep = (socket: Socket) => {
    socket.offAny(updateLastActionTimestamp);
    socket.removeAllListeners("saveGame");
    socket.removeAllListeners("rollback");
    socket.removeAllListeners("declareAttack");
    socket.removeAllListeners("attackMonster");
    socket.removeAllListeners("attackRoll");
    socket.removeAllListeners("resolve");
    socket.removeAllListeners("submitSelection");
    socket.removeAllListeners("insertStackElementBefore");
    socket.removeAllListeners("playCard");
    socket.removeAllListeners("activate");
    socket.removeAllListeners("activateRoom");
    socket.removeAllListeners("declarePurchase");
    socket.removeAllListeners("cancelPurchase");
    socket.removeAllListeners("purchase");
    socket.removeAllListeners("endTurn");
    socket.removeAllListeners("giveCoins");
    socket.removeAllListeners("debugLoot");
    socket.removeAllListeners("debugListLoot");
    socket.removeAllListeners("debugListCardsICanRemove");
    socket.removeAllListeners("debugRemoveCards");
    socket.removeAllListeners("debugListTreasure");
    socket.removeAllListeners("debugGainTreasure");
    socket.removeAllListeners("debugGainCoins");
    socket.removeAllListeners("debugListMonsterDeck");
    socket.removeAllListeners("debugPutMonsterCardInSlot");
    socket.removeAllListeners("reportBug");
    socket.removeAllListeners("quitGame");
  };

  const updateLastActionTimestamp = () => {
    user.lastActionTimestamp = new Date();
  };
  socket.onAny(updateLastActionTimestamp);

  sendRoomChangedToUser(room, user);

  if (!room.game) {
    throw new Error("Game not found");
  }

  let game: Game = room.game;

  if (user.name === undefined) {
    throw new Error("User name not found");
  }
  const player = game.getPlayerById(user.name);

  socket.on("saveGame", (callback) => {
    try {
      const logs = JSON.stringify(game.log, null, 2);
      return callback({ status: 200, logs });
    } catch (error) {
      console.error("Failed to get game logs", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("rollback", async (callback) => {
    try {
      const logs: HistoricEntry[] = game.getRollbackLog(player);
      console.log("Rollback logs", logs.at(-1)!.type);
      if (!logs)
        throw new Error(
          "Logs are not valid JSON or not in the expected format.",
        );
      const loadedGame = await loadGameFromLogs(logs);
      loadedGame.onStateChange.add(() => {
        sendRoomChangedToAll(room);
      });

      loadedGame.onRoomBroadcast.add((broadcast) => {
        room.users.forEach((user) => {
          if (user.name === undefined) return;
          if (broadcast.players.includes(user.name)) {
            user.socket.to(broadcast.players).emit("on:room:broadcast", {
              type: broadcast.type,
              title: broadcast.title,
              message: broadcast.message,
            });
          }
        });
      });

      room.game = loadedGame;
      game = loadedGame;

      sendRoomChangedToAll(room);

      for (const user of room.users) {
        if (!user.name) continue;
        user.socket.emit("on:room:broadcast", {
          type: "info",
          title: `Game rolled back by ${player.id}`,
          message: "The game has been rolled back the last action.",
        });
      }

      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to rollback.", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("declareAttack", (callback) => {
    try {
      game.actions.declareAttack(player);
      game.addToHistory({
        type: "DeclareAttack",
        issuer: player.id,
      });
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to declare attack", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("attackMonster", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.attackMonsterRequest,
      callback,
      (payload) => {
        try {
          executeAttackMonsterRequest(game, payload, player);
          game.addToHistory({
            type: "AttackMonster",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to declare attack", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("attackRoll", (callback) => {
    try {
      game.actions.attackRoll(player);
      game.addToHistory({
        type: "AttackRoll",
        issuer: player.id,
      });
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to declare attack", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("resolve", async (callback) => {
    try {
      game.addToHistory({ type: "Resolve", issuer: player.id });
      await game.actions.resolveStack();
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to resolve the stack", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("submitSelection", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.submitSelectionRequest,
      callback,
      (payload) => {
        try {
          game.submitSelection(player, payload.requestId, payload.selections);
          game.addToHistory({
            type: "SubmitSelection",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to submit selection", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("insertStackElementBefore", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.insertStackElementBeforeRequest,
      callback,
      (payload) => {
        try {
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
        } catch (error) {
          console.error("Failed to reorder stack element", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("playCard", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.playCardRequest,
      callback,
      (payload) => {
        try {
          const choices = executePlayCardRequest(game, payload, player);
          game.addToHistory({ type: "PlayCard", payload, issuer: player.id });
          return callback({ response: choices, status: 200 });
        } catch (error) {
          console.error("Failed to play card", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("activate", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.activateRequest,
      callback,
      async (payload) => {
        try {
          const choices = await executeActivateRequest(game, payload, player);
          if (choices.complete) {
            game.addToHistory({
              type: "Activate",
              payload,
              issuer: player.id,
            });
          }
          return callback({ response: choices, status: 200 });
        } catch (error) {
          console.error("Failed to play card", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("activateRoom", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.activateRoomRequest,
      callback,
      async (payload) => {
        try {
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
        } catch (error) {
          console.error("Failed to play card", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("declarePurchase", (callback) => {
    try {
      game.actions.declarePurchase(player);
      game.addToHistory({
        type: "DeclarePurchase",
        issuer: player.id,
      });
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to declare purchase", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("cancelPurchase", (callback) => {
    try {
      game.actions.cancelPurchase(player);
      game.addToHistory({
        type: "CancelPurchase",
        issuer: player.id,
      });
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to cancel purchase", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("purchase", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.purchaseRequest,
      callback,
      (payload) => {
        try {
          game.actions.purchase(player, payload.index);
          game.addToHistory({ type: "Purchase", payload, issuer: player.id });
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to purchase", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("endTurn", async (callback) => {
    try {
      game.addToHistory({ type: "EndTurn", issuer: player.id });
      await game.actions.nextTurn(player);
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to end turn", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("giveCoins", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.giveCoinsRequest,
      callback,
      (payload) => {
        try {
          const target = game.getPlayerById(payload.target);
          const amount = payload.coins;
          if (!game.giveCoins(player, target, amount))
            throw new Error("amount of coins invalid");
          game.addToHistory({
            type: "GiveCoins",
            payload,
            issuer: player.id,
          });
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to give coins", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  // ------------- DEBUG EVENTS -------------

  socket.on("debugLoot", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugLootRequest,
      callback,
      (payload) => {
        try {
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
        } catch (error) {
          console.error("Failed to debug loot", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("debugListLoot", (callback) => {
    try {
      if (!game.gameParameters.allowCheatOptions.value)
        throw new Error("Cheat options are not enabled for this game.");
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
    } catch (error) {
      console.error("Failed to debug list loot", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("debugListCardsICanRemove", (callback) => {
    try {
      if (!game.gameParameters.allowCheatOptions.value)
        throw new Error("Cheat options are not enabled for this game.");
      game.addToHistory({
        type: "DebugListCardsICanRemove",
        issuer: player.id,
      });
      const cards = game
        .playerCardsAndGameOwnedCards(player)
        .map((c) => c.jsonAPI);
      return callback({ status: 200, cards });
    } catch (error) {
      console.error("Failed to debug list cards I can remove", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("debugRemoveCards", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugRemoveCardsRequest,
      callback,
      (payload) => {
        try {
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
        } catch (error) {
          console.error("Failed to debug remove treasure", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("debugListTreasure", (callback) => {
    try {
      if (!game.gameParameters.allowCheatOptions.value)
        throw new Error("Cheat options are not enabled for this game.");
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
    } catch (error) {
      console.error("Failed to debug list treasure", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("debugGainTreasure", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugGainTreasureRequest,
      callback,
      (payload) => {
        try {
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
        } catch (error) {
          console.error("Failed to debug gain treasure", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("debugGainCoins", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugGainCoinsRequest,
      callback,
      (payload) => {
        try {
          game.addToHistory({
            type: "DebugGainCoins",
            payload,
            issuer: player.id,
          });
          game.actions.debugGainCoins(player, payload.coins);
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to debug gain coins", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("debugListMonsterDeck", (callback) => {
    try {
      if (!game.gameParameters.allowCheatOptions.value)
        throw new Error("Cheat options are not enabled for this game.");
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
    } catch (error) {
      console.error("Failed to debug list monster deck", error);
      if (error instanceof Error) {
        return callback({ status: 400, error: error.message });
      }
      return callback({ status: 400, error: "Unknown error" });
    }
  });

  socket.on("debugPutMonsterCardInSlot", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugPutMonsterCardInSlotRequest,
      callback,
      (payload) => {
        try {
          if (!game.gameParameters.allowCheatOptions.value)
            throw new Error("Cheat options are not enabled for this game.");
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
            throw new Error("Card not found in the game: " + payload.card.slug);
          }
          const index = game.monsterSlots._slots
            .map((slot) => slot[slot.length - 1]?.globalId)
            .indexOf(payload.toCover.globalId);
          game.actions.debugPutMonsterCardInSlot(player, card, index);
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to debug put monster card in slot", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("reportBug", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.reportBugRequest,
      callback,
      (payload) => {
        try {
          const bugReport = {
            roomId: room.id,
            reporter: player.id,
            title: payload.title,
            description: payload.description,
            severity: payload.severity ?? "undefined",
            logs: game.log,
          };

          console.log(bugReport);

          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to report bug", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });

  socket.on("quitGame", (callback) => {
    for (const user of room.users) {
      if (!user.name) continue;
      const socket = user.socket;
      socket.emit("on:room:broadcast", {
        type: "info",
        title: `Game exited by ${player.id}`,
        message: "The game has been exited.",
      });
    }

    room.game = undefined;
    for (const user of room.users) {
      if (!user.name) continue;
      const socket = user.socket;
      leaveGameStep(socket);
      enterStartStep(socket, rooms, room, user);
    }
    return callback({ status: 200 });
  });
};
