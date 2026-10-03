import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import * as bip39 from 'bip39';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import PixelLogo from './PixelLogo';
import { MIN_PASSWORD_LENGTH } from '../lib/vault';

function PasswordFields({ password, setPassword, confirm, setConfirm }: {
  password: string; setPassword: (v: string) => void;
  confirm: string; setConfirm: (v: string) => void;
}) {
  return (
    <>
      <div className="win-input-group">
        <label>Set a password (min {MIN_PASSWORD_LENGTH} characters). It encrypts your keys on this device:</label>
        <input className="win-input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div className="win-input-group">
        <label>Repeat password:</label>
        <input className="win-input" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
    </>
  );
}

export default function Login() {
  const { importWalletBase58, importWalletMnemonic } = useWallet();
  const [mode, setMode] = useState<'init' | 'create_select' | 'create_mnemonic' | 'create_privkey' | 'import'>('init');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [generatedPrivKey, setGeneratedPrivKey] = useState('');
  const [importInput, setImportInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const goTo = (m: typeof mode) => {
    setError('');
    setPassword('');
    setConfirm('');
    setMode(m);
  };

  const checkPassword = () => {
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) throw new Error("Passwords do not match.");
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      checkPassword();
      await fn();
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    }
    setBusy(false);
  };

  const handleGenerateMnemonic = () => {
    setGeneratedMnemonic(bip39.generateMnemonic());
    goTo('create_mnemonic');
  };

  const handleGeneratePrivKey = () => {
    const kp = Keypair.generate();
    setGeneratedPrivKey(bs58.encode(kp.secretKey));
    goTo('create_privkey');
  };

  const handleConfirmCreateMnemonic = () => run(() => importWalletMnemonic(generatedMnemonic, password));
  const handleConfirmCreatePrivKey = () => run(() => importWalletBase58(generatedPrivKey, password));

  const handleImport = () => run(async () => {
    const input = importInput.trim();
    if (input.split(/\s+/).length >= 12) {
      await importWalletMnemonic(input, password);
    } else {
      try {
        await importWalletBase58(input, password);
      } catch {
        throw new Error("Invalid Mnemonic or Private Key.");
      }
    }
  });

  return (
    <div className="screen-container">
      <div className="media-pane">
        <PixelLogo />
      </div>

      <div className="controls-pane">
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Welcome</h2>

        {error && <div className="win-error-box">Error: {error}</div>}

        {mode === 'init' && (
          <div className="flex-col">
            <button className="win-btn" onClick={() => goTo('create_select')}>Create New Wallet</button>
            <button className="win-btn" onClick={() => goTo('import')}>Import Existing Wallet</button>
          </div>
        )}

        {mode === 'create_select' && (
          <div className="flex-col">
            <p>How would you like to secure your new wallet?</p>
            <button className="win-btn" onClick={handleGenerateMnemonic}>12-Word Mnemonic</button>
            <button className="win-btn" onClick={handleGeneratePrivKey}>Private Key (Raw)</button>
            <button className="win-btn" style={{ backgroundColor: '#555', marginTop: '10px' }} onClick={() => goTo('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_mnemonic' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save these 12 secret words. If you lose them, your funds are gone forever.</p>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '15px', border: '2px solid var(--pixel-primary)', marginBottom: '15px', fontFamily: 'monospace', fontSize: '18px' }}>
              {generatedMnemonic}
            </div>
            <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreateMnemonic} disabled={busy}>{busy ? 'Encrypting...' : 'I Have Saved It'}</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => goTo('init')}>Cancel</button>
          </div>
        )}

        {mode === 'create_privkey' && (
          <div className="flex-col">
            <p><strong>IMPORTANT:</strong> Save this Base58 Private Key. If you lose it, your funds are gone forever.</p>
            <div style={{ wordBreak: 'break-all', backgroundColor: 'rgba(255,255,255,0.1)', padding: '15px', border: '2px solid var(--pixel-primary)', marginBottom: '15px', fontFamily: 'monospace', fontSize: '14px' }}>
              {generatedPrivKey}
            </div>
            <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={handleConfirmCreatePrivKey} disabled={busy}>{busy ? 'Encrypting...' : 'I Have Saved It'}</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => goTo('init')}>Cancel</button>
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
            <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
            <button className="win-btn" onClick={handleImport} disabled={busy}>{busy ? 'Encrypting...' : 'Import Wallet'}</button>
            <button className="win-btn" style={{ backgroundColor: '#555' }} onClick={() => goTo('init')}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

