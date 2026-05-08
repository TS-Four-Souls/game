import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import { CARD_SETS, Game } from "./models/game";
import { Player } from "./models/player";
import type {
  ClientToServerEvents,
  DetailedState,
  RoomPlayer,
  ServerToClientEvents,
} from "./shared/api";
import { schemas } from "./shared/api";
import { ItemCard, LootCard, MonsterCard } from "./models/cards";
import { generateRoomId, generateUserId } from "./utils/random";
import {
  executeActivateRequest,
  executeActivateRoomRequest,
  executeAttackMonsterRequest,
  executePlayCardRequest,
} from "./utils/gameRequestHelpers";
import { loadGameFromLogs } from "./utils/loadGameFromLogs";
import type { z, ZodType } from "zod";
import type { HistoricEntry } from "./models/historyHandler";
import type { RoomCharacter } from "./shared/api";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

const DEFAULT_CHARACTER: RoomCharacter = {
  character: "random",
  eternal: "random",
};

type User = { id: string; player?: Player; character: RoomCharacter };
type Room = {
  id: string;
  users: User[];
  game: Game;
  characters: RoomCharacter[];
};
const rooms: Map<string, Room> = new Map();
const ROOM_STATE_DISPATCH_WINDOW_MS = 50;
const roomUpdateTimeouts: Map<
  string,
  ReturnType<typeof setTimeout>
> = new Map();

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

const generateCharacterAndEternalPairs = (game: Game): RoomCharacter[] => {
  const charas = CARD_SETS.character.cards.map((card) => ({
        character: card.jsonAPI,
      eternal: card.eternalCard,
    }));

  return [
    { character: "random", eternal: "random" },
    ...charas.map((card) => ({
      character: card.character.slug,
      eternal: card.eternal ?? "random",
    })),
  ];
};

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
    console.error("Failed to get game state");
  }

  const me = room.users.find((user) => user.player?.id === player.id);
  const others = room.users
    .filter((user) => user.player?.id !== player.id)
    .map((user) => ({
      id: user.id,
      name: user.player?.id,
      character: user.character,
    }));

  if (!me) {
    console.error("Me not found", player.id);
    return;
  }

  const meRoomPlayer: RoomPlayer = {
    name: me.player?.id,
    character: me.character,
  };

  io.to(player.id).emit("on:room:changed", {
    room: {
      id: room.id,
      state: "joined",
      issuer: player.id,
      me: meRoomPlayer,
      players: others,
      characters: room.characters,
      gameParameters: room.game.gameParameters.toJson(),
    },
    gameState,
  });
};

