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

export const insertReport = (
  type: ContactType,
  description: string,
  email: string | null,
  logs: string | null,
) => {
  db.run(
    `INSERT INTO
      reports(type, description, email, created_at, logs)
    VALUES
      (?, ?, ?, ?, ?)`,
    [type, description, email, new Date().toISOString(), logs ?? null],
  );
};

export const markReportAsResolved = (id: number) => {
  db.run(`UPDATE reports SET resolved = TRUE WHERE id = ?`, [id]);
};

export const getAdminMessages = (): AdminMessage[] => {
  const messages = db.prepare(`SELECT * FROM reports`).all();
  return messages.map((message: any) => ({
    id: message.id,
    createdAt: message.created_at,
    type: message.type as ContactType,
    description: message.description,
    email: message.email,
    logs: message.logs,
    resolved: message.resolved,
  }));
};
