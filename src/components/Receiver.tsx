import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Connection, PublicKey } from '@solana/web3.js';
import { LTDecoder } from '../lib/fountain';
import { fnv1a, parseFrame } from '../lib/protocol';
import WorkerScript from '../lib/worker?worker';

const OVERHEAD_EST = 1.18;

export default function Receiver({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<'generate' | 'scan' | 'success'>('generate');
  const [pubkeyInput, setPubkeyInput] = useState('');
  const [staticQrUrl, setStaticQrUrl] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [txSignature, setTxSignature] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decoderRef = useRef<LTDecoder | null>(null);
  const sessionIdRef = useRef<number>(0);
  const workersRef = useRef<Worker[]>([]);
  const busyRef = useRef<boolean[]>([]);
  const frameIdRef = useRef(0);
  const doneRef = useRef(false);

  // Generate initial static QR code with Blockhash
  const handleGenerate = async () => {
    try {
      const pubkey = new PublicKey(pubkeyInput);
      const conn = new Connection('https://api.devnet.solana.com');
      const { blockhash } = await conn.getLatestBlockhash();
      
      const payload = JSON.stringify({
        pubkey: pubkey.toBase58(),
        recentBlockhash: blockhash
      });
      
      const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
      setStaticQrUrl(qrDataUrl);
      setPhase('scan');
    } catch (e) {
      setErrorMsg('Invalid Public Key or Network Error.');
    }
  };

  useEffect(() => {
    if (phase === 'scan') {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [phase]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Camera needs a secure context (https).");
      return;
    }
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
          if (bytes) onDecoded(bytes);
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

  const onDecoded = async (bytes: Uint8Array) => {
    if (doneRef.current) return;
    const parsed = parseFrame(bytes);
    if (!parsed) return;
    const { header, block } = parsed;
    
    if (!decoderRef.current || sessionIdRef.current !== header.sessionId) {
      decoderRef.current = new LTDecoder(header.k, header.blockLen, header.sessionId, header.totalLen);
      sessionIdRef.current = header.sessionId;
    }
    
    decoderRef.current.addFrame(header.seq, block);
    const progress = Math.min(100, (decoderRef.current.framesNew / (header.k * OVERHEAD_EST)) * 100);
    setScanProgress(progress);
    
    if (decoderRef.current.isComplete) {
      const payload = decoderRef.current.assemble();
      if (payload && fnv1a(payload) === header.payloadFnv) {
        doneRef.current = true;
        setScanProgress(100);
        await broadcastTransaction(payload);
      }
    }
  };

  const broadcastTransaction = async (rawTxBytes: Uint8Array) => {
    try {
      const conn = new Connection('https://api.devnet.solana.com');
      const signature = await conn.sendRawTransaction(rawTxBytes, { skipPreflight: true });
      setTxSignature(signature);
      setPhase('success');
    } catch (e: any) {
      setErrorMsg("Broadcast failed: " + e.message);
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
      <h2>Receive SOL <span className="badge badge-online">Online</span></h2>
      {errorMsg && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{errorMsg}</div>}
      
      {phase === 'generate' && (
        <>
          <p>Enter your Solana Devnet address to generate the receiver config.</p>
          <div className="input-group">
            <label>Public Key (Base58)</label>
            <input 
              className="input-field" 
              value={pubkeyInput} 
              onChange={e => setPubkeyInput(e.target.value)} 
              placeholder="e.g. 7vJ..." 
            />
          </div>
          <button className="btn btn-primary" onClick={handleGenerate}>
            Generate Code
          </button>
        </>
      )}

      {phase === 'scan' && (
        <>
          <p>Step 1: The offline sender must scan this QR to get your address and the blockhash.</p>
          <div className="qr-container">
            <img src={staticQrUrl} alt="Receiver Config QR" />
          </div>
          
          <p className="mt-2">Step 2: Point this camera at the Sender's animated QR.</p>
          <div className="scanner-overlay">
            <video ref={videoRef} playsInline muted></video>
            <div className="scan-line"></div>
          </div>
          <div style={{ marginTop: '1rem', background: '#333', borderRadius: '10px', height: '10px', overflow: 'hidden' }}>
            <div style={{ background: 'var(--accent-color)', height: '10px', width: `${scanProgress}%`, transition: 'width 0.2s' }}></div>
          </div>
          <p className="mt-1">{scanProgress.toFixed(0)}% Received</p>
        </>
      )}

      {phase === 'success' && (
        <div className="text-center">
          <div style={{ color: 'var(--accent-color)', fontSize: '4rem', marginBottom: '1rem' }}>✓</div>
          <h3>Transfer Complete!</h3>
          <p>Transaction successfully broadcasted.</p>
          <p style={{ wordBreak: 'break-all', fontSize: '0.8rem', opacity: 0.7 }}>
            <a href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`} target="_blank" rel="noreferrer" style={{color: 'var(--accent-color)'}}>
              {txSignature}
            </a>
          </p>
        </div>
      )}

      <button className="btn mt-2" onClick={onBack}>Cancel</button>
    </div>
  );
}
