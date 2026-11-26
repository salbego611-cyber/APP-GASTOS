import { router } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  billRemindersAvailable, readReminderPreference, requestReminderPermission, saveReminderPreference, syncBillReminders,
} from './bill-reminders';
import type { InvoiceBalance } from './card-financing';
import { readEntries } from './db';
import { brDate, brl, isoDate, periodOf, type Entry } from './domain';
import { useStore } from './store';
import { Button, Copy, Dialog, Icon, Section, spread, wrap } from './ui';

type Bill = {
  key: string;
  date: string;
  cents: number;
  name: string;
  entry?: Entry;
};

function collectBills(entries: Entry[], balances: InvoiceBalance[], categories: Map<number, string>, cards: Map<number, string>) {
  const bills: Bill[] = entries.filter(entry => !entry.credit).map(entry => ({
    key: 'gasto:' + entry.id, date: entry.date, cents: entry.cents,
    name: entry.note || categories.get(entry.categoryId) || 'Gasto', entry,
  }));
  const invoices = balances.filter(invoice => invoice.remainingCents > 0).map(invoice => ({
    key: 'fatura:' + invoice.cardId + ':' + invoice.dueDate,
    date: invoice.dueDate, cents: invoice.remainingCents, name: 'Fatura de ' + (cards.get(invoice.cardId) ?? 'cartão'),
  }));
  return bills.concat(invoices)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'pt-BR'));
}

const notificationBlocked = 'Permita as notificações do Bolso em Dia nos ajustes do aparelho.';
const UpcomingContext = createContext<{
  bills?: Bill[];
  loadIssue: boolean;
  retry: () => void;
  reminders?: boolean;
  reminderIssue: string;
  changingReminders: boolean;
  toggleReminders: () => void;
} | null>(null);

export function UpcomingBillsProvider({ children }: { children: ReactNode }) {
  const { accessDatabase, data, today } = useStore();
  const [bills, setBills] = useState<Bill[]>();
  const [attempt, setAttempt] = useState(0);
  const [loadIssue, setLoadIssue] = useState(false);
  const [reminders, setReminders] = useState<boolean>();
  const [toggleIssue, setToggleIssue] = useState('');
  const [syncIssue, setSyncIssue] = useState('');
  const [changingReminders, setChangingReminders] = useState(false);
  const toggling = useRef(false);

  useEffect(() => {
    if (!data) return;
    let active = true;
    accessDatabase(db => readEntries(db, undefined, true)).then(entries => {
      if (!active) return;
      setBills(collectBills(entries, data.invoiceBalances, new Map(data.categories.map(item => [item.id, item.name])),
        new Map(data.cards.map(item => [item.id, item.name]))));
      setLoadIssue(false);
    }).catch(() => { if (active) setLoadIssue(true); });
    return () => { active = false; };
  }, [accessDatabase, attempt, data]);

  useEffect(() => {
    if (!billRemindersAvailable) return;
    let active = true;
    readReminderPreference().then(enabled => {
      if (active) setReminders(enabled);
    }).catch(() => {
      if (!active) return;
      setReminders(false);
      setToggleIssue('Não foi possível ler a preferência de lembretes.');
    });
    return () => { active = false; };
  }, []);

  const dueDates = reminders && bills ? [...new Set(bills.filter(bill => bill.date > today).map(bill => bill.date))].join('|') : '';
  const billsReady = bills !== undefined && !loadIssue;
  useEffect(() => {
    if (!billRemindersAvailable || reminders === undefined || (reminders && !billsReady)) return;
    let active = true;
    syncBillReminders(reminders, dueDates ? dueDates.split('|') : []).then(allowed => {
      if (active) setSyncIssue(allowed ? '' : notificationBlocked);
    }).catch(() => { if (active) setSyncIssue('Não foi possível atualizar os lembretes do aparelho.'); });
    return () => { active = false; };
  }, [billsReady, dueDates, reminders]);

  async function toggleReminders() {
    if (reminders === undefined || toggling.current) return;
    toggling.current = true;
    setChangingReminders(true);
    setToggleIssue('');
    try {
      const enable = !reminders;
      if (enable && !await requestReminderPermission()) {
        setToggleIssue(notificationBlocked);
        return;
      }
      await saveReminderPreference(enable);
      setReminders(enable);
    } catch {
      setToggleIssue('Não foi possível alterar a preferência de lembretes.');
    } finally {
      toggling.current = false;
      setChangingReminders(false);
    }
  }

  return <UpcomingContext.Provider value={{
    bills, loadIssue, retry: () => setAttempt(value => value + 1), reminders,
    reminderIssue: toggleIssue || syncIssue, changingReminders,
    toggleReminders: () => { void toggleReminders(); },
  }}>{children}</UpcomingContext.Provider>;
}

