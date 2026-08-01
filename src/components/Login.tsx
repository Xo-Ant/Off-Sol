import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import * as bip39 from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export default function Login() {
  const { importWalletBase58, importWalletMnemonic } = useWallet();
  const [mode, setMode] = useState<'init' | 'create_select' | 'create_mnemonic' | 'create_privkey' | 'import'>('init');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [generatedPrivKey, setGeneratedPrivKey] = useState('');
  const [importInput, setImportInput] = useState('');
  const [error, setError] = useState('');

  const handleGenerateMnemonic = () => {
    const mnemonic = bip39.generateMnemonic();
    setGeneratedMnemonic(mnemonic);
    setMode('create_mnemonic');
  };

  const handleGeneratePrivKey = () => {
    const kp = Keypair.generate();
    setGeneratedPrivKey(bs58.encode(kp.secretKey));
    setMode('create_privkey');
  };

  const handleConfirmCreateMnemonic = () => {
    importWalletMnemonic(generatedMnemonic);
  };

  const handleConfirmCreatePrivKey = () => {
    importWalletBase58(generatedPrivKey);
  };

  const handleImport = () => {
    try {
      setError('');
      const input = importInput.trim();
      if (input.split(' ').length >= 12) {
        importWalletMnemonic(input);
      } else {
        importWalletBase58(input);
      }
    } catch (e: any) {
      setError("Invalid Mnemonic or Private Key.");
    }
  };

  return (
  return (
    <div className="screen-container">
      <div className="media-pane">
        <img src="/logo.jpg" alt="Off-Sol Logo" style={{ height: '80%', objectFit: 'contain' }} />
      </div>

      <div className="controls-pane">
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Welcome</h2>

        {error && <div className="win-error-box">Error: {error}</div>}

        {mode === 'init' && (
          <div className="flex-col">
            <button className="win-btn" onClick={() => setMode('create_select')}>Create New Wallet</button>
            <button className="win-btn" onClick={() => setMode('import')}>Import Existing Wallet</button>
          </div>
        )}

        {mode === 'create_select' && (
          <div className="flex-col">
            <p>How would you like to secure your new wallet?</p>
            <button className="win-btn" onClick={handleGenerateMnemonic}>12-Word Mnemonic</button>
            <button className="win-btn" onClick={handleGeneratePrivKey}>Private Key (Raw)</button>
            <button className="win-btn" style={{ backgroundColor: '#555', marginTop: '10px' }} onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_mnemonic' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save these 12 secret words. If you lose them, your funds are gone forever.</p>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '15px', border: '2px solid var(--pixel-primary)', marginBottom: '15px', fontFamily: 'monospace', fontSize: '18px' }}>
              {generatedMnemonic}
            </div>
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreateMnemonic}>I Have Saved It</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_privkey' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save this Base58 Private Key. If you lose it, your funds are gone forever.</p>
            <div style={{ wordBreak: 'break-all', backgroundColor: 'rgba(255,255,255,0.1)', padding: '15px', border: '2px solid var(--pixel-primary)', marginBottom: '15px', fontFamily: 'monospace', fontSize: '14px' }}>
              {generatedPrivKey}
            </div>
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreatePrivKey}>I Have Saved It</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'import' && (
          <div className="flex-col">
            <div className="win-input-group">
              <label>12-Word Phrase OR Private Key:</label>
              <textarea 
                className="win-input" 
                rows={4}
                value={importInput} 
                onChange={e => setImportInput(e.target.value)} 
                placeholder="apple banana cherry..." 
              />
            </div>
            <button className="win-btn" onClick={handleImport}>Import Wallet</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

