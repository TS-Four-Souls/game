import type { AdminMessage, ContactType } from "@/shared/api";
import { Database, SQLiteError } from "bun:sqlite";

const db = new Database("db/db.sqlite", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS reports(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    description TEXT,
    email TEXT,
    created_at TEXT,
    logs TEXT
  )`);

/* Migration 1: Add resolved column */
try {
  db.run(`ALTER TABLE reports ADD COLUMN resolved BOOLEAN DEFAULT FALSE`);
} catch (error) {
  if (
    error instanceof SQLiteError &&
    !error.message.startsWith("duplicate column name")
  ) {
    console.error(error.message);
  }
}

/* Migration 2: Add reply column */
try {
  db.run(`ALTER TABLE reports ADD COLUMN reply TEXT`);
} catch (error) {
  if (
    error instanceof SQLiteError &&
    !error.message.startsWith("duplicate column name")
  ) {
    console.error(error.message);
  }
}

export const insertReport = (
  type: ContactType,
  description: string,
  email: string | null,
  logs: string | null,
): void => {
  db.run(
    `INSERT INTO
      reports(type, description, email, created_at, logs)
    VALUES
      (?, ?, ?, ?, ?)`,
    [type, description, email, new Date().toISOString(), logs ?? null],
  );
};

export const updateReportStatus = (id: number, resolved: boolean): void => {
  db.run(`UPDATE reports SET resolved = ? WHERE id = ?`, [resolved, id]);
};

export const getAdminMessages = (): AdminMessage[] => {
  const messages = db.prepare(`SELECT * FROM reports`).all();
  return messages.map(dbObjectToAdminMessage);
};

export const getAdminMessageById = (id: number): AdminMessage | null => {
  const message = db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id);
  if (!message) return null;
  return dbObjectToAdminMessage(message);
};

const dbObjectToAdminMessage = (message: any): AdminMessage => {
  return {
    id: message.id,
    createdAt: message.created_at,
    type: message.type as ContactType,
    description: message.description,
    email: message.email,
    logs: message.logs,
    resolved: message.resolved,
    reply: message.reply,
  };
};

export const updateReportReply = (id: number, reply: string): void => {
  db.run(`UPDATE reports SET reply = ? WHERE id = ?`, [reply, id]);
};
