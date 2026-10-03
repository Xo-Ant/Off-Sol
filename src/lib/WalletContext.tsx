import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, NONCE_ACCOUNT_LENGTH } from '@solana/web3.js';
import bs58 from 'bs58';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  hasVault, saveVault, openVault, deleteVault,
  hasLegacyPlaintextSecrets, readLegacyPlaintextSecrets, wipeLegacyPlaintextSecrets,
} from './vault';

export type NetworkType = 'mainnet-beta' | 'devnet' | 'testnet';

export interface TokenBalance {
  mint: string;
  ata: string;
  amount: string;
  decimals: number;
  uiAmount: number;
}

interface WalletContextType {
  keypair: Keypair | null;
  balance: number;
  balanceLamports: bigint;
  nonceAccountPubKey: PublicKey | null;
  currentNonce: string | null;
  /** True when currentNonce has not yet been used for an offline-signed tx. */
  nonceAvailable: boolean;
  isOnline: boolean;
  pendingTxs: Uint8Array[];
  mnemonic: string | null;
  tokens: TokenBalance[];
  network: NetworkType;
  rpcUrl: string;
  vaultExists: boolean;
  needsMigration: boolean;
  setNetwork: (n: NetworkType) => void;
  importWalletBase58: (secretKeyBase58: string, password: string) => Promise<void>;
  importWalletMnemonic: (mnemonic: string, password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  migrateLegacy: (password: string) => Promise<void>;
  lock: () => void;
  logout: () => void;
  createNonceAccount: () => Promise<void>;
  markNonceUsed: () => void;
  addPendingTx: (tx: Uint8Array) => void;
  removePendingTx: (index: number) => void;
  broadcastPending: () => Promise<void>;
  refreshState: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({} as WalletContextType);

export const deriveKeypairFromMnemonic = (mnemonic: string): Keypair => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
};

const PENDING_KEY = 'offsol_pending_txs';

function loadPending(): Uint8Array[] {
  const list: Uint8Array[] = [];
  try {
    const saved = localStorage.getItem(PENDING_KEY);
    if (saved) (JSON.parse(saved) as string[]).forEach(s => list.push(bs58.decode(s)));
    // Migrate the old single-slot format.
    const legacy = localStorage.getItem('offsol_pending_tx');
    if (legacy) {
      list.push(bs58.decode(legacy));
      localStorage.removeItem('offsol_pending_tx');
      localStorage.setItem(PENDING_KEY, JSON.stringify(list.map(t => bs58.encode(t))));
    }
  } catch (e) {
    console.error('Invalid saved pending transactions', e);
  }
  return list;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balanceLamports, setBalanceLamports] = useState<bigint>(0n);
  const [nonceAccountPubKey, setNonceAccountPubKey] = useState<PublicKey | null>(null);
  const [currentNonce, setCurrentNonce] = useState<string | null>(null);
  const [usedNonce, setUsedNonce] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingTxs, setPendingTxs] = useState<Uint8Array[]>(loadPending);
  const [mnemonic, setMnemonicState] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [network, setNetworkState] = useState<NetworkType>(() => {
    const saved = localStorage.getItem('offsol_network') as NetworkType | null;
    return saved && ['mainnet-beta', 'devnet', 'testnet'].includes(saved) ? saved : 'devnet';
  });
  const [vaultExists, setVaultExists] = useState<boolean>(hasVault());
  const [needsMigration, setNeedsMigration] = useState<boolean>(hasLegacyPlaintextSecrets());
  const broadcastingRef = useRef(false);

  const rpcUrl = `https://api.${network}.solana.com`;
  const balance = Number(balanceLamports) / 1e9;
  const nonceAvailable = !!currentNonce && currentNonce !== usedNonce;

  const setNetwork = (n: NetworkType) => {
    setNetworkState(n);
    localStorage.setItem('offsol_network', n);
    setTokens([]);
    setBalanceLamports(0n);
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const savedTokens = localStorage.getItem('offsol_tokens');
    if (savedTokens) {
      try { setTokens(JSON.parse(savedTokens)); } catch { /* ignore */ }
    }
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Per-network nonce state is persisted so offline signing works after a restart.
  useEffect(() => {
    const savedNoncePk = localStorage.getItem(`offsol_nonce_pubkey_${network}`);
    setNonceAccountPubKey(savedNoncePk ? new PublicKey(savedNoncePk) : null);
    setCurrentNonce(localStorage.getItem(`offsol_nonce_value_${network}`));
    setUsedNonce(localStorage.getItem(`offsol_nonce_used_${network}`));
  }, [network]);

  useEffect(() => {
    if (keypair && isOnline) refreshState();
  }, [keypair, isOnline, nonceAccountPubKey, network]);

  useEffect(() => {
    if (isOnline && pendingTxs.length > 0) broadcastPending();
  }, [isOnline, pendingTxs.length, network]);

  const persistPending = (list: Uint8Array[]) => {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.map(t => bs58.encode(t))));
  };

  const addPendingTx = (tx: Uint8Array) => {
    setPendingTxs(prev => {
      const key = bs58.encode(tx);
      if (prev.some(p => bs58.encode(p) === key)) return prev; // de-duplicate
      const next = [...prev, tx];
      persistPending(next);
      return next;
    });
  };

  const removePendingTx = (index: number) => {
    setPendingTxs(prev => {
      const next = prev.filter((_, i) => i !== index);
      persistPending(next);
      return next;
    });
  };

  const broadcastPending = async () => {
    if (broadcastingRef.current || !isOnline) return;
    broadcastingRef.current = true;
    const conn = new Connection(rpcUrl, 'confirmed');
    const snapshot = [...pendingTxs];
    const done = new Set<string>();
    const failures: string[] = [];
    for (const tx of snapshot) {
      try {
        const sig = await conn.sendRawTransaction(tx, { skipPreflight: false });
        console.log('Pending transaction broadcasted:', sig);
        done.add(bs58.encode(tx));
      } catch (err: any) {
        failures.push(err?.message ?? String(err));
      }
    }
    if (done.size > 0) {
      setPendingTxs(prev => {
        const next = prev.filter(p => !done.has(bs58.encode(p)));
        persistPending(next);
        return next;
      });
      refreshState();
    }
    if (failures.length > 0) {
      alert(`${failures.length} pending transaction(s) could not be broadcast. They stay in the queue.\n\n` + failures[0]);
    } else if (done.size > 0) {
      alert(`${done.size} pending transaction(s) sent. Check the explorer to confirm they landed.`);
    }
    broadcastingRef.current = false;
  };

  const refreshState = async () => {
    if (!keypair || !isOnline) return;
    const conn = new Connection(rpcUrl);
    try {
      const bal = await conn.getBalance(keypair.publicKey);
      setBalanceLamports(BigInt(bal));

      const tokenAccounts = await conn.getParsedTokenAccountsByOwner(keypair.publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });
      const fetchedTokens: TokenBalance[] = tokenAccounts.value.map(ta => {
        const parsedInfo = ta.account.data.parsed.info;
        return {
          mint: parsedInfo.mint,
          ata: ta.pubkey.toBase58(),
          amount: parsedInfo.tokenAmount.amount,
          decimals: parsedInfo.tokenAmount.decimals,
          uiAmount: parsedInfo.tokenAmount.uiAmount || 0,
        };
      }).filter(t => t.uiAmount > 0);
      setTokens(fetchedTokens);
      localStorage.setItem('offsol_tokens', JSON.stringify(fetchedTokens));

      if (nonceAccountPubKey) {
        const nonceAccount = await conn.getNonce(nonceAccountPubKey, 'confirmed');
        if (nonceAccount) {
          setCurrentNonce(nonceAccount.nonce);
          localStorage.setItem(`offsol_nonce_value_${network}`, nonceAccount.nonce);
          // If the on-chain nonce moved on, the used one has been consumed.
          const used = localStorage.getItem(`offsol_nonce_used_${network}`);
          if (used && used !== nonceAccount.nonce) {
            localStorage.removeItem(`offsol_nonce_used_${network}`);
            setUsedNonce(null);
          }
        }
      }
    } catch (e) {
      console.error('Error refreshing state', e);
    }
  };

  const markNonceUsed = () => {
    if (!currentNonce) return;
    localStorage.setItem(`offsol_nonce_used_${network}`, currentNonce);
    setUsedNonce(currentNonce);
  };

  const activate = (kp: Keypair, m: string | null) => {
    setKeypair(kp);
    setMnemonicState(m);
  };

  const importWalletBase58 = async (secretKeyBase58: string, password: string) => {
    const kp = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
    await saveVault(password, { secretKeyB58: secretKeyBase58, mnemonic: null });
    setVaultExists(true);
    activate(kp, null);
  };

  const importWalletMnemonic = async (mnemonicStr: string, password: string) => {
    const normalized = mnemonicStr.trim().toLowerCase().split(/\s+/).join(' ');
    if (!bip39.validateMnemonic(normalized)) {
      throw new Error('Invalid recovery phrase.');
    }
    const kp = deriveKeypairFromMnemonic(normalized);
    await saveVault(password, { secretKeyB58: bs58.encode(kp.secretKey), mnemonic: normalized });
    setVaultExists(true);
    activate(kp, normalized);
  };

  const unlock = async (password: string) => {
    const secrets = await openVault(password);
    activate(Keypair.fromSecretKey(bs58.decode(secrets.secretKeyB58)), secrets.mnemonic);
  };

  const migrateLegacy = async (password: string) => {
    const legacy = readLegacyPlaintextSecrets();
    if (!legacy) { setNeedsMigration(false); return; }
    const kp = Keypair.fromSecretKey(bs58.decode(legacy.secretKeyB58));
    await saveVault(password, legacy);
    wipeLegacyPlaintextSecrets();
    setVaultExists(true);
    setNeedsMigration(false);
    activate(kp, legacy.mnemonic);
  };

  const lock = () => {
    setKeypair(null);
    setMnemonicState(null);
  };

  const logout = () => {
    deleteVault();
    wipeLegacyPlaintextSecrets();
    (['mainnet-beta', 'devnet', 'testnet'] as NetworkType[]).forEach(n => {
      localStorage.removeItem(`offsol_nonce_pubkey_${n}`);
      localStorage.removeItem(`offsol_nonce_value_${n}`);
      localStorage.removeItem(`offsol_nonce_used_${n}`);
    });
    localStorage.removeItem(PENDING_KEY);
    localStorage.removeItem('offsol_tokens');
    setVaultExists(false);
    setNeedsMigration(false);
    setKeypair(null);
    setBalanceLamports(0n);
    setNonceAccountPubKey(null);
    setCurrentNonce(null);
    setUsedNonce(null);
    setPendingTxs([]);
    setMnemonicState(null);
    setTokens([]);
  };

  const createNonceAccount = async () => {
    if (!keypair || !isOnline) throw new Error('Must be online and logged in.');
    const conn = new Connection(rpcUrl, 'confirmed');
    const nonceAccount = Keypair.generate();
    const minimumAmount = await conn.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
    const tx = new Transaction().add(
      SystemProgram.createNonceAccount({
        fromPubkey: keypair.publicKey,
        noncePubkey: nonceAccount.publicKey,
        authorizedPubkey: keypair.publicKey,
        lamports: minimumAmount,
      })
    );
    const signature = await sendAndConfirmTransaction(conn, tx, [keypair, nonceAccount]);
    console.log('Nonce account created:', signature);
    setNonceAccountPubKey(nonceAccount.publicKey);
    localStorage.setItem(`offsol_nonce_pubkey_${network}`, nonceAccount.publicKey.toBase58());
    await refreshState();
  };

  return (
    <WalletContext.Provider value={{
      keypair, balance, balanceLamports, nonceAccountPubKey, currentNonce, nonceAvailable, isOnline,
      pendingTxs, mnemonic, tokens, network, rpcUrl, vaultExists, needsMigration, setNetwork,
      importWalletBase58, importWalletMnemonic, unlock, migrateLegacy, lock, logout,
      createNonceAccount, markNonceUsed, addPendingTx, removePendingTx, broadcastPending, refreshState,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
