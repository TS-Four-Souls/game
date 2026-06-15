export interface ServerRoomBroadcast {
  type: "info" | "error" | "success" | "warning" | "victory";
  title: string;
  message: string;
  players: string[];
}