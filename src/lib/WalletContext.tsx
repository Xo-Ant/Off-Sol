import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, NONCE_ACCOUNT_LENGTH } from '@solana/web3.js';
import bs58 from 'bs58';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
  nonceAccountPubKey: PublicKey | null;
  currentNonce: string | null;
  isOnline: boolean;
  pendingTx: Uint8Array | null;
  mnemonic: string | null;
  tokens: TokenBalance[];
  createWallet: () => { mnemonic: string, keypair: Keypair };
  importWalletBase58: (secretKeyBase58: string) => void;
  importWalletMnemonic: (mnemonic: string) => void;
  logout: () => void;
  createNonceAccount: () => Promise<void>;
  setPendingTx: (tx: Uint8Array | null) => void;
  refreshState: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType>({} as WalletContextType);

export const deriveKeypairFromMnemonic = (mnemonic: string): Keypair => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
  return Keypair.fromSeed(derivedSeed);
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [nonceAccountPubKey, setNonceAccountPubKey] = useState<PublicKey | null>(null);
  const [currentNonce, setCurrentNonce] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingTx, setPendingTxState] = useState<Uint8Array | null>(null);
  const [mnemonic, setMnemonicState] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const savedKey = localStorage.getItem('offsol_secret');
    if (savedKey) {
      try {
        const kp = Keypair.fromSecretKey(bs58.decode(savedKey));
        setKeypair(kp);
      } catch (e) {
        console.error("Invalid saved key");
        localStorage.removeItem('offsol_secret');
      }
    }

    const savedNonce = localStorage.getItem('offsol_nonce_pubkey');
    if (savedNonce) {
      setNonceAccountPubKey(new PublicKey(savedNonce));
    }

    const savedPending = localStorage.getItem('offsol_pending_tx');
    if (savedPending) {
      setPendingTxState(bs58.decode(savedPending));
    }

    const savedMnemonic = localStorage.getItem('offsol_mnemonic');
    if (savedMnemonic) {
      setMnemonicState(savedMnemonic);
    }

    const savedTokens = localStorage.getItem('offsol_tokens');
    if (savedTokens) {
      try {
        setTokens(JSON.parse(savedTokens));
      } catch (e) {
        console.error("Invalid saved tokens");
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (keypair && isOnline) {
      refreshState();
    }
  }, [keypair, isOnline, nonceAccountPubKey]);

  useEffect(() => {
    // Auto broadcast pending tx when coming online
    if (isOnline && pendingTx) {
      const conn = new Connection('https://api.devnet.solana.com');
      conn.sendRawTransaction(pendingTx, { skipPreflight: true })
        .then(sig => {
          console.log("Pending transaction broadcasted!", sig);
          setPendingTx(null);
          refreshState();
          alert("Pending transaction successfully broadcasted!");
        })
        .catch(err => {
          console.error("Failed to broadcast pending tx", err);
          alert("Failed to broadcast pending tx: " + err.message);
        });
    }
  }, [isOnline, pendingTx]);

  const refreshState = async () => {
    if (!keypair || !isOnline) return;
    const conn = new Connection('https://api.devnet.solana.com');
    try {
      const bal = await conn.getBalance(keypair.publicKey);
      setBalance(bal / 1e9);

      const tokenAccounts = await conn.getParsedTokenAccountsByOwner(keypair.publicKey, {
        programId: TOKEN_PROGRAM_ID
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
        const accountInfo = await conn.getAccountInfo(nonceAccountPubKey);
        if (accountInfo) {
          const nonceAccount = await conn.getNonce(nonceAccountPubKey, 'confirmed');
          if (nonceAccount) {
            setCurrentNonce(nonceAccount.nonce);
          }
        }
      }
    } catch (e) {
      console.error("Error refreshing state", e);
    }
  };

  const createWallet = () => {
    const mnemonicStr = bip39.generateMnemonic();
    const kp = deriveKeypairFromMnemonic(mnemonicStr);
    localStorage.setItem('offsol_secret', bs58.encode(kp.secretKey));
    localStorage.setItem('offsol_mnemonic', mnemonicStr);
    setKeypair(kp);
    setMnemonicState(mnemonicStr);
    return { mnemonic: mnemonicStr, keypair: kp };
  };

  const importWalletBase58 = (secretKeyBase58: string) => {
    const kp = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
    localStorage.setItem('offsol_secret', secretKeyBase58);
    localStorage.removeItem('offsol_mnemonic'); // Clear any old mnemonic
    setKeypair(kp);
    setMnemonicState(null);
  };

  const importWalletMnemonic = (mnemonicStr: string) => {
    if (!bip39.validateMnemonic(mnemonicStr)) {
      throw new Error("Invalid 12-word recovery phrase.");
    }
    const kp = deriveKeypairFromMnemonic(mnemonicStr);
    localStorage.setItem('offsol_secret', bs58.encode(kp.secretKey));
    localStorage.setItem('offsol_mnemonic', mnemonicStr);
    setKeypair(kp);
    setMnemonicState(mnemonicStr);
  };

  const logout = () => {
    localStorage.removeItem('offsol_secret');
    localStorage.removeItem('offsol_nonce_pubkey');
    localStorage.removeItem('offsol_pending_tx');
    localStorage.removeItem('offsol_mnemonic');
    setKeypair(null);
    setBalance(0);
    setNonceAccountPubKey(null);
    setCurrentNonce(null);
    setPendingTxState(null);
    setMnemonicState(null);
    setTokens([]);
    localStorage.removeItem('offsol_tokens');
  };

  const createNonceAccount = async () => {
    if (!keypair || !isOnline) throw new Error("Must be online and logged in.");
    const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
    
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
    console.log("Nonce account created:", signature);
    
    setNonceAccountPubKey(nonceAccount.publicKey);
    localStorage.setItem('offsol_nonce_pubkey', nonceAccount.publicKey.toBase58());
    await refreshState();
  };

  const setPendingTx = (tx: Uint8Array | null) => {
    setPendingTxState(tx);
    if (tx) {
      localStorage.setItem('offsol_pending_tx', bs58.encode(tx));
    } else {
      localStorage.removeItem('offsol_pending_tx');
    }
  };

  return (
    <WalletContext.Provider value={{
      keypair, balance, nonceAccountPubKey, currentNonce, isOnline, pendingTx, mnemonic, tokens,
      createWallet, importWalletBase58, importWalletMnemonic, logout, createNonceAccount, setPendingTx, refreshState
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
