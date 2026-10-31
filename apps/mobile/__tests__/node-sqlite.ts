/**
 * Testlar uchun node:sqlite adapteri — ilovadagi expo-sqlite bilan bir xil SQL dvigateli (SQLite)
 * va bir xil tranzaksiya mexanizmi (createSerializedDb).
 */
import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createSerializedDb, type SqlConn, type SqlDb, type SqlParam } from '../src/data/db';

// Vite "node:sqlite" ni tanimaydi — Node'ning o'z require'i orqali yuklanadi
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export function openNodeDb(path = ':memory:'): SqlDb & { raw: DatabaseSyncType } {
  const raw = new DatabaseSync(path);
  const conn: SqlConn = {
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, params: SqlParam[] = []) {
      raw.prepare(sql).run(...params);
    },
    async get<T>(sql: string, params: SqlParam[] = []) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
  };
  return Object.assign(createSerializedDb(conn), { raw });
}

export const openMemoryDb = () => openNodeDb(':memory:');
