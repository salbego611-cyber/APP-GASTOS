import { useState } from 'react';
import { View } from 'react-native';
import { saveInvoiceFinancing } from './card-financing';
import { maxCreditInstallments } from './credit';
import { brDate, brl, monthlyDate, parseDate, parseMoney } from './domain';
import { useStore } from './store';
import { Button, Card, Copy, Dialog, Field, wrap } from './ui';
import { useSubmit } from './use-submit';

export function InvoiceFinancingForm({ cardId, dueDate, principalCents, onClose }: {
  cardId: number; dueDate: string; principalCents: number; onClose: () => void;
}) {
  const { mutate } = useStore();
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(brDate(dueDate));
  const { busy, feedback, setError, submit } = useSubmit();
  const installments = /^\d{1,2}$/.test(quantity.trim()) ? Number(quantity.trim()) : 0;
  const validCount = installments >= 2 && installments <= maxCreditInstallments;
  const installmentCents = parseMoney(amount);
  const firstDueDate = parseDate(date.trim().replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
  const total = validCount && installmentCents ? installments * installmentCents : null;
  const difference = total === null ? 0 : total - principalCents;
  const lastDueDate = firstDueDate && validCount ? monthlyDate(firstDueDate, installments - 1) : null;
  const validDueDates = firstDueDate && firstDueDate >= dueDate && lastDueDate && parseDate(brDate(lastDueDate)) === lastDueDate;

  function save() {
    if (!validCount) return setError('Informe de 2 a ' + maxCreditInstallments + ' parcelas.');
    if (!installmentCents) return setError('Informe o valor de cada parcela.');
    if (!firstDueDate) return setError('Informe uma data válida no formato DD/MM/AAAA.');
    if (firstDueDate < dueDate) return setError('A primeira parcela deve vencer em ' + brDate(dueDate) + ' ou depois.');
    if (!validDueDates) return setError('Confira a data da última parcela.');

    void submit(() => mutate(db => saveInvoiceFinancing(db, {
      cardId, dueDate, firstDueDate, installments, installmentCents,
    }), 'Parcelamento da fatura registrado.'), onClose);
  }

  return <Dialog title="Parcelar fatura" onClose={() => { if (!busy) onClose(); }}>
    <Copy muted>Registre as condições acordadas com a operadora. No planejamento, as parcelas assumem o lugar do saldo em aberto.</Copy>
    <View style={{ gap: 3 }}>
      <Copy muted>Saldo em aberto</Copy>
      <Copy style={{ fontSize: 20, lineHeight: 26, fontWeight: '800' }}>{brl(principalCents)}</Copy>
    </View>
    <Field label="Número de parcelas" value={quantity} onChangeText={setQuantity} maxLength={2}
      keyboardType="number-pad" placeholder="Ex. 3" editable={!busy} />
    <Field label="Valor de cada parcela (R$)" value={amount} onChangeText={setAmount} maxLength={17}
      keyboardType="decimal-pad" placeholder="0,00" editable={!busy} />
    <Field label="Primeiro vencimento (DD/MM/AAAA)" value={date} onChangeText={setDate} maxLength={10}
      keyboardType="numbers-and-punctuation" editable={!busy} />
    {total !== null && installmentCents !== null && <Card>
      <View style={[wrap, { justifyContent: 'space-between' }]}>
        <Copy style={{ fontWeight: '800' }}>{installments} × {brl(installmentCents)}</Copy>
        <Copy style={{ fontWeight: '800' }}>Total de {brl(total)}</Copy>
      </View>
      <Copy muted>{difference > 0 ? brl(difference) + ' a mais que o saldo em aberto'
        : difference < 0 ? brl(-difference) + ' a menos que o saldo em aberto' : 'Mesmo total do saldo em aberto'}</Copy>
      {validDueDates && lastDueDate && <Copy muted>Último vencimento em {brDate(lastDueDate)}</Copy>}
    </Card>}
    {feedback}
    <Button label="Salvar parcelamento" icon="checkmark" variant="primary" onPress={save} disabled={busy} />
  </Dialog>;
}
