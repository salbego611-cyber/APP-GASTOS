import type { SQLiteDatabase } from 'expo-sqlite';
import { CreditOperationError, maxCreditInstallments } from './credit';
import { brDate, isoDate, monthlyDate, parseDate } from './domain';

export type InvoiceFinancing = {
  id: number;
  cardId: number;
  dueDate: string;
  principalCents: number;
  firstDueDate: string;
  installments: number;
  installmentCents: number;
};
export type InvoiceFinancingRole = 'original' | 'installment';
export type InvoiceFinancingLink = { entryId: number; planId: number; role: InvoiceFinancingRole };
export type InvoicePayment = {
  id: number;
  cardId: number;
  dueDate: string;
  paymentDate: string;
  cents: number;
  financingPlanId: number | null;
};
export type InvoiceBalance = {
  cardId: number;
  dueDate: string;
  chargesCents: number;
  legacyPaidCents: number;
  paidCents: number;
  financedPaidCents: number;
  remainingCents: number;
};

type InvoiceFinancingFields = Omit<InvoiceFinancing, 'id' | 'principalCents'>;
type InvoicePaymentFields = Omit<InvoicePayment, 'id' | 'financingPlanId'>;

export const invoiceFinancingSchema = `
  CREATE TABLE IF NOT EXISTS credit_invoice_plans (
    id INTEGER PRIMARY KEY,
    cardId INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
    dueDate TEXT NOT NULL,
    principalCents INTEGER NOT NULL CHECK(typeof(principalCents)='integer' AND principalCents>0),
    firstDueDate TEXT NOT NULL CHECK(firstDueDate>=dueDate),
    installments INTEGER NOT NULL CHECK(typeof(installments)='integer' AND installments BETWEEN 2 AND ${maxCreditInstallments}),
    installmentCents INTEGER NOT NULL CHECK(typeof(installmentCents)='integer' AND installmentCents BETWEEN 1 AND 99999999999),
    UNIQUE(cardId,dueDate)
  );
  CREATE TABLE IF NOT EXISTS credit_invoice_plan_entries (
    entryId INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
    planId INTEGER NOT NULL REFERENCES credit_invoice_plans(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('original','installment'))
  );
  CREATE INDEX IF NOT EXISTS credit_invoice_plan_entries_plan ON credit_invoice_plan_entries(planId);
  CREATE TABLE IF NOT EXISTS credit_invoice_payments (
    id INTEGER PRIMARY KEY,
    cardId INTEGER NOT NULL REFERENCES credit_cards(id) ON DELETE RESTRICT,
    dueDate TEXT NOT NULL,
    paymentDate TEXT NOT NULL,
    cents INTEGER NOT NULL CHECK(typeof(cents)='integer' AND cents BETWEEN 1 AND 99999999999),
    financingPlanId INTEGER REFERENCES credit_invoice_plans(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS credit_invoice_payments_invoice ON credit_invoice_payments(cardId,dueDate);
  CREATE INDEX IF NOT EXISTS credit_invoice_payments_date ON credit_invoice_payments(paymentDate);
`;

export function readInvoiceFinancings(db: SQLiteDatabase) {
  return db.getAllAsync<InvoiceFinancing>(`
    SELECT id,cardId,dueDate,principalCents,firstDueDate,installments,installmentCents
    FROM credit_invoice_plans ORDER BY dueDate DESC,id DESC
  `);
}

function isIsoDate(date: string) {
  return typeof date === 'string' && parseDate(brDate(date)) === date;
}

export function readInvoicePayments(db: SQLiteDatabase, period?: { start: string; end: string }) {
  return db.getAllAsync<InvoicePayment>(`
    SELECT id,cardId,dueDate,paymentDate,cents,financingPlanId FROM credit_invoice_payments
    ${period ? 'WHERE (dueDate>=? AND dueDate<?) OR (paymentDate>=? AND paymentDate<?)' : ''}
    ORDER BY paymentDate DESC,id DESC
  `, ...(period ? [period.start, period.end, period.start, period.end] : []));
}

