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
    <div className="win-window">
      <div className="win-titlebar">
        <div className="title-text">
          <span>O</span>
          <span>Send SOL</span>
        </div>
        <div className="win-title-buttons">
          <div className="win-title-btn" onClick={onBack}>X</div>
        </div>
      </div>

      <div className="win-content">
        <p style={{ margin: '0 0 10px 0' }}>
          <strong>Network:</strong> <span className={isOnline ? 'status-online' : 'status-offline'}>{isOnline ? 'Online' : 'Offline'}</span>
        </p>

        {error && <div className="win-error-box">{error}</div>}

        {phase === 'form' && (
          <div className="flex-col">
            <div className="win-input-group">
              <label>Recipient Address (Public Key):</label>
              <input className="win-input" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. 7vJ..." />
            </div>
            <div className="win-input-group">
              <label>Amount (SOL):</label>
              <input className="win-input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="win-btn" style={{ flex: 1, fontWeight: 'bold' }} onClick={handlePrepareTx}>Encrypt & Prepare</button>
              <button className="win-btn" onClick={onBack}>Cancel</button>
            </div>
          </div>
        )}

        {phase === 'method_select' && (
          <div className="flex-col">
            <h3 style={{ color: '#008000' }}>Transaction Encrypted!</h3>
            <p>Only the recipient can decode this transaction. How would you like to send it?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              <button className="win-btn" onClick={handleStartCameraQR}>Show Camera QR</button>
              <button className="win-btn" onClick={() => setPhase('gif_select')}>Hide in a Meme GIF</button>
              <button className="win-btn" onClick={() => setPhase('form')}>Cancel</button>
            </div>
          </div>
        )}

        {phase === 'gif_select' && (
          <div className="flex-col">
            <h3>Select a GIF</h3>
            <p>The encrypted data will be injected invisibly into the GIF metadata.</p>
            
            <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}>
              <label className="win-btn" style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Upload Custom GIF
                <input type="file" accept="image/gif" hidden onChange={handleUploadGif} />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxHeight: '200px', overflowY: 'auto', padding: '5px', border: 'inset 2px', background: 'white' }}>
              {gifs.length === 0 && <p style={{ color: 'black', gridColumn: '1 / -1', margin: 0 }}>No GIFs uploaded yet.</p>}
              {gifs.map(g => (
                <div key={g.id} onClick={() => handleSelectGif(g)} style={{ cursor: 'pointer', border: 'outset 2px', background: '#c0c0c0', padding: '5px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</p>
                </div>
              ))}
            </div>
            
            <button className="win-btn mt-1" onClick={() => setPhase('method_select')}>Back</button>
          </div>
        )}

        {phase === 'camera_qr' && (
          <div className="text-center flex-col">
            <p>Scan this Animated QR with the Receiver device.</p>
            <div className="qr-container" style={{ margin: '10px auto' }}>
              <canvas ref={canvasRef}></canvas>
            </div>
            <button className="win-btn mt-1" onClick={() => setPhase('method_select')}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
