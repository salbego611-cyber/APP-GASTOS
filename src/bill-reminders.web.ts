export const billRemindersAvailable: boolean = false;
export async function readReminderPreference() { return false; }
export async function saveReminderPreference(_enabled: boolean) {}
export async function requestReminderPermission() { return false; }
export async function syncBillReminders(_enabled: boolean, _dates: string[]) { return false; }
export async function requestBackupReminderPermission() { return false; }
export async function syncBackupReminder(_reminderTime?: number) { return false; }
