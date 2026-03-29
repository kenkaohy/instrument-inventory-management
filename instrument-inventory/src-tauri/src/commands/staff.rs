// ============================================================
// commands/staff.rs — Staff CRUD operations [REQ 1]
// ============================================================
//
// API Contract for Frontend:
//
//   get_staff(active_only: Option<bool>)       → Vec<StaffMember>
//   create_staff(payload: NewStaff)             → i64 (new ID)
//   update_staff(id: i64, payload: UpdateStaffPayload) → ()
//   deactivate_staff(id: i64)                  → DeactivationCheck
//   reactivate_staff(id: i64)                  → ()
//   get_staff_loan_summary()                   → Vec<StaffLoanSummary>
//
// ============================================================

use crate::db::AppDb;
use crate::models::*;
use tauri::State;

/// Fetch all staff members, optionally filtered by active status.
///
/// Frontend usage:
///   const staff = await invoke<StaffMember[]>("get_staff", { activeOnly: true });
#[tauri::command]
pub fn get_staff(
    state: State<'_, AppDb>,
    active_only: Option<bool>,
) -> Result<Vec<StaffMember>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let sql = if active_only.unwrap_or(false) {
        "SELECT id, name, role, is_active, created_at, deactivated_at
         FROM staff WHERE is_active = 1 ORDER BY name"
    } else {
        "SELECT id, name, role, is_active, created_at, deactivated_at
         FROM staff ORDER BY is_active DESC, name"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StaffMember {
                id: row.get(0)?,
                name: row.get(1)?,
                role: row.get(2)?,
                is_active: row.get::<_, i64>(3)? == 1,
                created_at: row.get(4)?,
                deactivated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Create a new staff member.
/// Returns the new staff member's ID.
#[tauri::command]
pub fn create_staff(
    state: State<'_, AppDb>,
    payload: NewStaff,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO staff (name, role, is_active) VALUES (?, ?, 1)",
        rusqlite::params![payload.name, payload.role],
    )
    .map_err(|e| format!("Failed to create staff: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Update a staff member's name or role.
#[tauri::command]
pub fn update_staff(
    state: State<'_, AppDb>,
    id: i64,
    payload: UpdateStaffPayload,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref name) = payload.name {
        updates.push("name = ?");
        params.push(Box::new(name.clone()));
    }
    if let Some(ref role) = payload.role {
        updates.push("role = ?");
        params.push(Box::new(role.clone()));
    }

    if updates.is_empty() {
        return Ok(());
    }

    let sql = format!("UPDATE staff SET {} WHERE id = ?", updates.join(", "));
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("Failed to update staff: {}", e))?;

    Ok(())
}

/// Deactivate (soft-delete) a staff member.
/// Returns warnings if they have open loans.
/// Deactivation still proceeds — the warning is informational.
#[tauri::command]
pub fn deactivate_staff(
    state: State<'_, AppDb>,
    id: i64,
) -> Result<DeactivationCheck, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Check for open loans
    let mut stmt = conn
        .prepare(
            "SELECT loan_id, staff_id, staff_name, category, instrument_id,
                    instrument_name, quantity, issued_date, days_outstanding, notes
             FROM v_unreturned_loans WHERE staff_id = ?",
        )
        .map_err(|e| e.to_string())?;

    let open_loans: Vec<UnreturnedLoan> = stmt
        .query_map([id], |row| {
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
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let open_count = open_loans.len() as i64;

    // Perform deactivation
    conn.execute(
        "UPDATE staff SET is_active = 0, deactivated_at = datetime('now') WHERE id = ?",
        [id],
    )
    .map_err(|e| format!("Failed to deactivate staff: {}", e))?;

    let message = if open_count > 0 {
        format!(
            "此人員仍有 {} 件未歸還器械，停用後將不再出現在出入庫選單，但借用記錄仍保留。",
            open_count
        )
    } else {
        "人員已停用。".to_string()
    };

    Ok(DeactivationCheck {
        can_deactivate: true,
        open_loan_count: open_count,
        open_loans,
        message,
    })
}

/// Reactivate a previously deactivated staff member.
#[tauri::command]
pub fn reactivate_staff(
    state: State<'_, AppDb>,
    id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE staff SET is_active = 1, deactivated_at = NULL WHERE id = ?",
        [id],
    )
    .map_err(|e| format!("Failed to reactivate staff: {}", e))?;

    Ok(())
}

/// Get loan summary for each staff member (for the 人員管理 table).
/// Shows total loans, returned count, and unreturned count.
#[tauri::command]
pub fn get_staff_loan_summary(
    state: State<'_, AppDb>,
) -> Result<Vec<StaffLoanSummary>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT
                s.id,
                s.name,
                COUNT(l.id) AS total_loans,
                COUNT(l.returned_date) AS returned_loans,
                COUNT(l.id) - COUNT(l.returned_date) AS unreturned_loans
             FROM staff s
             LEFT JOIN loans l ON l.staff_id = s.id
             GROUP BY s.id, s.name
             ORDER BY s.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(StaffLoanSummary {
                staff_id: row.get(0)?,
                staff_name: row.get(1)?,
                total_loans: row.get(2)?,
                returned_loans: row.get(3)?,
                unreturned_loans: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
