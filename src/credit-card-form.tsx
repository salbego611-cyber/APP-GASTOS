import { useState } from 'react';
import { View } from 'react-native';
import type { CreditCard } from './credit';
import { deleteCreditCard, saveCreditCard } from './db';
import { amountText, parseMoney } from './domain';
import { useStore } from './store';
import { Button, Copy, Dialog, Field, wrap } from './ui';
import { useSubmit } from './use-submit';

export function CreditCardForm({ card, onClose, onSaved }: {
  card?: CreditCard;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { data, mutate } = useStore();
  const [name, setName] = useState(card?.name ?? '');
  const [closing, setClosing] = useState(card ? String(card.closingDay) : '');
  const [due, setDue] = useState(card ? String(card.dueDay) : '');
  const [limit, setLimit] = useState(card?.limitCents ? amountText(card.limitCents) : '');
  const [deleting, setDeleting] = useState(false);
  const { busy, feedback, setError, submit } = useSubmit();

  function close() {
    if (busy) return;
    if (deleting) {
      setDeleting(false);
      setError('');
    } else {
      onClose();
    }
  }

  function save() {
    const trimmed = name.trim();
    const closingDay = Number(closing.trim());
    const dueDay = Number(due.trim());
    if (!trimmed || trimmed.length > 35) return setError('Informe um nome de até 35 caracteres.');
    if (!/^\d{1,2}$/.test(closing.trim()) || !/^\d{1,2}$/.test(due.trim()) ||
      closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31 || closingDay === dueDay) {
      return setError('Escolha dias diferentes de fechamento e vencimento, entre 1 e 31.');
    }
    if (data?.cards.some(item => item.id !== card?.id &&
      item.name.toLocaleLowerCase('pt-BR') === trimmed.toLocaleLowerCase('pt-BR'))) {
      return setError('Já existe um cartão com esse nome.');
    }
    const limitCents = limit.trim() ? parseMoney(limit) : null;
    if (limit.trim() && !limitCents) return setError('Informe um limite maior que zero ou deixe o campo em branco.');

    void submit(() => mutate(
      db => saveCreditCard(db, { name: trimmed, closingDay, dueDay, limitCents }, card?.id),
      card ? 'Cartão atualizado.' : 'Cartão cadastrado.',
    ), () => {
      onSaved?.();
      onClose();
    });
  }

  if (deleting && card) return <Dialog title="Excluir cartão?" onClose={close}>
    <Copy>Você só pode excluir {card.name} se o cartão estiver sem compras vinculadas.</Copy>
    {feedback}
    <View style={wrap}>
      <Button label="Cancelar" onPress={close} disabled={busy} grow />
      <Button label="Excluir cartão" variant="danger" disabled={busy} grow onPress={() => {
        void submit(() => mutate(db => deleteCreditCard(db, card.id), 'Cartão excluído.'), onClose);
      }} />
    </View>
  </Dialog>;

  return <Dialog title={card ? 'Editar cartão' : 'Novo cartão'} onClose={close}>
    <Field label="Nome do cartão" value={name} onChangeText={setName} maxLength={35} />
    <Field label="Dia de fechamento" value={closing} onChangeText={setClosing} keyboardType="number-pad" maxLength={2} />
    <Field label="Dia de vencimento" value={due} onChangeText={setDue} keyboardType="number-pad" maxLength={2} />
    <Field label="Limite do cartão (R$, opcional)" value={limit} onChangeText={setLimit}
      keyboardType="decimal-pad" maxLength={17} placeholder="0,00" />
    <Copy muted>Use dias de 1 a 31. Em meses mais curtos, o aplicativo usa o último dia do mês.</Copy>
    {card && <Copy muted>As novas datas valem para compras futuras. As parcelas que você já cadastrou mantêm suas datas.</Copy>}
    {feedback}
    <Button label="Salvar cartão" icon="checkmark" variant="primary" onPress={save} disabled={busy} />
    {card && <Button label="Excluir cartão" icon="trash-outline" variant="danger" disabled={busy}
      onPress={() => { setError(''); setDeleting(true); }} />}
  </Dialog>;
}
