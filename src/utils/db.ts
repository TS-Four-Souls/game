import type { ContactType } from "@/shared/api";
import { Database } from "bun:sqlite";

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
