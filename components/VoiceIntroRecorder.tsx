import {
  AudioModule,
  AudioPlayer,
  RecordingPresets,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const useNativeDriver = Platform.OS !== 'web';
import { useLanguage } from '../contexts/LanguageContext';
import {
  deleteVoiceIntro,
  MAX_RECORDING_DURATION_MS,
  uploadVoiceIntro,
} from '../services/voiceIntroService';

type VoiceIntroRecorderProps = {
  userId: string;
  existingUrl?: string | null;
  onUpdate?: (hasVoiceIntro: boolean, url?: string) => void;
};

export default function VoiceIntroRecorder({
  userId,
  existingUrl,
  onUpdate,
}: VoiceIntroRecorderProps) {
  const { t } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<AudioPlayer | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const durationInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      if (currentPlayer) {
        currentPlayer.release();
      }
    };
  }, [currentPlayer]);

  useEffect(() => {
    if (isRecording) {
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver,
          }),
        ])
      ).start();

      // Start duration counter
      durationInterval.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 100;
          if (newDuration >= MAX_RECORDING_DURATION_MS) {
            handleStopRecording();
          }
          return newDuration;
        });
      }, 100);
    } else {
      pulseAnim.setValue(1);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    try {
      const permissionStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!permissionStatus.granted) {
        Alert.alert(t('error'), t('microphonePermissionDenied'));
        return;
      }

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      audioRecorder.record();
      setIsRecording(true);
      setRecordingDuration(0);
      setRecordedUri(null);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert(t('error'), t('recordingFailed'));
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (uri) {
        setRecordedUri(uri);
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const handlePlayPreview = async () => {
    const url = recordedUri || existingUrl;
    if (!url) return;

    if (isPlaying && currentPlayer) {
      currentPlayer.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      });

      const player = new AudioPlayer({ uri: url });
      setCurrentPlayer(player);
      setIsPlaying(true);

      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });

      player.play();
    } catch (error) {
      console.error('Error playing preview:', error);
      Alert.alert(t('error'), t('playbackFailed'));
    }
  };

  const handleUpload = async () => {
    if (!recordedUri) return;

    setIsUploading(true);
    const result = await uploadVoiceIntro(userId, recordedUri);
    setIsUploading(false);

    if (result.success) {
      setRecordedUri(null);
      onUpdate?.(true, result.url);
      Alert.alert(t('success'), t('voiceIntroUploaded'));
    } else {
      Alert.alert(t('error'), t(result.error || 'uploadFailed'));
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('deleteVoiceIntro'),
      t('deleteVoiceIntroConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            const result = await deleteVoiceIntro(userId);
            if (result.success) {
              setRecordedUri(null);
              onUpdate?.(false);
            } else {
              Alert.alert(t('error'), t(result.error || 'deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const handleReRecord = () => {
    setRecordedUri(null);
    setRecordingDuration(0);
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const remainingMs = ms % 1000;
    return `${seconds}.${Math.floor(remainingMs / 100)}`;
  };

  const hasExisting = !!existingUrl;
  const hasRecorded = !!recordedUri;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('voiceIntro')}</Text>
        <Text style={styles.subtitle}>{t('voiceIntroHint')}</Text>
      </View>

      {/* Recording State */}
      {isRecording ? (
        <View style={styles.recordingState}>
          <Animated.View
            style={[
              styles.recordButton,
              styles.recordingActive,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <TouchableOpacity onPress={handleStopRecording}>
              <View style={styles.stopIcon} />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.timer}>
            {formatDuration(recordingDuration)} / 30.0
          </Text>
          <Text style={styles.recordingLabel}>{t('recording')}</Text>
        </View>
      ) : hasRecorded ? (
        /* Preview State */
        <View style={styles.previewState}>
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPreview}
            >
              <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <View style={styles.previewInfo}>
              <Text style={styles.previewText}>{t('previewRecording')}</Text>
              <Text style={styles.previewDuration}>
                {formatDuration(recordingDuration)}s
              </Text>
            </View>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.reRecordButton}
              onPress={handleReRecord}
            >
              <Text style={styles.reRecordText}>{t('reRecord')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.uploadText}>{t('save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : hasExisting ? (
        /* Existing Voice Intro */
        <View style={styles.existingState}>
          <View style={styles.previewControls}>
            <TouchableOpacity
              style={styles.playButton}
              onPress={handlePlayPreview}
            >
              <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <View style={styles.previewInfo}>
              <Text style={styles.previewText}>{t('yourVoiceIntro')}</Text>
              <Text style={styles.checkmark}>✓ {t('uploaded')}</Text>
            </View>
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.reRecordButton}
              onPress={handleStartRecording}
            >
              <Text style={styles.reRecordText}>{t('reRecord')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
            >
              <Text style={styles.deleteText}>{t('delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Initial State */
        <View style={styles.initialState}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={handleStartRecording}
          >
            <View style={styles.micIcon}>
              <Text style={styles.micEmoji}>🎙</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.tapToRecord}>{t('tapToRecord')}</Text>
          <Text style={styles.maxDuration}>{t('maxDuration30s')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
  },
  recordingState: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  recordingActive: {
    backgroundColor: '#e94560',
  },
  stopIcon: {
    width: 24,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  micIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micEmoji: {
    fontSize: 32,
  },
  timer: {
    fontSize: 24,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 4,
  },
  recordingLabel: {
    fontSize: 14,
    color: '#e94560',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  initialState: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  tapToRecord: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  maxDuration: {
    fontSize: 12,
    color: '#666',
  },
  previewState: {
    gap: 16,
  },
  existingState: {
    gap: 16,
  },
  previewControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playIcon: {
    fontSize: 24,
    color: '#fff',
  },
  previewInfo: {
    flex: 1,
  },
  previewText: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 2,
  },
  previewDuration: {
    fontSize: 14,
    color: '#888',
  },
  checkmark: {
    fontSize: 14,
    color: '#4ade80',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  reRecordButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  reRecordText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '500',
  },
  uploadButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e94560',
    alignItems: 'center',
  },
  uploadText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
