import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle, type ColorValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from 'expo-router';
import { useStore } from './store';
import { brDate, brl, isFutureIncome, type Entry } from './domain';
import { invoiceEntryStatus } from './invoice-status';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const row: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 10 };
export const spread: ViewStyle = { ...row, justifyContent: 'space-between' };
export const wrap: ViewStyle = { ...row, flexWrap: 'wrap' };

export function Copy({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const { colors } = useStore();
  return <Text style={[{ color: muted ? colors.muted : colors.ink, fontSize: 14, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const { colors } = useStore();
  return <Ionicons name={name} size={size} color={color ?? colors.brand} aria-hidden />;
}

export function Button({ label, onPress, icon, variant = 'secondary', compact, disabled, grow }: {
  label: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'secondary' | 'danger' | 'plain';
  compact?: boolean; disabled?: boolean; grow?: boolean;
}) {
  const { colors, isDark } = useStore();
  const color = variant === 'primary' ? (isDark ? '#112820' : '#FFFFFF')
    : variant === 'danger' ? colors.danger : colors.brand;
  const backgroundColor = variant === 'primary' ? colors.brand
    : variant === 'danger' ? colors.dangerBg : variant === 'plain' ? 'transparent' : colors.soft;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      grow && { flexGrow: 1 }, compact && { paddingHorizontal: 12 }]}>
    {icon && <Icon name={icon} size={compact ? 19 : 21} color={color} />}
    {!compact && <Text style={{ color, fontWeight: '700', fontSize: 14, flexShrink: 1 }}>{label}</Text>}
  </Pressable>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useStore();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>{children}</View>;
}

export function Section({ title, action, children, style }: {
  title: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  return <Card style={style}><View style={spread}><Copy style={styles.section}>{title}</Copy>{action}</View>{children}</Card>;
}

export function Page({ title, subtitle, children, action }: {
  title: string; subtitle: string; children: ReactNode; action?: ReactNode;
}) {
  const { colors, notice, undoNotice, error, retry, settings } = useStore();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pageContainer}>
      <View style={[styles.page, { paddingHorizontal: width >= 760 ? 36 : 18 }]}>
        <View style={spread}>
          <View style={row}>
            <View style={[styles.logo, { backgroundColor: colors.soft }]}><Icon name="wallet-outline" size={22} /></View>
            <Copy style={{ fontSize: 16, fontWeight: '800' }}>Bolso em Dia</Copy>
          </View>
          {width >= 390 && <View style={row}><Icon name="lock-closed-outline" size={14} /><Copy muted>Dados locais</Copy></View>}
        </View>
        <View style={{ gap: 10 }}>
          <Copy style={styles.title}>{title}</Copy>
          <Copy muted>{subtitle}</Copy>
          {action && <View style={wrap}>{action}</View>}
        </View>
        {error ? <Card><Copy>{error}</Copy><Button label="Tentar novamente" onPress={retry} /></Card>
          : settings ? children : <ActivityIndicator color={colors.brand} />}
      </View>
    </ScrollView>
    {focused && notice && <View pointerEvents={notice.undo ? 'auto' : 'none'}
      style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Icon name="information-circle-outline" />
      <Text accessibilityLiveRegion="polite" style={{ color: colors.ink, fontWeight: '700', flexShrink: 1 }}>{notice.message}</Text>
      {notice.undo && <Button label="Desfazer" onPress={undoNotice} />}
    </View>}
  </SafeAreaView>;
}

export function Choices<T extends string | number>({ items, value, onChange }: {
  items: { key: T; label: string }[]; value: T; onChange: (key: T) => void;
}) {
  const { colors } = useStore();
  return <View style={wrap}>{items.map(item => <Pressable key={item.key} accessibilityRole="button"
    accessibilityState={{ selected: value === item.key }} onPress={() => onChange(item.key)}
    style={[styles.chip, { backgroundColor: value === item.key ? colors.soft : colors.card,
      borderColor: value === item.key ? colors.brand : colors.line }]}>
    <Copy style={{ fontWeight: value === item.key ? '800' : '500' }}>{item.label}</Copy>
  </Pressable>)}</View>;
}

export function Field({ label, ...props }: ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useStore();
  return <View style={{ gap: 6 }}>
    <Copy style={{ fontWeight: '700' }}>{label}</Copy>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted}
      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }, props.style]} />
  </View>;
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useStore();
  return <Modal transparent animationType="fade" onRequestClose={onClose}>
    <SafeAreaView style={styles.overlay}>
      <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={spread}>
          <Copy style={styles.section}>{title}</Copy>
          <Button compact label="Fechar" icon="close" onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16 }}>{children}</ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

