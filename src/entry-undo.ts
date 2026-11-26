import type { SQLiteDatabase } from 'expo-sqlite';
import type { CreditEntry } from './credit';
import { deleteEntry } from './db';
import type { Entry } from './domain';

type EntrySnapshot = {
  entry: Omit<Entry, 'credit'>;
  credit: (Omit<CreditEntry, 'refundOf' | 'financing'> & { refundOf: number | null }) | null;
};

export async function deleteEntryWithUndo(db: SQLiteDatabase, id: number): Promise<EntrySnapshot> {
  const entry = await db.getFirstAsync<EntrySnapshot['entry']>('SELECT * FROM entries WHERE id=?', id);
  if (!entry) throw new Error('Lançamento indisponível.');
  const credit = await db.getFirstAsync<NonNullable<EntrySnapshot['credit']>>(
    'SELECT cardId,purchaseDate,closingDate,installmentNumber,installmentTotal,refundOf FROM credit_entries WHERE entryId=?', id);
  // The store serializes this read and delete with all other writes.
  await deleteEntry(db, id);
  return { entry, credit };
}

export function restoreDeletedEntry(db: SQLiteDatabase, { entry, credit }: EntrySnapshot) {
  return db.withTransactionAsync(async () => {
    await db.runAsync(`
      INSERT INTO entries (id,kind,cents,categoryId,date,note,payment,confirmed,seriesId) VALUES (?,?,?,?,?,?,?,?,?)
    `, entry.id, entry.kind, entry.cents, entry.categoryId, entry.date, entry.note, entry.payment, entry.confirmed, entry.seriesId);
    if (credit) {
      await db.runAsync(`
        INSERT INTO credit_entries (entryId,cardId,purchaseDate,closingDate,installmentNumber,installmentTotal,refundOf)
        VALUES (?,?,?,?,?,?,?)
      `, entry.id, credit.cardId, credit.purchaseDate, credit.closingDate, credit.installmentNumber, credit.installmentTotal, credit.refundOf);
    }
  });
}
