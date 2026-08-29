import { generateRoomId, generateUserId } from "@/utils/random";
import {
  DEFAULT_CHARACTER,
  type Instance,
  type Room,
  type Socket,
  type Spectator,
  type User,
} from "./types";
import {
  isRoomWithGame,
  errorGuardedEndpoint,
  getFirstViewableInstance,
  leaveCurrentStep,
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendUserAssigned,
  updatePlayerCount,
} from "./utils";
import { enterStartStep } from "./startStep";
import { schemas, Team } from "@/shared/api";
import { enterGameStep } from "./gameStep";
import { globalEndpoints } from "./global";
import { roomManager } from "./roomManager";
import { enterAdminStep } from "./adminStep";
import { toSerializedTranslation } from "@/utils/translation";
import { enterSpectatorStep } from "./spectatorStep";
import { joinRoomAsPlayer } from "./joinRoom";

export const enterIntroStep = (socket: Socket): void => {
  globalEndpoints(socket);

  socket.on("adminLogin", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.adminLoginRequest,
        callback,
        (payload) => {
          if (payload.password !== process.env.FRONT_ADMIN_PASSWORD) {
            console.log(
              "[🔌 Socket] Admin login attempt with invalid password",
            );
            return callback({ status: 400, error: toSerializedTranslation("error.invalidPassword") });
          }
          console.log("[🔌 Socket] Admin login attempt with valid password");
          leaveCurrentStep(socket);
          enterAdminStep(socket);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("createRoom", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.createRoomRequest,
        callback,
        (payload) => {
          if (payload.name.length === 0) {
            return callback({ status: 400, error: toSerializedTranslation("error.nameRequired") });
          }

          if (payload.name.length > 16) {
            return callback({
              status: 400,
              error: toSerializedTranslation("error.nameLength"),
            });
          }

          if (!/^[a-zA-Z0-9_]+$/.test(payload.name)) {
            return callback({
              status: 400,
              error:
                toSerializedTranslation("error.nameContent"),
            });
          }

          const roomId = generateRoomId();

          const instance: Instance = {
            id: generateUserId(),
            name: payload.name,
            isCopy: false,
            isActive: true,
            character: DEFAULT_CHARACTER,
            team: Team.Team1,
          };

          const user: User = {
            socket,
            isHost: true,
            instances: [instance],
          };
          sendUserAssigned(socket, instance);

          const room: Room = roomManager.createRoom(roomId, user);
          updatePlayerCount(room);

          leaveCurrentStep(socket);
          enterStartStep(socket, room, user);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("enterRoom", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.enterRoomRequest,
        callback,
        (payload) => {
          const room = roomManager.findRoom(payload.roomId);

          if (!room) {
            return callback({ status: 400, error: toSerializedTranslation("error.roomNotFound") });
          }

          if (payload.type === "spectate") {
            const viewing = getFirstViewableInstance(room);
            if (!viewing) {
              return callback({
                status: 400,
                error: toSerializedTranslation("error.roomNotFound"),
              });
            }

            roomManager.removeSpectator(socket);
            leaveCurrentStep(socket);

            const spectator: Spectator = {
              socket,
              viewingName: viewing.name,
            };
            room.spectators.push(spectator);
            enterSpectatorStep(socket, room, spectator);
            sendRoomChangedToAll(room);
            return callback({ status: 200 });
          }

          if (payload.type === "rejoin") {
            const joinAsUser = room.users.find((user) =>
              user.instances.some((instance) => instance.id === payload.userId),
            );
            if (!joinAsUser) {
              return callback({ status: 400, error: toSerializedTranslation("error.userNotFound") });
            }
            roomManager.removeSpectator(socket);
            joinAsUser.socket = socket;
            leaveCurrentStep(socket);
            if (isRoomWithGame(room)) {
              enterGameStep(socket, room, joinAsUser);
            } else {
              enterStartStep(socket, room, joinAsUser);
            }
          } else {
            joinRoomAsPlayer(socket, room, payload.name, callback);
            return;
          }
          return callback({ status: 200 });
        },
      ),
    ),
  );
};
