import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import bs58 from 'bs58';

export default function Dashboard({ onSend, onReceive }: { onSend: () => void, onReceive: () => void }) {
  const { keypair, balance, nonceAccountPubKey, currentNonce, isOnline, createNonceAccount, refreshState, logout } = useWallet();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [nonceLoading, setNonceLoading] = useState(false);

  if (!keypair) return null;

  const handleCreateNonce = async () => {
    setNonceLoading(true);
    try {
      await createNonceAccount();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
    setNonceLoading(false);
  };

  return (
    <>
      <div className="win-window">
        <div className="win-titlebar">
          <div className="title-text">
            <img src="/favicon.jpg" alt="logo" style={{ width: 14, height: 14 }} />
            <span>Off-Sol Dashboard</span>
          </div>
          <div className="win-title-buttons">
            <div className="win-title-btn" onClick={() => setShowLogoutConfirm(true)} title="Close">X</div>
          </div>
        </div>
        
        <div className="win-content">
          <p><strong>Address:</strong><br /> <span style={{ fontSize: '11px', wordBreak: 'break-all' }}>{keypair.publicKey.toBase58()}</span></p>
          <p><strong>Balance:</strong> {balance} SOL</p>
          <p>
            <strong>Network:</strong>{' '}
            <span className={isOnline ? 'status-online' : 'status-offline'}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </p>

          <div style={{ borderTop: '2px solid var(--win-border-mid)', margin: '15px 0' }}></div>

          <h3>Offline Ammunition</h3>
          {nonceAccountPubKey ? (
            <div style={{ fontSize: '12px', marginBottom: '10px' }}>
              <p><strong>Nonce Account:</strong><br/>{nonceAccountPubKey.toBase58().substring(0, 15)}...</p>
              <p><strong>Current Nonce:</strong><br/>{currentNonce || 'Loading...'}</p>
              <p style={{ color: '#008000' }}>Ready for offline transfers.</p>
            </div>
          ) : (
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '12px' }}>Initialize a Durable Nonce to send SOL while offline. (Requires ~0.0014 SOL deposit).</p>
              <button className="win-btn" onClick={handleCreateNonce} disabled={!isOnline || nonceLoading}>
                {nonceLoading ? 'Initializing...' : 'Initialize Nonce'}
              </button>
            </div>
          )}

          <div style={{ borderTop: '2px solid var(--win-border-mid)', margin: '15px 0' }}></div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="win-btn" style={{ flex: 1, fontWeight: 'bold' }} onClick={onSend}>Send SOL</button>
            <button className="win-btn" style={{ flex: 1, fontWeight: 'bold' }} onClick={onReceive}>Receive SOL</button>
          </div>

          <div className="text-center mt-2">
            <button className="win-btn" onClick={() => setShowExport(!showExport)}>
              {showExport ? 'Hide Secret Key' : 'Export Secret Key'}
            </button>
            <button className="win-btn" style={{ marginLeft: '10px' }} onClick={() => setShowLogoutConfirm(true)}>
              Logout
            </button>
          </div>

          {showExport && (
            <div className="win-error-box" style={{ marginTop: '10px' }}>
              <p style={{ fontSize: '12px', margin: 0, marginBottom: '5px' }}><strong>DANGER:</strong> Never share this key!</p>
              <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '11px', background: 'white', color: 'black', padding: '5px', border: 'inset 2px' }}>
                {bs58.encode(keypair.secretKey)}
              </div>
            </div>
          )}
        </div>
      </div>

      {showLogoutConfirm && (
        <div className="win-window" style={{ position: 'absolute', top: '20%', left: '10%', right: '10%', zIndex: 100, boxShadow: '5px 5px 0px rgba(0,0,0,0.5)' }}>
          <div className="win-titlebar" style={{ background: '#000080' }}>
            <div className="title-text"><span>!</span><span>Warning</span></div>
            <div className="win-title-buttons">
              <div className="win-title-btn" onClick={() => setShowLogoutConfirm(false)}>X</div>
            </div>
          </div>
          <div className="win-content text-center">
            <h3 style={{ color: 'red' }}>CRITICAL WARNING</h3>
            <p>If you have not backed up your 12-word seed phrase or Secret Key, your funds will be <strong>lost forever</strong> upon logout.</p>
            <p>Are you sure you want to proceed?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '15px' }}>
              <button className="win-btn" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
              <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={logout}>Yes, Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
