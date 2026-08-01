import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, NONCE_ACCOUNT_LENGTH } from '@solana/web3.js';
import bs58 from 'bs58';

interface WalletContextState {
  keypair: Keypair | null;
  isOnline: boolean;
  balance: number;
  nonceAccountPubKey: PublicKey | null;
  currentNonce: string | null;
  login: (secret: string) => void;
  logout: () => void;
  refreshState: () => Promise<void>;
  createNonceAccount: () => Promise<void>;
  pendingTx: Uint8Array | null;
  setPendingTx: (tx: Uint8Array | null) => void;
}

const WalletContext = createContext<WalletContextState | null>(null);

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("Missing WalletContext");
  return ctx;
};

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [balance, setBalance] = useState<number>(0);
  const [nonceAccountPubKey, setNonceAccountPubKey] = useState<PublicKey | null>(null);
  const [currentNonce, setCurrentNonce] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<Uint8Array | null>(null);

  const rpc = 'https://api.devnet.solana.com';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Load state from local storage
    const storedSecret = localStorage.getItem('wallet_secret');
    if (storedSecret) {
      try {
        const kp = Keypair.fromSecretKey(bs58.decode(storedSecret));
        setKeypair(kp);
      } catch (e) {
        localStorage.removeItem('wallet_secret');
      }
    }

    const storedNonceKey = localStorage.getItem('nonce_pubkey');
    if (storedNonceKey) {
      setNonceAccountPubKey(new PublicKey(storedNonceKey));
    }
    
    const storedPending = localStorage.getItem('pending_tx');
    if (storedPending) {
      setPendingTx(bs58.decode(storedPending));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && keypair) {
      refreshState();
    }
  }, [isOnline, keypair]);

  // If online and we have a pending TX, broadcast it!
  useEffect(() => {
    if (isOnline && pendingTx) {
      const broadcastPending = async () => {
        try {
          const conn = new Connection(rpc, 'confirmed');
          const sig = await conn.sendRawTransaction(pendingTx);
          await conn.confirmTransaction(sig);
          console.log("Broadcasted pending TX:", sig);
          setPendingTx(null);
          localStorage.removeItem('pending_tx');
          refreshState();
        } catch (e) {
          console.error("Failed to broadcast pending tx", e);
        }
      };
      broadcastPending();
    }
  }, [isOnline, pendingTx]);

  const login = (secret: string) => {
    const kp = Keypair.fromSecretKey(bs58.decode(secret));
    setKeypair(kp);
    localStorage.setItem('wallet_secret', secret);
    setNonceAccountPubKey(null);
    setCurrentNonce(null);
    localStorage.removeItem('nonce_pubkey');
    refreshState();
  };

  const logout = () => {
    setKeypair(null);
    setBalance(0);
    setNonceAccountPubKey(null);
    setCurrentNonce(null);
    localStorage.removeItem('wallet_secret');
    localStorage.removeItem('nonce_pubkey');
  };

  const refreshState = async () => {
    if (!keypair || !isOnline) return;
    const conn = new Connection(rpc, 'confirmed');
    
    // Get balance
    const bal = await conn.getBalance(keypair.publicKey);
    setBalance(bal / 1e9);

    // Check nonce
    if (nonceAccountPubKey) {
      try {
        const accountInfo = await conn.getAccountInfo(nonceAccountPubKey);
        if (accountInfo) {
          const nonceAccount = await conn.getNonce(
            nonceAccountPubKey,
            'confirmed'
          );
          if (nonceAccount) {
             setCurrentNonce(nonceAccount.nonce);
          }
        }
      } catch (e) {
        console.error("Failed to fetch nonce", e);
      }
    }
  };

  const createNonceAccount = async () => {
    if (!keypair || !isOnline) return;
    try {
      const conn = new Connection(rpc, 'confirmed');
      const nonceAccount = Keypair.generate();
      const minimumAmount = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
      
      const { blockhash } = await conn.getLatestBlockhash();
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey }).add(
        SystemProgram.createNonceAccount({
          fromPubkey: keypair.publicKey,
          noncePubkey: nonceAccount.publicKey,
          authorizedPubkey: keypair.publicKey,
          lamports: minimumAmount,
        })
      );
      
      await sendAndConfirmTransaction(conn, tx, [keypair, nonceAccount]);
      
      setNonceAccountPubKey(nonceAccount.publicKey);
      localStorage.setItem('nonce_pubkey', nonceAccount.publicKey.toBase58());
      
      await refreshState();
    } catch (e) {
      console.error("Failed to create nonce account", e);
      throw e;
    }
  };

  const savePendingTx = (tx: Uint8Array | null) => {
    setPendingTx(tx);
    if (tx) {
      localStorage.setItem('pending_tx', bs58.encode(tx));
    } else {
      localStorage.removeItem('pending_tx');
    }
  };

  return (
    <WalletContext.Provider value={{
      keypair,
      isOnline,
      balance,
      nonceAccountPubKey,
      currentNonce,
      login,
      logout,
      refreshState,
      createNonceAccount,
      pendingTx,
      setPendingTx: savePendingTx
    }}>
      {children}
    </WalletContext.Provider>
  );
};
