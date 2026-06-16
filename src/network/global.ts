import { schemas } from "@/shared/api";
import type { Room, Socket } from "./types";
import { errorGuardedEndpoint, payloadGuardedEndpoint } from "./utils";
import { insertReport } from "@/utils/db";
import { roomManager } from "./roomManager";

const REPORT_COOLDOWN = 1_000 * 30; // 30 seconds

export const globalEndpoints = (socket: Socket, room?: Room): void => {
  let lastReportedAt = 0;

  socket.on("contact", (payload, callback) =>
    errorGuardedEndpoint(callback, () =>
      payloadGuardedEndpoint(
        payload,
        schemas.contactRequest,
        callback,
        (payload) => {
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
        },
      ),
    ),
  );
};
