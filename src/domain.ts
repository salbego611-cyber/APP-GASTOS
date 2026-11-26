import type { CreditEntry } from './credit';

export type Kind = 'gasto' | 'entrada';
export type Confirmation = 0 | 1;
export type Theme = 'sistema' | 'claro' | 'escuro';
export type Category = { id: number; name: string; kind: Kind | 'ambos' };
export type Entry = {
  id: number; kind: Kind; cents: number; categoryId: number;
  date: string; note: string; payment: string; confirmed: Confirmation; seriesId: number | null;
  credit?: CreditEntry;
};
export type Counter = { id: number; name: string; value: number; previous: number | null };
export type Budget = { month: string; categoryId: number; cents: number };

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (cents: number) => money.format(cents / 100);
export const amountText = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
export const integer = new Intl.NumberFormat('pt-BR');
export const payments = ['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Transferência'];
export const pad = (n: number) => String(n).padStart(2, '0');

export function parseMoney(value: string) {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.replaceAll('.', '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 99999999999 ? cents : null;
}

export function isoDate(date = new Date()) {
  return [String(date.getFullYear()), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

export function isFutureIncome(kind: Kind, date: string | null, today: string) {
  return kind === 'entrada' && date !== null && date > today;
}

export const brDate = (iso: string) => iso.split('-').reverse().join('/');

export function parseDate(text: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
  const [day, month, year] = text.split('/').map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && isoDate(date) === [year, pad(month), pad(day)].join('-') ? isoDate(date) : null;
}

export function shiftMonth(month: string, amount: number) {
  const [year, m] = month.split('-').map(Number);
  return isoDate(new Date(year, m - 1 + amount, 1)).slice(0, 7);
}

export function monthlyDate(date: string, offset: number) {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(year, month - 1 + offset, 1);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return isoDate(result);
}

export function periodOf(date: string, firstDay: number) {
  const month = date.slice(0, 7);
  return Number(date.slice(8)) < firstDay ? shiftMonth(month, -1) : month;
}

export function monthLabel(month: string) {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(month + '-15T12:00:00'));
  return label[0].toUpperCase() + label.slice(1);
}
