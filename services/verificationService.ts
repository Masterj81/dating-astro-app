import { Camera } from 'expo-camera';
import { AudioModule } from 'expo-audio';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const MIN_RECORDING_DURATION_MS = 5000; // 5 seconds minimum
const MAX_RECORDING_DURATION_MS = 15000; // 15 seconds maximum

export async function requestCameraPermissions(): Promise<{
  camera: boolean;
  microphone: boolean;
}> {
  try {
    const [cameraResult, microphoneResult] = await Promise.all([
      Camera.requestCameraPermissionsAsync(),
      AudioModule.requestRecordingPermissionsAsync(),
    ]);

    return {
      camera: cameraResult.status === 'granted',
      microphone: microphoneResult.granted,
    };
  } catch (error) {
    console.error('Error requesting camera permissions:', error);
    return { camera: false, microphone: false };
  }
}

export async function getCameraPermissions(): Promise<{
  camera: boolean;
  microphone: boolean;
}> {
  try {
    const [cameraResult, microphoneResult] = await Promise.all([
      Camera.getCameraPermissionsAsync(),
      AudioModule.getRecordingPermissionsAsync(),
    ]);

    return {
      camera: cameraResult.status === 'granted',
      microphone: microphoneResult.granted,
    };
  } catch (error) {
    return { camera: false, microphone: false };
  }
}

export async function uploadVerificationVideo(
  userId: string,
  uri: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Starting video upload for user:', userId);
    console.log('Video URI:', uri);

    const fileName = `verification_${Date.now()}.mp4`;
    const filePath = `${userId}/${fileName}`;

    let uploadError;

    if (Platform.OS === 'web') {
      // Web: use fetch to get blob
      console.log('Web platform: fetching blob...');
      const response = await fetch(uri);
      const blob = await response.blob();
      console.log('Blob size:', blob.size);

      const result = await supabase.storage
        .from('verifications')
        .upload(filePath, blob, {
          upsert: true,
          contentType: 'video/mp4',
        });
      uploadError = result.error;
    } else {
      // Native (iOS/Android): check file info first
      console.log('Native platform: checking file info...');

      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        console.log('File info:', JSON.stringify(fileInfo));

        if (!fileInfo.exists) {
          console.error('File does not exist at URI:', uri);
          return { success: false, error: 'fileNotFound' };
        }

        // For Android, ensure we have the correct URI format
        let fileUri = uri;
        if (Platform.OS === 'android' && !uri.startsWith('file://')) {
          fileUri = `file://${uri}`;
          console.log('Adjusted Android URI:', fileUri);
        }

        console.log('Reading file as base64...');
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log('Base64 length:', base64.length);

        console.log('Uploading to Supabase...');
        const result = await supabase.storage
          .from('verifications')
          .upload(filePath, decode(base64), {
            upsert: true,
            contentType: 'video/mp4',
          });
        uploadError = result.error;
      } catch (fileError: any) {
        console.error('File processing error:', fileError);
        console.error('Error message:', fileError.message);
        console.error('Error stack:', fileError.stack);
        return { success: false, error: 'fileProcessingFailed' };
      }
    }

    if (uploadError) {
      console.error('Upload error:', uploadError);
      console.error('Upload error message:', uploadError.message);
      return { success: false, error: 'uploadFailed' };
    }

    console.log('Upload successful, getting signed URL...');

    // Get signed URL (since bucket is private)
    const { data: urlData, error: urlError } = await supabase.storage
      .from('verifications')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year expiry for admin review

    if (urlError) {
      console.error('URL error:', urlError);
    }

    // Update profile with verification video URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        verification_video_url: urlData?.signedUrl || filePath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return { success: false, error: 'profileUpdateFailed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error uploading verification video:', error);
    return { success: false, error: 'uploadFailed' };
  }
}

export async function setUserVerified(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('Verification update error:', error);
      return { success: false, error: 'verificationFailed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error setting user verified:', error);
    return { success: false, error: 'verificationFailed' };
  }
}

export async function getVerificationStatus(
  userId: string
): Promise<{ isVerified: boolean; verifiedAt: string | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_verified, verified_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return { isVerified: false, verifiedAt: null };
    }

    return {
      isVerified: data.is_verified || false,
      verifiedAt: data.verified_at,
    };
  } catch (error) {
    return { isVerified: false, verifiedAt: null };
  }
}

export { MIN_RECORDING_DURATION_MS, MAX_RECORDING_DURATION_MS };
