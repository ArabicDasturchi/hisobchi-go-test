/**
 * Diagnostika: navigator ichida HomeScreen o'rniga oddiy ekran ko'rsatish.
 * Faqat StartupStages ichida yoqiladi; to'liq ilovada qiymat har doim false.
 */
import { createContext, useContext } from 'react';
import { Text, View } from 'react-native';
import { useStartupMark } from './startupLog';

export const MinimalScreenContext = createContext(false);

export function useMinimalDiagnosticScreen(): boolean {
  return useContext(MinimalScreenContext);
}

export function MinimalDiagnosticScreen() {
  useStartupMark('MinimalDiagnosticScreen');
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: '#0F7B5F' }}>Minimal ekran</Text>
      <Text style={{ fontSize: 15, color: '#5B6875', marginTop: 8, textAlign: 'center' }}>
        Navigator ichida oddiy View/Text ochildi ✓
      </Text>
    </View>
  );
}
