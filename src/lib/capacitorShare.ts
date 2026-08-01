import { Share } from '@capacitor/share';
import { Directory, Filesystem } from '@capacitor/filesystem';

export async function shareGifBlob(blob: Blob, filename: string = 'money_gif.gif') {
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve((reader.result as string).split(',')[1]);
      };
      reader.readAsDataURL(blob);
    });

    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache
    });

    await Share.share({
      title: 'Solana GIF',
      text: 'Scan or open this GIF in the Off-Sol Wallet to claim the transaction!',
      url: writeResult.uri,
    });
  } catch (e) {
    console.error("Failed to share GIF via Capacitor", e);
    
    // Fallback for web browser if Capacitor is not available
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
