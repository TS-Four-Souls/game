import { type SerializedTranslation } from "@/shared/api";

export interface ServerRoomBroadcast {
  type: "info" | "error" | "success" | "warning" | "victory";
  title: SerializedTranslation;
  message: SerializedTranslation;
  players: string[];
}