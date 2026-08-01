import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { LTEncoder } from '../lib/fountain';
import { HEADER_LEN, fnv1a, packFrame } from '../lib/protocol';
import type { FrameHeader } from '../lib/protocol';
import WorkerScript from '../lib/worker?worker';

export default function Sender({ onBack }: { onBack: () => void }) {
  const [phase, setPhase] = useState<'scan' | 'form' | 'broadcast'>('scan');
  const [receiverData, setReceiverData] = useState<{ pubkey: string, recentBlockhash: string } | null>(null);
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [amountInput, setAmountInput] = useState('0.1');
  const [errorMsg, setErrorMsg] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const busyRef = useRef<boolean[]>([]);
  const doneRef = useRef(false);
  const frameIdRef = useRef(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const encodeStateRef = useRef<any>(null);

  // Scan Logic
  useEffect(() => {
    if (phase === 'scan') {
      startScanner();
    }
    return () => {
      stopScanner();
    };
  }, [phase]);

  const startScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      workersRef.current = [new WorkerScript()];
      busyRef.current = [false];
      
      workersRef.current[0].onmessage = (e) => {
        const { id, bytes } = e.data;
        if (id === -1) return;
        busyRef.current[0] = false;
        if (bytes) onScannedConfig(bytes);
      };
      
      doneRef.current = false;
      requestAnimationFrame(captureScannerLoop);
    } catch (e: any) {
      setErrorMsg("Scanner error: " + e.message);
    }
  };

  const captureScannerLoop = () => {
    if (doneRef.current || !videoRef.current) return;
    const v = videoRef.current;
    if (v.videoWidth && v.videoHeight && !busyRef.current[0]) {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, v.videoWidth, v.videoHeight);
        busyRef.current[0] = true;
        workersRef.current[0].postMessage(
          { id: frameIdRef.current++, buf: img.data.buffer, w: v.videoWidth, h: v.videoHeight },
          [img.data.buffer]
        );
      }
    }
    requestAnimationFrame(captureScannerLoop);
  };

  const onScannedConfig = (bytes: Uint8Array) => {
    if (doneRef.current) return;
    try {
      const text = new TextDecoder().decode(bytes);
      const data = JSON.parse(text);
      if (data.pubkey && data.recentBlockhash) {
        setReceiverData(data);
        stopScanner();
        setPhase('form');
      }
    } catch (e) {
      // not the right QR, ignore
    }
  };

  const stopScanner = () => {
    doneRef.current = true;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    workersRef.current.forEach(w => w.terminate());
  };

  // Broadcast Logic
  const handleSignAndBroadcast = async () => {
    try {
      if (!receiverData) return;
      const senderKp = Keypair.fromSecretKey(bs58.decode(secretKeyInput));
      const receiverPubkey = new PublicKey(receiverData.pubkey);
      const lamports = parseFloat(amountInput) * LAMPORTS_PER_SOL;
      
      const tx = new Transaction({ 
        recentBlockhash: receiverData.recentBlockhash, 
        feePayer: senderKp.publicKey 
      }).add(
        SystemProgram.transfer({
          fromPubkey: senderKp.publicKey,
          toPubkey: receiverPubkey,
          lamports
        })
      );
      
      tx.sign(senderKp);
      const rawTx = tx.serialize();
      
      // Start fountain encode
      const sessionId = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
      const frameBytes = 800; // safe chunk size
      const blockLen = frameBytes - HEADER_LEN;
      const encoder = new LTEncoder(rawTx, blockLen, sessionId);
      
      const header: FrameHeader = {
        sessionId,
        seq: 0,
        k: encoder.k,
        blockLen,
        totalLen: rawTx.length,
        payloadFnv: fnv1a(rawTx),
      };
      
      encodeStateRef.current = { encoder, header, nextSeq: 0, version: undefined, modules: 0, scale: 1, active: true };
      setPhase('broadcast');
    } catch (e: any) {
      setErrorMsg("Failed to sign: " + e.message);
    }
  };

  useEffect(() => {
    if (phase === 'broadcast') {
      const state = encodeStateRef.current;
      if (!state) return;
      
      const MARGIN = 4;
      const staging = document.createElement("canvas");
      let nextAt = performance.now();
      const interval = 1000 / 15; // 15 fps
      
      const makeFrame = (): ImageData => {
        const bytes = packFrame({ ...state.header, seq: state.nextSeq }, state.encoder.encode(state.nextSeq));
        state.nextSeq++;
        
        const qr = QRCode.create([{ data: bytes, mode: "byte" } as unknown as QRCode.QRCodeSegment], {
          errorCorrectionLevel: "L",
          version: state.version,
          maskPattern: 4,
        });
        
        if (state.version === undefined) {
          state.version = qr.version;
          state.modules = qr.modules.size;
          const cssBudget = 300;
          const total = state.modules + 2 * MARGIN;
          state.scale = Math.max(1, Math.floor(cssBudget / total));
          
          staging.width = total;
          staging.height = total;
          if (canvasRef.current) {
            canvasRef.current.width = total * state.scale;
            canvasRef.current.height = total * state.scale;
            canvasRef.current.style.width = `${total * state.scale}px`;
          }
        }
        
        const size = qr.modules.size;
        const data = qr.modules.data;
        const total = size + 2 * MARGIN;
        const img = new ImageData(total, total);
        const px = new Uint32Array(img.data.buffer);
        px.fill(0xffffffff);
        for (let y = 0; y < size; y++) {
          const row = (y + MARGIN) * total + MARGIN;
          const src = y * size;
          for (let x = 0; x < size; x++) {
            if (data[src + x]) px[row + x] = 0xff000000;
          }
        }
        return img;
      };

      const tick = (now: number) => {
        if (!state.active) return;
        requestAnimationFrame(tick);
        if (now < nextAt) return;
        
        const img = makeFrame();
        staging.getContext("2d")!.putImageData(img, 0, 0);
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d")!;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(staging, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }
        
        nextAt += interval;
        if (now - nextAt > 3 * interval) nextAt = now + interval;
      };
      
      requestAnimationFrame(tick);
      
      return () => {
        state.active = false;
      };
    }
  }, [phase]);

  return (
    <div className="flex-col">
      <h2>Send SOL <span className="badge badge-offline">Offline</span></h2>
      {errorMsg && <div style={{ color: 'var(--danger)', marginBottom: '1rem' }}>{errorMsg}</div>}
      
      {phase === 'scan' && (
        <>
          <p>Scan the Receiver's configuration QR code to begin.</p>
          <div className="scanner-overlay">
            <video ref={videoRef} playsInline muted></video>
            <div className="scan-line"></div>
          </div>
        </>
      )}

      {phase === 'form' && receiverData && (
        <>
          <div className="input-group">
            <label>Recipient Address</label>
            <input className="input-field" value={receiverData.pubkey} disabled />
          </div>
          <div className="input-group">
            <label>Amount (SOL)</label>
            <input 
              className="input-field" 
              type="number"
              value={amountInput} 
              onChange={e => setAmountInput(e.target.value)} 
            />
          </div>
          <div className="input-group">
            <label>Your Secret Key (Base58)</label>
            <input 
              className="input-field" 
              type="password"
              placeholder="Never shared online..."
              value={secretKeyInput} 
              onChange={e => setSecretKeyInput(e.target.value)} 
            />
          </div>
          <button className="btn btn-primary" onClick={handleSignAndBroadcast}>
            Sign & Broadcast
          </button>
        </>
      )}

      {phase === 'broadcast' && (
        <div className="text-center">
          <p>Broadcasting transaction... Point the Receiver's camera here.</p>
          <div className="qr-container">
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>
      )}

      <button className="btn mt-2" onClick={onBack}>Cancel</button>
    </div>
  );
}
