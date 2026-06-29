import { globalEndpoints } from "./global";
import type { Socket } from "./types";
import { schemas } from "@/shared/api";
import {
  errorGuardedEndpoint,
  payloadGuardedEndpoint,
  sendAdminChanged,
} from "./utils";
import {
  getAdminMessageById,
  updateReportReply,
  updateReportStatus,
} from "@/utils/db";
import { sendEmail } from "@/utils/mail";
import { roomManager } from "./roomManager";

export const enterAdminStep = (socket: Socket): void => {
  sendAdminChanged(socket);
  globalEndpoints(socket);

  socket.on("adminChangeMessageStatus", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.adminChangeMessageStatusRequest,
        callback,
        (payload) => {
          updateReportStatus(payload.id, payload.resolved);
          sendAdminChanged(socket);
          return callback({ status: 200 });
        },
      ),
    ),
  );

  socket.on("adminGetLogs", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.adminGetLogsRequest,
        callback,
        async (payload) => {
          const message = getAdminMessageById(payload.id);
          if (!message)
            return callback({ status: 400, error: "Message not found" });
          if (!message.logs)
            return callback({ status: 400, error: "Message has no logs" });
          const logs = await roomManager.getGameLogs(message.logs);
          if (!logs) {
            return callback({ status: 500, error: "Logs not found" });
          }
          try {
            const parsedLogs = JSON.parse(logs);
            return callback({ status: 200, logs: parsedLogs });
          } catch (error) {
            console.error("[🔌 Socket] Failed to parse logs", error);
            return callback({ status: 500, error: "Failed to parse logs" });
          }
        },
      ),
    ),
  );

  socket.on("adminReplyToMessage", async (payload, callback) =>
    errorGuardedEndpoint(callback, async () =>
      payloadGuardedEndpoint(
        payload,
        schemas.adminReplyToMessageRequest,
        callback,
        async (payload) => {
          const message = getAdminMessageById(payload.id);
          if (!message)
            return callback({ status: 400, error: "Message not found" });
          if (!message.email)
            return callback({ status: 400, error: "Message has no email" });

          const dateParts = new Intl.DateTimeFormat("en-GB", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: "Europe/Paris",
            timeZoneName: "longOffset",
            hour12: false,
          }).formatToParts(new Date(message.createdAt));
          const part = (type: Intl.DateTimeFormatPartTypes): string =>
            dateParts.find((p) => p.type === type)?.value ?? "";
          const formattedDate = `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")} ${part("hour")}:${part("minute")}:${part("second")} ${part("timeZoneName").replace("GMT", "").replace(":", "")}`;

          const reply = `${payload.message}

--------
From: <${message.email}>
To: Four Online Souls<${process.env.EMAIL_USER}>
Date: ${formattedDate}
Subject: ${message.type} #${message.id}

${message.description}
`;

          try {
            await sendEmail(
              message.email,
              `Re: ${message.type} #${message.id}`,
              reply,
            );
          } catch (error) {
            console.error("[🔌 Socket] Failed to send email", error);
            return callback({ status: 500, error: "Failed to send email" });
          }
          updateReportReply(payload.id, payload.message);
          sendAdminChanged(socket);
          return callback({ status: 200 });
        },
      ),
    ),
  );
};
