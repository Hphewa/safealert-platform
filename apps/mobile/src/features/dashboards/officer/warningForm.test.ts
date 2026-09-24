import { expect, it } from 'vitest';
import { canCreateWarning, WARNING_FIELD_LIMITS } from '@safealert/contracts';
import { initialWarningForm, parseWarningForm, validateWarningForm, warningFields } from './warningForm';

const valid = { ...initialWarningForm, affectedArea: ' Village ', requiredAction: 'Move to high ground',
  unsafeRoads: 'None known', message: 'Water is rising.' };
it.each([['HIGH', true], ['CRITICAL', true], ['LOW', false], ['MODERATE', false]] as const)('allows warning creation for %s: %s', (risk, eligible) => {
  expect(canCreateWarning(risk)).toBe(eligible);
});
it('validates required fields before review', () => {
  expect(Object.keys(validateWarningForm(initialWarningForm))).toEqual(['affectedArea', 'requiredAction', 'unsafeRoads', 'message']);
  expect(() => parseWarningForm('assessment', initialWarningForm)).toThrow('Affected Area is required.');
});
it.each(warningFields)('validates maximum length for $key', ({ key }) => {
  expect(validateWarningForm({ ...valid, [key]: 'x'.repeat(WARNING_FIELD_LIMITS[key] + 1) })[key]).toBeTruthy();
});
it('builds a trimmed review payload without risk or officer fields', () => {
  expect(parseWarningForm('assessment', { ...valid, safeRoutes: ' Hill Road ', attachments: ' https://example.com/photo.jpg\n\n' }))
    .toEqual({ assessmentId: 'assessment', affectedArea: 'Village', requiredAction: valid.requiredAction,
      unsafeRoads: 'None known', safeRoutes: 'Hill Road', message: valid.message, attachments: ['https://example.com/photo.jpg'] });
});
it.each(['file:///photo.jpg', 'javascript:alert(1)', 'not a url', Array(6).fill('https://example.com/photo.jpg').join('\n')])('rejects invalid attachment links %s', (attachments) => {
  expect(validateWarningForm({ ...valid, attachments }).attachments).toBeTruthy();
});
