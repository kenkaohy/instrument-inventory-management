// ============================================================
// lib.rs — Tauri application entry point
// ============================================================
// Registers all backend commands and initializes the database.
// The database connection is stored in Tauri's managed state
// and shared safely across all command handlers via Mutex.
// ============================================================

mod commands;
mod db;
mod models;

use tauri::Manager;
use commands::inventory::*;
use commands::staff::*;
use commands::loans::*;
use commands::transactions::*;
use commands::export::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Get the app data directory for storing the database
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            // Initialize the database
            let app_db = db::init_db(app_data_dir)
                .expect("Failed to initialize database");

            // Store the database connection in Tauri's managed state
            app.manage(app_db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ── Inventory commands ──
            get_inventory,
            get_instrument,
            create_instrument,
            update_instrument,
            deactivate_instrument,
            reactivate_instrument,
            get_categories,
            get_low_stock,
            // ── Staff commands ──
            get_staff,
            create_staff,
            update_staff,
            deactivate_staff,
            reactivate_staff,
            get_staff_loan_summary,
            // ── Loan commands (ATOMIC) ──
            issue_loan,
            return_loan,
            get_unreturned_loans,
            get_staff_loan_history,
            // ── Transaction commands ──
            record_transaction,
            get_transactions,
            // ── Export ──
            export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
