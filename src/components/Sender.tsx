import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import QRCode from 'qrcode';
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { encryptForReceiver } from '../lib/crypto';
import { getCustomGifs, saveCustomGif, injectDataToGif } from '../lib/gifManager';
import type { MemeGif } from '../lib/gifManager';
import { shareGifBlob } from '../lib/capacitorShare';

export default function Sender({ onBack }: { onBack: () => void }) {
  const { keypair, isOnline, nonceAccountPubKey, currentNonce } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  
  const [phase, setPhase] = useState<'form' | 'method_select' | 'camera_qr' | 'gif_select'>('form');
  const [encryptedData, setEncryptedData] = useState<Uint8Array | null>(null);
  const [gifs, setGifs] = useState<MemeGif[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const encoderRef = useRef<UREncoder | null>(null);
  const activeRef = useRef<boolean>(false);

  // Load custom GIFs
  useEffect(() => {
    getCustomGifs().then(setGifs);
  }, []);

  const handleUploadGif = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'image/gif') {
        setError("Only .gif files are allowed.");
        return;
      }
      const newGif = await saveCustomGif(file);
      setGifs(prev => [...prev, newGif]);
    }
  };

  const handlePrepareTx = async () => {
    if (!keypair) return;
    setError('');
    try {
      const toPubkey = new PublicKey(recipient);
      const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;
      const tx = new Transaction();

      if (isOnline) {
        const conn = new Connection('https://api.devnet.solana.com');
        const { blockhash } = await conn.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports }));
      } else {
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
      const rawTx = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      
      // Asymmetric Encryption
      const encrypted = await encryptForReceiver(keypair.secretKey, toPubkey, rawTx);
      setEncryptedData(encrypted);
      
      setPhase('method_select');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleStartCameraQR = () => {
    if (!encryptedData) return;
    const ur = UR.fromBuffer(Buffer.from(encryptedData));
    encoderRef.current = new UREncoder(ur, 150); // 150 bytes per frame
    setPhase('camera_qr');
  };

  const handleSelectGif = async (gif: MemeGif) => {
    if (!encryptedData) return;
    try {
      setError("Generating GIF with encrypted metadata...");
      const finalBlob = await injectDataToGif(gif.blob, encryptedData);
      await shareGifBlob(finalBlob, `money_${Date.now()}.gif`);
      setError('');
      setPhase('form'); // reset or show success
      alert("Shared successfully!");
    } catch(e: any) {
      setError("Failed to generate/share GIF: " + e.message);
    }
  };

  // Canvas loop for Camera QR
  useEffect(() => {
    if (phase === 'camera_qr') {
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
        Network: <strong style={{ color: isOnline ? 'var(--accent-color)' : '#ffa500' }}>
          {isOnline ? 'Online' : 'Offline'}
        </strong>
      </p>

      {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '1rem', background: 'rgba(255,0,0,0.1)', borderRadius: '8px' }}>{error}</div>}

      {phase === 'form' && (
        <div className="card">
          <div className="input-group">
            <label>Recipient Address (Public Key)</label>
            <input className="input-field" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Must be exact, used for encryption..." />
          </div>
          <div className="input-group">
            <label>Amount (SOL)</label>
            <input className="input-field" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handlePrepareTx}>
            Encrypt & Prepare Transaction
          </button>
        </div>
      )}

      {phase === 'method_select' && (
        <div className="card">
          <h3>Transaction Encrypted!</h3>
          <p>Only the recipient can decode this transaction. How would you like to send it?</p>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleStartCameraQR}>
              Show Camera QR
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={() => setPhase('gif_select')}>
              Hide in a Meme GIF
            </button>
          </div>
        </div>
      )}

      {phase === 'gif_select' && (
        <div className="card">
          <h3>Select a GIF</h3>
          <p>The encrypted data will be injected invisibly into the GIF metadata.</p>
          
          <div style={{ margin: '1rem 0' }}>
            <label className="btn" style={{ display: 'inline-block', cursor: 'pointer', background: 'var(--accent-color)', color: 'white' }}>
              Upload Custom GIF
              <input type="file" accept="image/gif" hidden onChange={handleUploadGif} />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {gifs.length === 0 && <p style={{ opacity: 0.5, gridColumn: '1 / -1' }}>No GIFs uploaded yet.</p>}
            {gifs.map(g => (
              <div key={g.id} onClick={() => handleSelectGif(g)} style={{ cursor: 'pointer', border: '2px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.5rem', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                <p style={{ color: 'var(--accent-color)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Select & Share</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'camera_qr' && (
        <div className="text-center card">
          <p>Scan this Animated QR with the Receiver device.</p>
          <div className="qr-container" style={{ margin: '1rem auto' }}>
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>
      )}

      <button className="btn mt-2" onClick={onBack}>Cancel / Back</button>
    </div>
  );
}
