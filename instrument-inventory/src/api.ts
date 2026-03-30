import { invoke } from '@tauri-apps/api/core';
import {
  Category, StaffMember, InstrumentRow, TransactionRow,
  UnreturnedLoan, StaffLoanHistory, StaffLoanSummary,
  DeactivationCheck, InventoryFilter, TransactionFilter,
  NewInstrument, UpdateInstrument, NewStaff, UpdateStaffPayload,
  NewTransaction, NewLoan, ReturnLoanPayload, ExportRequest, LoanFilter, InstrumentLoanHistory
} from './types';

// @ts-ignore
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── Mock Data for Browser Dev ──
const MOCK_CATEGORIES: Category[] = [
  { id: 1, name: '刀柄類' },
  { id: 2, name: '鑷子類' },
  { id: 3, name: '剪刀類' }
];

const MOCK_INVENTORY: InstrumentRow[] = [
  { id: 1, category: '刀柄類', instrument_name: '3號刀柄', stock_quantity: 15, low_stock_threshold: 5, is_active: true, stock_status: 'ok', updated_at: '2026-03-28' },
  { id: 2, category: '鑷子類', instrument_name: '無齒鑷 14cm', stock_quantity: 3, low_stock_threshold: 5, is_active: true, stock_status: 'low_stock', updated_at: '2026-03-27' },
  { id: 3, category: '剪刀類', instrument_name: '組織剪 16cm', stock_quantity: 0, low_stock_threshold: 2, is_active: true, stock_status: 'out_of_stock', updated_at: '2026-03-28' },
];

const MOCK_STAFF: StaffMember[] = [
  { id: 1, name: 'Dr. 王醫師', is_admin: true, is_active: true },
  { id: 2, name: 'Dr. 林醫師', is_admin: false, is_active: true },
  { id: 3, name: '陳護理師', is_admin: false, is_active: true },
];

const MOCK_STAFF_SUMMARY: StaffLoanSummary[] = [
  { staff_id: 1, staff_name: 'Dr. 王醫師', total_loans: 10, returned_loans: 8, unreturned_loans: 2 },
  { staff_id: 2, staff_name: 'Dr. 林醫師', total_loans: 5, returned_loans: 5, unreturned_loans: 0 },
  { staff_id: 3, staff_name: '陳護理師', total_loans: 20, returned_loans: 15, unreturned_loans: 5 },
];

const MOCK_LOANS: UnreturnedLoan[] = [
  { loan_id: 1, staff_id: 1, staff_name: 'Dr. 王醫師', category: '刀柄類', instrument_id: 1, instrument_name: '3號刀柄', quantity: 2, issued_date: '2026-03-25', days_outstanding: 4 },
  { loan_id: 2, staff_id: 3, staff_name: '陳護理師', category: '剪刀類', instrument_id: 3, instrument_name: '組織剪 16cm', quantity: 1, issued_date: '2026-03-20', days_outstanding: 9 }
];

const MOCK_TRANSACTIONS: TransactionRow[] = [
  { id: 1, transaction_date: '2026-03-25', category: '刀柄類', instrument_name: '3號刀柄', movement_type: '出庫', quantity: 2, staff_name: 'Dr. 王醫師' },
  { id: 2, transaction_date: '2026-03-26', category: '鑷子類', instrument_name: '無齒鑷 14cm', movement_type: '入庫', quantity: 5, notes: '進貨' }
];

// ── Inventory API ──
export const getInventory = async (filter: InventoryFilter = {}) => {
  if (!isTauri) return MOCK_INVENTORY;
  return invoke<InstrumentRow[]>('get_inventory', { filter });
};
export const getInstrument = (id: number) => invoke<InstrumentRow>('get_instrument', { id });
export const createInstrument = (payload: NewInstrument) => invoke<number>('create_instrument', { payload });
export const updateInstrument = (id: number, payload: UpdateInstrument) => invoke<void>('update_instrument', { id, payload });
export const deactivateInstrument = (id: number) => invoke<DeactivationCheck>('deactivate_instrument', { id });
export const reactivateInstrument = (id: number) => invoke<void>('reactivate_instrument', { id });
export const getCategories = async () => {
  if (!isTauri) return MOCK_CATEGORIES;
  return invoke<Category[]>('get_categories');
};
export const getLowStock = () => invoke<InstrumentRow[]>('get_low_stock');

// ── Staff API ──
export const getStaff = async (activeOnly?: boolean) => {
  if (!isTauri) return MOCK_STAFF;
  return invoke<StaffMember[]>('get_staff', { activeOnly });
};
export const createStaff = (payload: NewStaff) => invoke<number>('create_staff', { payload });
export const updateStaff = (id: number, payload: UpdateStaffPayload) => invoke<void>('update_staff', { id, payload });
export const deactivateStaff = (id: number) => invoke<DeactivationCheck>('deactivate_staff', { id });
export const reactivateStaff = (id: number) => invoke<void>('reactivate_staff', { id });
export const getStaffLoanSummary = async () => {
  if (!isTauri) return MOCK_STAFF_SUMMARY;
  return invoke<StaffLoanSummary[]>('get_staff_loan_summary');
};

// ── Transactions & Loans API ──
export const recordTransaction = (payload: NewTransaction) => invoke<number>('record_transaction', { payload });
export const getTransactions = async (filter: TransactionFilter = {}) => {
  if (!isTauri) return MOCK_TRANSACTIONS as TransactionRow[];
  return invoke<TransactionRow[]>('get_transactions', { filter });
};
export const issueLoan = (payload: NewLoan) => invoke<number>('issue_loan', { payload });
export const returnLoan = (payload: ReturnLoanPayload) => invoke<void>('return_loan', { payload });
export const getUnreturnedLoans = async (filter: LoanFilter = {}) => {
  if (!isTauri) return MOCK_LOANS;
  return invoke<UnreturnedLoan[]>('get_unreturned_loans', { filter });
};
export const getStaffLoanHistory = async (filter: LoanFilter = {}) => {
  if (!isTauri) return [];
  return invoke<StaffLoanHistory[]>('get_staff_loan_history', { filter });
};
export const getInstrumentLoanHistory = async (instrumentId: number) => {
  if (!isTauri) return [];
  return invoke<InstrumentLoanHistory[]>('get_instrument_loan_history', { instrument_id: instrumentId });
};

// ── Export API ──
export const exportCsv = (payload: ExportRequest) => invoke<string>('export_csv', { payload });

// ── Database API ──
export const importDatabase = (sourcePath: string) => invoke<void>('import_database', { source_path: sourcePath });
