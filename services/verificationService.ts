import { Camera } from 'expo-camera';
import { AudioModule } from 'expo-audio';
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
    const fileName = `verification_${Date.now()}.mp4`;
    const filePath = `${userId}/${fileName}`;

    // Fetch the video as blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Upload to Supabase storage (private bucket)
    const { error: uploadError } = await supabase.storage
      .from('verifications')
      .upload(filePath, blob, {
        upsert: true,
        contentType: 'video/mp4',
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: 'uploadFailed' };
    }

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
