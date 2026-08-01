import { useState } from 'react';
import Sender from './components/Sender';
import Receiver from './components/Receiver';
import './index.css';

function App() {
  const [mode, setMode] = useState<'home' | 'sender' | 'receiver'>('home');

  return (
    <div className="glass-panel">
      {mode === 'home' && (
        <>
          <h1>Off-Sol</h1>
          <p>Secure, fully offline Solana transfers using Animated QR.</p>
          
          <div className="mt-2">
            <button className="btn btn-primary" onClick={() => setMode('receiver')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Receive SOL (Online)
            </button>
            
            <button className="btn" onClick={() => setMode('sender')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Send SOL (Offline)
            </button>
          </div>
        </>
      )}

      {mode === 'sender' && <Sender onBack={() => setMode('home')} />}
      {mode === 'receiver' && <Receiver onBack={() => setMode('home')} />}
    </div>
  );
}

export default App;
