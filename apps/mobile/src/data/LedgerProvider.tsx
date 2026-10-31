import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { useSQLiteContext } from 'expo-sqlite';
import { createCatalog, type Catalog } from './catalog';
import { createDraftStore, type DraftStore } from './drafts';
import type { SqlDb } from './db';
import { fromExpoSqlite } from './expo-db';
import { createLedger, type Ledger } from './ledger';

interface DataContextValue {
  ledger: Ledger;
  drafts: DraftStore;
  catalog: Catalog;
  sql: SqlDb;
}

const DataContext = createContext<DataContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const value = useMemo(() => {
    // Ledger va qoralama bitta navbatli ulanishni bo'lishadi — yozuvlar tartibi saqlanadi
    const sql = fromExpoSqlite(db);
    const now = () => new Date().toISOString();
    return {
      ledger: createLedger(sql, { newId: randomUUID, now }),
      drafts: createDraftStore(sql, { now }),
      catalog: createCatalog(sql, { newId: randomUUID, now }),
      sql,
    };
  }, [db]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error('LedgerProvider topilmadi');
  return value;
}

export function useLedger(): Ledger {
  return useData().ledger;
}

export function useDraftStore(): DraftStore {
  return useData().drafts;
}

export function useCatalog(): Catalog {
  return useData().catalog;
}

/** Bulutga push uchun — ledger bilan bir xil navbatli ulanish */
export function useSqlDb(): SqlDb {
  return useData().sql;
}
