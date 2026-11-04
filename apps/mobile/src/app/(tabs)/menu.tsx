import Constants from 'expo-constants';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../backend/AuthProvider';
import { useCatalog } from '../../data/LedgerProvider';
import { SyncStatus } from '../../features/SyncStatus';
import { useFocusData } from '../../features/useAsync';
import { Card, ListRow, SectionTitle } from '../../ui/components';
import { colors, space, type } from '../../ui/theme';

export default function MenuScreen() {
  const catalog = useCatalog();
  const auth = useAuth();
  const { data: settings } = useFocusData(() => catalog.getSettings(), [catalog]);
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <ScrollView contentContainerStyle={s.container}>
      <Card style={s.shop}>
        <Text style={type.label}>Do'kon</Text>
        <Text style={type.title}>{settings?.shop_name || 'Do\'kon nomi kiritilmagan'}</Text>
        {settings?.shop_phone ? <Text style={type.caption}>{settings.shop_phone}</Text> : null}
      </Card>

      <View style={s.group}>
        <SectionTitle>Daftarlar va ombor</SectionTitle>
        <View style={s.list}>
          <ListRow title="Ombor" subtitle="Qoldiq, tan narx, kirim qilish" onPress={() => router.push('/warehouse')} />
          <ListRow title="Kirim daftari" subtitle="Ta'minotchidan olingan tovarlar" onPress={() => router.push('/books/in')} />
          <ListRow title="Chiqim daftari" subtitle="Sotilgan tovarlar" onPress={() => router.push('/books/out')} />
          <ListRow title="Ta'minotchilar" subtitle="Qarz va to'lovlar" onPress={() => router.push('/suppliers')} />
          <ListRow title="Mijozlar" subtitle="Doimiy va bir martalik mijozlar" onPress={() => router.push('/customers')} />
          <ListRow title="Qoralamalar" subtitle="Tugallanmagan hisob" onPress={() => router.push('/drafts')} />
        </View>
      </View>

      <View style={s.group}>
        <SectionTitle>Boshqaruv</SectionTitle>
        <View style={s.list}>
          <ListRow title="Mahsulotlar" subtitle="Nom, birlik va narx katalogi" onPress={() => router.push('/products')} />
          <ListRow title="Hisobotlar" subtitle="Kunlik, haftalik savdo, qarz va to'lovlar" onPress={() => router.push('/reports')} />
          <ListRow title="Yangi mijoz" subtitle="Mijozlar ro'yxatiga qo'shish" onPress={() => router.push('/customers/form')} />
          <ListRow title="Sozlamalar" subtitle="Do'kon ma'lumotlari, ilova haqida" onPress={() => router.push('/settings')} />
          <ListRow
            title="Hisob va bulut"
            subtitle={
              auth.status === 'disabled'
                ? 'Bulut ulanmagan — lokal rejim'
                : auth.status === 'signed-in'
                  ? `Kirilgan: ${auth.email ?? ''}`
                  : 'Kirish va bulutga zaxira'
            }
            onPress={() => router.push('/account')}
          />
        </View>
      </View>

      <SyncStatus />

      <Text style={s.version}>Hisobchi Go · versiya {version}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  shop: { gap: space.xs, backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  group: { gap: space.xs },
  list: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  version: { ...type.caption, textAlign: 'center' },
});
