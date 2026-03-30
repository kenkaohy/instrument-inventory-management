import { useState } from 'react';
import { Download, FileSpreadsheet, AlertTriangle, Package, Clock, Users, CheckCircle2, Database, Upload } from 'lucide-react';
import { exportCsv, importDatabase } from '../api';
import { useStaff } from '../hooks/useStaff';
import { ExportRequest } from '../types';

// @ts-ignore
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type ExportType = 'inventory' | 'transactions' | 'low_stock' | 'unreturned_loans' | 'staff_history';

interface ExportOption {
  id: ExportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  needsStaff?: boolean;
  needsDates?: boolean;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'inventory',
    label: '庫存總覽',
    description: '匯出所有器械的完整庫存快照，含類別、數量與狀態',
    icon: <Package size={22} className="text-emerald-500" />,
  },
  {
    id: 'transactions',
    label: '出入庫紀錄',
    description: '匯出完整的出入庫交易紀錄，可依日期範圍篩選',
    icon: <Clock size={22} className="text-blue-500" />,
    needsDates: true,
  },
  {
    id: 'low_stock',
    label: '低庫存 / 缺貨清單',
    description: '僅匯出庫存不足或已缺貨的器械項目',
    icon: <AlertTriangle size={22} className="text-amber-500" />,
  },
  {
    id: 'unreturned_loans',
    label: '未歸還器械',
    description: '匯出所有目前尚未歸還的借用記錄',
    icon: <FileSpreadsheet size={22} className="text-red-500" />,
  },
  {
    id: 'staff_history',
    label: '人員借用歷史',
    description: '匯出指定人員的完整借用歷史（含已歸還）',
    icon: <Users size={22} className="text-violet-500" />,
    needsStaff: true,
  },
];

