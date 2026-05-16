import type { ContactType } from "@/shared/api";
import { Database } from "bun:sqlite";

const db = new Database("database.sqlite", { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS reports(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    description TEXT,
    email TEXT,
    created_at TEXT
  )`);

export const insertReport = (
  type: ContactType,
  description: string,
  email: string | null,
) => {
  db.run(
    `INSERT INTO
      reports(type, description, email, created_at)
    VALUES
      (?, ?, ?, ?)`,
    [type, description, email, new Date().toISOString()],
  );
};
