import { useState } from 'react';
import { WalletProvider, useWallet } from './lib/WalletContext';
import Dashboard from './components/Dashboard';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import Login from './components/Login';
import Unlock from './components/Unlock';
import './App.css';


function AppContent() {
  const { keypair, isOnline, pendingTxs, vaultExists, needsMigration } = useWallet();
  const [mode, setMode] = useState<'dashboard' | 'send' | 'receive'>('dashboard');

  if (!keypair) {
    if (needsMigration) return <Unlock migrate />;
    if (vaultExists) return <Unlock migrate={false} />;
    return <Login />;
  }

  return (
    <div className="app-container">
      <header className="app-header" style={{ padding: '10px', display: 'flex', justifyContent: 'flex-end', position: 'absolute', top: 0, right: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
           {pendingTxs.length > 0 && <span className="badge badge-offline" style={{ background: '#ffa500' }}>{pendingTxs.length} Pending Tx</span>}
           <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
             {isOnline ? 'Online' : 'Offline'}
           </span>
        </div>
      </header>
      
      <main className="app-main">
        {mode === 'dashboard' && <Dashboard onSend={() => setMode('send')} onReceive={() => setMode('receive')} />}
        {mode === 'send' && <Sender onBack={() => setMode('dashboard')} />}
        {mode === 'receive' && <Receiver onBack={() => setMode('dashboard')} />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}
