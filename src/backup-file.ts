import { Directory, File } from 'expo-file-system';

export async function writeBackupFile(name: string, contents: string, mimeType = 'application/json'): Promise<boolean> {
  let destination: Directory;
  try {
    destination = await Directory.pickDirectoryAsync();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String(error.code) : '';
    if (/CANCEL(L)?ED/i.test(code)) return false;
    throw error;
  }

  destination.createFile(name, mimeType).write(contents);
  return true;
}

export async function pickBackupFile(): Promise<{ name: string; contents: string } | null> {
  const selected = await File.pickFileAsync({});
  if (selected.canceled) return null;
  return { name: selected.result.name, contents: await selected.result.text() };
}
