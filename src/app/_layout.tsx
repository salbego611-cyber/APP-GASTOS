import { Tabs, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StartupScreen } from '../startup';
import { StartupIntro } from '../startup-intro';
import { DataProvider, useStore } from '../store';
import { Icon, type IconName } from '../ui';
import { UpcomingBillsProvider } from '../upcoming';

const tabs: { route: string; title: string; icon: IconName }[] = [
  { route: 'index', title: 'Início', icon: 'home-outline' },
  { route: 'lancamentos', title: 'Lançamentos', icon: 'swap-vertical-outline' },
  { route: 'contador', title: 'Contador', icon: 'calculator-outline' },
  { route: 'ajustes', title: 'Ajustes', icon: 'settings-outline' },
];

function Navigation({ introVisible }: { introVisible: boolean }) {
  const { colors, isDark } = useStore();
  return <>
    <StatusBar style={introVisible || isDark ? 'light' : 'dark'} />
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brand,
      tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line },
      tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
    }}>
      {tabs.map(tab => <Tabs.Screen key={tab.route} name={tab.route} options={{
        title: tab.title, tabBarIcon: ({ color, size }) => <Icon name={tab.icon} color={color} size={size} />,
      }} />)}
      <Tabs.Screen name="perfil" options={{ title: 'Perfil financeiro', href: null }} />
      <Tabs.Screen name="cartoes" options={{ title: 'Cartões de crédito', href: null }} />
    </Tabs>
  </>;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <StartupScreen issue="Não foi possível iniciar o Bolso em Dia." onRetry={() => void retry()} />;
}

export default function Layout() {
  const [introVisible, setIntroVisible] = useState(true);
  const finishIntro = useCallback(() => setIntroVisible(false), []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <View style={styles.root} aria-hidden={introVisible}
          importantForAccessibility={introVisible ? 'no-hide-descendants' : 'auto'}>
          <DataProvider><UpcomingBillsProvider><Navigation introVisible={introVisible} /></UpcomingBillsProvider></DataProvider>
        </View>
        {introVisible && <StartupIntro onFinish={finishIntro} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
