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
    <div className="win-window">
      <div className="win-titlebar">
        <div className="title-text">
          <span>O</span>
          <span>Off-Sol Wallet Setup</span>
        </div>
        <div className="win-title-buttons">
          <div className="win-title-btn" onClick={() => setMode('init')}>_</div>
          <div className="win-title-btn" onClick={() => setMode('init')}>X</div>
        </div>
      </div>
      <div className="win-content">
        <h2>Welcome to Off-Sol</h2>
        <p>The unbreakable offline Solana wallet.</p>

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
            <button className="win-btn" onClick={handleGenerateMnemonic}>12-Word Mnemonic (Recommended)</button>
            <button className="win-btn" onClick={handleGeneratePrivKey}>Private Key (Standard)</button>
            <button className="win-btn mt-1" onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_mnemonic' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save these 12 secret words in a secure place. If you lose them, your funds are gone forever.</p>
            <div style={{ backgroundColor: 'white', padding: '10px', border: 'inset 2px', marginBottom: '15px', fontFamily: 'monospace' }}>
              {generatedMnemonic}
            </div>
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreateMnemonic}>I Have Saved It (Login)</button>
            <button className="win-btn" onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_privkey' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save this Base58 Private Key in a secure place. If you lose it, your funds are gone forever.</p>
            <div style={{ wordBreak: 'break-all', backgroundColor: 'white', padding: '10px', border: 'inset 2px', marginBottom: '15px', fontFamily: 'monospace', fontSize: '11px' }}>
              {generatedPrivKey}
            </div>
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreatePrivKey}>I Have Saved It (Login)</button>
            <button className="win-btn" onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}

        {mode === 'import' && (
          <div className="flex-col">
            <div className="win-input-group">
              <label>Enter 12-Word Secret Phrase OR Base58 Private Key:</label>
              <textarea 
                className="win-input" 
                rows={3}
                value={importInput} 
                onChange={e => setImportInput(e.target.value)} 
                placeholder="apple banana cherry..." 
              />
            </div>
            <button className="win-btn" onClick={handleImport}>Import Wallet</button>
            <button className="win-btn" onClick={() => setMode('init')}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

