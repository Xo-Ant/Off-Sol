// Password-encrypted key vault.
// Secrets are never written to storage in plaintext. They are encrypted with
// AES-256-GCM using a key derived from the user's password via PBKDF2-SHA256.

const VAULT_KEY = 'offsol_vault';
const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;

export interface VaultSecrets {
  secretKeyB58: string;
  mnemonic: string | null;
}

interface VaultBlob {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function hasVault(): boolean {
  try {
    return localStorage.getItem(VAULT_KEY) !== null;
  } catch {
    return false;
  }
}

export async function saveVault(password: string, secrets: VaultSecrets): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(secrets));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const blob: VaultBlob = { v: 1, iter: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

export async function openVault(password: string): Promise<VaultSecrets> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) throw new Error('No wallet found on this device.');
  const blob = JSON.parse(raw) as VaultBlob;
  const key = await deriveKey(password, fromB64(blob.salt), blob.iter);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(blob.iv) as BufferSource }, key, fromB64(blob.ct) as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(pt)) as VaultSecrets;
  } catch {
    throw new Error('Wrong password.');
  }
}

export function deleteVault(): void {
  localStorage.removeItem(VAULT_KEY);
}

// --- Migration from versions that stored secrets in plaintext ---

export function hasLegacyPlaintextSecrets(): boolean {
  try {
    return localStorage.getItem('offsol_secret') !== null;
  } catch {
    return false;
  }
}

export function readLegacyPlaintextSecrets(): VaultSecrets | null {
  const secretKeyB58 = localStorage.getItem('offsol_secret');
  if (!secretKeyB58) return null;
  return { secretKeyB58, mnemonic: localStorage.getItem('offsol_mnemonic') };
}

export function wipeLegacyPlaintextSecrets(): void {
  localStorage.removeItem('offsol_secret');
  localStorage.removeItem('offsol_mnemonic');
}
