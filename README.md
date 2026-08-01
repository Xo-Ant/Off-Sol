# Off-Sol: Unbreakable Offline Solana Wallet

![Solana](https://img.shields.io/badge/Solana-362D59?style=for-the-badge&logo=solana&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Capacitor](https://img.shields.io/badge/Capacitor-119EFF?style=for-the-badge&logo=Capacitor&logoColor=white)
![Security](https://img.shields.io/badge/Security-Military%20Grade-red?style=for-the-badge)

Off-Sol is a futuristic, highly secure Mobile Wallet for Solana that allows you to sign and transfer transactions in completely **Air-Gapped (Zero-Connection)** environments. It utilizes Solana's Durable Nonce feature, the BC-UR hardware wallet standard, and advanced Asymmetric Steganography to transfer value without any active internet, Wi-Fi, or Cellular connection.

## 🌟 Core Features

1. **Air-Gapped Optical Transfer (Fountain QR):** Transfer SOL via high-speed, fluid animated QR codes using the `@ngraveio/bc-ur` protocol. No radio waves required.
2. **Meme-GIF Steganography:** Hide your encrypted Solana transactions invisibly inside the Metadata/EOF of funny Meme GIFs. Send the GIF via Bluetooth or NFC. The visual GIF remains completely untouched.
3. **Durable Nonce Architecture:** Prepare your offline ammunition beforehand. Sign transactions completely offline without worrying about blockhash expiration.
4. **Capacitor Native Integration:** Compiles to a fully native Android APK with direct access to hardware cameras and system Share Sheets.

---

## 🔒 Security Architecture (Military Grade)

Off-Sol employs an uncompromising approach to transaction security, ensuring that your funds are safe even if your transaction payloads are intercepted by hackers.

### Asymmetric Encryption (Libsodium / TweetNaCl)
Every transaction—whether displayed on screen as a QR or embedded in a GIF—is protected by **X25519 Curve Cryptography**.

1. **Key Exchange:** The sender's Ed25519 Secret Key and the recipient's Ed25519 Public Key (Wallet Address) are cryptographically converted to Curve25519.
2. **Payload Locking:** The raw Solana transaction is encrypted using `libsodium.crypto_box_easy`. 
3. **Impenetrable:** The resulting encrypted payload can **ONLY** be decrypted by the intended recipient's Private Key. If a GIF is sent to the wrong Bluetooth device, or intercepted by a hacker, it is mathematically impossible for them to extract or broadcast the transaction.

```mermaid
sequenceDiagram
    participant Sender as Sender Wallet
    participant Crypto as NaCl Crypto Box
    participant Medium as GIF / Fountain QR
    participant Receiver as Receiver Wallet

    Sender->>Crypto: Raw Signed Transaction
    Note over Sender,Crypto: Uses Sender Secret + Receiver Public Key
    Crypto->>Medium: Encrypted Ciphertext
    Medium-->>Receiver: Transfer via Air-Gap (Optical/Bluetooth)
    Note over Receiver: Tries to open with Receiver Secret Key
    Receiver->>Crypto: Decrypt Ciphertext
    Crypto->>Receiver: Raw Transaction Restored!
    Receiver->>Solana Network: Broadcast (When Online)
```

---

## 🏗️ Technical Flows

### 1. Fountain QR (Optical) Flow
For face-to-face transfers.

```mermaid
graph TD
    A[Sign TX with Durable Nonce] --> B(Encrypt payload with Recipient's Public Key);
    B --> C{BC-UR Encoder};
    C -->|Part 1| D[Screen QR Frame 1];
    C -->|Part 2| E[Screen QR Frame 2];
    C -->|Part N| F[Screen QR Frame N];
    D -.-> G((Receiver Camera));
    E -.-> G;
    F -.-> G;
    G --> H[Decrypt & Broadcast];
```

### 2. Meme-GIF (Steganography) Flow
For offline transfers via files (Bluetooth/NFC).

```mermaid
graph TD
    A[Sign & Encrypt TX] --> B(Select GIF from Local Library);
    B --> C[Inject Ciphertext to GIF EOF/Metadata];
    C --> D[Share via Capacitor Share Sheet];
    D --> E((Bluetooth / NFC / AirDrop));
    E --> F[Receiver Saves GIF];
    F --> G[Extract Data from Metadata];
    G --> H[Decrypt & Broadcast];
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Android Studio (For APK compilation)
- Vite

### Development
```bash
npm install
npm run dev
```

### Build APK (Android)
```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```
*The compiled APK will be available in `android/app/build/outputs/apk/debug/`.*

---
*Built with ❤️ for the Solana Ecosystem.*