export function readInvoiceBalances(db: SQLiteDatabase, key?: Pick<InvoiceBalance, 'cardId' | 'dueDate'>) {
  return db.getAllAsync<InvoiceBalance>(`
    WITH debits AS (
      SELECT credit.cardId, e.date AS dueDate, e.confirmed,
        CASE WHEN link.role='original' THEN 0 WHEN credit.refundOf IS NULL THEN e.cents ELSE -e.cents END AS cents
      FROM credit_entries AS credit
      JOIN entries AS e ON e.id=credit.entryId
      LEFT JOIN credit_invoice_plan_entries AS link ON link.entryId=e.id
      ${key ? 'WHERE credit.cardId=? AND e.date=?' : ''}
    ), charges AS (
      SELECT cardId,dueDate,SUM(cents) AS activeCents,
        SUM(CASE WHEN confirmed=1 THEN cents ELSE 0 END) AS legacyPaidCents
      FROM debits GROUP BY cardId,dueDate
    ), payments AS (
      SELECT cardId,dueDate,SUM(cents) AS paidCents,
        SUM(CASE WHEN financingPlanId IS NOT NULL THEN cents ELSE 0 END) AS financedPaidCents
      FROM credit_invoice_payments
      ${key ? 'WHERE cardId=? AND dueDate=?' : ''}
      GROUP BY cardId,dueDate
    ), invoices AS (
      SELECT cardId,dueDate FROM charges
      UNION SELECT cardId,dueDate FROM payments
    )
    SELECT invoices.cardId,invoices.dueDate,
      COALESCE(charges.activeCents,0) + COALESCE(payments.financedPaidCents,0) AS chargesCents,
      COALESCE(charges.legacyPaidCents,0) AS legacyPaidCents,
      COALESCE(payments.paidCents,0) AS paidCents,
      COALESCE(payments.financedPaidCents,0) AS financedPaidCents,
      COALESCE(charges.activeCents,0) + COALESCE(payments.financedPaidCents,0) -
        COALESCE(charges.legacyPaidCents,0) - COALESCE(payments.paidCents,0) AS remainingCents
    FROM invoices
    LEFT JOIN charges USING (cardId,dueDate)
    LEFT JOIN payments USING (cardId,dueDate)
    ORDER BY invoices.dueDate,invoices.cardId
  `, ...(key ? [key.cardId, key.dueDate, key.cardId, key.dueDate] : []));
}

export async function saveCreditInvoicePayment(db: SQLiteDatabase, fields: InvoicePaymentFields): Promise<InvoicePayment> {
  const { cardId, dueDate, paymentDate, cents } = fields;
  if (!Number.isSafeInteger(cardId) || cardId < 1 || !isIsoDate(dueDate)) {
    throw new CreditOperationError('Selecione uma fatura válida.');
  }
  if (!isIsoDate(paymentDate) || paymentDate > isoDate()) {
    throw new CreditOperationError('Informe uma data de pagamento válida até hoje.');
  }
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99999999999) {
    throw new CreditOperationError('Informe um valor de pagamento maior que zero.');
  }
  let id = 0;
  await db.withTransactionAsync(async () => {
    const [balance] = await readInvoiceBalances(db, { cardId, dueDate });
    if (!balance || balance.remainingCents <= 0) throw new CreditOperationError('A fatura não tem saldo pendente.');
    if (cents > balance.remainingCents) throw new CreditOperationError('O pagamento deve caber no saldo pendente da fatura.');
    const result = await db.runAsync(`
      INSERT INTO credit_invoice_payments (cardId,dueDate,paymentDate,cents) VALUES (?,?,?,?)
    `, cardId, dueDate, paymentDate, cents);
    id = result.lastInsertRowId;
  });
  return { id, cardId, dueDate, paymentDate, cents, financingPlanId: null };
}

export async function deleteCreditInvoicePayment(db: SQLiteDatabase, id: number) {
  const result = await db.runAsync('DELETE FROM credit_invoice_payments WHERE id=? AND financingPlanId IS NULL', id);
  if (!result.changes) throw new CreditOperationError('Desfaça o parcelamento para excluir um pagamento vinculado.');
  return result;
}

