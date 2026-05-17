import { GameParameters } from "@/models/gameParameters";
import type { Room, User } from "./types";
import {
  leaveCurrentStep,
  sendRoomChangedToAll,
  sendRoomChangedToUser,
  sendUserAssigned,
} from "./utils";
import { CARD_SETS } from "@/models/game";
import type { RoomCharacter } from "@/shared/api";
import { enterIntroStep } from "./introStep";
import bun from "bun";

const INACTIVE_ROOM_TIMEOUT = 3 * 60 * 60 * 1_000; // 3 hours

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  constructor() {
    setInterval(() => {
      this.pruneInactiveRooms();
    }, 60_000);
  }

  private pruneInactiveRooms() {
    this.rooms.forEach((room) => {
      if (
        room.users.every(
          (user) =>
            user.lastActionTimestamp.getTime() <
            Date.now() - INACTIVE_ROOM_TIMEOUT,
        )
      ) {
        room.users.forEach((user) => {
          leaveCurrentStep(user.socket);
          enterIntroStep(user.socket);
          sendUserAssigned(user.socket, null);
          sendRoomChangedToUser(null, user);

          user.socket.emit("on:room:broadcast", {
            type: "error",
            title: "Room purged",
            message:
              "The room has been purged because it has been inactive for too long.",
          });
        });
        this.rooms.delete(room.id);
      }
    });
  }

  createRoom(roomId: string, user: User): Room {
    const room: Room = {
      id: roomId,
      users: [user],
      params: new GameParameters(() => {
        sendRoomChangedToAll(room);
      }),
      characters: RoomManager.generateCharacterAndEternalPairs(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  private static generateCharacterAndEternalPairs = (): RoomCharacter[] => {
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

  deleteRoom(roomId: string) {
    this.saveGameLogs(roomId, false);
    this.rooms.delete(roomId);
  }

  saveGameLogs(roomId: string, bugReport: boolean): string | undefined {
    const room = this.rooms.get(roomId);
    if (!room || !room.game) return;
    const game = room.game;

    if (!bugReport && room.game.turnHandler.round < 4) return;

    let logs = JSON.stringify(game.log, null, 2);

    // Anonymize player names
    for (const [index, player] of game.players.entries()) {
      logs = logs.replaceAll(`"${player.id}`, `"p${index}`);
    }

    // Save logs to file
    const fileName = `${roomId}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const folder = bugReport ? "bug-logs" : "room-logs";
    bun.write(`db/${folder}/${fileName}`, logs);
    return fileName;
  }

  findRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }
}

export const roomManager = new RoomManager();
