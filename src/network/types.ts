import type { RoomCharacter } from "../shared/api";
import type { GameParameters } from "../models/gameParameters";
import type { Game } from "../models/game";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/api";
import type { Socket as SocketIO, Server as ServerIO } from "socket.io";

export type Socket = SocketIO<ClientToServerEvents, ServerToClientEvents>;
export type Server = ServerIO<ClientToServerEvents, ServerToClientEvents>;

export const DEFAULT_CHARACTER: RoomCharacter = {
  character: "random",
  eternal: "random",
};

export type User = {
  id: string;
  lastActionTimestamp: Date;
  socket: Socket;
  name?: string;
  character: RoomCharacter;
  isHost: boolean;
};

export type Room = {
  id: string;
  users: User[];
  params: GameParameters;
  characters: RoomCharacter[];
  game?: Game;
};
