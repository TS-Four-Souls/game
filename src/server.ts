import { Server as Engine } from "@socket.io/bun-engine";
import { Server } from "socket.io";
import { Game } from "./models/game";
import { Player } from "./models/player";
import type { ClientToServerEvents, Issuer, ServerToClientEvents } from "./shared/api";
import { schemas } from "./shared/api";

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOSTNAME || "localhost";
const io = new Server<ClientToServerEvents, ServerToClientEvents>();

const game = new Game();

const engine = new Engine({
  path: "/socket.io/",
  cors: {
    origin: "*",
  },
});

io.bind(engine);

game.onStateChange.add(() => {
  game.players.map((player) => {
    io.to(player.id).emit("on:game:changed", game.detailedStateJSON(player));
  }) 
});

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("join", (payload, callback) => {
    const validated = schemas.joinRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const name = validated.data;
      const player = new Player(name);
      game.addPlayer(player);
      console.log(`Player ${name} joined the game`);
      socket.join(player.id);
      return callback({ status: 200, secret: player.secret });
    } catch (error) {
      console.error("Failed to join the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("rejoin", (payload, callback) => {
    const validated = schemas.rejoinRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      const player = game.getPlayerById(validated.data.id);
      if (!player.verifySecret(validated.data.secret)) {
        return callback({ status: 400, error: "Invalid secret" });
      }
      socket.join(player.id);
      return callback({ status: 200, gameState: game.detailedStateJSON(validated.data) });
    } catch (error) {
      console.error("Failed to rejoin the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("start", (payload, callback) => {
    const validated = schemas.startRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.start(validated.data.issuer);
      io.emit("on:game:start");
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to start the game", error);
      return callback({ status: 400, error });
    }
  });

  socket.on("reset", (payload, callback) => {
    const validated = schemas.resetRequest.safeParse(payload);
    if (!validated.success) {
      return callback({ status: 400, error: validated.error });
    }
    try {
      game.reset();
      return callback({ status: 200 });
    } catch (error) {
      console.error("Failed to reset the game", error);
      return callback({ status: 400, error });
    }
  });
});

io.on("disconnect", (socket) => {
  console.log("Client disconnected");
});

export default {
  port: PORT,
  hostname: HOSTNAME,
  ...engine.handler(),
};
