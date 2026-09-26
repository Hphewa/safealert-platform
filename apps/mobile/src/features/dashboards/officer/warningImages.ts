import type { ImagePickerAsset } from 'expo-image-picker';
import { WARNING_FIELD_LIMITS, WARNING_IMAGE_MAX_BYTES, type WarningImageMimeType } from '@safealert/contracts';

export type WarningPhoto = { uri: string; base64: string; mimeType: WarningImageMimeType };

export function addWarningPhotos(current: WarningPhoto[], assets: ImagePickerAsset[]): WarningPhoto[] {
  const photos = [...current];
  for (const asset of assets) {
    if (photos.some((photo) => photo.uri === asset.uri)) continue;
    if (photos.length >= WARNING_FIELD_LIMITS.attachments) throw new Error('You can add up to 5 images. Remove an image to choose another.');
    if ((asset.type && asset.type !== 'image') || (asset.mimeType && !asset.mimeType.startsWith('image/'))) {
      throw new Error('Choose a JPEG, PNG, or WebP image.');
    }
    const base64 = asset.base64;
    if (!base64 || !asset.uri) throw new Error('This image could not be read. Please choose it again.');
    const size = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (size > WARNING_IMAGE_MAX_BYTES) throw new Error('Each image must be 5 MB or smaller.');
    // Inspect the actual picker output: Expo can convert HEIC source photos to JPEG.
    let header: string;
    try { header = atob(base64.slice(0, 32)); } catch { throw new Error('This image could not be read. Please choose it again.'); }
    const mimeType = header.startsWith('\xff\xd8\xff') ? 'image/jpeg'
      : header.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
        : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!mimeType) throw new Error('Choose a JPEG, PNG, or WebP image.');
    photos.push({ uri: asset.uri, base64, mimeType });
  }
  return photos;
}

export function removeWarningPhoto(photos: WarningPhoto[], uri: string) {
  return photos.filter((photo) => photo.uri !== uri);
}
