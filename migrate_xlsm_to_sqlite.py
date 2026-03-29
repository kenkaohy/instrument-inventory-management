#!/usr/bin/env python3
"""
migrate_xlsm_to_sqlite.py  (v2 — updated for loans schema)
One-time script: parses 器械清單 .xlsm and seeds inventory.db
Handles v2 schema: staff.is_active, instruments.is_active, loans table

Usage:
    pip install pandas openpyxl
    python migrate_xlsm_to_sqlite.py
"""

import sqlite3
import pandas as pd
from pathlib import Path
import sys

# ── Configuration ──────────────────────────────────────────────────────────────
# Note: the actual filename has a space before .xlsm
XLSM_PATH   = Path(__file__).parent / "器械清單 .xlsm"
DB_PATH     = Path(__file__).parent / "instrument-inventory" / "inventory.db"
SCHEMA_PATH = Path(__file__).parent / "instrument-inventory" / "src-tauri" / "migrations" / "001_init.sql"

def main():
    print(f"📂 Excel source:  {XLSM_PATH}")
    print(f"📂 DB target:     {DB_PATH}")
    print(f"📂 Schema source: {SCHEMA_PATH}")
    print()

    if not XLSM_PATH.exists():
        print(f"❌ Excel file not found: {XLSM_PATH}")
        sys.exit(1)

    if not SCHEMA_PATH.exists():
        print(f"❌ Schema file not found: {SCHEMA_PATH}")
        sys.exit(1)

    # Remove old DB if exists (fresh migration)
    if DB_PATH.exists():
        DB_PATH.unlink()
        print("🗑️  Removed existing database")

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")

    # Execute schema
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(schema_sql)
    print("✅ Schema created successfully")
    print()

    # ── 1. Parse 庫存 (Inventory) sheet ────────────────────────────────────────
    print("── Parsing 庫存 (Inventory) sheet ──")
    df_inv = pd.read_excel(str(XLSM_PATH), sheet_name="庫存", engine="openpyxl", header=None)

    # The inventory sheet has 4 parallel column groups.
    # Each group: [Category Type col, Instrument Name col, Stock Quantity col]
    # Based on the design doc analysis:
    COL_GROUPS = [(3, 4, 5), (7, 8, 9), (11, 12, 13), (15, 16, 17)]

    category_map = {}
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

            # Detect category header
            if pd.notna(t) and str(t).strip() not in ("類型", "nan", ""):
                current_type = str(t).strip()

            # Detect instrument row
            if (pd.notna(n) and pd.notna(s)
                and str(n).strip() not in ("器械名稱", "nan", "")
                and current_type):
                try:
                    cat_id = get_or_create_category(current_type)
                    stock = int(float(s))  # handle floats from Excel
                    inst_name = str(n).strip()

                    conn.execute(
                        """INSERT OR IGNORE INTO instruments(category_id, name, stock_quantity, is_active)
                           VALUES (?, ?, ?, 1)""",
                        (cat_id, inst_name, stock)
                    )
                    row_id = conn.execute(
                        "SELECT id FROM instruments WHERE category_id=? AND name=?",
                        (cat_id, inst_name)
                    ).fetchone()[0]
                    instrument_map[(cat_id, inst_name)] = row_id
                    items_inserted += 1
                except (ValueError, TypeError) as e:
                    pass  # Skip rows with non-numeric stock values

    print(f"  ✓ Categories created: {len(category_map)}")
    print(f"  ✓ Instruments inserted: {items_inserted}")
    print()

    # ── 2. Seed staff (all active by default) ──────────────────────────────────
    print("── Seeding staff ──")
    staff_map = {}
    known_staff = ["韋茜", "瑞禧", "廷勳", "齡月", "主恤", "璿霞", "絹珺", "孝儒", "晼琪"]
    for name in known_staff:
        conn.execute("INSERT OR IGNORE INTO staff(name, is_active) VALUES (?, 1)", (name,))
        row = conn.execute("SELECT id FROM staff WHERE name=?", (name,)).fetchone()
        staff_map[name] = row[0]
    print(f"  ✓ Staff seeded: {len(staff_map)}")
    print()

    # ── 3. Parse 資料庫 (Transaction log) ──────────────────────────────────────
    # NOTE: Historical transactions from Excel are treated as plain stock movements
    # (not loan events), because the original sheet had no borrow/return pairing.
    # The loans workflow begins from the first transaction entered in the new app.
    print("── Parsing 資料庫 (Transaction) sheet ──")
    try:
        df_tx = pd.read_excel(
            str(XLSM_PATH), sheet_name="資料庫", engine="openpyxl",
            header=1, usecols=[1, 2, 3, 4, 5, 6, 7]
        )
        df_tx.columns = ["seq", "date", "category", "instrument", "movement", "quantity", "staff"]
        df_tx = df_tx.dropna(subset=["seq", "instrument", "movement", "quantity"])

        tx_inserted = 0
        tx_skipped = 0
        for _, row in df_tx.iterrows():
            cat_name  = str(row["category"]).strip() if pd.notna(row["category"]) else None
            inst_name = str(row["instrument"]).strip()
            movement  = str(row["movement"]).strip()
            qty       = int(float(row["quantity"]))
            date_val  = row["date"]
            staff_val = row["staff"] if pd.notna(row.get("staff", None)) else None

            if not cat_name:
                tx_skipped += 1
                continue

            # Validate movement type
            if movement not in ("入庫", "出庫"):
                tx_skipped += 1
                continue

            cat_id = get_or_create_category(cat_name)
            inst = conn.execute(
                "SELECT id FROM instruments WHERE category_id=? AND name=?",
                (cat_id, inst_name)
            ).fetchone()
            if not inst:
                tx_skipped += 1
                continue

            tx_date = date_val.strftime("%Y-%m-%d") if hasattr(date_val, "strftime") else str(date_val)[:10]
            staff_id = staff_map.get(str(staff_val).strip()) if staff_val else None

            # Also check if any new staff names appear in transactions
            if staff_val and str(staff_val).strip() not in staff_map:
                staff_name = str(staff_val).strip()
                conn.execute("INSERT OR IGNORE INTO staff(name, is_active) VALUES (?, 1)", (staff_name,))
                row_id = conn.execute("SELECT id FROM staff WHERE name=?", (staff_name,)).fetchone()
                staff_map[staff_name] = row_id[0]
                staff_id = row_id[0]

            # Historical records: loan_id = NULL (no borrow-return pairing from Excel data)
            conn.execute(
                """INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id,
                                            loan_id, transaction_date)
                   VALUES (?, ?, ?, ?, NULL, ?)""",
                (inst[0], movement, qty, staff_id, tx_date)
            )
            tx_inserted += 1

        print(f"  ✓ Transactions inserted: {tx_inserted}")
        if tx_skipped > 0:
            print(f"  ⚠ Transactions skipped: {tx_skipped}")
    except Exception as e:
        print(f"  ⚠ Could not parse transaction sheet: {e}")
        print("  → Continuing without historical transactions")

    print()

    # ── 4. Commit and verify ───────────────────────────────────────────────────
    conn.commit()

    # Verification queries
    cat_count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    staff_count = conn.execute("SELECT COUNT(*) FROM staff").fetchone()[0]
    inst_count = conn.execute("SELECT COUNT(*) FROM instruments").fetchone()[0]
    tx_count = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    zero_stock = conn.execute("SELECT COUNT(*) FROM instruments WHERE stock_quantity = 0").fetchone()[0]

    conn.close()

    print("=" * 50)
    print(f"✅ Migration complete → {DB_PATH}")
    print(f"   Categories:    {cat_count}")
    print(f"   Staff:         {staff_count}")
    print(f"   Instruments:   {inst_count} ({zero_stock} with zero stock)")
    print(f"   Transactions:  {tx_count}")
    print("=" * 50)

if __name__ == "__main__":
    main()
