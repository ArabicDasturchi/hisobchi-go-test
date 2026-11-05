/**
 * Yagona ikonka komponenti — @expo/vector-icons (Ionicons), Expo Go'ga kiritilgan, native build talab qilmaydi.
 * Faqat shu ro'yxatdagi nomlar ishlatiladi — butun ilovada bir xil uslub.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ColorValue } from 'react-native';
import { colors } from './theme';

export type IconName =
  | 'home'
  | 'home-outline'
  | 'receipt'
  | 'receipt-outline'
  | 'add'
  | 'add-circle'
  | 'remove'
  | 'people'
  | 'people-outline'
  | 'grid'
  | 'grid-outline'
  | 'chevron-back'
  | 'chevron-forward'
  | 'close'
  | 'search'
  | 'cube-outline'
  | 'bar-chart-outline'
  | 'settings-outline'
  | 'person-add-outline'
  | 'person-outline'
  | 'cash-outline'
  | 'alert-circle'
  | 'warning'
  | 'checkmark-circle'
  | 'information-circle'
  | 'close-circle'
  | 'eye-off-outline'
  | 'eye-outline'
  | 'cloud-upload-outline'
  | 'cloud-offline-outline'
  | 'log-in-outline'
  | 'log-out-outline'
  | 'document-text-outline'
  | 'mic-outline'
  | 'create-outline'
  | 'trash-outline';

export function Icon({ name, size = 22, color = colors.text }: { name: IconName; size?: number; color?: ColorValue }) {
  // Ikonka bezak — ma'nosi yonidagi matn yoki accessibilityLabel orqali beriladi
  return <Ionicons name={name} size={size} color={color as string} accessible={false} importantForAccessibility="no" />;
}
