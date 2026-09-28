import { parseVcf, serializeCard, type ParsedCard } from './vcard';
import { createZip } from './zip';

export const PALETTE = [
  '#ff5d73', // coral
  '#ffb547', // amber
  '#2fd2a8', // mint
  '#7c6cff', // violet
  '#3ab8ff', // sky
  '#ff7ac6', // pink
  '#a3e05a', // lime
  '#ff8a3d', // orange
  '#5b7cfa', // indigo
  '#1ec9d6', // cyan
  '#d66bff', // magenta
  '#f5d547', // yellow
];

export interface ListDef {
  id: string;
  name: string;
  color: string;
}

export type HistoryEntry =
  | { kind: 'assign'; uid: string; prev: string[]; exit: Vec }
  | { kind: 'skip'; uid: string };

export interface Vec {
  x: number;
  y: number;
}

export interface Session {
  sources: string[];
  contacts: ParsedCard[];
  lists: ListDef[];
  /** uid → list ids */
  assignments: Record<string, string[]>;
  /** uids still to swipe, top of the stack first */
  queue: string[];
  includeSorted: boolean;
  /** true when there are changes that haven't been exported yet */
  dirty: boolean;
  history: HistoryEntry[];
}

/** A list called "Unsorted" in a file means exactly that — not a real list. */
const UNSORTED_ALIASES = new Set(['unsorted', 'none']);

const HISTORY_LIMIT = 300;

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function nextColor(lists: ListDef[]): string {
  const used = new Set(lists.map((l) => l.color));
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[lists.length % PALETTE.length];
}

