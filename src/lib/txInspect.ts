import { PublicKey, SystemInstruction, SystemProgram, Transaction } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, decodeTransferInstruction } from '@solana/spl-token';

export interface IncomingTransfer {
  from: string;
  kind: 'SOL' | 'TOKEN';
  amount: bigint; // lamports for SOL, raw base units for tokens
  mint?: string;
  usesDurableNonce: boolean;
}

// Decode a signed transaction received from a sender and make sure it is a
// payment to `me`. Throws if signatures are invalid or nothing is sent to us.
export function inspectIncomingTx(rawTx: Uint8Array, me: PublicKey): IncomingTransfer {
  const tx = Transaction.from(rawTx);

  if (!tx.feePayer) throw new Error('Transaction has no fee payer.');
  if (!tx.verifySignatures()) {
    throw new Error('Transaction signature is invalid or missing.');
  }

  let usesDurableNonce = false;
  let solToMe = 0n;
  let tokenToMe = 0n;
  let mint: string | undefined;

  // Map of ATA -> { owner, mint } taken from createAssociatedTokenAccount instructions.
  const ataInfo = new Map<string, { owner: string; mint: string }>();
  for (const ix of tx.instructions) {
    if (ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) && ix.keys.length >= 4) {
      ataInfo.set(ix.keys[1].pubkey.toBase58(), {
        owner: ix.keys[2].pubkey.toBase58(),
        mint: ix.keys[3].pubkey.toBase58(),
      });
    }
  }

  tx.instructions.forEach((ix, i) => {
    if (ix.programId.equals(SystemProgram.programId)) {
      const type = SystemInstruction.decodeInstructionType(ix);
      if (type === 'AdvanceNonceAccount' && i === 0) usesDurableNonce = true;
      if (type === 'Transfer') {
        const t = SystemInstruction.decodeTransfer(ix);
        if (t.toPubkey.equals(me)) solToMe += BigInt(t.lamports.toString());
      }
    } else if (ix.programId.equals(TOKEN_PROGRAM_ID)) {
      try {
        const t = decodeTransferInstruction(ix, TOKEN_PROGRAM_ID);
        const info = ataInfo.get(t.keys.destination.pubkey.toBase58());
        if (info && info.owner === me.toBase58()) {
          tokenToMe += BigInt(t.data.amount.toString());
          mint = info.mint;
        }
      } catch {
        // Not a plain Transfer instruction; ignore.
      }
    }
  });

  const from = tx.feePayer.toBase58();
  if (solToMe > 0n) return { from, kind: 'SOL', amount: solToMe, usesDurableNonce };
  if (tokenToMe > 0n) return { from, kind: 'TOKEN', amount: tokenToMe, mint, usesDurableNonce };
  throw new Error('This transaction does not send anything to your address.');
}
