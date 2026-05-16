import { CARD_SETS } from "@/models/game";
import type { RoomCharacter } from "@/shared/api";
import type { z, ZodType } from "zod";
import type { Room, Socket, User } from "./types";
import type { Room as RoomPayload } from "@/shared/api";

export const payloadGuardedEndpoint = <T extends ZodType>(
  payload: unknown,
  schema: T,
  callback: (response: { status: 400; error: string }) => void,
  onSuccess: (payload: z.infer<T>) => void,
): void => {
  const validated = schema.safeParse(payload);
  if (!validated.success) {
    return callback({ status: 400, error: validated.error.message });
  }
  onSuccess(validated.data);
};

export const generateCharacterAndEternalPairs = (): RoomCharacter[] => {
  const charas = CARD_SETS.character.cards.map((card) => ({
    character: card.jsonAPI,
    eternal: card.eternalCard,
  }));

  return [
    { character: "random", eternal: "random" },
    ...charas.map((card) => ({
      character: card.character.slug,
      eternal: card.eternal ?? "random",
    })),
  ];
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
            room.game.getPlayerById(recipient.name),
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
  socket.offAny();
};