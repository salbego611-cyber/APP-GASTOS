import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { CreditOperationError } from './credit';
import { useStore } from './store';

export function useSubmit() {
  const { colors } = useStore();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function submit(action: () => Promise<unknown>, after?: () => void) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      after?.();
    } catch (problem) {
      setError(problem instanceof CreditOperationError ? problem.message : 'Não foi possível salvar a alteração. Tente novamente.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const feedback = error ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text> : null;
  return { busy, setError, submit, feedback };
}
