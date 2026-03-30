import { useState, useCallback } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useStaff } from '../hooks/useStaff';
import { useInventory } from '../hooks/useInventory';
import { issueLoan, returnLoan } from '../api';
import { ArrowLeftRight, CornerDownRight, CornerUpLeft, Clock, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { StaffMember, UnreturnedLoan } from '../types';

interface TransactionsProps {
  currentUser: StaffMember;
}

export function Transactions({ currentUser }: TransactionsProps) {
  const { unreturnedLoans, transactions, loading, refreshAll } = useTransactions();
  const { staff } = useStaff();
  const { items: inventory, refetch: refetchInventory } = useInventory();
  
  const [activeTab, setActiveTab] = useState<'issue' | 'return' | 'history'>('issue');

  // ── Issue Loan Form State ──
  const [issueStaffId, setIssueStaffId] = useState<number | ''>(currentUser.id);
  const [issueInstrumentId, setIssueInstrumentId] = useState<number | ''>('');
  const [issueQuantity, setIssueQuantity] = useState(1);
  const [issueNotes, setIssueNotes] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueResult, setIssueResult] = useState<{ success: boolean; message: string } | null>(null);

  // ── Return Loan Modal State ──
  const [returnModalLoan, setReturnModalLoan] = useState<UnreturnedLoan | null>(null);
  const [returnStaffId, setReturnStaffId] = useState<number | ''>('');
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Get selected instrument details for stock display
  const selectedInstrument = issueInstrumentId ? inventory.find(i => i.id === issueInstrumentId) : null;

  const handleIssueLoan = useCallback(async () => {
    if (!issueStaffId || !issueInstrumentId || issueQuantity < 1) return;
    
    setIssueSubmitting(true);
    setIssueResult(null);
    try {
      await issueLoan({
        instrument_id: issueInstrumentId as number,
        staff_id: issueStaffId as number,
        quantity: issueQuantity,
        date: issueDate,
        notes: issueNotes || undefined,
      });
      setIssueResult({ success: true, message: '借出登錄成功！' });
      // Reset form
      setIssueStaffId(currentUser.id);
      setIssueInstrumentId('');
      setIssueQuantity(1);
      setIssueNotes('');
      // Refresh data
      await Promise.all([refreshAll(), refetchInventory({ active_only: true })]);
    } catch (err) {
      setIssueResult({ success: false, message: String(err) });
    } finally {
      setIssueSubmitting(false);
    }
  }, [issueStaffId, issueInstrumentId, issueQuantity, issueDate, issueNotes, refreshAll, refetchInventory]);

  const handleReturnLoan = useCallback(async () => {
    if (!returnModalLoan || !returnStaffId) return;

    setReturnSubmitting(true);
    try {
      await returnLoan({
        loan_id: returnModalLoan.loan_id,
        staff_id: returnStaffId as number,
        return_date: returnDate,
        notes: returnNotes || undefined,
      });
      setReturnModalLoan(null);
      setReturnNotes('');
      // Refresh data
      await Promise.all([refreshAll(), refetchInventory({ active_only: true })]);
    } catch (err) {
      alert(`歸還失敗: ${err}`);
    } finally {
      setReturnSubmitting(false);
    }
  }, [returnModalLoan, returnStaffId, returnDate, returnNotes, refreshAll, refetchInventory]);

  const openReturnModal = (loan: UnreturnedLoan) => {
    setReturnModalLoan(loan);
    setReturnStaffId(currentUser.id);
    setReturnDate(new Date().toISOString().split('T')[0]);
    setReturnNotes('');
  };

  const getDaysColor = (days: number) => {
    if (days >= 14) return 'bg-red-100 text-red-700';
    if (days >= 7) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const overdueCount = unreturnedLoans.filter(l => l.days_outstanding >= 14).length;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ArrowLeftRight className="text-emerald-600" /> 登錄
            </h2>
            <p className="text-gray-500 mt-1">處理器械的借出與歸還紀錄</p>
          </div>
        </div>
        
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setActiveTab('issue'); setIssueResult(null); }}
            className={`px-8 py-3 font-medium text-sm flex items-center justify-center gap-2 transition-colors border-b-2 flex-1 sm:flex-none ${
              activeTab === 'issue' ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CornerDownRight size={16} /> 借出
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={`px-8 py-3 font-medium text-sm flex items-center justify-center gap-2 transition-colors border-b-2 flex-1 sm:flex-none ${
              activeTab === 'return' ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <CornerUpLeft size={16} /> 歸還
            {unreturnedLoans.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 font-semibold">
                {unreturnedLoans.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-8 py-3 font-medium text-sm flex items-center justify-center gap-2 transition-colors border-b-2 flex-1 sm:flex-none ${
              activeTab === 'history' ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Clock size={16} /> 歷史紀錄
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
        {loading && <div className="p-12 text-center text-gray-500">載入中...</div>}
        
        {/* ─── Tab: Return Loans (Unreturned) ─── */}
        {!loading && activeTab === 'return' && (
          <>
            {overdueCount > 0 && (
              <div className="px-6 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2 text-sm text-red-700 font-medium">
                <AlertTriangle size={16} /> 
                超過14天未歸還: {overdueCount} 件
              </div>
            )}
            <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-4">借用人</th>
                  <th className="px-6 py-4">器械名稱</th>
                  <th className="px-6 py-4">借出數量</th>
                  <th className="px-6 py-4">借出日期</th>
                  <th className="px-6 py-4">未還天數</th>
                  <th className="px-6 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {unreturnedLoans.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-400" />
                    目前沒有待歸還的器械
                  </td></tr>
                ) : (
                  unreturnedLoans.map(loan => (
                    <tr key={loan.loan_id} className={`hover:bg-gray-50 transition-colors ${loan.days_outstanding >= 14 ? 'bg-red-50/30' : ''}`}>
                      <td className="px-6 py-4 font-medium text-gray-900">{loan.staff_name}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-gray-900">{loan.instrument_name}</span>
                          <span className="text-xs text-gray-500">{loan.category}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-gray-700">{loan.quantity}</td>
                      <td className="px-6 py-4 text-gray-600">{loan.issued_date}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDaysColor(loan.days_outstanding)}`}>
                          {loan.days_outstanding} 天
                          {loan.days_outstanding >= 14 && ' 🔴'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => openReturnModal(loan)}
                          className="px-4 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-xs font-medium transition-all duration-200 hover:shadow-sm active:scale-95"
                        >
                          歸還
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {unreturnedLoans.length > 0 && (
              <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 text-sm text-gray-500">
                共 {unreturnedLoans.length} 筆待歸還
              </div>
            )}
          </>
        )}

        {/* ─── Tab: Issue Loan Form ─── */}
        {!loading && activeTab === 'issue' && (
          <div className="p-8 max-w-2xl mx-auto">
            <div className="space-y-6">
              {/* Success / Error Message */}
              {issueResult && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                  issueResult.success 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {issueResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  {issueResult.message}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">借用人 <span className="text-red-400">*</span></label>
                <select 
                  value={issueStaffId}
                  onChange={(e) => setIssueStaffId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="">選擇借用人...</option>
                  {staff.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name} {s.role ? `(${s.role})` : ''}</option>
                  ))}
                </select>
                {/* Show unreturned warning for selected staff */}
                {issueStaffId && (() => {
                  const staffLoans = unreturnedLoans.filter(l => l.staff_id === issueStaffId);
                  if (staffLoans.length > 0) {
                    return (
                      <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        此人員目前仍有 {staffLoans.length} 件未歸還器械
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">器械 <span className="text-red-400">*</span></label>
                <select 
                  value={issueInstrumentId}
                  onChange={(e) => setIssueInstrumentId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="">選擇器械...</option>
                  {inventory.filter(i => i.is_active && i.stock_quantity > 0).map(i => (
                    <option key={i.id} value={i.id}>{i.instrument_name} (剩餘: {i.stock_quantity}) - {i.category}</option>
                  ))}
                </select>
                {selectedInstrument && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    目前庫存: <span className={`font-semibold ${selectedInstrument.stock_quantity <= selectedInstrument.low_stock_threshold ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {selectedInstrument.stock_quantity}
                    </span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">借出數量 <span className="text-red-400">*</span></label>
                  <input 
                    type="number" 
                    min="1" 
                    max={selectedInstrument?.stock_quantity || 999}
                    value={issueQuantity}
                    onChange={(e) => setIssueQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">借出日期</label>
                  <input 
                    type="date" 
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">備註</label>
                <input 
                  type="text" 
                  placeholder="選填" 
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm" 
                />
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setIssueStaffId(currentUser.id);
                    setIssueInstrumentId('');
                    setIssueQuantity(1);
                    setIssueNotes('');
                    setIssueResult(null);
                  }}
                  className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                >
                  清除
                </button>
                <button 
                  onClick={handleIssueLoan}
                  disabled={issueSubmitting || !issueStaffId || !issueInstrumentId || issueQuantity < 1}
                  className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm flex items-center gap-2 ${
                    issueSubmitting || !issueStaffId || !issueInstrumentId
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-[0.98]'
                  }`}
                >
                  {issueSubmitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      處理中...
                    </>
                  ) : (
                    '確認借出'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Tab: Transaction History ─── */}
        {!loading && activeTab === 'history' && (
          <>
            <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="px-6 py-4">日期</th>
                  <th className="px-6 py-4">器械名稱</th>
                  <th className="px-6 py-4">動作</th>
                  <th className="px-6 py-4">數量</th>
                  <th className="px-6 py-4">相關人員</th>
                  <th className="px-6 py-4">備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {transactions.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">目前沒有歷史紀錄</td></tr>
                ) : (
                  transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-gray-600">{tx.transaction_date}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{tx.instrument_name}</span>
                          <span className="text-xs text-gray-500">{tx.category}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${tx.movement_type === '入庫' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                          {tx.movement_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${tx.movement_type === '出庫' ? 'text-blue-600' : 'text-emerald-600'}`}>
                          {tx.movement_type === '出庫' ? '-' : '+'}{tx.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{tx.staff_name || '-'}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{tx.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {transactions.length > 0 && (
              <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 text-sm text-gray-500">
                共 {transactions.length} 筆紀錄
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Return Loan Modal ─── */}
      {returnModalLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setReturnModalLoan(null)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6 space-y-5 animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">確認歸還</h3>
              <button onClick={() => setReturnModalLoan(null)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="space-y-3 bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">借用人</span>
                <span className="font-medium text-gray-900">{returnModalLoan.staff_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">器械</span>
                <span className="font-medium text-gray-900">{returnModalLoan.instrument_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">數量</span>
                <span className="font-medium text-gray-900">{returnModalLoan.quantity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">借出日期</span>
                <span className="font-medium text-gray-900">{returnModalLoan.issued_date}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">已借天數</span>
                <span className={`font-semibold ${returnModalLoan.days_outstanding >= 14 ? 'text-red-600' : returnModalLoan.days_outstanding >= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {returnModalLoan.days_outstanding} 天
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">歸還日期</label>
                <input 
                  type="date" 
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">登記人</label>
                <select
                  value={returnStaffId}
                  onChange={(e) => setReturnStaffId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                >
                  <option value="">選擇登記人...</option>
                  {staff.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">備註</label>
                <input 
                  type="text" 
                  placeholder="選填" 
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={() => setReturnModalLoan(null)}
                className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleReturnLoan}
                disabled={returnSubmitting || !returnStaffId}
                className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm flex items-center gap-2 ${
                  returnSubmitting || !returnStaffId
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-[0.98]'
                }`}
              >
                {returnSubmitting ? '處理中...' : '確認歸還'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
