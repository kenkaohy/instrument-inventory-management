// ============================================================
// commands/transactions.rs — Non-loan stock movements
// ============================================================
//
// API Contract for Frontend:
//
//   record_transaction(payload: NewTransaction) → i64 (new tx ID)
//   get_transactions(filter: TransactionFilter) → Vec<TransactionRow>
//
// ============================================================

use crate::db::AppDb;
use crate::models::*;
use tauri::State;

/// Record a stock movement (一般出入庫 — not a loan).
///
/// This handles both:
///   - 入庫 (stock-in): increments instrument stock
///   - 出庫 (stock-out): decrements instrument stock, checks for sufficient quantity
///
/// Uses an atomic SQLite transaction to ensure the transaction record
/// and stock update are always in sync.
///
/// Frontend usage:
///   const txId = await invoke<number>("record_transaction", {
///     payload: {
///       instrument_id: 42,
///       movement_type: "入庫",
///       quantity: 5,
///       staff_id: 3,
///       notes: "補貨"
///     }
///   });
#[tauri::command]
pub fn record_transaction(
    state: State<'_, AppDb>,
    payload: NewTransaction,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Validate movement type
    if payload.movement_type != "入庫" && payload.movement_type != "出庫" {
        return Err("無效的出入庫類型：必須為 '入庫' 或 '出庫'".to_string());
    }

    let tx_date = payload.transaction_date.unwrap_or_else(|| {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    });

    // ── BEGIN ATOMIC TRANSACTION ──────────────────────────────────────────
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // For 出庫: verify sufficient stock
    if payload.movement_type == "出庫" {
        let stock: i64 = tx
            .query_row(
                "SELECT stock_quantity FROM instruments WHERE id = ? AND is_active = 1",
                [payload.instrument_id],
                |r| r.get(0),
            )
            .map_err(|_| "器械不存在或已停用".to_string())?;

        if stock < payload.quantity {
            return Err(format!(
                "庫存不足：目前庫存 {}，要求出庫 {}",
                stock, payload.quantity
            ));
        }
    }

    // Insert the transaction record (no loan_id for non-loan movements)
    tx.execute(
        "INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id, loan_id, transaction_date, notes)
         VALUES (?, ?, ?, ?, NULL, ?, ?)",
        rusqlite::params![
            payload.instrument_id,
            payload.movement_type,
            payload.quantity,
            payload.staff_id,
            tx_date,
            payload.notes,
        ],
    )
    .map_err(|e| format!("Failed to insert transaction: {}", e))?;
    let tx_id = tx.last_insert_rowid();

    // Update instrument stock
    let stock_update = if payload.movement_type == "入庫" {
        "UPDATE instruments SET stock_quantity = stock_quantity + ?, updated_at = datetime('now') WHERE id = ?"
    } else {
        "UPDATE instruments SET stock_quantity = stock_quantity - ?, updated_at = datetime('now') WHERE id = ?"
    };

    tx.execute(
        stock_update,
        rusqlite::params![payload.quantity, payload.instrument_id],
    )
    .map_err(|e| format!("Failed to update stock: {}", e))?;

    // ── COMMIT ────────────────────────────────────────────────────────────
    tx.commit()
        .map_err(|e| format!("Transaction commit failed: {}", e))?;

    Ok(tx_id)
}

/// Fetch transaction log with optional filters.
///
/// Frontend usage:
///   const txs = await invoke<TransactionRow[]>("get_transactions", {
///     filter: { start_date: "2026-02-01", end_date: "2026-03-28" }
///   });
#[tauri::command]
pub fn get_transactions(
    state: State<'_, AppDb>,
    filter: TransactionFilter,
) -> Result<Vec<TransactionRow>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, transaction_date, category, instrument_name,
                movement_type, quantity, staff_name, loan_id, notes, created_at
         FROM v_transaction_log WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(inst_id) = filter.instrument_id {
        // Need to join back to get instrument_id — use a subquery
        sql = String::from(
            "SELECT t.id, t.transaction_date, c.name AS category, i.name AS instrument_name,
                    t.movement_type, t.quantity, s.name AS staff_name, t.loan_id, t.notes, t.created_at
             FROM transactions t
             JOIN instruments i ON i.id = t.instrument_id
             JOIN categories c ON c.id = i.category_id
             LEFT JOIN staff s ON s.id = t.staff_id
             WHERE t.instrument_id = ?"
        );
        params.push(Box::new(inst_id));
    }

    if let Some(staff_id) = filter.staff_id {
        sql.push_str(" AND staff_name = (SELECT name FROM staff WHERE id = ?)");
        params.push(Box::new(staff_id));
    }

    if let Some(ref start) = filter.start_date {
        sql.push_str(" AND transaction_date >= ?");
        params.push(Box::new(start.clone()));
    }

    if let Some(ref end) = filter.end_date {
        sql.push_str(" AND transaction_date <= ?");
        params.push(Box::new(end.clone()));
    }

    if let Some(ref mt) = filter.movement_type {
        sql.push_str(" AND movement_type = ?");
        params.push(Box::new(mt.clone()));
    }

    sql.push_str(" ORDER BY id DESC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(TransactionRow {
                id: row.get(0)?,
                transaction_date: row.get(1)?,
                category: row.get(2)?,
                instrument_name: row.get(3)?,
                movement_type: row.get(4)?,
                quantity: row.get(5)?,
                staff_name: row.get(6)?,
                loan_id: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
