import { generateRoomId, generateUserId } from "@/utils/random";
import {
  DEFAULT_CHARACTER,
  type Instance,
  type Room,
  type Socket,
  type User,
} from "./types";
import {
  errorGuardedEndpoint,
  leaveCurrentStep,
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendUserAssigned,
  updatePlayerCount,
} from "./utils";
import { enterStartStep } from "./startStep";
import { schemas } from "@/shared/api";
import { enterGameStep } from "./gameStep";
import { globalEndpoints } from "./global";
import { roomManager } from "./roomManager";
import { enterAdminStep } from "./adminStep";

export const enterIntroStep = (socket: Socket) => {
  globalEndpoints(socket);

  socket.on("adminLogin", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.adminLoginRequest,
        callback,
        (payload) => {
          if (payload.password !== process.env.FRONT_ADMIN_PASSWORD) {
            console.log(
              "[🔌 Socket] Admin login attempt with invalid password",
            );
            return callback({ status: 400, error: "Invalid password" });
          }
          console.log("[🔌 Socket] Admin login attempt with valid password");
          leaveCurrentStep(socket);
          enterAdminStep(socket);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("createRoom", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.createRoomRequest,
        callback,
        (payload) => {
          if (payload.name.length === 0) {
            return callback({ status: 400, error: "A name is required" });
          }

          if (payload.name.length > 16) {
            return callback({
              status: 400,
              error: "Your name needs to be less than 16 characters",
            });
          }

          if (!/^[a-zA-Z0-9_]+$/.test(payload.name)) {
            return callback({
              status: 400,
              error:
                "Your name can only contain letters, numbers and underscores",
            });
          }

          const roomId = generateRoomId();

          const instance: Instance = {
            id: generateUserId(),
            name: payload.name,
            isCopy: false,
            isActive: true,
            character: DEFAULT_CHARACTER,
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

  socket.on("enterRoom", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.enterRoomRequest,
        callback,
        (payload) => {
          const room = roomManager.findRoom(payload.roomId);

          if (!room) {
            return callback({ status: 400, error: "Room not found" });
          }

          if (payload.type === "rejoin") {
            const joinAsUser = room.users.find((user) =>
              user.instances.some((instance) => instance.id === payload.userId),
            );
            if (!joinAsUser) {
              return callback({ status: 400, error: "User not found" });
            }
            joinAsUser.socket = socket;
            leaveCurrentStep(socket);
            if (room.game === undefined) {
              enterStartStep(socket, room, joinAsUser);
            } else {
              enterGameStep(socket, room, joinAsUser);
            }
          } else {
            if (room.users.length >= 4) {
              return callback({ status: 400, error: "Room is full" });
            }

            if (room.game !== undefined) {
              return callback({
                status: 400,
                error: "Game is already started",
              });
            }

            if (payload.name.length === 0) {
              return callback({ status: 400, error: "A name is required" });
            }

            if (payload.name.length > 16) {
              return callback({
                status: 400,
                error: "Your name needs to be less than 16 characters",
              });
            }

            if (!/^[a-zA-Z0-9_]+$/.test(payload.name)) {
              return callback({
                status: 400,
                error:
                  "Your name can only contain letters, numbers and underscores",
              });
            }

            if (
              room.users.some((user) =>
                user.instances.some(
                  (instance) => instance.name === payload.name,
                ),
              )
            ) {
              return callback({
                status: 400,
                error: "That name is already taken",
              });
            }

            const instance: Instance = {
              id: generateUserId(),
              name: payload.name,
              isCopy: false,
              isActive: true,
              character: DEFAULT_CHARACTER,
            };
            const user: User = {
              instances: [instance],
              socket,
              isHost: false,
            };
            sendUserAssigned(socket, instance);

            room.users.push(user);
            updatePlayerCount(room);

            leaveCurrentStep(socket);
            enterStartStep(socket, room, user);
            sendRoomChangedToAll(room);
          }
          return callback({ status: 200 });
        },
      ),
    ),
  );
};
