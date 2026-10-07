import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createDatabase(databasePath) {
  const resolvedPath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new Database(resolvedPath);
  database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS planner_state (
      user_id TEXT PRIMARY KEY,
      document_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const select = database.prepare(
    'SELECT document_json, updated_at FROM planner_state WHERE user_id = ?',
  );
  const upsert = database.prepare(`
    INSERT INTO planner_state (user_id, document_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      document_json = excluded.document_json,
      updated_at = excluded.updated_at
  `);

  return {
    get(userId) {
      const row = select.get(userId);
      if (!row) return null;
      return {
        document: JSON.parse(row.document_json),
        updatedAt: row.updated_at,
      };
    },
    put(userId, document) {
      const updatedAt = new Date().toISOString();
      upsert.run(userId, JSON.stringify(document), updatedAt);
      return { document, updatedAt };
    },
    close() {
      database.close();
    },
  };
}