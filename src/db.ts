import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { CreditOperationError, creditSchedule, maxCreditInstallments, type CreditCard, type CreditEntry, type CreditFinancingLink } from './credit';
import { invoiceFinancingSchema, readInvoiceBalances, readInvoiceFinancings, readInvoicePayments } from './card-financing';
import { brDate, isoDate, monthlyDate, pad, parseDate, type Budget, type Category, type Counter, type Entry, type Theme } from './domain';
import { initFavorites, readFavorites } from './favorites';
import { goalsSchema, readGoalMovementLinks, readSavingsGoals } from './goals';

export { deleteCreditInvoicePayment, readInvoiceBalances, saveCreditInvoicePayment } from './card-financing';
export type { InvoiceBalance, InvoicePayment } from './card-financing';

export type ReserveKind = 'economia' | 'investimento';
export type ReserveDirection = 'aporte' | 'retirada';
export type ReserveMovement = {
  id: number; kind: ReserveKind; direction: ReserveDirection; cents: number; date: string; note: string;
};
export type ReserveMovementFields = Omit<ReserveMovement, 'id'>;
type ReserveSummary = { balance: number; deposits: number; withdrawals: number };

const defaults = [
  ['Alimentação', 'gasto'], ['Transporte', 'gasto'], ['Moradia', 'gasto'],
  ['Saúde', 'gasto'], ['Lazer', 'gasto'], ['Contas', 'gasto'],
  ['Salário', 'entrada'], ['Outros', 'ambos'],
];
const seed = "INSERT OR IGNORE INTO categories (name,kind) VALUES " +
  defaults.map(([name, kind]) => "('" + name + "','" + kind + "')").join(',') + ';';

