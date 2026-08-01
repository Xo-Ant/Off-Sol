import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import bs58 from 'bs58';
import PixelLogo from './PixelLogo';

export default function Dashboard({ onSend, onReceive }: { onSend: () => void, onReceive: () => void }) {
  const { keypair, balance, nonceAccountPubKey, currentNonce, isOnline, createNonceAccount, logout, mnemonic } = useWallet();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSecurityPrompt, setShowSecurityPrompt] = useState(false);
  const [securityInput, setSecurityInput] = useState('');
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

  const handleExportClick = () => {
    if (showExport) {
      setShowExport(false);
    } else {
      setSecurityInput('');
      setShowSecurityPrompt(true);
    }
  };

  const handleSecurityConfirm = () => {
    if (securityInput.trim().toUpperCase() === 'EXPORT') {
      setShowSecurityPrompt(false);
      setShowExport(true);
    } else {
      alert('Incorrect security word.');
    }
  };

  return (
    <>
      <div className="screen-container">
        <div className="media-pane">
          <PixelLogo />
        </div>
        
        <div className="controls-pane">
          <p><strong>Address:</strong><br /> <span style={{ fontSize: '12px', wordBreak: 'break-all' }}>{keypair.publicKey.toBase58()}</span></p>
          <p><strong>Balance:</strong> {balance} SOL</p>

          <div style={{ borderTop: '2px solid var(--pixel-border)', margin: '15px 0' }}></div>

          <h3>Offline Ammunition</h3>
          {nonceAccountPubKey ? (
            <div style={{ fontSize: '14px', marginBottom: '15px' }}>
              <p><strong>Nonce Account:</strong><br/>{nonceAccountPubKey.toBase58().substring(0, 15)}...</p>
              <p><strong>Current Nonce:</strong><br/>{currentNonce || 'Loading...'}</p>
              <p style={{ color: '#00cc00' }}>Ready for offline transfers.</p>
            </div>
          ) : (
            <div style={{ marginBottom: '15px' }}>
              <p style={{ fontSize: '14px' }}>Initialize a Durable Nonce to send SOL while offline. (Requires ~0.0014 SOL deposit).</p>
              <button className="win-btn" onClick={handleCreateNonce} disabled={!isOnline || nonceLoading} style={{ width: '100%' }}>
                {nonceLoading ? 'Initializing...' : 'Initialize Nonce'}
              </button>
            </div>
          )}

          <div style={{ borderTop: '2px solid var(--pixel-border)', margin: '15px 0' }}></div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="win-btn" style={{ flex: 1, backgroundColor: '#00aa00' }} onClick={onSend}>Send</button>
            <button className="win-btn" style={{ flex: 1, backgroundColor: '#aa0000' }} onClick={onReceive}>Receive</button>
          </div>

          <div className="text-center mt-2">
            <button className="win-btn" onClick={handleExportClick} style={{ width: '100%' }}>
              {showExport ? 'Hide Keys & Mnemonic' : 'Export Keys & Mnemonic'}
            </button>
            <button className="win-btn" onClick={() => setShowLogoutConfirm(true)} style={{ width: '100%', marginTop: '10px' }}>
              Logout
            </button>
          </div>

          {showExport && (
            <div className="win-error-box" style={{ marginTop: '15px' }}>
              <p style={{ fontSize: '14px', margin: 0, marginBottom: '5px' }}><strong>DANGER:</strong> Never share these!</p>
              
              {mnemonic ? (
                <div style={{ marginBottom: '10px' }}>
                  <strong>12-Word Mnemonic (Seed Phrase):</strong>
                  <div style={{ wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '14px', background: 'white', color: 'black', padding: '10px', border: '2px solid #000', marginTop: '5px' }}>
                    {mnemonic}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '10px', fontSize: '12px', color: '#ffaaaa' }}>
                  <em>Note: Mnemonic is not available because this wallet was not created/imported via 12 words in this session.</em>
                </div>
              )}

              <div>
                <strong>Private Key (Base58):</strong>
                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '12px', background: 'white', color: 'black', padding: '10px', border: '2px solid #000', marginTop: '5px' }}>
                  {bs58.encode(keypair.secretKey)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showLogoutConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="win-window" style={{ background: '#1a1a2e', padding: '20px', width: '100%' }}>
            <div className="win-content text-center">
              <h3 style={{ color: 'red' }}>CRITICAL WARNING</h3>
              <p>If you have not backed up your 12-word seed phrase or Secret Key, your funds will be <strong>lost forever</strong> upon logout.</p>
              <p>Are you sure you want to proceed?</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '25px' }}>
                <button className="win-btn" onClick={() => setShowLogoutConfirm(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="win-btn" style={{ flex: 1, backgroundColor: 'red' }} onClick={logout}>Logout</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSecurityPrompt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
          <div className="win-window" style={{ background: '#1a1a2e', padding: '20px', width: '100%' }}>
            <div className="win-content text-center">
              <h3 style={{ color: 'red' }}>SECURITY CHECK</h3>
              <p style={{ fontSize: '14px' }}>To view your highly sensitive private keys, please type the word <strong>EXPORT</strong> below.</p>
              <input 
                className="win-input" 
                style={{ textAlign: 'center', marginTop: '10px', textTransform: 'uppercase' }} 
                value={securityInput} 
                onChange={(e) => setSecurityInput(e.target.value)} 
                placeholder="Type EXPORT" 
              />
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '15px' }}>
                <button className="win-btn" onClick={() => setShowSecurityPrompt(false)} style={{ flex: 1, backgroundColor: '#555' }}>Cancel</button>
                <button className="win-btn" onClick={handleSecurityConfirm} style={{ flex: 1, backgroundColor: 'red' }}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
