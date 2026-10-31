/**
 * expo-sqlite → SqlDb adapteri.
 * withExclusiveTransactionAsync ishlatilmaydi (u alohida ulanish ochadi) —
 * qarang: createSerializedDb.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { createSerializedDb, type SqlConn, type SqlDb, type SqlParam } from './db';

function wrap(db: SQLiteDatabase): SqlConn {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParam[] = []) => {
      await db.runAsync(sql, params);
    },
    get: <T,>(sql: string, params: SqlParam[] = []) => db.getFirstAsync<T>(sql, params),
    all: <T,>(sql: string, params: SqlParam[] = []) => db.getAllAsync<T>(sql, params),
  };
}

export function fromExpoSqlite(db: SQLiteDatabase): SqlDb {
  return createSerializedDb(wrap(db));
}
