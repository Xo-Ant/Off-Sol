import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { parseUnits } from '../lib/amount';
import { createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import QRCode from 'qrcode';
import { UR, UREncoder } from '@ngraveio/bc-ur';
import { encryptForReceiver } from '../lib/crypto';
import { getCustomGifs, saveCustomGif, injectDataToGif } from '../lib/gifManager';
import type { MemeGif } from '../lib/gifManager';
import { shareGifBlob } from '../lib/capacitorShare';

// 5000 lamports per signature; keep a small margin for priority fees.
const FEE_RESERVE_LAMPORTS = 10_000n;
// Rent-exempt minimum for a 165-byte SPL token account.
const ATA_RENT_LAMPORTS = 2_039_280n;

export default function Sender({ onBack }: { onBack: () => void }) {
  const { keypair, balance, balanceLamports, isOnline, nonceAccountPubKey, currentNonce, nonceAvailable, markNonceUsed, tokens, rpcUrl } = useWallet();
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('SOL');
  const [error, setError] = useState('');
  
  const [phase, setPhase] = useState<'form' | 'method_select' | 'qr_transition' | 'camera_qr' | 'gif_select' | 'success'>('form');
  const [encryptedData, setEncryptedData] = useState<Uint8Array | null>(null);
  const [rawTxData, setRawTxData] = useState<Uint8Array | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
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

    try {
      let toPubkey: PublicKey;
      try {
        toPubkey = new PublicKey(recipient.trim());
      } catch {
        throw new Error("Invalid recipient address.");
      }
      if (toPubkey.equals(keypair.publicKey)) {
        throw new Error("You cannot send to your own address.");
      }

      const useNonce = !isOnline;
      if (useNonce && (!nonceAccountPubKey || !currentNonce)) {
        throw new Error("Durable Nonce is not initialized. Go online once and create a nonce account to sign offline.");
      }
      if (useNonce && !nonceAvailable) {
        throw new Error("Your offline nonce was already used for a previous transaction. Go online so it can refresh before signing another offline transaction.");
      }

      const conn = isOnline ? new Connection(rpcUrl, 'confirmed') : null;
      const tx = new Transaction();
      tx.feePayer = keypair.publicKey;

      if (useNonce) {
        tx.recentBlockhash = currentNonce!;
        tx.add(SystemProgram.nonceAdvance({ noncePubkey: nonceAccountPubKey!, authorizedPubkey: keypair.publicKey }));
      } else {
        tx.recentBlockhash = (await conn!.getLatestBlockhash()).blockhash;
      }

      if (asset === 'SOL') {
        const lamports = parseUnits(amount, 9);
        if (lamports + FEE_RESERVE_LAMPORTS > balanceLamports) {
          throw new Error("Insufficient SOL balance (amount + network fee).");
        }
        tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports }));
      } else {
        const selectedToken = tokens.find(t => t.mint === asset);
        if (!selectedToken) throw new Error("Token not found");
        const rawAmount = parseUnits(amount, selectedToken.decimals);
        if (rawAmount > BigInt(selectedToken.amount)) {
          throw new Error("Insufficient token balance.");
        }

        const mintPubkey = new PublicKey(selectedToken.mint);
        const sourceAta = new PublicKey(selectedToken.ata);
        const destAta = getAssociatedTokenAddressSync(mintPubkey, toPubkey, false);

        // If the recipient has no token account yet, we pay its rent.
        // Offline we cannot check, so we assume the worst case.
        const destExists = conn ? (await conn.getAccountInfo(destAta)) !== null : false;
        const solNeeded = FEE_RESERVE_LAMPORTS + (destExists ? 0n : ATA_RENT_LAMPORTS);
        if (solNeeded > balanceLamports) {
          throw new Error("Not enough SOL to pay the network fee and the recipient's token account rent.");
        }

        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, destAta, toPubkey, mintPubkey),
          createTransferInstruction(sourceAta, destAta, keypair.publicKey, rawAmount)
        );
      }

      tx.sign(keypair);
      const rawTx = tx.serialize();

      const encrypted = await encryptForReceiver(keypair.secretKey, toPubkey, rawTx);
      if (useNonce) markNonceUsed();
      setEncryptedData(encrypted);
      setRawTxData(rawTx);

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

  const handleDirectBroadcast = async () => {
    if (!rawTxData) return;
    setIsBroadcasting(true);
    setError('');
    try {
      const conn = new Connection(rpcUrl, 'confirmed');
      const signature = await conn.sendRawTransaction(rawTxData, { skipPreflight: false });
      console.log("Broadcasted:", signature);
      setPhase('success');
    } catch (e: any) {
      setError("Broadcast failed: " + e.message);
    }
    setIsBroadcasting(false);
  };

  useEffect(() => {
    if (phase === 'camera_qr') {
      activeRef.current = true;
      let lastDraw = performance.now();
      
      const drawLoop = async (now: number) => {
        if (!activeRef.current) return;
        requestAnimationFrame(drawLoop);
        
        if (now - lastDraw < 150) return;
        lastDraw = now;
        
        if (encoderRef.current && canvasRef.current) {
          try {
            const part = encoderRef.current.nextPart();
            const qr = QRCode.create(part.toUpperCase(), { errorCorrectionLevel: 'L' });
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              const size = qr.modules.size;
              const margin = 2;
              const totalSize = size + 2 * margin;
              const canvasSize = 300;

              const dpr = window.devicePixelRatio || 1;
              const physSize = Math.floor(canvasSize * dpr);
              
              canvas.width = physSize;
              canvas.height = physSize;
              canvas.style.width = `${canvasSize}px`;
              canvas.style.height = `${canvasSize}px`;

              ctx.imageSmoothingEnabled = false;

              ctx.fillStyle = '#05050a';
              ctx.fillRect(0, 0, physSize, physSize);

              const colors = ['#90EE90', '#39ff14', '#00ff41', '#4A6B2C', '#6b8e23'];
              const physCellSize = physSize / totalSize;

              for (let row = 0; row < size; row++) {
                for (let col = 0; col < size; col++) {
                  if (qr.modules.data[row * size + col]) {
                    const colorIndex = (row * 13 + col * 7) % colors.length;
                    ctx.fillStyle = colors[colorIndex];
                    ctx.shadowBlur = Math.floor(physCellSize * 0.4); 
                    ctx.shadowColor = ctx.fillStyle;
                    
                    const x = Math.floor((col + margin) * physCellSize);
                    const y = Math.floor((row + margin) * physCellSize);
                    
                    const drawSize = Math.floor(physCellSize * 0.75);
                    const offset = Math.floor((physCellSize - drawSize) / 2);
                    
                    ctx.beginPath();
                    if (ctx.roundRect) {
                      ctx.roundRect(x + offset, y + offset, drawSize, drawSize, Math.max(1, Math.floor(drawSize * 0.15)));
                    } else {
                      ctx.rect(x + offset, y + offset, drawSize, drawSize);
                    }
                    ctx.fill();
                  }
                }
              }
            }
          } catch (err) {
            console.error("QR Code Generation Error:", err);
          }
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
        ) : phase === 'success' ? (
          <div className="media-placeholder" style={{ color: '#00cc00' }}>
            SUCCESS!
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
              <label>Asset:</label>
              <select className="win-input" value={asset} onChange={e => setAsset(e.target.value)} style={{ padding: '10px' }}>
                <option value="SOL">SOL (Balance: {balance})</option>
                {tokens.map(t => (
                  <option key={t.mint} value={t.mint}>
                    {t.mint.substring(0,6)}... (Balance: {t.uiAmount})
                  </option>
                ))}
              </select>
            </div>
            <div className="win-input-group">
              <label>Recipient Address (Base58):</label>
              <input className="win-input" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. 7vJ..." />
            </div>
            <div className="win-input-group">
              <label>Amount:</label>
              <input className="win-input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.1" />
            </div>
            <button className="win-btn" style={{ width: '100%', marginTop: '10px' }} onClick={handlePrepareTx}>Encrypt & Prepare</button>
          </div>
        )}

        {phase === 'method_select' && (
          <div className="flex-col">
            <h3 style={{ color: '#00cc00' }}>Encrypted!</h3>
            <p>How would you like to send it?</p>
            
            {isOnline && (
              <button 
                className="win-btn" 
                style={{ width: '100%', backgroundColor: '#00aa00', borderColor: '#00ff00', color: 'white', marginBottom: '15px' }} 
                onClick={handleDirectBroadcast}
                disabled={isBroadcasting}
              >
                {isBroadcasting ? 'Broadcasting...' : 'Direct Broadcast (Online)'}
              </button>
            )}

            <button className="win-btn" style={{ width: '100%' }} onClick={handleStartCameraQR}>Show QR Code (Offline)</button>
            <button className="win-btn" style={{ width: '100%' }} onClick={() => setPhase('gif_select')}>Hide in Meme GIF (Offline)</button>
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

        {phase === 'success' && (
          <div className="text-center flex-col">
            <h2 style={{ color: '#00cc00', margin: '10px 0' }}>SUCCESS</h2>
            <p>Transaction sent to the network. It may take a few seconds to confirm.</p>
            <button className="win-btn" style={{ width: '100%', marginTop: '15px' }} onClick={onBack}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
