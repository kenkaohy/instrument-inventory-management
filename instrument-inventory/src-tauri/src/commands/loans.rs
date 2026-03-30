// ============================================================
// commands/loans.rs — Loan management with ATOMIC transactions [REQ 3 & 4]
// ============================================================
//
// ⚠️  CRITICAL: issue_loan and return_loan use SQLite atomic transactions.
// If the app crashes mid-write, the database remains consistent —
// no negative stock, no orphaned records, no corrupted logs.
//
// API Contract for Frontend:
//
//   issue_loan(payload: NewLoan)           → i64 (new loan_id)
//   return_loan(payload: ReturnLoanPayload) → ()
//   get_unreturned_loans(filter: LoanFilter) → Vec<UnreturnedLoan>
//   get_staff_loan_history(filter: LoanFilter) → Vec<StaffLoanHistory>
//
// ============================================================

use crate::db::AppDb;
use crate::models::*;
use tauri::State;

/// Issue a loan — 借用出庫 (borrow-checkout)
///
/// This is the most critical function in the system. It performs 5 operations
/// inside a single SQLite transaction:
///
///   1. Verify sufficient stock exists
///   2. INSERT a 出庫 transaction record
///   3. INSERT a loan record linking to the transaction
///   4. Back-fill the loan_id on the transaction record
///   5. Decrement the instrument stock
///
/// If ANY step fails, ALL steps are rolled back. The database stays consistent.
///
/// Frontend usage:
///   const loanId = await invoke<number>("issue_loan", {
///     payload: { instrument_id: 42, staff_id: 3, quantity: 1 }
///   });
#[tauri::command]
pub fn issue_loan(
    state: State<'_, AppDb>,
    payload: NewLoan,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Use today's date if not specified
    let loan_date = payload.date.unwrap_or_else(|| {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    });

    // ── BEGIN ATOMIC TRANSACTION ──────────────────────────────────────────
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Step 1: Verify sufficient stock
    let stock: i64 = tx
        .query_row(
            "SELECT stock_quantity FROM instruments WHERE id = ? AND is_active = 1",
            [payload.instrument_id],
            |r| r.get(0),
        )
        .map_err(|_| "器械不存在或已停用".to_string())?;

    if stock < payload.quantity {
        return Err(format!(
            "庫存不足：目前庫存 {}，要求借出 {}",
            stock, payload.quantity
        ));
    }

    // Step 2: Insert the 出庫 transaction row (loan_id initially NULL)
    tx.execute(
        "INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id, transaction_date, notes)
         VALUES (?, '出庫', ?, ?, ?, ?)",
        rusqlite::params![
            payload.instrument_id,
            payload.quantity,
            payload.staff_id,
            loan_date,
            payload.notes,
        ],
    )
    .map_err(|e| format!("Failed to insert transaction: {}", e))?;
    let tx_id = tx.last_insert_rowid();

    // Step 3: Create the loans record, linking back to the transaction
    tx.execute(
        "INSERT INTO loans(instrument_id, staff_id, quantity, out_transaction_id, issued_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            payload.instrument_id,
            payload.staff_id,
            payload.quantity,
            tx_id,
            loan_date,
            payload.notes,
        ],
    )
    .map_err(|e| format!("Failed to insert loan: {}", e))?;
    let loan_id = tx.last_insert_rowid();

    // Step 4: Back-fill loan_id on the transaction row
    tx.execute(
        "UPDATE transactions SET loan_id = ? WHERE id = ?",
        rusqlite::params![loan_id, tx_id],
    )
    .map_err(|e| format!("Failed to link transaction to loan: {}", e))?;

    // Step 5: Decrement stock atomically
    tx.execute(
        "UPDATE instruments SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
         WHERE id = ?",
        rusqlite::params![payload.quantity, payload.instrument_id],
    )
    .map_err(|e| format!("Failed to update stock: {}", e))?;

    // ── COMMIT ────────────────────────────────────────────────────────────
    tx.commit()
        .map_err(|e| format!("Transaction commit failed: {}", e))?;

    Ok(loan_id)
}

