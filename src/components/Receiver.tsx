import { useEffect, useRef, useState } from 'react';
import { useWallet } from '../lib/WalletContext';
import { Connection } from '@solana/web3.js';
import { URDecoder } from '@ngraveio/bc-ur';
import WorkerScript from '../lib/worker?worker';

export default function Receiver({ onBack }: { onBack: () => void }) {
  const { isOnline, setPendingTx, refreshState } = useWallet();
  const [phase, setPhase] = useState<'scan' | 'success'>('scan');
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
    return () => stopCamera();
  }, [phase]);

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
    if (doneRef.current || !decoderRef.current) return;
    
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
          const rawTxBuffer = ur.decodeCBOR(); // Returns Buffer
          const rawTx = new Uint8Array(rawTxBuffer);
          
          await processTransaction(rawTx);
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
        console.log("Broadcasted immediately:", signature);
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
    <div className="flex-col">
      <h2>Receive SOL</h2>
      <p style={{ opacity: 0.8, fontSize: '0.9rem' }}>
        Status: <strong style={{ color: isOnline ? 'var(--accent-color)' : '#ffa500' }}>
          {isOnline ? 'Online (Broadcasts immediately)' : 'Offline (Saves to Pending Tx)'}
        </strong>
      </p>

      {errorMsg && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{errorMsg}</div>}

      {phase === 'scan' && (
        <div className="card">
          <p className="mt-2">Point camera at the Sender's Animated QR.</p>
          <div className="scanner-overlay" style={{ marginTop: '1rem' }}>
            <video ref={videoRef} playsInline muted></video>
            <div className="scan-line"></div>
          </div>
          <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--accent-color)', height: '10px', width: `${scanProgress}%`, transition: 'width 0.2s' }}></div>
          </div>
          <p className="mt-1 text-center">{scanProgress.toFixed(0)}% Received</p>
        </div>
      )}

      {phase === 'success' && (
        <div className="text-center card">
          <div style={{ color: 'var(--accent-color)', fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
          <h3>Transfer Received!</h3>
          <p>
            {isOnline 
              ? "Transaction has been broadcasted to the network." 
              : "Transaction saved as Pending! It will automatically broadcast when this device connects to the internet."}
          </p>
        </div>
      )}

      <button className="btn mt-2" onClick={onBack}>Back to Dashboard</button>
    </div>
  );
}
