// ============================================================
// db.rs — Database connection initialization & migration runner
// ============================================================
// This module handles:
//   • Opening/creating the SQLite database
//   • Setting PRAGMA configurations for performance & safety
//   • Running schema migrations on first launch
//   • Providing the connection wrapped in Mutex for thread safety
// ============================================================

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Application database state, stored in Tauri's managed state.
/// The Mutex ensures only one thread writes at a time (SQLite is single-writer).
pub struct AppDb {
    pub conn: Mutex<Connection>,
}

/// Initialize the database connection.
///
/// - Creates the app data directory if it doesn't exist
/// - Opens (or creates) `inventory.db` inside it
/// - Sets critical PRAGMA settings
/// - Runs the schema migration if tables don't exist
///
/// # Arguments
/// * `app_data_dir` - The OS-specific app data directory from Tauri
///
/// # Returns
/// * `AppDb` instance ready to be managed by Tauri
pub fn init_db(app_data_dir: PathBuf) -> Result<AppDb, String> {
    // Ensure the data directory exists
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    let db_path = app_data_dir.join("inventory.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // ── PRAGMA settings (critical for data integrity & performance) ──
    // WAL mode: allows concurrent reads while writing
    conn.execute_batch("PRAGMA journal_mode = WAL;")
        .map_err(|e| format!("Failed to set journal_mode: {}", e))?;

    // Enforce foreign keys (SQLite disables them by default!)
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to enable foreign_keys: {}", e))?;

    // Synchronous NORMAL: good balance of safety & speed for WAL mode
    conn.execute_batch("PRAGMA synchronous = NORMAL;")
        .map_err(|e| format!("Failed to set synchronous: {}", e))?;

    // ── Run schema migration ──
    // Check if tables already exist; if not, run the init migration
    let tables_exist: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='instruments'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !tables_exist {
        let schema = include_str!("../migrations/001_init.sql");
        conn.execute_batch(schema)
            .map_err(|e| format!("Failed to run schema migration: {}", e))?;
        println!("✅ Database schema initialized");
    } else {
        println!("✅ Database already initialized");
        // Migration: add is_admin to staff if it doesn't exist
        let column_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('staff') WHERE name='is_admin'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count > 0)
            .unwrap_or(false);

        if !column_exists {
            conn.execute_batch("ALTER TABLE staff ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;")
                .map_err(|e| format!("Failed to run migration for is_admin: {}", e))?;
            println!("✅ Database migration applied (added is_admin to staff)");
        }
    }

    Ok(AppDb {
        conn: Mutex::new(conn),
    })
}
