import type { SQLiteDatabase } from 'expo-sqlite';
import { payments } from './domain';

export type Favorite = { id: number; name: string; categoryId: number; payment: string; note: string };
export type FavoriteFields = Omit<Favorite, 'id'>;
export const favoriteNameLimit = 40;

export function initFavorites(db: SQLiteDatabase) {
  return db.execAsync(`
    CREATE TABLE IF NOT EXISTS expense_favorites (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      nameKey TEXT NOT NULL UNIQUE,
      categoryId INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      payment TEXT NOT NULL,
      note TEXT NOT NULL
    );
  `);
}

export function readFavorites(db: SQLiteDatabase) {
  return db.getAllAsync<Favorite>(
    'SELECT id,name,categoryId,payment,note FROM expense_favorites ORDER BY name COLLATE NOCASE,id',
  );
}

export function favoriteKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('pt-BR');
}

export function isFavoriteFields(value: unknown): value is FavoriteFields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { name, categoryId, payment, note } = value as Record<string, unknown>;
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= favoriteNameLimit &&
    typeof categoryId === 'number' && Number.isSafeInteger(categoryId) && categoryId > 0 &&
    typeof payment === 'string' && (payment === '' || payments.includes(payment)) &&
    typeof note === 'string' && note.length <= 120;
}

export async function saveFavorite(db: SQLiteDatabase, favorite: FavoriteFields, id?: number) {
  if (!isFavoriteFields(favorite)) throw new Error('Confira os dados do favorito.');
  const category = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM categories WHERE id=? AND kind IN ('gasto','ambos')", favorite.categoryId,
  );
  if (!category) throw new Error('Selecione uma categoria de gasto.');
  const values = [
    favorite.name.trim(), favoriteKey(favorite.name), favorite.categoryId, favorite.payment, favorite.note.trim(),
  ] as const;
  if (id !== undefined) {
    return db.runAsync('UPDATE expense_favorites SET name=?,nameKey=?,categoryId=?,payment=?,note=? WHERE id=?', ...values, id);
  }
  return db.runAsync('INSERT INTO expense_favorites (name,nameKey,categoryId,payment,note) VALUES (?,?,?,?,?)', ...values);
}

export function deleteFavorite(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM expense_favorites WHERE id=?', id);
}
