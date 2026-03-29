// ============================================================
// commands/export.rs — CSV export with UTF-8 BOM
// ============================================================
//
// API Contract for Frontend:
//
//   export_csv(payload: ExportRequest) → String (success message with row count)
//
// Supported export types:
//   - "inventory"        → current snapshot of all instruments
//   - "transactions"     → full or date-filtered ledger
//   - "low_stock"        → only items below threshold
//   - "unreturned_loans" → all open loans
//   - "staff_history"    → specific staff member's loan history
//
// All exports write UTF-8 BOM at file start so Excel opens Chinese correctly.
// ============================================================

use crate::db::AppDb;
use crate::models::ExportRequest;
use std::fs::File;
use std::io::Write;
use tauri::State;

/// Export data to CSV file with UTF-8 BOM.
///
/// Frontend usage:
///   await invoke<string>("export_csv", {
///     payload: { export_type: "inventory", dest_path: "/path/to/file.csv" }
///   });
#[tauri::command]
pub fn export_csv(
    state: State<'_, AppDb>,
    payload: ExportRequest,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // Create the output file with UTF-8 BOM
    let mut file = File::create(&payload.dest_path)
        .map_err(|e| format!("無法建立檔案: {}", e))?;

    // Write UTF-8 BOM (ensures Excel reads Chinese correctly)
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|e| format!("寫入 BOM 失敗: {}", e))?;

    let mut wtr = csv::Writer::from_writer(file);

    let row_count = match payload.export_type.as_str() {
        "inventory" => export_inventory(&conn, &mut wtr)?,
        "transactions" => export_transactions(&conn, &mut wtr, &payload)?,
        "low_stock" => export_low_stock(&conn, &mut wtr)?,
        "unreturned_loans" => export_unreturned_loans(&conn, &mut wtr)?,
        "staff_history" => export_staff_history(&conn, &mut wtr, &payload)?,
        _ => return Err(format!("未知的匯出類型: {}", payload.export_type)),
    };

    wtr.flush().map_err(|e| format!("寫入失敗: {}", e))?;

    Ok(format!("已匯出 {} 筆", row_count))
}

/// Export current inventory snapshot
fn export_inventory(
    conn: &rusqlite::Connection,
    wtr: &mut csv::Writer<File>,
) -> Result<usize, String> {
    // Write header
    wtr.write_record(["類別", "器械名稱", "庫存數量", "低庫存閾值", "狀態", "啟用", "備註", "更新時間"])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT category, instrument_name, stock_quantity, low_stock_threshold,
                    stock_status, is_active, notes, updated_at
             FROM v_inventory_summary ORDER BY category, instrument_name",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (cat, name, stock, threshold, status, active, notes, updated) =
            row.map_err(|e| e.to_string())?;

        let status_cn = match status.as_str() {
            "ok" => "正常",
            "low_stock" => "低庫存",
            "out_of_stock" => "缺貨",
            "inactive" => "停用",
            _ => &status,
        };

        wtr.write_record([
            cat.as_str(),
            name.as_str(),
            &stock.to_string(),
            &threshold.to_string(),
            status_cn,
            if active == 1 { "是" } else { "否" },
            notes.as_deref().unwrap_or_default(),
            updated.as_deref().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Export transaction log with optional date filter
fn export_transactions(
    conn: &rusqlite::Connection,
    wtr: &mut csv::Writer<File>,
    payload: &ExportRequest,
) -> Result<usize, String> {
    wtr.write_record(["序號", "日期", "類別", "器械名稱", "出入庫", "數量", "登記人員", "借用編號", "備註"])
        .map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, transaction_date, category, instrument_name,
                movement_type, quantity, staff_name, loan_id, notes
         FROM v_transaction_log WHERE 1=1"
    );
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref start) = payload.start_date {
        sql.push_str(" AND transaction_date >= ?");
        params.push(Box::new(start.clone()));
    }
    if let Some(ref end) = payload.end_date {
        sql.push_str(" AND transaction_date <= ?");
        params.push(Box::new(end.clone()));
    }

    sql.push_str(" ORDER BY id ASC");

    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let mut count = 0;

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<i64>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (id, date, cat, name, movement, qty, staff, loan_id, notes) =
            row.map_err(|e| e.to_string())?;

        wtr.write_record([
            &id.to_string(),
            date.as_str(),
            cat.as_str(),
            name.as_str(),
            movement.as_str(),
            &qty.to_string(),
            staff.as_deref().unwrap_or_default(),
            &loan_id.map(|l| l.to_string()).unwrap_or_default(),
            notes.as_deref().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Export low stock items only
fn export_low_stock(
    conn: &rusqlite::Connection,
    wtr: &mut csv::Writer<File>,
) -> Result<usize, String> {
    wtr.write_record(["類別", "器械名稱", "庫存數量", "低庫存閾值", "狀態"])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT category, instrument_name, stock_quantity, low_stock_threshold, stock_status
             FROM v_inventory_summary
             WHERE stock_status IN ('out_of_stock', 'low_stock') AND is_active = 1
             ORDER BY stock_status DESC, category, instrument_name",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (cat, name, stock, threshold, status) = row.map_err(|e| e.to_string())?;
        let status_cn = if status == "out_of_stock" { "缺貨" } else { "低庫存" };
        wtr.write_record([
            cat.as_str(),
            name.as_str(),
            &stock.to_string(),
            &threshold.to_string(),
            status_cn,
        ])
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Export unreturned loans
fn export_unreturned_loans(
    conn: &rusqlite::Connection,
    wtr: &mut csv::Writer<File>,
) -> Result<usize, String> {
    wtr.write_record(["借用人", "類別", "器械名稱", "數量", "借出日期", "已借天數", "備註"])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT staff_name, category, instrument_name, quantity, issued_date,
                    days_outstanding, notes
             FROM v_unreturned_loans ORDER BY issued_date ASC",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (staff, cat, name, qty, date, days, notes) = row.map_err(|e| e.to_string())?;
        wtr.write_record([
            staff.as_str(),
            cat.as_str(),
            name.as_str(),
            &qty.to_string(),
            date.as_str(),
            &days.to_string(),
            notes.as_deref().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

/// Export specific staff member's loan history
fn export_staff_history(
    conn: &rusqlite::Connection,
    wtr: &mut csv::Writer<File>,
    payload: &ExportRequest,
) -> Result<usize, String> {
    let staff_id = payload
        .staff_id
        .ok_or("匯出人員借用歷史需要指定人員".to_string())?;

    wtr.write_record(["借出日期", "類別", "器械名稱", "數量", "歸還日期", "狀態", "持有天數", "備註"])
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT issued_date, category, instrument_name, quantity,
                    returned_date, return_status, days_held, notes
             FROM v_staff_outbound_history WHERE staff_id = ?
             ORDER BY issued_date DESC",
        )
        .map_err(|e| e.to_string())?;

    let mut count = 0;
    let rows = stmt
        .query_map([staff_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (issued, cat, name, qty, returned, status, days, notes) =
            row.map_err(|e| e.to_string())?;
        wtr.write_record([
            issued.as_str(),
            cat.as_str(),
            name.as_str(),
            &qty.to_string(),
            &returned.unwrap_or_else(|| "—".to_string()),
            status.as_str(),
            &days.to_string(),
            notes.as_deref().unwrap_or_default(),
        ])
        .map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}
