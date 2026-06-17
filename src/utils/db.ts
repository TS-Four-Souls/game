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
    logs TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    reply TEXT
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

db.run(`
  CREATE TABLE IF NOT EXISTS games(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    player_count INTEGER NOT NULL,
    instance_count INTEGER NOT NULL,
    team_count INTEGER NOT NULL,
    turn_count INTEGER NOT NULL,
    mini_draft INTEGER NOT NULL,
    use_fsp2_cards INTEGER NOT NULL,
    nb_souls_to_win INTEGER NOT NULL,
    timer INTEGER NOT NULL,
    nb_player_card_restriction INTEGER NOT NULL,
    allow_cheat_options INTEGER NOT NULL,
    play_with_bonus_souls INTEGER NOT NULL,
    play_with_rooms INTEGER NOT NULL,
    deck_mode TEXT NOT NULL,
    reached_end BOOLEAN,
    ended_at TEXT,
    close_at TEXT
  )`);

/* Migration 1: Add team_count column */
try {
  db.run(`ALTER TABLE games ADD COLUMN team_count INTEGER NOT NULL DEFAULT 1`);
} catch (error) {
  if (
    error instanceof SQLiteError &&
    !error.message.startsWith("duplicate column name")
  ) {
    console.error(error.message);
  }
}

export interface GameRecordParams {
  miniDraft: boolean;
  useFsp2Cards: boolean;
  nbSoulsToWin: number;
  timer: number;
  nbPlayerCardRestriction: boolean;
  allowCheatOptions: boolean;
  playWithBonusSouls: boolean;
  playWithRooms: boolean;
  deckMode: string;
}

export const insertGameRecord = (
  roomId: string,
  startedAt: string,
  playerCount: number,
  instanceCount: number,
  teamCount: number,
  turnsAtStart: number,
  params: GameRecordParams,
): void => {
  db.run(
    `INSERT INTO games(
      room_id, started_at, player_count, instance_count, team_count, turn_count,
      mini_draft, use_fsp2_cards, nb_souls_to_win, timer,
      nb_player_card_restriction, allow_cheat_options,
      play_with_bonus_souls, play_with_rooms, deck_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      roomId,
      startedAt,
      playerCount,
      instanceCount,
      teamCount,
      turnsAtStart,
      params.miniDraft ? 1 : 0,
      params.useFsp2Cards ? 1 : 0,
      params.nbSoulsToWin,
      params.timer,
      params.nbPlayerCardRestriction ? 1 : 0,
      params.allowCheatOptions ? 1 : 0,
      params.playWithBonusSouls ? 1 : 0,
      params.playWithRooms ? 1 : 0,
      params.deckMode,
    ],
  );
};

const getOpenGameRecordStmt = db.prepare(`
  SELECT id, turn_count AS turnCount
  FROM games
  WHERE room_id = ? AND close_at IS NULL
  ORDER BY id DESC
  LIMIT 1
`);

export const getOpenGameRecord = (
  roomId: string,
): { id: number; turnCount: number } | null => {
  const row = getOpenGameRecordStmt.get(roomId) as
    | { id: number; turnCount: number }
    | undefined;
  return row ?? null;
};

export const recordGameEndReached = (roomId: string, endedAt: string): void => {
  const row = getOpenGameRecord(roomId);
  if (!row) return;
  db.run(`UPDATE games SET ended_at = ? WHERE id = ?`, [endedAt, row.id]);
};

export const finalizeGameRecord = (
  roomId: string,
  reachedEnd: boolean,
  currentTurnCount: number,
  closeAt: string,
): void => {
  const row = getOpenGameRecord(roomId);
  if (!row) return;
  const sessionTurnCount = currentTurnCount - row.turnCount;
  db.run(
    `UPDATE games SET reached_end = ?, turn_count = ?, close_at = ? WHERE id = ?`,
    [reachedEnd, sessionTurnCount, closeAt, row.id],
  );
};

const hourMs = 60 * 60 * 1000;

export const getHourlyGameStats = (): { gameCount: number; date: string }[] => {
  const currentHourStartMs = Math.floor(Date.now() / hourMs) * hourMs;
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const startMs = currentHourStartMs - (23 - i) * hourMs;
    return {
      date: new Date(startMs).toISOString(),
      startMs,
      endMs: startMs + hourMs,
    };
  });

  const rows = db
    .prepare(
      `SELECT started_at FROM games WHERE started_at >= ? AND started_at < ?`,
    )
    .all(buckets[0]!.date, new Date(buckets[23]!.endMs).toISOString()) as {
    started_at: string;
  }[];

  return buckets.map((bucket) => ({
    date: bucket.date,
    gameCount: rows.filter((row) => {
      const startedMs = new Date(row.started_at).getTime();
      return startedMs >= bucket.startMs && startedMs < bucket.endMs;
    }).length,
  }));
};
