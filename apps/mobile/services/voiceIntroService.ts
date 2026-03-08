import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  createAudioPlayer,
} from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { supabase } from './supabase';

const MAX_RECORDING_DURATION_MS = 30000; // 30 seconds

type RecordingStatus = {
  isRecording: boolean;
  durationMillis: number;
};

let currentRecorder: ReturnType<typeof useAudioRecorder> | null = null;
let recordingUri: string | null = null;

export async function requestAudioPermissions(): Promise<boolean> {
  try {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    return status.granted;
  } catch (error) {
    console.error('Error requesting audio permissions:', error);
    return false;
  }
}

export async function startRecording(): Promise<{ success: boolean; error?: string }> {
  try {
    const hasPermission = await requestAudioPermissions();
    if (!hasPermission) {
      return { success: false, error: 'microphonePermissionDenied' };
    }

    // Configure audio mode for recording
    await AudioModule.setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    // Note: In SDK 54, useAudioRecorder is a hook and should be used in components
    // For service-level recording, we'll return success and let the component handle it
    return { success: true };
  } catch (error) {
    console.error('Error starting recording:', error);
    return { success: false, error: 'recordingFailed' };
  }
}

export async function stopRecording(): Promise<{ success: boolean; uri?: string; duration?: number; error?: string }> {
  try {
    // Reset audio mode
    await AudioModule.setAudioModeAsync({
      allowsRecording: false,
    });

    if (!recordingUri) {
      return { success: false, error: 'noActiveRecording' };
    }

    const uri = recordingUri;
    recordingUri = null;

    return { success: true, uri };
  } catch (error) {
    console.error('Error stopping recording:', error);
    return { success: false, error: 'recordingFailed' };
  }
}

export function setRecordingUri(uri: string | null) {
  recordingUri = uri;
}

export async function getRecordingStatus(): Promise<RecordingStatus | null> {
  // This is now handled by the useAudioRecorder hook in components
  return null;
}

export async function uploadVoiceIntro(
  userId: string,
  uri: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fileName = `voice_intro_${Date.now()}.m4a`;
    const filePath = `${userId}/${fileName}`;

    // Fetch the file as blob
    const response = await fetch(uri);
    const blob = await response.blob();

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('voice-intros')
      .upload(filePath, blob, {
        upsert: true,
        contentType: 'audio/m4a',
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: 'uploadFailed' };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('voice-intros')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Update profile with voice intro URL
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        voice_intro_url: publicUrl,
        has_voice_intro: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return { success: false, error: 'profileUpdateFailed' };
    }

    return { success: true, url: publicUrl };
  } catch (error) {
    console.error('Error uploading voice intro:', error);
    return { success: false, error: 'uploadFailed' };
  }
}

export async function deleteVoiceIntro(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current voice intro URL to extract file path
    const { data: profile } = await supabase
      .from('profiles')
      .select('voice_intro_url')
      .eq('id', userId)
      .single();

    if (profile?.voice_intro_url) {
      // Extract file path from URL
      const url = new URL(profile.voice_intro_url);
      const pathParts = url.pathname.split('/');
      const filePath = pathParts.slice(-2).join('/'); // userId/filename

      // Delete from storage
      await supabase.storage
        .from('voice-intros')
        .remove([filePath]);
    }

    // Update profile to remove voice intro
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        voice_intro_url: null,
        has_voice_intro: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      return { success: false, error: 'profileUpdateFailed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting voice intro:', error);
    return { success: false, error: 'deleteFailed' };
  }
}

/**
 * Creates an AudioPlayer for voice intro playback.
 * Centralizes audio player creation with proper mode configuration.
 */
export async function createVoicePlayer(url: string): Promise<AudioPlayer | null> {
  try {
    await AudioModule.setAudioModeAsync({
      playsInSilentMode: true,
    });

    const player = createAudioPlayer(url);
    return player;
  } catch (error) {
    console.error('Error creating audio player:', error);
    return null;
  }
}

export { MAX_RECORDING_DURATION_MS };
