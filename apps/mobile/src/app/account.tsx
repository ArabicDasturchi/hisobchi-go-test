/**
 * Hisob va bulut: kirish / ro'yxatdan o'tish / chiqish, do'kon yaratish va bulutga bir tomonlama zaxira.
 * Bulut sozlanmagan bo'lsa — ilova lokal rejimda ishlashi aniq aytiladi (soxta sinxronlash yo'q).
 */
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '../backend/AuthProvider';
import { authRedirectUrl } from '../backend/supabase';
import { useSync } from '../backend/SyncProvider';
import { useCatalog } from '../data/LedgerProvider';
import { useFocusData } from '../features/useAsync';
import { formatDateTime } from '../lib/format';
import { Banner, Button, Card, Field, Loading, Screen, SectionTitle } from '../ui/components';
import { space, type } from '../ui/theme';

export default function AccountScreen() {
  const auth = useAuth();

  if (auth.status === 'disabled') {
    return (
      <Screen>
        <Banner tone="info" title="Lokal rejim">
          <Text style={type.body}>
            Bulut ulanmagan. Barcha savdo, mijoz va to'lovlar faqat shu telefonda saqlanadi va to'liq ishlaydi.
          </Text>
        </Banner>
        <Card style={{ gap: space.xs }}>
          <SectionTitle>Bulutni ulash (administrator uchun)</SectionTitle>
          <Text style={type.body}>
            1. Supabase loyihasida supabase/migrations dagi 001 va 003 migratsiyalarni qo'llang.{'\n'}
            2. apps/mobile/.env fayliga EXPO_PUBLIC_SUPABASE_URL va EXPO_PUBLIC_SUPABASE_ANON_KEY ni yozing.{'\n'}
            3. Ilovani qayta ishga tushiring (npx expo start --clear).
          </Text>
          <Text style={type.caption}>Batafsil: docs/BACKEND_SETUP.md. Service-role kaliti ilovaga hech qachon yozilmaydi.</Text>
        </Card>
      </Screen>
    );
  }
  if (auth.status === 'loading') return <Loading label="Sessiya tiklanmoqda…" />;
  if (auth.status === 'signed-out') return <SignInForm />;
  if (!auth.shopId && auth.shopLoading) return <Loading label="Do'kon ma'lumoti yuklanmoqda…" />;
  if (!auth.shopId) return <CreateShopForm />;
  return <CloudPanel />;
}

function SignInForm() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'in' | 'up' | 'resend'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const needsConfirm = awaitingConfirm || /tasdiqlanmagan/.test(auth.error?.message ?? '');

  const validate = (withPassword: boolean) => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Email manzilini to'g'ri kiriting";
    if (withPassword && password.length < 8) return "Parol kamida 8 ta belgidan iborat bo'lishi kerak";
    return null;
  };

  const run = async (mode: 'in' | 'up' | 'resend') => {
    if (busy) return; // ikki marta bosishdan himoya
    const v = validate(mode !== 'resend');
    setLocalError(v);
    setNotice(null);
    auth.clearError();
    if (v) return;
    setBusy(mode);
    try {
      if (mode === 'in') {
        await auth.signIn(email, password);
      } else if (mode === 'up') {
        const r = await auth.signUp(email, password);
        if (r === 'confirm-email') {
          setAwaitingConfirm(true);
          setNotice(
            `${email.trim()} manziliga tasdiqlash xati yuborildi. Xatdagi havolani SHU telefonda oching — ilova o'zi ochilib, hisobingizga kiradi.`,
          );
        }
      } else if (await auth.resendConfirmation(email)) {
        setAwaitingConfirm(true);
        setNotice('Tasdiqlash xati qayta yuborildi. Pochtangizni (va «Spam» papkasini) tekshiring.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: space.xs }}>
        <SectionTitle>Hisobga kirish</SectionTitle>
        <Text style={type.caption}>
          Kirish ixtiyoriy: lokal savdolar kirmasdan ham ishlaydi. Kirgach, ma'lumotni bulutga zaxiralash mumkin.
        </Text>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <Field
          label="Parol"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          hint="Kamida 8 ta belgi"
        />
        {localError ? <Banner tone="error">{localError}</Banner> : null}
        {auth.error ? <Banner tone={auth.error.kind === 'network' ? 'warning' : 'error'}>{auth.error.message}</Banner> : null}
        {notice ? <Banner tone="success">{notice}</Banner> : null}
        <Button label="Kirish" icon="log-in-outline" onPress={() => void run('in')} loading={busy === 'in'} disabled={busy !== null} />
        <Button
          label="Ro'yxatdan o'tish"
          variant="secondary"
          onPress={() => void run('up')}
          loading={busy === 'up'}
          disabled={busy !== null}
        />
        {needsConfirm ? (
          <Button
            label="Tasdiqlash xatini qayta yuborish"
            variant="ghost"
            onPress={() => void run('resend')}
            loading={busy === 'resend'}
            disabled={busy !== null}
          />
        ) : null}
        {__DEV__ ? <Text style={type.caption}>Tasdiqlash havolasi qaytadigan manzil: {authRedirectUrl()}</Text> : null}
      </Card>
    </Screen>
  );
}

function CreateShopForm() {
  const auth = useAuth();
  const catalog = useCatalog();
  const { data: settings } = useFocusData(() => catalog.getSettings(), [catalog]);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = name ?? settings?.shop_name ?? '';

  return (
    <Screen>
      <Card style={{ gap: space.xs }}>
        <SectionTitle>Bulutdagi do'kon</SectionTitle>
        <Text style={type.body}>Kirdingiz: {auth.email}. Ma'lumotlarni saqlash uchun do'kon yarating — siz uning egasi bo'lasiz.</Text>
        <Field label="Do'kon nomi *" value={value} onChangeText={setName} placeholder="masalan: Akmal savdo" />
        {auth.error ? <Banner tone="error">{auth.error.message}</Banner> : null}
        <Button
          label="Do'kon yaratish"
          disabled={!value.trim()}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await auth.createShop(value.trim());
            setBusy(false);
          }}
        />
        <Button label="Chiqish" variant="ghost" icon="log-out-outline" onPress={() => void auth.signOut()} />
      </Card>
    </Screen>
  );
}

