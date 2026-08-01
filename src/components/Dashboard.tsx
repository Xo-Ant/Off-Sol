import { useWallet } from '../lib/WalletContext';


export default function Dashboard({ onSend, onReceive }: { onSend: () => void, onReceive: () => void }) {
  const { keypair, balance, nonceAccountPubKey, currentNonce, isOnline, createNonceAccount, refreshState, logout } = useWallet();

  const handleFund = () => {
    window.open(`https://faucet.solana.com/?network=devnet`, '_blank');
  };

  return (
    <div className="flex-col" style={{ gap: '1.5rem' }}>
      <div className="card text-center">
        <h2 style={{ fontSize: '2.5rem', margin: '0' }}>{balance.toFixed(4)} SOL</h2>
        <p style={{ opacity: 0.6, fontSize: '0.9rem', wordBreak: 'break-all', marginTop: '0.5rem' }}>
          {keypair?.publicKey.toBase58()}
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onSend}>Send (Offline)</button>
          <button className="btn" style={{ flex: 1 }} onClick={onReceive}>Receive</button>
        </div>
      </div>

      <div className="card">
        <h3>Offline Capabilities (Durable Nonce)</h3>
        {nonceAccountPubKey ? (
          <div>
            <p style={{ color: 'var(--accent-color)' }}>✓ Nonce Account Active</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Account: {nonceAccountPubKey.toBase58()}</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Current Nonce: {currentNonce || 'Fetching...'}</p>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '1rem' }}>
              Your device can safely sign offline transactions using this nonce.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: '1rem' }}>
              To send SOL while completely offline, you need a Nonce Account on the network.
            </p>
            <button 
              className="btn" 
              onClick={createNonceAccount} 
              disabled={!isOnline || balance < 0.002}
            >
              Initialize Nonce (~0.0014 SOL)
            </button>
            {!isOnline && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Must be online to create.</p>}
            {isOnline && balance < 0.002 && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Insufficient balance to pay rent.</p>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }} onClick={handleFund}>
          Get Devnet SOL
        </button>
        <div style={{display: 'flex', gap: '0.5rem'}}>
          <button className="btn" style={{ background: 'transparent' }} onClick={refreshState} disabled={!isOnline}>
            Refresh
          </button>
          <button className="btn" style={{ background: 'transparent', color: 'var(--danger)' }} onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
