import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import { readInvoiceFinancings, readInvoicePayments, type InvoiceFinancing, type InvoicePayment } from './card-financing';
import { maxCreditInstallments, type CreditCard, type CreditEntry } from './credit';
import { isCreditCardFields, isReserveMovementFields, readCreditCards, readEntries, readSettings, type ReserveMovement } from './db';
import { brDate, monthlyDate, parseDate, type Budget, type Category, type Counter, type Entry, type Theme } from './domain';
import { favoriteKey, isFavoriteFields, readFavorites, type Favorite } from './favorites';
import { isSavingsGoalFields, readGoalMovementLinks, type GoalMovementLink, type SavingsGoal } from './goals';

type BackupSettings = { theme: Theme; firstDay: number };
type BackupData = {
  categories: Category[];
  entries: Entry[];
  counters: Counter[];
  budgets: Budget[];
  cards: CreditCard[];
  reserveMovements: ReserveMovement[];
  favorites: Favorite[];
  goals: SavingsGoal[];
  goalMovementLinks: GoalMovementLink[];
  invoiceFinancings: InvoiceFinancing[];
  invoicePayments: InvoicePayment[];
  settings: BackupSettings;
};
export type Backup = {
  format: 'bolso-em-dia';
  version: 5;
  exportedAt: string;
  data: BackupData;
};

