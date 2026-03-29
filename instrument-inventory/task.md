# Phase 1 — System Architect & Backend Implementation

## 1. Project Scaffold
- [x] Create Tauri v2 + React + TypeScript project
- [x] Add Rust dependencies (rusqlite, csv, serde)
- [x] Add Tauri plugins (dialog, fs)

## 2. SQLite Schema (001_init.sql)
- [x] Write `categories`, `staff`, `instruments`, `transactions`, `loans` tables
- [x] Write indexes and views
- [x] Place in `src-tauri/migrations/001_init.sql`

## 3. Data Migration Script
- [x] Install Python dependencies (pandas, openpyxl)
- [x] Write `migrate_xlsm_to_sqlite.py`
- [x] Run migration and verify seed data

## 4. Rust Backend
- [x] `db.rs` — connection init, PRAGMA settings, migration runner
- [x] `models.rs` — Serde structs for all data types
- [x] `commands/inventory.rs` — instrument CRUD
- [x] `commands/staff.rs` — staff CRUD
- [x] `commands/loans.rs` — issue_loan, return_loan (ATOMIC)
- [x] `commands/transactions.rs` — record_transaction, get_transactions
- [x] `commands/export.rs` — CSV export with UTF-8 BOM
- [x] `main.rs` — register all commands
- [x] Verify project compiles

# Phase 2 — Frontend Integration & UI Implementation

## 1. UI Scaffold & Layout
- [x] Install Tailwind CSS, PostCSS, and Lucide React
- [x] Configure `tailwind.config.js` and `index.css`
- [x] Create main layout (Sidebar Navigation + content area)

## 2. IPC Integration
- [x] Create `src/types.ts` reflecting Rust models
- [x] Create hooks/services for Tauri IPC (`@tauri-apps/api/invoke`)

## 3. Core Pages
- [x] **庫存總覽 (Inventory Grid):** Sortable, filterable table. Highlight zero/low stock items in red.
- [x] **出入庫/借還管理 (Check-in / Check-out):** UI Tabs for issuing/returning instruments and tracking open loans.
- [x] **人員管理 (Staff Management):** Card-based view to manage staff members and their active loans.
- [x] **報表匯出 (CSV Export):** Triggers rust command to save `.csv` with dialog plugin.

## 4. Visual Verification
- [x] Run Tauri dev server
- [x] Verify UI rendering and Chinese localization (Browser Mocks)
- [x] Verify Full Integration (Tauri + Rust Backend)
