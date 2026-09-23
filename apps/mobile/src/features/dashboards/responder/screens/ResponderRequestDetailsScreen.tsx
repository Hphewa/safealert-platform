import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SafeResponseRequest } from '@safealert/contracts';

import { DashboardGlyph } from '../../shared/components/DashboardGlyph';
import { DashboardScreen } from '../../shared/components/DashboardScreen';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { cardShadow, dashboardTheme } from '../../shared/theme';
import { responderBottomNavItems } from '../mockData';
import { getCachedResponderRequest } from '../requestDetailsCache';
import { displayValue } from '../requestDetails';

export function ResponderRequestDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const responseRequest = requestId ? getCachedResponderRequest(requestId) : null;

  const returnToRequests = () => router.replace('/responder');

  if (!responseRequest) {
    return (
      <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
        <DetailsHeader onBack={returnToRequests} />
        <View style={styles.noticeCard}>
          <View style={styles.noticeIconWrap}>
            <DashboardGlyph color={dashboardTheme.colors.critical} name="alert-circle-outline" size={22} />
          </View>
          <Text style={styles.noticeTitle}>Request not available</Text>
          <Text style={styles.noticeBody}>This emergency request could not be found.</Text>
          <BackToRequestsButton onPress={returnToRequests} />
        </View>
      </DashboardScreen>
    );
  }

  return (
    <DashboardScreen bottomNavItems={responderBottomNavItems} contentContainerStyle={styles.content}>
      <DetailsHeader onBack={returnToRequests} />

      <View style={styles.heroCard}>
        <View style={styles.heroBadgeRow}>
          <StatusBadge label={responseRequest.status} tone={statusTone(responseRequest.status)} />
        </View>
        <Text style={styles.heroTitle}>{formatAssistanceType(responseRequest.assistanceType)}</Text>
        <Text style={styles.heroSubtitle}>Request ID: {displayValue(responseRequest.id)}</Text>
      </View>

      <DetailsSection title="LOCATION">
        <DetailRow label="GPS coordinates" value={formatLocation(responseRequest)} />
      </DetailsSection>

      <DetailsSection title="PEOPLE">
        <DetailRow label="People needing help" value={displayValue(responseRequest.affectedPeople)} />
        <DetailRow label="Number injured" value={displayValue(responseRequest.injuredPeople)} />
      </DetailsSection>

      <DetailsSection title="SPECIAL NEEDS">
        <DetailRow label="Vulnerable people" value={formatVulnerablePeople(responseRequest)} />
        <DetailRow label="Medical needs" value={responseRequest.medicalNeeds ? 'Yes' : 'No'} />
      </DetailsSection>

      <DetailsSection title="ACCESS">
        <DetailRow label="Road accessibility" value={displayValue(responseRequest.roadAccessibility)} />
      </DetailsSection>

      <DetailsSection title="DESCRIPTION">
        <Text style={styles.description}>{displayValue(responseRequest.description)}</Text>
      </DetailsSection>

      <DetailsSection title="CONTACT">
        <DetailRow label="Resident name" value={responseRequest.contact?.name} />
        <DetailRow label="Contact number" value={responseRequest.contact?.phoneNumber} />
      </DetailsSection>

      <DetailsSection title="SUBMITTED">
        <DetailRow label="Date / time" value={formatSubmittedAt(responseRequest.createdAt)} />
      </DetailsSection>

      <BackToRequestsButton onPress={returnToRequests} />
    </DashboardScreen>
  );
}

function DetailsHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityLabel="Back to requests"
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <DashboardGlyph color={dashboardTheme.colors.text} name="arrow-back" size={22} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>Emergency Response</Text>
        <Text style={styles.headerTitle}>Emergency Request</Text>
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function DetailsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{displayValue(value)}</Text>
    </View>
  );
}

function BackToRequestsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
    >
      <Text style={styles.backButtonText}>Back to Requests</Text>
    </Pressable>
  );
}

function formatAssistanceType(assistanceType: SafeResponseRequest['assistanceType']) {
  return assistanceType
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLocation(responseRequest: SafeResponseRequest) {
  const coordinates = responseRequest.location?.coordinates;

  if (!coordinates || coordinates.length !== 2) {
    return 'Not provided';
  }

  const [longitude, latitude] = coordinates;
  return `Latitude ${latitude}, Longitude ${longitude}`;
}

function formatVulnerablePeople(responseRequest: SafeResponseRequest) {
  const vulnerablePeople = responseRequest.vulnerablePeople;

  if (!vulnerablePeople) {
    return 'Not provided';
  }

  const entries = [
    ['Children', vulnerablePeople.children],
    ['Elderly people', vulnerablePeople.elderlyPeople],
    ['Persons with disabilities', vulnerablePeople.personsWithDisabilities],
    ['Pregnant persons', vulnerablePeople.pregnantPersons]
  ].filter(([, count]) => typeof count === 'number' && count > 0);

  return entries.length
    ? entries.map(([label, count]) => `${label}: ${count}`).join(', ')
    : 'None reported';
}

function formatSubmittedAt(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleString();
}

function statusTone(status: SafeResponseRequest['status']) {
  return status === 'ASSIGNED' ? 'success' : 'info';
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 28
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardTheme.colors.text
  },
  headerSpacer: {
    width: 44
  },
  heroCard: {
    gap: 10,
    padding: 20,
    borderRadius: dashboardTheme.radius.lg,
    backgroundColor: dashboardTheme.colors.primaryStrong,
    ...cardShadow
  },
  heroBadgeRow: {
    flexDirection: 'row'
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff'
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#dbeafe'
  },
  sectionCard: {
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: dashboardTheme.colors.info
  },
  sectionBody: {
    gap: 12
  },
  detailRow: {
    gap: 4
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardTheme.colors.muted
  },
  detailValue: {
    fontSize: 16,
    lineHeight: 22,
    color: dashboardTheme.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: dashboardTheme.colors.text
  },
  noticeCard: {
    alignItems: 'center',
    gap: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: dashboardTheme.colors.border,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.surface,
    ...cardShadow
  },
  noticeIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: dashboardTheme.colors.criticalSoft
  },
  noticeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: dashboardTheme.colors.text,
    textAlign: 'center'
  },
  noticeBody: {
    fontSize: 15,
    lineHeight: 22,
    color: dashboardTheme.colors.muted,
    textAlign: 'center'
  },
  backButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: dashboardTheme.radius.md,
    backgroundColor: dashboardTheme.colors.primaryStrong
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff'
  },
  pressed: {
    opacity: 0.8
  }
});