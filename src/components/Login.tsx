import { useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export default function Login() {
  const { login } = useWallet();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const handleCreate = () => {
    const kp = Keypair.generate();
    login(bs58.encode(kp.secretKey));
  };

  const handleImport = () => {
    try {
      const kp = Keypair.fromSecretKey(bs58.decode(secret));
      login(bs58.encode(kp.secretKey));
    } catch (e) {
      setError("Invalid Base58 Secret Key");
    }
  };

  return (
    <div className="flex-col" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
      <h1>Welcome to Offline Wallet</h1>
      <p style={{ textAlign: 'center', opacity: 0.8, marginBottom: '2rem' }}>
        A secure, Capacitor-based Solana wallet capable of Durable Nonce & Animated QR offline transactions.
      </p>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}
      
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <h3>Create New Wallet</h3>
        <p style={{ opacity: 0.7, fontSize: '0.9rem' }}>Generate a fresh burner keypair for testing.</p>
        <button className="btn btn-primary" onClick={handleCreate} style={{ width: '100%' }}>Create Wallet</button>
        
        <hr style={{ margin: '2rem 0', borderColor: 'rgba(255,255,255,0.1)' }} />
        
        <h3>Import Wallet</h3>
        <div className="input-group">
          <input 
            className="input-field" 
            placeholder="Secret Key (Base58)" 
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            type="password"
          />
        </div>
        <button className="btn" onClick={handleImport} style={{ width: '100%' }}>Import Secret</button>
      </div>
    </div>
  );
}
