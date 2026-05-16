import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "./shared/api";
import { enterIntroStep } from "./network/introStep";
import type { Room } from "./network/types";
import { pruneInactiveRooms } from "./network/roomManager";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

const rooms: Map<string, Room> = new Map();
const engine = new Engine({
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});

setInterval(() => {
  pruneInactiveRooms(rooms);
}, 60_000);

io.bind(engine);

// Secure server with API key
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey !== process.env.FRONT_API_KEY) {
    return next(new Error("Invalid API key"));
  }
  next();
});

io.on("connection", (socket) => enterIntroStep(socket, rooms));

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engine.handler(),
};
