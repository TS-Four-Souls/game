/** Generate a random ID with 6 alphanumeric characters, only uppercase letters and numbers */
export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateUserId(): string {
  return crypto.randomUUID();
}

export function generateHistoryId(): string {
  return crypto.randomUUID();
}