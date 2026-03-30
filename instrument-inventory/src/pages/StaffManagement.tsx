import { useState } from 'react';
import { useStaff } from '../hooks/useStaff';
import { Users, UserPlus, AlertTriangle, X, CheckCircle2, ShieldCheck, PowerOff, Power } from 'lucide-react';
import { createStaff, updateStaff, deactivateStaff, reactivateStaff } from '../api';

export function StaffManagement() {
  const { staff, loanSummary, loading, error, refetch } = useStaff();
  const [searchTerm, setSearchTerm] = useState('');

  // Add Staff Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleCreateStaff = async () => {
    if (!newName.trim()) return;
    
    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      await createStaff({ name: newName.trim(), role: newRole.trim() || undefined, is_admin: newIsAdmin });
      setSubmitResult({ success: true, message: '人員新增成功！' });
      setNewName('');
      setNewRole('');
      setNewIsAdmin(false);
      await refetch();
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitResult(null);
      }, 1500);
    } catch (err) {
      setSubmitResult({ success: false, message: `新增失敗: ${err}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAdmin = async (id: number, currentName: string, currentRole: string | undefined, currentAdmin: boolean) => {
    try {
      await updateStaff(id, { name: currentName, role: currentRole, is_admin: !currentAdmin });
      await refetch();
    } catch(err) {
      console.error(err);
      alert(`管理員權限切換失敗: ${err}`);
    }
  };

  const handleToggleActive = async (id: number, currentActive: boolean) => {
    try {
      if (currentActive) {
        await deactivateStaff(id);
      } else {
        await reactivateStaff(id);
      }
      await refetch();
    } catch(err) {
      console.error(err);
      alert(`狀態切換失敗: ${err}`);
    }
  };

  // Combine staff data with their loan summary
  const staffWithSummary = staff.map(s => {
    const summary = loanSummary.find(sum => sum.staff_id === s.id);
    return {
      ...s,
      summary: summary || { total_loans: 0, returned_loans: 0, unreturned_loans: 0 }
    };
  });

  const filteredStaff = staffWithSummary.filter(s => 
    s.name.includes(searchTerm) || (s.role && s.role.includes(searchTerm))
  );

  return (
    <div className="space-y-6 flex flex-col h-full w-full">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-emerald-600" /> 人員管理
          </h2>
          <p className="text-gray-500 mt-1">管理診所人員與查看個別借用紀錄</p>
        </div>
        
        <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="搜尋姓名或職稱..." 
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm w-64 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            onClick={() => { setIsModalOpen(true); setSubmitResult(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus size={16} /> 新增人員
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-12 text-center text-gray-500">載入中...</div>
        ) : error ? (
          <div className="col-span-full py-12 text-center text-red-600 bg-red-50 rounded-xl">{error}</div>
        ) : filteredStaff.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-gray-200 flex flex-col items-center">
            <Users size={40} className="text-gray-300 mb-3" />
            <p>找不到相符的人員</p>
          </div>
        ) : (
          filteredStaff.map((person) => (
            <div key={person.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col transition-all hover:shadow-md hover:border-emerald-200 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{person.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {person.role || '員工'}
                    </span>
                    {person.is_admin && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 gap-1">
                        <ShieldCheck size={12} /> 管理員
                      </span>
                    )}
                    {!person.is_active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        已停用
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <label className="flex flex-col items-center cursor-pointer group">
                    <div className="relative inline-block w-8 h-4 transition duration-200 ease-in-out rounded-full">
                      <input 
                        type="checkbox" 
                        className="peer absolute w-0 h-0 opacity-0"
                        checked={person.is_admin}
                        onChange={() => handleToggleAdmin(person.id, person.name, person.role, person.is_admin)}
                      />
                      <span className={`block w-8 h-4 rounded-full transition-colors ${person.is_admin ? 'bg-emerald-500' : 'bg-gray-200'}`}></span>
                      <span className={`absolute left-0.5 top-0.5 bg-white w-3 h-3 rounded-full transition-transform peer-checked:translate-x-4 shadow-sm`}></span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium mt-1 group-hover:text-emerald-600">管理員</span>
                  </label>
                  
                  <div className="w-px h-8 bg-gray-100 mx-1"></div>

                  <button 
                    onClick={() => handleToggleActive(person.id, person.is_active)}
                    className={`flex flex-col items-center justify-center p-1 rounded transition-colors ${
                      person.is_active ? 'text-gray-400 hover:text-red-500 hover:bg-red-50' : 'text-red-500 hover:text-emerald-500 hover:bg-emerald-50'
                    }`}
                    title={person.is_active ? "禁用" : "啟用"}
                  >
                    {person.is_active ? <PowerOff size={18} /> : <Power size={18} />}
                    <span className="text-[10px] font-medium mt-0.5">{person.is_active ? '禁用' : '啟用'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-gray-100">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1">未歸還器械</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-bold ${person.summary.unreturned_loans > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {person.summary.unreturned_loans}
                    </span>
                    {person.summary.unreturned_loans > 0 && <AlertTriangle size={14} className="text-amber-500" />}
                  </div>
                </div>
                
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 mb-1">歷史借用次數</span>
                  <span className="text-xl font-bold text-gray-700">{person.summary.total_loans}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !isSubmitting && setIsModalOpen(false)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 p-6 space-y-5 animate-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserPlus size={20} className="text-emerald-600" />
                新增人員
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)} 
                disabled={isSubmitting}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            {submitResult && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
                submitResult.success 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {submitResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {submitResult.message}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  姓名 <span className="text-red-400">*</span>
                </label>
                <input 
                  type="text" 
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="輸入人員姓名..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">職稱</label>
                <input 
                  type="text" 
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="例如: 醫師、護理師 (選填)"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={newIsAdmin}
                    onChange={(e) => setNewIsAdmin(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-gray-700">設為管理員 (可進行系統設定與導出/匯入)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button 
                onClick={handleCreateStaff}
                disabled={isSubmitting || !newName.trim()}
                className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 shadow-sm flex items-center gap-2 ${
                  isSubmitting || !newName.trim()
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-md active:scale-[0.98]'
                }`}
              >
                {isSubmitting ? '處理中...' : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
