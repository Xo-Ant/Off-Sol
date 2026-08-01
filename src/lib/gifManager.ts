import localforage from 'localforage';

const GIF_STORE = localforage.createInstance({
  name: 'offsol_gifs',
  storeName: 'gifs'
});

export interface MemeGif {
  id: string;
  name: string;
  blob: Blob;
  isCustom: boolean;
}

const MAGIC_BYTES = new TextEncoder().encode("OFFSOL_V1:");

export async function injectDataToGif(gifBlob: Blob, data: Uint8Array): Promise<Blob> {
  const gifBuffer = await gifBlob.arrayBuffer();
  
  // Construct the trailer: MAGIC_BYTES + data
  const trailer = new Uint8Array(MAGIC_BYTES.length + data.length);
  trailer.set(MAGIC_BYTES, 0);
  trailer.set(data, MAGIC_BYTES.length);
  
  // We append it to the end of the GIF
  return new Blob([gifBuffer, trailer], { type: 'image/gif' });
}

export async function extractDataFromGif(gifBlob: Blob): Promise<Uint8Array> {
  const buffer = await gifBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  
  // Search for MAGIC_BYTES from the end
  let magicIdx = -1;
  for (let i = bytes.length - MAGIC_BYTES.length; i >= 0; i--) {
    let match = true;
    for (let j = 0; j < MAGIC_BYTES.length; j++) {
      if (bytes[i + j] !== MAGIC_BYTES[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      magicIdx = i;
      break;
    }
  }
  
  if (magicIdx === -1) {
    throw new Error("No encrypted Solana data found in this GIF.");
  }
  
  const payloadStart = magicIdx + MAGIC_BYTES.length;
  return bytes.slice(payloadStart);
}

export async function saveCustomGif(file: File): Promise<MemeGif> {
  const id = `custom_${Date.now()}`;
  const gif: MemeGif = {
    id,
    name: file.name,
    blob: file,
    isCustom: true
  };
  await GIF_STORE.setItem(id, gif);
  return gif;
}

export async function getCustomGifs(): Promise<MemeGif[]> {
  const keys = await GIF_STORE.keys();
  const gifs: MemeGif[] = [];
  for (const key of keys) {
    const item = await GIF_STORE.getItem<MemeGif>(key);
    if (item) gifs.push(item);
  }
  return gifs;
}
