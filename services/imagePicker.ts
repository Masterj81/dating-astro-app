import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type ImagePickerResult = {
  cancelled: boolean;
  uri?: string;
  width?: number;
  height?: number;
};

/**
 * Cross-platform image picker
 * Uses expo-image-picker on native, file input on web
 */
export async function pickImage(options?: {
  aspect?: [number, number];
  quality?: number;
}): Promise<ImagePickerResult> {
  const { aspect = [3, 4], quality = 0.8 } = options || {};

  if (Platform.OS === 'web') {
    return pickImageWeb();
  }

  return pickImageNative(aspect, quality);
}

async function pickImageNative(
  aspect: [number, number],
  quality: number
): Promise<ImagePickerResult> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (status !== 'granted') {
    return { cancelled: true };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality,
  });

  if (result.canceled || !result.assets[0]) {
    return { cancelled: true };
  }

  return {
    cancelled: false,
    uri: result.assets[0].uri,
    width: result.assets[0].width,
    height: result.assets[0].height,
  };
}

function pickImageWeb(): Promise<ImagePickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve({ cancelled: true });
        return;
      }

      // Create a blob URL for the selected file
      const uri = URL.createObjectURL(file);

      // Get image dimensions
      const img = new Image();
      img.onload = () => {
        resolve({
          cancelled: false,
          uri,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => {
        resolve({ cancelled: false, uri });
      };
      img.src = uri;
    };

    input.oncancel = () => {
      resolve({ cancelled: true });
    };

    input.click();
  });
}

/**
 * Request camera permissions (no-op on web)
 */
export async function requestCameraPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // Web uses file input, no permissions needed for gallery
    return true;
  }

  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}
