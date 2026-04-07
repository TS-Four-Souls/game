import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import { Game } from "./models/game";
import { Player } from "./models/player";
import { shuffle } from "./utils/auxiliary";
import type {
  ClientToServerEvents,
  DetailedState,
  ServerToClientEvents,
} from "./shared/api";
import { schemas } from "./shared/api";
import { ItemCard, LootCard, CharacterCard } from "./models/cards";
import { generateRoomId, generateUserId } from "./utils/random";
import {
  executeActivateRequest,
  executeAttackMonsterRequest,
  executePlayCardRequest,
} from "./utils/gameRequestHelpers";
import { loadGameFromLogs } from "./utils/loadGameFromLogs";
import type { z, ZodType } from "zod";
import type { HistoricEntry } from "./models/historyHandler";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

type Room = { id: string; users: string[]; game: Game };
const rooms: Map<string, Room> = new Map();

const engine = new Engine({
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});

io.bind(engine);

io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey !== process.env.FRONT_API_KEY) {
    return next(new Error("Invalid API key"));
  }
  next();
});

const sendRoomChanged = (room: Room, playerId: string) => {
  let player: Player;
  try {
    player = room.game.getPlayerById(playerId);
  } catch (error) {
    console.error("Failed to get player", error);
    io.to(playerId).emit("on:room:changed", {
      room: { id: room.id, state: "created" },
    });
    return;
  }

  let gameState: DetailedState | undefined;
  try {
    gameState = room.game.detailedStateJSON(player);
  } catch (error) {
    console.error("Failed to get game state", error);
  }

  io.to(player.id).emit("on:room:changed", {
    room: {
      id: room.id,
      state: "joined",
      issuer: {
        id: player.id,
        secret: player.secret,
      },
      players: room.game.players.map((player) => player.id),
      gameParameters: room.game.gameParameters.toJson(),
    },
    gameState,
  });
};

const getRoomFromUserId = (userId: string) => {
  const result = rooms
    .entries()
    .find(([_, room]) => room.users.includes(userId));
  if (!result) {
    return undefined;
  }
  const [roomId, room] = result;
  return { roomId, room };
};

const roomGuardedEndpoint = (
  userId: string | undefined,
  callback: (response: { status: 400; error: string }) => void,
  onSuccess: (game: Game, room: Room) => void,
): void => {
  if (!userId) {
    return callback({ status: 400, error: "User not found" });
  }
  const roomFound = getRoomFromUserId(userId);
  if (!roomFound) {
    return callback({ status: 400, error: "User not found" });
  }
  const { room } = roomFound;
  onSuccess(room.game, room);
};

const payloadGuardedEndpoint = <T extends ZodType>(
  payload: unknown,
  schema: T,
  callback: (response: { status: 400; error: string }) => void,
  onSuccess: (payload: z.infer<T>) => void,
): void => {
  const validated = schema.safeParse(payload);
  if (!validated.success) {
    return callback({ status: 400, error: validated.error.message });
  }
  onSuccess(validated.data);
};

