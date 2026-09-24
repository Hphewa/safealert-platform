import { Text, View } from 'react-native';
import type { CreateWarningRequest, WarningRiskLevel } from '@safealert/contracts';
import { PriorityBadge } from '../../shared/components/PriorityBadge';
import { AssessmentButton, AssessmentDetail, assessmentStyles } from '../components/RiskAssessmentComponents';
import { warningStyles } from '../components/WarningComponents';
import { WarningPhotoPreviews } from '../components/WarningPhotos';
import type { WarningPhoto } from '../warningImages';

export function ReviewWarningScreen({ warning, riskLevel, busy, onEdit, onSave, photos = [], progress = 'Saving Warning…' }: {
  warning: CreateWarningRequest; riskLevel: WarningRiskLevel; busy: boolean;
  onEdit: () => void; onSave: () => void;
  photos?: WarningPhoto[]; progress?: string;
}) {
  return <>
    <View style={assessmentStyles.card}>
      <Text style={assessmentStyles.heading}>Warning summary</Text>
      <AssessmentDetail label="Affected Area" value={warning.affectedArea} />
      <View style={warningStyles.field}><Text style={assessmentStyles.label}>Risk Level</Text><PriorityBadge priority={riskLevel} /></View>
      <AssessmentDetail label="Required Action" value={warning.requiredAction} />
      <AssessmentDetail label="Unsafe Roads" value={warning.unsafeRoads} />
      <AssessmentDetail label="Safe Routes" value={warning.safeRoutes ?? 'Not provided'} />
      <AssessmentDetail label="Reason / Message" value={warning.message} />
      {photos.length ? <View style={warningStyles.field}>
        <Text style={assessmentStyles.label}>Attachments ({photos.length})</Text>
        <WarningPhotoPreviews photos={photos} />
      </View> : null}
    </View>
    <View style={warningStyles.notice}><Text style={assessmentStyles.body}>This saves a draft. It will not publish a warning or notify residents.</Text></View>
    <View style={warningStyles.actions}>
      <AssessmentButton label="Edit Warning" secondary disabled={busy} onPress={onEdit} />
      <AssessmentButton label={busy ? progress : 'Save Warning Draft'} disabled={busy} onPress={onSave} />
    </View>
  </>;
}
