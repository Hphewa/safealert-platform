import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { DashboardGlyph } from '../components/DashboardGlyph';
import { dashboardTheme } from '../theme';
import { formatVoiceDuration } from './voiceEvidence';

type VoiceNotePlayerProps = {
  uri: string | undefined;
  durationSeconds: number;
  title?: string;
};

export function VoiceNotePlayer({ uri, durationSeconds, title = 'Voice note' }: VoiceNotePlayerProps) {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const resolvedDuration = status.isLoaded && status.duration > 0 ? status.duration : durationSeconds;
  const trackRef = useRef<View>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubPreviewTime, setScrubPreviewTime] = useState<number | null>(null);
  const currentTime = scrubPreviewTime ?? (status.didJustFinish ? resolvedDuration : status.currentTime);
  const progress =
    resolvedDuration > 0 ? Math.min(1, Math.max(0, currentTime / resolvedDuration)) : 0;

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
      shouldRouteThroughEarpiece: false
    });
  }, []);

  const togglePlayback = async () => {
    if (!uri) {
      return;
    }

    if (status.playing) {
      player.pause();
      return;
    }

    if (status.didJustFinish) {
      await player.seekTo(0);
    }

    player.play();
  };

  const seekToTime = async (seconds: number) => {
    if (!uri || resolvedDuration <= 0) {
      return;
    }

    const nextTime = Math.min(resolvedDuration, Math.max(0, seconds));
    setScrubPreviewTime(nextTime);
    await player.seekTo(nextTime);
    setScrubPreviewTime(null);
  };

  const timeFromTrackLocation = (locationX: number) => {
    if (trackWidth <= 0 || resolvedDuration <= 0) {
      return 0;
    }

    const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
    return ratio * resolvedDuration;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => Boolean(uri),
        onStartShouldSetPanResponder: () => Boolean(uri),
        onPanResponderGrant: (event) => {
          setScrubPreviewTime(timeFromTrackLocation(event.nativeEvent.locationX));
        },
        onPanResponderMove: (_event, gestureState) => {
          trackRef.current?.measure((_x, _y, width, _height, pageX) => {
            if (width <= 0 || resolvedDuration <= 0) {
              return;
            }

            setTrackWidth(width);
            const ratio = Math.min(1, Math.max(0, (gestureState.moveX - pageX) / width));
            setScrubPreviewTime(ratio * resolvedDuration);
          });
        },
        onPanResponderRelease: (_event, gestureState) => {
          trackRef.current?.measure((_x, _y, width, _height, pageX) => {
            if (width <= 0 || resolvedDuration <= 0) {
              setScrubPreviewTime(null);
              return;
            }

            const ratio = Math.min(1, Math.max(0, (gestureState.moveX - pageX) / width));
            void seekToTime(ratio * resolvedDuration);
          });
        },
        onPanResponderTerminate: () => {
          setScrubPreviewTime(null);
        }
      }),
    [resolvedDuration, trackWidth, uri]
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.playerRow}>
        <Pressable
          accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
          accessibilityRole="button"
          disabled={!uri}
          onPress={() => {
            void togglePlayback();
          }}
          style={({ pressed }) => [styles.playButton, !uri && styles.disabled, pressed && styles.pressed]}
        >
          <DashboardGlyph
            color={dashboardTheme.colors.text}
            name={status.playing ? 'pause-outline' : 'play-outline'}
            size={20}
          />
        </Pressable>
        <Text style={styles.timeText}>{formatVoiceDuration(currentTime)}</Text>
        <View
          ref={trackRef}
          accessibilityLabel="Voice note position"
          accessibilityRole="adjustable"
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          style={styles.progressTouchArea}
          {...panResponder.panHandlers}
        >
          <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
          </View>
        </View>
        <Text style={styles.timeText}>{formatVoiceDuration(resolvedDuration)}</Text>
      </View>
      <View>
        {!uri ? <Text style={styles.errorText}>Voice note is not available for playback.</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surfaceMuted
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  playButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timeText: {
    minWidth: 48,
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  progressTouchArea: {
    flex: 1,
    minHeight: 32,
    justifyContent: 'center'
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: dashboardTheme.colors.muted
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: dashboardTheme.colors.text
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 13,
    height: 13,
    marginLeft: -6.5,
    borderRadius: 7,
    backgroundColor: dashboardTheme.colors.text
  },
  errorText: {
    fontSize: 12,
    lineHeight: 17,
    color: dashboardTheme.colors.critical
  },
  disabled: {
    opacity: 0.45
  },
  pressed: {
    opacity: 0.82
  }
});
