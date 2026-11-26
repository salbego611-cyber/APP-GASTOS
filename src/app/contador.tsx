import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { integer, type Counter } from '../domain';
import { Confirm, useSubmit } from '../forms';
import { useStore } from '../store';
import { Button, Card, Copy, Dialog, Empty, Field, Icon, Page, row, spread, wrap } from '../ui';

type Count = Pick<Counter, 'value' | 'previous'>;
type Operation = 1 | -1 | 'undo' | 'reset';

function project(count: Count, operation: Operation): Count {
  if (operation === 'reset') return { value: 0, previous: null };
  if (operation === 'undo') return { value: count.previous ?? count.value, previous: null };
  return { value: count.value + operation, previous: count.value };
}

function CounterCard({ counter, onRename, onDelete }: { counter: Counter; onRename: () => void; onDelete: () => void }) {
  const { colors, isDark, mutate } = useStore();
  const initial = { value: counter.value, previous: counter.previous };
  const [saved, setSaved] = useState(initial);
  const [pending, setPending] = useState<{ id: number; operation: Operation }[]>([]);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(false);
  const nextId = useRef(0);
  const count = pending.reduce((value, item) => project(value, item.operation), saved);

  async function change(operation: Operation) {
    const id = ++nextId.current;
    setError('');
    setPending(items => [...items, { id, operation }]);
    try {
      await mutate(async db => {
        const update = operation === 'reset' ? 'value=0,previous=NULL'
          : operation === 'undo' ? 'value=COALESCE(previous,value),previous=NULL' : 'value=value+?,previous=value';
        const result = await db.getFirstAsync<Count>('UPDATE counters SET ' + update + ' WHERE id=? RETURNING value,previous',
          typeof operation === 'number' ? [operation, counter.id] : [counter.id]);
        if (!result) throw new Error('Contador removido.');
        setSaved(result);
        setPending(items => items.filter(item => item.id !== id));
      }, operation === 'reset' ? 'Contador zerado.' : undefined);
      return true;
    } catch {
      setError('Não foi possível atualizar a contagem.');
      setPending(items => items.filter(item => item.id !== id));
      return false;
    }
  }

  return <Card style={{ flex: 1 }}>
    <View style={spread}>
      <View style={[row, { flex: 1 }]}>
        <Icon name="calculator-outline" />
        <Copy style={{ fontSize: 18, fontWeight: '800', lineHeight: 24, flexShrink: 1 }}>{counter.name}</Copy>
      </View>
      <Button compact label={'Renomear ' + counter.name} icon="create-outline" onPress={onRename} />
      <Button compact label={'Excluir ' + counter.name} icon="trash-outline" variant="danger" onPress={onDelete} />
    </View>
    <Copy style={{ textAlign: 'center', fontSize: 54, lineHeight: 66, fontWeight: '900', fontVariant: ['tabular-nums'] }}>
      {integer.format(count.value)}
    </Copy>
    <View style={row}>
      {([-1, 1] as const).map(operation => <Pressable key={operation}
        accessibilityRole="button" accessibilityLabel={operation === 1 ? 'Aumentar' : 'Diminuir'}
        onPress={() => void change(operation)} style={({ pressed }) => ({
          alignItems: 'center', justifyContent: 'center', flex: 1, height: 62, borderRadius: 16,
          opacity: pressed ? 0.74 : 1, backgroundColor: operation === 1 ? colors.brand : colors.soft,
        })}>
        <Icon name={operation === 1 ? 'add' : 'remove'} size={32}
          color={operation === 1 ? (isDark ? '#112820' : '#FFFFFF') : colors.brand} />
      </Pressable>)}
    </View>
    <View style={wrap}>
      <Button label="Desfazer" variant="plain" icon="arrow-undo-outline" disabled={count.previous === null} onPress={() => void change('undo')} grow />
      <Button label="Zerar" variant="plain" icon="refresh-outline" disabled={count.value === 0 && count.previous === null} onPress={() => setReset(true)} grow />
    </View>
    {!!error && <Copy style={{ color: colors.danger }}>{error}</Copy>}
    {reset && <Confirm title="Zerar contador?" message={'A contagem de “' + counter.name + '” voltará para zero.'}
      label="Zerar contador" onClose={() => setReset(false)} action={async () => {
        if (!await change('reset')) throw new Error('Falha ao zerar.');
      }} />}
  </Card>;
}

export default function PocketCounter() {
  const { data, mutate } = useStore();
  const { width } = useWindowDimensions();
  const [dialog, setDialog] = useState<{ type: 'new' } | { type: 'rename' | 'delete'; counter: Counter }>();
  const [name, setName] = useState('');
  const state = useSubmit();
  const close = () => setDialog(undefined);
  const counters = data?.counters ?? [];

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return state.setError('Informe um nome para o contador.');
    const editing = dialog?.type === 'rename' ? dialog.counter : undefined;
    void state.submit(() => mutate(db => editing
      ? db.runAsync('UPDATE counters SET name=? WHERE id=?', trimmed, editing.id)
      : db.runAsync('INSERT INTO counters (name) VALUES (?)', trimmed),
    editing ? 'Contador renomeado.' : 'Contador criado.'), close);
  }

  return <Page title="Contador de bolso" subtitle="Conte itens, voltas ou ocorrências com um toque."
    action={<Button label="Novo contador" variant="primary" icon="add" disabled={!data}
      onPress={() => { setName(''); state.setError(''); setDialog({ type: 'new' }); }} />}>
    {!!data && (counters.length ? <View style={{ flexDirection: width >= 760 ? 'row' : 'column', flexWrap: 'wrap', gap: 14 }}>
      {counters.map(counter => <View key={counter.id} style={{ width: width >= 760 ? '48%' : '100%' }}>
        <CounterCard counter={counter} onRename={() => {
          setName(counter.name); state.setError(''); setDialog({ type: 'rename', counter });
        }} onDelete={() => setDialog({ type: 'delete', counter })} />
      </View>)}
    </View> : <Card><Empty title="Nenhum contador criado" icon="calculator-outline"
      detail="Crie um contador, dê um nome a ele e comece a contar." /></Card>)}
    {dialog && dialog.type !== 'delete' && <Dialog title={dialog.type === 'new' ? 'Novo contador' : 'Renomear contador'}
      onClose={() => { if (!state.busy) close(); }}>
      <Field label="Nome do contador" placeholder="Ex.: Voltas" value={name} onChangeText={setName} autoFocus maxLength={45} onSubmitEditing={save} />
      {state.feedback}
      <Button label="Salvar contador" variant="primary" onPress={save} disabled={state.busy} />
    </Dialog>}
    {dialog?.type === 'delete' && <Confirm title="Excluir contador?" message={'“' + dialog.counter.name + '” e sua contagem serão apagados.'}
      label="Excluir contador" onClose={close} action={() => mutate(db => db.runAsync(
        'DELETE FROM counters WHERE id=?', dialog.counter.id), 'Contador excluído.')} />}
  </Page>;
}