export function isSorted(s: Pick<Session, 'assignments'>, uid: string): boolean {
  return (s.assignments[uid]?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportFile {
  name: string;
  cards: ParsedCard[];
  /** true if the file carries list data (i.e. it's a ContactSort export) */
  hasLists: boolean;
  /** saved list definitions in wheel order (X-CONTACTSORT-LISTS) */
  listOrder: string[];
}

export function readImportFile(name: string, text: string): ImportFile {
  const cards = parseVcf(text);
  const listOrder = cards.find((c) => c.listOrder.length > 0)?.listOrder ?? [];
  return { name, cards, hasLists: listOrder.length > 0 || cards.some((c) => c.lists.length > 0), listOrder };
}

export interface ImportPlanItem {
  file: ImportFile;
  /** optional list every contact of this file is added to */
  addToList: string;
}

/**
 * Builds a session from imported files, optionally merging into an existing
 * one. Contacts are matched by UID (their own or the deterministic one), so
 * importing the same contact twice never creates a duplicate — its lists are
 * merged instead.
 */
export function buildSession(items: ImportPlanItem[], base?: Session): Session {
  const lists = base ? base.lists.map((l) => ({ ...l })) : [];
  const assignments: Record<string, string[]> = base ? { ...base.assignments } : {};
  const contacts = base ? [...base.contacts] : [];
  const known = new Set(contacts.map((c) => c.uid));
  const sources = base ? [...base.sources] : [];

  const listIdFor = (name: string): string | null => {
    const clean = name.trim();
    if (!clean || UNSORTED_ALIASES.has(clean.toLowerCase())) return null;
    const existing = lists.find((l) => l.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing.id;
    const list = { id: newId(), name: clean, color: nextColor(lists) };
    lists.push(list);
    return list.id;
  };

  // Saved list definitions first, so wheel positions (and empty lists) survive.
  for (const { file } of items) file.listOrder.forEach((name) => listIdFor(name));

  for (const { file, addToList } of items) {
    sources.push(file.name);
    for (const card of file.cards) {
      const ids = [...card.lists, addToList]
        .map((n) => listIdFor(n))
        .filter((id): id is string => id !== null);
      if (!known.has(card.uid)) {
        known.add(card.uid);
        contacts.push(card);
      }
      if (ids.length) {
        const merged = new Set([...(assignments[card.uid] ?? []), ...ids]);
        assignments[card.uid] = [...merged];
      }
    }
  }

  // Keep the existing stack order and append newly imported contacts. Already
  // sorted contacts stay out of the stack unless "include sorted" is on.
  const includeSorted = base?.includeSorted ?? false;
  const eligible = (uid: string) => includeSorted || !isSorted({ assignments }, uid);
  const baseUids = new Set(base?.contacts.map((c) => c.uid));
  const queue = [
    ...(base?.queue ?? []).filter(eligible),
    ...contacts.map((c) => c.uid).filter((uid) => !baseUids.has(uid) && eligible(uid)),
  ];

  return {
    sources,
    contacts,
    lists,
    assignments,
    queue,
    includeSorted,
    // A merge, or lists taken from file names, is new information worth exporting.
    dirty: Boolean(base) || items.some((i) => i.addToList.trim() !== ''),
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'assign'; uid: string; listId: string; exit: Vec }
  | { type: 'skip'; uid: string }
  | { type: 'undo' }
  | { type: 'unassign'; uid: string; listId: string }
  | { type: 'addList'; name: string }
  | { type: 'renameList'; id: string; name: string }
  | { type: 'recolorList'; id: string }
  | { type: 'moveList'; id: string; delta: number }
  | { type: 'deleteList'; id: string }
  | { type: 'setIncludeSorted'; value: boolean }
  | { type: 'exported' };

/** Non-empty, not reserved ("Unsorted"), and not already taken by another list. */
export function validListName(s: Pick<Session, 'lists'>, name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n !== '' && !UNSORTED_ALIASES.has(n) && !s.lists.some((l) => l.id !== exceptId && l.name.toLowerCase() === n)
  );
}

function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const next = [...history, entry];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export function reducer(s: Session, a: Action): Session {
  switch (a.type) {
    case 'assign': {
      if (!s.lists.some((l) => l.id === a.listId)) return s;
      return {
        ...s,
        assignments: { ...s.assignments, [a.uid]: [a.listId] },
        queue: s.queue.filter((u) => u !== a.uid),
        history: pushHistory(s.history, { kind: 'assign', uid: a.uid, prev: s.assignments[a.uid] ?? [], exit: a.exit }),
        dirty: true,
      };
    }
    case 'skip': {
      if (s.queue[0] !== a.uid || s.queue.length < 2) return s;
      return {
        ...s,
        queue: [...s.queue.slice(1), a.uid],
        history: pushHistory(s.history, { kind: 'skip', uid: a.uid }),
      };
    }
    case 'undo': {
      const last = s.history[s.history.length - 1];
      if (!last) return s;
      const history = s.history.slice(0, -1);
      const queue = [last.uid, ...s.queue.filter((u) => u !== last.uid)];
      if (last.kind === 'skip') return { ...s, queue, history };
      const assignments = { ...s.assignments };
      if (last.prev.length) assignments[last.uid] = last.prev;
      else delete assignments[last.uid];
      return { ...s, assignments, queue, history, dirty: true };
    }
    case 'unassign': {
      const remaining = (s.assignments[a.uid] ?? []).filter((id) => id !== a.listId);
      const assignments = { ...s.assignments };
      if (remaining.length) assignments[a.uid] = remaining;
      else delete assignments[a.uid];
      const queue = remaining.length || s.queue.includes(a.uid) ? s.queue : [a.uid, ...s.queue];
      return { ...s, assignments, queue, dirty: true };
    }
    case 'addList': {
      const name = a.name.trim();
      if (!validListName(s, name)) return s;
      return { ...s, lists: [...s.lists, { id: newId(), name, color: nextColor(s.lists) }], dirty: true };
    }
    case 'renameList': {
      const name = a.name.trim();
      if (!validListName(s, name, a.id)) return s;
      return { ...s, lists: s.lists.map((l) => (l.id === a.id ? { ...l, name } : l)), dirty: true };
    }
    case 'recolorList': {
      return {
        ...s,
        lists: s.lists.map((l) =>
          l.id === a.id ? { ...l, color: PALETTE[(PALETTE.indexOf(l.color) + 1) % PALETTE.length] } : l,
        ),
      };
    }
    case 'moveList': {
      const i = s.lists.findIndex((l) => l.id === a.id);
      const j = i + a.delta;
      if (i < 0 || j < 0 || j >= s.lists.length) return s;
      const lists = [...s.lists];
      [lists[i], lists[j]] = [lists[j], lists[i]];
      return { ...s, lists };
    }
    case 'deleteList': {
      const assignments: Record<string, string[]> = {};
      const freed: string[] = [];
      for (const [uid, ids] of Object.entries(s.assignments)) {
        const rest = ids.filter((id) => id !== a.id);
        if (rest.length) assignments[uid] = rest;
        else freed.push(uid);
      }
      const queued = new Set(s.queue);
      return {
        ...s,
        lists: s.lists.filter((l) => l.id !== a.id),
        assignments,
        queue: [...s.queue, ...freed.filter((u) => !queued.has(u))],
        history: [],
        dirty: true,
      };
    }
    case 'setIncludeSorted': {
      const unsortedFirst = s.queue.filter((u) => !isSorted(s, u));
      let queue: string[];
      if (a.value) {
        const seen = new Set(unsortedFirst);
        queue = [...unsortedFirst, ...s.contacts.map((c) => c.uid).filter((u) => !seen.has(u))];
      } else {
        queue = unsortedFirst;
      }
      return { ...s, includeSorted: a.value, queue, history: [] };
    }
    case 'exported':
      return { ...s, dirty: false };
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function listNamesFor(s: Session, uid: string): string[] {
  const byId = new Map(s.lists.map((l) => [l.id, l.name]));
  return (s.assignments[uid] ?? []).map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}

/**
 * The "save progress" file: every contact with its lists in X-CUSTOM-LISTS,
 * plus the list definitions (X-CONTACTSORT-LISTS) on the first card.
 */
export function exportAll(s: Session): string {
  const order = s.lists.map((l) => l.name);
  return s.contacts.map((c, i) => serializeCard(c, listNamesFor(s, c.uid), i === 0 ? order : undefined)).join('');
}

export function exportList(s: Session, listId: string): string {
  return s.contacts
    .filter((c) => s.assignments[c.uid]?.includes(listId))
    .map((c) => serializeCard(c, listNamesFor(s, c.uid)))
    .join('');
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'list';
}

/** One .vcf per list (plus the unsorted rest), zipped. */
export function exportListsZip(s: Session): Uint8Array {
  const used = new Set<string>();
  const entries = s.lists
    .map((l) => {
      let base = safeFileName(l.name);
      let n = 2;
      while (used.has(base.toLowerCase())) base = `${safeFileName(l.name)} (${n++})`;
      used.add(base.toLowerCase());
      return { name: `${base}.vcf`, data: exportList(s, l.id) };
    })
    .filter((e) => e.data.length > 0);
  const unsorted = s.contacts
    .filter((c) => !isSorted(s, c.uid))
    .map((c) => serializeCard(c, []))
    .join('');
  if (unsorted) entries.push({ name: '_Unsorted.vcf', data: unsorted });
  return createZip(entries);
}

export function countByList(s: Session): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ids of Object.values(s.assignments)) for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
