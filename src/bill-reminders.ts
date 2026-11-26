import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

const preferenceKey = 'bill-reminders';
const channel = 'vencimentos';
const prefix = 'bolso-vencimento-';
const backupChannel = 'backup';
const backupIdentifier = 'bolso-lembrete-backup';
let reconciliation: Promise<unknown> = Promise.resolve();

export const billRemindersAvailable: boolean = true;

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const identifier = notification.request.identifier;
    const show = identifier.startsWith(prefix) || identifier === backupIdentifier;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

export async function readReminderPreference() {
  return (await Storage.getItem(preferenceKey)) === 'on';
}

export async function saveReminderPreference(enabled: boolean) {
  await Storage.setItem(preferenceKey, enabled ? 'on' : 'off');
}

function hasPermission(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

async function requestPermission(channelId: string, name: string) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(channelId, {
      name, importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (hasPermission(current)) return true;
  if (!current.canAskAgain) return false;
  return hasPermission(await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true },
  }));
}

export function requestReminderPermission() {
  return requestPermission(channel, 'Vencimentos');
}

export function requestBackupReminderPermission() {
  return requestPermission(backupChannel, 'Backup');
}

function notificationsFor(dueDates: string[]) {
  const future = new Map<string, number>();
  const now = Date.now();
  for (const dueDate of dueDates) {
    const priorMorning = new Date(dueDate + 'T09:00:00');
    priorMorning.setDate(priorMorning.getDate() - 1);
    const timestamp = priorMorning.getTime();
    if (timestamp > now) future.set(prefix + dueDate, timestamp);
    if (future.size >= 60) break;
  }
  return future;
}

function reconcile(action: () => Promise<boolean>) {
  const result = reconciliation.then(action);
  reconciliation = result.catch(() => undefined);
  return result;
}

export function syncBillReminders(enabled: boolean, dates: string[]) {
  return reconcile(async () => {
    const canSchedule = enabled && hasPermission(await Notifications.getPermissionsAsync());
    const next = notificationsFor(canSchedule ? dates : []);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const { identifier, content } of scheduled) {
      if (!identifier.startsWith(prefix)) continue;
      const target = next.get(identifier);
      if (target !== undefined && content.data?.reminderTime === target) {
        next.delete(identifier);
      } else {
        await Notifications.cancelScheduledNotificationAsync(identifier);
      }
    }

    for (const [identifier, reminderTime] of next) {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Vencimentos amanhã',
          body: 'Consulte os próximos vencimentos no Bolso em Dia.',
          data: { reminderTime },
          sound: 'default',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderTime, channelId: channel },
      });
    }
    return !enabled || canSchedule;
  });
}

export function syncBackupReminder(reminderTime?: number) {
  return reconcile(async () => {
    const allowed = reminderTime === undefined || hasPermission(await Notifications.getPermissionsAsync());
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const backup = scheduled.find(({ identifier }) => identifier === backupIdentifier);
    if (backup && allowed && reminderTime !== undefined && backup.content.data?.reminderTime === reminderTime) {
      return true;
    }
    if (backup) await Notifications.cancelScheduledNotificationAsync(backupIdentifier);
    if (allowed && reminderTime !== undefined && reminderTime > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        identifier: backupIdentifier,
        content: {
          title: 'Hora de atualizar seu backup',
          body: 'Abra os Ajustes do Bolso em Dia para exportar uma cópia.',
          data: { reminderTime },
          sound: 'default',
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderTime, channelId: backupChannel },
      });
    }
    return allowed;
  });
}
