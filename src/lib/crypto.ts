import sodium from 'libsodium-wrappers';
import { PublicKey } from '@solana/web3.js';

export async function encryptForReceiver(
  senderSecretKey: Uint8Array, // 64 bytes Solana Keypair.secretKey
  receiverPublicKey: PublicKey, // 32 bytes
  payload: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;
  
  const senderCurveSk = sodium.crypto_sign_ed25519_sk_to_curve25519(senderSecretKey);
  const receiverCurvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(receiverPublicKey.toBytes());
  
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const ciphertext = sodium.crypto_box_easy(payload, nonce, receiverCurvePk, senderCurveSk);
  
  // Extract sender's Ed25519 public key (last 32 bytes of the secret key)
  const senderPk = senderSecretKey.slice(32);
  
  // Format: [SenderPubKey(32)] [Nonce(24)] [Ciphertext]
  const result = new Uint8Array(32 + nonce.length + ciphertext.length);
  result.set(senderPk, 0);
  result.set(nonce, 32);
  result.set(ciphertext, 32 + nonce.length);
  return result;
}

export async function decryptPayload(
  receiverSecretKey: Uint8Array, // 64 bytes
  encryptedPayload: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;
  
  if (encryptedPayload.length < 32 + sodium.crypto_box_NONCEBYTES) {
    throw new Error("Payload too small to be valid.");
  }

  const senderPk = encryptedPayload.slice(0, 32);
  const nonce = encryptedPayload.slice(32, 32 + sodium.crypto_box_NONCEBYTES);
  const ciphertext = encryptedPayload.slice(32 + sodium.crypto_box_NONCEBYTES);
  
  const receiverCurveSk = sodium.crypto_sign_ed25519_sk_to_curve25519(receiverSecretKey);
  const senderCurvePk = sodium.crypto_sign_ed25519_pk_to_curve25519(senderPk);
  
  return sodium.crypto_box_open_easy(ciphertext, nonce, senderCurvePk, receiverCurveSk);
}
