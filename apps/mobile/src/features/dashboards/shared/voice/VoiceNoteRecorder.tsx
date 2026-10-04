import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from 'expo-audio';
import type { ReportVoiceMimeType } from '@safealert/contracts';

import { DashboardGlyph } from '../components/DashboardGlyph';
import { dashboardTheme } from '../theme';
import {
  defaultVoiceEvidenceContentType,
  formatVoiceDuration,
  reportVoiceMaxDurationSeconds,
  type LocalVoiceEvidence
} from './voiceEvidence';
import { VoiceNotePlayer } from './VoiceNotePlayer';

type VoiceNoteRecorderProps = {
  value: LocalVoiceEvidence | null;
  onChange: (voiceEvidence: LocalVoiceEvidence | null) => void;
  disabled?: boolean;
  existingVoice?: {
    uri: string | undefined;
    durationSeconds: number;
  } | null;
  onRemoveExisting?: () => void;
};

type RecorderUiStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';

const localVoiceMimeType: ReportVoiceMimeType =
  Platform.OS === 'web' ? 'audio/webm' : defaultVoiceEvidenceContentType;
const localVoiceExtension = Platform.OS === 'web' ? 'webm' : 'm4a';

export function VoiceNoteRecorder({
  value,
  onChange,
  disabled = false,
  existingVoice = null,
  onRemoveExisting
}: VoiceNoteRecorderProps) {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 64000,
    android: {
      ...RecordingPresets.HIGH_QUALITY.android,
      maxFileSize: 3 * 1024 * 1024
    }
  });
  const recorderState = useAudioRecorderState(recorder, 250);
  const [status, setStatus] = useState<RecorderUiStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const startInFlightRef = useRef(false);
  const isRecording = status === 'recording' || recorderState.isRecording;

  const elapsedSeconds = isRecording
    ? Math.min(
        reportVoiceMaxDurationSeconds,
        Math.ceil((recorderState.durationMillis || Date.now() - (recordingStartedAtRef.current ?? Date.now())) / 1000)
      )
    : 0;

  useEffect(() => {
    if (isRecording && elapsedSeconds >= reportVoiceMaxDurationSeconds) {
      void stopRecording();
    }
  }, [elapsedSeconds, isRecording]);

  const startRecording = async () => {
    if (disabled || isRecording || startInFlightRef.current) {
      return;
    }

    startInFlightRef.current = true;
    setStatus('requesting');
    setMessage(null);

    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        setStatus('error');
        setMessage('Microphone permission is needed.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
        shouldRouteThroughEarpiece: false
      });
      await recorder.prepareToRecordAsync();
      recordingStartedAtRef.current = Date.now();
      recorder.record({ forDuration: reportVoiceMaxDurationSeconds });
      setStatus('recording');
      setMessage(null);
    } catch {
      setStatus('error');
      setMessage('We could not start recording. Check microphone access and try again.');
    } finally {
      startInFlightRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (status === 'stopping') {
      return;
    }

    setStatus('stopping');

    try {
      await recorder.stop();
      const uri = recorder.uri;
      const rawDurationSeconds =
        recorderState.durationMillis > 0
          ? recorderState.durationMillis / 1000
          : (Date.now() - (recordingStartedAtRef.current ?? Date.now())) / 1000;
      const durationSeconds = Math.min(reportVoiceMaxDurationSeconds, Math.max(1, Math.ceil(rawDurationSeconds)));

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
        shouldRouteThroughEarpiece: false
      });

      if (!uri) {
        throw new Error('Missing recording file.');
      }

      onChange({
        localUri: uri,
        fileName: `resident-voice-evidence-${Date.now()}.${localVoiceExtension}`,
        mimeType: localVoiceMimeType,
        durationSeconds,
        uploadedMediaReference: null
      });
      setStatus('idle');
      setMessage(null);
    } catch {
      setStatus('error');
      setMessage('We could not save the voice note. Please try recording again.');
    } finally {
      recordingStartedAtRef.current = null;
    }
  };

  const removeVoice = () => {
    onChange(null);
    setStatus('idle');
    setMessage(null);
  };

  return (
    <View style={styles.container}>
      {isRecording ? (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <RecordingWave />
          <Text style={styles.recordingText}>{formatVoiceDuration(elapsedSeconds)}</Text>
        </View>
      ) : null}

      {value ? (
        <VoiceNotePlayer
          durationSeconds={value.durationSeconds}
          title="Voice recording"
          uri={value.localUri}
        />
      ) : existingVoice?.uri ? (
        <VoiceNotePlayer
          durationSeconds={existingVoice.durationSeconds}
          title="Voice recording"
          uri={existingVoice.uri}
        />
      ) : null}

      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.message, status === 'error' && styles.errorText]}
        >
          {message}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {isRecording ? (
          <Pressable
            accessibilityLabel="Stop voice recording"
            accessibilityRole="button"
            disabled={disabled || status === 'stopping'}
            onPress={() => {
              void stopRecording();
            }}
            style={({ pressed }) => [styles.stopButton, disabled && styles.disabled, pressed && styles.pressed]}
          >
            {status === 'stopping' ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.stopButtonText}>Stop Recording</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={value || existingVoice ? 'Replace voice note' : 'Record voice note'}
            accessibilityRole="button"
            disabled={disabled || status === 'requesting'}
            onPress={() => {
              void startRecording();
            }}
            style={({ pressed }) => [styles.recordButton, disabled && styles.disabled, pressed && styles.pressed]}
          >
            {status === 'requesting' ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <DashboardGlyph color="#ffffff" name="mic-outline" size={17} />
                <Text style={styles.recordButtonText}>
                  {value || existingVoice ? 'Replace recording' : 'Record'}
                </Text>
              </>
            )}
          </Pressable>
        )}
        {value ? (
          <Pressable
            accessibilityLabel="Remove selected voice note"
            accessibilityRole="button"
            disabled={disabled || isRecording}
            onPress={removeVoice}
            style={({ pressed }) => [styles.removeButton, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </Pressable>
        ) : existingVoice && onRemoveExisting ? (
          <Pressable
            accessibilityLabel="Remove current voice note"
            accessibilityRole="button"
            disabled={disabled || isRecording}
            onPress={onRemoveExisting}
            style={({ pressed }) => [styles.removeButton, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function RecordingWave() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 650, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View accessibilityLabel="Recording in progress" style={styles.wave}>
      {[0, 1, 2, 3, 4].map((bar) => (
        <Animated.View
          key={bar}
          style={[
            styles.waveBar,
            {
              transform: [
                {
                  scaleY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.35 + bar * 0.08, 1]
                  })
                }
              ]
            }
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: dashboardTheme.colors.critical
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  wave: {
    flex: 1,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  waveBar: {
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: dashboardTheme.colors.critical
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: dashboardTheme.colors.muted
  },
  errorText: {
    color: dashboardTheme.colors.critical
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  recordButton: {
    minHeight: 48,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.primary
  },
  recordButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  stopButton: {
    minHeight: 48,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.critical
  },
  stopButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  removeButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.criticalSoft,
    borderRadius: dashboardTheme.radius.sm,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  removeButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: dashboardTheme.colors.critical
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.82
  }
});