io.on("connection", (socket) => {
  console.log("Client connected");
  let userId: string | undefined;

  socket.on("createRoom", (callback) => {
    const roomId = generateRoomId();
    userId = generateUserId();
    const game = new Game();
    const room = { id: roomId, users: [userId], game };
    game.onStateChange.add(() => {
      game.players.forEach((player) => sendRoomChanged(room, player.id));
    });
    rooms.set(roomId, room);
    socket.emit("on:user:assigned", userId);
    socket.emit("on:room:changed", {
      room: {
        id: roomId,
        state: "created",
      },
    });
    game.addToHistory({ type: "CreateRoom" });
    return callback({ status: 200 });
  });

  socket.on("joinRoom", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.joinRoomRequest,
      callback,
      (payload) => {
        const roomId = payload.roomId;
        const room = rooms.get(roomId);

        if (!room) {
          return callback({ status: 400, error: "Room not found" });
        }

        userId = generateUserId();
        room.users.push(userId);

        socket.emit("on:user:assigned", userId);
        socket.emit("on:room:changed", {
          room: {
            id: roomId,
            state: "created",
          },
        });

        room.game.addToHistory({ type: "JoinRoom", payload });
        return callback({ status: 200 });
      },
    );
  });

  socket.on("leaveRoom", (callback) => {
    roomGuardedEndpoint(userId, callback, (game, room) => {
      room.users = room.users.filter((id) => id !== userId);
      socket.emit("on:user:assigned", null);
      socket.emit("on:room:changed", null);
      game.addToHistory({ type: "LeaveRoom" });
      return callback({ status: 200 });
    });
  });

  socket.on("isGameOngoing", (callback) => {
    roomGuardedEndpoint(userId, callback, (game) => {
      game.addToHistory({ type: "IsGameOngoing" });
      return callback({ status: 200, gameOngoing: game.isStarted });
    });
  });

  socket.on("getGameLogs", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.getGameLogsRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.getPlayerByIssuer(payload);
            const logs = JSON.stringify(game.log, null, 2);
            console.log(`Game logs:`, logs);
            return callback({ status: 200, logs });
          } catch (error) {
            console.error("Failed to get game logs", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("loadGame", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.loadGameRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, async (game, room) => {
          try {
            // Ensure requester is an authorized player in the current room game.
            game.getPlayerByIssuer(payload.issuer);
            const logs: HistoricEntry[] = JSON.parse(payload.logs);
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            const loadedGame = await loadGameFromLogs(logs);
            // room.game.addToHistory({ type: "LoadGame", payload }); // Add the load game action to the current game history for traceability, even though it won't affect the loaded game state.
            loadedGame.onStateChange.add(() => {
              loadedGame.players.forEach((player) =>
                sendRoomChanged(room, player.id),
              );
            });

            room.game = loadedGame;

            loadedGame.players.forEach((player) =>
              sendRoomChanged(room, player.id),
            );
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to load game from logs", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  // socket.on("getListOfPlayersFromLogs", (payload, callback) => {
  //   payloadGuardedEndpoint(
  //     payload,
  //     schemas.getListOfPlayersFromLogsRequest,
  //     callback,
  //     (payload) => {
  //       roomGuardedEndpoint(userId, callback, async (game, room) => {
  //         try {
  //           // Ensure requester is an authorized player in the current room game.
  //           game.getPlayerByIssuer(payload.issuer);
  //           const logs: HistoricEntry[] = JSON.parse(payload.logs);
            
  //           return callback({ status: 200 });
  //         } catch (error) {
  //           console.error("Failed to load game from logs", error);
  //           if (error instanceof Error) {
  //             return callback({ status: 400, error: error.message });
  //           }
  //           return callback({ status: 400, error: "Unknown error" });
  //         }
  //       });
  //     },
  //   );
  // });

  socket.on("join", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.joinRequest,
      callback,
      (payload) => {
        if (payload.length === 0) {
          return callback({ status: 400, error: "Name is required" });
        }
        roomGuardedEndpoint(userId, callback, (game, room) => {
          try {
            const player = new Player(payload);
            game.addPlayer(player);
            console.log(`Player ${payload} joined the game`);
            socket.join(player.id);
            sendRoomChanged(room, player.id);
            game.addToHistory({ type: "Join", payload });
            return callback({
              status: 200,
            });
          } catch (error) {
            console.error("Failed to join the game", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("rejoin", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.rejoinRequest,
      callback,
      (payload) => {
        userId = payload.userId;
        roomGuardedEndpoint(userId, callback, (game, room) => {
          if (payload.issuer) {
            try {
              const player = room.game.getPlayerById(payload.issuer.id);
              if (player.verifySecret(payload.issuer.secret)) {
                socket.join(player.id);
                sendRoomChanged(room, player.id);
                game.addToHistory({ type: "Rejoin", payload });
                return callback({
                  status: 200,
                });
              }
            } catch {}
          }

          socket.emit("on:room:changed", {
            room: {
              id: room.id,
              state: "created",
            },
          });
          return callback({ status: 200 });
        });
      },
    );
  });

  socket.on("setGameParameter", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.setGameParameterRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.getPlayerByIssuer(payload.issuer);
            game.gameParameters[payload.parameter].value = payload.value;
            game.addToHistory({ type: "SetGameParameter", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to set game parameter", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("start", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.startRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            // game.setupGame();
            // const char1 = game.decks["character"]!.getCardFromSlug(
            //   "b2-cain"
            // )! as CharacterCard;
            // const char2 = game.decks["character"]!.getCardFromSlug(
            //   "b2-eve"
            // )! as CharacterCard;
            // const treas = ["b2-chaos_card", "b2-placebo", "b2-blank_card"];
            // for (const slug of treas) {
            //   const card = game.obtainCard(slug)! as ItemCard;
            //   game.decks["treasure"]?.addTopPosition( card);
            // }
            // if(game.players.length === 1) {
            //   const second = new Player("The other", 2, 1, 0, game.players[0]!.secret);
            //   game.addPlayer(second);
            // }

            game.start(payload.issuer, null);
            // const mob = game.obtainCard("b2-curse_of_amnesia")!;
            // game.decks.monster?.addTopPosition(mob as any);
            // game.encounters.forceSetMonsterAtSlot(0, mob);
            // const loots = ["b2-i_the_magician", "b2-gold_bomb", "b2-ii_the_high_priestess", "b2-cains_eye"]
            // for (const slug of loots) {
            //   const card = game.obtainCard(slug)! as LootCard;
            //   game.addCardToHand(game.players[0]!, card);
            //   }
            // const treas = [
            //   // "b2-mini_mush", 
            //   "b2-dads_lost_coin",
            //   "b2-bum_bo"];
            // for (const slug of treas) {
            //   const card = game.obtainCard(slug)! as ItemCard;
            //   game.addInPlay(game.players[0]!, card);
            // }
            game.addToHistory({ type: "Start", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to start the game", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("reset", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.resetRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game, room) => {
          try {
            const players = game.players;
            // Reset is added to the previous game history. 
            // The new game instance created in the next line will start a new history.
            game.addToHistory({ type: "Reset", payload }); 
            game.reset();
            players.forEach((player) => {
              sendRoomChanged(room, player.id);
              io.socketsLeave(player.id);
            });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to reset the game", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("rollback", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.rollbackRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, async (game, room) => {
          try {
            const logs: HistoricEntry[] = game.rollbackLog;
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            const loadedGame = await loadGameFromLogs(logs);
            loadedGame.onStateChange.add(() => {
              loadedGame.players.forEach((player) =>
                sendRoomChanged(room, player.id),
              );
            });

            room.game = loadedGame;

            loadedGame.players.forEach((player) =>
              sendRoomChanged(room, player.id),
            );
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to rollback.", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("declareAttack", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.declareAttackRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload.issuer);
            game.declareAttack(player);
            game.addToHistory({ type: "DeclareAttack", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to declare attack", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("attackMonster", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.attackMonsterRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            executeAttackMonsterRequest(game, payload);
            game.addToHistory({ type: "AttackMonster", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to declare attack", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("attackRoll", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.attackRollRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload);
            game.attackRoll(player);
            game.addToHistory({ type: "AttackRoll", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to declare attack", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("resolve", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.resolveRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.resolveStack();
            game.addToHistory({ type: "Resolve", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to resolve the stack", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("submitSelection", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.submitSelectionRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.submitSelection(
              payload.issuer,
              payload.requestId,
              payload.selections,
            );
            game.addToHistory({ type: "SubmitSelection", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to submit selection", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("insertStackElementBefore", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.insertStackElementBeforeRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.insertStackElementBefore(
              payload.issuer,
              payload.elementToMoveStackId,
              payload.targetStackId,
            );
            game.addToHistory({ type: "InsertStackElementBefore", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to reorder stack element", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("playCard", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.playCardRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const choices = executePlayCardRequest(game, payload);
            game.addToHistory({ type: "PlayCard", payload });
            return callback({ response: choices, status: 200 });
          } catch (error) {
            console.error("Failed to play card", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("activate", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.activateRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, async (game) => {
          try {
            const choices = await executeActivateRequest(game, payload);
            if (choices.complete) {
              game.addToHistory({ type: "Activate", payload });
            }
            return callback({ response: choices, status: 200 });
          } catch (error) {
            console.error("Failed to play card", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("declarePurchase", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.declarePurchaseRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload.issuer);
            game.declarePurchase(player);
            game.addToHistory({ type: "DeclarePurchase", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to declare purchase", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("cancelPurchase", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.cancelPurchaseRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload.issuer);
            game.cancelPurchase(player);
            game.addToHistory({ type: "CancelPurchase", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to cancel purchase", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("purchase", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.purchaseRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, async (game) => {
          try {
            const player = game.getPlayerByIssuer(payload.issuer);
            game.purchase(player, payload.index);
            game.addToHistory({ type: "Purchase", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to purchase", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("endTurn", async (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.endTurnRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.addToHistory({ type: "EndTurn", payload });
            game.nextTurn(payload.issuer);
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to end turn", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
      },
    );
  });

  socket.on("giveCoins", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.giveCoinsRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload.issuer);
            const target = game.getPlayerById(payload.target);
            const amount = payload.coins;
            if (!game.giveCoins(player, target, amount))
              throw new Error("amount of coins invalid");
            game.addToHistory({ type: "GiveCoins", payload });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to give coins", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        });
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
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugLoot", payload });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const lootDeck = game.decks["loot"];
              if (!lootDeck) {
                return callback({
                  status: 400,
                  error: "Loot deck not available",
                });
              }
              for (const card of cards) {
                const targetCard = game.obtainCard(card.slug, card.globalId)! as LootCard;
                game.addCardToHand(player, targetCard);
              }
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
        });
      },
    );
  });

  socket.on("debugListLoot", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugListLootRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugListLoot", payload });

            const lootDeck = game.decks["loot"];
            if (!lootDeck) {
              return callback({
                status: 400,
                error: "Loot deck not available",
              });
            }
            const cards = lootDeck.cards
              .toSorted((a, b) => a.slug.localeCompare(b.slug))
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
      },
    );
  });

  socket.on("debugListCardsICanRemove", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugListCardsICanRemoveRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugListCardsICanRemove", payload });
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
      },
    );
  });

  socket.on("debugRemoveCards", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugRemoveCardsRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugRemoveCards", payload });
            if (payload.cards !== undefined) {
              const cardsToRemove = game
                .playerCardsAndGameOwnedCards(player)
                .filter((c) => payload.cards.map((card)=>card.globalId)!.includes(c.globalId));
              game.debugRemoveCards(player, cardsToRemove);
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
        });
      },
    );
  });

  socket.on("debugListTreasure", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugListTreasureRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugListTreasure", payload });

            const treasureDeck = game.decks["treasure"];
            if (!treasureDeck) {
              return callback({
                status: 400,
                error: "Treasure deck not available",
              });
            }
            const cards = treasureDeck.cards
              .toSorted((a, b) => a.slug.localeCompare(b.slug))
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
      },
    );
  });

  socket.on("debugGainTreasure", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.debugGainTreasureRequest,
      callback,
      (payload) => {
        roomGuardedEndpoint(userId, callback, (game) => {
          try {
            const player = game.getPlayerByIssuer(payload);
            game.addToHistory({ type: "DebugGainTreasure", payload });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const treasureDeck = game.decks["treasure"];
              if (!treasureDeck) {
                return callback({
                  status: 400,
                  error: "Treasure deck not available",
                });
              }
              for (const card of cards) {
                const targetCard = game.obtainCard(card.slug, card.globalId)!;
                if (targetCard instanceof ItemCard === false)
                  throw new Error(`Card ${targetCard.name} is not an ItemCard`);
                game.addInPlay(player, targetCard);
              }
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
        });
      },
    );
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engine.handler(),
};
