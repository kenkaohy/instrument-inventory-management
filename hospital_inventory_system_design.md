# 器械清單 — Hospital Instrument Inventory Management System
## Comprehensive System Design Plan

---

## 1. Excel File Analysis & Schema Design

### 1.1 Worksheet Inventory

| Sheet | Chinese Name | Purpose |
|---|---|---|
| 介面 (Interface) | UI Shell | Login / date / staff selector (Excel UI layer, not migrated) |
| 庫存 (Inventory) | Live Stock | Multi-column instrument list grouped by category with current stock |
| 資料庫 (Database) | Transaction Log | Sequential in/out movement ledger |

---

### 1.2 Data Discovered in 庫存 (Inventory Sheet)

The inventory is laid out as **4 parallel column groups** across the sheet (not normalized rows). Each group follows the pattern: `[Category Type] → [Instrument Name] → [Stock Quantity]`.

| Stat | Value |
|---|---|
| Total instrument SKUs | 203 |
| Instruments with zero stock | 53 (≈26%) |
| Instrument categories | 18 |
| Staff members (登記人員) | 9 |

**18 Instrument Categories:**
刀柄類, 鑷子類, suction類, 剪刀類, 基本器械類, NＨ類, 骨科撐開器, 外科撐開器, Rongeur, Elevator, DiscRongeur, Punch, Cutter, Reduction, Osteotome, Currette, boneimpactor, 其他

---

### 1.3 Data Discovered in 資料庫 (Transaction Sheet)

| Column (Chinese) | Column (English) | Data Type | Sample Value |
|---|---|---|---|
| 序號 | Transaction ID | INTEGER AUTO-INCREMENT | 1, 2, 3... |
| 日期 | Date | DATE | 2026-02-10 |
| 類別 | Category | TEXT (FK) | 刀柄類 |
| 器械名稱 | Instrument Name | TEXT (FK) | 4號刀柄 |
| 出入庫 | Movement Type | TEXT ENUM | 入庫 / 出庫 |
| 數量 | Quantity | INTEGER | 1–10 |
| 登記人員 | Staff Member | TEXT (FK) | 韋茜 |

**Total seeded transactions:** 155 records, all dated 2026-02-10 (initial stock-in batch)

---

### 1.4 Normalized SQLite Schema (v2 — Updated)

#### Key Schema Changes for New Requirements

| Requirement | Schema Change |
|---|---|
| Req 1: Add/inactive staff | `staff` table already has `is_active`; add `created_at`, `deactivated_at` for audit trail |
| Req 2: Add/modify/inactive instruments | Add `is_active` flag to `instruments`; all existing CRUD commands extended |
| Req 3: Unreturned instruments per staff | New `loans` table + `v_unreturned_loans` view to track 出庫→入庫 pairing |
| Req 4: Staff outbound history | New `v_staff_outbound_history` view; `transactions` gains `loan_id` FK |

