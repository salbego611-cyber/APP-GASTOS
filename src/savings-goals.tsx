import { useState } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import { amountText, brDate, brl, parseDate, parseMoney } from './domain';
import { Confirm } from './forms';
import { deleteSavingsGoal, saveSavingsGoal, type SavingsGoal, type SavingsGoalProgress } from './goals';
import { useStore } from './store';
import { Button, Copy, Dialog, Field, spread, wrap } from './ui';
import { useSubmit } from './use-submit';

export function SavingsGoals({ goals, onCreate, onEdit, onDeposit }: {
  goals: SavingsGoalProgress[];
  onCreate: () => void;
  onEdit: (goal: SavingsGoal) => void;
  onDeposit: (goalId: number) => void;
}) {
  return <View style={styles.goals}>
    <View style={[spread, { flexWrap: 'wrap' }]}>
      <Copy style={styles.heading}>Metas de economia</Copy>
      <Button label="Nova meta" icon="add" onPress={onCreate} />
    </View>
    {goals.length ? goals.map(goal => <GoalSummary key={goal.id} goal={goal}
      onEdit={() => onEdit(goal)} onDeposit={() => onDeposit(goal.id)} />) :
      <Copy muted>Crie uma meta e acompanhe quanto já guardou para ela.</Copy>}
  </View>;
}

function GoalSummary({ goal, onEdit, onDeposit }: {
  goal: SavingsGoalProgress; onEdit: () => void; onDeposit: () => void;
}) {
  const { colors, today } = useStore();
  const remaining = Math.max(0, goal.targetCents - goal.balance);
  const progress = Math.min(100, Math.max(0, Math.floor(goal.balance * 100 / goal.targetCents)));
  const overdue = goal.deadline !== null && goal.deadline < today && remaining > 0;

  return <View style={[styles.goal, { borderColor: colors.line, backgroundColor: colors.bg }]}>
    <View style={spread}>
      <View style={styles.goalName}>
        <Copy style={styles.heading}>{goal.name}</Copy>
        {goal.deadline && <Copy muted style={overdue ? { color: colors.warning } : undefined}>
          {overdue ? 'Prazo encerrado em ' : 'Prazo até '}{brDate(goal.deadline)}
        </Copy>}
      </View>
      <Button label={'Editar meta ' + goal.name} icon="create-outline" compact onPress={onEdit} />
    </View>
    <View style={spread}>
      <Copy style={[styles.amount, { flex: 1 }]}>{brl(goal.balance)} de {brl(goal.targetCents)}</Copy>
      <Copy style={[styles.amount, { color: colors.brand }]}>{progress}%</Copy>
    </View>
    <View accessibilityRole="progressbar" accessibilityLabel={'Progresso de ' + goal.name}
      accessibilityValue={{ min: 0, max: 100, now: progress }}
      style={[styles.progress, { backgroundColor: colors.line }]}>
      <View style={{ width: (progress + '%') as DimensionValue, height: '100%', backgroundColor: colors.brand }} />
    </View>
    <View style={[wrap, { justifyContent: 'space-between' }]}>
      <Copy muted>{remaining ? 'Faltam ' + brl(remaining) : 'Meta alcançada'}</Copy>
      <Button label="Aportar" icon="add" variant="plain" onPress={onDeposit} />
    </View>
  </View>;
}

export function SavingsGoalForm({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const { mutate } = useStore();
  const [name, setName] = useState(goal?.name ?? '');
  const [amount, setAmount] = useState(goal ? amountText(goal.targetCents) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ? brDate(goal.deadline) : '');
  const [deleting, setDeleting] = useState(false);
  const { busy, feedback, setError, submit } = useSubmit();
  const close = () => { if (!busy) onClose(); };

  function save() {
    const title = name.trim();
    const targetCents = parseMoney(amount);
    const deadlineText = deadline.trim();
    const date = parseDate(deadlineText.replace(/^(\d{2})(\d{2})(\d{4})$/, '$1/$2/$3'));
    if (!title) return setError('Informe um nome para a meta.');
    if (!targetCents) return setError('Informe um valor maior que zero.');
    if (deadlineText && !date) return setError('Informe um prazo válido no formato DD/MM/AAAA.');
    void submit(() => mutate(db => saveSavingsGoal(db, { name: title, targetCents, deadline: date }, goal?.id),
      goal ? 'Meta atualizada.' : 'Meta criada.'), onClose);
  }

  if (deleting && goal) return <Confirm title="Excluir meta?"
    message="O objetivo será excluído. As movimentações continuarão em Economias."
    label="Excluir meta" onClose={() => setDeleting(false)} action={async () => {
      await mutate(db => deleteSavingsGoal(db, goal.id), 'Meta excluída.');
      onClose();
    }} />;

  return <Dialog title={goal ? 'Editar meta' : 'Nova meta'} onClose={close}>
    <Field label="Nome da meta" value={name} onChangeText={setName} maxLength={60} placeholder="Ex. Reserva de emergência" />
    <Field label="Valor da meta (R$)" value={amount} onChangeText={setAmount} maxLength={17}
      keyboardType="decimal-pad" placeholder="0,00" />
    <Field label="Prazo (opcional)" value={deadline} onChangeText={setDeadline} maxLength={10}
      keyboardType="numbers-and-punctuation" placeholder="DD/MM/AAAA" />
    {feedback}
    <Button label="Salvar meta" icon="checkmark" variant="primary" onPress={save} disabled={busy} />
    {goal && <Button label="Excluir meta" icon="trash-outline" variant="danger"
      onPress={() => setDeleting(true)} disabled={busy} />}
  </Dialog>;
}

const styles = StyleSheet.create({
  goals: { gap: 10 },
  goal: { gap: 8, padding: 12, borderWidth: 1, borderRadius: 14 },
  goalName: { flex: 1, minWidth: 0 },
  heading: { fontSize: 16, lineHeight: 21, fontWeight: '800', flexShrink: 1 },
  amount: { fontWeight: '800' },
  progress: { height: 8, borderRadius: 4, overflow: 'hidden' },
});
