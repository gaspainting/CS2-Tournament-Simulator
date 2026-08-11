use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const NAMESPACE: &str = "app";
const DATABASE_KEY: &str = "database";

fn initialize(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS documents (
                namespace TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(namespace, key)
            );",
        )
        .map_err(|error| error.to_string())
}

fn open_database(path: PathBuf) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    initialize(&connection)?;
    Ok(connection)
}

#[cfg(test)]
fn open_memory_database() -> Result<Connection, String> {
    let connection = Connection::open_in_memory().map_err(|error| error.to_string())?;
    initialize(&connection)?;
    Ok(connection)
}

fn save_document(connection: &Connection, namespace: &str, key: &str, value: &str) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(value).map_err(|error| format!("JSON 校验失败：{error}"))?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO documents(namespace, key, value, updated_at)
             VALUES (?1, ?2, ?3, unixepoch())
             ON CONFLICT(namespace, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            params![namespace, key, value],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn load_document(connection: &Connection, namespace: &str, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM documents WHERE namespace=?1 AND key=?2",
            params![namespace, key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

fn application_database_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("simulator.sqlite3"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_database(app: AppHandle) -> Result<Option<String>, String> {
    let connection = open_database(application_database_path(&app)?)?;
    load_document(&connection, NAMESPACE, DATABASE_KEY)
}

#[tauri::command]
pub fn save_database(app: AppHandle, payload: String) -> Result<(), String> {
    let connection = open_database(application_database_path(&app)?)?;
    save_document(&connection, NAMESPACE, DATABASE_KEY, &payload)
}

#[tauri::command]
pub fn backup_database(app: AppHandle, payload: String) -> Result<String, String> {
    serde_json::from_str::<serde_json::Value>(&payload).map_err(|error| format!("JSON 校验失败：{error}"))?;
    let backup_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let path = backup_dir.join(format!("database-{timestamp}.json"));
    fs::write(&path, payload).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_and_loads_valid_json() {
        let connection = open_memory_database().expect("database");
        save_document(&connection, "app", "database", r#"{"version":3}"#).expect("save");
        assert_eq!(load_document(&connection, "app", "database").unwrap().as_deref(), Some(r#"{"version":3}"#));
    }

    #[test]
    fn invalid_json_does_not_replace_the_previous_document() {
        let connection = open_memory_database().expect("database");
        save_document(&connection, "app", "database", r#"{"version":3}"#).expect("save");
        assert!(save_document(&connection, "app", "database", "not-json").is_err());
        assert_eq!(load_document(&connection, "app", "database").unwrap().as_deref(), Some(r#"{"version":3}"#));
    }
}
