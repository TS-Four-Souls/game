import type { z, ZodType } from "zod";
import type { Instance, Room, Socket, User } from "./types";
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

export const sendRoomChangedToUser = (room: Room | null, user: User) => {
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

export const sendAdminChanged = (socket: Socket) => {
  socket.emit("on:admin:changed", {
    rooms: roomManager.adminRooms,
    messages: getAdminMessages(),
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
        })),
      )
      .flat(),
    characters: room.characters,
    gameParameters: room.params.toJson(),
    game: room.game?.detailedStateJSON(
      room.game.entityHandler.getPlayerById(recipient.name),
    ),
  };
};

export const sendUserAssigned = (socket: Socket, instance: Instance | null) => {
  socket.emit("on:user:assigned", instance?.id ?? null);
};

export const updatePlayerCount = (room: Room) => {
  room.params.setPlayerCount(
    room.users.flatMap((user) => user.instances).length,
  );
};

export const leaveCurrentStep = (socket: Socket) => {
  socket.removeAllListeners();
};

export const registerRoomActivity = (room: Room) => {
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