function CloudPanel() {
  const auth = useAuth();
  const sync = useSync();
  const p = sync.lastResult?.pushed;
  const errorText = sync.lastError?.message ?? sync.lastErrorText;

  return (
    <Screen>
      <Card style={{ gap: space.xs }}>
        <SectionTitle>Hisob</SectionTitle>
        <Text style={type.body}>{auth.email}</Text>
        <Text style={type.caption}>Do'kon: {auth.shopName || '—'}</Text>
      </Card>

      <Card style={{ gap: space.sm }}>
        <SectionTitle>Bulutga sinxronlash</SectionTitle>
        <Text style={type.caption}>
          Internet bo'lganda telefondagi savdo, to'lov, mijoz va mahsulotlar serverga yuboriladi, web yoki boshqa
          qurilmada kiritilganlari esa telefonga qo'shiladi. Telefondagi yozuvlar hech qachon o'chirilmaydi.
        </Text>
        <Text style={type.bodyStrong}>
          {sync.pending === null ? 'Hisoblanmoqda…' : sync.pending === 0 ? "Barcha moliyaviy yozuvlar serverga yuborilgan" : `${sync.pending} ta yozuv yuborilishini kutmoqda`}
        </Text>
        <Text style={type.caption}>
          Oxirgi muvaffaqiyatli sinxronlash: {sync.lastSyncAt ? formatDateTime(sync.lastSyncAt) : "hali yo'q"}
        </Text>
        <Button label="Hozir sinxronlash" icon="cloud-upload-outline" onPress={() => void sync.syncNow()} loading={sync.running} />
        {errorText ? (
          <Banner tone={sync.lastError?.kind === 'network' ? 'warning' : 'error'} title="Oxirgi urinish to'xtadi">
            <Text style={type.body}>
              {errorText}{' '}
              {sync.lastError?.kind === 'network'
                ? 'Internet qaytganda avtomatik qayta urinadi.'
                : "Avtomatik qayta urinish to'xtatildi — muammoni tuzatib, «Hozir sinxronlash»ni bosing."}{' '}
              Yuborilmagan yozuvlar telefonda saqlanib turibdi.
            </Text>
          </Banner>
        ) : sync.lastResult && p ? (
          <Banner tone="success" title="Sinxronlandi">
            <Text style={type.body}>
              {`Yuborildi: savdo ${p.sale}, bekor qilish ${p.reversal}, to'lov ${p.payment}, to'lov bekor ${p.payment_void}, mijoz ${p.customer}, mahsulot ${p.product}.`}
              {sync.lastPull
                ? `\nBulutdan olindi: savdo ${sync.lastPull.imported.sale}, to'lov ${sync.lastPull.imported.payment}, bekor qilish ${sync.lastPull.imported.reversal + sync.lastPull.imported.payment_void}, mijoz ${sync.lastPull.imported.customer + sync.lastPull.updated.customer}, mahsulot ${sync.lastPull.imported.product + sync.lastPull.updated.product}.${sync.lastPull.removed.customer + sync.lastPull.removed.product > 0 ? ` Bulutda o'chirilgani uchun olib tashlandi: mijoz ${sync.lastPull.removed.customer}, mahsulot ${sync.lastPull.removed.product}.` : ''}`
                : ''}
            </Text>
          </Banner>
        ) : null}
        {sync.lastPull && sync.lastPull.rejected.length > 0 ? (
          <Banner tone="warning" title={`${sync.lastPull.rejected.length} ta bulut yozuvi telefonga olinmadi`}>
            <Text style={type.caption}>
              {sync.lastPull.rejected
                .slice(0, 5)
                .map((r) => `• ${r.reason}`)
                .join('\n')}
            </Text>
          </Banner>
        ) : null}
      </Card>

      <View>
        <Button
          label="Hisobdan chiqish"
          variant="secondary"
          icon="log-out-outline"
          onPress={() =>
            Alert.alert(
              'Hisobdan chiqish',
              sync.pending
                ? `${sync.pending} ta yozuv hali bulutga yuborilmagan. Ular telefonda qoladi va qayta kirganingizda yuboriladi. Chiqasizmi?`
                : "Telefondagi ma'lumotlar o'chirilmaydi va lokal rejimda ishlashda davom etadi.",
              [
                { text: 'Bekor qilish', style: 'cancel' },
                { text: 'Chiqish', onPress: () => void auth.signOut() },
              ],
            )
          }
        />
      </View>
    </Screen>
  );
}
