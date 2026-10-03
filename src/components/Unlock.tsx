import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import { MIN_PASSWORD_LENGTH } from '../lib/vault';
import PixelLogo from './PixelLogo';

// Shown when an encrypted vault exists (unlock) or when an older version left
// plaintext keys in storage (migrate: set a password and encrypt them).
export default function Unlock({ migrate }: { migrate: boolean }) {
  const { unlock, migrateLegacy, logout } = useWallet();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showReset, setShowReset] = useState(false);

  const submit = async () => {
    setError('');
    if (migrate) {
      if (password.length < MIN_PASSWORD_LENGTH) return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      if (password !== confirm) return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (migrate) await migrateLegacy(password);
      else await unlock(password);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="screen-container">
      <div className="media-pane">
        <PixelLogo />
      </div>
      <div className="controls-pane">
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>{migrate ? 'Secure Your Wallet' : 'Unlock Wallet'}</h2>
        {migrate && (
          <p style={{ fontSize: '14px' }}>
            This update encrypts your keys on the device. Choose a password to protect your existing wallet.
            You will need it every time you open Off-Sol.
          </p>
        )}
        {error && <div className="win-error-box">Error: {error}</div>}
        <div className="flex-col">
          <div className="win-input-group">
            <label>Password:</label>
            <input className="win-input" type="password" autoFocus
              autoComplete={migrate ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !migrate) submit(); }} />
          </div>
          {migrate && (
            <div className="win-input-group">
              <label>Repeat password:</label>
              <input className="win-input" type="password" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
          )}
          <button className="win-btn" onClick={submit} disabled={busy}>
            {busy ? 'Working...' : (migrate ? 'Encrypt & Continue' : 'Unlock')}
          </button>

          {!migrate && !showReset && (
            <button className="win-btn" style={{ backgroundColor: '#555', marginTop: '10px' }} onClick={() => setShowReset(true)}>
              Forgot password?
            </button>
          )}
          {!migrate && showReset && (
            <div className="win-error-box" style={{ marginTop: '10px' }}>
              <p style={{ fontSize: '13px' }}>
                The password cannot be recovered. You can erase this wallet from the device and import it
                again with your 12 words or private key. Without that backup your funds are lost.
              </p>
              <button className="win-btn" style={{ width: '100%', backgroundColor: 'red' }} onClick={logout}>Erase wallet from this device</button>
              <button className="win-btn" style={{ width: '100%', backgroundColor: '#555' }} onClick={() => setShowReset(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
