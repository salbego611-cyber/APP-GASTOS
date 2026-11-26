import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { creditSchedule, maxCreditInstallments } from './credit';
import { CreditCardForm } from './credit-card-form';
import { amountText, brDate, brl, isFutureIncome, monthlyDate, parseDate, parseMoney, payments, type Confirmation, type Entry, type Kind } from './domain';
import { saveCreditPurchase, saveEntry, updateCreditInstallment } from './db';
import { deleteEntryWithUndo, restoreDeletedEntry } from './entry-undo';
import type { Favorite } from './favorites';
import { invoiceEntryStatus } from './invoice-status';
import { useStore } from './store';
import { Button, Choices, Copy, Dialog, Field, FutureIncomeBadge, wrap } from './ui';
import { useSubmit } from './use-submit';

export { useSubmit } from './use-submit';

export function Confirm({ title, message, label, onClose, action, children }: {
  title: string; message: string; label: string; onClose: () => void;
  action: () => Promise<unknown>; children?: ReactNode;
}) {
  const { busy, submit, feedback } = useSubmit();
  const close = () => { if (!busy) onClose(); };
  return <Dialog title={title} onClose={close}>
    <Copy>{message}</Copy>
    {children}
    {feedback}
    <View style={wrap}>
      <Button label="Cancelar" onPress={close} disabled={busy} grow />
      <Button label={label} variant="danger" onPress={() => void submit(action, onClose)} disabled={busy} grow />
    </View>
  </Dialog>;
}

const kinds: { key: Kind; label: string }[] = [{ key: 'gasto', label: 'Gasto' }, { key: 'entrada', label: 'Entrada' }];

