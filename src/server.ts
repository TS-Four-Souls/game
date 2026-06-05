import { Server as Engine, type WebSocketData } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "./shared/api";
import { enterIntroStep } from "./network/introStep";
import { adminHandler } from "./network/adminHandler";

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
  async fetch(req: Request, server: Bun.Server<WebSocketData>) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/admin")) {
      return await adminHandler(req);
    }
    return engineHandler.fetch(req, server);
  },
};