export async function openStore() {
  const db = await openDatabaseAsync('bolso-em-dia.db');
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
      UNIQUE(name COLLATE NOCASE,kind)
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0),
      categoryId INTEGER NOT NULL REFERENCES categories(id), date TEXT NOT NULL,
      note TEXT NOT NULL, payment TEXT NOT NULL,
      confirmed INTEGER NOT NULL DEFAULT 1 CHECK(confirmed IN (0,1)), seriesId INTEGER
    );
    CREATE INDEX IF NOT EXISTS entries_date ON entries(date);
    CREATE TABLE IF NOT EXISTS credit_cards (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 35),
      closingDay INTEGER NOT NULL CHECK(typeof(closingDay) = 'integer' AND closingDay BETWEEN 1 AND 31),
      dueDay INTEGER NOT NULL CHECK(typeof(dueDay) = 'integer' AND dueDay BETWEEN 1 AND 31 AND dueDay != closingDay),
      limitCents INTEGER CHECK(limitCents IS NULL OR limitCents BETWEEN 1 AND 99999999999)
    );
    CREATE TABLE IF NOT EXISTS credit_entries (
      entryId INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
      cardId INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
      purchaseDate TEXT NOT NULL, closingDate TEXT NOT NULL,
      installmentTotal INTEGER NOT NULL CHECK(typeof(installmentTotal) = 'integer' AND installmentTotal BETWEEN 1 AND ${maxCreditInstallments}),
      installmentNumber INTEGER NOT NULL CHECK(typeof(installmentNumber) = 'integer' AND installmentNumber BETWEEN 1 AND installmentTotal),
      refundOf INTEGER REFERENCES entries(id) ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS credit_entries_card ON credit_entries(cardId);
    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, value INTEGER NOT NULL DEFAULT 0, previous INTEGER
    );
    CREATE TABLE IF NOT EXISTS budgets (
      month TEXT NOT NULL, categoryId INTEGER NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0),
      PRIMARY KEY(month,categoryId)
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reserve_movements (
      id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('economia','investimento')),
      direction TEXT NOT NULL CHECK(direction IN ('aporte','retirada')),
      cents INTEGER NOT NULL CHECK(typeof(cents) = 'integer' AND cents > 0 AND cents <= 99999999999),
      date TEXT NOT NULL, note TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reserve_movements_date ON reserve_movements(date);
    ${goalsSchema}
    ${invoiceFinancingSchema}
    ${seed}
  `);
  await initFavorites(db);
  await db.withTransactionAsync(async () => {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(entries)');
    if (!columns.some(column => column.name === 'confirmed')) {
      await db.execAsync('ALTER TABLE entries ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1 CHECK(confirmed IN (0,1))');
      await db.runAsync('UPDATE entries SET confirmed = 0 WHERE date > ?', isoDate());
    }
    if (!columns.some(column => column.name === 'seriesId')) {
      await db.execAsync('ALTER TABLE entries ADD COLUMN seriesId INTEGER');
    }
    const cards = await db.getAllAsync<{ name: string }>('PRAGMA table_info(credit_cards)');
    if (!cards.some(column => column.name === 'limitCents')) {
      await db.execAsync('ALTER TABLE credit_cards ADD COLUMN limitCents INTEGER CHECK(limitCents IS NULL OR limitCents BETWEEN 1 AND 99999999999)');
    }
    const credit = await db.getAllAsync<{ name: string }>('PRAGMA table_info(credit_entries)');
    if (!credit.some(column => column.name === 'refundOf')) {
      await db.execAsync('ALTER TABLE credit_entries ADD COLUMN refundOf INTEGER REFERENCES entries(id) ON DELETE RESTRICT');
    }
    await db.execAsync('CREATE INDEX IF NOT EXISTS entries_series ON entries(seriesId) WHERE seriesId IS NOT NULL');
    await db.execAsync('CREATE INDEX IF NOT EXISTS credit_refunds_purchase ON credit_entries(refundOf) WHERE refundOf IS NOT NULL');
  });
  return db;
}

type EntryFields = Omit<Entry, 'id' | 'seriesId' | 'credit'>;
const insertEntry = 'INSERT INTO entries (kind,cents,categoryId,date,note,payment,confirmed,seriesId) VALUES (?,?,?,?,?,?,?,?)';

export function saveEntry(db: SQLiteDatabase, entry: EntryFields, id?: number, count = 1) {
  const { kind, cents, categoryId, date, note, payment, confirmed } = entry;
  const values = [kind, cents, categoryId, date, note, payment, confirmed] as const;
  if (id !== undefined) {
    return db.runAsync(`
      UPDATE entries SET kind=?,cents=?,categoryId=?,date=?,note=?,payment=?,confirmed=?
      WHERE id=? AND id NOT IN (SELECT entryId FROM credit_entries)
    `, ...values, id);
  }

  if (count === 1) return db.runAsync(insertEntry, ...values, null);

  return db.withTransactionAsync(async () => {
    const first = await db.runAsync(insertEntry, ...values, null);
    const seriesId = first.lastInsertRowId;
    await db.runAsync('UPDATE entries SET seriesId = ? WHERE id = ?', seriesId, seriesId);
    for (let offset = 1; offset < count; offset++) {
      await db.runAsync(insertEntry, kind, cents, categoryId, monthlyDate(date, offset), note, payment, 0, seriesId);
    }
  });
}

type CreditCardFields = Omit<CreditCard, 'id'>;
type CreditInstallmentFields = Pick<Entry, 'cents' | 'categoryId' | 'note'>;
type CreditPurchaseFields = CreditInstallmentFields & { cardId: number; purchaseDate: string; installments: number };
type CreditRow = Omit<CreditEntry, 'refundOf' | 'financing'> & { refundOf: number | null };
type EntryRow = Omit<Entry, 'credit'> & (CreditRow | Record<keyof CreditRow, null>) &
  { planId: number | null; planRole: CreditFinancingLink['role'] | null };

export function isCreditCardFields(value: unknown): value is CreditCardFields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { name, closingDay, dueDay, limitCents } = value as Record<string, unknown>;
  const validDay = (day: unknown) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 35 &&
    validDay(closingDay) && validDay(dueDay) && closingDay !== dueDay &&
    (limitCents == null || isTransactionAmount(limitCents));
}

export function saveCreditCard(db: SQLiteDatabase, card: CreditCardFields, id?: number) {
  if (!isCreditCardFields(card)) throw new Error('Informe o nome do cartão e dias diferentes de fechamento e vencimento.');

  const values = [card.name.trim(), card.closingDay, card.dueDay, card.limitCents ?? null] as const;
  if (id !== undefined) {
    return db.runAsync('UPDATE credit_cards SET name=?,closingDay=?,dueDay=?,limitCents=? WHERE id=?', ...values, id);
  }
  return db.runAsync('INSERT INTO credit_cards (name,closingDay,dueDay,limitCents) VALUES (?,?,?,?)', ...values);
}

export async function deleteCreditCard(db: SQLiteDatabase, id: number) {
  const result = await db.runAsync(`
    DELETE FROM credit_cards WHERE id=? AND id NOT IN (SELECT cardId FROM credit_entries)
  `, id);
  if (!result.changes) throw new Error('Exclua os lançamentos deste cartão antes de removê-lo.');
  return result;
}

export function readCreditCards(db: SQLiteDatabase) {
  return db.getAllAsync<CreditCard>('SELECT id,name,closingDay,dueDay,limitCents FROM credit_cards ORDER BY name COLLATE NOCASE,id');
}

export function saveCreditPurchase(db: SQLiteDatabase, purchase: CreditPurchaseFields) {
  const { cardId, purchaseDate, categoryId, cents, note, installments } = purchase;
  return db.withTransactionAsync(async () => {
    const card = await db.getFirstAsync<CreditCard>('SELECT * FROM credit_cards WHERE id=?', cardId);
    if (!card) throw new Error('Selecione um cartão cadastrado.');
    const category = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM categories WHERE id=? AND kind IN ('gasto','ambos')", categoryId);
    if (!category) throw new Error('Selecione uma categoria de gasto.');

    for (const installment of creditSchedule(card, purchaseDate, cents, installments)) {
      const result = await db.runAsync(insertEntry,
        'gasto', installment.cents, categoryId, installment.dueDate, note.trim(), 'Crédito', 0, null);
      await db.runAsync(`
        INSERT INTO credit_entries (entryId,cardId,purchaseDate,closingDate,installmentNumber,installmentTotal)
        VALUES (?,?,?,?,?,?)
      `, result.lastInsertRowId, cardId, purchaseDate, installment.closingDate, installment.installmentNumber, installments);
    }
  });
}

export function updateCreditInstallment(db: SQLiteDatabase, id: number, fields: CreditInstallmentFields) {
  const { cents, categoryId, note } = fields;
  if (!isTransactionAmount(cents)) throw new CreditOperationError('Informe um valor maior que zero.');

  return db.withTransactionAsync(async () => {
    const { installments, refunds } = await readCreditPurchase(db, id);
    const total = installments.reduce((sum, item) => sum + (item.id === id ? cents : item.cents), 0);
    if (refunds.reduce((sum, item) => sum + item.cents, 0) > total) {
      throw new CreditOperationError('O valor da compra precisa cobrir os estornos já registrados.');
    }
    const result = await db.runAsync(`
      UPDATE entries SET cents=?,categoryId=?,note=? WHERE id=?
        AND EXISTS (SELECT 1 FROM categories WHERE id=? AND kind IN ('gasto','ambos'))
    `, cents, categoryId, note.trim(), id, categoryId);
    if (!result.changes) throw new CreditOperationError('Parcela ou categoria indisponível.');
    await db.runAsync('UPDATE entries SET categoryId=? WHERE id IN (SELECT entryId FROM credit_entries WHERE refundOf=?)', categoryId, id);
  });
}

export function deleteEntry(db: SQLiteDatabase, entryId: number) {
  return db.withTransactionAsync(async () => {
    const cardRow = await db.getFirstAsync<{ refundOf: number | null; planId: number | null; paymentWithoutInvoice: number }>(`
      SELECT credit.refundOf, link.planId,
        EXISTS (
          SELECT 1 FROM credit_invoice_payments AS payment
          WHERE payment.cardId=credit.cardId AND payment.dueDate=e.date
        ) AND NOT EXISTS (
          SELECT 1 FROM credit_entries AS sibling JOIN entries AS other ON other.id=sibling.entryId
          WHERE sibling.cardId=credit.cardId AND other.date=e.date AND other.id!=e.id
        ) AS paymentWithoutInvoice
      FROM credit_entries AS credit JOIN entries AS e ON e.id=credit.entryId
      LEFT JOIN credit_invoice_plan_entries AS link ON link.entryId=credit.entryId WHERE credit.entryId=?
    `, entryId);
    if (cardRow?.planId) throw new CreditOperationError('Gerencie esta parcela em Cartões de crédito.');
    if (cardRow?.paymentWithoutInvoice) {
      throw new CreditOperationError('Exclua o pagamento da fatura antes de remover o último lançamento.');
    }
    if (cardRow && !cardRow.refundOf) {
      const { installments, refunds } = await readCreditPurchase(db, entryId);
      if (refunds.some(item => item.refundOf === entryId)) {
        throw new CreditOperationError('Exclua primeiro o estorno associado a esta parcela.');
      }
      const total = installments.reduce((sum, item) => sum + (item.id === entryId ? 0 : item.cents), 0);
      if (refunds.reduce((sum, item) => sum + item.cents, 0) > total) {
        throw new CreditOperationError('As outras parcelas precisam cobrir os estornos já registrados.');
      }
    }
    await db.runAsync('DELETE FROM entries WHERE id=?', entryId);
  });
}

// Credit purchases insert all installments consecutively in a single write transaction.
async function readCreditPurchase(db: SQLiteDatabase, entryId: number) {
  const original = await db.getFirstAsync<CreditRow & { note: string; categoryId: number }>(`
    SELECT credit_entries.*, entries.note, entries.categoryId
    FROM credit_entries JOIN entries ON entries.id = credit_entries.entryId
    WHERE entryId = ? AND refundOf IS NULL
      AND entryId NOT IN (SELECT entryId FROM credit_invoice_plan_entries)
  `, entryId);
  if (!original) throw new CreditOperationError('Compra de cartão indisponível.');

  const installments = await db.getAllAsync<{
    id: number; cents: number; confirmed: number; closingDate: string; financed: number; hasPayment: number;
  }>(`
    SELECT entries.id, entries.cents, entries.confirmed, credit_entries.closingDate,
      EXISTS (SELECT 1 FROM credit_invoice_plan_entries WHERE entryId=entries.id) AS financed,
      EXISTS (
        SELECT 1 FROM credit_invoice_payments AS payment
        WHERE payment.cardId=credit_entries.cardId AND payment.dueDate=entries.date
      ) AS hasPayment
    FROM credit_entries JOIN entries ON entries.id = credit_entries.entryId
    WHERE cardId = ? AND purchaseDate = ? AND installmentTotal = ? AND refundOf IS NULL
      AND entryId - installmentNumber + 1 = ?
  `, original.cardId, original.purchaseDate, original.installmentTotal, entryId - original.installmentNumber + 1);
  const refunds = await db.getAllAsync<{ refundOf: number; cents: number }>(`
    SELECT credit_entries.refundOf, entries.cents FROM credit_entries
    JOIN entries ON entries.id = credit_entries.entryId WHERE refundOf IN (${installments.map(() => '?').join(',')})
  `, ...installments.map(installment => installment.id));
  return { original, installments, refunds };
}

export function saveCreditRefund(db: SQLiteDatabase, entryId: number, date: string, cents: number) {
  return db.withTransactionAsync(async () => {
    const { original, installments, refunds } = await readCreditPurchase(db, entryId);
    const originalTotal = installments.reduce((sum, installment) => sum + installment.cents, 0);
    const alreadyRefunded = refunds.reduce((sum, refund) => sum + refund.cents, 0);
    if (!isTransactionAmount(cents) || cents > originalTotal - alreadyRefunded) {
      throw new CreditOperationError('O estorno deve caber no valor restante da compra.');
    }
    if (date < original.purchaseDate || date > isoDate()) throw new CreditOperationError('Escolha uma data entre a compra e hoje.');
    const card = await db.getFirstAsync<CreditCard>('SELECT * FROM credit_cards WHERE id=?', original.cardId);
    if (!card) throw new CreditOperationError('Cartão indisponível.');
    const [invoice] = creditSchedule(card, date, cents, 1);
    const result = await db.runAsync(insertEntry, 'gasto', cents, original.categoryId, invoice.dueDate,
      original.note ? 'Estorno de ' + original.note : 'Estorno no cartão', 'Crédito', 0, null);
    await db.runAsync(`
      INSERT INTO credit_entries (entryId,cardId,purchaseDate,closingDate,installmentNumber,installmentTotal,refundOf)
      VALUES (?,?,?,?,1,1,?)
    `, result.lastInsertRowId, original.cardId, date, invoice.closingDate, entryId);
  });
}

export function cancelFutureCreditInstallments(db: SQLiteDatabase, entryId: number) {
  return db.withTransactionAsync(async () => {
    const today = isoDate();
    const { installments, refunds } = await readCreditPurchase(db, entryId);
    const ids = new Set(refunds.map(refund => refund.refundOf));
    const future = installments.filter(installment =>
      !installment.confirmed && !installment.financed && !installment.hasPayment &&
      installment.closingDate > today && !ids.has(installment.id));
    if (!future.length) throw new CreditOperationError('Não há parcelas futuras em aberto para cancelar.');
    const cancelled = new Set(future.map(({ id }) => id));
    const kept = installments.reduce((sum, row) => sum + (cancelled.has(row.id) ? 0 : row.cents), 0);
    if (refunds.reduce((sum, refund) => sum + refund.cents, 0) > kept) {
      throw new CreditOperationError('Revise os estornos registrados antes de cancelar estas parcelas.');
    }
    await db.runAsync(`DELETE FROM entries WHERE id IN (${future.map(() => '?').join(',')})`, ...future.map(({ id }) => id));
  });
}

export function setCreditInvoicePaid(db: SQLiteDatabase, cardId: number, dueDate: string, paid: boolean) {
  return db.withTransactionAsync(async () => {
    const payment = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM credit_invoice_payments WHERE cardId=? AND dueDate=? LIMIT 1', cardId, dueDate);
    if (payment) throw new CreditOperationError('Revise os pagamentos registrados nesta fatura.');
    await db.runAsync(`
      UPDATE entries SET confirmed=?
      WHERE date=? AND id IN (SELECT entryId FROM credit_entries WHERE cardId=?)
        AND id NOT IN (SELECT entryId FROM credit_invoice_plan_entries WHERE role='original')
    `, paid ? 1 : 0, dueDate, cardId);
  });
}

export async function readEntries(db: SQLiteDatabase, period?: { start: string; end: string }, pendingExpenses = false) {
  const rows = await db.getAllAsync<EntryRow>(`
    SELECT entries.*, credit.cardId, credit.purchaseDate, credit.installmentNumber, credit.installmentTotal,
      credit.closingDate, credit.refundOf, link.planId, link.role AS planRole
    FROM entries
    LEFT JOIN credit_entries AS credit ON credit.entryId = entries.id
    LEFT JOIN credit_invoice_plan_entries AS link ON link.entryId = entries.id
    WHERE 1=1
    ${period ? 'AND entries.date >= ? AND entries.date < ?' : ''}
    ${pendingExpenses ? "AND entries.kind='gasto' AND entries.confirmed=0 AND (link.role IS NULL OR link.role != 'original')" : ''}
    ${period ? 'ORDER BY entries.date DESC,entries.id DESC' : 'ORDER BY entries.id'}
  `, ...(period ? [period.start, period.end] : []));
  return rows.map(({ cardId, purchaseDate, installmentNumber, installmentTotal, closingDate, refundOf, planId, planRole, ...entry }): Entry =>
    cardId === null ? entry : { ...entry, credit: {
      cardId, purchaseDate, installmentNumber, installmentTotal, closingDate, refundOf: refundOf ?? undefined,
      financing: planId && planRole ? { planId, role: planRole } : undefined,
    } });
}

export async function readSettings(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT * FROM settings');
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return { theme: (values.theme ?? 'sistema') as Theme, firstDay: Number(values.firstDay ?? 1) };
}

function isTransactionAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 99999999999;
}

export function isReserveMovementFields(value: unknown): value is ReserveMovementFields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { kind, direction, cents, date, note } = value as Record<string, unknown>;
  return (kind === 'economia' || kind === 'investimento') &&
    (direction === 'aporte' || direction === 'retirada') &&
    isTransactionAmount(cents) &&
    typeof date === 'string' && parseDate(brDate(date)) === date &&
    typeof note === 'string';
}

export function saveReserveMovement(db: SQLiteDatabase, movement: ReserveMovementFields, id?: number) {
  if (!isReserveMovementFields(movement) || movement.date > isoDate()) {
    throw new Error('Movimentação inválida.');
  }

  const { kind, direction, cents, date, note } = movement;
  const values = [kind, direction, cents, date, note.trim()] as const;
  if (id !== undefined) {
    return db.runAsync('UPDATE reserve_movements SET kind=?,direction=?,cents=?,date=?,note=? WHERE id=?', ...values, id);
  }
  return db.runAsync('INSERT INTO reserve_movements (kind,direction,cents,date,note) VALUES (?,?,?,?,?)', ...values);
}

export function deleteReserveMovement(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM reserve_movements WHERE id=?', id);
}

export async function readData(db: SQLiteDatabase, start: string, end: string, month: string, today = isoDate()) {
  const [entries, categories, counters, budgets, cards, reserveMovements, reserveTotals,
    favorites, goals, goalMovementLinks, invoiceFinancings, invoicePayments, invoiceBalances] = await Promise.all([
    readEntries(db, { start, end }),
    db.getAllAsync<Category>('SELECT * FROM categories ORDER BY id'),
    db.getAllAsync<Counter>('SELECT * FROM counters ORDER BY id'),
    db.getAllAsync<Budget>('SELECT * FROM budgets WHERE month = ?', month),
    readCreditCards(db),
    db.getAllAsync<ReserveMovement>(`
      SELECT * FROM reserve_movements WHERE date >= ? AND date < ? AND date <= ? ORDER BY date DESC,id DESC
    `, start, end, today),
    db.getAllAsync<ReserveSummary & { kind: ReserveKind }>(`
      SELECT kind,
        SUM(CASE WHEN direction = 'aporte' THEN cents ELSE -cents END) AS balance,
        SUM(CASE WHEN date >= ? AND date < ? AND direction = 'aporte' THEN cents ELSE 0 END) AS deposits,
        SUM(CASE WHEN date >= ? AND date < ? AND direction = 'retirada' THEN cents ELSE 0 END) AS withdrawals
      FROM reserve_movements WHERE date <= ? GROUP BY kind
    `, start, end, start, end, today),
    readFavorites(db),
    readSavingsGoals(db, today),
    readGoalMovementLinks(db, { start, end, today }),
    readInvoiceFinancings(db),
    readInvoicePayments(db, { start, end }),
    readInvoiceBalances(db),
  ]);
  const reserves: Record<ReserveKind, ReserveSummary> = {
    economia: { balance: 0, deposits: 0, withdrawals: 0 },
    investimento: { balance: 0, deposits: 0, withdrawals: 0 },
  };
  for (const { kind, ...summary } of reserveTotals) reserves[kind] = summary;
  const committed = new Map<number, number>();
  for (const { cardId, remainingCents } of invoiceBalances) {
    committed.set(cardId, (committed.get(cardId) ?? 0) + remainingCents);
  }
  const committedCredit = [...committed].map(([cardId, cents]) => ({ cardId, cents: Math.max(0, cents) }));

  return { entries, categories, counters, budgets, cards, committedCredit, reserves, reserveMovements, favorites, goals,
    goalMovementLinks, invoiceFinancings, invoicePayments, invoiceBalances };
}

export type MonthBudgetResult = { month: string; balance: number | null };

export function readBudgetYear(db: SQLiteDatabase, year: number, firstDay: number) {
  const day = pad(firstDay);
  return db.getAllAsync<MonthBudgetResult>(`
    WITH RECURSIVE months(start) AS (
      VALUES (?)
      UNION ALL
      SELECT date(start, '+1 month') FROM months WHERE start < ?
    )
    SELECT substr(months.start, 1, 7) AS month,
      budgets.cents - COALESCE(SUM(CASE WHEN link.role='original' THEN 0
        WHEN credit_entries.refundOf IS NULL THEN entries.cents ELSE -entries.cents END), 0)
        - (SELECT COALESCE(SUM(payment.cents),0) FROM credit_invoice_payments AS payment
          WHERE payment.financingPlanId IS NOT NULL AND payment.dueDate >= months.start
            AND payment.dueDate < COALESCE(date(months.start, '+1 month'), '9999-12-32')) AS balance
    FROM months
    LEFT JOIN budgets ON budgets.month = substr(months.start, 1, 7) AND budgets.categoryId = 0
    LEFT JOIN entries ON entries.kind = 'gasto' AND entries.date >= months.start
      AND entries.date < COALESCE(date(months.start, '+1 month'), '9999-12-32')
    LEFT JOIN credit_entries ON credit_entries.entryId = entries.id
    LEFT JOIN credit_invoice_plan_entries AS link ON link.entryId = entries.id
    GROUP BY months.start, budgets.cents
    ORDER BY months.start
  `, year + '-01-' + day, year + '-12-' + day);
}

export async function clearData(db: SQLiteDatabase) {
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM expense_favorites; DELETE FROM savings_goals; DELETE FROM credit_invoice_payments;' +
      'DELETE FROM credit_invoice_plans;' +
      'DELETE FROM credit_entries; DELETE FROM entries; DELETE FROM credit_cards;' +
      'DELETE FROM categories; DELETE FROM counters;' +
      'DELETE FROM budgets; DELETE FROM reserve_movements; DELETE FROM settings;' + seed);
  });
}
