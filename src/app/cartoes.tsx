import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { undoInvoiceFinancing, type InvoiceFinancing } from '../card-financing';
import { creditDebit, type CreditCard, type CreditEntry } from '../credit';
import { CreditAdjustment, type CreditAdjustmentSelection } from '../credit-adjustment';
import { CreditCardForm } from '../credit-card-form';
import { deleteCreditInvoicePayment, setCreditInvoicePaid, type InvoiceBalance, type InvoicePayment } from '../db';
import { brDate, brl, type Entry } from '../domain';
import { Confirm } from '../forms';
import { InvoiceFinancingForm } from '../invoice-financing-form';
import { InvoicePaymentForm } from '../invoice-payment-form';
import { MonthPicker } from '../month-picker';
import { useStore } from '../store';
import { Button, Copy, Dialog, Empty, Page, Section, spread, wrap } from '../ui';
import { useSubmit } from '../use-submit';

type InvoiceGroup = {
  key: string;
  cardId: number;
  dueDate: string;
  entries: (Entry & { credit: CreditEntry })[];
};

type Invoice = InvoiceGroup & {
  closingDate: string;
  earlierClosing: boolean;
  total: number;
  paid: number;
  remaining: number;
  legacyPaid: number;
  payableEntries: InvoiceGroup['entries'];
};

function invoiceKey(cardId: number, dueDate: string) {
  return cardId + ':' + dueDate;
}

