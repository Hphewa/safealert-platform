import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';
import { useAuth } from '../../../auth/hooks/useAuth';
import { loadReportEvidence } from '../api/reportEvidence';
import { dashboardTheme } from '../theme';

type Props = { uri: string; accessibilityLabel: string; style: StyleProp<ImageStyle> };

export function ReportEvidenceImage(props: Props) {
  return <EvidenceImage key={props.uri} {...props} />;
}

function EvidenceImage({ uri, accessibilityLabel, style }: Props) {
  const { accessToken } = useAuth();
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setSourceUri(null);
    setError(false);
    setLoading(true);
    void loadReportEvidence(uri, accessToken).then((value) => {
      if (active) setSourceUri(value);
    }).catch(() => {
      if (active) {
        setError(true);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [uri, accessToken, attempt]);

  return (
    <View style={styles.container}>
      {sourceUri && !error ? (
        <Image
          key={attempt}
          accessibilityLabel={accessibilityLabel}
          source={{ uri: sourceUri }}
          style={style}
          resizeMode="contain"
          onLoad={() => setLoading(false)}
          onError={() => { setError(true); setLoading(false); }}
        />
      ) : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading evidence photo" color={dashboardTheme.colors.primary} /> : null}
      {error ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text style={styles.message}>The evidence photo could not be loaded. Check your connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)} style={styles.retry}>
            <Text style={styles.retryLabel}>Retry photo</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  notice: { gap: 12, padding: 16, backgroundColor: dashboardTheme.colors.surfaceMuted, borderRadius: 12 },
  message: { color: dashboardTheme.colors.muted, fontSize: 14, lineHeight: 21 },
  retry: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, backgroundColor: dashboardTheme.colors.primarySoft },
  retryLabel: { color: dashboardTheme.colors.primaryStrong, fontWeight: '700' }
});
