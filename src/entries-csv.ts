import { creditDebit, type CreditCard } from './credit';
import type { InvoiceBalance } from './card-financing';
import { amountText, brDate, isFutureIncome, type Category, type Entry } from './domain';
import { invoiceEntryStatus } from './invoice-status';

function cell(text: string) {
  return '"' + text.replaceAll('"', '""') + '"';
}

function textCell(text: string) {
  const first = text.trimStart()[0];
  const formula = /^[\t\r\n]/.test(text) || (first && '=+-@＝＋－＠'.includes(first));
  return cell(formula ? "'" + text : text);
}

export function entriesCsv(entries: Entry[], categories: Category[], cards: CreditCard[], today: string, balances?: InvoiceBalance[]) {
  const categoryNames = new Map(categories.map(item => [item.id, item.name]));
  const cardNames = new Map(cards.map(item => [item.id, item.name]));
  const lines = ['Data;Tipo;Categoria;Pagamento;Situação;Valor (R$);Descrição;Cartão;Parcela;Data da operação no cartão'];
  for (const entry of entries) {
    const { credit } = entry;
    const income = entry.kind === 'entrada';
    const refund = credit?.refundOf !== undefined;
    const financing = credit?.financing?.role;
    const kind = refund ? 'Estorno' : income ? 'Entrada' : 'Gasto';
    const type = financing === 'installment' ? 'Parcela de fatura' : financing === 'original' ? kind + ' original da fatura' : kind;
    const status = financing === 'original' ? 'Transferido para parcelamento'
      : !entry.confirmed && isFutureIncome(entry.kind, entry.date, today) ? 'Entrada futura' : invoiceEntryStatus(entry, balances);
    lines.push([
      cell(brDate(entry.date)),
      cell(type),
      textCell(categoryNames.get(entry.categoryId) ?? ''),
      textCell(entry.payment),
      cell(status),
      amountText(income ? entry.cents : -creditDebit(entry)),
      textCell(entry.note),
      textCell(credit ? cardNames.get(credit.cardId) ?? '' : ''),
      cell(credit && !refund ? credit.installmentNumber + ' de ' + credit.installmentTotal : ''),
      cell(credit ? brDate(credit.purchaseDate) : ''),
    ].join(';'));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
