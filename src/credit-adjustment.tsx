import { useState } from 'react';
import { View } from 'react-native';
import { creditSchedule, type CreditCard, type CreditEntry } from './credit';
import { cancelFutureCreditInstallments, saveCreditRefund } from './db';
import { brDate, parseDate, parseMoney, type Entry } from './domain';
import { useStore } from './store';
import { Button, Copy, Dialog, Field, wrap } from './ui';
import { useSubmit } from './use-submit';

export type CreditAdjustmentSelection = { entry: Entry & { credit: CreditEntry }; action: 'refund' | 'cancel' };

export function CreditAdjustment({ selection, card, onClose }: {
  selection: CreditAdjustmentSelection; card: CreditCard; onClose: () => void;
}) {
  const { today, mutate } = useStore();
  const { entry, action } = selection;
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(brDate(today));
  const { busy, feedback, setError, submit } = useSubmit();
  const close = () => { if (!busy) onClose(); };

  if (action === 'cancel') return <Dialog title="Cancelar parcelas futuras?" onClose={close}>
    <Copy>Serão canceladas as parcelas em aberto cujo fechamento ainda vai ocorrer. Parcelas pagas ou com estorno registrado ficam no histórico.</Copy>
    {feedback}
    <View style={wrap}>
      <Button label="Voltar" onPress={close} disabled={busy} />
      <Button label="Confirmar cancelamento" variant="danger" disabled={busy} onPress={() => {
        void submit(() => mutate(db => cancelFutureCreditInstallments(db, entry.id), 'Parcelas futuras canceladas.'), onClose);
      }} />
    </View>
  </Dialog>;

  const iso = parseDate(date.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
  const cents = parseMoney(amount);
  const validDate = iso && iso >= entry.credit.purchaseDate && iso <= today ? iso : null;
  const due = validDate ? creditSchedule(card, validDate, 1, 1)[0].dueDate : null;

  return <Dialog title="Registrar estorno" onClose={close}>
    <Copy muted>Informe a data em que a operadora lançou o crédito. O aplicativo desconta o valor da fatura correspondente.</Copy>
    <Field label="Valor do estorno (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" maxLength={17} />
    <Field label="Data do estorno (DD/MM/AAAA)" value={date} onChangeText={setDate}
      keyboardType="numbers-and-punctuation" maxLength={10} />
    {due && <Copy>Fatura com vencimento em {brDate(due)}</Copy>}
    {feedback}
    <Button label="Salvar estorno" icon="checkmark" variant="primary" disabled={busy} onPress={() => {
      if (!cents) return setError('Informe um valor maior que zero.');
      if (!validDate) return setError('Informe uma data válida entre a compra e hoje.');
      void submit(() => mutate(db => saveCreditRefund(db, entry.id, validDate, cents), 'Estorno registrado.'), onClose);
    }} />
  </Dialog>;
}
