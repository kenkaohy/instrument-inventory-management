import { useState } from 'react';
import { Sidebar, ViewType } from './components/Sidebar';
import { Layout } from './components/Layout';
import { InventoryGrid } from './pages/InventoryGrid';
import { Transactions } from './pages/Transactions';
import { StaffManagement } from './pages/StaffManagement';
import { ExportPage } from './pages/ExportPage';

function App() {
  const [activeView, setActiveView] = useState<ViewType>('inventory');

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <Sidebar activeView={activeView} onChangeView={setActiveView} />
      
      <Layout>
        {activeView === 'inventory' && <InventoryGrid />}
        {activeView === 'transactions' && <Transactions />}
        {activeView === 'staff' && <StaffManagement />}
        {activeView === 'export' && <ExportPage />}
      </Layout>
    </div>
  );
}

export default App;
