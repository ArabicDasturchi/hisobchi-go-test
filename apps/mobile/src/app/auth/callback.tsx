/**
 * Email tasdiqlash havolasi shu ekranga qaytadi: hisobchigo://auth/callback (yoki Expo Go'da exp://.../--/auth/callback).
 * Havoladagi code / token / xato Supabase SDK orqali haqiqiy sessiyaga aylantiriladi — soxta muvaffaqiyat yo'q.
 */
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../../backend/AuthProvider';
import type { CloudError } from '../../backend/cloud';
import { Banner, Button, Loading, Screen } from '../../ui/components';
import { type } from '../../ui/theme';

type State = { phase: 'working' } | { phase: 'ok' } | { phase: 'error'; error: CloudError } | { phase: 'no-cloud' };

export default function AuthCallbackScreen() {
  const auth = useAuth();
  const url = Linking.useURL();
  const [state, setState] = useState<State>({ phase: 'working' });

  useEffect(() => {
    if (auth.status === 'disabled') {
      setState({ phase: 'no-cloud' });
      return;
    }
    let active = true;
    (async () => {
      const link = url ?? (await Linking.getInitialURL());
      if (!link) return; // URL hali kelmagan — useURL yangilanganda effekt qayta ishlaydi
      const res = await auth.completeFromUrl(link);
      if (!active) return;
      setState(res.ok ? { phase: 'ok' } : { phase: 'error', error: res.error });
    })();
    return () => {
      active = false;
    };
    // completeFromUrl bir xil havolani ikki marta qayta ishlamaydi
  }, [url, auth.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.phase === 'working') return <Loading label="Email tasdiqlanmoqda…" />;

  return (
    <Screen>
      {state.phase === 'ok' ? (
        <Banner tone="success" title="Email tasdiqlandi">
          <Text style={type.body}>Hisobingizga kirdingiz. Endi do'kon yaratib, ma'lumotni bulutga yuborishingiz mumkin.</Text>
        </Banner>
      ) : state.phase === 'no-cloud' ? (
        <Banner tone="info" title="Bulut sozlanmagan">
          <Text style={type.body}>Bu ilova nusxasida Supabase sozlamasi yo'q — tasdiqlashni qayta ishlab bo'lmaydi.</Text>
        </Banner>
      ) : (
        <Banner tone={state.error.kind === 'network' ? 'warning' : 'error'} title="Tasdiqlash yakunlanmadi">
          <Text style={type.body}>{state.error.message}</Text>
        </Banner>
      )}
      <Button label="Hisob va bulut" icon="person-outline" onPress={() => router.replace('/account')} />
      <Button label="Bosh sahifa" variant="secondary" icon="home-outline" onPress={() => router.replace('/')} />
    </Screen>
  );
}
