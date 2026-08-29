import type { z, ZodType } from "zod";
import type { Instance, Room, RoomWithGame, Socket, User } from "./types";
import type {
  Room as RoomPayload,
  RoomStatus,
  SerializedTranslation,
} from "@/shared/api";
import { MAX_PLAYER_COUNT, roomManager } from "./roomManager";
import { getAdminMessages, getHourlyGameStats } from "@/utils/db";
import { Game } from "@/models/game";
import { GameError } from "@/models/GameError";
import { toSerializedTranslation } from "@/utils/translation";

export const errorGuardedEndpoint = async (
  callback: (response: {
    status: 400;
    error: string | SerializedTranslation;
  }) => void,
  handler: () => void | Promise<void>,
): Promise<void> => {
  try {
    await handler();
  } catch (error) {
    console.error("Error in errorGuardedEndpoint", error);
    if (error instanceof Error) {
      return callback({
        status: 400,
        error:
          error instanceof GameError && error.translation !== undefined
            ? error.translation
            : error.message,
      });
    }
    return callback({ status: 400, error: "Unknown error" });
  }
};

export const payloadGuardedEndpoint = async <T extends ZodType>(
  payload: unknown,
  schema: T,
  callback: (response: { status: 400; error: string }) => void,
  onSuccess: (payload: z.infer<T>) => void | Promise<void>,
): Promise<void> => {
  const validated = schema.safeParse(payload);
  if (!validated.success) {
    return callback({ status: 400, error: validated.error.message });
  }
  await onSuccess(validated.data);
};

export const sendRoomChangedToAll = (room: Room): void => {
  for (const user of room.users) {
    sendRoomChangedToUser(room, user);
  }
  sendRoomStatusChangedToSpectators(room);
};

export const sendRoomChangedToUser = (room: Room | null, user: User): void => {
  for (const instance of user.instances) {
    if (instance.isActive) {
      user.socket.emit(
        "on:room:changed",
        room ? generateRoomChangedPayload(room, instance) : null,
      );
    } else if (room?.game) {
      room.game.detailedStateJSON(
        room.game.entityHandler.getPlayerById(instance.name),
      );
    }
  }
};

export const generateRoomStatusPayload = (room: Room): RoomStatus => {
  let canJoin: RoomStatus["canJoin"] = true;
  if (!room.isJoinAllowed) {
    canJoin = toSerializedTranslation("error.roomLocked");
  } else if (room.game !== undefined) {
    canJoin = toSerializedTranslation("error.gameStarted");
  } else if (
    room.users.flatMap((user) => user.instances).length >= MAX_PLAYER_COUNT
  ) {
    canJoin = toSerializedTranslation("error.roomFull");
  }

  return {
    playerCount: room.users.length,
    isGameOngoing: room.game !== undefined,
    canJoin,
  };
};

export const sendRoomStatusChangedToSpectators = (room: Room): void => {
  room.spectators = room.spectators.filter(
    (spectator) => spectator.socket.connected,
  );
  const payload = generateRoomStatusPayload(room);
  for (const spectator of room.spectators) {
    spectator.socket.emit("on:room-status:changed", payload);
  }
};

export const sendRoomStatusChangedToSocket = (
  socket: Socket,
  room: Room,
): void => {
  socket.emit("on:room-status:changed", generateRoomStatusPayload(room));
};

export const sendAdminChanged = (socket: Socket): void => {
  socket.emit("on:admin:changed", {
    rooms: roomManager.adminRooms,
    messages: getAdminMessages(),
    stats: {
      hourly: getHourlyGameStats(),
    },
  });
};

const generateRoomChangedPayload = (
  room: Room,
  recipient: Instance,
): RoomPayload => {
  return {
    id: room.id,
    players: room.users
      .map((user) =>
        user.instances.flatMap((instance) => ({
          isMe: user.instances.some((instance) => instance.id === recipient.id),
          isHost: user.isHost,
          isCopy: instance.isCopy,
          name: instance.name,
          character: instance.character,
          team: instance.team,
        })),
      )
      .flat(),
    characters: room.characters,
    gameParameters: room.params.toJson(),
    game: room.game?.detailedStateJSON(
      room.game.entityHandler.getPlayerById(recipient.name),
    ),
    isJoinAllowed: room.isJoinAllowed,
  };
};

export const sendUserAssigned = (
  socket: Socket,
  instance: Instance | null,
): void => {
  socket.emit("on:user:assigned", instance?.id ?? null);
};

export const updatePlayerCount = (room: Room): void => {
  room.params.setPlayerCount(
    room.users.flatMap((user) => user.instances).length,
  );
};

export const leaveCurrentStep = (socket: Socket): void => {
  roomManager.removeSpectator(socket);
  for (const event of socket.eventNames()) {
    if (event === "disconnect") continue;
    socket.removeAllListeners(event);
  }
};

export const registerRoomActivity = (room: Room): void => {
  room.lastActionTimestamp = new Date();
};

export const getUserByName = (
  room: Room,
  name: string,
): { user: User; instance: User["instances"][number] } | null => {
  for (const user of room.users) {
    for (const instance of user.instances) {
      if (instance.name === name) {
        return { user, instance };
      }
    }
  }
  return null;
};

export const isRoomWithGame = (
  room: Room | RoomWithGame,
): room is RoomWithGame => {
  return "game" in room && room.game instanceof Game;
};
