export type ServerRoomBroadcast = {
  type: "info" | "error" | "success";
  title: string;
  message: string;
  players: string[];
};