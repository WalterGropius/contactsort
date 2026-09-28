import type { Session } from './session';

// Autosave to IndexedDB so a closed tab or refresh never loses sorting work.
// The exported .vcf stays the real source of truth; this is only a safety net
// and lives solely in this browser on this computer.
//
// Contacts (which can hold megabytes of photos) are stored separately from the
// small sorting state, and only rewritten when they actually change.

const DB_NAME = 'contactsort';
const STORE = 'session';

type State = Omit<Session, 'contacts'>;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => T): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSaved(): Promise<Session | null> {
  try {
    let state: IDBRequest<State | undefined> | undefined;
    let contacts: IDBRequest<Session['contacts'] | undefined> | undefined;
    await tx('readonly', (st) => {
      state = st.get('state');
      contacts = st.get('contacts');
    });
    const s = state?.result;
    const c = contacts?.result;
    if (!s || !Array.isArray(c) || c.length === 0) return null;
    return { ...s, contacts: c, history: s.history ?? [], exportMode: s.exportMode ?? 'progress' };
  } catch {
    return null;
  }
}

let savedContacts: Session['contacts'] | null = null;

export async function save(session: Session): Promise<boolean> {
  const { contacts, ...state } = session;
  try {
    await tx('readwrite', (st) => {
      if (contacts !== savedContacts) st.put(contacts, 'contacts');
      st.put(state, 'state');
    });
    savedContacts = contacts;
    return true;
  } catch {
    return false;
  }
}

export async function clearSaved(): Promise<void> {
  savedContacts = null;
  try {
    await tx('readwrite', (st) => st.clear());
  } catch {
    /* nothing to clear */
  }
}
