export function downloadFile(name: string, data: string | Uint8Array, type: string): void {
  const blob = new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function dateStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type DirHandle = {
  getFileHandle(name: string, opts: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};
type DirPicker = (opts?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle>;

/**
 * Saves several files at once. Where the browser supports it (Chrome, Edge)
 * the user picks a folder once and every file is written into it; elsewhere
 * each file is downloaded separately.
 */
export async function saveFiles(
  files: { name: string; data: string }[],
  type: string,
): Promise<'folder' | 'downloads' | 'cancelled'> {
  const picker = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;
  if (typeof picker === 'function') {
    try {
      const dir = await picker({ id: 'contactsort', mode: 'readwrite' });
      for (const f of files) {
        const writable = await (await dir.getFileHandle(f.name, { create: true })).createWritable();
        await writable.write(f.data);
        await writable.close();
      }
      return 'folder';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // Picker unavailable here (e.g. blocked for this page): fall back to downloads.
    }
  }
  for (const f of files) {
    downloadFile(f.name, f.data, type);
    await new Promise((r) => setTimeout(r, 300)); // browsers drop rapid-fire downloads
  }
  return 'downloads';
}
