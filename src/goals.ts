import type { SQLiteDatabase } from 'expo-sqlite';
import { brDate, parseDate } from './domain';

export type SavingsGoal = { id: number; name: string; targetCents: number; deadline: string | null };
export type SavingsGoalProgress = SavingsGoal & { balance: number };
export type GoalMovementLink = { movementId: number; goalId: number };
type SavingsGoalFields = Omit<SavingsGoal, 'id'>;

export const goalsSchema = `
  CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
    targetCents INTEGER NOT NULL CHECK(typeof(targetCents) = 'integer' AND targetCents BETWEEN 1 AND 99999999999),
    deadline TEXT
  );
  CREATE TABLE IF NOT EXISTS reserve_goal_movements (
    movementId INTEGER PRIMARY KEY REFERENCES reserve_movements(id) ON DELETE CASCADE,
    goalId INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS reserve_goal_movements_goal ON reserve_goal_movements(goalId);
`;

export function isSavingsGoalFields(value: unknown): value is SavingsGoalFields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { name, targetCents, deadline } = value as Record<string, unknown>;
  return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 60 &&
    typeof targetCents === 'number' && Number.isSafeInteger(targetCents) &&
    targetCents >= 1 && targetCents <= 99999999999 &&
    (deadline === null || (typeof deadline === 'string' && parseDate(brDate(deadline)) === deadline));
}

export function readSavingsGoals(db: SQLiteDatabase, today: string) {
  return db.getAllAsync<SavingsGoalProgress>(`
    SELECT goal.id, goal.name, goal.targetCents, goal.deadline,
      COALESCE(SUM(CASE movement.direction WHEN 'aporte' THEN movement.cents ELSE -movement.cents END), 0) AS balance
    FROM savings_goals AS goal
    LEFT JOIN reserve_goal_movements AS link ON link.goalId = goal.id
    LEFT JOIN reserve_movements AS movement ON movement.id = link.movementId
      AND movement.kind = 'economia' AND movement.date <= ?
    GROUP BY goal.id
    ORDER BY goal.id DESC
  `, today);
}

export function readGoalMovementLinks(db: SQLiteDatabase, period?: { start: string; end: string; today: string }) {
  if (!period) {
    return db.getAllAsync<GoalMovementLink>('SELECT movementId, goalId FROM reserve_goal_movements ORDER BY movementId');
  }
  return db.getAllAsync<GoalMovementLink>(`
    SELECT link.movementId, link.goalId
    FROM reserve_goal_movements AS link
    JOIN reserve_movements AS movement ON movement.id = link.movementId
    WHERE movement.kind = 'economia' AND movement.date >= ? AND movement.date < ? AND movement.date <= ?
  `, period.start, period.end, period.today);
}

export function saveSavingsGoal(db: SQLiteDatabase, goal: SavingsGoalFields, id?: number) {
  if (!isSavingsGoalFields(goal)) throw new Error('Meta de economia inválida.');
  const values = [goal.name.trim(), goal.targetCents, goal.deadline] as const;
  if (id !== undefined) {
    return db.runAsync('UPDATE savings_goals SET name=?,targetCents=?,deadline=? WHERE id=?', ...values, id);
  }
  return db.runAsync('INSERT INTO savings_goals (name,targetCents,deadline) VALUES (?,?,?)', ...values);
}

export function deleteSavingsGoal(db: SQLiteDatabase, id: number) {
  return db.runAsync('DELETE FROM savings_goals WHERE id=?', id);
}

export async function setGoalMovementLink(db: SQLiteDatabase, movementId: number, goalId: number | null) {
  if (goalId === null) {
    return db.runAsync('DELETE FROM reserve_goal_movements WHERE movementId=?', movementId);
  }
  const result = await db.runAsync(`
    INSERT INTO reserve_goal_movements (movementId, goalId)
    SELECT id, ? FROM reserve_movements WHERE id=? AND kind='economia'
    ON CONFLICT(movementId) DO UPDATE SET goalId=excluded.goalId
  `, goalId, movementId);
  if (!result.changes) throw new Error('A movimentação precisa ser de Economias.');
  return result;
}
