import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "./shared/api";
import { enterIntroStep } from "./network/introStep";
import { roomManager } from "./network/roomManager";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

const engine = new Engine({
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});

io.bind(engine);

// Global unhandled rejection handler for debugging
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  console.error("Stack trace:", new Error().stack);
});

// Secure server with API key
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey !== process.env.FRONT_API_KEY) {
    return next(new Error("Invalid API key"));
  }
  next();
});

io.on("connection", (socket) => {
  try {
    socket.on("disconnect", () => {
      roomManager.removeSpectator(socket);
    });
    enterIntroStep(socket);
  } catch (error) {
    console.error("Error in connection handler", error);
    socket.disconnect();
  }
});

const engineHandler = engine.handler();

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engineHandler,
};
