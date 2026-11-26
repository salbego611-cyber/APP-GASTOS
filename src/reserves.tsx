import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { deleteReserveMovement, saveReserveMovement, type ReserveDirection, type ReserveKind, type ReserveMovement } from './db';
import { amountText, brDate, brl, monthLabel, parseDate, parseMoney } from './domain';
import { Confirm, useSubmit } from './forms';
import { setGoalMovementLink, type SavingsGoal } from './goals';
import { SavingsGoalForm, SavingsGoals } from './savings-goals';
import { useStore } from './store';
import { Button, Card, Choices, Copy, Dialog, Field, Icon, type IconName, row, spread } from './ui';

const reserveLabels: Record<ReserveKind, { title: string; balance: string; button: string; icon: IconName }> = {
  economia: { title: 'Economias', balance: 'Total guardado', button: 'Ver economias', icon: 'shield-checkmark-outline' },
  investimento: { title: 'Investimentos', balance: 'Aportes líquidos registrados', button: 'Ver investimentos', icon: 'trending-up-outline' },
};

const directions: { key: ReserveDirection; label: string }[] = [
  { key: 'aporte', label: 'Aporte' }, { key: 'retirada', label: 'Retirada' },
];

type ReserveDialog = { screen: 'history' } |
  { screen: 'form'; movement?: ReserveMovement; goalId?: number } |
  { screen: 'goal'; goal?: SavingsGoal };
const history: ReserveDialog = { screen: 'history' };

export function ReserveCards({ wide }: { wide: boolean }) {
  return <View style={[styles.cards, wide && styles.wide]}>
    <ReserveCard kind="economia" />
    <ReserveCard kind="investimento" />
  </View>;
}

function ReserveCard({ kind }: { kind: ReserveKind }) {
  const { data, colors, month } = useStore();
  const [dialog, setDialog] = useState<ReserveDialog>();
  if (!data) return null;

  const info = reserveLabels[kind];
  const { balance, deposits, withdrawals } = data.reserves[kind];
  const close = () => setDialog(undefined);
  const movements = dialog?.screen === 'history' ? data.reserveMovements.filter(item => item.kind === kind) : [];
  const isSavings = kind === 'economia';
  const linkedGoals = isSavings && movements.length
    ? new Map(data.goalMovementLinks.map(link => [link.movementId, link.goalId])) : undefined;

  return <Card style={styles.card}>
    <View style={row}>
      <View style={[styles.icon, { backgroundColor: colors.soft }]}><Icon name={info.icon} /></View>
      <Copy style={styles.heading}>{info.title}</Copy>
    </View>
    <View>
      <Copy muted>{info.balance}</Copy>
      <Copy style={[styles.balance, { color: balance < 0 ? colors.danger : colors.ink }]}>{brl(balance)}</Copy>
    </View>
    <View style={{ gap: 3 }}>
      <Copy muted style={{ fontSize: 12, fontWeight: '700' }}>No período selecionado</Copy>
      <View style={spread}><Copy muted>Aportes</Copy><Copy style={styles.amount}>{brl(deposits)}</Copy></View>
      <View style={spread}><Copy muted>Retiradas</Copy><Copy style={styles.amount}>{brl(withdrawals)}</Copy></View>
    </View>
    <Button label={info.button} icon="chevron-forward-outline" onPress={() => setDialog(history)} />
    {dialog?.screen === 'history' && <Dialog title={info.title} onClose={close}>
      {isSavings && <SavingsGoals goals={data.goals}
        onCreate={() => setDialog({ screen: 'goal' })} onEdit={goal => setDialog({ screen: 'goal', goal })}
        onDeposit={goalId => setDialog({ screen: 'form', goalId })} />}
      <Copy muted>{monthLabel(month)}</Copy>
      <Button label="Registrar movimentação" icon="add" variant="primary" onPress={() => setDialog({ screen: 'form' })} />
      {!movements.length && <Copy muted>Nenhuma movimentação neste período.</Copy>}
      {movements.map(movement => {
        const goalId = linkedGoals?.get(movement.id);
        const goalName = goalId === undefined ? undefined : data.goals.find(goal => goal.id === goalId)?.name;
        return <MovementRow key={movement.id} movement={movement} goalName={goalName}
          onPress={() => setDialog({ screen: 'form', movement, goalId })} />;
      })}
    </Dialog>}
    {dialog?.screen === 'form' && <MovementForm kind={kind} movement={dialog.movement}
      initialGoalId={dialog.goalId} onClose={() => setDialog(history)} />}
    {dialog?.screen === 'goal' && <SavingsGoalForm goal={dialog.goal} onClose={() => setDialog(history)} />}
  </Card>;
}

