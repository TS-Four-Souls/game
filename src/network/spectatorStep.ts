import { schemas } from "@/shared/api";
import { toSerializedTranslation } from "@/utils/translation";
import { globalEndpoints } from "./global";
import { enterIntroStep } from "./introStep";
import { joinRoomAsPlayer } from "./joinRoom";
import type { Room, Socket, Spectator } from "./types";
import {
  errorGuardedEndpoint,
  getUserByName,
  leaveCurrentStep,
  payloadGuardedEndpoint,
  resolveSpectatorView,
  sendRoomChangedToAll,
  sendRoomChangedToSpectator,
} from "./utils";

export const enterSpectatorStep = (
  socket: Socket,
  room: Room,
  spectator: Spectator,
): void => {
  const viewing = resolveSpectatorView(room, spectator);
  if (!viewing) {
    // TODO: Translate
    throw new Error("No player available to spectate");
  }

  sendRoomChangedToSpectator(room, spectator);

  globalEndpoints(socket, room);

  socket.on("leaveRoom", async (callback) =>
    errorGuardedEndpoint(callback, () => {
      room.spectators = room.spectators.filter(
        (s) => s.socket.id !== socket.id,
      );

      sendRoomChangedToSpectator(null, spectator);
      sendRoomChangedToAll(room);

      leaveCurrentStep(socket);
      enterIntroStep(socket);

      return callback({ status: 200 });
    }),
  );

  socket.on("enterRoom", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.enterRoomRequest,
        callback,
        (payload) => {
          if (payload.type !== "join") {
            return callback({
              status: 400,
              error: toSerializedTranslation("error.roomNotFound"),
            });
          }

          if (payload.roomId !== room.id) {
            return callback({
              status: 400,
              error: toSerializedTranslation("error.roomNotFound"),
            });
          }

          joinRoomAsPlayer(socket, room, payload.name, callback);
        },
      ),
    ),
  );

  socket.on("switchToCopy", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.switchToCopyRequest,
        callback,
        (payload) => {
          const target = getUserByName(room, payload.name);
          if (!target) {
            return callback({ status: 400, error: "User not found" });
          }
          if (target.instance.name === spectator.viewingName) {
            return callback({
              status: 400,
              error: toSerializedTranslation("capability.cannotSwitchToSelf"),
            });
          }

          spectator.viewingName = target.instance.name;
          sendRoomChangedToSpectator(room, spectator);

          return callback({ status: 200 });
        },
      ),
    ),
  );
};
