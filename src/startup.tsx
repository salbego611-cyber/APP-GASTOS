import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export function StartupScreen({ issue, onRetry }: { issue?: string; onRetry?: () => void }) {
  return <View style={styles.screen}>
    <StatusBar style="light" />
    <Image source={require('../assets/bolso-icon.png')} style={styles.icon} accessible={false} />
    <Text accessibilityRole="header" style={styles.title}>Bolso em Dia</Text>
    {issue ? <>
      <Text accessibilityRole="alert" style={styles.copy}>{issue}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}>
        <Text style={styles.buttonLabel}>Tentar novamente</Text>
      </Pressable>
    </> : <>
      <ActivityIndicator color="#A6E9BD" accessibilityLabel="Carregando Bolso em Dia" />
      <Text style={styles.copy}>Abrindo seus dados…</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#123F33', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  icon: { width: 96, height: 96 },
  title: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', textAlign: 'center' },
  copy: { color: '#DBF4E5', textAlign: 'center', fontSize: 15, lineHeight: 22 },
  button: { backgroundColor: '#A6E9BD', minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 16 },
  buttonLabel: { color: '#123F33', fontWeight: '800' },
});
