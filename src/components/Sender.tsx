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
  const { keypair, balance, isOnline, nonceAccountPubKey, currentNonce } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  
  const [phase, setPhase] = useState<'form' | 'method_select' | 'camera_qr' | 'gif_select'>('form');
  const [encryptedData, setEncryptedData] = useState<Uint8Array | null>(null);
  const [gifs, setGifs] = useState<MemeGif[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const encoderRef = useRef<UREncoder | null>(null);
  const activeRef = useRef<boolean>(false);

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
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (parsedAmount > balance) {
      setError("Insufficient balance.");
      return;
    }

    try {
      const toPubkey = new PublicKey(recipient);
      const lamports = parsedAmount * LAMPORTS_PER_SOL;
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
    encoderRef.current = new UREncoder(ur, 150);
    setPhase('camera_qr');
  };

  const handleSelectGif = async (gif: MemeGif) => {
    if (!encryptedData) return;
    try {
      setError("Generating GIF with encrypted metadata...");
      const finalBlob = await injectDataToGif(gif.blob, encryptedData);
      await shareGifBlob(finalBlob, `money_${Date.now()}.gif`);
      setError('');
      setPhase('form'); 
      alert("Shared successfully!");
    } catch(e: any) {
      setError("Failed to generate/share GIF: " + e.message);
    }
  };

  useEffect(() => {
    if (phase === 'camera_qr') {
      activeRef.current = true;
      let lastDraw = performance.now();
      
      const drawLoop = async (now: number) => {
        if (!activeRef.current) return;
        requestAnimationFrame(drawLoop);
        
        if (now - lastDraw < 100) return;
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
    <div className="screen-container">
      <div className="media-pane">
        {phase === 'camera_qr' ? (
          <div className="qr-container">
            <canvas ref={canvasRef}></canvas>
          </div>
        ) : (
          <div className="media-placeholder">
            {phase === 'form' ? 'Awaiting Input...' : (phase === 'gif_select' ? 'Select GIF' : 'Processing...')}
          </div>
        )}
      </div>

      <div className="controls-pane">
        <button className="win-btn" style={{ marginBottom: '15px', padding: '8px 12px', fontSize: '14px', backgroundColor: '#555' }} onClick={onBack}>&lt; Back</button>

        {error && <div className="win-error-box">{error}</div>}

        {phase === 'form' && (
          <div className="flex-col">
            <div className="win-input-group">
              <label>Recipient Address (Base58):</label>
              <input className="win-input" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. 7vJ..." />
            </div>
            <div className="win-input-group">
              <label>Amount (SOL):</label>
              <input className="win-input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
            </div>
            <button className="win-btn" style={{ width: '100%', marginTop: '10px' }} onClick={handlePrepareTx}>Encrypt & Prepare</button>
          </div>
        )}

        {phase === 'method_select' && (
          <div className="flex-col">
            <h3 style={{ color: '#00cc00' }}>Encrypted!</h3>
            <p>How would you like to send it?</p>
            <button className="win-btn" style={{ width: '100%' }} onClick={handleStartCameraQR}>Show QR Code</button>
            <button className="win-btn" style={{ width: '100%' }} onClick={() => setPhase('gif_select')}>Hide in Meme GIF</button>
            <button className="win-btn" style={{ width: '100%', backgroundColor: '#555' }} onClick={() => setPhase('form')}>Cancel</button>
          </div>
        )}

        {phase === 'gif_select' && (
          <div className="flex-col">
            <h3>Select GIF</h3>
            
            <label className="win-btn" style={{ display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer', marginBottom: '15px' }}>
              Upload Custom GIF
              <input type="file" accept="image/gif" hidden onChange={handleUploadGif} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {gifs.length === 0 && <p style={{ gridColumn: '1 / -1' }}>No GIFs uploaded yet.</p>}
              {gifs.map(g => (
                <div key={g.id} onClick={() => handleSelectGif(g)} style={{ cursor: 'pointer', border: '2px solid var(--pixel-primary)', background: '#222', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {phase === 'camera_qr' && (
          <div className="text-center flex-col">
            <p>Scan the Animated QR above with the Receiver.</p>
            <button className="win-btn mt-1" onClick={() => setPhase('method_select')}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
