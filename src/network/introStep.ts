import { generateRoomId, generateUserId } from "@/utils/random";
import { DEFAULT_CHARACTER, type Room, type Socket, type User } from "./types";
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
            console.log("[🔌 Socket] Admin login attempt with invalid password");
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

      const user: User = {
        id: generateUserId(),
        socket,
        character: DEFAULT_CHARACTER,
        isHost: true,
      };
      sendUserAssigned(socket, user);

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
            const user = room.users.find((user) => user.id === payload.userId);
            if (!user) {
              return callback({ status: 400, error: "User not found" });
            }
            user.socket = socket;
            leaveCurrentStep(socket);
            if (room.game === undefined) {
              enterStartStep(socket, room, user);
            } else if (user.name) {
              enterGameStep(socket, room, user);
            } else {
              return callback({
                status: 400,
                error:
                  "The game already before you could enter your name. It's too late for you to join.",
              });
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
            const user: User = {
              id: generateUserId(),
              socket,
              character: DEFAULT_CHARACTER,
              isHost: false,
            };
            sendUserAssigned(socket, user);

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
