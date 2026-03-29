// types.ts: TypeScript reflections of Rust models defined in src-tauri/src/models.rs

// ── Shared Models ─────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  name_en?: string;
}

export interface StaffMember {
  id: number;
  name: string;
  role?: string;
  is_active: boolean;
  created_at?: string;
  deactivated_at?: string;
}

export interface InstrumentRow {
  id: number;
  category: string;
  instrument_name: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
  stock_status: 'ok' | 'low_stock' | 'out_of_stock' | 'inactive';
  notes?: string;
  updated_at?: string;
}

export interface TransactionRow {
  id: number;
  transaction_date: string;
  category: string;
  instrument_name: string;
  movement_type: '入庫' | '出庫';
  quantity: number;
  staff_name?: string;
  loan_id?: number;
  notes?: string;
  created_at?: string;
}

export interface UnreturnedLoan {
  loan_id: number;
  staff_id: number;
  staff_name: string;
  category: string;
  instrument_id: number;
  instrument_name: string;
  quantity: number;
  issued_date: string;
  days_outstanding: number;
  notes?: string;
}

export interface StaffLoanHistory {
  staff_id: number;
  staff_name: string;
  loan_id: number;
  issued_date: string;
  returned_date?: string;
  return_status: '未歸還' | '已歸還';
  category: string;
  instrument_name: string;
  quantity: number;
  days_held: number;
  notes?: string;
}

export interface StaffLoanSummary {
  staff_id: number;
  staff_name: string;
  total_loans: number;
  returned_loans: number;
  unreturned_loans: number;
}

export interface DeactivationCheck {
  can_deactivate: boolean;
  open_loan_count: number;
  open_loans: UnreturnedLoan[];
  message: string;
}

// ── Request Filters & Payloads ─────────────────────────────────────────────

export interface InventoryFilter {
  category?: string;
  search?: string;
  stock_status?: string;
  active_only?: boolean;
}

export interface TransactionFilter {
  instrument_id?: number;
  staff_id?: number;
  start_date?: string; // "YYYY-MM-DD"
  end_date?: string;   // "YYYY-MM-DD"
  movement_type?: string;
}

export interface LoanFilter {
  staff_id?: number;
  start_date?: string;
  end_date?: string;
}

export interface NewInstrument {
  category_id: number;
  name: string;
  stock_quantity?: number;
  low_stock_threshold?: number;
  notes?: string;
}

export interface UpdateInstrument {
  category_id?: number;
  name?: string;
  low_stock_threshold?: number;
  notes?: string;
}

export interface NewStaff {
  name: string;
  role?: string;
}

export interface UpdateStaffPayload {
  name?: string;
  role?: string;
}

export interface NewTransaction {
  instrument_id: number;
  movement_type: '入庫' | '出庫';
  quantity: number;
  staff_id?: number;
  transaction_date?: string; // "YYYY-MM-DD"
  notes?: string;
}

export interface NewLoan {
  instrument_id: number;
  staff_id: number;
  quantity: number;
  date?: string; // "YYYY-MM-DD"
  notes?: string;
}

export interface ReturnLoanPayload {
  loan_id: number;
  staff_id: number;
  return_date?: string; // "YYYY-MM-DD"
  notes?: string;
}

export interface ExportRequest {
  export_type: 'inventory' | 'transactions' | 'low_stock' | 'unreturned_loans' | 'staff_history';
  dest_path: string;
  staff_id?: number;
  start_date?: string;
  end_date?: string;
}