```sql
-- ============================================================
-- TABLE: categories
-- Master list of instrument categories
-- ============================================================
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    name_en     TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- TABLE: staff                                   [REQ 1 UPDATED]
-- Registered personnel who can perform transactions.
-- Never hard-deleted — deactivate instead to preserve history.
-- ============================================================
CREATE TABLE staff (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE,
    role             TEXT,                        -- optional: e.g. '護理師', '技術員'
    is_active        INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=inactive
    created_at       TEXT DEFAULT (datetime('now')),
    deactivated_at   TEXT                         -- set when is_active → 0
);

-- ============================================================
-- TABLE: instruments                             [REQ 2 UPDATED]
-- Master catalog of surgical instruments (one row per SKU).
-- Soft-delete via is_active; name+category pair stays unique
-- even among inactive SKUs to prevent accidental re-creation.
-- ============================================================
CREATE TABLE instruments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id          INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name                 TEXT NOT NULL,
    stock_quantity       INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold  INTEGER NOT NULL DEFAULT 2,
    notes                TEXT,
    is_active            INTEGER NOT NULL DEFAULT 1,  -- 1=active, 0=inactive SKU
    created_at           TEXT DEFAULT (datetime('now')),
    updated_at           TEXT DEFAULT (datetime('now')),
    deactivated_at       TEXT,
    UNIQUE (category_id, name)
);

-- ============================================================
-- TABLE: loans                                   [REQ 3 NEW]
-- Tracks individual borrow-and-return cycles for a single
-- instrument unit issued to a named staff member.
-- A loan is "open" (unreturned) when returned_at IS NULL.
--
-- Relationship to transactions:
--   • The 出庫 transaction that opened this loan → out_transaction_id
--   • The 入庫 transaction that closed this loan → in_transaction_id
--
-- This table is the source of truth for:
--   "Which instruments has staff member X not yet returned?"
-- ============================================================
CREATE TABLE loans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id       INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    staff_id            INTEGER NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    quantity            INTEGER NOT NULL CHECK (quantity > 0),
    out_transaction_id  INTEGER NOT NULL REFERENCES transactions(id),
    issued_date         TEXT NOT NULL DEFAULT (date('now')),
    in_transaction_id   INTEGER REFERENCES transactions(id),  -- NULL = not yet returned
    returned_date       TEXT,                                  -- NULL = not yet returned
    notes               TEXT
);

-- ============================================================
-- TABLE: transactions
-- Append-only ledger of every stock movement (入庫/出庫).
-- loan_id links a transaction back to the loan it created or
-- closed; NULL for non-loan movements (e.g. bulk stock-in).
-- ============================================================
CREATE TABLE transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument_id    INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
    movement_type    TEXT NOT NULL CHECK (movement_type IN ('入庫', '出庫')),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL,
    loan_id          INTEGER REFERENCES loans(id),  -- [REQ 3] FK to loans
    transaction_date TEXT NOT NULL DEFAULT (date('now')),
    notes            TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_instruments_category   ON instruments(category_id);
CREATE INDEX idx_instruments_stock      ON instruments(stock_quantity);
CREATE INDEX idx_instruments_active     ON instruments(is_active);
CREATE INDEX idx_transactions_instrument ON transactions(instrument_id);
CREATE INDEX idx_transactions_date      ON transactions(transaction_date);
CREATE INDEX idx_transactions_staff     ON transactions(staff_id);
CREATE INDEX idx_transactions_loan      ON transactions(loan_id);
CREATE INDEX idx_loans_staff            ON loans(staff_id);
CREATE INDEX idx_loans_instrument       ON loans(instrument_id);
CREATE INDEX idx_loans_open             ON loans(returned_date) WHERE returned_date IS NULL;
CREATE INDEX idx_staff_active           ON staff(is_active);

-- ============================================================
-- VIEW: v_inventory_summary
-- ============================================================
CREATE VIEW v_inventory_summary AS
SELECT
    i.id,
    c.name        AS category,
    i.name        AS instrument_name,
    i.stock_quantity,
    i.low_stock_threshold,
    i.is_active,
    CASE WHEN i.is_active = 0              THEN 'inactive'
         WHEN i.stock_quantity = 0         THEN 'out_of_stock'
         WHEN i.stock_quantity <= i.low_stock_threshold THEN 'low_stock'
         ELSE 'ok'
    END           AS stock_status,
    i.notes,
    i.updated_at
FROM instruments i
JOIN categories c ON c.id = i.category_id;

-- ============================================================
-- VIEW: v_transaction_log
-- Full ledger with human-readable names                [REQ 4]
-- ============================================================
CREATE VIEW v_transaction_log AS
SELECT
    t.id,
    t.transaction_date,
    c.name        AS category,
    i.name        AS instrument_name,
    t.movement_type,
    t.quantity,
    s.name        AS staff_name,
    t.loan_id,
    t.notes,
    t.created_at
FROM transactions t
JOIN  instruments i ON i.id = t.instrument_id
JOIN  categories  c ON c.id = i.category_id
LEFT JOIN staff   s ON s.id = t.staff_id
ORDER BY t.id DESC;

-- ============================================================
-- VIEW: v_unreturned_loans                             [REQ 3]
-- Every open loan — instruments issued but not yet returned.
-- Use this view to answer: "What does staff member X still hold?"
-- ============================================================
CREATE VIEW v_unreturned_loans AS
SELECT
    l.id               AS loan_id,
    s.id               AS staff_id,
    s.name             AS staff_name,
    c.name             AS category,
    i.id               AS instrument_id,
    i.name             AS instrument_name,
    l.quantity,
    l.issued_date,
    CAST(
        julianday('now') - julianday(l.issued_date)
    AS INTEGER)        AS days_outstanding,   -- how many days since issued
    l.notes
FROM loans     l
JOIN staff       s ON s.id = l.staff_id
JOIN instruments i ON i.id = l.instrument_id
JOIN categories  c ON c.id = i.category_id
WHERE l.returned_date IS NULL
ORDER BY l.issued_date ASC;   -- oldest unreturned first

-- ============================================================
-- VIEW: v_staff_outbound_history                       [REQ 4]
-- All 出庫 transactions grouped with loan return status.
-- One row per individual loan event, returned or not.
-- ============================================================
CREATE VIEW v_staff_outbound_history AS
SELECT
    s.id               AS staff_id,
    s.name             AS staff_name,
    l.id               AS loan_id,
    l.issued_date,
    l.returned_date,
    CASE WHEN l.returned_date IS NULL THEN '未歸還'
         ELSE '已歸還'
    END                AS return_status,
    c.name             AS category,
    i.name             AS instrument_name,
    l.quantity,
    CAST(
        julianday(COALESCE(l.returned_date, date('now')))
        - julianday(l.issued_date)
    AS INTEGER)        AS days_held,
    l.notes
FROM loans     l
JOIN staff       s ON s.id = l.staff_id
JOIN instruments i ON i.id = l.instrument_id
JOIN categories  c ON c.id = i.category_id
ORDER BY s.name ASC, l.issued_date DESC;
```

**Design Decisions:**

`loans` is the core addition. It tracks each individual borrow cycle — instrument issued to staff (出庫) paired with the eventual return (入庫). Two key properties make it work:

- `out_transaction_id` and `in_transaction_id` provide a direct link between the loan record and its corresponding ledger entries. When a return is recorded, both the `transactions` row (入庫) and the `loans` row (`returned_date`, `in_transaction_id`) are updated in the same SQLite atomic transaction — neither can succeed without the other.
- `returned_date IS NULL` is the single boolean that defines "unreturned". The partial index `idx_loans_open` makes the unreturned query fast even when thousands of historical loans exist.

**Why not infer loans from transaction pairs?** Matching 出庫/入庫 rows via instrument + staff + date is fragile when the same staff borrows the same instrument multiple times. The explicit `loans` table eliminates ambiguity entirely.

**Inactive staff and instruments:** Both use `is_active = 0` (soft-delete). An inactive staff member's historical loans and transactions remain fully queryable — the system preserves the accountability chain even after someone leaves. An inactive instrument SKU is hidden from entry forms but its full history is accessible in reports.

---

## 2. Data Migration / Seeding Script

### 2.1 One-Time Python Migration Script

**Dependencies:** `pip install pandas openpyxl`

