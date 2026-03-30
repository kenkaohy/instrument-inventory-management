// ============================================================
// models.rs — Shared data structures for Tauri IPC
// ============================================================
// All structs here are serialized to JSON and sent to the React
// frontend via Tauri's invoke() IPC bridge.
//
// Frontend usage example:
//   const instruments = await invoke<InstrumentRow[]>("get_inventory", { filter });
// ============================================================

use serde::{Deserialize, Serialize};

// ── Filter / Request types (Frontend → Backend) ──────────────────────────────

/// Filter for querying the inventory grid
#[derive(Debug, Deserialize)]
pub struct InventoryFilter {
    pub category: Option<String>,     // filter by category name
    pub search: Option<String>,       // search instrument name (LIKE '%term%')
    pub stock_status: Option<String>, // "ok" | "low_stock" | "out_of_stock" | "inactive"
    pub active_only: Option<bool>,    // true = only is_active=1
}

/// Filter for querying transactions
#[derive(Debug, Deserialize)]
pub struct TransactionFilter {
    pub instrument_id: Option<i64>,
    pub staff_id: Option<i64>,
    pub start_date: Option<String>,   // "YYYY-MM-DD"
    pub end_date: Option<String>,     // "YYYY-MM-DD"
    pub movement_type: Option<String>, // "入庫" | "出庫"
}

/// Payload for creating a new instrument
#[derive(Debug, Deserialize)]
pub struct NewInstrument {
    pub category_id: i64,
    pub name: String,
    pub stock_quantity: Option<i64>,       // defaults to 0
    pub low_stock_threshold: Option<i64>,  // defaults to 2
    pub notes: Option<String>,
}

/// Payload for updating an existing instrument
#[derive(Debug, Deserialize)]
pub struct UpdateInstrument {
    pub category_id: Option<i64>,
    pub name: Option<String>,
    pub low_stock_threshold: Option<i64>,
    pub notes: Option<String>,
}

/// Payload for creating a new staff member
#[derive(Debug, Deserialize)]
pub struct NewStaff {
    pub name: String,
    pub role: Option<String>,
    pub is_admin: bool,
}

/// Payload for updating a staff member
#[derive(Debug, Deserialize)]
pub struct UpdateStaffPayload {
    pub name: Option<String>,
    pub role: Option<String>,
    pub is_admin: Option<bool>,
}

/// Payload for recording a non-loan transaction (一般出入庫)
#[derive(Debug, Deserialize)]
pub struct NewTransaction {
    pub instrument_id: i64,
    pub movement_type: String,  // "入庫" | "出庫"
    pub quantity: i64,
    pub staff_id: Option<i64>,
    pub transaction_date: Option<String>,  // defaults to today
    pub notes: Option<String>,
}

/// Payload for issuing a loan (借用出庫)
#[derive(Debug, Deserialize)]
pub struct NewLoan {
    pub instrument_id: i64,
    pub staff_id: i64,
    pub quantity: i64,
    pub date: Option<String>,     // defaults to today
    pub notes: Option<String>,
}

/// Payload for returning a loan (歸還入庫)
#[derive(Debug, Deserialize)]
pub struct ReturnLoanPayload {
    pub loan_id: i64,
    pub staff_id: i64,           // who is registering the return
    pub return_date: Option<String>, // defaults to today
    pub notes: Option<String>,
}

/// Filter for loan queries
#[derive(Debug, Deserialize)]
pub struct LoanFilter {
    pub staff_id: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

/// CSV export type
#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    pub export_type: String,      // "inventory" | "transactions" | "low_stock" | "unreturned_loans" | "staff_history"
    pub dest_path: String,        // full file path chosen by user
    pub staff_id: Option<i64>,    // for staff_history export
    pub start_date: Option<String>,
    pub end_date: Option<String>,
}

// ── Response types (Backend → Frontend) ──────────────────────────────────────

/// Category row
#[derive(Debug, Serialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub name_en: Option<String>,
}

/// Staff member row
#[derive(Debug, Serialize)]
pub struct StaffMember {
    pub id: i64,
    pub name: String,
    pub role: Option<String>,
    pub is_admin: bool,
    pub is_active: bool,
    pub created_at: Option<String>,
    pub deactivated_at: Option<String>,
}

/// Instrument row from v_inventory_summary
#[derive(Debug, Serialize)]
pub struct InstrumentRow {
    pub id: i64,
    pub category: String,
    pub instrument_name: String,
    pub stock_quantity: i64,
    pub low_stock_threshold: i64,
    pub is_active: bool,
    pub stock_status: String,
    pub notes: Option<String>,
    pub updated_at: Option<String>,
}

/// Transaction log row from v_transaction_log
#[derive(Debug, Serialize)]
pub struct TransactionRow {
    pub id: i64,
    pub transaction_date: String,
    pub category: String,
    pub instrument_name: String,
    pub movement_type: String,
    pub quantity: i64,
    pub staff_name: Option<String>,
    pub loan_id: Option<i64>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
}

/// Unreturned loan row from v_unreturned_loans
#[derive(Debug, Serialize)]
pub struct UnreturnedLoan {
    pub loan_id: i64,
    pub staff_id: i64,
    pub staff_name: String,
    pub category: String,
    pub instrument_id: i64,
    pub instrument_name: String,
    pub quantity: i64,
    pub issued_date: String,
    pub days_outstanding: i64,
    pub notes: Option<String>,
}

/// Staff outbound history row from v_staff_outbound_history
#[derive(Debug, Serialize)]
pub struct StaffLoanHistory {
    pub staff_id: i64,
    pub staff_name: String,
    pub loan_id: i64,
    pub issued_date: String,
    pub returned_date: Option<String>,
    pub return_status: String,
    pub category: String,
    pub instrument_name: String,
    pub quantity: i64,
    pub days_held: i64,
    pub notes: Option<String>,
}

/// Instrument loan history row
#[derive(Debug, Serialize)]
pub struct InstrumentLoanHistory {
    pub loan_id: i64,
    pub staff_name: String,
    pub quantity: i64,
    pub issued_date: String,
    pub returned_date: Option<String>,
    pub return_status: String,
    pub days_held: i64,
    pub notes: Option<String>,
}

/// Aggregated loan summary per staff member (for 人員管理 table)
#[derive(Debug, Serialize)]
pub struct StaffLoanSummary {
    pub staff_id: i64,
    pub staff_name: String,
    pub total_loans: i64,
    pub returned_loans: i64,
    pub unreturned_loans: i64,
}

/// Deactivation check result — warns frontend about open loans
#[derive(Debug, Serialize)]
pub struct DeactivationCheck {
    pub can_deactivate: bool,
    pub open_loan_count: i64,
    pub open_loans: Vec<UnreturnedLoan>,
    pub message: String,
}