export async function readBackup(db: SQLiteDatabase): Promise<Backup> {
  const [categories, entries, counters, budgets, cards, reserveMovements, settings, favorites, goals,
    goalMovementLinks, invoiceFinancings, invoicePayments] = await Promise.all([
    db.getAllAsync<Category>('SELECT id,name,kind FROM categories ORDER BY id'),
    readEntries(db),
    db.getAllAsync<Counter>('SELECT id,name,value,previous FROM counters ORDER BY id'),
    db.getAllAsync<Budget>('SELECT month,categoryId,cents FROM budgets ORDER BY month,categoryId'),
    readCreditCards(db),
    db.getAllAsync<ReserveMovement>('SELECT id,kind,direction,cents,date,note FROM reserve_movements ORDER BY id'),
    readSettings(db),
    readFavorites(db),
    db.getAllAsync<SavingsGoal>('SELECT id,name,targetCents,deadline FROM savings_goals ORDER BY id'),
    readGoalMovementLinks(db),
    readInvoiceFinancings(db),
    readInvoicePayments(db),
  ]);
  return {
    format: 'bolso-em-dia',
    version: 5,
    exportedAt: new Date().toISOString(),
    data: { categories, entries, counters, budgets, cards, reserveMovements, settings, favorites, goals,
      goalMovementLinks, invoiceFinancings, invoicePayments },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isId(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCategory(value: unknown): value is Category {
  return isObject(value) && isId(value.id) && isName(value.name) &&
    (value.kind === 'gasto' || value.kind === 'entrada' || value.kind === 'ambos');
}

function isCreditCard(value: unknown): value is CreditCard {
  return isObject(value) && isId(value.id) && isCreditCardFields(value);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && parseDate(brDate(value)) === value;
}

function isCreditEntry(value: unknown): value is CreditEntry {
  if (!isObject(value) || !isId(value.cardId)) return false;
  const link = value.financing;
  if (link !== undefined && (!isObject(link) || !isId(link.planId) ||
    (link.role !== 'original' && link.role !== 'installment'))) return false;
  const financingInstallment = isObject(link) && link.role === 'installment';
  return isDate(value.purchaseDate) && isDate(value.closingDate) &&
    (financingInstallment ? value.purchaseDate <= value.closingDate : value.purchaseDate < value.closingDate) &&
    isId(value.installmentTotal) && value.installmentTotal <= maxCreditInstallments &&
    isId(value.installmentNumber) && value.installmentNumber <= value.installmentTotal &&
    (value.refundOf === undefined || (isId(value.refundOf) && value.installmentTotal === 1 && !financingInstallment));
}

function isInvoiceFinancing(value: unknown): value is InvoiceFinancing {
  return isObject(value) && isId(value.id) && isId(value.cardId) && isId(value.principalCents) &&
    isDate(value.dueDate) && isDate(value.firstDueDate) && value.firstDueDate >= value.dueDate &&
    isId(value.installments) && value.installments >= 2 && value.installments <= maxCreditInstallments &&
    isId(value.installmentCents) && value.installmentCents <= 99999999999;
}

function isInvoicePayment(value: unknown): value is InvoicePayment {
  return isObject(value) && isId(value.id) && isId(value.cardId) && isDate(value.dueDate) && isDate(value.paymentDate) &&
    isId(value.cents) && value.cents <= 99999999999 && (value.financingPlanId === null || isId(value.financingPlanId));
}

function validInvoiceFinancings(
  entries: Entry[], plans: InvoiceFinancing[], payments: InvoicePayment[], cardIds: Set<number>,
) {
  const indexed = new Map(plans.map(plan => [plan.id, { plan, originalTotal: 0, paidTotal: 0, installments: new Set<number>() }]));
  const invoiceKeys = new Set<string>();
  for (const entry of entries) {
    if (entry.credit) invoiceKeys.add(entry.credit.cardId + '/' + entry.date);
    const linked = entry.credit?.financing;
    if (!linked || !entry.credit) continue;
    const item = indexed.get(linked.planId);
    if (!item || item.plan.cardId !== entry.credit.cardId) return false;
    const { plan, installments } = item;
    if (linked.role === 'original') {
      if (entry.date !== plan.dueDate || entry.confirmed) return false;
      item.originalTotal += entry.credit.refundOf ? -entry.cents : entry.cents;
    } else {
      const number = entry.credit.installmentNumber;
      if (entry.credit.installmentTotal !== plan.installments || entry.cents !== plan.installmentCents ||
        entry.credit.purchaseDate !== plan.dueDate || entry.credit.closingDate !== entry.date ||
        entry.date !== monthlyDate(plan.firstDueDate, number - 1) || installments.has(number)) return false;
      installments.add(number);
    }
  }
  for (const payment of payments) {
    if (!cardIds.has(payment.cardId) || !invoiceKeys.has(payment.cardId + '/' + payment.dueDate)) return false;
    if (payment.financingPlanId === null) continue;
    const item = indexed.get(payment.financingPlanId);
    if (!item || item.plan.cardId !== payment.cardId || item.plan.dueDate !== payment.dueDate) return false;
    item.paidTotal += payment.cents;
  }
  return [...indexed.values()].every(({ plan, originalTotal, paidTotal, installments }) =>
    cardIds.has(plan.cardId) && originalTotal === plan.principalCents + paidTotal && installments.size === plan.installments);
}

function isEntry(value: unknown): value is Entry {
  return isObject(value) && isId(value.id) && isId(value.categoryId) && isId(value.cents) &&
    (value.kind === 'gasto' || value.kind === 'entrada') &&
    isDate(value.date) &&
    typeof value.note === 'string' && typeof value.payment === 'string' &&
    (value.confirmed === 0 || value.confirmed === 1) &&
    (value.seriesId === null || isId(value.seriesId)) &&
    (value.credit === undefined || (isCreditEntry(value.credit) && value.kind === 'gasto' &&
      value.payment === 'Crédito' && value.seriesId === null && value.credit.closingDate <= value.date));
}

function isCounter(value: unknown): value is Counter {
  return isObject(value) && isId(value.id) && isName(value.name) && isInteger(value.value) &&
    (value.previous === null || isInteger(value.previous));
}

function isBudget(value: unknown): value is Budget {
  return isObject(value) && typeof value.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month) &&
    (value.categoryId === 0 || isId(value.categoryId)) && isId(value.cents);
}

function isReserveMovement(value: unknown): value is ReserveMovement {
  return isObject(value) && isId(value.id) && isReserveMovementFields(value);
}

function isSettings(value: unknown): value is BackupSettings {
  return isObject(value) && (value.theme === 'sistema' || value.theme === 'claro' || value.theme === 'escuro') &&
    isInteger(value.firstDay) && value.firstDay >= 1 && value.firstDay <= 28;
}

function isRows<Row>(value: unknown, isRow: (row: unknown) => row is Row): value is Row[] {
  return Array.isArray(value) && value.every(isRow);
}

function hasUnique<Row>(rows: Row[], key: (row: Row) => string | number) {
  return new Set(rows.map(key)).size === rows.length;
}

function isBackupData(value: unknown): value is Pick<BackupData, 'categories' | 'entries' | 'counters' | 'budgets' | 'settings'> {
  if (!isObject(value)) return false;

  const { categories, entries, counters, budgets, settings } = value;
  if (!isRows(categories, isCategory) || !isRows(entries, isEntry) || !isRows(counters, isCounter) ||
    !isRows(budgets, isBudget) || !isSettings(settings)) return false;

  const categoryById = new Map(categories.map(category => [category.id, category]));
  return categories.length > 0 && categoryById.size === categories.length &&
    hasUnique(categories, category => JSON.stringify([category.kind, category.name.toLocaleLowerCase('pt-BR')])) &&
    hasUnique(entries, entry => entry.id) &&
    hasUnique(counters, counter => counter.id) &&
    hasUnique(budgets, budget => budget.month + '/' + budget.categoryId) &&
    entries.every(entry => {
      const category = categoryById.get(entry.categoryId);
      return category?.kind === entry.kind || category?.kind === 'ambos';
    }) &&
    budgets.every(budget => budget.categoryId === 0 || categoryById.has(budget.categoryId));
}

export function parseBackup(text: string): Backup | null {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  if (!isObject(value) || value.format !== 'bolso-em-dia' ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5) ||
    typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) ||
    !isObject(value.data)) return null;

  const { data } = value;
  const reserveMovements = value.version === 1 ? [] : data.reserveMovements;
  const cards = value.version >= 3 ? data.cards : [];
  const favorites = value.version >= 4 ? data.favorites : [];
  const goals = value.version >= 4 ? data.goals : [];
  const goalMovementLinks = value.version >= 4 ? data.goalMovementLinks : [];
  const invoiceFinancings = value.version === 5 || (value.version === 4 && data.invoiceFinancings !== undefined)
    ? data.invoiceFinancings : [];
  const invoicePayments = value.version === 5 ? data.invoicePayments : [];
  if (!isBackupData(data) || !isRows(reserveMovements, isReserveMovement) ||
    !hasUnique(reserveMovements, movement => movement.id) ||
    !isRows(cards, isCreditCard) || !hasUnique(cards, card => card.id) ||
    !isRows(favorites, (row): row is Favorite => isObject(row) && isId(row.id) && isFavoriteFields(row)) ||
    !hasUnique(favorites, favorite => favorite.id) || !hasUnique(favorites, favorite => favoriteKey(favorite.name)) ||
    !isRows(goals, (row): row is SavingsGoal => isObject(row) && isId(row.id) && isSavingsGoalFields(row)) ||
    !hasUnique(goals, goal => goal.id) ||
    !isRows(goalMovementLinks, (row): row is GoalMovementLink => isObject(row) && isId(row.movementId) && isId(row.goalId)) ||
    !hasUnique(goalMovementLinks, link => link.movementId) ||
    !isRows(invoiceFinancings, isInvoiceFinancing) || !hasUnique(invoiceFinancings, plan => plan.id) ||
    !hasUnique(invoiceFinancings, plan => plan.cardId + '/' + plan.dueDate) ||
    !isRows(invoicePayments, isInvoicePayment) || !hasUnique(invoicePayments, payment => payment.id)) return null;

  const cardIds = new Set(cards.map(card => card.id));
  const charges = new Map(data.entries.filter(entry => entry.credit && !entry.credit.refundOf).map(entry => [entry.id, entry.credit]));
  const eligibleCategories = new Set(data.categories.filter(category => category.kind !== 'entrada').map(category => category.id));
  const goalIds = new Set(goals.map(goal => goal.id));
  const savingsIds = new Set(reserveMovements.filter(movement => movement.kind === 'economia').map(movement => movement.id));
  if (data.entries.some(entry => entry.credit && (!cardIds.has(entry.credit.cardId) ||
    (entry.credit.refundOf && charges.get(entry.credit.refundOf)?.cardId !== entry.credit.cardId))) ||
    favorites.some(favorite => !eligibleCategories.has(favorite.categoryId)) ||
    goalMovementLinks.some(link => !goalIds.has(link.goalId) || !savingsIds.has(link.movementId)) ||
    !validInvoiceFinancings(data.entries, invoiceFinancings, invoicePayments, cardIds)) return null;

  return {
    format: value.format, version: 5, exportedAt: value.exportedAt,
    data: { ...data, cards, reserveMovements, favorites, goals, goalMovementLinks, invoiceFinancings, invoicePayments },
  };
}

