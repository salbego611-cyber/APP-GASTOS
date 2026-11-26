import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { MonthBudgetResult } from './db';
import { brDate, brl, monthLabel, shiftMonth } from './domain';
import { useStore } from './store';
import { Button, Card, Copy, Dialog, Icon, row, spread, wrap } from './ui';

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const dateFormat = new Intl.DateTimeFormat('pt-BR');

export function MonthPicker() {
  const { month, current, start, end, setMonth, settings, colors } = useStore();
  const [open, setOpen] = useState(false);
  const endDate = new Date(end + 'T12:00:00');
  endDate.setDate(endDate.getDate() - 1);
  const period = settings?.firstDay === 1
    ? (month === current ? 'Período atual' : 'Período selecionado')
    : brDate(start) + ' a ' + dateFormat.format(endDate);

  return <Card>
    <View style={spread}>
      <Button compact label="Mês anterior" icon="chevron-back" onPress={() => setMonth(shiftMonth(month, -1))} />
      <Pressable accessibilityRole="button" accessibilityLabel={'Escolher mês: ' + monthLabel(month)}
        onPress={() => setOpen(true)} style={({ pressed }) => [styles.trigger, {
          backgroundColor: pressed ? colors.line : colors.soft,
        }]}>
        <View style={[row, { gap: 6, justifyContent: 'center' }]}>
          <Copy style={styles.currentMonth}>{monthLabel(month)}</Copy>
          <Icon name="chevron-down" size={16} />
        </View>
        <Copy muted style={styles.period}>{period}</Copy>
      </Pressable>
      <Button compact label="Próximo mês" icon="chevron-forward" onPress={() => setMonth(shiftMonth(month, 1))} />
    </View>
    {month !== current && <Button variant="plain" label="Voltar ao mês atual" onPress={() => setMonth(undefined)} />}
    {open && <YearPicker onClose={() => setOpen(false)} />}
  </Card>;
}

function YearPicker({ onClose }: { onClose: () => void }) {
  const { month, setMonth, getBudgetYear, colors } = useStore();
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [result, setResult] = useState<{ year: number; months: MonthBudgetResult[] | null }>();
  const [attempt, retry] = useState(0);
  const { width } = useWindowDimensions();
  const columns = width >= 440 ? 3 : 2;
  const months = result?.year === year ? result.months : undefined;

  useEffect(() => {
    let active = true;
    getBudgetYear(year).then(
      value => { if (active) setResult({ year, months: value }); },
      () => { if (active) setResult({ year, months: null }); },
    );
    return () => { active = false; };
  }, [getBudgetYear, year, attempt]);

  return <Dialog title="Escolher mês" onClose={onClose}>
    <View style={spread}>
      <Button compact icon="chevron-back" label="Ano anterior" disabled={year <= 1900} onPress={() => setYear(value => value - 1)} />
      <Copy style={styles.year}>{year}</Copy>
      <Button compact icon="chevron-forward" label="Próximo ano" disabled={year >= 9999} onPress={() => setYear(value => value + 1)} />
    </View>
    <Copy muted>Resultado do orçamento geral de cada mês, incluindo gastos pendentes.</Copy>
    {months === undefined && <ActivityIndicator accessibilityLabel="Carregando meses" color={colors.brand} />}
    {months === null && <View style={{ gap: 8 }}>
      <Copy>Não foi possível consultar os meses deste ano.</Copy>
      <Button label="Tentar novamente" onPress={() => { setResult(undefined); retry(value => value + 1); }} />
    </View>}
    {!!months && <>
      <View style={styles.grid}>
        {Array.from({ length: Math.ceil(months.length / columns) }, (_, index) => (
          <View key={index} style={[row, styles.gridRow]}>
            {months.slice(index * columns, (index + 1) * columns).map(item => (
              <MonthTile key={item.month} item={item} selected={month === item.month} onSelect={() => {
                setMonth(item.month);
                onClose();
              }} />
            ))}
          </View>
        ))}
      </View>
      <View style={wrap}>
        <Copy style={[styles.legend, { color: colors.brand }]}>+ Sobrou</Copy>
        <Copy style={[styles.legend, { color: colors.muted }]}>= No limite</Copy>
        <Copy style={[styles.legend, { color: colors.danger }]}>− Acima do orçamento</Copy>
      </View>
    </>}
  </Dialog>;
}

function MonthTile({ item, selected, onSelect }: {
  item: MonthBudgetResult; selected: boolean; onSelect: () => void;
}) {
  const { colors } = useStore();
  const { month, balance } = item;
  const label = monthFormat.format(new Date(month + '-15T12:00:00Z'));
  const value = balance === null ? 'Sem orçamento'
    : balance > 0 ? '+ ' + brl(balance)
    : balance < 0 ? '− ' + brl(-balance)
    : brl(0);
  const status = balance === null ? '' : balance > 0 ? 'Sobrou, '
    : balance < 0 ? 'Acima do orçamento, ' : 'No limite, ';
  const tone = balance === null || balance === 0 ? colors.muted : balance > 0 ? colors.brand : colors.danger;
  const backgroundColor = balance === null || balance === 0 ? colors.bg : balance > 0 ? colors.soft : colors.dangerBg;

  return <Pressable accessibilityRole="button" accessibilityLabel={monthLabel(month) + ', ' + status + value}
    accessibilityState={{ selected }} onPress={onSelect}
    style={({ pressed }) => [styles.tile, {
      backgroundColor, borderColor: selected ? colors.brand : colors.line, opacity: pressed ? 0.75 : 1,
    }]}>
    <View style={[row, { gap: 4 }]}>
      <Copy style={styles.tileMonth}>{label[0].toUpperCase() + label.slice(1)}</Copy>
      {selected && <Icon name="checkmark" size={15} />}
    </View>
    <Copy style={[styles.result, { color: tone }]}>{value}</Copy>
  </Pressable>;
}

const styles = StyleSheet.create({
  trigger: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 8 },
  currentMonth: { fontWeight: '800', fontSize: 16, textAlign: 'center', flexShrink: 1 },
  period: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  year: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  grid: { gap: 8 },
  gridRow: { alignItems: 'stretch', gap: 8 },
  tile: { flex: 1, minWidth: 0, borderRadius: 12, borderWidth: 1, gap: 2, padding: 9, justifyContent: 'center' },
  tileMonth: { fontWeight: '800', lineHeight: 19, flexShrink: 1 },
  result: { fontSize: 13, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  legend: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
});
