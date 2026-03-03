import { AudioModule, AudioPlayer } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';

type VoiceIntroPlayerProps = {
  url: string;
  size?: 'small' | 'medium';
  showLabel?: boolean;
};

export default function VoiceIntroPlayer({
  url,
  size = 'small',
  showLabel = true,
}: VoiceIntroPlayerProps) {
  const { t } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const playerRef = useRef<AudioPlayer | null>(null);

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (playerRef.current) {
        playerRef.current.release();
      }
    };
  }, []);

  useEffect(() => {
    if (duration > 0) {
      Animated.timing(progressAnim, {
        toValue: position / duration,
        duration: 100,
        useNativeDriver: false,
      }).start();
    }
  }, [position, duration]);

  const handlePress = async () => {
    if (isPlaying && playerRef.current) {
      playerRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (playerRef.current) {
      playerRef.current.play();
      setIsPlaying(true);
      return;
    }

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
      });

      const player = new AudioPlayer({ uri: url });
      playerRef.current = player;

      // Set up status listener
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.isLoaded) {
          setDuration(status.duration || 0);
          setPosition(status.currentTime || 0);
          setIsPlaying(status.playing);

          if (status.didJustFinish) {
            setIsPlaying(false);
            setPosition(0);
            progressAnim.setValue(0);
          }
        }
      });

      player.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing voice intro:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const secs = Math.floor(seconds);
    return `${secs}s`;
  };

  const isSmall = size === 'small';
  const buttonSize = isSmall ? 36 : 48;

  return (
    <View
      style={[styles.container, isSmall && styles.containerSmall, { pointerEvents: 'box-none' }]}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={[
          styles.playButton,
          { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
        ]}
      >
        <Text style={[styles.playIcon, isSmall && styles.playIconSmall]}>
          {isPlaying ? '⏸' : '▶'}
        </Text>
      </TouchableOpacity>

      {showLabel && (
        <View style={[styles.info, { pointerEvents: 'none' }]}>
          <Text style={[styles.label, isSmall && styles.labelSmall]}>
            {t('voiceIntro')}
          </Text>
          {duration > 0 && (
            <View style={styles.progressContainer}>
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}

      {duration > 0 && (
        <Text style={[styles.duration, isSmall && styles.durationSmall, { pointerEvents: 'none' }]}>
          {isPlaying ? formatTime(position) : formatTime(duration)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  containerSmall: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 20,
    gap: 8,
  },
  playButton: {
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 18,
    color: '#fff',
    marginLeft: 2,
  },
  playIconSmall: {
    fontSize: 14,
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
    marginBottom: 4,
  },
  labelSmall: {
    fontSize: 12,
    marginBottom: 2,
  },
  progressContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#e94560',
    borderRadius: 1.5,
  },
  duration: {
    fontSize: 12,
    color: '#ccc',
    minWidth: 30,
    textAlign: 'right',
  },
  durationSmall: {
    fontSize: 11,
  },
});
