import { useState } from 'react';
import { View, useWindowDimensions, type DimensionValue } from 'react-native';
import { router } from 'expo-router';
import { creditDebit } from '../credit';
import { brl, integer, isFutureIncome, type Entry, type Kind } from '../domain';
import { FavoriteActions } from '../favorite-actions';
import type { Favorite } from '../favorites';
import { BudgetForm, EntryForm } from '../forms';
import { MonthPicker } from '../month-picker';
import { ReserveCards } from '../reserves';
import { useStore } from '../store';
import { UpcomingBills } from '../upcoming';
import { Button, Card, Copy, Empty, EntryRow, Icon, Page, Section, row, spread, wrap } from '../ui';

function Progress({ label, used, limit }: { label: string; used: number; limit: number }) {
  const { colors } = useStore();
  const ratio = Math.max(0, used / limit);
  const tone = used > limit ? colors.danger : ratio >= 0.8 ? colors.warning : colors.brand;
  return <View style={{ gap: 6 }}>
    <View style={spread}>
      <Copy style={{ fontWeight: '800', flexShrink: 1 }}>{label}</Copy>
      <Copy style={{ color: tone, fontWeight: '800' }}>{integer.format(Math.floor(ratio * 100))}%</Copy>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.min(100, Math.floor(ratio * 100)) }}
      style={{ height: 8, borderRadius: 6, backgroundColor: colors.line, overflow: 'hidden' }}>
      <View style={{ width: (Math.min(100, ratio * 100) + '%') as DimensionValue, height: '100%', borderRadius: 6, backgroundColor: tone }} />
    </View>
    <Copy muted>{brl(used)} de {brl(limit)}{used > limit ? ' · Limite ultrapassado' : used === limit
      ? ' · Limite atingido' : ratio >= 0.8 ? ' · Perto do limite' : ''}</Copy>
  </View>;
}

