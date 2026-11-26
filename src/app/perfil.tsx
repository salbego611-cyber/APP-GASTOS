import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View, type DimensionValue } from 'react-native';
import { creditDebit } from '../credit';
import { brl } from '../domain';
import { MonthPicker } from '../month-picker';
import { useStore } from '../store';
import { Button, Copy, Empty, Page, Section, spread, wrap } from '../ui';

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

export default function Profile() {
  const { data, today, colors, start, end } = useStore();
  let income = 0;
  let expenses = 0;
  const byCategory = new Map<number, number>();

  for (const entry of data?.entries ?? []) {
    if (!entry.confirmed || entry.date > today) continue;
    if (entry.kind === 'entrada') {
      income += entry.cents;
    } else {
      const debit = creditDebit(entry);
      expenses += debit;
      byCategory.set(entry.categoryId, (byCategory.get(entry.categoryId) ?? 0) + debit);
    }
  }
  const cardPayments = (data?.invoicePayments ?? []).reduce((sum, payment) =>
    payment.paymentDate >= start && payment.paymentDate < end && payment.paymentDate <= today ? sum + payment.cents : sum, 0);
  if (cardPayments > 0) {
    expenses += cardPayments;
    byCategory.set(0, cardPayments);
  }

  const balance = income - expenses;
  const status = balance > 0 ? 'Sobrou no período'
    : balance < 0 ? 'Gastos acima das entradas'
    : income > 0 ? 'Entradas e gastos no mesmo valor'
    : 'Sem lançamentos confirmados';
  const tone = balance > 0 ? colors.brand : balance < 0 ? colors.danger : colors.muted;
  const spent = income > 0 ? Math.max(0, expenses) / income : null;
  const deposits = data ? data.reserves.economia.deposits + data.reserves.investimento.deposits : 0;
  const categories = [...byCategory].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
  const categoryTotal = categories.reduce((sum, [, cents]) => sum + cents, 0);
  const names = new Map(data?.categories.map(category => [category.id, category.name]));
  names.set(0, 'Pagamentos de faturas');

  return <Page title="Perfil financeiro" subtitle="Veja como sua renda e seus gastos se comparam no período."
    action={<Button label="Voltar aos ajustes" icon="arrow-back-outline" onPress={() => router.navigate('/ajustes')} />}>
    <MonthPicker />
    {data ? <>
      <Section title="Diagnóstico do período">
        <Copy muted>Considera entradas recebidas e gastos pagos até hoje.</Copy>
        <View style={wrap}>
          <View style={styles.total}>
            <Copy muted>Entradas recebidas</Copy>
            <Copy style={styles.amount}>{brl(income)}</Copy>
          </View>
          <View style={styles.total}>
            <Copy muted>Gastos pagos</Copy>
            <Copy style={styles.amount}>{brl(expenses)}</Copy>
          </View>
          <View style={styles.total}>
            <Copy muted>Entradas menos gastos</Copy>
            <Copy style={[styles.amount, { color: tone }]}>{brl(balance)}</Copy>
          </View>
        </View>
        <Copy style={[styles.emphasis, { color: tone }]}>{status}</Copy>
        {spent === null ? <Copy muted>Registre uma entrada recebida para comparar gastos e aportes com sua renda.</Copy> : <>
          <View style={styles.metric}>
            <View style={[wrap, { justifyContent: 'space-between' }]}>
              <Copy style={styles.emphasis}>Quanto da renda foi gasto</Copy>
              <Copy style={[styles.emphasis, { color: tone }]}>{percent.format(spent)}</Copy>
            </View>
            <View accessibilityRole="progressbar" accessibilityLabel="Quanto da renda foi gasto"
              accessibilityValue={{ text: percent.format(spent) }}
              style={[styles.track, { backgroundColor: colors.line }]}>
              <View style={[styles.fill, { backgroundColor: tone,
                width: (Math.min(1, spent) * 100 + '%') as DimensionValue }]} />
            </View>
          </View>
          <View style={styles.metric}>
            <View style={[wrap, { justifyContent: 'space-between' }]}>
              <Copy style={styles.emphasis}>Guardado ou investido em relação à renda</Copy>
              <Copy style={[styles.emphasis, { color: colors.brand }]}>{percent.format(deposits / income)}</Copy>
            </View>
            <Copy muted>Compara os depósitos e aportes do período com as entradas recebidas.</Copy>
          </View>
        </>}
      </Section>
      <Section title="Gastos pagos por categoria">
        {categories.length ? categories.map(([id, cents]) => <View key={id} style={styles.metric}>
          <View style={spread}>
            <Copy style={{ flexShrink: 1 }}>{names.get(id) ?? 'Categoria'}</Copy>
            <Copy style={styles.emphasis}>{brl(cents)} · {percent.format(cents / categoryTotal)}</Copy>
          </View>
          <View style={[styles.track, { backgroundColor: colors.soft }]} aria-hidden>
            <View style={[styles.fill, { backgroundColor: colors.brand,
              width: (cents / categoryTotal * 100 + '%') as DimensionValue }]} />
          </View>
        </View>) : <Empty title="Nenhum gasto pago no período" icon="pie-chart-outline"
          detail="Seus gastos aparecem por categoria quando você os marca como pagos." />}
      </Section>
    </> : <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando perfil do período" />}
  </Page>;
}

const styles = StyleSheet.create({
  total: { flexGrow: 1, flexBasis: 130, gap: 3 },
  amount: { fontSize: 20, lineHeight: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  emphasis: { fontWeight: '800' },
  metric: { gap: 5 },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