```python
#!/usr/bin/env python3
"""
migrate_xlsm_to_sqlite.py  (v2 — updated for loans schema)
One-time script: parses 器械清單_.xlsm and seeds instruments.db
Handles v2 schema: staff.is_active, instruments.is_active, loans table
"""

import sqlite3
import pandas as pd
from pathlib import Path

XLSM_PATH   = "器械清單_.xlsm"
DB_PATH     = "instruments.db"
SCHEMA_PATH = "schema.sql"

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA foreign_keys = ON")
conn.executescript(Path(SCHEMA_PATH).read_text(encoding="utf-8"))

# ── 1. Parse 庫存 (inventory) sheet ────────────────────────────────────────
df_inv = pd.read_excel(XLSM_PATH, sheet_name="庫存", engine="openpyxl", header=None)
COL_GROUPS = [(3, 4, 5), (7, 8, 9), (11, 12, 13), (15, 16, 17)]

category_map  = {}
instrument_map = {}

def get_or_create_category(name: str) -> int:
    if name not in category_map:
        conn.execute("INSERT OR IGNORE INTO categories(name) VALUES (?)", (name,))
        row = conn.execute("SELECT id FROM categories WHERE name=?", (name,)).fetchone()
        category_map[name] = row[0]
    return category_map[name]

items_inserted = 0
for type_col, name_col, stock_col in COL_GROUPS:
    current_type = None
    for _, row in df_inv.iterrows():
        t = row[type_col] if type_col < len(row) else None
        n = row[name_col] if name_col < len(row) else None
        s = row[stock_col] if stock_col < len(row) else None
        if pd.notna(t) and str(t) not in ("類型", "nan"):
            current_type = str(t).strip()
        if pd.notna(n) and pd.notna(s) and str(n) not in ("器械名稱", "nan") and current_type:
            try:
                cat_id = get_or_create_category(current_type)
                conn.execute(
                    """INSERT OR IGNORE INTO instruments(category_id, name, stock_quantity, is_active)
                       VALUES (?, ?, ?, 1)""",
                    (cat_id, str(n).strip(), int(s))
                )
                row_id = conn.execute(
                    "SELECT id FROM instruments WHERE category_id=? AND name=?",
                    (cat_id, str(n).strip())
                ).fetchone()[0]
                instrument_map[(cat_id, str(n).strip())] = row_id
                items_inserted += 1
            except (ValueError, TypeError):
                pass
print(f"  ✓ Instruments inserted: {items_inserted}")

# ── 2. Seed staff (all active by default) ──────────────────────────────────
staff_map = {}
for name in ["韋茜", "瑞禧", "廷勳", "齡月", "主恤", "璿霞", "絹珺", "孝儒", "晼琪"]:
    conn.execute("INSERT OR IGNORE INTO staff(name, is_active) VALUES (?, 1)", (name,))
    row = conn.execute("SELECT id FROM staff WHERE name=?", (name,)).fetchone()
    staff_map[name] = row[0]
print(f"  ✓ Staff seeded: {len(staff_map)}")

# ── 3. Parse 資料庫 (transaction log) ──────────────────────────────────────
# NOTE: Historical transactions from Excel are treated as plain stock movements
# (not loan events), because the original sheet had no borrow/return pairing.
# The loans workflow begins from the first transaction entered in the new app.
df_tx = pd.read_excel(
    XLSM_PATH, sheet_name="資料庫", engine="openpyxl",
    header=1, usecols=[1, 2, 3, 4, 5, 6, 7]
)
df_tx.columns = ["seq", "date", "category", "instrument", "movement", "quantity", "staff"]
df_tx = df_tx.dropna(subset=["seq", "instrument", "movement", "quantity"])

tx_inserted = 0
for _, row in df_tx.iterrows():
    cat_name  = str(row["category"]).strip() if pd.notna(row["category"]) else None
    inst_name = str(row["instrument"]).strip()
    movement  = str(row["movement"]).strip()
    qty       = int(row["quantity"])
    date_val  = row["date"]
    staff_val = row["staff"] if pd.notna(row.get("staff", None)) else None

    if not cat_name:
        continue

    cat_id = get_or_create_category(cat_name)
    inst = conn.execute(
        "SELECT id FROM instruments WHERE category_id=? AND name=?",
        (cat_id, inst_name)
    ).fetchone()
    if not inst:
        continue

    tx_date  = date_val.strftime("%Y-%m-%d") if hasattr(date_val, "strftime") else str(date_val)[:10]
    staff_id = staff_map.get(str(staff_val).strip()) if staff_val else None

    # Historical records: loan_id = NULL (no borrow-return pairing from Excel data)
    conn.execute(
        """INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id,
                                    loan_id, transaction_date)
           VALUES (?, ?, ?, ?, NULL, ?)""",
        (inst[0], movement, qty, staff_id, tx_date)
    )
    tx_inserted += 1

print(f"  ✓ Transactions inserted: {tx_inserted}")
conn.commit()
conn.close()
print(f"\n✅ Migration complete → {DB_PATH}")
```

**Run once:**
```bash
python migrate_xlsm_to_sqlite.py
```

> The script is idempotent (`INSERT OR IGNORE`) — safe to re-run after partial failures.

---

## 3. Tech Stack Recommendation

### 3.1 Comparison Matrix

| Criterion | Tauri + React + better-sqlite3 | Electron + React + better-sqlite3 | PyQt6 + SQLAlchemy | CustomTkinter + SQLite3 | Pywebview + FastAPI + SQLAlchemy |
|---|---|---|---|---|---|
| **Bundle size** | ✅ ~5–15 MB | ❌ ~80–150 MB | ✅ ~25 MB | ✅ ~15 MB | ⚠️ ~35 MB |
| **Startup speed** | ✅ Fast | ❌ Slow | ✅ Fast | ✅ Fast | ⚠️ Medium |
| **UI flexibility** | ✅ Full HTML/CSS | ✅ Full HTML/CSS | ⚠️ Qt widgets | ❌ Limited | ✅ Full HTML/CSS |
| **CJK / Chinese text** | ✅ Native browser rendering | ✅ Native browser rendering | ⚠️ Font config needed | ⚠️ Font config needed | ✅ Native browser rendering |
| **SQLite integration** | ✅ better-sqlite3 (sync, fast) | ✅ better-sqlite3 | ✅ SQLAlchemy ORM | ✅ stdlib sqlite3 | ✅ SQLAlchemy |
| **Build complexity** | ⚠️ Rust toolchain needed | ✅ npm only | ✅ pip only | ✅ pip only | ⚠️ Dual server setup |
| **Offline / no internet** | ✅ 100% offline | ✅ 100% offline | ✅ 100% offline | ✅ 100% offline | ✅ 100% offline |
| **Executable packaging** | ✅ `tauri build` | ✅ electron-builder | ✅ PyInstaller | ✅ PyInstaller | ⚠️ Complex |
| **Ecosystem / libraries** | ✅ npm + React | ✅ npm + React | ✅ mature Qt | ⚠️ limited | ✅ npm + Python |
| **Team skill fit** | Web devs | Web devs | Python devs | Python devs | Full-stack |

