import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import QRCode from 'qrcode';
import { UR, UREncoder } from '@ngraveio/bc-ur';

export default function Sender({ onBack }: { onBack: () => void }) {
  const { keypair, isOnline, nonceAccountPubKey, currentNonce } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'form' | 'qr'>('form');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const encoderRef = useRef<UREncoder | null>(null);
  const activeRef = useRef<boolean>(false);

  const handleSign = async () => {
    if (!keypair) return;
    try {
      const toPubkey = new PublicKey(recipient);
      const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;
      const tx = new Transaction();

      if (isOnline) {
        // Standard Online Transaction
        const conn = new Connection('https://api.devnet.solana.com');
        const { blockhash } = await conn.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports }));
      } else {
        // Offline Transaction using Durable Nonce
        if (!nonceAccountPubKey || !currentNonce) {
          throw new Error("Durable Nonce is not initialized. Cannot sign offline.");
        }
        tx.recentBlockhash = currentNonce;
        tx.feePayer = keypair.publicKey;
        tx.add(
          SystemProgram.nonceAdvance({
            noncePubkey: nonceAccountPubKey,
            authorizedPubkey: keypair.publicKey,
          }),
          SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports })
        );
      }

      tx.sign(keypair);
      const rawTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false }); // false so it serializes even if partial

      // Buffer polyfill should be active via vite config
      const ur = UR.fromBuffer(Buffer.from(rawTx));
      encoderRef.current = new UREncoder(ur, 150); // 150 bytes per frame
      
      setPhase('qr');
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (phase === 'qr') {
      activeRef.current = true;
      let lastDraw = performance.now();
      
      const drawLoop = async (now: number) => {
        if (!activeRef.current) return;
        requestAnimationFrame(drawLoop);
        
        if (now - lastDraw < 100) return; // 10 fps
        lastDraw = now;
        
        if (encoderRef.current && canvasRef.current) {
          const part = encoderRef.current.nextPart();
          await QRCode.toCanvas(canvasRef.current, part.toUpperCase(), {
            width: 300,
            margin: 2,
            errorCorrectionLevel: 'L'
          });
        }
      };
      
      requestAnimationFrame(drawLoop);
      
      return () => {
        activeRef.current = false;
      };
    }
  }, [phase]);

  return (
    <div className="flex-col">
      <h2>Send SOL</h2>
      <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
        Status: <strong style={{ color: isOnline ? 'var(--accent-color)' : '#ffa500' }}>
          {isOnline ? 'Online (Standard)' : 'Offline (Durable Nonce)'}
        </strong>
      </p>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{error}</div>}

      {phase === 'form' && (
        <div className="card">
          <div className="input-group">
            <label>Recipient Address</label>
            <input className="input-field" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. 7vJ..." />
          </div>
          <div className="input-group">
            <label>Amount (SOL)</label>
            <input className="input-field" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSign}>
            {isOnline ? 'Sign Transaction' : 'Sign Offline Transaction'}
          </button>
        </div>
      )}

      {phase === 'qr' && (
        <div className="text-center card">
          <p>Scan this Animated QR (UR standard) with the Receiver device.</p>
          <div className="qr-container" style={{ margin: '1rem auto' }}>
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>
      )}

      <button className="btn mt-2" onClick={onBack}>Cancel / Back</button>
    </div>
  );
}
