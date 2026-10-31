/**
 * Asosiy bo'limlar — doimiy pastki navigatsiya.
 * JS tab navigatori (expo-router/js-tabs): native modul talab qilmaydi, Expo Go'da iOS va Android'da ishlaydi.
 * Ikonkalar: Ionicons (@expo/vector-icons) — faol holatda to'liq, nofaol holatda kontur.
 */
import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { TabHeader } from '../../ui/AppHeader';
import { Icon, type IconName } from '../../ui/Icon';
import { colors, font } from '../../ui/theme';

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Icon name={focused ? active : inactive} size={24} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        header: (props) => <TabHeader title={typeof props.options.title === 'string' ? props.options.title : props.route.name} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: s.bar,
        tabBarLabelStyle: s.label,
        tabBarItemStyle: s.item,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Bosh sahifa', tabBarAccessibilityLabel: 'Bosh sahifa', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="sales"
        options={{ title: 'Savdolar', tabBarAccessibilityLabel: 'Savdolar', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: 'Yangi savdo',
          tabBarAccessibilityLabel: 'Yangi savdo',
          tabBarIcon: ({ focused }) => (
            <View style={[s.plus, focused && s.plusFocused]}>
              <Icon name="add" size={24} color={colors.onPrimary} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{ title: 'Mijozlar', tabBarAccessibilityLabel: 'Mijozlar', tabBarIcon: tabIcon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="menu"
        options={{ title: 'Menyu', tabBarAccessibilityLabel: 'Menyu', tabBarIcon: tabIcon('grid', 'grid-outline') }}
      />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { backgroundColor: colors.card, borderTopColor: colors.border, minHeight: 62 },
  item: { paddingTop: 6 },
  label: { fontSize: font.xs, fontWeight: '600' },
  plus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  plusFocused: { backgroundColor: colors.primaryDark },
});