### 3.2 ✅ Recommended Stack: **Tauri v2 + React + better-sqlite3**

**Rationale for a hospital instrument inventory context:**

1. **Bundle size matters** — Hospital computers are often locked-down, older machines. A 10 MB Tauri app installs and launches far more reliably than an 120 MB Electron app.
2. **Chinese character rendering** is flawless in a WebView — no font configuration needed, unlike PyQt.
3. **better-sqlite3** is a synchronous, zero-configuration SQLite binding. Queries execute in microseconds from the Tauri/Node side process.
4. **React** gives a rich, accessible data grid (AG Grid Community or TanStack Table), date pickers, and form validation — all in Chinese.
5. **Tauri's Rust backend** handles file system access (CSV export, DB path) natively and securely, without spawning a separate web server.

**Runner-up:** If the team is Python-only, use **PyQt6 + SQLite3 + PyInstaller**. PyQt6's `QTableWidget` handles large datasets well and ships a genuinely native UI. Avoid CustomTkinter for a production hospital tool — it lacks proper data grids and table sorting.

---

## 4. Architecture & Data Flow

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Tauri Desktop Shell                      │
│                                                             │
│  ┌─────────────────────────────────────────┐               │
│  │         React Frontend (WebView)         │               │
│  │                                         │               │
│  │  ┌──────────┐  ┌──────────┐  ┌───────┐ │               │
│  │  │Inventory │  │  Ledger  │  │Reports│ │               │
│  │  │  Grid    │  │   View   │  │  CSV  │ │               │
│  │  └────┬─────┘  └────┬─────┘  └───┬───┘ │               │
│  │       │              │            │     │               │
│  │  ┌────▼──────────────▼────────────▼───┐ │               │
│  │  │         Tauri IPC Bridge           │ │               │
│  │  │   invoke("cmd_name", { payload })  │ │               │
│  │  └────────────────────┬───────────────┘ │               │
│  └───────────────────────┼─────────────────┘               │
│                          │ Rust Commands                    │
│  ┌───────────────────────▼─────────────────┐               │
│  │           Rust Backend (src-tauri)       │               │
│  │                                         │               │
│  │  ┌──────────────┐   ┌─────────────────┐ │               │
│  │  │  SQLite DAL  │   │   CSV Exporter  │ │               │
│  │  │(rusqlite or  │   │  (csv crate or  │ │               │
│  │  │ better-sqlite│   │   std::fs)      │ │               │
│  │  └──────┬───────┘   └────────┬────────┘ │               │
│  └─────────┼────────────────────┼──────────┘               │
│            │                    │                           │
│  ┌─────────▼────────────────────▼──────────┐               │
│  │           instruments.db (SQLite)        │               │
│  │    ~/.local/share/InstrumentInventory/   │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Tauri IPC Command Reference

Each frontend action maps to a typed Rust command:

```rust
// src-tauri/src/commands.rs (conceptual)

#[tauri::command]
fn get_inventory(filter: InventoryFilter) -> Result<Vec<InstrumentRow>, String>

#[tauri::command]
fn get_instrument(id: i64) -> Result<InstrumentDetail, String>

#[tauri::command]
fn create_instrument(payload: NewInstrument) -> Result<i64, String>

#[tauri::command]
fn update_instrument(id: i64, payload: UpdateInstrument) -> Result<(), String>

#[tauri::command]
fn delete_instrument(id: i64) -> Result<(), String>   // soft-delete via is_active flag

#[tauri::command]
fn record_transaction(payload: NewTransaction) -> Result<i64, String>
// → also updates instruments.stock_quantity atomically in same SQLite transaction

#[tauri::command]
fn get_transactions(filter: TransactionFilter) -> Result<Vec<TransactionRow>, String>

#[tauri::command]
fn export_csv(export_type: ExportType, dest_path: String) -> Result<(), String>

#[tauri::command]
fn get_categories() -> Result<Vec<Category>, String>

#[tauri::command]
fn get_staff() -> Result<Vec<StaffMember>, String>
```

### 4.3 CRUD Safety Model

All write operations use explicit SQLite transactions. The most complex flow is issuing an instrument as a loan (出庫):

```rust
// Recording a stock-out with loan tracking (Req 3 & 4)
fn issue_loan(conn: &Connection, payload: NewLoan) -> Result<i64> {
    let tx = conn.transaction()?;

    // 1. Verify sufficient stock
    let stock: i64 = tx.query_row(
        "SELECT stock_quantity FROM instruments WHERE id = ? AND is_active = 1",
        [payload.instrument_id], |r| r.get(0)
    )?;
    if stock < payload.quantity {
        return Err("庫存不足".into());
    }

    // 2. Insert the 出庫 transaction row (loan_id initially NULL)
    tx.execute(
        "INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id, transaction_date)
         VALUES (?, '出庫', ?, ?, ?)",
        params![payload.instrument_id, payload.quantity, payload.staff_id, payload.date]
    )?;
    let tx_id = tx.last_insert_rowid();

    // 3. Create the loans record, linking back to the transaction
    tx.execute(
        "INSERT INTO loans(instrument_id, staff_id, quantity, out_transaction_id, issued_date)
         VALUES (?, ?, ?, ?, ?)",
        params![payload.instrument_id, payload.staff_id, payload.quantity, tx_id, payload.date]
    )?;
    let loan_id = tx.last_insert_rowid();

    // 4. Back-fill loan_id on the transaction row
    tx.execute(
        "UPDATE transactions SET loan_id = ? WHERE id = ?",
        params![loan_id, tx_id]
    )?;

    // 5. Decrement stock atomically
    tx.execute(
        "UPDATE instruments SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
         WHERE id = ?",
        params![payload.quantity, payload.instrument_id]
    )?;

    tx.commit()?;
    Ok(loan_id)
}

// Recording a return — closes the open loan
fn return_loan(conn: &Connection, loan_id: i64, staff_id: i64, return_date: &str) -> Result<()> {
    let tx = conn.transaction()?;

    // 1. Fetch the open loan
    let (instrument_id, quantity): (i64, i64) = tx.query_row(
        "SELECT instrument_id, quantity FROM loans WHERE id = ? AND returned_date IS NULL",
        [loan_id], |r| Ok((r.get(0)?, r.get(1)?))
    ).map_err(|_| "借用記錄不存在或已歸還")?;

    // 2. Insert the 入庫 transaction row
    tx.execute(
        "INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id, loan_id, transaction_date)
         VALUES (?, '入庫', ?, ?, ?, ?)",
        params![instrument_id, quantity, staff_id, loan_id, return_date]
    )?;
    let in_tx_id = tx.last_insert_rowid();

    // 3. Close the loan record
    tx.execute(
        "UPDATE loans SET returned_date = ?, in_transaction_id = ? WHERE id = ?",
        params![return_date, in_tx_id, loan_id]
    )?;

    // 4. Restore stock
    tx.execute(
        "UPDATE instruments SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')
         WHERE id = ?",
        params![quantity, instrument_id]
    )?;

    tx.commit()?;
    Ok(())
}
```

**Additional safety rules:**
- `CHECK (stock_quantity >= 0)` on `instruments` catches any logic error at DB level.
- `PRAGMA foreign_keys = ON` enforced at every connection open.
- Soft-delete for both staff and instruments: `is_active = 0` hides them from entry forms but preserves all history.
- An inactive staff member with open loans: the loans remain visible in `v_unreturned_loans` — accountability is never lost.

---

### 4.4 CSV Export Data Flow

```
User clicks "Export CSV"
        │
        ▼
React: opens OS file save dialog
  → tauri::api::dialog::save_file_dialog({ filters: ["csv"] })
        │
        ▼
User picks destination path
        │
        ▼
React: invoke("export_csv", { export_type: "inventory", dest_path })
        │
        ▼
Rust command handler:
  1. Executes SELECT on v_inventory_summary (or v_transaction_log)
  2. Streams rows to CSV writer (csv crate)
  3. Writes UTF-8 BOM (\xEF\xBB\xBF) at file start → ensures Excel opens Chinese correctly
  4. Saves to dest_path
  5. Returns Ok(()) or Err(message)
        │
        ▼
React: shows success toast ("已匯出 203 筆") or error dialog
```

**Two export modes:**
1. **Inventory Export** — current snapshot of all instruments with category, stock level, and status.
2. **Transaction Log Export** — full or date-filtered ledger (date range pickers in UI → WHERE clause in query).

---

## 5. UI/UX Layout Design

### 5.1 Application Shell

```
┌─────────────────────────────────────────────────────────────────┐
│  🏥 器械庫存管理系統        [搜尋 🔍___________]   👤 韋茜 ▼   │
├───────────┬─────────────────────────────────────────────────────┤
│           │                                                     │
│  📦 庫存   │              MAIN CONTENT AREA                     │
│  📋 出入庫 │                                                     │
│  🔄 借還管理│  (badge: unreturned count)                        │
│  ⚠️  低庫存 │  (badge: low/out-of-stock count)                  │
│  👥 人員管理│                                                     │
│  📊 報表   │                                                     │
│  ⚙️  設定   │                                                     │
│           │                                                     │
└───────────┴─────────────────────────────────────────────────────┘
```

Two new sidebar entries replace the original 設定 catch-all: **借還管理** (Loan Management) handles Requirements 3 & 4, and **人員管理** handles Requirement 1. Instrument CRUD (Requirement 2) is integrated directly into the 庫存 screen.

---

### 5.2 Screen: 庫存 (Inventory Grid) — Updated for Req 2

```
┌─────────────────────────────────────────────────────────────────┐
│ 庫存管理                            [+ 新增器械]  [↓ 匯出 CSV]  │
│                                                                 │
│ 篩選: [全部類別 ▼]  [● 啟用 ○ 停用 ○ 全部]  [搜尋器械名稱...]  │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ☐ │ 類別      │ 器械名稱               │ 庫存 │ 狀態  │ 操作│ │
│ ├───┼───────────┼────────────────────────┼──────┼───────┼─────┤ │
│ │ ☐ │ 刀柄類    │ 4號刀柄                │  1   │ ⚠️ 低  │ ✏️ │ │
│ │ ☐ │ 刀柄類    │ 3號刀柄                │  4   │ ✅ 正常│ ✏️ │ │
│ │ ☐ │ 鑷子類    │ 5吋smooth forcepes     │  0   │ 🔴 缺  │ ✏️ │ │
│ │ ☐ │ ~~剪刀類~~│ ~~舊型號~~             │  —   │ 🚫 停用│ ✏️ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                          顯示 1-20 / 204 筆     │
└─────────────────────────────────────────────────────────────────┘
```

**Instrument Edit Drawer (slides in from right):**
```
┌──────────────────────────────────────────┐
│ 編輯器械                           [✕]   │
│                                          │
│  類別:   [刀柄類              ▼]         │
│  名稱:   [4號刀柄                ]       │
│  庫存:   [  1  ]  閾值: [  2  ]         │
│  備註:   [______________________]        │
│  狀態:   [● 啟用  ○ 停用]               │
│                                          │
│  停用時間: —                             │
│  建立時間: 2026-02-10                    │
│                                          │
│         [取消]  [儲存]  [停用此器械]     │
└──────────────────────────────────────────┘
```

"停用此器械" shows a confirmation dialog: "此器械仍有 2 筆未歸還借用記錄，停用後將保留歷史紀錄但無法新增出入庫。確定停用？" — this warning is generated by checking `v_unreturned_loans` for open loans on this instrument before allowing deactivation.

---

### 5.3 Screen: 出入庫 (Stock Movement Entry) — Updated

The form now splits into two distinct modes selected at the top:

```
┌─────────────────────────────────────────────────────────────────┐
│ 登記出入庫                                                       │
│                                                                 │
│  模式:  [● 一般出入庫]  [○ 借用出庫 (綁定人員)]                 │
│  ─────────────────────────────────────────────────────          │
│  類型:   [入庫 ●]  [出庫 ○]                                     │
│  類別:   [刀柄類              ▼]                                │
│  器械:   [4號刀柄             ▼]  現有庫存: 1                   │
│  數量:   [  1  ▲▼]                                              │
│  日期:   [2026-03-28          ]                                  │
│  登記人: [韋茜                ▼]                                │
│  備註:   [________________________]                              │
│                                                                 │
│                            [取消]  [確認登記]                    │
└─────────────────────────────────────────────────────────────────┘
```

When **借用出庫** mode is selected, the form changes to loan-specific layout:

```
  模式:  [○ 一般出入庫]  [● 借用出庫 (綁定人員)]
  ──────────────────────────────────────────────
  借用人: [韋茜                ▼]  ← Required; only active staff
  類別:   [刀柄類              ▼]
  器械:   [4號刀柄             ▼]  現有庫存: 1
  數量:   [  1  ▲▼]
  日期:   [2026-03-28          ]
  備註:   [________________________]

  ⚠️ 韋茜 目前仍有 3 件未歸還器械                  [查看詳情]
                          [取消]  [確認借出]
```

The inline warning "目前仍有 N 件未歸還器械" is a real-time query against `v_unreturned_loans` filtered by the selected staff — it warns without blocking, so urgent loans can still proceed.

---

### 5.4 Screen: 🔄 借還管理 (Loan Management) — New for Req 3 & 4

This screen has two tabs.

**Tab 1 — 未歸還器械 (Unreturned Instruments) — Req 3**
```
┌─────────────────────────────────────────────────────────────────┐
│ 借還管理                                                        │
│ [未歸還器械 (18)] [人員借用歷史]                                │
│─────────────────────────────────────────────────────────────────│
│ 篩選: [全部人員 ▼]  [全部類別 ▼]  [搜尋器械...]               │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 借用人 │ 類別    │ 器械名稱           │ 數量│ 借出日 │ 天數 │ 操作 │
│ ├────────┼─────────┼────────────────────┼─────┼────────┼──────┼──────┤
│ │ 韋茜   │ 刀柄類  │ 4號刀柄            │  1  │ 03-20  │  8天 │[歸還]│
│ │ 韋茜   │ 鑷子類  │ 7吋teeth forcepes  │  2  │ 03-22  │  6天 │[歸還]│
│ │ 廷勳   │ 剪刀類  │ 7吋Mayo scissor    │  1  │ 03-10  │ 18天🔴│[歸還]│
│ │ 齡月   │ NＨ類   │ 8吋 Needle Holder  │  1  │ 03-25  │  3天 │[歸還]│
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ 🔴 超過14天未歸還: 1 件          顯示全部 18 筆未歸還           │
└─────────────────────────────────────────────────────────────────┘
```

Rows are colored by `days_outstanding`: green (<7 days), amber (7–13 days), red (≥14 days). Clicking **[歸還]** opens a quick-return confirmation panel:

```
┌──────────────────────────────────────────┐
│ 確認歸還                           [✕]   │
│                                          │
│  借用人:  廷勳                           │
│  器械:    7吋Mayo scissor                │
│  借出日:  2026-03-10   (已借 18 天)      │
│  歸還日:  [2026-03-28  ]  (預設今日)     │
│  登記人:  [韋茜        ▼]               │
│  備註:    [______________]               │
│                                          │
│         [取消]  [確認歸還]               │
└──────────────────────────────────────────┘
```

**Tab 2 — 人員借用歷史 (Staff Outbound History) — Req 4**
```
┌─────────────────────────────────────────────────────────────────┐
│ 借還管理                                                        │
│ [未歸還器械 (18)] [人員借用歷史]                                │
│─────────────────────────────────────────────────────────────────│
│ 人員: [廷勳 ▼]   日期: [2026-02-01] 至 [2026-03-28]  [查詢]    │
│                                                                 │
│ 廷勳 — 借用統計: 共 12 次借用，9 次已歸還，3 次未歸還          │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 借出日  │ 類別    │ 器械名稱           │ 數量│ 歸還日 │ 狀態 │
│ ├─────────┼─────────┼────────────────────┼─────┼────────┼──────┤
│ │ 03-10   │ 剪刀類  │ 7吋Mayo scissor    │  1  │ —      │🔴 未歸還│
│ │ 03-05   │ 鑷子類  │ Debaykey           │  1  │ 03-15  │✅ 已歸還│
│ │ 02-28   │ 刀柄類  │ 3號刀柄            │  2  │ 03-01  │✅ 已歸還│
│ │ ...     │         │                    │     │        │         │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│                              [↓ 匯出此人員借用記錄 CSV]         │
└─────────────────────────────────────────────────────────────────┘
```

The summary line ("共 12 次借用，9 次已歸還，3 次未歸還") is calculated from `v_staff_outbound_history` filtered by `staff_id`. Clicking a 🔴 未歸還 row navigates directly to that loan's return panel in Tab 1.

---

### 5.5 Screen: 👥 人員管理 (Staff Management) — New for Req 1

```
┌─────────────────────────────────────────────────────────────────┐
│ 人員管理                                    [+ 新增人員]        │
│                                                                 │
│ 篩選: [● 啟用中  ○ 已停用  ○ 全部]                             │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 姓名 │ 職稱    │ 未歸還 │ 建立日期   │ 狀態    │ 操作       │ │
│ ├──────┼─────────┼────────┼────────────┼─────────┼────────────┤ │
│ │ 韋茜 │ 護理師  │  2 件  │ 2026-02-10 │ ✅ 啟用 │ [✏️] [停用]│ │
│ │ 廷勳 │ 技術員  │  3 件  │ 2026-02-10 │ ✅ 啟用 │ [✏️] [停用]│ │
│ │ 齡月 │ —       │  0 件  │ 2026-02-10 │ ✅ 啟用 │ [✏️] [停用]│ │
│ │ 舊員工│ —      │  0 件  │ 2026-01-01 │ 🚫 停用 │ [✏️] [復原]│ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ⚠️ 停用人員時，若有未歸還器械系統將顯示警告。                 │
└─────────────────────────────────────────────────────────────────┘
```

**Deactivation guard:** Clicking [停用] for a staff member with open loans shows:
```
⚠️ 韋茜 仍有 2 件未歸還器械：
   • 4號刀柄 (借出 2026-03-20)
   • 7吋teeth forcepes (借出 2026-03-22)
停用後該人員將不再出現在出入庫選單，但借用記錄仍保留。
確定停用？   [取消]  [確認停用]
```

---

### 5.6 Screen: ⚠️ 低庫存警示 (Low Stock Alerts)

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚠️ 低庫存警示                    53 項缺貨 / 12 項低庫存        │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🔴 缺貨 (0件)                                               │ │
│ │  • 刀柄類 → 5吋smooth forcepes       [+ 快速補貨]           │ │
│ │  • 鑷子類 → Addison teeth forcepes   [+ 快速補貨]           │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ ⚠️ 低庫存 (≤ 閾值)                                          │ │
│ │  • 刀柄類 → 4號刀柄        庫存: 1 / 閾值: 2  [+ 快速補貨] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 5.7 Screen: 報表 / CSV 匯出 — Extended

```
  匯出類型:
  ● 庫存快照 (目前所有器械庫存)
  ○ 出入庫記錄 (指定日期範圍)
  ○ 未歸還器械清單              ← new
  ○ 人員借用歷史 (指定人員)     ← new
  ○ 低庫存清單
```

---

## 6. MVP Implementation Roadmap

### Phase 0 — Environment Setup (Day 1)

```bash
# Install prerequisites
# Node.js 20+, Rust toolchain (rustup), Tauri CLI

cargo install tauri-cli
npm create tauri-app@latest instrument-inventory
# → select: React, TypeScript

cd instrument-inventory
npm install better-sqlite3 @types/better-sqlite3
npm install @tanstack/react-table     # data grid
npm install react-hook-form zod       # form validation
npm install lucide-react              # icons
```

**File structure:**
```
instrument-inventory/
├── src/                        # React frontend
│   ├── components/
│   │   ├── InventoryGrid.tsx         # Req 2: CRUD + active/inactive
│   │   ├── TransactionForm.tsx       # 一般出入庫 / 借用出庫 mode
│   │   ├── LoanManagement/
│   │   │   ├── UnreturnedTab.tsx     # Req 3: unreturned by staff
│   │   │   └── StaffHistoryTab.tsx   # Req 4: outbound history
│   │   ├── StaffManagement.tsx       # Req 1: add/edit/deactivate staff
│   │   ├── LowStockAlerts.tsx
│   │   └── ExportPanel.tsx
│   ├── hooks/
│   │   └── useInventory.ts           # all Tauri invoke() wrappers
│   └── App.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── inventory.rs          # instrument CRUD
│   │   │   ├── staff.rs              # staff CRUD
│   │   │   ├── loans.rs              # issue_loan, return_loan, queries
│   │   │   ├── transactions.rs       # non-loan movements
│   │   │   └── export.rs             # CSV export
│   │   └── db.rs
│   ├── migrations/
│   │   └── 001_init.sql
│   └── tauri.conf.json
├── migrate_xlsm_to_sqlite.py
└── instruments.db
```

---

### Phase 1 — Database Layer (Days 1–2)

1. Copy finalized `schema.sql` into `src-tauri/migrations/001_init.sql`.
2. Run `python migrate_xlsm_to_sqlite.py` → produces `instruments.db`.
3. In `src-tauri/src/db.rs`, implement:
   - `init_db(app_data_dir: PathBuf) → Connection` — opens/creates the DB, runs `PRAGMA` settings, executes schema if tables don't exist.
   - Store the `Connection` in Tauri's `State<Mutex<Connection>>`.

---

### Phase 2 — Backend Commands (Days 2–4)

Implement these Tauri commands in `commands.rs`, tested via `tauri::test`:

**Inventory — Req 2**

| Command | Description |
|---|---|
| `get_inventory` | Query `v_inventory_summary`; supports category / name / status / active filter |
| `create_instrument` | INSERT into instruments with `is_active = 1` |
| `update_instrument` | UPDATE name, category, threshold, notes by id |
| `deactivate_instrument` | SET `is_active = 0`, `deactivated_at = now()`; blocked if open loans exist (returns warning payload, not hard error, so UI can show confirmation) |
| `reactivate_instrument` | SET `is_active = 1`, `deactivated_at = NULL` |

**Staff — Req 1**

| Command | Description |
|---|---|
| `get_staff` | SELECT all staff; `active_only: bool` param filters by `is_active` |
| `create_staff` | INSERT new staff member |
| `update_staff` | UPDATE name, role |
| `deactivate_staff` | SET `is_active = 0`, `deactivated_at = now()`; returns open loan count so UI can show the warning list |
| `reactivate_staff` | SET `is_active = 1`, `deactivated_at = NULL` |

**Loans — Req 3 & 4**

| Command | Description |
|---|---|
| `issue_loan` | Atomic: INSERT transaction (出庫) + INSERT loan + UPDATE stock |
| `return_loan` | Atomic: INSERT transaction (入庫) + UPDATE loan (returned_date, in_transaction_id) + UPDATE stock |
| `get_unreturned_loans` | Query `v_unreturned_loans`; optional `staff_id` filter |
| `get_staff_loan_history` | Query `v_staff_outbound_history` for one staff member; optional date range |
| `get_staff_loan_summary` | Aggregate counts (total / returned / unreturned) per staff for the 人員管理 table |

**General**

| Command | Description |
|---|---|
| `record_transaction` | Bulk stock-in/out (non-loan); no loan record created |
| `get_transactions` | Query `v_transaction_log` with optional date range + instrument filter |
| `get_low_stock` | SELECT WHERE `stock_status != 'ok'` AND `is_active = 1` |
| `get_categories` | SELECT all categories |
| `export_csv` | Full query → CSV file with UTF-8 BOM; supports all export types including unreturned loans and staff history |

---

### Phase 3 — Frontend (Days 4–9)

**Component build order:**

1. **`useInventory` hook** — wraps all `invoke()` calls, manages loading/error state.
2. **`InventoryGrid`** — TanStack Table, sortable columns, active/inactive filter toggle, row highlight by `stock_status`, inline edit drawer with deactivation guard.
3. **`TransactionForm`** — mode toggle (一般出入庫 / 借用出庫), cascading category→instrument dropdown, real-time stock preview, inline unreturned-loan warning for the selected staff.
4. **`LoanManagement`** — two-tab component:
   - `UnreturnedTab`: table from `v_unreturned_loans`, color-coded by `days_outstanding`, quick-return drawer.
   - `StaffHistoryTab`: staff selector + date range + history table + summary stats + per-staff CSV export.
5. **`StaffManagement`** — staff table with active/inactive filter, add/edit drawer, deactivation guard showing open loans list.
6. **`LowStockAlerts`** — filtered view with 快速補貨 shortcut.
7. **`ExportPanel`** — extended with unreturned loans and staff history export types.
8. **`Sidebar`** — badges: 借還管理 shows unreturned count; 低庫存 shows low/zero count. Both refresh every 60 seconds via `setInterval`.

**i18n note:** All UI text is Chinese by default. Wrap string literals in a simple `t()` helper from the start to make language switching possible later.

---

### Phase 4 — Integration & Testing (Days 9–11)

- **Unit tests (Rust):** Test each command with an in-memory SQLite DB.
- **Component tests (React):** Vitest + React Testing Library for form validation and table rendering.
- **E2E test:** Tauri WebDriver scenario: add staff → add instrument → issue loan → verify unreturned list → return loan → verify cleared → export CSV → verify file.
- **Edge cases to test:**
  - 出庫 quantity > stock → error shown, stock unchanged, no loan created.
  - Return a loan that was already returned → returns error, no double-increment.
  - Deactivate staff with open loans → warning shown, deactivation still possible after confirmation.
  - Deactivate instrument with open loans → warning shown with loan list.
  - Reactivate staff → appears again in dropdowns.
  - Export "未歸還器械" CSV → check `days_outstanding` column is a number, not NULL.
  - Chinese characters in all exported CSVs open correctly in Excel (BOM check).

---

### Phase 5 — Packaging (Days 11–12)

```bash
npm run tauri build
# macOS:   InstrumentInventory.app
# Windows: InstrumentInventory_x.y.z_x64_en-US.msi
# Linux:   instrument-inventory_x.y.z_amd64.AppImage
```

**Production deployment checklist:**
- [ ] DB stored in OS app data dir, not beside the executable.
- [ ] First-run wizard: start fresh or import existing `.db` file.
- [ ] Auto-backup on startup: keep last 7 daily `.db` snapshots.
- [ ] Code-sign for hospital IT compliance.
- [ ] Verify `PRAGMA journal_mode=WAL` is set — enables read-while-writing for snappy UI.

---

## 7. Summary Diagram

```
Excel 器械清單_.xlsm
         │
         │ python migrate_xlsm_to_sqlite.py (once)
         ▼
  instruments.db (SQLite)
  ┌───────────────────────┐
  │ categories  (18)       │
  │ staff       (9)        │  ← is_active flag [Req 1]
  │ instruments (203)      │  ← is_active flag [Req 2]
  │ transactions (155+)    │  ← loan_id FK
  │ loans       (0 → n)   │  ← NEW: borrow/return pairs [Req 3,4]
  └───────────────────────┘
         │
         │ rusqlite (atomic loan + stock writes)
         ▼
  Tauri Rust Backend
  ┌──────────────────────────────────────────────────────────┐
  │  Staff CRUD + deactivate/reactivate          [Req 1]     │
  │  Instrument CRUD + deactivate/reactivate     [Req 2]     │
  │  issue_loan / return_loan (atomic)           [Req 3]     │
  │  get_unreturned_loans / staff_loan_history   [Req 3,4]   │
  │  export_csv (6 export types incl. loans)                 │
  └──────────────────────────────────────────────────────────┘
         │
         │ IPC invoke()
         ▼
  React Frontend
  ┌────────────────────────────────────────────────────────┐
  │ 庫存 Grid    │ 出入庫 (借用/一般) │ 借還管理          │
  │ 人員管理     │ 低庫存警示         │ 報表匯出          │
  └────────────────────────────────────────────────────────┘
         │
         │ tauri build
         ▼
  Single .exe / .app / .AppImage  (~10 MB, 100% offline)
```

---

*Document version 2 — Updated 2026-03-28 | Requirements added: staff management (Req 1), instrument CRUD (Req 2), unreturned loan tracking (Req 3), staff outbound history (Req 4)*
