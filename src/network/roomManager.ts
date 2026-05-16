import { enterIntroStep } from "./introStep";
import type { Room } from "./types";
import {
  leaveCurrentStep,
  sendRoomChangedToUser,
  sendUserAssigned,
} from "./utils";

const INACTIVE_ROOM_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

export const pruneInactiveRooms = (rooms: Map<string, Room>) => {
  rooms.forEach((room) => {
    if (
      room.users.every(
        (user) =>
          user.lastActionTimestamp.getTime() <
          Date.now() - INACTIVE_ROOM_TIMEOUT,
      )
    ) {
      room.users.forEach((user) => {
        leaveCurrentStep(user.socket);
        enterIntroStep(user.socket, rooms);
        sendUserAssigned(user.socket, null);
        sendRoomChangedToUser(null, user);

        user.socket.emit("on:room:broadcast", {
          type: "error",
          title: "Room purged",
          message:
            "The room has been purged because it has been inactive for too long.",
        });
      });
      rooms.delete(room.id);
    }
  });
};
