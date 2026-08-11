import { invoke } from "@tauri-apps/api/core";
import { parseAppDatabaseV3 } from "../domain/importValidation";
import type { AppDatabase } from "../domain/types";

const BROWSER_KEY = "cs2-tournament-simulator.database.v3";
export const LEGACY_STORAGE_KEY = "cs2-major-simulator.saves.v2";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadStoredDatabase(): Promise<AppDatabase | null> {
  const raw = isTauriRuntime()
    ? await invoke<string | null>("load_database")
    : localStorage.getItem(BROWSER_KEY);
  if (!raw) return null;
  try {
    return parseAppDatabaseV3(JSON.parse(raw));
  } catch (caught) {
    throw new Error(`本地数据库已损坏，已保留默认数据库：${caught instanceof Error ? caught.message : String(caught)}`);
  }
}

export async function saveStoredDatabase(database: AppDatabase): Promise<void> {
  const payload = JSON.stringify(database);
  if (isTauriRuntime()) await invoke("save_database", { payload });
  else localStorage.setItem(BROWSER_KEY, payload);
}

export function readLegacyLibrary(): unknown | null {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function backupJson(payload: unknown): Promise<string> {
  const serialized = JSON.stringify(payload);
  if (isTauriRuntime()) return invoke<string>("backup_database", { payload: serialized });
  localStorage.setItem(`${BROWSER_KEY}.backup.${Date.now()}`, serialized);
  return "浏览器本地备份";
}
