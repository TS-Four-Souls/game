import { getAdminMessages, markReportAsResolved } from "@/utils/db";
import { roomManager } from "./roomManager";
import type { AdminResponse } from "@/shared/api";

const adminResponse = (
  body: Record<string, any> | undefined,
  options: ResponseInit,
) => {
  return Response.json(body, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "X-API-Key",
    },
  });
};

export const adminHandler = async (req: Request) => {
  const url = new URL(req.url);

  if (req.method !== "OPTIONS") {
    if (req.headers.get("X-API-Key") !== process.env.FRONT_ADMIN_PASSWORD) {
      return adminResponse({ error: "Invalid API key" }, { status: 401 });
    }
  }

  if (url.pathname === "/admin") {
    const response: AdminResponse = {
      rooms: roomManager.adminRooms,
      messages: getAdminMessages(),
    };
    return adminResponse(response, { status: 200 });
  }

  if (url.pathname.startsWith("/admin/message/")) {
    const pathParts = url.pathname.split("/");
    const suffix = pathParts.pop();
    if (!suffix || suffix !== "resolve") {
      return adminResponse(undefined, { status: 404 });
    }
    const stringId = pathParts.pop();
    if (!stringId) {
      return adminResponse(
        { error: "No provided message ID" },
        { status: 400 },
      );
    }
    const id = parseInt(stringId);
    if (isNaN(id)) {
      return adminResponse(
        { error: "Provided message ID is not a number" },
        { status: 400 },
      );
    }
    markReportAsResolved(id);

    const response: AdminResponse = {
      rooms: roomManager.adminRooms,
      messages: getAdminMessages(),
    };

    return adminResponse(response, { status: 200 });
  }
  if (url.pathname.startsWith("/admin/logs/")) {
    const filename = url.pathname.split("/").pop();
    if (!filename) {
      return adminResponse({ error: "Invalid filename" }, { status: 400 });
    }
    const logs = await roomManager.getGameLogs(filename);
    if (!logs) {
      return adminResponse({ error: "Logs not found" }, { status: 404 });
    }
    const parsedLogs = JSON.parse(logs);
    return adminResponse(parsedLogs, { status: 200 });
  }
};
