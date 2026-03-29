// ============================================================
// commands/inventory.rs — Instrument CRUD operations [REQ 2]
// ============================================================
//
// API Contract for Frontend:
//
//   get_inventory(filter: InventoryFilter) → Vec<InstrumentRow>
//   get_instrument(id: i64)                → InstrumentRow
//   create_instrument(payload: NewInstrument) → i64 (new ID)
//   update_instrument(id: i64, payload: UpdateInstrument) → ()
//   deactivate_instrument(id: i64)         → DeactivationCheck
//   reactivate_instrument(id: i64)         → ()
//   get_categories()                       → Vec<Category>
//   get_low_stock()                        → Vec<InstrumentRow>
//
// ============================================================

use crate::db::AppDb;
use crate::models::*;
use tauri::State;

/// Fetch inventory grid data with optional filters.
///
/// Frontend usage:
///   const rows = await invoke<InstrumentRow[]>("get_inventory", {
///     filter: { category: "刀柄類", active_only: true }
///   });
#[tauri::command]
pub fn get_inventory(
    state: State<'_, AppDb>,
    filter: InventoryFilter,
) -> Result<Vec<InstrumentRow>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, category, instrument_name, stock_quantity,
                low_stock_threshold, is_active, stock_status, notes, updated_at
         FROM v_inventory_summary WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref cat) = filter.category {
        sql.push_str(" AND category = ?");
        params.push(Box::new(cat.clone()));
    }

    if let Some(ref search) = filter.search {
        sql.push_str(" AND instrument_name LIKE ?");
        params.push(Box::new(format!("%{}%", search)));
    }

    if let Some(ref status) = filter.stock_status {
        sql.push_str(" AND stock_status = ?");
        params.push(Box::new(status.clone()));
    }

    if let Some(active_only) = filter.active_only {
        if active_only {
            sql.push_str(" AND is_active = 1");
        }
    }

    sql.push_str(" ORDER BY category, instrument_name");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok(InstrumentRow {
                id: row.get(0)?,
                category: row.get(1)?,
                instrument_name: row.get(2)?,
                stock_quantity: row.get(3)?,
                low_stock_threshold: row.get(4)?,
                is_active: row.get::<_, i64>(5)? == 1,
                stock_status: row.get(6)?,
                notes: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Fetch a single instrument by ID.
#[tauri::command]
pub fn get_instrument(
    state: State<'_, AppDb>,
    id: i64,
) -> Result<InstrumentRow, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, category, instrument_name, stock_quantity,
                low_stock_threshold, is_active, stock_status, notes, updated_at
         FROM v_inventory_summary WHERE id = ?",
        [id],
        |row| {
            Ok(InstrumentRow {
                id: row.get(0)?,
                category: row.get(1)?,
                instrument_name: row.get(2)?,
                stock_quantity: row.get(3)?,
                low_stock_threshold: row.get(4)?,
                is_active: row.get::<_, i64>(5)? == 1,
                stock_status: row.get(6)?,
                notes: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(|e| format!("Instrument not found: {}", e))
}

/// Create a new instrument SKU.
/// Returns the new instrument's ID.
#[tauri::command]
pub fn create_instrument(
    state: State<'_, AppDb>,
    payload: NewInstrument,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO instruments (category_id, name, stock_quantity, low_stock_threshold, notes, is_active)
         VALUES (?, ?, ?, ?, ?, 1)",
        rusqlite::params![
            payload.category_id,
            payload.name,
            payload.stock_quantity.unwrap_or(0),
            payload.low_stock_threshold.unwrap_or(2),
            payload.notes,
        ],
    )
    .map_err(|e| format!("Failed to create instrument: {}", e))?;

    Ok(conn.last_insert_rowid())
}

/// Update an existing instrument's metadata (not stock — stock is updated via transactions).
#[tauri::command]
pub fn update_instrument(
    state: State<'_, AppDb>,
    id: i64,
    payload: UpdateInstrument,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref cat_id) = payload.category_id {
        updates.push("category_id = ?");
        params.push(Box::new(*cat_id));
    }
    if let Some(ref name) = payload.name {
        updates.push("name = ?");
        params.push(Box::new(name.clone()));
    }
    if let Some(ref threshold) = payload.low_stock_threshold {
        updates.push("low_stock_threshold = ?");
        params.push(Box::new(*threshold));
    }
    if let Some(ref notes) = payload.notes {
        updates.push("notes = ?");
        params.push(Box::new(notes.clone()));
    }

    if updates.is_empty() {
        return Ok(()); // nothing to update
    }

    updates.push("updated_at = datetime('now')");

    let sql = format!(
        "UPDATE instruments SET {} WHERE id = ?",
        updates.join(", ")
    );
    params.push(Box::new(id));

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())
        .map_err(|e| format!("Failed to update instrument: {}", e))?;

    Ok(())
}

/// Deactivate (soft-delete) an instrument.
/// Returns a DeactivationCheck with warnings if open loans exist.
/// The frontend decides whether to proceed after showing the warning.
#[tauri::command]
pub fn deactivate_instrument(
    state: State<'_, AppDb>,
    id: i64,
) -> Result<DeactivationCheck, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Check for open loans on this instrument
    let mut stmt = conn
        .prepare(
            "SELECT loan_id, staff_id, staff_name, category, instrument_id,
                    instrument_name, quantity, issued_date, days_outstanding, notes
             FROM v_unreturned_loans WHERE instrument_id = ?",
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

    // Perform the deactivation
    conn.execute(
        "UPDATE instruments SET is_active = 0, deactivated_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?",
        [id],
    )
    .map_err(|e| format!("Failed to deactivate instrument: {}", e))?;

    let message = if open_count > 0 {
        format!("此器械仍有 {} 筆未歸還借用記錄，已停用但借用記錄仍保留。", open_count)
    } else {
        "器械已停用。".to_string()
    };

    Ok(DeactivationCheck {
        can_deactivate: true,
        open_loan_count: open_count,
        open_loans,
        message,
    })
}

/// Reactivate a previously deactivated instrument.
#[tauri::command]
pub fn reactivate_instrument(
    state: State<'_, AppDb>,
    id: i64,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE instruments SET is_active = 1, deactivated_at = NULL, updated_at = datetime('now')
         WHERE id = ?",
        [id],
    )
    .map_err(|e| format!("Failed to reactivate instrument: {}", e))?;

    Ok(())
}

/// Fetch all categories.
#[tauri::command]
pub fn get_categories(
    state: State<'_, AppDb>,
) -> Result<Vec<Category>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, name_en FROM categories ORDER BY name")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                name: row.get(1)?,
                name_en: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// Fetch instruments with low or zero stock (active only).
#[tauri::command]
pub fn get_low_stock(
    state: State<'_, AppDb>,
) -> Result<Vec<InstrumentRow>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, category, instrument_name, stock_quantity,
                    low_stock_threshold, is_active, stock_status, notes, updated_at
             FROM v_inventory_summary
             WHERE stock_status IN ('out_of_stock', 'low_stock') AND is_active = 1
             ORDER BY stock_status DESC, category, instrument_name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(InstrumentRow {
                id: row.get(0)?,
                category: row.get(1)?,
                instrument_name: row.get(2)?,
                stock_quantity: row.get(3)?,
                low_stock_threshold: row.get(4)?,
                is_active: row.get::<_, i64>(5)? == 1,
                stock_status: row.get(6)?,
                notes: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}
