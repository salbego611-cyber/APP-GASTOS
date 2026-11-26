import type { InvoiceBalance } from './card-financing';
import type { Entry } from './domain';

export function invoiceEntryStatus(entry: Entry, balances: InvoiceBalance[] = []) {
  const credit = entry.credit;
  if (!credit) return entry.confirmed ? (entry.kind === 'entrada' ? 'Recebido' : 'Pago') : 'Pendente';
  if (credit.financing?.role === 'original') return 'Fatura parcelada';
  const invoice = balances.find(item => item.cardId === credit.cardId && item.dueDate === entry.date);
  if (entry.confirmed || (invoice && invoice.remainingCents <= 0)) return credit.refundOf ? 'Conferido' : 'Fatura paga';
  return invoice && (invoice.paidCents > invoice.financedPaidCents || invoice.legacyPaidCents > 0)
    ? 'Fatura parcialmente paga' : 'Pendente';
}
