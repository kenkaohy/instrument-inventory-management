import React, { useState, useEffect } from 'react';
import { useInventory } from '../hooks/useInventory';
import { PackageSearch, Search, Filter, ChevronDown, ChevronRight, Clock, AlertCircle } from 'lucide-react';
import { InstrumentLoanHistory } from '../types';
import { getInstrumentLoanHistory } from '../api';

export function InventoryGrid() {
  const { items, categories, loading, error, refetch } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleRowClick = (id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const handleSearch = () => {
    refetch({
      search: searchTerm || undefined,
      category: selectedCategory || undefined,
      active_only: true
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ok':
        return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">正常</span>;
      case 'low_stock':
        return <span className="px-2 py-1 rounded-full bg-warning/20 text-warning-700 text-xs font-medium">低庫存</span>;
      case 'out_of_stock':
        return <span className="px-2 py-1 rounded-full bg-danger/20 text-danger-700 text-xs font-medium">缺貨</span>;
      case 'inactive':
        return <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">停用</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <PackageSearch className="text-emerald-600" /> 庫存總覽
          </h2>
          <p className="text-gray-500 mt-1">查看所有器械的庫存狀態與數量</p>
        </div>
        
        <div className="flex gap-4">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select 
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">所有類別</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="搜尋器械名稱..." 
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          
          <button 
            onClick={handleSearch}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            搜尋
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {error && <div className="p-4 bg-danger/10 text-danger-700">{error}</div>}
        
        <table className="min-w-full divide-y divide-gray-200 text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-medium">
            <tr>
              <th className="px-6 py-4">類別</th>
              <th className="px-6 py-4">器械名稱</th>
              <th className="px-6 py-4">目前庫存</th>
              <th className="px-6 py-4">低庫存門檻</th>
              <th className="px-6 py-4">狀態</th>
              <th className="px-6 py-4 text-right">上次更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">載入中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">找不到相符的器械</td></tr>
            ) : (
              items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr 
                    className={`transition-colors cursor-pointer ${expandedId === item.id ? 'bg-emerald-50/50' : 'hover:bg-gray-50'}`}
                    onClick={() => handleRowClick(item.id)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button className="text-gray-400 hover:text-emerald-600 transition-colors focus:outline-none">
                          {expandedId === item.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        <span className="text-gray-600">{item.category}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">{item.instrument_name}</td>
                    <td className="px-6 py-4">
                      <span className={`text-lg font-bold ${item.stock_quantity === 0 ? 'text-red-600' : item.stock_quantity <= item.low_stock_threshold ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {item.stock_quantity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{item.low_stock_threshold}</td>
                    <td className="px-6 py-4">{getStatusBadge(item.stock_status)}</td>
                    <td className="px-6 py-4 text-right text-gray-400 text-xs">{item.updated_at}</td>
                  </tr>
                  {expandedId === item.id && (
                    <tr>
                      <td colSpan={6} className="px-0 py-0 border-b-0">
                        <ExpandedHistoryPanel instrumentId={item.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
        
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center text-sm text-gray-500">
          <span>共顯示 {items.length} 筆資料</span>
        </div>
      </div>
    </div>
  );
}

// Sub-component for the expanded history panel
function ExpandedHistoryPanel({ instrumentId }: { instrumentId: number }) {
  const [history, setHistory] = useState<InstrumentLoanHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchHistory() {
      try {
        setLoading(true);
        const data = await getInstrumentLoanHistory(instrumentId);
        if (active) setHistory(data);
      } catch (e) {
        console.error("Failed to load history", e);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchHistory();
    return () => { active = false; };
  }, [instrumentId]);

  return (
    <div className="bg-gray-50/80 px-12 py-6 border-b border-emerald-100/50 shadow-inner">
      <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
        <Clock size={16} className="text-emerald-600" />
        借用歷史紀錄
      </h4>
      {loading ? (
        <div className="text-sm text-gray-500 py-4 flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-emerald-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          載入中...
        </div>
      ) : history.length === 0 ? (
        <div className="text-sm text-gray-500 py-4 flex items-center gap-2">
          <AlertCircle size={16} className="text-gray-400" />
          無借用紀錄
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 font-medium text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">借用人</th>
                <th className="px-4 py-2.5 text-left">數量</th>
                <th className="px-4 py-2.5 text-left">借出日期</th>
                <th className="px-4 py-2.5 text-left">狀態</th>
                <th className="px-4 py-2.5 text-left">歸還日期</th>
                <th className="px-4 py-2.5 text-left">天數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map((record) => (
                <tr key={record.loan_id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{record.staff_name}</td>
                  <td className="px-4 py-3 text-gray-600 font-bold">{record.quantity}</td>
                  <td className="px-4 py-3 text-gray-500">{record.issued_date}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                      record.return_status === '未歸還' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {record.return_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{record.returned_date || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${record.days_held >= 14 && record.return_status === '未歸還' ? 'text-red-600' : 'text-gray-600'}`}>
                      {record.days_held}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
