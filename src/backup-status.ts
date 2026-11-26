import Storage from 'expo-sqlite/kv-store';

const lastExportKey = 'last-backup-export';
const reminderKey = 'backup-reminder-enabled-at';

export type BackupStatus = { lastExportAt?: number; reminderEnabledAt?: number };

function timestamp(value: string | null) {
  if (!value) return undefined;
  const time = Number(value);
  return time > 0 && Number.isFinite(new Date(time).getTime()) ? time : undefined;
}

export async function readBackupStatus(): Promise<BackupStatus> {
  const [lastExportAt, reminderEnabledAt] = await Promise.all([
    Storage.getItem(lastExportKey), Storage.getItem(reminderKey),
  ]);
  return { lastExportAt: timestamp(lastExportAt), reminderEnabledAt: timestamp(reminderEnabledAt) };
}

export function recordBackupExport() {
  return Storage.setItem(lastExportKey, String(Date.now()));
}

export function saveBackupReminderPreference(enabled: boolean) {
  return enabled ? Storage.setItem(reminderKey, String(Date.now())) : Storage.removeItem(reminderKey);
}

export function backupReminderTime(status: BackupStatus) {
  if (!status.reminderEnabledAt) return undefined;
  const date = new Date(Math.max(status.reminderEnabledAt, status.lastExportAt ?? 0));
  date.setDate(date.getDate() + 30);
  return date.getTime();
}
