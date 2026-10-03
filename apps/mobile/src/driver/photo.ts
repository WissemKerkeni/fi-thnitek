import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_WIDTH = 1600;

/**
 * Takes or picks a photo, then re-encodes it on the device: resized (smaller uploads on slow networks),
 * orientation applied and JPEG without EXIF (no GPS position leaves the phone). The server strips
 * metadata again anyway (defence in depth). Returns a local file URI, or null if cancelled/denied.
 */
export async function pickDocumentPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return saved.uri;
}
