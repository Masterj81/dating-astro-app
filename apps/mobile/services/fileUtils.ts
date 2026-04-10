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

// Magic number signatures for file type validation
const MAGIC_NUMBERS: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0xFF, 0xD8, 0xFF], mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47], mime: 'image/png' },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // RIFF header (WebP)
  { bytes: [0x47, 0x49, 0x46], mime: 'image/gif' },
  { bytes: [0x00, 0x00, 0x00], mime: 'video/mp4' }, // ftyp box (approx)
];

const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime',
  'audio/mp4', 'audio/mpeg',
]);

export function validateFileSignature(data: ArrayBuffer): string | null {
  const header = new Uint8Array(data.slice(0, 8));
  for (const { bytes, mime } of MAGIC_NUMBERS) {
    if (bytes.every((b, i) => header[i] === b)) {
      return mime;
    }
  }
  return null;
}

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_UPLOAD_MIMES.has(mime);
}

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

/** Maximum upload file size in bytes (10 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

export async function readFileAsArrayBuffer(uri: string): Promise<FileReadResult> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }
    const data = await blobToArrayBuffer(blob);
    return { data, mimeType: getMimeFromUri(uri, blob.type) };
  }

  // Native: Try 1 - fetch -> blob -> arrayBuffer
  let cacheUri: string | null = null;

  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }
    const data = await blobToArrayBuffer(blob);
    return { data, mimeType: getMimeFromUri(uri, blob.type) };
  } catch (fetchError) {
    if (fetchError instanceof Error && fetchError.message === 'FILE_TOO_LARGE') {
      throw fetchError;
    }
    console.warn('fetch() failed for URI, trying FileSystem fallback:', uri);
  }

  // Native: Try 2 - copy to cache then read as base64
  try {
    cacheUri = `${FileSystem.cacheDirectory}upload_temp_${Date.now()}`;
    await FileSystem.copyAsync({ from: uri, to: cacheUri });

    // Check file size before reading into memory
    const fileInfo = await FileSystem.getInfoAsync(cacheUri);
    if (fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number' && fileInfo.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }

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
