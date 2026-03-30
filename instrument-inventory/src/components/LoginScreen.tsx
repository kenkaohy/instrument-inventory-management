import { useState, useEffect } from 'react';
import { StaffMember } from '../types';
import { getStaff } from '../api';
import { FlaskConical, User } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: StaffMember) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getStaff(true);
        setStaff(data);
      } catch (e) {
        console.error("Failed to load staff for login", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
        <div className="flex flex-col items-center mb-8 text-emerald-600">
          <FlaskConical size={48} className="stroke-[1.5] mb-4" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">器械管理系統</h1>
          <p className="text-gray-500 text-sm mt-2">請選擇您的身分登入</p>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-8">載入人員名單...</div>
        ) : staff.length === 0 ? (
          <div className="text-center text-red-500 py-8">
            目前沒有可用的人員帳號，請聯絡管理員新增。
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {staff.map((user) => (
              <button
                key={user.id}
                onClick={() => onLogin(user)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-sm hover:bg-emerald-50 transition-all text-left bg-white group"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                  <User size={20} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{user.name}</h3>
                  {user.role && <p className="text-xs text-gray-500">{user.role}</p>}
                </div>
                {user.is_admin && (
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">
                    管理員
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
