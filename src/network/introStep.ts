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
  sendUserAssigned,
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

  socket.on("createRoom", (callback) =>
    errorGuardedEndpoint(callback, () => {
      const roomId = generateRoomId();

      const instance: Instance = {
        id: generateUserId(),
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

      leaveCurrentStep(socket);
      enterStartStep(socket, room, user);
      return callback({ status: 200 });
    }),
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

          if (payload.userId) {
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
            const instance: Instance = {
              id: generateUserId(),
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

            leaveCurrentStep(socket);
            enterStartStep(socket, room, user);
          }
          return callback({ status: 200 });
        },
      ),
    ),
  );
};
