import { useState } from 'react';
import { WalletProvider, useWallet } from './lib/WalletContext';
import Dashboard from './components/Dashboard';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import Login from './components/Login';
import './App.css';


function AppContent() {
  const { keypair, isOnline, pendingTx } = useWallet();
  const [mode, setMode] = useState<'dashboard' | 'send' | 'receive'>('dashboard');

  if (!keypair) {
    return <Login />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Solana Wallet</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
           {pendingTx && <span className="badge badge-offline" style={{ background: '#ffa500' }}>1 Pending Tx</span>}
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
