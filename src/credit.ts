import { brDate, monthlyDate, pad, parseDate, shiftMonth, type Entry } from './domain';

export type CreditCard = { id: number; name: string; closingDay: number; dueDay: number; limitCents?: number | null };
export type CreditFinancingLink = { planId: number; role: 'original' | 'installment' };
export type CreditEntry = {
  cardId: number;
  purchaseDate: string;
  installmentNumber: number;
  installmentTotal: number;
  closingDate: string;
  refundOf?: number;
  financing?: CreditFinancingLink;
};

export const maxCreditInstallments = 36;

export class CreditOperationError extends Error {}

export function creditDebit(entry: Pick<Entry, 'cents' | 'credit'>) {
  if (entry.credit?.financing?.role === 'original') return 0;
  return entry.credit?.refundOf ? -entry.cents : entry.cents;
}

export function creditSchedule(
  card: Pick<CreditCard, 'closingDay' | 'dueDay'>,
  purchaseDate: string,
  cents: number,
  installments: number,
) {
  const { closingDay, dueDay } = card;
  if (![closingDay, dueDay].every(day => Number.isInteger(day) && day >= 1 && day <= 31) || closingDay === dueDay) {
    throw new Error('Escolha dias diferentes de fechamento e vencimento, entre 1 e 31.');
  }
  if (parseDate(brDate(purchaseDate)) !== purchaseDate) {
    throw new Error('Informe uma data de compra válida.');
  }
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99999999999) {
    throw new Error('Informe um valor maior que zero.');
  }
  if (!Number.isInteger(installments) || installments < 1 || installments > Math.min(maxCreditInstallments, cents)) {
    throw new Error('Escolha até 36 parcelas de pelo menos um centavo.');
  }

  const purchaseMonth = purchaseDate.slice(0, 7);
  const closingInPurchaseMonth = monthlyDate(purchaseMonth + '-' + pad(closingDay), 0);
  const firstClosingOffset = purchaseDate < closingInPurchaseMonth ? 0 : 1;
  const dueOffset = dueDay > closingDay ? 0 : 1;
  const baseCents = Math.floor(cents / installments);
  const remainder = cents % installments;

  return Array.from({ length: installments }, (_, index) => {
    const offset = firstClosingOffset + index;
    const closingMonth = shiftMonth(purchaseMonth, offset);
    const dueMonth = shiftMonth(purchaseMonth, offset + dueOffset);
    const closingDate = monthlyDate(closingMonth + '-' + pad(closingDay), 0);
    const dueDate = monthlyDate(dueMonth + '-' + pad(dueDay), 0);
    if (parseDate(brDate(closingDate)) !== closingDate || parseDate(brDate(dueDate)) !== dueDate) {
      throw new Error('O vencimento das parcelas precisa ter uma data válida.');
    }
    return {
      cents: baseCents + (index < remainder ? 1 : 0),
      closingDate,
      dueDate,
      installmentNumber: index + 1,
    };
  });
}
