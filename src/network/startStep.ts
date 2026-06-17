import { type Room, type Socket, type User } from "./types";
import { schemas, Team } from "@/shared/api";
import {
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
  sendUserAssigned,
  updatePlayerCount,
  leaveCurrentStep,
  errorGuardedEndpoint,
  registerRoomActivity,
  getUserByName,
  isRoomWithGame,
} from "./utils";
import { Game } from "@/models/game";
import { enterGameStep } from "./gameStep";
import type { HistoricEntry } from "@/models/handlers/historyHandler";
import { loadGameFromLogs } from "@/utils/loadGameFromLogs";
import { enterIntroStep } from "./introStep";
import { globalEndpoints } from "./global";
import { roomManager } from "./roomManager";
import { generateUserId } from "@/utils/random";

export const enterStartStep = (
  socket: Socket,
  room: Room,
  user: User,
): void => {
  for (const instance of user.instances) {
    instance.isActive = !instance.isCopy;
  }

  sendRoomChangedToUser(room, user);

  globalEndpoints(socket, room);

  socket.on("leaveRoom", (callback) =>
    errorGuardedEndpoint(callback, () => {
      if (user.isHost) {
        room.users.forEach((user) => {
          leaveCurrentStep(user.socket);
          enterIntroStep(user.socket);
          sendUserAssigned(user.socket, null);
          sendRoomChangedToUser(null, user);
        });
        roomManager.deleteRoom(room.id);
      } else {
        room.users = room.users.filter((u) => u.socket.id !== user.socket.id);
        updatePlayerCount(room);

        sendRoomChangedToAll(room);

        sendUserAssigned(socket, null);
        sendRoomChangedToUser(null, user);

        leaveCurrentStep(socket);
        enterIntroStep(socket);
      }

      return callback({ status: 200 });
    }),
  );

  socket.on("setName", (request, callback) =>
    errorGuardedEndpoint(callback, () =>
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

          if (
            room.users.some((user) =>
              user.instances.some((instance) => instance.name === payload),
            )
          ) {
            return callback({
              status: 400,
              error: "That name is already taken",
            });
          }

          const activeInstance = user.instances.find(
            (instance) => instance.isActive,
          );
          if (!activeInstance) {
            return callback({ status: 400, error: "No active instance found" });
          }

          activeInstance.name = payload;
          sendRoomChangedToAll(room);
        },
      ),
    ),
  );

  socket.on("setTeam", (request, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        request,
        schemas.setTeamRequest,
        callback,
        (payload) => {
          const targetUser = getUserByName(room, payload.name);
          if (!targetUser) {
            return callback({ status: 400, error: "User not found" });
          }
          if (targetUser.user.socket.id !== user.socket.id) {
            return callback({
              status: 400,
              error: "You cannot set the team of another player",
            });
          }
          targetUser.instance.team = payload.team;
          sendRoomChangedToAll(room);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("selectCharacter", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.selectCharacterRequest,
        callback,
        (payload) => {
          const targetUser = user.instances.find(
            (user) => user.name === payload.name,
          );
          if (!targetUser) {
            return callback({ status: 400, error: "User not found" });
          }
          targetUser.character = payload.character;
          sendRoomChangedToAll(room);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  if (user.isHost) {
    socket.on("kickFromRoom", (request, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          request,
          schemas.kickFromRoomRequest,
          callback,
          (payload) => {
            const target = getUserByName(room, payload.name);
            if (!target) {
              return callback({ status: 400, error: "User not found" });
            }
            if (target.instance.isCopy) {
              target.user.instances = target.user.instances.filter(
                (instance) => instance.id !== target.instance.id,
              );
            } else {
              room.users = room.users.filter(
                (user) => user.socket.id !== target.user.socket.id,
              );
            }

            updatePlayerCount(room);
            sendRoomChangedToAll(room);

            if (target.instance.isActive) {
              const socket = user.socket;
              sendUserAssigned(socket, null);
              sendRoomChangedToUser(null, user);

              leaveCurrentStep(socket);
              enterIntroStep(socket);
            }

            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("makeCopyOfPlayer", (request, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          request,
          schemas.makeCopyOfPlayerRequest,
          callback,
          (payload) => {
            const original = getUserByName(room, payload.name);
            if (!original) {
              return callback({ status: 400, error: "User not found" });
            }
            if (room.users.length >= 4) {
              return callback({ status: 400, error: "Room is full" });
            }
            if (original.instance.isCopy) {
              return callback({ status: 400, error: "User is already a copy" });
            }
            const prefixes = ["Tainted", "Holy", "Cursed"];

            const prefix =
              prefixes[original.user.instances.length - (1 % prefixes.length)];

            let newName = `${prefix} ${original.instance.name}`;
            if (newName.length > 16) {
              newName = newName.slice(0, 15) + "…";
            }

            original.user.instances.push({
              id: generateUserId(),
              name: newName,
              isCopy: true,
              isActive: false,
              character: original.instance.character,
              team: original.instance.team,
            });
            updatePlayerCount(room);
            sendRoomChangedToAll(room);
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("setGameParameter", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.setGameParameterRequest,
          callback,
          (payload) => {
            registerRoomActivity(room);
            room.params.setParameterByKey(payload.parameter, payload.value);
          },
        ),
      ),
    );

    socket.on("resetGameParameters", (callback) =>
      errorGuardedEndpoint(callback, () => {
        room.params.reset();
        updatePlayerCount(room);
        sendRoomChangedToAll(room);
        return callback({ status: 200 });
      }),
    );

    socket.on("loadGameParameters", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.loadGameParametersRequest,
          callback,
          (payload) => {
            const settings = JSON.parse(payload);
            room.params.loadFromJson(settings);
            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("loadGame", (payload, callback) =>
      errorGuardedEndpoint(callback, () =>
        payloadGuardedEndpoint(
          payload,
          schemas.loadGameRequest,
          callback,
          async (payload) => {
            // Ensure requester is an authorized player in the current room game.
            const logs: HistoricEntry[] = JSON.parse(payload);
            if (!logs)
              throw new Error(
                "Logs are not valid JSON or not in the expected format.",
              );
            room.game = await loadGameFromLogs(logs);
            room.gameCount++;

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

            if (!isRoomWithGame(room)) {
              return callback({ status: 400, error: "Game not found" });
            }

            roomManager.attachGameRecordListeners(room);
            roomManager.recordGameStart(room);

            sendRoomChangedToAll(room);

            for (const user of room.users) {
              const activeInstance = user.instances.find(
                (instance) => instance.isActive,
              );
              if (!activeInstance) continue;
              leaveCurrentStep(user.socket);
              enterGameStep(user.socket, room, user);
              user.socket.emit("on:room:broadcast", {
                type: "info",
                title: `Game loaded by ${activeInstance.name}`,
                message: "The game has been loaded.",
              });
            }

            return callback({ status: 200 });
          },
        ),
      ),
    );

    socket.on("start", (callback) =>
      errorGuardedEndpoint(callback, async () => {
        const params = room.params;

        const game = new Game("", params);

        game.onStateChange.add(() => {
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

        const playersWithCharacters: {
          issuer: string;
          character: string;
          user: string;
          team: Team;
        }[] = [];
        for (const user of room.users) {
          for (const instance of user.instances) {
            playersWithCharacters.push({
              issuer: instance.name,
              character: instance.character.character,
              user: user.socket.id,
              team: instance.team,
            });
          }
        }

        await game.start(playersWithCharacters);

        game.addToHistory({
          type: "Start",
          players: playersWithCharacters,
          params: room.params.toJson(),
        });

        room.game = game;
        room.gameCount++;

        if (!isRoomWithGame(room)) {
          return callback({ status: 400, error: "Game not found" });
        }

        roomManager.attachGameRecordListeners(room);
        roomManager.recordGameStart(room);

        for (const user of room.users) {
          const socket = user.socket;
          leaveCurrentStep(socket);
          enterGameStep(socket, room, user);
        }

        return callback({ status: 200 });
      }),
    );
  }
};