function MovementRow({ movement, goalName, onPress }: { movement: ReserveMovement; goalName?: string; onPress: () => void }) {
  const { colors } = useStore();
  const isDeposit = movement.direction === 'aporte';
  const kindLabel = isDeposit ? 'Aporte' : 'Retirada';
  const description = movement.note ? kindLabel + ' · ' + brDate(movement.date) : brDate(movement.date);
  const value = (isDeposit ? '+ ' : '− ') + brl(movement.cents);

  return <Pressable accessibilityRole="button" onPress={onPress}
    style={({ pressed }) => [spread, styles.movement, { borderTopColor: colors.line, opacity: pressed ? 0.75 : 1 }]}>
    <View style={{ flex: 1 }}>
      <Copy style={styles.amount}>{movement.note || kindLabel}</Copy>
      <Copy muted style={{ fontSize: 12 }}>{description}</Copy>
      {goalName && <Copy muted style={{ fontSize: 12 }}>Meta {goalName}</Copy>}
    </View>
    <Copy style={[styles.amount, { color: isDeposit ? colors.brand : colors.danger }]}>{value}</Copy>
    <Icon name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
}

function MovementForm({ kind, movement, initialGoalId = 0, onClose }: {
  kind: ReserveKind; movement?: ReserveMovement; initialGoalId?: number; onClose: () => void;
}) {
  const { data, current, month, start, today, mutate } = useStore();
  const [direction, setDirection] = useState<ReserveDirection>(movement?.direction ?? 'aporte');
  const [amount, setAmount] = useState(movement ? amountText(movement.cents) : '');
  const [date, setDate] = useState(brDate(movement?.date ?? (month === current || start > today ? today : start)));
  const [note, setNote] = useState(movement?.note ?? '');
  const [goalId, setGoalId] = useState(initialGoalId);
  const [deleting, setDeleting] = useState(false);
  const { busy, feedback, setError, submit } = useSubmit();
  const close = () => { if (!busy) onClose(); };
  const goals = kind === 'economia' ? data?.goals ?? [] : [];

  function save() {
    const cents = parseMoney(amount);
    const iso = parseDate(date.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
    if (!cents) return setError('Informe um valor maior que zero.');
    if (!iso) return setError('Informe uma data válida no formato DD/MM/AAAA.');
    if (iso > today) return setError('Escolha a data de hoje ou uma data anterior.');
    const fields = { kind, direction, cents, date: iso, note: note.trim() };
    void submit(() => mutate(db => {
      if (kind === 'investimento') return saveReserveMovement(db, fields, movement?.id);
      return db.withTransactionAsync(async () => {
        const result = await saveReserveMovement(db, fields, movement?.id);
        if (!result.changes) throw new Error('Movimentação indisponível.');
        await setGoalMovementLink(db, movement?.id ?? result.lastInsertRowId, goalId || null);
      });
    }, movement ? 'Movimentação atualizada.' : 'Movimentação registrada.'), onClose);
  }

  if (deleting && movement) return <Confirm title="Excluir movimentação?"
    message="O valor será removido do histórico e dos totais." label="Excluir movimentação"
    onClose={() => setDeleting(false)} action={async () => {
      await mutate(db => deleteReserveMovement(db, movement.id), 'Movimentação excluída.');
      onClose();
    }} />;

  return <Dialog title={movement ? 'Editar movimentação' : 'Nova movimentação'} onClose={close}>
    <Choices items={directions} value={direction} onChange={setDirection} />
    <Field label="Valor (R$)" value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType="decimal-pad" maxLength={17} />
    <Field label="Data (DD/MM/AAAA)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
    <Field label="Descrição (opcional)" value={note} onChangeText={setNote} maxLength={120} />
    {!!goals.length && <View style={{ gap: 6 }}>
      <Copy style={styles.amount}>Meta (opcional)</Copy>
      <Choices items={[{ key: 0, label: 'Sem meta' }, ...goals.map(goal => ({ key: goal.id, label: goal.name }))]}
        value={goalId} onChange={setGoalId} />
    </View>}
    {feedback}
    <Button label="Salvar movimentação" icon="checkmark" variant="primary" disabled={busy} onPress={save} />
    {movement && <Button label="Excluir movimentação" icon="trash-outline" variant="danger" disabled={busy}
      onPress={() => setDeleting(true)} />}
  </Dialog>;
}

const styles = StyleSheet.create({
  cards: { gap: 14, alignItems: 'stretch' },
  wide: { flexDirection: 'row' },
  card: { flex: 1 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800' },
  balance: { fontSize: 23, lineHeight: 30, fontWeight: '900' },
  amount: { fontWeight: '800', flexShrink: 1 },
  movement: { paddingVertical: 10, minHeight: 44, borderTopWidth: 1 },
});
