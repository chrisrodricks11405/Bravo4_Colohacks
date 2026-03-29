import React, { createContext, useContext, useEffect, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "../db";

interface DatabaseContextValue {
  db: SQLiteDatabase | null;
  isReady: boolean;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  isReady: false,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    async function init() {
      try {
        const database = await getDatabase();
        if (mounted) {
          if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
          }
          setDb(database);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to initialize database:", error);
        if (mounted) {
          setDb(null);
          setIsReady(false);
          if (retryTimeout) {
            clearTimeout(retryTimeout);
          }
          retryTimeout = setTimeout(() => {
            void init();
          }, 1_000);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, []);

  return (
    <DatabaseContext.Provider value={{ db, isReady }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): SQLiteDatabase | null {
  const { db } = useContext(DatabaseContext);
  return db;
}

export function useDatabaseReady(): boolean {
  const { isReady } = useContext(DatabaseContext);
  return isReady;
}
