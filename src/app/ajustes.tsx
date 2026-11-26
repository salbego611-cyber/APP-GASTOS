import { useState } from 'react';
import { router } from 'expo-router';
import { BackupActions } from '../backup-actions';
import { clearData } from '../db';
import type { Theme } from '../domain';
import { Confirm, useSubmit } from '../forms';
import { useStore } from '../store';
import { Button, Choices, Copy, Dialog, Field, Page, Section } from '../ui';

export default function Settings() {
  const { settings, setMonth, mutate } = useStore();
  const [dialog, setDialog] = useState<'day' | 'clear'>();
  const [day, setDay] = useState('');
  const state = useSubmit();
  const close = () => setDialog(undefined);
  function setting(key: string, value: string, notice: string) {
    return mutate(db => db.runAsync(
      'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      key, value), notice);
  }

  function saveDay() {
    const number = Number(day.trim());
    if (!/^\d{1,2}$/.test(day.trim()) || number < 1 || number > 28) {
      return state.setError('Escolha um dia de 1 a 28.');
    }
    void state.submit(() => setting('firstDay', String(number), 'Início do período atualizado.'), () => {
      setMonth(undefined);
      close();
    });
  }

  return <Page title="Ajustes" subtitle="Personalize o app e gerencie os dados do aparelho.">
    {settings && <>
      <Section title="Perfil financeiro">
        <Copy muted>Veja quanto da sua renda foi gasto no período e quais categorias mais pesaram.</Copy>
        <Button label="Abrir perfil" icon="person-circle-outline" onPress={() => router.navigate('/perfil')} />
      </Section>
      <Section title="Aparência">
        <Choices<Theme> items={[{ key: 'sistema', label: 'Sistema' }, { key: 'claro', label: 'Claro' }, { key: 'escuro', label: 'Escuro' }]}
          value={settings.theme} onChange={value => {
            void state.submit(() => setting('theme', value, 'Tema atualizado.'));
          }} />
        {!dialog && state.feedback}
      </Section>
      <Section title="Período financeiro">
        <Copy muted>O período começa no dia {settings.firstDay} de cada mês. Alterar o dia recalcula todos os períodos pelas datas dos lançamentos.</Copy>
        <Button label="Alterar dia de início" icon="calendar-outline" onPress={() => {
          setDay(String(settings.firstDay)); state.setError(''); setDialog('day');
        }} disabled={state.busy} />
      </Section>
      <Section title="Cartões de crédito">
        <Copy muted>Configure o fechamento e o vencimento dos cartões e acompanhe suas faturas.</Copy>
        <Button label="Gerenciar cartões e faturas" icon="card-outline" onPress={() => router.navigate('/cartoes')} />
      </Section>
      <Section title="Backup">
        <BackupActions disabled={state.busy} />
      </Section>
      <Section title="Dados locais">
        <Copy muted>Seus lançamentos, orçamentos, contadores, cartões, economias e investimentos ficam no aparelho.</Copy>
        <Button label="Apagar todos os dados" icon="trash-outline" variant="danger" onPress={() => setDialog('clear')} disabled={state.busy} />
      </Section>
    </>}
    {dialog === 'day' && <Dialog title="Dia de início do período" onClose={() => { if (!state.busy) close(); }}>
      <Copy muted>Escolha um dia de 1 a 28 para manter a mesma data de início em todos os meses.</Copy>
      <Field label="Dia do mês" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} />
      {state.feedback}
      <Button label="Salvar dia" variant="primary" onPress={saveDay} disabled={state.busy} />
    </Dialog>}
    {dialog === 'clear' && <Confirm title="Apagar todos os dados?"
      message="Lançamentos, categorias, orçamentos, contadores, cartões, economias, investimentos, favoritos, metas e ajustes serão apagados deste aparelho. Essa ação é permanente."
      label="Apagar definitivamente" onClose={close}
      action={async () => {
        await mutate(clearData, 'Dados apagados.');
        setMonth(undefined);
      }} />}
  </Page>;
}