async function insertRows<Row>(
  db: SQLiteDatabase, sql: string, rows: Row[], bind: (row: Row) => SQLiteBindValue[],
) {
  if (!rows.length) return;
  const statement = await db.prepareAsync(sql);
  try {
    for (const row of rows) await statement.executeAsync(bind(row));
  } finally {
    await statement.finalizeAsync();
  }
}

export async function restoreBackup(db: SQLiteDatabase, backup: Backup) {
  const { categories, entries, counters, budgets, cards, reserveMovements, settings, favorites, goals,
    goalMovementLinks, invoiceFinancings, invoicePayments } = backup.data;
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM expense_favorites; DELETE FROM savings_goals; DELETE FROM credit_invoice_payments;' +
      'DELETE FROM credit_invoice_plans;' +
      'DELETE FROM budgets; DELETE FROM credit_entries; DELETE FROM entries; DELETE FROM credit_cards;' +
      'DELETE FROM categories; DELETE FROM counters;' +
      'DELETE FROM reserve_movements; DELETE FROM settings;');
    await insertRows(db, 'INSERT INTO categories (id,name,kind) VALUES (?,?,?)', categories,
      category => [category.id, category.name, category.kind]);
    await insertRows(db, 'INSERT INTO entries (id,kind,cents,categoryId,date,note,payment,confirmed,seriesId) VALUES (?,?,?,?,?,?,?,?,?)', entries,
      entry => [entry.id, entry.kind, entry.cents, entry.categoryId, entry.date, entry.note, entry.payment, entry.confirmed, entry.seriesId]);
    await insertRows(db, 'INSERT INTO credit_cards (id,name,closingDay,dueDay,limitCents) VALUES (?,?,?,?,?)', cards,
      card => [card.id, card.name, card.closingDay, card.dueDay, card.limitCents ?? null]);
    const creditEntries = entries.flatMap(entry => entry.credit ? [{ entryId: entry.id, ...entry.credit }] : []);
    await insertRows(db, `INSERT INTO credit_entries
      (entryId,cardId,purchaseDate,closingDate,installmentNumber,installmentTotal,refundOf) VALUES (?,?,?,?,?,?,?)`, creditEntries,
      credit => [credit.entryId, credit.cardId, credit.purchaseDate, credit.closingDate, credit.installmentNumber, credit.installmentTotal, credit.refundOf ?? null]);
    await insertRows(db, `INSERT INTO credit_invoice_plans
      (id,cardId,dueDate,principalCents,firstDueDate,installments,installmentCents) VALUES (?,?,?,?,?,?,?)`, invoiceFinancings,
      plan => [plan.id, plan.cardId, plan.dueDate, plan.principalCents, plan.firstDueDate, plan.installments, plan.installmentCents]);
    await insertRows(db, 'INSERT INTO credit_invoice_plan_entries (entryId,planId,role) VALUES (?,?,?)',
      creditEntries.flatMap(credit => credit.financing ? [{ entryId: credit.entryId, ...credit.financing }] : []),
      link => [link.entryId, link.planId, link.role]);
    await insertRows(db, `INSERT INTO credit_invoice_payments
      (id,cardId,dueDate,paymentDate,cents,financingPlanId) VALUES (?,?,?,?,?,?)`, invoicePayments,
      payment => [payment.id, payment.cardId, payment.dueDate, payment.paymentDate, payment.cents, payment.financingPlanId]);
    await insertRows(db, 'INSERT INTO counters (id,name,value,previous) VALUES (?,?,?,?)', counters,
      counter => [counter.id, counter.name, counter.value, counter.previous]);
    await insertRows(db, 'INSERT INTO budgets (month,categoryId,cents) VALUES (?,?,?)', budgets,
      budget => [budget.month, budget.categoryId, budget.cents]);
    await insertRows(db, 'INSERT INTO reserve_movements (id,kind,direction,cents,date,note) VALUES (?,?,?,?,?,?)', reserveMovements,
      movement => [movement.id, movement.kind, movement.direction, movement.cents, movement.date, movement.note]);
    await insertRows(db, 'INSERT INTO expense_favorites (id,name,nameKey,categoryId,payment,note) VALUES (?,?,?,?,?,?)', favorites,
      favorite => [favorite.id, favorite.name, favoriteKey(favorite.name), favorite.categoryId, favorite.payment, favorite.note]);
    await insertRows(db, 'INSERT INTO savings_goals (id,name,targetCents,deadline) VALUES (?,?,?,?)', goals,
      goal => [goal.id, goal.name, goal.targetCents, goal.deadline]);
    await insertRows(db, 'INSERT INTO reserve_goal_movements (movementId,goalId) VALUES (?,?)', goalMovementLinks,
      link => [link.movementId, link.goalId]);
    await db.runAsync('INSERT INTO settings (key,value) VALUES (?,?),(?,?)',
      'theme', settings.theme, 'firstDay', String(settings.firstDay));
  });
}
