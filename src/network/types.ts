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

export type Instance = {
  id: string;
  name?: string;
  isCopy: boolean;
  isActive: boolean;
  character: RoomCharacter;
  teamId?: number;
};

export type User = {
  socket: Socket;
  isHost: boolean;
  instances: Instance[]
};

export type Room = {
  id: string;
  lastActionTimestamp: Date;
  users: User[];
  params: GameParameters;
  characters: RoomCharacter[];
  game?: Game;
  createdAt: Date;
};
