export async function writeBackupFile(name: string, contents: string, mimeType = 'application/json'): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
    return true;
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function pickBackupFile(): Promise<{ name: string; contents: string } | null> {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  document.body.append(input);
  try {
    const file = await new Promise<File | null>(resolve => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    return file ? { name: file.name, contents: await file.text() } : null;
  } finally {
    input.remove();
  }
}