export function EntryForm({ entry, favorite, initialKind = 'gasto', onClose }: {
  entry?: Entry; favorite?: Favorite; initialKind?: Kind; onClose: () => void;
}) {
  const { data, month, current, today, start, mutate } = useStore();
  const [kind, setKind] = useState(entry?.kind ?? (favorite ? 'gasto' : initialKind));
  const [amount, setAmount] = useState(entry ? amountText(entry.cents) : '');
  const [date, setDate] = useState(brDate(entry?.date ?? (month === current ? today : start)));
  const [category, setCategory] = useState(entry?.categoryId ?? favorite?.categoryId ?? 0);
  const [note, setNote] = useState(entry?.note ?? favorite?.note ?? '');
  const [payment, setPayment] = useState(entry?.payment ?? favorite?.payment ?? '');
  const [cardId, setCardId] = useState(0);
  const [installments, setInstallments] = useState('1');
  const [addingCard, setAddingCard] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ id: number; name: string; kind: Kind }>();
  const [status, setStatus] = useState(entry?.confirmed);
  const [frequency, setFrequency] = useState<'once' | 'monthly'>('once');
  const [occurrences, setOccurrences] = useState('12');
  const [deleting, setDeleting] = useState<'entry' | 'series'>();
  const state = useSubmit();
  const categories = (data?.categories ?? []).filter(item => item.kind === kind || item.kind === 'ambos');
  if (created?.kind === kind && !categories.some(item => item.id === created.id)) categories.push(created);
  const selected = categories.some(item => item.id === category) ? category : 0;
  const close = () => { if (!state.busy) onClose(); };

  const iso = parseDate(date.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
  const cents = parseMoney(amount);
  const confirmed = status ?? (iso && iso > today ? 0 : 1);
  const credit = entry?.credit;
  const creditStatus = entry && credit ? invoiceEntryStatus(entry, data?.invoiceBalances) : '';
  const refund = credit?.refundOf !== undefined;
  const creditPurchase = !entry && kind === 'gasto' && payment === 'Crédito';
  const cards = data?.cards ?? [];
  const card = cards.find(item => item.id === (credit?.cardId ?? cardId))
    ?? (creditPurchase && cards.length === 1 ? cards[0] : undefined);
  const installmentCount = /^\d{1,2}$/.test(installments.trim()) ? Number(installments.trim()) : 0;
  const validInstallments = installmentCount >= 1 && installmentCount <= maxCreditInstallments;
  const repeating = !entry && !creditPurchase && frequency === 'monthly';
  let schedule: ReturnType<typeof creditSchedule> = [];
  if (creditPurchase && card && iso && cents && validInstallments) {
    try {
      schedule = creditSchedule(card, iso, cents, installmentCount);
    } catch {
      // Show an explanation on save when the entered values can't produce a schedule.
    }
  }
  const firstInstallment = schedule[0];
  const lastInstallment = schedule[schedule.length - 1];

  function save() {
    if (!cents) return state.setError('Informe um valor maior que zero, por exemplo 12,50.');
    if (!selected) return state.setError('Selecione uma categoria.');
    if (credit && entry) {
      void state.submit(() => mutate(db => updateCreditInstallment(db, entry.id, {
        cents, categoryId: selected, note: note.trim(),
      }), 'Parcela atualizada.'), onClose);
      return;
    }
    if (!iso) return state.setError('Informe uma data válida no formato DD/MM/AAAA.');
    if (creditPurchase) {
      if (!card) return state.setError('Selecione um cartão para registrar a compra.');
      if (!validInstallments) return state.setError('Informe de 1 a ' + maxCreditInstallments + ' parcelas.');
      if (cents < installmentCount) return state.setError('Cada parcela precisa ter pelo menos R$ 0,01.');
      if (!firstInstallment) return state.setError('Revise os dados para calcular o vencimento da fatura.');
      void state.submit(() => mutate(db => saveCreditPurchase(db, {
        cardId: card.id, purchaseDate: iso, categoryId: selected, cents, note: note.trim(), installments: installmentCount,
      }), 'Compra registrada no cartão.'), onClose);
      return;
    }
    const count = repeating ? Number(occurrences.trim()) : 1;
    if (repeating && (!/^\d{1,2}$/.test(occurrences.trim()) || count < 2 || count > 60)) {
      return state.setError('Escolha de 2 a 60 lançamentos.');
    }
    if (repeating && monthlyDate(iso, count - 1).length !== 10) {
      return state.setError('A última repetição precisa ter uma data válida.');
    }
    void state.submit(() => mutate(db => saveEntry(db, {
      kind, cents, categoryId: selected, date: iso, note: note.trim(), payment, confirmed,
    }, entry?.id, count),
    repeating ? count + ' lançamentos mensais salvos.' : entry ? 'Lançamento atualizado.' : 'Lançamento salvo.'), onClose);
  }

  function saveCategory() {
    const trimmed = name.trim();
    if (!trimmed) return state.setError('Informe o nome da categoria.');
    const existing = categories.find(item => item.name.toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'));
    if (existing) return state.setError('Já existe uma categoria com esse nome.');
    void state.submit(async () => {
      await mutate(async db => {
        const result = await db.runAsync('INSERT INTO categories (name,kind) VALUES (?,?)', trimmed, kind);
        setCreated({ id: result.lastInsertRowId, name: trimmed, kind });
        setCategory(result.lastInsertRowId);
      }, 'Categoria criada.');
    }, () => { setName(''); setNewCategory(false); });
  }

  if (deleting === 'series' && entry?.seriesId != null) return <Confirm title="Cancelar próximas repetições?"
    message="Esta ação exclui as cópias pendentes da série com data posterior a hoje e à deste lançamento."
    label="Cancelar próximas repetições" onClose={() => setDeleting(undefined)} action={async () => {
      await mutate(db => db.runAsync('DELETE FROM entries WHERE seriesId=? AND confirmed=0 AND date>? AND date>?',
        entry.seriesId, today, entry.date), 'Repetições futuras pendentes canceladas.');
      onClose();
    }} />;

  if (deleting === 'entry' && entry) return <Confirm title={refund ? 'Excluir estorno?' : 'Excluir lançamento?'}
    message={refund ? 'O crédito será removido do histórico e da fatura.' : credit
      ? 'Esta parcela será removida do histórico e da fatura.' : 'O valor será removido do histórico e dos totais do período.'}
    label={refund ? 'Excluir estorno' : 'Excluir lançamento'}
    onClose={() => setDeleting(undefined)} action={async () => {
      await mutate(db => deleteEntryWithUndo(db, entry.id), 'Lançamento excluído.', restoreDeletedEntry);
      onClose();
    }} />;

  if (entry && credit?.financing) return <Dialog
    title={credit.financing.role === 'original' ? 'Lançamento da fatura parcelada' : 'Parcela da fatura'} onClose={close}>
    <Copy style={{ fontWeight: '800' }}>{card?.name ?? 'Crédito'} · {brl(entry.cents)}</Copy>
    <Copy muted>Vencimento em {brDate(entry.date)}</Copy>
    <Copy>{credit.financing.role === 'original'
      ? 'O gasto fica no histórico. As parcelas do acordo aparecem nos períodos dos vencimentos.'
      : 'Registre o pagamento nas faturas em Cartões de crédito.'}</Copy>
    {!!entry.note && <Copy>{entry.note}</Copy>}
  </Dialog>;

  if (refund && entry && credit) return <Dialog title="Estorno" onClose={close}>
    <Copy style={{ fontWeight: '800' }}>{card?.name ?? 'Crédito'} · {brl(entry.cents)}</Copy>
    <Copy muted>Registrado em {brDate(credit.purchaseDate)}</Copy>
    <Copy muted>Vencimento em {brDate(entry.date)} · {creditStatus}</Copy>
    {!!entry.note && <Copy>{entry.note}</Copy>}
    <Button label="Excluir estorno" variant="danger" icon="trash-outline" onPress={() => setDeleting('entry')} />
  </Dialog>;

  if (addingCard) return <CreditCardForm onClose={() => setAddingCard(false)} />;

  return <Dialog title={credit ? 'Editar parcela' : entry ? 'Editar lançamento' : 'Novo lançamento'} onClose={close}>
    {credit && entry ? <View style={{ gap: 4 }}>
      <Copy style={{ fontWeight: '800' }}>{card?.name ?? 'Crédito'} · Parcela {credit.installmentNumber} de {credit.installmentTotal}</Copy>
      <Copy muted>Compra em {brDate(credit.purchaseDate)} · Fechamento em {brDate(credit.closingDate)}</Copy>
      <Copy muted>Vencimento em {brDate(entry.date)} · {creditStatus}</Copy>
    </View> : <>
      <Choices items={kinds} value={kind} onChange={value => { setKind(value); setCategory(0); setNewCategory(false); }} />
      <View style={{ gap: 6 }}>
        <Copy style={{ fontWeight: '700' }}>Pagamento (opcional)</Copy>
        <Choices items={[{ key: '', label: 'Sem forma' }, ...payments.map(key => ({ key, label: key }))]}
          value={payment} onChange={value => { setPayment(value); state.setError(''); }} />
      </View>
    </>}
    {creditPurchase && <View style={{ gap: 6 }}>
      <Copy style={{ fontWeight: '700' }}>Cartão</Copy>
      {cards.length ? <Choices items={cards.map(item => ({ key: item.id, label: item.name }))}
        value={card?.id ?? 0} onChange={setCardId} /> : <>
        <Copy muted>Cadastre um cartão com as datas de fechamento e vencimento para registrar a compra.</Copy>
        <Button label="Cadastrar cartão" icon="add" onPress={() => { state.setError(''); setAddingCard(true); }} />
      </>}
    </View>}
    <Field label={credit ? 'Valor da parcela (R$)' : creditPurchase ? 'Valor total (R$)' : 'Valor (R$)'}
      value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" maxLength={17}
      autoFocus={!entry && !!favorite && (!creditPurchase || !!card)} />
    <View style={{ gap: 8 }}>
      <Copy style={{ fontWeight: '700' }}>Categoria</Copy>
      <Choices items={categories.map(item => ({ key: item.id, label: item.name }))} value={selected} onChange={setCategory} />
      {newCategory ? <>
        <Field label="Nome da categoria" value={name} onChangeText={setName} maxLength={35} autoFocus />
        <View style={wrap}>
          <Button label="Cancelar categoria" onPress={() => { setNewCategory(false); state.setError(''); }} disabled={state.busy} />
          <Button label="Salvar categoria" onPress={saveCategory} disabled={state.busy} />
        </View>
      </> : <View style={wrap}><Button label="Nova categoria" icon="add" onPress={() => setNewCategory(true)} /></View>}
    </View>
    {!credit && <Field label={creditPurchase ? 'Data da compra (DD/MM/AAAA)' : 'Data (DD/MM/AAAA)'}
      value={date} onChangeText={setDate} maxLength={10}
      onBlur={() => { if (/^\d{8}$/.test(date)) setDate(date.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3')); }}
      keyboardType="numbers-and-punctuation" />}
    {creditPurchase && <>
      <Field label="Quantidade de parcelas" value={installments} onChangeText={setInstallments}
        keyboardType="number-pad" maxLength={2} />
      {firstInstallment && <View style={{ gap: 4 }}>
        <Copy style={{ fontWeight: '700' }}>Vencimentos previstos</Copy>
        <Copy muted>{installmentCount === 1 ? 'Parcela única' : 'Primeira parcela'} · {brDate(firstInstallment.dueDate)} · {brl(firstInstallment.cents)}</Copy>
        {installmentCount > 1 && <Copy muted>Última parcela · {brDate(lastInstallment.dueDate)} · {brl(lastInstallment.cents)}</Copy>}
      </View>}
    </>}
    {!credit && !creditPurchase && <>
      {confirmed === 0 && isFutureIncome(kind, iso, today) && <FutureIncomeBadge />}
      <View style={{ gap: 6 }}>
        <Copy style={{ fontWeight: '700' }}>Situação</Copy>
        <Choices<Confirmation> items={[{ key: 0, label: 'Pendente' }, { key: 1, label: kind === 'entrada' ? 'Recebido' : 'Pago' }]}
          value={confirmed} onChange={setStatus} />
      </View>
    </>}
    <Field label="Descrição (opcional)" value={note} onChangeText={setNote} maxLength={120} placeholder="Ex.: Compra da semana" />
    {!entry && !creditPurchase && <View style={{ gap: 8 }}>
      <Copy style={{ fontWeight: '700' }}>Frequência</Copy>
      <Choices items={[{ key: 'once', label: 'Uma vez' }, { key: 'monthly', label: 'Repetir mensalmente' }]}
        value={frequency} onChange={setFrequency} />
      {repeating && <>
        <Field label="Quantidade de lançamentos" value={occurrences} onChangeText={setOccurrences}
          keyboardType="number-pad" maxLength={2} />
        <Copy muted>Inclui este lançamento. As próximas repetições ficam pendentes.</Copy>
      </>}
    </View>}
    {state.feedback}
    <Button label={creditPurchase ? 'Salvar compra' : credit ? 'Salvar parcela' : 'Salvar lançamento'}
      variant="primary" icon="checkmark" onPress={save} disabled={state.busy || newCategory || (creditPurchase && !cards.length)} />
    {entry?.seriesId != null && <Button label="Cancelar próximas repetições" icon="repeat-outline"
      onPress={() => setDeleting('series')} disabled={state.busy} />}
    {entry && <Button label="Excluir lançamento" variant="danger" icon="trash-outline"
      onPress={() => setDeleting('entry')} disabled={state.busy} />}
  </Dialog>;
}

export function BudgetForm({ onClose }: { onClose: () => void }) {
  const { data, month, mutate } = useStore();
  const [category, setCategory] = useState(0);
  const saved = data?.budgets.find(item => item.categoryId === category);
  const general = data?.budgets.find(item => item.categoryId === 0);
  const [amount, setAmount] = useState(general
    ? amountText(general.cents) : '');
  const state = useSubmit();
  const categories = (data?.categories ?? []).filter(item => item.kind !== 'entrada');
  const close = () => { if (!state.busy) onClose(); };

  function save() {
    const cents = parseMoney(amount);
    if (!cents) return state.setError('Informe um limite maior que zero.');
    void state.submit(() => mutate(db => db.runAsync(
      'INSERT INTO budgets (month,categoryId,cents) VALUES (?,?,?) ON CONFLICT(month,categoryId) DO UPDATE SET cents=excluded.cents',
      month, category, cents), 'Orçamento salvo.'), onClose);
  }

  return <Dialog title="Editar orçamento" onClose={close}>
    <Copy muted>Defina um limite para o período ou para uma categoria de gasto.</Copy>
    <Choices items={[{ key: 0, label: 'Limite geral' }, ...categories.map(item => ({ key: item.id, label: item.name }))]}
      value={category} onChange={id => {
        setCategory(id);
        const budget = data?.budgets.find(item => item.categoryId === id);
        setAmount(budget ? amountText(budget.cents) : '');
        state.setError('');
      }} />
    <Field label="Limite (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
    {state.feedback}
    <Button label="Salvar orçamento" variant="primary" onPress={save} disabled={state.busy} />
    {!!saved && <Button label="Remover limite" variant="danger" disabled={state.busy} onPress={() => {
      void state.submit(() => mutate(db => db.runAsync('DELETE FROM budgets WHERE month=? AND categoryId=?',
        month, category), 'Limite removido.'), onClose);
    }} />}
  </Dialog>;
}
