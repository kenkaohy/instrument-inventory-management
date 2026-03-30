// ============================================================
// commands/database.rs — Database Management
// ============================================================

use crate::db::AppDb;
use tauri::{AppHandle, Manager, State};
use std::fs;
use std::path::Path;

/// Import a SQLite database from a backup file, replacing the current one.
#[tauri::command]
pub fn import_database(
    app: AppHandle,
    state: State<'_, AppDb>,
    source_path: String,
) -> Result<(), String> {
    let source_pth = Path::new(&source_path);
    if !source_pth.exists() {
        return Err("選取的檔案不存在".to_string());
    }

    // 1. Verify it's a valid SQLite DB with an 'instruments' table by opening it temporarily
    let temp_conn = rusqlite::Connection::open(&source_pth)
        .map_err(|e| format!("無法開啟選取的資料庫檔案: {}", e))?;
    
    let tables_exist: bool = temp_conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='instruments'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !tables_exist {
        return Err("這不是有效的器械管理系統資料庫 (找不到 instruments 資料表)".to_string());
    }
    
    // Close temp connection
    drop(temp_conn);

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    
    let target_db_path = app_data_dir.join("inventory.db");

    // 2. Lock the current DB connection so no one else uses it while we replace it
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 3. Copy the source to the target destination
    fs::copy(&source_pth, &target_db_path)
        .map_err(|e| format!("複製資料庫檔案失敗: {}", e))?;

    // Also remove WAL and SHM files to avoid corruption from previous state
    let _ = fs::remove_file(app_data_dir.join("inventory.db-wal"));
    let _ = fs::remove_file(app_data_dir.join("inventory.db-shm"));

    // 4. Reopen connection and replace the Mutex contents
    let new_conn = rusqlite::Connection::open(&target_db_path)
        .map_err(|e| format!("重新開啟資料庫失敗: {}", e))?;
    
    // Apply PRAGMAs to the new connection
    new_conn.execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    new_conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;
    new_conn.execute_batch("PRAGMA synchronous = NORMAL;")
        .map_err(|e| e.to_string())?;

    // Migration logic for the newly imported DB to ensure it meets current schema
    let column_exists: bool = new_conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('staff') WHERE name='is_admin'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !column_exists {
        let _ = new_conn.execute_batch("ALTER TABLE staff ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;");
    }

    *conn = new_conn;

    Ok(())
}