export function UpcomingBills({ onOpenEntry }: { onOpenEntry: (entry: Entry) => void }) {
  const upcoming = useContext(UpcomingContext);
  const { today, settings, setMonth, colors } = useStore();
  const [showAll, setShowAll] = useState(false);
  if (!upcoming) return null;

  const horizon = new Date(today + 'T12:00:00');
  horizon.setDate(horizon.getDate() + 7);
  const lastDay = isoDate(horizon);
  const bills = upcoming.bills ?? [];
  const overdue = bills.filter(bill => bill.date < today);
  const next = bills.filter(bill => bill.date >= today && bill.date <= lastDay);
  const overflow = overdue.length > 2 || next.length > 2;

  function open(bill: Bill) {
    setShowAll(false);
    if (bill.entry) {
      onOpenEntry(bill.entry);
    } else {
      setMonth(periodOf(bill.date, settings?.firstDay ?? 1));
      router.navigate('/cartoes');
    }
  }

  function renderGroups(expanded: boolean) {
    return <>
      {([{ label: 'Em atraso', items: overdue }, { label: 'Hoje e próximos 7 dias', items: next }]).map(group =>
        group.items.length > 0 && <View style={styles.group} key={group.label}>
          <Copy style={styles.strong}>{group.label}</Copy>
          {(expanded ? group.items : group.items.slice(0, 2)).map(bill => <Pressable key={bill.key}
            accessibilityRole="button" accessibilityLabel={bill.name + ', ' + brDate(bill.date) + ', ' + brl(bill.cents)}
            onPress={() => open(bill)}
            style={({ pressed }) => [spread, styles.item, { borderColor: colors.line, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.description}>
              <Copy style={styles.strong}>{bill.name}</Copy>
              <Copy muted>{bill.date === today ? 'Vence hoje' : brDate(bill.date)}</Copy>
            </View>
            <Copy style={[styles.amount, { color: bill.date < today ? colors.danger : colors.ink }]}>{brl(bill.cents)}</Copy>
            <Icon name="chevron-forward" color={colors.muted} size={15} />
          </Pressable>)}
        </View>)}
    </>;
  }

  return <Section title="Vencimentos">
    {upcoming.loadIssue ? <>
      <Copy muted>Não foi possível consultar os vencimentos.</Copy>
      <View style={wrap}><Button label="Tentar novamente" onPress={upcoming.retry} /></View>
    </> : upcoming.bills === undefined ? <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando vencimentos" />
      : overdue.length || next.length ? renderGroups(false)
      : <Copy muted>Você não tem gastos pendentes com vencimento nos próximos 7 dias ou em atraso.</Copy>}
    {!upcoming.loadIssue && overflow && <View style={wrap}>
      <Button label="Ver todos os vencimentos" variant="plain" onPress={() => setShowAll(true)} />
    </View>}
    {billRemindersAvailable && <View style={[styles.group, styles.item, { borderColor: colors.line }]}>
      <Copy muted>Aviso no aparelho na manhã anterior ao vencimento.</Copy>
      {!!upcoming.reminderIssue && <Copy style={{ color: colors.danger }}>{upcoming.reminderIssue}</Copy>}
      <View style={wrap}>
        <Button label={upcoming.reminders ? 'Desativar lembretes' : 'Ativar lembretes'}
          icon={upcoming.reminders ? 'notifications-off-outline' : 'notifications-outline'}
          disabled={upcoming.reminders === undefined || upcoming.changingReminders} onPress={upcoming.toggleReminders} />
      </View>
    </View>}
    {showAll && <Dialog title="Vencimentos" onClose={() => setShowAll(false)}>{renderGroups(true)}</Dialog>}
  </Section>;
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  strong: { fontWeight: '800' },
  item: { borderTopWidth: 1, paddingTop: 7, minHeight: 44 },
  description: { flex: 1, minWidth: 0 },
  amount: { fontWeight: '800', textAlign: 'right', flexShrink: 1 },
});
