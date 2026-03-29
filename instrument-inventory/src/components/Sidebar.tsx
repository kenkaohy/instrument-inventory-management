import { PackageSearch, ArrowLeftRight, Users, Download, FlaskConical } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type ViewType = 'inventory' | 'transactions' | 'staff' | 'export';

interface SidebarProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
}

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function Sidebar({ activeView, onChangeView }: SidebarProps) {
  const navItems = [
    { id: 'inventory', label: '庫存總覽', icon: PackageSearch },
    { id: 'transactions', label: '出入庫 / 借還管理', icon: ArrowLeftRight },
    { id: 'staff', label: '人員管理', icon: Users },
    { id: 'export', label: '報表匯出', icon: Download },
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
      </nav>
      
      <div className="p-4 m-4 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-500 text-center">
        v0.1.0 Offline Mode
      </div>
    </div>
  );
}