export async function saveInvoiceFinancing(db: SQLiteDatabase, fields: InvoiceFinancingFields) {
  const { cardId, dueDate, firstDueDate, installments, installmentCents } = fields;
  if (!Number.isSafeInteger(cardId) || cardId < 1 || !isIsoDate(dueDate)) {
    throw new CreditOperationError('Selecione uma fatura válida.');
  }
  if (!Number.isInteger(installments) || installments < 2 || installments > maxCreditInstallments) {
    throw new CreditOperationError('Escolha de 2 a ' + maxCreditInstallments + ' parcelas.');
  }
  if (!Number.isSafeInteger(installmentCents) || installmentCents < 1 || installmentCents > 99999999999) {
    throw new CreditOperationError('Informe um valor maior que zero para cada parcela.');
  }
  if (!isIsoDate(firstDueDate) || firstDueDate < dueDate) {
    throw new CreditOperationError('Escolha o primeiro vencimento na data da fatura ou depois dela.');
  }
  const dates = Array.from({ length: installments }, (_, index) => monthlyDate(firstDueDate, index));
  if (!dates.every(isIsoDate)) throw new CreditOperationError('Confira a data da última parcela.');

  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ id: number }>(`
      SELECT id FROM credit_invoice_plans WHERE cardId=? AND dueDate=?
    `, cardId, dueDate);
    if (existing) throw new CreditOperationError('Essa fatura já tem um parcelamento registrado.');

    const pending = await db.getAllAsync<{ id: number; role: InvoiceFinancingRole | null }>(`
      SELECT e.id, linked.role
      FROM credit_entries AS credit
      JOIN entries AS e ON e.id=credit.entryId
      LEFT JOIN credit_invoice_plan_entries AS linked ON linked.entryId=e.id
      WHERE credit.cardId=? AND e.date=? AND e.kind='gasto' AND e.confirmed=0
      ORDER BY e.id
    `, cardId, dueDate);
    if (pending.some(item => item.role === 'installment')) {
      throw new CreditOperationError('Essa fatura inclui parcelas de um parcelamento anterior.');
    }

    const originals = pending.filter(item => item.role === null);
    const [balance] = await readInvoiceBalances(db, { cardId, dueDate });
    const principalCents = balance?.remainingCents ?? 0;
    if (!Number.isSafeInteger(principalCents) || principalCents <= 0) {
      throw new CreditOperationError('A fatura precisa ter saldo pendente maior que zero.');
    }
    const category = await db.getFirstAsync<{ id: number }>(`
      SELECT id FROM categories WHERE kind IN ('gasto','ambos')
      ORDER BY CASE WHEN name='Contas' COLLATE NOCASE THEN 0 ELSE 1 END, id LIMIT 1
    `);
    if (!category) throw new CreditOperationError('Cadastre uma categoria de gasto para registrar o parcelamento.');

    const plan = await db.runAsync(`
      INSERT INTO credit_invoice_plans (cardId,dueDate,principalCents,firstDueDate,installments,installmentCents)
      VALUES (?,?,?,?,?,?)
    `, cardId, dueDate, principalCents, firstDueDate, installments, installmentCents);
    await db.runAsync(`
      UPDATE credit_invoice_payments SET financingPlanId=? WHERE cardId=? AND dueDate=?
    `, plan.lastInsertRowId, cardId, dueDate);
    for (const original of originals) {
      await db.runAsync(`
        INSERT INTO credit_invoice_plan_entries (entryId,planId,role) VALUES (?,?,'original')
      `, original.id, plan.lastInsertRowId);
    }
    for (const [index, date] of dates.entries()) {
      const entry = await db.runAsync(`
        INSERT INTO entries (kind,cents,categoryId,date,note,payment,confirmed,seriesId)
        VALUES ('gasto',?,?,?,'Parcelamento da fatura','Crédito',0,NULL)
      `, installmentCents, category.id, date);
      await db.runAsync(`
        INSERT INTO credit_entries (entryId,cardId,purchaseDate,closingDate,installmentNumber,installmentTotal)
        VALUES (?,?,?,?,?,?)
      `, entry.lastInsertRowId, cardId, dueDate, date, index + 1, installments);
      await db.runAsync(`
        INSERT INTO credit_invoice_plan_entries (entryId,planId,role) VALUES (?,?,'installment')
      `, entry.lastInsertRowId, plan.lastInsertRowId);
    }
  });
}

export async function undoInvoiceFinancing(db: SQLiteDatabase, planId: number) {
  if (!Number.isSafeInteger(planId) || planId < 1) throw new CreditOperationError('Parcelamento indisponível.');

  await db.withTransactionAsync(async () => {
    const paid = await db.getFirstAsync<{ id: number }>(`
      SELECT e.id FROM credit_invoice_plan_entries AS linked
      JOIN entries AS e ON e.id=linked.entryId
      JOIN credit_entries AS credit ON credit.entryId=e.id
      WHERE linked.planId=? AND linked.role='installment' AND (e.confirmed=1 OR EXISTS (
        SELECT 1 FROM credit_invoice_payments AS payment
        WHERE payment.cardId=credit.cardId AND payment.dueDate=e.date
          AND (payment.financingPlanId IS NULL OR payment.financingPlanId != linked.planId)
      )) LIMIT 1
    `, planId);
    if (paid) throw new CreditOperationError('Revise os pagamentos das parcelas antes de desfazer o parcelamento.');

    await db.runAsync(`
      DELETE FROM entries WHERE id IN (
        SELECT entryId FROM credit_invoice_plan_entries WHERE planId=? AND role='installment'
      )
    `, planId);
    const result = await db.runAsync('DELETE FROM credit_invoice_plans WHERE id=?', planId);
    if (!result.changes) throw new CreditOperationError('Parcelamento indisponível.');
  });
}
