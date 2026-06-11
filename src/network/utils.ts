import type { z, ZodType } from "zod";
import type { Room, Socket, User } from "./types";
import type { Room as RoomPayload } from "@/shared/api";
import { roomManager } from "./roomManager";
import { getAdminMessages } from "@/utils/db";

export const errorGuardedEndpoint = async (
  callback: (response: { status: 400; error: string }) => void,
  handler: () => void | Promise<void>,
): Promise<void> => {
  try {
    await handler();
  } catch (error) {
    console.error("Error in errorGuardedEndpoint", error);
    if (error instanceof Error) {
      return callback({ status: 400, error: error.message });
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

export const sendRoomChangedToAll = (room: Room) => {
  for (const user of room.users) {
    sendRoomChangedToUser(room, user);
  }
};

export const sendRoomChangedToAllExcept = (room: Room, exception: User) => {
  for (const user of room.users) {
    if (user.id === exception.id) {
      continue;
    }
    sendRoomChangedToUser(room, user);
  }
};

export const sendRoomChangedToUser = (room: Room | null, user: User) => {
  user.socket.emit(
    "on:room:changed",
    room ? generateRoomChangedPayload(room, user) : null,
  );
};

export const sendAdminChanged = (socket: Socket) => {
  socket.emit("on:admin:changed", {
    rooms: roomManager.adminRooms,
    messages: getAdminMessages(),
  });
};

const generateRoomChangedPayload = (
  room: Room,
  recipient: User,
): RoomPayload => {
  const others = room.users.flatMap((user) => {
    if (user.id === recipient.id) {
      return [];
    }
    if (!user.name) {
      return [];
    }
    return {
      id: user.id,
      name: user.name,
      character: user.character,
      isHost: user.isHost,
    };
  });

  return {
    id: room.id,
    ...(recipient.name
      ? {
          me: {
            name: recipient.name,
            character: recipient.character,
            isHost: recipient.isHost,
          },
        }
      : {}),
    players: others,
    characters: room.characters,
    gameParameters: room.params.toJson(),
    ...(recipient.name
      ? {
          game: room.game?.detailedStateJSON(
            room.game.entityHandler.getPlayerById(recipient.name),
          ),
        }
      : {}),
  };
};

export const sendUserAssigned = (socket: Socket, user: User | null) => {
  socket.emit("on:user:assigned", user?.id ?? null);
};

export const updatePlayerCount = (room: Room) => {
  room.params.setPlayerCount(
    room.users.filter((user) => user.name !== undefined).length,
  );
};

export const leaveCurrentStep = (socket: Socket) => {
  socket.removeAllListeners();
};

export const registerRoomActivity = (room: Room) => {
  room.lastActionTimestamp = new Date();
};
