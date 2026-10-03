import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection } from '@solana/web3.js';
import { inspectIncomingTx } from '../lib/txInspect';
import type { IncomingTransfer } from '../lib/txInspect';
import { formatUnits } from '../lib/amount';
import { URDecoder } from '@ngraveio/bc-ur';
import WorkerScript from '../lib/worker?worker';
import { decryptPayload } from '../lib/crypto';
import { extractDataFromGif } from '../lib/gifManager';

export default function Receiver({ onBack }: { onBack: () => void }) {
  const { keypair, isOnline, addPendingTx, refreshState, rpcUrl } = useWallet();
  const [phase, setPhase] = useState<'select' | 'scan' | 'confirm' | 'success'>('select');
  const [incoming, setIncoming] = useState<{ raw: Uint8Array; info: IncomingTransfer } | null>(null);
  const [wasBroadcast, setWasBroadcast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<URDecoder | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const busyRef = useRef<boolean[]>([]);
  const doneRef = useRef(false);
  const frameIdRef = useRef(0);

  useEffect(() => {
    if (phase === 'scan') {
      decoderRef.current = new URDecoder();
      startCamera();
    }
    return () => {
      if (phase === 'scan') stopCamera();
    };
  }, [phase]);

  const handleGifUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!keypair) return;
    if (e.target.files && e.target.files[0]) {
      setErrorMsg('');
      try {
        const file = e.target.files[0];
        const encryptedData = await extractDataFromGif(file);
        const rawTx = await decryptPayload(keypair.secretKey, encryptedData);
        await processTransaction(rawTx);
      } catch (err: any) {
        setErrorMsg("Failed to decode GIF: " + err.message);
      }
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      const workerCount = 4;
      workersRef.current = [];
      busyRef.current = [];
      for (let i = 0; i < workerCount; i++) {
        const w = new WorkerScript();
        const slot = i;
        w.onmessage = (e) => {
          const { id, bytes } = e.data;
          if (id === -1) return;
          busyRef.current[slot] = false;
          if (bytes) onDecodedQR(bytes);
        };
        workersRef.current.push(w);
        busyRef.current.push(false);
      }
      
      doneRef.current = false;
      requestAnimationFrame(captureLoop);
    } catch (e: any) {
      setErrorMsg("Camera error: " + e.message);
    }
  };

  const captureLoop = () => {
    if (doneRef.current || !videoRef.current) return;
    const v = videoRef.current;
    if (v.videoWidth && v.videoHeight) {
      const slot = busyRef.current.indexOf(false);
      if (slot !== -1) {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          const img = ctx.getImageData(0, 0, v.videoWidth, v.videoHeight);
          busyRef.current[slot] = true;
          workersRef.current[slot].postMessage(
            { id: frameIdRef.current++, buf: img.data.buffer, w: v.videoWidth, h: v.videoHeight },
            [img.data.buffer]
          );
        }
      }
    }
    requestAnimationFrame(captureLoop);
  };

  const onDecodedQR = async (bytes: Uint8Array) => {
    if (doneRef.current || !decoderRef.current || !keypair) return;
    
    try {
      const qrString = new TextDecoder().decode(bytes);
      if (!qrString.toUpperCase().startsWith("UR:")) return;
      
      decoderRef.current.receivePart(qrString);
      setScanProgress(Math.floor(decoderRef.current.estimatedPercentComplete() * 100));

      if (decoderRef.current.isComplete()) {
        if (decoderRef.current.isSuccess()) {
          doneRef.current = true;
          setScanProgress(100);
          const ur = decoderRef.current.resultUR();
          
          try {
            const encryptedData = new Uint8Array(ur.decodeCBOR());
            const rawTx = await decryptPayload(keypair.secretKey, encryptedData);
            await processTransaction(rawTx);
          } catch (decryptErr: any) {
            setErrorMsg("Decryption failed. This transaction was not meant for this wallet!");
            setPhase('select');
          }
        } else {
          setErrorMsg("Failed to decode UR data.");
          decoderRef.current = new URDecoder();
        }
      }
    } catch (e) {
      // ignore bad frames
    }
  };

  // Step 1: decode and verify what we received, then ask the user to confirm.
  const processTransaction = async (rawTx: Uint8Array) => {
    if (!keypair) return;
    try {
      const info = inspectIncomingTx(rawTx, keypair.publicKey);
      setIncoming({ raw: rawTx, info });
      setPhase('confirm');
    } catch (e: any) {
      setErrorMsg("Rejected: " + e.message);
      setPhase('select');
    }
  };

  // Step 2: broadcast now if online, otherwise queue it.
  const acceptTransaction = async () => {
    if (!incoming) return;
    setBusy(true);
    setErrorMsg('');
    if (isOnline) {
      try {
        const conn = new Connection(rpcUrl, 'confirmed');
        const signature = await conn.sendRawTransaction(incoming.raw, { skipPreflight: false });
        console.log("Broadcasted:", signature);
        refreshState();
        setWasBroadcast(true);
        setPhase('success');
      } catch (e: any) {
        setErrorMsg("Broadcast failed: " + e.message);
      }
    } else {
      addPendingTx(incoming.raw);
      setWasBroadcast(false);
      setPhase('success');
    }
    setBusy(false);
  };

  const stopCamera = () => {
    doneRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    workersRef.current.forEach(w => w.terminate());
  };

  return (
    <div className="screen-container">
      <div className="media-pane">
        {phase === 'scan' ? (
          <div className="scanner-overlay">
            <video ref={videoRef} playsInline muted></video>
            <div style={{ position: 'absolute', top: '50%', width: '100%', height: '2px', background: 'var(--pixel-primary)', boxShadow: '0 0 10px var(--pixel-primary)' }}></div>
          </div>
        ) : phase === 'success' ? (
          <div className="media-placeholder" style={{ color: '#00cc00' }}>
            {wasBroadcast ? 'SENT' : 'QUEUED'}
          </div>
        ) : (
          <div className="media-placeholder">
            Awaiting Input...
          </div>
        )}
      </div>

      <div className="controls-pane">
        <button className="win-btn" style={{ marginBottom: '15px', padding: '8px 12px', fontSize: '14px', backgroundColor: '#555' }} onClick={onBack}>&lt; Back</button>

        {errorMsg && <div className="win-error-box">{errorMsg}</div>}

        {phase === 'select' && (
          <div className="flex-col">
            <h3>Receive Transaction</h3>
            <button className="win-btn" style={{ width: '100%', marginBottom: '10px' }} onClick={() => setPhase('scan')}>
              Scan QR
            </button>
            <label className="win-btn" style={{ display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer' }}>
              Upload Meme-GIF
              <input type="file" accept="image/gif" hidden onChange={handleGifUpload} />
            </label>
          </div>
        )}

        {phase === 'scan' && (
          <div className="flex-col">
            <p>Scan Sender's animated QR.</p>
            <div style={{ border: '2px solid var(--pixel-border)', background: '#222', height: '20px', position: 'relative', overflow: 'hidden', marginBottom: '15px' }}>
              <div style={{ background: 'var(--pixel-primary)', height: '100%', width: `${scanProgress}%`, transition: 'width 0.2s' }}></div>
              <span style={{ position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', fontSize: '12px', color: 'white', fontWeight: 'bold' }}>
                {scanProgress}%
              </span>
            </div>
            <button className="win-btn" style={{ width: '100%', backgroundColor: '#555' }} onClick={() => setPhase('select')}>Cancel</button>
          </div>
        )}

        {phase === 'confirm' && incoming && (
          <div className="flex-col">
            <h3>Incoming Payment</h3>
            <p style={{ fontSize: '14px' }}>
              <strong>Amount:</strong>{' '}
              {incoming.info.kind === 'SOL'
                ? `${formatUnits(incoming.info.amount, 9)} SOL`
                : `${incoming.info.amount.toString()} raw units of token ${incoming.info.mint?.slice(0, 6)}...`}
            </p>
            <p style={{ fontSize: '12px', wordBreak: 'break-all' }}><strong>From:</strong> {incoming.info.from}</p>
            <div className="win-error-box" style={{ fontSize: '12px' }}>
              This payment is NOT final until it is confirmed on the network. The sender could still
              spend these funds elsewhere before your transaction is broadcast.
            </div>
            <button className="win-btn" style={{ width: '100%' }} onClick={acceptTransaction} disabled={busy}>
              {busy ? 'Working...' : (isOnline ? 'Broadcast Now' : 'Save to Pending Queue')}
            </button>
            <button className="win-btn" style={{ width: '100%', backgroundColor: '#555' }} onClick={() => { setIncoming(null); setPhase('select'); }}>Discard</button>
          </div>
        )}

        {phase === 'success' && (
          <div className="text-center flex-col">
            <h2 style={{ color: '#00cc00', margin: '10px 0' }}>{wasBroadcast ? 'SENT' : 'QUEUED'}</h2>
            <p>
              {wasBroadcast
                ? "Transaction sent to the network. Check your balance in a moment to confirm it landed."
                : "Saved to the pending queue. It will be broadcast automatically when you are online. Until then the payment is not guaranteed."}
            </p>
            <button className="win-btn" style={{ width: '100%', marginTop: '15px' }} onClick={onBack}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
