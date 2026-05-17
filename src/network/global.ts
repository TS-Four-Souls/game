import { schemas } from "@/shared/api";
import type { Room, Socket } from "./types";
import { payloadGuardedEndpoint } from "./utils";
import { insertReport } from "@/utils/db";
import { roomManager } from "./roomManager";

const REPORT_COOLDOWN = 1_000 * 30; // 30 seconds

export const globalEndpoints = (socket: Socket, room?: Room) => {
  let lastReportedAt = 0;

  socket.on("contact", (payload, callback) => {
    payloadGuardedEndpoint(
      payload,
      schemas.contactRequest,
      callback,
      (payload) => {
        try {
          if (Date.now() - lastReportedAt < REPORT_COOLDOWN) {
            return callback({
              status: 400,
              error:
                "You already submitted a report recently. Please wait a few minutes before submitting another one.",
            });
          }

          const logs =
            room && payload.type === "bug"
              ? roomManager.saveGameLogs(room.id, true)
              : null;

          insertReport(
            payload.type,
            payload.description,
            payload.email ?? null,
            logs ?? null,
          );

          lastReportedAt = Date.now();
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