export function Empty({ title, detail, icon, compact }: { title: string; detail: string; icon: IconName; compact?: boolean }) {
  const { colors } = useStore();
  const badge = <View style={[styles.logo, { backgroundColor: colors.soft }]}><Icon name={icon} size={22} /></View>;
  if (compact) return <View style={row}>
    {badge}
    <View style={{ flex: 1, gap: 2 }}>
      <Copy style={{ fontWeight: '800' }}>{title}</Copy>
      <Copy muted>{detail}</Copy>
    </View>
  </View>;

  return <View style={{ alignItems: 'center', paddingVertical: 16, gap: 7 }}>
    {badge}
    <Copy style={{ fontWeight: '800', textAlign: 'center' }}>{title}</Copy>
    <Copy muted style={{ textAlign: 'center', maxWidth: 360 }}>{detail}</Copy>
  </View>;
}

export function FutureIncomeBadge() {
  const { colors } = useStore();
  return <View style={[styles.futureBadge, { borderColor: colors.warning }]}>
    <Icon name="calendar-outline" size={13} color={colors.warning} />
    <Copy style={{ color: colors.warning, fontWeight: '700', fontSize: 12, lineHeight: 17, flexShrink: 1 }}>
      Entrada futura
    </Copy>
  </View>;
}

export function EntryRow({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const { data, colors, today } = useStore();
  const name = data?.categories.find(item => item.id === entry.categoryId)?.name ?? 'Categoria';
  const credit = entry.credit;
  const payment = credit ? data?.cards.find(card => card.id === credit.cardId)?.name ?? 'Cartão de crédito' : entry.payment;
  const date = credit ? 'Vencimento em ' + brDate(entry.date) : brDate(entry.date);
  const isIncome = entry.kind === 'entrada';
  const isRefund = Boolean(credit?.refundOf);
  const isCredit = isIncome || isRefund;
  const financed = credit?.financing?.role === 'original';
  const future = !entry.confirmed && isFutureIncome(entry.kind, entry.date, today);
  const status = invoiceEntryStatus(entry, data?.invoiceBalances);
  const isPending = status === 'Pendente' || status === 'Fatura parcialmente paga';
  return <Pressable accessibilityRole="button" onPress={onPress}
    style={[spread, { paddingVertical: 12, borderTopWidth: 1, borderColor: colors.line }]}>
    <View style={[styles.logo, { backgroundColor: isCredit ? colors.soft : colors.dangerBg }]}>
      <Icon name={isRefund ? 'arrow-undo-outline' : isIncome ? 'arrow-down-outline' : 'arrow-up-outline'}
        color={isCredit ? colors.brand : colors.danger} />
    </View>
    <View style={{ flex: 1 }}>
      <Copy style={{ fontWeight: '800' }}>{entry.note || name}</Copy>
      <Copy muted style={{ fontSize: 12 }}>{[date, entry.note && name, payment].filter(Boolean).join(' · ')}</Copy>
      {credit && <Copy muted style={{ fontSize: 12 }}>
        {credit.financing?.role === 'installment' ? 'Fatura original em' : isRefund ? 'Estorno em' : 'Compra em'} {brDate(credit.purchaseDate)}
      </Copy>}
      <View style={[wrap, { gap: 5 }]}>
        {future ? <FutureIncomeBadge /> : <Copy style={{
          fontSize: 12, fontWeight: '700', color: isPending ? colors.warning : colors.brand,
        }}>{status}</Copy>}
        {entry.seriesId !== null && <Copy muted style={{ fontSize: 12 }}>Mensal</Copy>}
        {credit && !isRefund && <Copy muted style={{ fontSize: 12 }}>Parcela {credit.installmentNumber}/{credit.installmentTotal}</Copy>}
      </View>
    </View>
    <Copy style={{ fontWeight: '800', color: financed ? colors.muted : isCredit ? colors.brand : colors.danger, textAlign: 'right', flexShrink: 1 }}>
      {isCredit ? '+ ' : '− '}{brl(entry.cents)}
    </Copy>
    <Icon name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
}



const styles = StyleSheet.create({
  futureBadge: {
    ...row, gap: 5, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 4,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2,
  },
  button: { ...row, justifyContent: 'center', minHeight: 44, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 8 },
  card: { padding: 16, borderWidth: 1, borderRadius: 19, gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pageContainer: { alignItems: 'center', flexGrow: 1 },
  page: { width: '100%', maxWidth: 1100, paddingTop: 18, paddingBottom: 30, gap: 18 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -1.2 },
  section: { fontSize: 18, lineHeight: 24, fontWeight: '800', flexShrink: 1 },
  chip: { borderWidth: 1, borderRadius: 20, minHeight: 42, justifyContent: 'center', paddingHorizontal: 13 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 47, fontSize: 16 },
  overlay: { flex: 1, backgroundColor: '#071A14A6', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '100%', borderWidth: 1, borderRadius: 20, padding: 16, gap: 14 },
  toast: { ...row, position: 'absolute', bottom: 12, alignSelf: 'center', maxWidth: '92%', borderWidth: 1, borderRadius: 12, padding: 10, zIndex: 1 },
});
