import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { pickBackupFile, writeBackupFile } from './backup-file';
import {
  backupReminderTime, readBackupStatus, recordBackupExport, saveBackupReminderPreference, type BackupStatus,
} from './backup-status';
import { parseBackup, readBackup, restoreBackup, type Backup } from './backup';
import { billRemindersAvailable, requestBackupReminderPermission, syncBackupReminder } from './bill-reminders';
import { isoDate } from './domain';
import { Confirm } from './forms';
import { useStore } from './store';
import { Button, Copy, wrap } from './ui';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const permissionMessage = 'Permita as notificações do Bolso em Dia nos ajustes do aparelho.';

async function reminderFeedback(status: BackupStatus) {
  if (!billRemindersAvailable) return '';
  try {
    return await syncBackupReminder(backupReminderTime(status)) ? '' : permissionMessage;
  } catch {
    return 'Não foi possível atualizar o lembrete de backup no aparelho.';
  }
}

export function BackupActions({ disabled }: { disabled?: boolean }) {
  const { accessDatabase, colors, mutate, setMonth, today } = useStore();
  const [pending, setPending] = useState<{ name: string; backup: Backup }>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [status, setStatus] = useState<BackupStatus>();
  const [reminderIssue, setReminderIssue] = useState('');
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    readBackupStatus().then(async value => {
      if (!active) return;
      setStatus(value);
      if (running.current) return;
      const issue = await reminderFeedback(value);
      if (active && !running.current) setReminderIssue(issue);
    }).catch(() => {
      if (active && !running.current) setReminderIssue('Não foi possível consultar a data da última exportação.');
    });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<void>, failure: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      await action();
    } catch {
      setFeedback({ text: failure, error: true });
    } finally {
      setBusy(false);
      running.current = false;
    }
  }

  function exportFile() {
    void run(async () => {
      const backup = await accessDatabase(readBackup);
      const stamp = backup.exportedAt.replace(/[:.]/g, '-');
      if (!await writeBackupFile('bolso-em-dia-backup-' + stamp + '.json', JSON.stringify(backup))) return;

      setFeedback({ text: billRemindersAvailable ? 'Backup exportado.' : 'Download do backup iniciado.' });
      try {
        await recordBackupExport();
        const value = await readBackupStatus();
        setStatus(value);
        setReminderIssue(await reminderFeedback(value));
      } catch {
        setReminderIssue('Não foi possível registrar a data da exportação neste aparelho.');
      }
    }, 'Não foi possível exportar o backup.');
  }

  function chooseFile() {
    void run(async () => {
      const file = await pickBackupFile();
      if (!file) return;

      const backup = parseBackup(file.contents);
      if (backup) setPending({ name: file.name, backup });
      else setFeedback({ text: 'Arquivo inválido ou incompatível. Escolha um backup do Bolso em Dia.', error: true });
    }, 'Não foi possível ler o arquivo de backup.');
  }

  function toggleReminder() {
    if (!status) return;
    void run(async () => {
      setReminderIssue('');
      const enable = status.reminderEnabledAt === undefined;
      if (enable && !await requestBackupReminderPermission()) {
        setReminderIssue(permissionMessage);
        return;
      }
      await saveBackupReminderPreference(enable);
      const value = await readBackupStatus();
      setStatus(value);
      setReminderIssue(await reminderFeedback(value));
    }, 'Não foi possível alterar o lembrete de backup.');
  }

  const nextReminder = status && backupReminderTime(status);

  return <>
    {status && <Copy muted>{status.lastExportAt
      ? (billRemindersAvailable ? 'Último backup exportado em ' : 'Último download iniciado em ') + dateFormat.format(status.lastExportAt)
      : 'Nenhum backup exportado neste aparelho.'}</Copy>}
    <View style={wrap}>
      <Button label="Exportar backup" icon="download-outline" onPress={exportFile} disabled={disabled || busy} grow />
      <Button label="Restaurar backup" icon="folder-open-outline" onPress={chooseFile} disabled={disabled || busy} grow />
    </View>
    {feedback && <Text accessibilityLiveRegion="polite" style={{ color: feedback.error ? colors.danger : colors.brand }}>
      {feedback.text}
    </Text>}
    {billRemindersAvailable && <>
      <Copy muted>{nextReminder
        ? isoDate(new Date(nextReminder)) >= today ? 'Lembrete previsto para ' + dateFormat.format(nextReminder) + '.'
          : 'Já se passaram 30 dias. Você pode exportar um novo backup.'
        : 'Receba um aviso após 30 dias sem exportar um backup.'}</Copy>
      <View style={wrap}>
        <Button label={status?.reminderEnabledAt ? 'Desativar lembrete de backup' : 'Ativar lembrete de backup'}
          icon={status?.reminderEnabledAt ? 'notifications-off-outline' : 'notifications-outline'}
          onPress={toggleReminder} disabled={disabled || busy || !status} />
      </View>
    </>}
    {!!reminderIssue && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>{reminderIssue}</Text>}
    {pending && <Confirm title="Restaurar backup?"
      message="Os dados locais serão substituídos pelos dados do arquivo, incluindo lançamentos, cartões, economias, investimentos, favoritos e metas."
      label="Substituir dados locais" onClose={() => setPending(undefined)}
      action={async () => {
        await mutate(db => restoreBackup(db, pending.backup), 'Backup restaurado.');
        setMonth(undefined);
      }}>
      <Copy muted>Arquivo {pending.name}</Copy>
    </Confirm>}
  </>;
}
