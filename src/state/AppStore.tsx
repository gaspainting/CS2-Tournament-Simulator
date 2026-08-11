import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppDatabase } from "../domain/types";
import { migrateLegacyLibrary } from "../engine/legacyMigration";
import { backupJson, loadStoredDatabase, readLegacyLibrary, saveStoredDatabase } from "../services/storage";
import { createDefaultDatabase, mergeMissingBuiltIns } from "./operations";
import { createPersistenceGuard } from "./persistenceGuard";

export type NavigationPage = "saves" | "create" | "teams" | "players" | "templates" | "data" | "settings" | "tournament";

type AppStoreValue = {
  database: AppDatabase;
  setDatabase: React.Dispatch<React.SetStateAction<AppDatabase>>;
  replaceDatabase: (database: AppDatabase) => void;
  page: NavigationPage;
  setPage: (page: NavigationPage) => void;
  activeSaveId: string | null;
  setActiveSaveId: (id: string | null) => void;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
};

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<AppDatabase>(createDefaultDatabase);
  const [page, setPage] = useState<NavigationPage>("saves");
  const [activeSaveId, setActiveSaveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const persistenceGuard = useRef(createPersistenceGuard()).current;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadStoredDatabase();
        let next = stored ? mergeMissingBuiltIns(stored) : createDefaultDatabase();
        const legacy = readLegacyLibrary();
        if (legacy && !next.migration?.legacyV2ImportedAt) {
          await backupJson(legacy);
          next = migrateLegacyLibrary(legacy, next);
        }
        if (!cancelled) {
          setDatabase(next);
          setActiveSaveId(next.saves[0]?.id ?? null);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          persistenceGuard.markLoadFailure();
          setError(caught instanceof Error ? caught.message : String(caught));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!persistenceGuard.shouldPersist(loading)) return;
    const timer = window.setTimeout(() => {
      void saveStoredDatabase(database).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [database, loading, persistenceGuard]);

  const replaceDatabase = useCallback((next: AppDatabase) => {
    persistenceGuard.markRecovery();
    setDatabase(next);
    setActiveSaveId(next.saves[0]?.id ?? null);
  }, [persistenceGuard]);

  const value = useMemo<AppStoreValue>(() => ({ database, setDatabase, replaceDatabase, page, setPage, activeSaveId, setActiveSaveId, loading, error, setError }), [activeSaveId, database, error, loading, page, replaceDatabase]);
  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error("useAppStore 必须在 AppStoreProvider 内使用");
  return value;
}
