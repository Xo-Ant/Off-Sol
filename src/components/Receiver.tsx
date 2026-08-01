import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection } from '@solana/web3.js';
import { URDecoder } from '@ngraveio/bc-ur';
import WorkerScript from '../lib/worker?worker';
import { decryptPayload } from '../lib/crypto';
import { extractDataFromGif } from '../lib/gifManager';

export default function Receiver({ onBack }: { onBack: () => void }) {
  const { keypair, isOnline, setPendingTx, refreshState } = useWallet();
  const [phase, setPhase] = useState<'select' | 'scan' | 'success'>('select');
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

  const processTransaction = async (rawTx: Uint8Array) => {
    if (isOnline) {
      try {
        const conn = new Connection('https://api.devnet.solana.com');
        const signature = await conn.sendRawTransaction(rawTx, { skipPreflight: true });
        console.log("Broadcasted:", signature);
        refreshState();
        setPhase('success');
      } catch (e: any) {
        setErrorMsg("Broadcast failed: " + e.message);
      }
    } else {
      setPendingTx(rawTx);
      setPhase('success');
    }
  };

  const stopCamera = () => {
    doneRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    workersRef.current.forEach(w => w.terminate());
  };

  return (
    <div className="win-window">
      <div className="win-titlebar">
        <div className="title-text">
          <span>O</span>
          <span>Receive SOL</span>
        </div>
        <div className="win-title-buttons">
          <div className="win-title-btn" onClick={onBack}>X</div>
        </div>
      </div>

      <div className="win-content">
        <p style={{ margin: '0 0 10px 0' }}>
          <strong>Network:</strong> <span className={isOnline ? 'status-online' : 'status-offline'}>{isOnline ? 'Online' : 'Offline'}</span>
        </p>

        {errorMsg && <div className="win-error-box">{errorMsg}</div>}

        {phase === 'select' && (
          <div className="flex-col">
            <p>How would you like to receive the transaction?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={() => setPhase('scan')}>
                Scan Camera QR
              </button>
              <label className="win-btn" style={{ display: 'inline-block', cursor: 'pointer', textAlign: 'center' }}>
                Load Meme-GIF File
                <input type="file" accept="image/gif" hidden onChange={handleGifUpload} />
              </label>
              <button className="win-btn" onClick={onBack}>Cancel</button>
            </div>
          </div>
        )}

        {phase === 'scan' && (
          <div className="flex-col">
            <p style={{ margin: '0 0 10px 0' }}>Point camera at the Sender's Animated QR.</p>
            <div className="scanner-overlay" style={{ position: 'relative' }}>
              <video ref={videoRef} playsInline muted></video>
              <div style={{ position: 'absolute', top: '50%', width: '100%', height: '2px', background: 'red', boxShadow: '0 0 5px red' }}></div>
            </div>
            <div style={{ border: 'inset 2px', background: 'white', height: '14px', marginTop: '10px', position: 'relative' }}>
              <div style={{ background: '#000080', height: '100%', width: `${scanProgress}%`, transition: 'width 0.2s' }}></div>
              <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', fontSize: '10px', color: scanProgress > 50 ? 'white' : 'black', fontWeight: 'bold' }}>
                {scanProgress}%
              </span>
            </div>
            <button className="win-btn mt-1" onClick={() => setPhase('select')}>Cancel</button>
          </div>
        )}

        {phase === 'success' && (
          <div className="text-center flex-col">
            <h2 style={{ color: '#008000', margin: '10px 0' }}>SUCCESS</h2>
            <p>
              {isOnline 
                ? "Transaction has been broadcasted to the network." 
                : "Transaction saved as Pending! It will automatically broadcast when this device connects to the internet."}
            </p>
            <button className="win-btn" style={{ fontWeight: 'bold' }} onClick={onBack}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
