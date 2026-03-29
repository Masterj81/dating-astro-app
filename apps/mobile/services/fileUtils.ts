// @ts-expect-error -- legacy subpath re-exports cacheDirectory & EncodingType at runtime
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';

export type FileReadResult = {
  data: ArrayBuffer;
  mimeType: string;
};

const MIME_MAP: Record<string, string> = {
  // Images
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  // Videos
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v',
  webm: 'video/webm', '3gp': 'video/3gpp',
  // Audio
  m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  aac: 'audio/aac', ogg: 'audio/ogg',
};

export function getMimeFromUri(uri: string, blobType?: string): string {
  // Priority to blob type if valid
  if (blobType && blobType !== 'application/octet-stream') {
    return blobType;
  }
  const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0];
  return MIME_MAP[ext || ''] || 'application/octet-stream';
}

export function getExtFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'image/heic': 'heic', 'image/heif': 'heif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v',
    'video/webm': 'webm', 'video/3gpp': '3gp',
    'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav',
    'audio/aac': 'aac', 'audio/ogg': 'ogg',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'bin';
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // Try 1: native blob.arrayBuffer()
  if (typeof blob.arrayBuffer === 'function') {
    try {
      return await blob.arrayBuffer();
    } catch (e) {
      console.warn('blob.arrayBuffer() failed, using FileReader fallback');
    }
  }

  // Try 2: FileReader fallback
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function readFileAsArrayBuffer(uri: string): Promise<FileReadResult> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    const data = await blobToArrayBuffer(blob);
    return { data, mimeType: getMimeFromUri(uri, blob.type) };
  }

  // Native: Try 1 - fetch -> blob -> arrayBuffer
  let cacheUri: string | null = null;

  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const data = await blobToArrayBuffer(blob);
    return { data, mimeType: getMimeFromUri(uri, blob.type) };
  } catch (fetchError) {
    console.warn('fetch() failed for URI, trying FileSystem fallback:', uri);
  }

  // Native: Try 2 - copy to cache then read as base64
  try {
    cacheUri = `${FileSystem.cacheDirectory}upload_temp_${Date.now()}`;
    await FileSystem.copyAsync({ from: uri, to: cacheUri });
    const base64 = await FileSystem.readAsStringAsync(cacheUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return { data: decode(base64), mimeType: getMimeFromUri(uri) };
  } finally {
    // Cleanup cache in all cases
    if (cacheUri) {
      FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
    }
  }
}
