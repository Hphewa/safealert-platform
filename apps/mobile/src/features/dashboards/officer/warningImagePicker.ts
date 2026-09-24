import * as ImagePicker from 'expo-image-picker';
import { WARNING_FIELD_LIMITS } from '@safealert/contracts';
import { addWarningPhotos, type WarningPhoto } from './warningImages';

export async function chooseWarningPhotos(current: WarningPhoto[]): Promise<WarningPhoto[]> {
  const remaining = WARNING_FIELD_LIMITS.attachments - current.length;
  if (remaining <= 0) throw new Error('You can add up to 5 images. Remove an image to choose another.');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
    throw new Error('Photo access is required to choose images. You can enable it in device settings.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true,
    selectionLimit: remaining, quality: 0.8, base64: true
  });
  return result.canceled ? current : addWarningPhotos(current, result.assets);
}
