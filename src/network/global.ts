import { schemas } from "@/shared/api";
import type { Socket } from "./types";
import { payloadGuardedEndpoint } from "./utils";
import type { Game } from "@/models/game";

export const reportBugEndpoint = (socket: Socket, game?: Game) => {
  socket.on("reportBug", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.reportBugRequest,
      callback,
      (payload) => {
        try {
          console.log(payload);
          return callback({ status: 200 });
        } catch (error) {
          console.error("Failed to report bug", error);
          if (error instanceof Error) {
            return callback({ status: 400, error: error.message });
          }
          return callback({ status: 400, error: "Unknown error" });
        }
      },
    );
  });
};