export function ExportPage() {
  const { staff } = useStaff();
  const [selectedType, setSelectedType] = useState<ExportType>('inventory');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<number | undefined>();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedOption = EXPORT_OPTIONS.find(o => o.id === selectedType)!;

  const handleExport = async () => {
    setExporting(true);
    setResult(null);

    try {
      if (!isTauri) {
        // Browser mock — simulate success after delay
        await new Promise(r => setTimeout(r, 1000));
        setResult({ success: true, message: '已匯出 203 筆（瀏覽器模擬模式）' });
        setExporting(false);
        return;
      }

      // Use Tauri dialog to pick save location
      const { save } = await import('@tauri-apps/plugin-dialog');
      const destPath = await save({
        defaultPath: getDefaultFileName(selectedType),
        filters: [{ name: 'CSV 檔案', extensions: ['csv'] }],
      });

      if (!destPath) {
        setExporting(false);
        return; // User cancelled
      }

      const payload: ExportRequest = {
        export_type: selectedType,
        dest_path: destPath,
      };

      if (selectedOption.needsDates) {
        if (startDate) payload.start_date = startDate;
        if (endDate) payload.end_date = endDate;
      }

      if (selectedOption.needsStaff && selectedStaffId) {
        payload.staff_id = selectedStaffId;
      }

      const msg = await exportCsv(payload);
      setResult({ success: true, message: msg });
    } catch (err) {
      setResult({ success: false, message: String(err) });
    } finally {
      setExporting(false);
    }
  };

  const canExport = () => {
    if (selectedOption.needsStaff && !selectedStaffId) return false;
    return true;
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);

    try {
      if (!isTauri) {
        await new Promise(r => setTimeout(r, 1000));
        setImportResult({ success: true, message: '已匯入資料庫（瀏覽器模擬模式）' });
        setImporting(false);
        return;
      }

      const { open } = await import('@tauri-apps/plugin-dialog');
      const sourcePath = await open({
        multiple: false,
        filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
      });

      if (!sourcePath || typeof sourcePath !== 'string') {
        setImporting(false);
        return; // User cancelled
      }

      const confirmed = window.confirm('警告：匯入資料庫將會完全覆蓋目前的資料！\n在執行前請確認您已備份目前的資料。\n確定要繼續嗎？');
      if (!confirmed) {
        setImporting(false);
        return;
      }

      await importDatabase(sourcePath);
      setImportResult({ success: true, message: '資料庫匯入成功！系統將在3秒後重新載入。' });
      
      // Reload application to reflect new database
      setTimeout(() => {
        window.location.reload();
      }, 3000);

    } catch (err) {
      setImportResult({ success: false, message: `匯入失敗: ${err}` });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Database className="text-emerald-600" /> 資料庫管理
        </h2>
        <p className="text-gray-500">在此匯出系統紀錄的報表，以及管理系統資料庫備份與還原。</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Download size={20} className="text-gray-600" />
        <h3 className="text-lg font-semibold text-gray-900">報表匯出</h3>
      </div>

      {/* Export Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXPORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            onClick={() => {
              setSelectedType(option.id);
              setResult(null);
            }}
            className={`
              relative p-5 rounded-xl border-2 text-left transition-all duration-200 group
              ${selectedType === option.id
                ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500/20'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }
            `}
          >
            {selectedType === option.id && (
              <div className="absolute top-3 right-3">
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={`
                p-2.5 rounded-lg transition-colors
                ${selectedType === option.id ? 'bg-emerald-100' : 'bg-gray-100 group-hover:bg-gray-200'}
              `}>
                {option.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-sm ${selectedType === option.id ? 'text-emerald-700' : 'text-gray-900'}`}>
                  {option.label}
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">{option.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Options Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
        <h3 className="text-lg font-semibold text-gray-900">匯出設定</h3>

        {/* Date Range Filter (only for transactions) */}
        {selectedOption.needsDates && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">起始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                placeholder="不限"
              />
              <p className="text-xs text-gray-400 mt-1">留空表示不限制起始日期</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">結束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                placeholder="不限"
              />
              <p className="text-xs text-gray-400 mt-1">留空表示不限制結束日期</p>
            </div>
          </div>
        )}

        {/* Staff Selector (only for staff_history) */}
        {selectedOption.needsStaff && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">選擇人員</label>
            <select
              value={selectedStaffId || ''}
              onChange={(e) => setSelectedStaffId(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
            >
              <option value="">-- 請選擇人員 --</option>
              {staff.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.role ? `(${s.role})` : ''}</option>
              ))}
            </select>
            {!selectedStaffId && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertTriangle size={12} /> 必須選擇人員才能匯出
              </p>
            )}
          </div>
        )}

        {/* No additional options */}
        {!selectedOption.needsDates && !selectedOption.needsStaff && (
          <p className="text-sm text-gray-500 py-2">此匯出類型無需額外設定，直接點擊下方按鈕即可匯出。</p>
        )}

        {/* Export Button */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex-1">
            {result && (
              <div className={`flex items-center gap-2 text-sm font-medium ${result.success ? 'text-emerald-600' : 'text-red-600'}`}>
                {result.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {result.message}
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            disabled={exporting || !canExport()}
            className={`
              flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm
              ${exporting || !canExport()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-[0.98]'
              }
            `}
          >
            {exporting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                匯出中...
              </>
            ) : (
              <>
                <Download size={16} /> 匯出 CSV
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 space-y-5">
        <h3 className="text-lg font-semibold text-red-700 flex items-center gap-2 border-b border-red-100 pb-4">
          <Upload size={20} className="text-red-600" /> 匯入資料庫 (管理員功能)
        </h3>
        
        <div className="bg-red-50 rounded-lg p-4 border border-red-100 flex items-start gap-3">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-red-800 space-y-1">
            <p className="font-semibold">危險操作警告</p>
            <p>匯入新的資料庫檔案將會 <span className="font-bold underline">完全覆蓋並刪除目前的系統資料</span>。</p>
            <p>請確認匯入的檔案是本系統所產生的 SQLite (.db) 備份檔，並且在執行前確認目前資料已安全備份。</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex-1">
            {importResult && (
              <div className={`flex items-center gap-2 text-sm font-medium ${importResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                {importResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {importResult.message}
              </div>
            )}
          </div>
          <button
            onClick={handleImport}
            disabled={importing}
            className={`
              flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm
              ${importing
                ? 'bg-red-200 text-red-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white hover:shadow-md active:scale-[0.98]'
              }
            `}
          >
            {importing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                處理中...
              </>
            ) : (
              <>
                <Upload size={16} /> 匯入 SQLite 資料庫
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function getDefaultFileName(type: ExportType): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const labels: Record<ExportType, string> = {
    inventory: '庫存總覽',
    transactions: '出入庫紀錄',
    low_stock: '低庫存清單',
    unreturned_loans: '未歸還器械',
    staff_history: '人員借用歷史',
  };
  return `${labels[type]}_${dateStr}.csv`;
}