function invoicesFor(entries: Entry[], balances: InvoiceBalance[]) {
  const balancesByInvoice = new Map(balances.map(balance => [invoiceKey(balance.cardId, balance.dueDate), balance]));
  const invoices = new Map<string, InvoiceGroup>();
  for (const entry of entries) {
    const credit = entry.credit;
    if (!credit || entry.kind !== 'gasto') continue;
    const key = invoiceKey(credit.cardId, entry.date);
    const invoice = invoices.get(key) ?? { key, cardId: credit.cardId, dueDate: entry.date, entries: [] };
    invoice.entries.push({ ...entry, credit });
    invoices.set(key, invoice);
  }
  return [...invoices.values()].map((invoice): Invoice => {
    const payableEntries = invoice.entries.filter(entry => entry.credit.financing?.role !== 'original');
    const closingEntries = payableEntries.length ? payableEntries : invoice.entries;
    const closingDate = closingEntries.reduce((latest, entry) => entry.credit.closingDate > latest
      ? entry.credit.closingDate : latest, '');
    const balance = balancesByInvoice.get(invoice.key);
    const total = balance?.chargesCents ?? payableEntries.reduce((sum, entry) => sum + creditDebit(entry), 0);
    const legacyPaid = balance?.legacyPaidCents ?? payableEntries.reduce((sum, entry) => sum + (entry.confirmed ? creditDebit(entry) : 0), 0);
    const paid = legacyPaid + (balance?.paidCents ?? 0);
    return {
      ...invoice,
      payableEntries,
      closingDate,
      earlierClosing: closingEntries.some(entry => entry.credit.closingDate !== closingDate),
      total,
      paid,
      legacyPaid,
      remaining: balance?.remainingCents ?? total - paid,
    };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardId - b.cardId);
}

function isPaid(invoice: Invoice) {
  return invoice.total > 0 ? invoice.remaining <= 0
    : invoice.payableEntries.length > 0 && invoice.payableEntries.every(entry => entry.confirmed);
}

function statusOf(invoice: Invoice, today: string, plan?: InvoiceFinancing) {
  if (plan && invoice.remaining <= 0) return 'Parcelada';
  if (isPaid(invoice)) return 'Paga';
  if (invoice.remaining <= 0) return 'Sem pagamento pendente';
  if (invoice.dueDate < today) return 'Atrasada';
  if (invoice.paid > 0) return 'Parcialmente paga';
  return invoice.closingDate <= today ? 'Fechada' : 'Aberta';
}

function invoiceAmount(invoice: Invoice, plan?: InvoiceFinancing) {
  const total = !invoice.payableEntries.length && plan ? invoice.total + plan.principalCents : invoice.total;
  return total < 0 ? 'Crédito de ' + brl(-total) : brl(total);
}

export default function CreditCards() {
  const { data, today, colors } = useStore();
  const [config, setConfig] = useState<{ card?: CreditCard }>();
  const [selected, setSelected] = useState<string>();
  const invoices = invoicesFor(data?.entries ?? [], data?.invoiceBalances ?? []);
  const detail = invoices.find(invoice => invoice.key === selected);
  const cards = data?.cards ?? [];
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const committed = new Map(data?.committedCredit.map(item => [item.cardId, item.cents]));
  const plans = new Map(data?.invoiceFinancings.map(plan => [invoiceKey(plan.cardId, plan.dueDate), plan]));
  const detailCard = detail && cardsById.get(detail.cardId);

  return <Page title="Cartões de crédito" subtitle="Configure seus cartões e consulte as faturas por data de vencimento."
    action={<Button label="Voltar aos ajustes" icon="arrow-back-outline" onPress={() => router.navigate('/ajustes')} />}>
    {data ? <>
      <Section title="Meus cartões">
        {cards.length ? cards.map(card => <View key={card.id} style={[wrap, styles.divider, { borderColor: colors.line }]}>
          <View style={styles.rowText}>
            <Copy style={styles.emphasis}>{card.name}</Copy>
            <Copy muted>Fechamento dia {card.closingDay} · Vencimento dia {card.dueDay}</Copy>
            {card.limitCents && <Copy muted>
              Disponível estimado {brl(Math.max(0, card.limitCents - (committed.get(card.id) ?? 0)))} de {brl(card.limitCents)}
              {' · '}{brl(committed.get(card.id) ?? 0)} comprometidos
            </Copy>}
          </View>
          <Button label={'Editar ' + card.name} icon="create-outline" compact onPress={() => setConfig({ card })} />
        </View>) : <Empty title="Nenhum cartão cadastrado" icon="card-outline"
          detail="Cadastre um cartão para que as compras no crédito caiam na fatura certa." />}
        <View style={wrap}>
          <Button label="Novo cartão" icon="add" variant="primary" onPress={() => setConfig({})} />
        </View>
      </Section>
      {!!cards.length && <>
        <MonthPicker />
        <Section title="Faturas do período">
          {!invoices.length && <Empty title="Nenhuma fatura no período" icon="receipt-outline"
            detail="As faturas aparecem no período do vencimento quando você registra compras com um cartão cadastrado." />}
          {invoices.map(invoice => {
            const plan = plans.get(invoice.key);
            const status = statusOf(invoice, today, plan);
            const tone = status === 'Paga' ? colors.brand : status === 'Atrasada' ? colors.danger : colors.warning;
            return <View key={invoice.key} style={[styles.invoice, styles.divider, { borderColor: colors.line }]}>
              <View style={spread}>
                <Copy style={[styles.emphasis, styles.rowText]}>{cardsById.get(invoice.cardId)?.name ?? 'Cartão'}</Copy>
                <Copy style={styles.emphasis}>{invoiceAmount(invoice, plan)}</Copy>
              </View>
              <View style={[wrap, { justifyContent: 'space-between' }]}>
                <Copy muted>Vencimento em {brDate(invoice.dueDate)}</Copy>
                <Copy style={[styles.emphasis, { color: tone }]}>{status}</Copy>
              </View>
              {invoice.paid > 0 && invoice.remaining > 0 &&
                <Copy muted>{brl(invoice.paid)} pagos · {brl(invoice.remaining)} em aberto</Copy>}
              {plan && <Copy muted>Parcelamento de {plan.installments} × {brl(plan.installmentCents)}</Copy>}
              <View style={wrap}>
                <Button label="Ver fatura" icon="receipt-outline" onPress={() => setSelected(invoice.key)} />
              </View>
            </View>;
          })}
        </Section>
      </>}
    </> : <ActivityIndicator color={colors.brand} accessibilityLabel="Carregando cartões" />}
    {config && <CreditCardForm card={config.card} onClose={() => setConfig(undefined)} />}
    {detail && detailCard && data && <InvoiceDetails key={detail.key} invoice={detail} card={detailCard} plan={plans.get(detail.key)}
      payments={data.invoicePayments.filter(payment => payment.cardId === detail.cardId && payment.dueDate === detail.dueDate)}
      onClose={() => setSelected(undefined)} />}
  </Page>;
}

function InvoiceDetails({ invoice, card, plan, payments, onClose }: {
  invoice: Invoice; card: CreditCard; plan?: InvoiceFinancing; payments: InvoicePayment[]; onClose: () => void;
}) {
  const { data, today, colors, mutate } = useStore();
  const { busy, feedback, setError, submit } = useSubmit();
  const [screen, setScreen] = useState<'details' | 'payment' | 'legacy' | 'financing' | 'undo'>('details');
  const [adjustment, setAdjustment] = useState<CreditAdjustmentSelection>();
  const [reversing, setReversing] = useState<InvoicePayment>();
  const paid = isPaid(invoice);
  const pending = invoice.remaining;
  const hasLegacyConfirmation = invoice.payableEntries.some(entry => entry.confirmed);
  const legacyAction = hasLegacyConfirmation ? 'Reabrir fatura' : 'Confirmar fatura';
  const showLegacyAction = !payments.length && !plan && invoice.payableEntries.length > 0 &&
    (hasLegacyConfirmation || pending <= 0);
  const names = new Map(data?.categories.map(category => [category.id, category.name]));
  const canFinance = pending > 0 && !plan && !invoice.payableEntries.some(entry =>
    !entry.confirmed && entry.credit.financing?.role === 'installment');
  const installmentsOnly = invoice.payableEntries.length > 0 &&
    invoice.payableEntries.every(entry => entry.credit.financing?.role === 'installment');

  function close() {
    if (busy) return;
    if (screen !== 'details') {
      setScreen('details');
      setError('');
    } else {
      onClose();
    }
  }

  if (adjustment) return <CreditAdjustment selection={adjustment} card={card} onClose={() => setAdjustment(undefined)} />;
  if (reversing) return <Confirm title="Desfazer pagamento?"
    message={brl(reversing.cents) + ' de ' + brDate(reversing.paymentDate) + ' voltará ao saldo em aberto.'}
    label="Desfazer pagamento" onClose={() => setReversing(undefined)}
    action={() => mutate(db => deleteCreditInvoicePayment(db, reversing.id), 'Pagamento desfeito.')} />;
  if (screen === 'payment' && pending > 0) return <InvoicePaymentForm
    cardId={invoice.cardId} dueDate={invoice.dueDate} remainingCents={pending} onClose={close} onSaved={onClose} />;
  if (screen === 'financing') return <InvoiceFinancingForm cardId={invoice.cardId} dueDate={invoice.dueDate}
    principalCents={pending} onClose={() => setScreen('details')} />;

  if (screen === 'undo' && plan) return <Dialog title="Desfazer parcelamento?" onClose={close}>
    <Copy>As parcelas registradas serão removidas e o saldo original voltará a ficar pendente.</Copy>
    <Copy muted>Desfaça os pagamentos das parcelas antes de continuar. Para baixas antigas, reabra as faturas correspondentes.</Copy>
    {feedback}
    <View style={wrap}>
      <Button label="Voltar" onPress={close} disabled={busy} grow />
      <Button label="Confirmar desfazimento" variant="danger" disabled={busy} grow onPress={() => {
        void submit(() => mutate(db => undoInvoiceFinancing(db, plan.id), 'Parcelamento desfeito.'),
          () => setScreen('details'));
      }} />
    </View>
  </Dialog>;

  if (screen === 'legacy') return <Dialog title={legacyAction + '?'} onClose={close}>
    <Copy>{hasLegacyConfirmation
      ? 'Os lançamentos com baixa antiga voltarão a ficar pendentes.'
      : 'Os ajustes desta fatura serão marcados como conferidos.'}</Copy>
    {feedback}
    <View style={wrap}>
      <Button label="Cancelar" onPress={close} disabled={busy} grow />
      <Button label={legacyAction} variant="primary" disabled={busy} grow onPress={() => {
        void submit(() => mutate(
          db => setCreditInvoicePaid(db, invoice.cardId, invoice.dueDate, !hasLegacyConfirmation),
          hasLegacyConfirmation ? 'Fatura reaberta.' : 'Fatura confirmada.',
        ), onClose);
      }} />
    </View>
  </Dialog>;

  return <Dialog title={'Fatura de ' + card.name} onClose={close}>
    <View style={[wrap, { justifyContent: 'space-between' }]}>
      <Copy style={styles.emphasis}>{invoiceAmount(invoice, plan)}</Copy>
      <Copy>{statusOf(invoice, today, plan)}</Copy>
    </View>
    <Copy muted>{!installmentsOnly && ((invoice.earlierClosing ? 'Último fechamento em ' : 'Fechamento em ') +
      brDate(invoice.closingDate) + ' · ')}Vencimento em {brDate(invoice.dueDate)}</Copy>
    <View style={[wrap, { justifyContent: 'space-between' }]}>
      <Copy muted>Pago {brl(invoice.paid)}</Copy>
      <Copy muted>{pending < 0 ? 'Crédito de ' + brl(-pending) : 'Em aberto ' + brl(pending)}</Copy>
    </View>
    <View style={wrap}>
      {pending > 0 && <Button label="Registrar pagamento" icon="checkmark" variant="primary" onPress={() => setScreen('payment')} grow />}
      {showLegacyAction && <Button label={legacyAction} onPress={() => setScreen('legacy')} grow />}
      {canFinance && <Button label="Parcelar fatura" icon="calendar-outline" onPress={() => setScreen('financing')} grow />}
    </View>
    {plan && <View style={[styles.plan, { backgroundColor: colors.soft }]}>
      <Copy style={styles.emphasis}>Parcelamento registrado</Copy>
      <Copy style={styles.planAmount}>{plan.installments} × {brl(plan.installmentCents)}</Copy>
      <Copy muted>Primeiro vencimento em {brDate(plan.firstDueDate)}</Copy>
      <Copy muted>Total de {brl(plan.installments * plan.installmentCents)} sobre o saldo original de {brl(plan.principalCents)}</Copy>
      <View style={wrap}><Button label="Desfazer parcelamento" variant="plain" onPress={() => setScreen('undo')} /></View>
    </View>}
    <View style={[styles.invoice, styles.divider, { borderColor: colors.line }]}>
      <Copy style={styles.emphasis}>Pagamentos da fatura</Copy>
      {invoice.legacyPaid > 0 && <Copy muted>Baixas antigas sem data de pagamento · {brl(invoice.legacyPaid)}</Copy>}
      {!payments.length && invoice.legacyPaid <= 0 && <Copy muted>Nenhum pagamento registrado.</Copy>}
      {payments.map(payment => <View key={payment.id} style={spread}>
        <View style={styles.rowText}>
          <Copy style={styles.emphasis}>{brl(payment.cents)}</Copy>
          <Copy muted>{brDate(payment.paymentDate)}{payment.financingPlanId !== null ? ' · Vinculado ao parcelamento' : ''}</Copy>
        </View>
        {payment.financingPlanId === null && <Button label={'Desfazer pagamento de ' + brl(payment.cents) + ' em ' + brDate(payment.paymentDate)}
          variant="plain" icon="arrow-undo-outline" compact onPress={() => setReversing(payment)} />}
      </View>)}
    </View>
    <Copy style={styles.emphasis}>Compras e ajustes da fatura</Copy>
    {invoice.entries.map(entry => {
      const { credit } = entry;
      const archived = credit.financing?.role === 'original';
      const installment = credit.financing?.role === 'installment';
      return <View key={entry.id} style={[styles.invoice, styles.divider, { borderColor: colors.line }]}>
        <View style={spread}>
          <View style={styles.rowText}>
            <Copy style={styles.emphasis}>{installment ? 'Parcelamento da fatura' : entry.note || names.get(entry.categoryId) || 'Compra'}</Copy>
            <Copy muted>{credit.refundOf ? 'Crédito em ' + brDate(credit.purchaseDate) :
              'Parcela ' + credit.installmentNumber + '/' + credit.installmentTotal +
              (installment ? ' · Fatura de ' : ' · Compra em ') + brDate(credit.purchaseDate)}</Copy>
            <Copy muted>{archived ? 'Fatura parcelada' : entry.confirmed || paid
              ? credit.refundOf ? 'Conferido' : 'Paga' : invoice.paid > 0 ? 'Na fatura' : 'Pendente'}</Copy>
          </View>
          <Copy muted={archived} style={styles.emphasis}>{brl(credit.refundOf ? -entry.cents : entry.cents)}</Copy>
        </View>
        {!credit.refundOf && !credit.financing && <View style={wrap}>
          <Button label="Registrar estorno" variant="plain" onPress={() => setAdjustment({ entry, action: 'refund' })} />
          {credit.installmentTotal > 1 && <Button label="Cancelar parcelas futuras" variant="plain"
            onPress={() => setAdjustment({ entry, action: 'cancel' })} />}
        </View>}
      </View>;
    })}
  </Dialog>;
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, paddingTop: 12 },
  emphasis: { fontWeight: '800' },
  invoice: { gap: 5 },
  plan: { gap: 4, padding: 12, borderRadius: 12 },
  planAmount: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  rowText: { flex: 1, minWidth: 0 },
});