/// Return a loan — 歸還入庫 (return-checkin)
///
/// Closes an open loan by:
///   1. Fetching the open loan record
///   2. Inserting a 入庫 transaction
///   3. Updating the loan record with returned_date and in_transaction_id
///   4. Restoring the instrument stock
///
/// All steps are atomic — if any fails, none take effect.
///
/// Frontend usage:
///   await invoke("return_loan", {
///     payload: { loan_id: 7, staff_id: 3 }
///   });
#[tauri::command]
pub fn return_loan(
    state: State<'_, AppDb>,
    payload: ReturnLoanPayload,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let return_date = payload.return_date.unwrap_or_else(|| {
        chrono::Local::now().format("%Y-%m-%d").to_string()
    });

    // ── BEGIN ATOMIC TRANSACTION ──────────────────────────────────────────
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Step 1: Fetch the open loan
    let (instrument_id, quantity): (i64, i64) = tx
        .query_row(
            "SELECT instrument_id, quantity FROM loans WHERE id = ? AND returned_date IS NULL",
            [payload.loan_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "借用記錄不存在或已歸還".to_string())?;

    // Step 2: Insert the 入庫 transaction row
    tx.execute(
        "INSERT INTO transactions(instrument_id, movement_type, quantity, staff_id, loan_id, transaction_date, notes)
         VALUES (?, '入庫', ?, ?, ?, ?, ?)",
        rusqlite::params![
            instrument_id,
            quantity,
            payload.staff_id,
            payload.loan_id,
            return_date,
            payload.notes,
        ],
    )
    .map_err(|e| format!("Failed to insert return transaction: {}", e))?;
    let in_tx_id = tx.last_insert_rowid();

    // Step 3: Close the loan record
    tx.execute(
        "UPDATE loans SET returned_date = ?, in_transaction_id = ? WHERE id = ?",
        rusqlite::params![return_date, in_tx_id, payload.loan_id],
    )
    .map_err(|e| format!("Failed to close loan: {}", e))?;

    // Step 4: Restore stock
    tx.execute(
        "UPDATE instruments SET stock_quantity = stock_quantity + ?, updated_at = datetime('now')
         WHERE id = ?",
        rusqlite::params![quantity, instrument_id],
    )
    .map_err(|e| format!("Failed to restore stock: {}", e))?;

    // ── COMMIT ────────────────────────────────────────────────────────────
    tx.commit()
        .map_err(|e| format!("Transaction commit failed: {}", e))?;

    Ok(())
}

/// Fetch all unreturned (open) loans, optionally filtered by staff.
///
/// Frontend usage:
///   const loans = await invoke<UnreturnedLoan[]>("get_unreturned_loans", {
///     filter: { staff_id: 3 }
///   });
#[tauri::command]
pub fn get_unreturned_loans(
    state: State<'_, AppDb>,
    filter: LoanFilter,
) -> Result<Vec<UnreturnedLoan>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT loan_id, staff_id, staff_name, category, instrument_id,
                instrument_name, quantity, issued_date, days_outstanding, notes
         FROM v_unreturned_loans WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(staff_id) = filter.staff_id {
        sql.push_str(" AND staff_id = ?");
        params.push(Box::new(staff_id));
    }

    sql.push_str(" ORDER BY issued_date ASC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(UnreturnedLoan {
                loan_id: row.get(0)?,
                staff_id: row.get(1)?,
                staff_name: row.get(2)?,
                category: row.get(3)?,
                instrument_id: row.get(4)?,
                instrument_name: row.get(5)?,
                quantity: row.get(6)?,
                issued_date: row.get(7)?,
                days_outstanding: row.get(8)?,
                notes: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Fetch loan history for a specific staff member.
///
/// Frontend usage:
///   const history = await invoke<StaffLoanHistory[]>("get_staff_loan_history", {
///     filter: { staff_id: 3, start_date: "2026-01-01", end_date: "2026-03-28" }
///   });
#[tauri::command]
pub fn get_staff_loan_history(
    state: State<'_, AppDb>,
    filter: LoanFilter,
) -> Result<Vec<StaffLoanHistory>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT staff_id, staff_name, loan_id, issued_date, returned_date,
                return_status, category, instrument_name, quantity, days_held, notes
         FROM v_staff_outbound_history WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(staff_id) = filter.staff_id {
        sql.push_str(" AND staff_id = ?");
        params.push(Box::new(staff_id));
    }

    if let Some(ref start) = filter.start_date {
        sql.push_str(" AND issued_date >= ?");
        params.push(Box::new(start.clone()));
    }

    if let Some(ref end) = filter.end_date {
        sql.push_str(" AND issued_date <= ?");
        params.push(Box::new(end.clone()));
    }

    sql.push_str(" ORDER BY issued_date DESC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(StaffLoanHistory {
                staff_id: row.get(0)?,
                staff_name: row.get(1)?,
                loan_id: row.get(2)?,
                issued_date: row.get(3)?,
                returned_date: row.get(4)?,
                return_status: row.get(5)?,
                category: row.get(6)?,
                instrument_name: row.get(7)?,
                quantity: row.get(8)?,
                days_held: row.get(9)?,
                notes: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Fetch loan history for a specific instrument.
#[tauri::command]
pub fn get_instrument_loan_history(
    state: State<'_, AppDb>,
    instrument_id: i64,
) -> Result<Vec<InstrumentLoanHistory>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let sql = String::from(
        "SELECT l.id AS loan_id, s.name AS staff_name, l.quantity, l.issued_date, l.returned_date,
            CASE WHEN l.returned_date IS NULL THEN '未歸還' ELSE '已歸還' END AS return_status,
            CAST(julianday(COALESCE(l.returned_date, date('now'))) - julianday(l.issued_date) AS INTEGER) AS days_held,
            l.notes
         FROM loans l
         JOIN staff s ON s.id = l.staff_id
         WHERE l.instrument_id = ?
         ORDER BY l.issued_date DESC"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([instrument_id], |row| {
            Ok(InstrumentLoanHistory {
                loan_id: row.get(0)?,
                staff_name: row.get(1)?,
                quantity: row.get(2)?,
                issued_date: row.get(3)?,
                returned_date: row.get(4)?,
                return_status: row.get(5)?,
                days_held: row.get(6)?,
                notes: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
