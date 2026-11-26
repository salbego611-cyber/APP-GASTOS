import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, useColorScheme } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { isoDate, pad, periodOf, shiftMonth } from './domain';
import { openStore, readBudgetYear, readData, readSettings } from './db';
import { StartupScreen } from './startup';

const light = {
  bg: '#F4F7F5', card: '#FFFFFF', ink: '#162C25', muted: '#50675D', line: '#DCE7E1',
  brand: '#12664F', soft: '#E3F2E9', danger: '#A33139', dangerBg: '#FCEBEC', warning: '#8C5010',
};
const dark: typeof light = {
  bg: '#101C18', card: '#192A23', ink: '#E9F6EE', muted: '#ADCCC0', line: '#324B40',
  brand: '#8CE5B6', soft: '#203D31', danger: '#FFACAE', dangerBg: '#482B2E', warning: '#FFC487',
};

function useToday() {
  const [today, setToday] = useState(() => isoDate());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function updateToday() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      setToday(isoDate(now));
      clearTimeout(timer);
      timer = setTimeout(updateToday, midnight.getTime() - now.getTime());
    }

    updateToday();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') updateToday();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}

type UndoAction = (database: SQLiteDatabase) => Promise<unknown>;
type Notice = { message: string; undo?: UndoAction; expiresAt: number };

function useModel(db: SQLiteDatabase) {
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof readSettings>>>();
  const [selected, setMonth] = useState<string>();
  const [snapshot, setSnapshot] = useState<{ key: string; data: Awaited<ReturnType<typeof readData>> }>();
  const [notice, setNotice] = useState<Notice>();
  const activeNotice = useRef<Notice | undefined>(undefined);
  const [error, setError] = useState('');
  const [revision, refresh] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const accessDatabase = useCallback(function accessDatabase<T>(action: (database: SQLiteDatabase) => Promise<T>) {
    const operation = queue.current.then(() => action(db));
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [db]);
  const system = useColorScheme();
  const firstDay = settings?.firstDay ?? 1;
  const today = useToday();
  const current = periodOf(today, firstDay);
  const month = selected ?? current;
  const start = month + '-' + pad(firstDay);
  const end = shiftMonth(month, 1) + '-' + pad(firstDay);
  const key = start + end + today;
  const isDark = settings?.theme === 'escuro' || (settings?.theme !== 'claro' && system === 'dark');
  const colors = isDark ? dark : light;
  const getBudgetYear = useCallback((year: number) => accessDatabase(database => readBudgetYear(database, year, firstDay)),
    [accessDatabase, firstDay]);

  useEffect(() => {
    let active = true;
    accessDatabase(readSettings).then(value => { if (active) setSettings(value); })
      .catch(() => { if (active) setError('Não foi possível ler os ajustes.'); });
    return () => { active = false; };
  }, [accessDatabase, revision]);

  useEffect(() => {
    let active = true;
    if (settings) {
      accessDatabase(database => readData(database, start, end, month, today)).then(data => { if (active) setSnapshot({ key, data }); })
        .catch(() => { if (active) setError('Não foi possível carregar os dados.'); });
    }
    return () => { active = false; };
  }, [accessDatabase, start, end, month, today, key, settings, revision]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => {
      if (notice !== activeNotice.current) return;
      activeNotice.current = undefined;
      setNotice(undefined);
    }, Math.max(0, notice.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [notice]);

  function announce(message?: string, undo?: UndoAction) {
    const next = message ? { message, undo, expiresAt: Date.now() + (undo ? 8000 : 3500) } : undefined;
    activeNotice.current = next;
    setNotice(next);
  }

  function mutate(action: (database: SQLiteDatabase) => Promise<unknown>, message?: string): Promise<void>;
  function mutate<T>(action: (database: SQLiteDatabase) => Promise<T>, message: string,
    undo: (database: SQLiteDatabase, result: T) => Promise<unknown>): Promise<void>;
  function mutate<T>(action: (database: SQLiteDatabase) => Promise<T>, message?: string,
    undo?: (database: SQLiteDatabase, result: T) => Promise<unknown>) {
    return accessDatabase(async database => {
      const result = await action(database);
      refresh(value => value + 1);
      if (message || activeNotice.current?.undo) announce(message, undo && (db => undo(db, result)));
    });
  }

  function undoNotice() {
    const previous = activeNotice.current;
    if (!previous?.undo || previous.expiresAt <= Date.now()) return;
    void accessDatabase(async database => {
      if (previous !== activeNotice.current || !previous.undo) return;
      announce();
      try {
        await previous.undo(database);
        refresh(value => value + 1);
        announce('Ação desfeita.');
      } catch {
        announce('Não foi possível desfazer esta ação.');
      }
    });
  }

  return {
    data: snapshot?.key === key ? snapshot.data : undefined,
    settings, month, current, today, start, end, setMonth, getBudgetYear, accessDatabase, mutate, notice, undoNotice, error,
    retry: () => { setError(''); refresh(value => value + 1); },
    colors, isDark,
  };
}

const Context = createContext<ReturnType<typeof useModel> | null>(null);
export function useStore() {
  const model = useContext(Context);
  if (!model) throw new Error('Banco de dados indisponível');
  return model;
}

function Connected({ db, children }: { db: SQLiteDatabase; children: ReactNode }) {
  const model = useModel(db);
  return <Context.Provider value={model}>{children}</Context.Provider>;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [attempt, retry] = useState(0);
  const [db, setDb] = useState<SQLiteDatabase>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    openStore().then(value => { if (active) setDb(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);

  if (db) return <Connected db={db}>{children}</Connected>;
  if (failed) return <StartupScreen issue="Não foi possível abrir o armazenamento local."
    onRetry={() => { setFailed(false); retry(value => value + 1); }} />;
  return <StartupScreen />;
}
