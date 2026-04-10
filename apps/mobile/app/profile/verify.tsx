import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  MAX_RECORDING_DURATION_MS,
  MIN_RECORDING_DURATION_MS,
  setUserVerified,
  uploadVerificationVideo,
} from '../../services/verificationService';
import { useAuth } from '../../contexts/AuthContext';

type Step = 'instructions' | 'recording' | 'preview' | 'uploading' | 'success';

// Video Preview Component using expo-video
function VideoPreview({
  uri,
  style,
}: {
  uri: string;
  style: any;
}) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = true;
    player.play();
  });

  return (
    <VideoView
      style={style}
      player={player}
      contentFit="cover"
      nativeControls={true}
    />
  );
}

export default function VerifyScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [step, setStep] = useState<Step>('instructions');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [videoUri, setVideoUri] = useState<string | null>(null);

  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
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
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [isRecording]);

  const requestPermissions = async () => {
    const camResult = await requestCameraPermission();
    const micResult = await requestMicPermission();

    if (camResult.granted && micResult.granted) {
      setStep('recording');
    } else {
      Alert.alert(t('error'), t('cameraPermissionDenied'));
    }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current) return;

    try {
      setIsRecording(true);
      setRecordingDuration(0);

      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_RECORDING_DURATION_MS / 1000,
      });

      if (video?.uri) {
        setVideoUri(video.uri);
        setStep('preview');
      }
    } catch (error) {
      console.error('Recording error:', error);
      setIsRecording(false);
      Alert.alert(t('error'), t('recordingFailed'));
    }
  };

  const handleStopRecording = async () => {
    if (!cameraRef.current || !isRecording) return;

    try {
      cameraRef.current.stopRecording();
      setIsRecording(false);
    } catch (error) {
      console.error('Stop recording error:', error);
    }
  };

  const handleRetake = () => {
    setVideoUri(null);
    setRecordingDuration(0);
    setStep('recording');
  };

  const handleUpload = async () => {
    if (!videoUri || !user) return;

    setStep('uploading');

    const uploadResult = await uploadVerificationVideo(user.id, videoUri);
    if (!uploadResult.success) {
      Alert.alert(t('error'), t(uploadResult.error || 'uploadFailed'));
      setStep('preview');
      return;
    }

    // For now, auto-verify (in production, this would go through review)
    const verifyResult = await setUserVerified(user.id);
    if (verifyResult.success) {
      setStep('success');
    } else {
      Alert.alert(t('error'), t(verifyResult.error || 'verificationFailed'));
      setStep('preview');
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };

  const hasPermissions = cameraPermission?.granted && micPermission?.granted;
  const canStop = recordingDuration >= MIN_RECORDING_DURATION_MS;

  // Instructions Step
  if (step === 'instructions') {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>x</Text>
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Text style={styles.icon}>📹</Text>
          </View>

          <Text style={styles.title}>{t('getVerified')}</Text>
          <Text style={styles.subtitle}>{t('verificationSubtitle')}</Text>

          <View style={styles.instructionsList}>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>1</Text>
              <Text style={styles.instructionText}>{t('verifyStep1')}</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>2</Text>
              <Text style={styles.instructionText}>{t('verifyStep2')}</Text>
            </View>
            <View style={styles.instructionItem}>
              <Text style={styles.instructionNumber}>3</Text>
              <Text style={styles.instructionText}>{t('verifyStep3')}</Text>
            </View>
          </View>

          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>✓</Text>
            <Text style={styles.badgeText}>{t('verifiedBadgeInfo')}</Text>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={requestPermissions}>
            <Text style={styles.primaryButtonText}>{t('startVerification')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>{t('notNow')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Recording Step
  if (step === 'recording') {
    return (
      <View style={styles.cameraContainer}>
        {hasPermissions ? (
          <>
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              mode="video"
            />
            <View style={styles.cameraOverlay}>
              <TouchableOpacity
                style={styles.cameraCloseButton}
                onPress={() => router.back()}
              >
                <Text style={styles.closeText}>x</Text>
              </TouchableOpacity>

              <View style={styles.recordingInfo}>
                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTime}>
                      {formatDuration(recordingDuration)} / 15s
                    </Text>
                  </View>
                )}
                {!isRecording && (
                  <Text style={styles.recordingHint}>{t('recordingHint')}</Text>
                )}
              </View>

              <View style={styles.cameraControls}>
                {isRecording ? (
                  <TouchableOpacity
                    style={[
                      styles.stopButton,
                      !canStop && styles.stopButtonDisabled,
                    ]}
                    onPress={handleStopRecording}
                    disabled={!canStop}
                  >
                    <View style={styles.stopIcon} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.recordButton}
                    onPress={handleStartRecording}
                  >
                    <View style={styles.recordIcon} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.noPermission}>
            <Text style={styles.noPermissionText}>{t('cameraPermissionDenied')}</Text>
          </View>
        )}
      </View>
    );
  }

  // Preview Step
  if (step === 'preview' && videoUri) {
    return (
      <View style={styles.cameraContainer}>
        <VideoPreview uri={videoUri} style={styles.previewVideo} />
        <View style={styles.previewOverlay}>
          <Text style={styles.previewTitle}>{t('previewVideo')}</Text>
          <Text style={styles.previewSubtitle}>{t('previewVideoHint')}</Text>

          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
              <Text style={styles.retakeText}>{t('retake')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitButton} onPress={handleUpload}>
              <Text style={styles.submitText}>{t('submit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Uploading Step
  if (step === 'uploading') {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
          <Text style={styles.uploadingText}>{t('verifying')}</Text>
        </View>
      </LinearGradient>
    );
  }

  // Success Step
  if (step === 'success') {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <Text style={styles.successEmoji}>✓</Text>
          </View>

          <Text style={styles.successTitle}>{t('verificationSuccess')}</Text>
          <Text style={styles.successSubtitle}>{t('verificationSuccessDesc')}</Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>{t('done')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(124, 108, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  instructionsList: {
    width: '100%',
    marginBottom: 24,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppTheme.colors.cosmic,
    color: AppTheme.colors.textOnAccent,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
    marginRight: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    lineHeight: 22,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderRadius: AppTheme.radius.md,
    padding: 16,
    marginBottom: 32,
    width: '100%',
  },
  badgeIcon: {
    fontSize: 24,
    color: AppTheme.colors.cosmic,
    marginRight: 12,
  },
  badgeText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    lineHeight: 20,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: AppTheme.colors.cosmic,
    paddingVertical: 18,
    borderRadius: AppTheme.radius.lg,
    alignItems: 'center',
    marginBottom: 12,
    minHeight: 56,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: AppTheme.colors.textMuted,
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
  },
  cameraCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  recordingInfo: {
    alignItems: 'center',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  recordingTime: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingHint: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: AppTheme.radius.md,
  },
  cameraControls: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ef4444',
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonDisabled: {
    opacity: 0.5,
  },
  stopIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  noPermission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noPermissionText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
  },
  previewVideo: {
    flex: 1,
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 24,
    paddingBottom: 50,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  previewSubtitle: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    marginBottom: 20,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: AppTheme.radius.md,
    backgroundColor: AppTheme.colors.panel,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  retakeText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: AppTheme.radius.md,
    backgroundColor: AppTheme.colors.cosmic,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  submitText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingText: {
    color: AppTheme.colors.textMuted,
    fontSize: 16,
    marginTop: 20,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: AppTheme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successEmoji: {
    fontSize: 48,
    color: AppTheme.colors.textOnAccent,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
});