const scheduleRoomChanged = (room: Room) => {
  if (roomUpdateTimeouts.get(room.id)) {
    return;
  }

  const timeout = setTimeout(() => {
    roomUpdateTimeouts.delete(room.id);
    room.game.players.forEach((player) => sendRoomChanged(room, player.id));
  }, ROOM_STATE_DISPATCH_WINDOW_MS);

  roomUpdateTimeouts.set(room.id, timeout);
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

  socket.on("createRoom", (callback) => {
    const roomId = generateRoomId();
    const user: User = { id: generateUserId(), character: DEFAULT_CHARACTER };
    const game = new Game();

    const room: Room = {
      id: roomId,
      users: [user],
      game,
      characters: generateCharacterAndEternalPairs(game),
    };
    game.onStateChange.add(() => {
      scheduleRoomChanged(room);
    });
    game.onRoomBroadcast.add((broadcast) => {
      io.to(broadcast.players).emit("on:room:broadcast", {
        type: broadcast.type,
        title: broadcast.title,
        message: broadcast.message,
      });
    });
    rooms.set(roomId, room);

    setupAuthenticatedEndpoints(room, user);

    socket.emit("on:user:assigned", user.id);
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

        const user: User = { id: generateUserId(), character: DEFAULT_CHARACTER };
        room.users.push(user);

        setupAuthenticatedEndpoints(room, user);

        socket.emit("on:user:assigned", user.id);
        socket.emit("on:room:changed", {
          room: {
            id: roomId,
            state: "created",
          },
        });

        scheduleRoomChanged(room);
        room.game.addToHistory({ type: "JoinRoom", payload });
        return callback({ status: 200 });
      },
    );
  });

  socket.on("rejoin", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.rejoinRequest,
      callback,
      (payload) => {
        const getRoomFromUserId = (userId: string) => {
          for (const room of rooms.values()) {
            for (const user of room.users) {
              if (user.id === userId) {
                return { room, user };
              }
            }
          }
        };
        
        const roomFound = getRoomFromUserId(payload.userId);
        if (!roomFound) {
          return callback({ status: 400, error: "Room not found" });
        }
        const { room, user } = roomFound;
        if (user.player) {
          socket.join(user.player.id);
          sendRoomChanged(room, user.player.id);
        }
        const { game } = room;
        setupAuthenticatedEndpoints(room, user);
        game.addToHistory({ type: "Rejoin", payload });
        return callback({
          status: 200,
        });
      },
    );
  });

  const setupAuthenticatedEndpoints = (room: Room, user: User) => {
    let game = room.game;

    socket.on("leaveRoom", (callback) => {
      room.users = room.users.filter(({ id }) => id !== user.id);
      socket.emit("on:user:assigned", null);
      socket.emit("on:room:changed", null);
      scheduleRoomChanged(room);
      game.addToHistory({ type: "LeaveRoom" });
      return callback({ status: 200 });
    });

    socket.on("isGameOngoing", (callback) => {
      game.addToHistory({ type: "IsGameOngoing" });
      return callback({ status: 200, gameOngoing: game.isStarted });
    });

    socket.on("getGameLogs", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.getGameLogsRequest,
        callback,
        (payload) => {
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
        },
      );
    });

    socket.on("loadGame", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.loadGameRequest,
        callback,
        async (payload) => {
          try {
            // Ensure requester is an authorized player in the current room game.
            const logs: HistoricEntry[] = JSON.parse(payload.logs);
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            const loadedGame = await loadGameFromLogs(logs);
            // room.game.addToHistory({ type: "LoadGame", payload }); // Add the load game action to the current game history for traceability, even though it won't affect the loaded game state.
            loadedGame.onStateChange.add(() => {
              scheduleRoomChanged(room);
            });

            room.game = loadedGame;
            game = loadedGame;
            for (const roomUser of room.users) {
              if (!roomUser.player) {
                continue;
              }
              roomUser.player = loadedGame.players.find(
                (player) => player.id === roomUser.player?.id,
              );
            }

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
        },
      );
    });

    socket.on("loadGameSettings", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.loadGameSettingsRequest,
        callback,
        (payload) => {
          try {
            const settings = JSON.parse(payload.settings);
            game.loadSettingsFromJson(settings);
            scheduleRoomChanged(room);
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to get game settings", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("join", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.joinRequest,
        callback,
        (payload) => {
          if (payload.length === 0) {
            return callback({ status: 400, error: "Name is required" });
          }
          try {
            const player = new Player(payload);
            game.addPlayer(player);
            console.log(`Player ${payload} joined the game`);
            user.player = player;
            socket.join(player.id);
            sendRoomChanged(room, player.id);
            game.addToHistory({ type: "Join", payload });
            return callback({
              status: 200,
            });
          } catch (error) {
            console.error("Failed to join the game");
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("setGameParameter", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.setGameParameterRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.getPlayerByIssuer(player.id);
            game.gameParameters[payload.parameter].value = payload.value;
            game.addToHistory({ type: "SetGameParameter", payload});
            scheduleRoomChanged(room);
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to set game parameter", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("selectCharacter", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.selectCharacterRequest,
        callback,
        (payload) => {
          user.character = payload.character;
          scheduleRoomChanged(room);
          return callback({ status: 200 });
        },
      );
    });

    socket.on("start", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.startRequest,
        callback,
        (payload) => {
          try {
            // game.setupGame();
            // const char1 = game.decks["character"]!.getCardFromSlug(
            //   "b2-cain"
            // )! as CharacterCard;
            // const char2 = game.decks["character"]!.getCardFromSlug(
            //   "b2-eden"
            // )! as CharacterCard;
            // game.start(payload.issuer, [  char1, char2]);
            // const treas = ["b2-chaos_card", "b2-placebo", "b2-blank_card"];
            // for (const slug of treas) {
            //   const card = game.obtainCard(slug)! as ItemCard;
            //   game.decks["treasure"]?.addTopPosition( card);
            // }
            // if(game.players.length === 1) {
            //   const second = new Player("The other", 2, 1, 0, game.players[0]!.secret);
            //   game.addPlayer(second);
            // }

            // Match room users character selection with game characters
            if (room.users.some((user) => user.player === undefined)) {
              return callback({
                status: 400,
                error: "All players must have joined to start the game",
              });
            }

            const characters: string[] = [];
            for (const gamePlayer of game.players) {
              const roomPlayer = room.users.find(
                ({ player }) => player?.id === gamePlayer.id,
              );
              if (!roomPlayer) {
                return callback({
                  status: 400,
                  error: "All players must have joined to start the game",
                });
              }
              characters.push(roomPlayer.character.character);
            }

            game.start(game.getCharactersFromSlugs(characters));
            // const room = game.obtainCard("r-tax_for_the_mighty") as RoomCard;
            // game.rooms?.forceRoomAtSlot(0, room!);
            // const mob = game.obtainCard("b2-we_need_to_go_deeper")!;
            // game.decks.monster?.addTopPosition(mob as any);
            // game.discard(game.obtainCard("b2-fly")!);
            // game.discard(game.obtainCard("b2-gurdy")!);
            // game.discard(game.obtainCard("b2-gurdy_jr")!);
            // game.encounters.forceSetMonsterAtSlot(0, mob);
            // const loots = ["b2-i_the_magician", "b2-gold_bomb", "b2-ii_the_high_priestess", "b2-cains_eye"]
            // for (const slug of loots) {
            //   const card = game.obtainCard(slug)! as LootCard;
            //   game.addCardToHand(game.players[0]!, card);
            //   }
            // const treas = [
            //   "b2-mini_mush",
            //   // "b2-dads_lost_coin",
            //   "b2-placebo"];
            // for (const slug of treas) {
            //   const card = game.obtainCard(slug)! as ItemCard;
            //   card.charged = false;
            //   game.addInPlay(game.players[0]!, card);
            // }
            game.addToHistory({ type: "Start", payload, characters });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to start the game", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("reset", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.resetRequest,
        callback,
        (payload) => {
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
        },
      );
    });

    socket.on("rollback", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.rollbackRequest,
        callback,
        async (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            const logs: HistoricEntry[] = game.getRollbackLog(player);
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            const loadedGame = await loadGameFromLogs(logs);
            loadedGame.onStateChange.add(() => {
              scheduleRoomChanged(room);
            });

            loadedGame.onRoomBroadcast.add((broadcast) => {
              io.to(broadcast.players).emit("on:room:broadcast", {
                type: broadcast.type,
                title: broadcast.title,
                message: broadcast.message,
              });
            });
            room.game = loadedGame;
            game = loadedGame;
            for (const roomUser of room.users) {
              if (!roomUser.player) {
                continue;
              }
              roomUser.player = loadedGame.players.find(
                (player) => player.id === roomUser.player?.id,
              );
            }

            loadedGame.players.forEach((player) =>
              sendRoomChanged(room, player.id),
            );

            io.to(loadedGame.players.map((player) => player.id)).emit(
              "on:room:broadcast",
              {
                type: "info",
                title: `Game rolled back by ${player.id}`,
                message: "The game has been rolled back the last action.",
              },
            );

            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to rollback.", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("declareAttack", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.declareAttackRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.declareAttack(player);
            game.addToHistory({ type: "DeclareAttack", payload, issuer: player.id });
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

    socket.on("attackMonster", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.attackMonsterRequest,
        callback,
        (payload) => {
          try {
            if(!user.player)
              throw new Error("Player not found for the user");
            executeAttackMonsterRequest(game, payload, user.player);
            game.addToHistory({ type: "AttackMonster", payload, issuer: user.player.id});
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

    socket.on("attackRoll", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.attackRollRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.attackRoll(player);
            game.addToHistory({ type: "AttackRoll", payload, issuer: player.id });
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

    socket.on("resolve", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.resolveRequest,
        callback,
        async (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "Resolve", payload, issuer: player.id });
            await game.resolveStack();
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to resolve the stack", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("submitSelection", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.submitSelectionRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.submitSelection(
              player,
              payload.requestId,
              payload.selections,
            );
            game.addToHistory({ type: "SubmitSelection", payload, issuer: player.id });
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.insertStackElementBefore(
              player,
              payload.elementToMoveStackId,
              payload.targetStackId,
            );
            game.addToHistory({ type: "InsertStackElementBefore", payload, issuer: player.id });
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            const choices = await executeActivateRequest(game, payload, player);
            if (choices.complete) {
              game.addToHistory({ type: "Activate", payload, issuer: player.id });
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            const choices = await executeActivateRoomRequest(game, payload, player);
            if (choices.complete) {
              game.addToHistory({ type: "ActivateRoom", payload, issuer: player.id });
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

    socket.on("declarePurchase", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.declarePurchaseRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.declarePurchase(player);
            game.addToHistory({ type: "DeclarePurchase", payload, issuer: player.id });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to declare purchase", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("cancelPurchase", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.cancelPurchaseRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.cancelPurchase(player);
            game.addToHistory({ type: "CancelPurchase", payload, issuer: player.id });
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to cancel purchase", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("purchase", async (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.purchaseRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.purchase(player, payload.index);
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

    socket.on("endTurn", async (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.endTurnRequest,
        callback,
        async (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "EndTurn", payload, issuer: player.id });
            await game.nextTurn(player);
            return callback({ status: 200 });
          } catch (error) {
            console.error("Failed to end turn", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("giveCoins", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.giveCoinsRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            const target = game.getPlayerById(payload.target);
            const amount = payload.coins;
            if (!game.giveCoins(player, target, amount))
              throw new Error("amount of coins invalid");
            game.addToHistory({ type: "GiveCoins", payload, issuer: player.id });
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugLoot", payload, issuer: player.id });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const lootDeck = game.decks["loot"];
              if (!lootDeck) {
                return callback({
                  status: 400,
                  error: "Loot deck not available",
                });
              }
              game.debugLoot(player, cards as LootCard[]);
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

    socket.on("debugListLoot", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugListLootRequest,
        callback,
        (payload) => {
          try {
            if (!game.gameParameters.allowCheatOptions.value)
              throw new Error("Cheat options are not enabled for this game.");
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugListLoot", payload, issuer: player.id });

            const lootDeck = game.decks["loot"];
            if (!lootDeck) {
              return callback({
                status: 400,
                error: "Loot deck not available",
              });
            }
            const cards = lootDeck.cards
              .toSorted((a, b) =>
                (a.name + a.slug).localeCompare(b.name + b.slug),
              )
              .map((c) => c.jsonAPI);

            return callback({ status: 200, cards });
          } catch (error) {
            console.error("Failed to debug list loot", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("debugListCardsICanRemove", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugListCardsICanRemoveRequest,
        callback,
        (payload) => {
          try {
            if (!game.gameParameters.allowCheatOptions.value)
              throw new Error("Cheat options are not enabled for this game.");
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugListCardsICanRemove", payload, issuer: player.id });
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
        },
      );
    });

    socket.on("debugRemoveCards", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugRemoveCardsRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugRemoveCards", payload, issuer: player.id });
            if (payload.cards !== undefined) {
              const cardsToRemove = game
                .playerCardsAndGameOwnedCards(player)
                .filter((c) =>
                  payload.cards
                    .map((card) => card.globalId)!
                    .includes(c.globalId),
                );
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
        },
      );
    });

    socket.on("debugListTreasure", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugListTreasureRequest,
        callback,
        (payload) => {
          try {
            if (!game.gameParameters.allowCheatOptions.value)
              throw new Error("Cheat options are not enabled for this game.");
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugListTreasure", payload, issuer: player.id });

            const treasureDeck = game.decks["treasure"];
            if (!treasureDeck) {
              return callback({
                status: 400,
                error: "Treasure deck not available",
              });
            }
            const cards = treasureDeck.cards
              .toSorted((a, b) =>
                (a.name + a.slug).localeCompare(b.name + b.slug),
              )
              .map((c) => c.jsonAPI);

            return callback({ status: 200, cards });
          } catch (error) {
            console.error("Failed to debug list treasure", error);
            if (error instanceof Error) {
              return callback({ status: 400, error: error.message });
            }
            return callback({ status: 400, error: "Unknown error" });
          }
        },
      );
    });

    socket.on("debugGainTreasure", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugGainTreasureRequest,
        callback,
        (payload) => {
          try {
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugGainTreasure", payload, issuer: player.id });
            const cards = payload.cards;
            if (cards && cards.length > 0) {
              const treasureDeck = game.decks["treasure"];
              if (!treasureDeck) {
                return callback({
                  status: 400,
                  error: "Treasure deck not available",
                });
              }
              game.debugGainTreasures(player, cards as ItemCard[]);
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugGainCoins", payload, issuer: player.id });
            game.debugGainCoins(player, payload.coins);
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

    socket.on("debugListMonsterDeck", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.debugListMonsterDeckRequest,
        callback,
        (payload) => {
          try {
            if (!game.gameParameters.allowCheatOptions.value)
              throw new Error("Cheat options are not enabled for this game.");
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugListMonsterDeck", payload, issuer: player.id });

            const monsterDeck = game.decks["monster"];
            if (!monsterDeck) {
              return callback({
                status: 400,
                error: "Monster deck not available",
              });
            }
            const cards = monsterDeck.cards
              .toSorted((a, b) =>
                (a.name + a.slug).localeCompare(b.name + b.slug),
              )
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
        },
      );
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            game.addToHistory({ type: "DebugPutMonsterCardInSlot", payload, issuer: player.id });
            const card = game.obtainCard(
              payload.card.slug,
              payload.card.globalId,
            ) as MonsterCard;
            if (!card) {
              throw new Error(
                "Card not found in the game: " + payload.card.slug,
              );
            }
            const index = game.monsterSlots._slots
              .map((slot) => slot[slot.length - 1]?.globalId)
              .indexOf(payload.toCover.globalId);
            game.debugPutMonsterCardInSlot(player, card, index);
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
            const player = user.player;
            if (!player)
              throw new Error("Player not found for the user");
            const bugReport = {
              roomId: room.id,
              reporter: player.id,
              title: payload.title,
              description: payload.description,
              severity: payload.severity ?? "undefined",
              logs: game.log,
            };

            const txt = JSON.stringify(bugReport, null, 2);

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
  };

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engine.handler(),
};
