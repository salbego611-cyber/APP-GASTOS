import { useState } from 'react';
import { deleteCreditInvoicePayment, saveCreditInvoicePayment } from './db';
import { amountText, brDate, brl, parseDate, parseMoney } from './domain';
import { useStore } from './store';
import { Button, Copy, Dialog, Field } from './ui';
import { useSubmit } from './use-submit';

export function InvoicePaymentForm({ cardId, dueDate, remainingCents, onClose, onSaved }: {
  cardId: number;
  dueDate: string;
  remainingCents: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today, mutate } = useStore();
  const [amount, setAmount] = useState(() => amountText(remainingCents));
  const [date, setDate] = useState(() => brDate(today));
  const { busy, feedback, setError, submit } = useSubmit();
  const cents = parseMoney(amount);

  function save() {
    const paymentDate = parseDate(date.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
    if (!cents) return setError('Informe um valor maior que zero.');
    if (cents > remainingCents) return setError('O pagamento precisa ser de até ' + brl(remainingCents) + '.');
    if (!paymentDate) return setError('Informe uma data válida no formato DD/MM/AAAA.');
    if (paymentDate > today) return setError('Informe a data de hoje ou uma data anterior.');
    void submit(() => mutate(
      db => saveCreditInvoicePayment(db, { cardId, dueDate, paymentDate, cents }),
      'Pagamento registrado.',
      (db, payment) => deleteCreditInvoicePayment(db, payment.id),
    ), onSaved);
  }

  return <Dialog title="Registrar pagamento" onClose={() => { if (!busy) onClose(); }}>
    <Copy muted>Saldo em aberto de {brl(remainingCents)}. O pagamento entra no caixa pela data informada.</Copy>
    <Field label="Valor pago (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
      maxLength={17} selectTextOnFocus />
    <Field label="Data do pagamento (DD/MM/AAAA)" value={date} onChangeText={setDate}
      keyboardType="numbers-and-punctuation" maxLength={10} />
    {cents !== null && cents > 0 && cents < remainingCents &&
      <Copy muted>Saldo após este pagamento {brl(remainingCents - cents)}</Copy>}
    {feedback}
    <Button label="Salvar pagamento" variant="primary" icon="checkmark" disabled={busy} onPress={save} />
  </Dialog>;
}
