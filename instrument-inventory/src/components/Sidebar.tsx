import { PackageSearch, ArrowLeftRight, Users, Download, FlaskConical, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { StaffMember } from '../types';

export type ViewType = 'inventory' | 'transactions' | 'staff' | 'export';

interface SidebarProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  currentUser: StaffMember;
  onLogout: () => void;
}

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function Sidebar({ activeView, onChangeView, currentUser, onLogout }: SidebarProps) {
  const navItems = [
    { id: 'transactions', label: '登錄', icon: ArrowLeftRight },
    { id: 'inventory', label: '庫存總覽', icon: PackageSearch },
    { id: 'staff', label: '人員管理', icon: Users },
  ] as const;

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col shadow-sm flex-shrink-0">
      <div className="p-6 flex items-center space-x-3 text-emerald-600">
        <FlaskConical size={28} className="stroke-[1.5]" />
        <h1 className="text-xl font-bold tracking-tight text-gray-900">器械管理系統</h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 text-left font-medium",
                isActive 
                  ? "bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-500/20" 
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon size={20} className={cn(
                "transition-colors",
                isActive ? "text-emerald-600" : "text-gray-400 group-hover:text-gray-600"
              )} />
              <span>{item.label}</span>
            </button>
          );
        })}
        
        {/* Only show Database Management if user is admin */}
        {currentUser.is_admin && (
            <button
              onClick={() => onChangeView('export')}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 text-left font-medium text-amber-700 hover:bg-amber-50",
                activeView === 'export' ? "bg-amber-100 shadow-sm ring-1 ring-amber-500/20" : ""
              )}
            >
              <Download size={20} className={activeView === 'export' ? "text-amber-700" : "text-amber-600"} />
              <span>資料庫管理</span>
            </button>
        )}
      </nav>
      
      <div className="p-4 mt-auto border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-gray-900">{currentUser.name}</span>
          <span className="text-xs text-gray-500">{currentUser.is_admin ? '管理員' : (currentUser.role || '一般人員')}</span>
        </div>
        <button 
          onClick={onLogout}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="登出"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
