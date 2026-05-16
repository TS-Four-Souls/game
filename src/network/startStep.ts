import { type Room, type Socket, type User } from "./types";
import { schemas } from "@/shared/api";
import {
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
  sendUserAssigned,
  updatePlayerCount,
  leaveCurrentStep,
} from "./utils";
import { Game } from "@/models/game";
import { enterGameStep } from "./gameStep";
import type { HistoricEntry } from "@/models/historyHandler";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { enterIntroStep } from "./introStep";
import { globalEndpoints } from "./global";

export const enterStartStep = (
  socket: Socket,
  rooms: Map<string, Room>,
  room: Room,
  user: User,
) => {
  sendRoomChangedToUser(room, user);

  globalEndpoints(socket);

  socket.onAny(() => {
    user.lastActionTimestamp = new Date();
  });

  socket.on("leaveRoom", (callback) => {
    if (user.isHost) {
      room.users.forEach((user) => {
        leaveCurrentStep(user.socket);
        enterIntroStep(user.socket, rooms);
        sendUserAssigned(user.socket, null);
        sendRoomChangedToUser(null, user);
      });
      rooms.delete(room.id);
    } else {
      room.users = room.users.filter(({ id }) => id !== user.id);
      updatePlayerCount(room);

      sendRoomChangedToAll(room);

      sendUserAssigned(socket, null);
      sendRoomChangedToUser(null, user);

      leaveCurrentStep(socket);
      enterIntroStep(socket, rooms);
    }

    return callback({ status: 200 });
  });

  socket.on("setName", (request, callback) => {
    payloadGuardedEndpoint(
      request,
      schemas.setNameRequest,
      callback,
      (payload) => {
        if (payload.length === 0) {
          return callback({ status: 400, error: "A name is required" });
        }

        if (payload.length > 16) {
          return callback({
            status: 400,
            error: "Your name needs to be less than 16 characters",
          });
        }

        if (!/\w/u.test(payload)) {
          return callback({
            status: 400,
            error:
              "Your name can only contain letters, numbers and underscores",
          });
        }

        if (room.users.some((user) => user.name === payload)) {
          return callback({ status: 400, error: "That name is already taken" });
        }

        user.name = payload;
        updatePlayerCount(room);
        sendRoomChangedToAll(room);
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
        sendRoomChangedToAll(room);
        return callback({ status: 200 });
      },
    );
  });

  if (user.isHost) {
    socket.on("kickFromRoom", (request, callback) => {
      payloadGuardedEndpoint(
        request,
        schemas.kickFromRoomRequest,
        callback,
        (payload) => {
          const user = room.users.find((user) => user.name === payload.name);
          if (!user) {
            return callback({ status: 400, error: "User not found" });
          }
          const socket = user.socket;
          room.users = room.users.filter(({ id }) => id !== user.id);
          updatePlayerCount(room);

          sendRoomChangedToAll(room);

          sendUserAssigned(socket, null);
          sendRoomChangedToUser(null, user);

          leaveCurrentStep(socket);
          enterIntroStep(socket, rooms);

          return callback({ status: 200 });
        },
      );
    });

    socket.on("setGameParameter", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.setGameParameterRequest,
        callback,
        (payload) => {
          room.params.setParameterByKey(payload.parameter, payload.value);
        },
      );
    });

    socket.on("resetGameParameters", (callback) => {
      room.params.reset();
      return callback({ status: 200 });
    });

    socket.on("loadGameParameters", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.loadGameParametersRequest,
        callback,
        (payload) => {
          try {
            const settings = JSON.parse(payload);
            room.params.loadFromJson(settings);
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

    socket.on("loadGame", (payload, callback) => {
      payloadGuardedEndpoint(
        payload,
        schemas.loadGameRequest,
        callback,
        async (payload) => {
          try {
            // Ensure requester is an authorized player in the current room game.
            const logs: HistoricEntry[] = JSON.parse(payload);
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            room.game = await loadGameFromLogs(logs);
            leaveCurrentStep(socket);
            enterGameStep(socket, rooms, room, user);
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

    socket.on("start", (callback) => {
      const params = room.params;

      try {
        const game = new Game("", params);

        game.onStateChange.add(() => {
          sendRoomChangedToAll(room);
        });

        game.onRoomBroadcast.add((broadcast) => {
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

        const playersWithCharacters = room.users.flatMap((user) => {
          if (!user.name) return [];
          return {
            issuer: user.name,
            character: user.character.character,
          };
        });

        game.start(playersWithCharacters);

        game.addToHistory({
          type: "Start",
          players: playersWithCharacters,
          params: room.params.toJson(),
        });

        room.game = game;

        for (const user of room.users) {
          if (!user.name) continue;
          const socket = user.socket;
          leaveCurrentStep(socket);
          enterGameStep(socket, rooms, room, user);
        }

        return callback({ status: 200 });
      } catch (error) {
        if (error instanceof Error) {
          return callback({ status: 400, error: error.message });
        }
        return callback({ status: 400, error: "Unknown error" });
      }
    });
  }
};
