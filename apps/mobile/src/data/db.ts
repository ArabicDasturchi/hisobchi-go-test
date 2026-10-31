/**
 * Minimal SQL ulanish interfeysi.
 * Ilovada expo-sqlite, testlarda node:sqlite shu interfeysga moslanadi —
 * shu tufayli ledger mantiqi haqiqiy SQLite dvigatelida sinovdan o'tadi.
 *
 * Pul va miqdor qiymatlari SQL'ga string ko'rinishida uzatiladi va
 * CAST(... AS TEXT) bilan o'qiladi: JS number orqali aniqlik yo'qolmaydi.
 */

export type SqlParam = string | number | null;

export interface SqlConn {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<void>;
  get<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

export interface SqlDb extends SqlConn {
  /** Tranzaksiya: xato bo'lsa hammasi bekor qilinadi */
  transaction<T>(fn: (tx: SqlConn) => Promise<T>): Promise<T>;
}

/**
 * Bitta ulanish ustida navbatli (serialized) SqlDb.
 *
 * Nega: expo-sqlite `withExclusiveTransactionAsync` har safar YANGI native ulanish
 * ochadi. Natijada (1) ':memory:' bazada jadvallar ko'rinmaydi ("no such table"),
 * (2) ulanishga bog'liq `PRAGMA foreign_keys = ON` tranzaksiyada ishlamaydi.
 * Shu sababli barcha so'rovlar va tranzaksiyalar bitta ulanishda, navbat bilan
 * bajariladi: tranzaksiya davomida boshqa so'rovlar uning ichiga aralashmaydi.
 */
export function createSerializedDb(conn: SqlConn): SqlDb {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };

  return {
    exec: (sql) => enqueue(() => conn.exec(sql)),
    run: (sql, params) => enqueue(() => conn.run(sql, params)),
    get: <T,>(sql: string, params?: SqlParam[]) => enqueue(() => conn.get<T>(sql, params)),
    all: <T,>(sql: string, params?: SqlParam[]) => enqueue(() => conn.all<T>(sql, params)),
    transaction: <T,>(fn: (tx: SqlConn) => Promise<T>) =>
      enqueue(async () => {
        await conn.exec('BEGIN IMMEDIATE;');
        try {
          const result = await fn(conn);
          await conn.exec('COMMIT;');
          return result;
        } catch (e) {
          try {
            await conn.exec('ROLLBACK;');
          } catch {
            // SQLite tranzaksiyani allaqachon bekor qilgan bo'lishi mumkin — asl xato saqlanadi
          }
          throw e;
        }
      }),
  };
}
