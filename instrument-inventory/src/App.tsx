import { useState } from 'react';
import { Sidebar, ViewType } from './components/Sidebar';
import { Layout } from './components/Layout';
import { InventoryGrid } from './pages/InventoryGrid';
import { Transactions } from './pages/Transactions';
import { StaffManagement } from './pages/StaffManagement';
import { ExportPage } from './pages/ExportPage';
import { LoginScreen } from './components/LoginScreen';
import { StaffMember } from './types';

function App() {
  const [currentUser, setCurrentUser] = useState<StaffMember | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('transactions');

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 font-sans overflow-hidden">
      <Sidebar 
        activeView={activeView} 
        onChangeView={setActiveView} 
        currentUser={currentUser}
        onLogout={() => {
          setCurrentUser(null);
          setActiveView('transactions');
        }}
      />
      
      <Layout>
        {activeView === 'inventory' && <InventoryGrid />}
        {activeView === 'transactions' && <Transactions currentUser={currentUser} />}
        {activeView === 'staff' && <StaffManagement />}
        {activeView === 'export' && <ExportPage />}
      </Layout>
    </div>
  );
}

export default App;
