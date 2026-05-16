import { generateRoomId, generateUserId } from "@/utils/random";
import { DEFAULT_CHARACTER, type Room, type Socket, type User } from "./types";
import { GameParameters } from "@/models/gameParameters";
import {
  generateCharacterAndEternalPairs,
  payloadGuardedEndpoint,
  sendRoomChangedToAll,
  sendUserAssigned,
} from "./utils";
import { enterStartStep } from "./startStep";
import { schemas } from "@/shared/api";
import { enterGameStep } from "./gameStep";
import { globalEndpoints } from "./global";

export const enterIntroStep = (socket: Socket, rooms: Map<string, Room>) => {
  const leaveIntroStep = (socket: Socket) => {
    socket.removeAllListeners();
  };

  globalEndpoints(socket);

  socket.on("createRoom", (callback) => {
    const roomId = generateRoomId();

    const user: User = {
      id: generateUserId(),
      lastActionTimestamp: new Date(),
      socket,
      character: DEFAULT_CHARACTER,
      isHost: true,
    };
    sendUserAssigned(socket, user);

    const room: Room = {
      id: roomId,
      users: [user],
      params: new GameParameters(() => {
        sendRoomChangedToAll(room);
      }),
      characters: generateCharacterAndEternalPairs(),
    };
    rooms.set(roomId, room);

    leaveIntroStep(socket);
    enterStartStep(socket, rooms, room, user);
    return callback({ status: 200 });
  });

  socket.on("enterRoom", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.enterRoomRequest,
      callback,
      (payload) => {
        const room = rooms.get(payload.roomId);

        if (!room) {
          return callback({ status: 400, error: "Room not found" });
        }

        if (payload.userId) {
          const user = room.users.find((user) => user.id === payload.userId);
          if (!user) {
            return callback({ status: 400, error: "User not found" });
          }
          user.socket = socket;
          user.lastActionTimestamp = new Date();
          leaveIntroStep(socket);
          if (room.game === undefined) {
            console.log("Entering start step");
            enterStartStep(socket, rooms, room, user);
          } else {
            console.log("Entering game step");
            enterGameStep(socket, rooms, room, user);
          }
        } else {
          if (room.users.length >= 4) {
            return callback({ status: 400, error: "Room is full" });
          }
          if (room.game !== undefined) {
            return callback({ status: 400, error: "Game is already started" });
          }
          const user: User = {
            id: generateUserId(),
            lastActionTimestamp: new Date(),
            socket,
            character: DEFAULT_CHARACTER,
            isHost: false,
          };
          sendUserAssigned(socket, user);

          room.users.push(user);

          leaveIntroStep(socket);
          enterStartStep(socket, rooms, room, user);
        }
        return callback({ status: 200 });
      },
    );
  });
};