export default function Dashboard() {
  const { data, colors, today, start, end } = useStore();
  const { width } = useWindowDimensions();
  const [edit, setEdit] = useState<Entry>();
  const [add, setAdd] = useState<Kind>();
  const [favorite, setFavorite] = useState<Favorite>();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const entries = data?.entries ?? [];
  let expenses = 0;
  let income = 0;
  let futureIncome = 0;
  let confirmedIncome = 0;
  let confirmedExpenses = 0;
  let pendingExpenses = 0;
  const spending = new Map<number, number>();
  for (const entry of entries) {
    if (entry.kind === 'entrada') {
      income += entry.cents;
      if (entry.confirmed) confirmedIncome += entry.cents;
      else if (isFutureIncome(entry.kind, entry.date, today)) futureIncome += entry.cents;
    } else {
      const debit = creditDebit(entry);
      expenses += debit;
      if (entry.confirmed) confirmedExpenses += debit;
      else if (!entry.credit) pendingExpenses += debit;
      spending.set(entry.categoryId, (spending.get(entry.categoryId) ?? 0) + debit);
    }
  }
  const payments = (data?.invoicePayments ?? []).reduce((sum, payment) =>
    payment.paymentDate >= start && payment.paymentDate < end ? sum + payment.cents : sum, 0);
  let financedPaid = 0;
  for (const invoice of data?.invoiceBalances ?? []) {
    if (invoice.dueDate < start || invoice.dueDate >= end) continue;
    pendingExpenses += Math.max(0, invoice.remainingCents);
    financedPaid += invoice.financedPaidCents;
  }
  confirmedExpenses += payments;
  expenses += financedPaid;
  if (financedPaid > 0) spending.set(0, financedPaid);
  const name = (id: number) => id === 0 ? 'Parte paga de faturas parceladas'
    : data?.categories.find(item => item.id === id)?.name ?? 'Categoria';
  const general = data?.budgets.find(budget => budget.categoryId === 0);
  const limits = data?.budgets.filter(budget => budget.categoryId !== 0) ?? [];
  const categories = [...spending.entries()].filter(([, cents]) => cents > 0).sort((a, b) => b[1] - a[1]);
  const categoryTotal = categories.reduce((sum, [, cents]) => sum + cents, 0);
  const wide = width >= 790;
  const overviewCard = wide ? { flex: 1, minWidth: 0 } : undefined;

  return <Page title="Visão do mês" subtitle="Acompanhe suas entradas, seus gastos e o orçamento do período."
    action={<>
      <Button label="Adicionar gasto" variant="primary" icon="add" onPress={() => setAdd('gasto')} disabled={!data} />
      <Button label="Adicionar entrada" icon="arrow-down-outline" onPress={() => setAdd('entrada')} disabled={!data} />
      <FavoriteActions onSelect={item => { setFavorite(item); setAdd('gasto'); }} />
    </>}>
    <MonthPicker />
    {!!data && <>
      <View style={[wrap, { alignItems: 'stretch' }]}>
        <View style={{ flex: 1, minWidth: wide ? 220 : '100%', gap: 8, padding: 20, borderRadius: 19, backgroundColor: '#123F33' }}>
          <View style={row}><Icon name="wallet-outline" color="#A6E9BD" /><Copy style={{ color: '#DBF4E5', fontWeight: '700' }}>Saldo disponível</Copy></View>
          <Copy style={{ fontSize: 32, lineHeight: 38, fontWeight: '900', color: '#FFFFFF' }}>{brl(confirmedIncome - confirmedExpenses)}</Copy>
          <View style={[wrap, { justifyContent: 'space-between', marginTop: 2 }]}>
            <Copy style={{ color: '#DBF4E5' }}>Saldo previsto</Copy>
            <Copy style={{ color: '#FFFFFF', fontWeight: '800' }}>{brl(income - confirmedExpenses - pendingExpenses)}</Copy>
          </View>
          {payments > 0 && <View style={[wrap, { justifyContent: 'space-between' }]}>
            <Copy style={{ color: '#DBF4E5' }}>Pagamentos de fatura</Copy>
            <Copy style={{ color: '#FFFFFF', fontWeight: '800' }}>{brl(payments)}</Copy>
          </View>}
        </View>
        {([{ label: 'Entradas', value: income, color: colors.brand, icon: 'arrow-down-outline',
          future: futureIncome, pending: income - confirmedIncome - futureIncome },
          { label: 'Gastos', value: expenses, color: colors.danger, icon: 'arrow-up-outline',
            future: 0, pending: pendingExpenses }] as const).map(item =>
          <Card key={item.label} style={{ flex: 1, minWidth: wide ? 180 : 125 }}>
            <View style={row}><Icon name={item.icon} color={item.color} /><Copy muted>{item.label}</Copy></View>
            <Copy style={{ fontSize: wide ? 26 : 19, lineHeight: 30, fontWeight: '900', color: item.color }}>{brl(item.value)}</Copy>
            {item.future > 0 && <Copy style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>
              Inclui {brl(item.future)} em entradas futuras
            </Copy>}
            {item.pending > 0 && <Copy style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>
              {brl(item.pending)} pendentes
            </Copy>}
          </Card>)}
      </View>
      <UpcomingBills onOpenEntry={setEdit} />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14, alignItems: 'stretch' }}>
        <Section title="Orçamento" style={overviewCard}
          action={<Button label="Editar orçamento" compact icon="create-outline" onPress={() => setBudgetOpen(true)} />}>
          {pendingExpenses > 0 && <Copy muted>O orçamento inclui gastos pendentes.</Copy>}
          {general ? <Progress label="Limite geral" used={expenses} limit={general.cents} /> : <>
            <Copy muted>Defina quanto você pode gastar neste período.</Copy>
            <View style={wrap}><Button label="Definir limite" icon="add" onPress={() => setBudgetOpen(true)} /></View>
          </>}
          {limits.map(item => <Progress key={item.categoryId} label={name(item.categoryId)}
            used={spending.get(item.categoryId) ?? 0} limit={item.cents} />)}
        </Section>
        <Section title="Gastos por categoria" style={overviewCard}>
          {!categories.length && <Empty compact title="Nenhum gasto no período" icon="pie-chart-outline"
            detail="Adicione um gasto para ver a divisão por categoria." />}
          {categories.map(([id, cents]) => <View key={id} style={{ gap: 5 }}>
            <View style={spread}><Copy style={{ flexShrink: 1 }}>{name(id)}</Copy><Copy style={{ fontWeight: '800' }}>{brl(cents)}</Copy></View>
            <View style={{ height: 6, borderRadius: 4, backgroundColor: colors.soft, overflow: 'hidden' }}>
              <View style={{ width: (cents / categoryTotal * 100 + '%') as DimensionValue, height: '100%', backgroundColor: colors.brand, borderRadius: 4 }} />
            </View>
          </View>)}
        </Section>
      </View>
      <ReserveCards wide={wide} />
      <Section title="Recentes" action={<Button label="Ver todos" variant="plain" onPress={() => router.navigate('/lancamentos')} />}>
        {entries.length ? entries.slice(0, 4).map(entry => <EntryRow key={entry.id} entry={entry} onPress={() => setEdit(entry)} />)
          : <Empty title="Comece pelo primeiro lançamento" icon="receipt-outline"
            detail="Use Adicionar gasto ou Adicionar entrada para registrar um valor neste período." />}
      </Section>
    </>}
    {(edit || add) && <EntryForm entry={edit} initialKind={add} favorite={favorite}
      onClose={() => { setEdit(undefined); setAdd(undefined); setFavorite(undefined); }} />}
    {budgetOpen && <BudgetForm onClose={() => setBudgetOpen(false)} />}
  </Page>;
}
