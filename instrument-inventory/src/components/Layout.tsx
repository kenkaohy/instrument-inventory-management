import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50/50">
      <main className="flex-1 overflow-auto p-8 relative">
        <div className="max-w-7xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
