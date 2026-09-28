import { sha1Hex } from './sha1';

/**
 * The custom property ContactSort uses to remember which lists a contact is in.
 * Apple / Google ignore unknown X- properties, so the file stays importable
 * everywhere while carrying the sorting metadata.
 *
 *   X-CUSTOM-LISTS:Work;Clients;VIP
 */
export const LISTS_PROP = 'X-CUSTOM-LISTS';

/**
 * Written once, on the first card of a "save progress" export: every list in
 * wheel order, so empty lists and slice positions survive a reload.
 *
 *   X-CONTACTSORT-LISTS:Family;Friends;Work;Clients
 */
export const LIST_ORDER_PROP = 'X-CONTACTSORT-LISTS';

/** One logical (unfolded) content line of a vCard. */
export interface VLine {
  /** Exact original text, physical lines joined with CRLF (folding preserved). */
  raw: string;
  /** Apple-style property group, e.g. "item1" in "item1.EMAIL". Lowercased. */
  group: string;
  /** Upper-cased property name, e.g. "TEL". */
  name: string;
  /** Upper-cased parameter names → values. Bare vCard 2.1 params become TYPE / ENCODING. */
  params: Record<string, string[]>;
  /** Unfolded value, still vCard-escaped. */
  value: string;
}

export interface ParsedCard {
  /** All logical lines, including BEGIN:VCARD and END:VCARD. */
  lines: VLine[];
  /** Stable identity: the card's own UID, or a deterministic one derived from its content. */
  uid: string;
  /** True when the UID came from the file (so we must not add one on export). */
  hasOwnUid: boolean;
  /** List names read from X-CUSTOM-LISTS. */
  lists: string[];
  /** List names (in wheel order) read from X-CONTACTSORT-LISTS, if present. */
  listOrder: string[];
}

export interface LabeledValue {
  label: string;
  value: string;
}

export interface ContactView {
  name: string;
  initials: string;
  org?: string;
  title?: string;
  nickname?: string;
  phones: LabeledValue[];
  emails: LabeledValue[];
  addresses: LabeledValue[];
  urls: LabeledValue[];
  socials: LabeledValue[];
  birthday?: string;
  note?: string;
  /** data: URL (remote photo URLs are deliberately ignored — nothing is fetched). */
  photo?: string;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseVcf(text: string): ParsedCard[] {
  const logical = unfold(text.replace(/^\uFEFF/, ''));
  const cards: VLine[][] = [];
  let current: VLine[] | null = null;
  let depth = 0;

  for (const line of logical) {
    const isBegin = line.name === 'BEGIN' && line.value.trim().toUpperCase() === 'VCARD';
    const isEnd = line.name === 'END' && line.value.trim().toUpperCase() === 'VCARD';
    if (isBegin) {
      if (depth === 0) current = [];
      depth++;
    }
    if (current) current.push(line);
    if (isEnd && depth > 0) {
      depth--;
      if (depth === 0 && current) {
        cards.push(current);
        current = null;
      }
    }
  }

  const seen = new Map<string, number>();
  return cards.map((lines) => {
    const ownUid = lines.find((l) => l.name === 'UID' && l.value.trim() !== '');
    const lists = lines.filter((l) => l.name === LISTS_PROP).flatMap((l) => parseListValue(l.value));
    const listOrder = lines.filter((l) => l.name === LIST_ORDER_PROP).flatMap((l) => parseListValue(l.value));
    let uid: string;
    if (ownUid) {
      uid = ownUid.value.trim();
    } else {
      // Deterministic id so the same contact gets the same UID on every run,
      // even from a fresh (UID-less) Apple export months later.
      const fp = fingerprint(lines);
      const n = (seen.get(fp) ?? 0) + 1;
      seen.set(fp, n);
      uid = uuidFromHash(sha1Hex(`contactsort:${fp}${n > 1 ? `#${n}` : ''}`));
    }
    return { lines, uid, hasOwnUid: Boolean(ownUid), lists: dedupeNames(lists), listOrder: dedupeNames(listOrder) };
  });
}

/** Joins folded lines (RFC 6350 §3.2) and vCard 2.1 quoted-printable soft breaks. */
function unfold(text: string): VLine[] {
  const physical = text.split(/\r\n|\n|\r/);
  const out: { raw: string; text: string }[] = [];
  for (const line of physical) {
    const prev = out[out.length - 1];
    if (prev && (line.startsWith(' ') || line.startsWith('\t'))) {
      prev.raw += '\r\n' + line;
      prev.text += line.slice(1);
      continue;
    }
    if (prev && prev.text.endsWith('=') && isQuotedPrintable(prev.text) && line !== '') {
      prev.raw += '\r\n' + line;
      prev.text = prev.text.slice(0, -1) + line;
      continue;
    }
    if (line.trim() === '') continue;
    out.push({ raw: line, text: line });
  }
  return out.map(({ raw, text }) => ({ raw, ...parseLine(text) }));
}

function isQuotedPrintable(text: string): boolean {
  const colon = findValueColon(text);
  const head = (colon === -1 ? text : text.slice(0, colon)).toUpperCase();
  return head.includes('QUOTED-PRINTABLE');
}

function findValueColon(text: string): number {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ':' && !inQuotes) return i;
  }
  return -1;
}

function parseLine(text: string): Omit<VLine, 'raw'> {
  const colon = findValueColon(text);
  const head = colon === -1 ? text : text.slice(0, colon);
  const value = colon === -1 ? '' : text.slice(colon + 1);

  const parts = splitOutsideQuotes(head, ';');
  let fullName = parts.shift() ?? '';
  let group = '';
  const dot = fullName.lastIndexOf('.');
  if (dot !== -1) {
    group = fullName.slice(0, dot).toLowerCase();
    fullName = fullName.slice(dot + 1);
  }

  const params: Record<string, string[]> = {};
  const add = (key: string, vals: string[]) => {
    (params[key] ??= []).push(...vals);
  };
  for (const p of parts) {
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq === -1) {
      // vCard 2.1 bare parameter, e.g. "TEL;CELL;VOICE:" or ";QUOTED-PRINTABLE"
      const up = p.toUpperCase();
      if (up === 'QUOTED-PRINTABLE' || up === 'BASE64' || up === 'B') add('ENCODING', [p]);
      else add('TYPE', [p]);
    } else {
      const key = p.slice(0, eq).toUpperCase();
      const vals = splitOutsideQuotes(p.slice(eq + 1), ',').map((v) => v.replace(/^"|"$/g, ''));
      add(key, vals);
    }
  }
  return { group, name: fullName.toUpperCase(), params, value };
}

function splitOutsideQuotes(text: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === sep && !inQuotes) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Splits on separators that are not backslash-escaped, then unescapes each part. */
function splitEscaped(value: string, seps: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) {
      cur += ch + value[i + 1];
      i++;
    } else if (seps.includes(ch)) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(unescapeText);
}

export function unescapeText(value: string): string {
  return value.replace(/\\([nN,;:\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function parseListValue(value: string): string[] {
  return splitEscaped(value, ';,')
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = n.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function param(line: VLine, key: string): string[] {
  return line.params[key] ?? [];
}

function hasParam(line: VLine, key: string, value: string): boolean {
  return param(line, key).some((v) => v.toUpperCase() === value.toUpperCase());
}

/** Decoded text of a (possibly quoted-printable) value. */
function decodeValue(line: VLine): string {
  if (!hasParam(line, 'ENCODING', 'QUOTED-PRINTABLE')) return line.value;
  const charset = param(line, 'CHARSET')[0] ?? 'utf-8';
  const bytes: number[] = [];
  const v = line.value;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(v.slice(i + 1, i + 3))) {
      bytes.push(parseInt(v.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(v[i]));
    }
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
}

function textOf(line: VLine): string {
  return unescapeText(decodeValue(line)).trim();
}

function componentsOf(line: VLine): string[] {
  return splitEscaped(decodeValue(line), ';').map((s) => s.trim());
}

const TYPE_LABELS: Record<string, string> = {
  CELL: 'mobile',
  MOBILE: 'mobile',
  IPHONE: 'iPhone',
  HOME: 'home',
  WORK: 'work',
  MAIN: 'main',
  FAX: 'fax',
  PAGER: 'pager',
  OTHER: 'other',
  SCHOOL: 'school',
};
const IGNORED_TYPES = new Set(['VOICE', 'PREF', 'INTERNET', 'X400', 'MSG', 'TEXT', 'VIDEO']);

function labelFor(line: VLine, lines: VLine[]): string {
  if (line.group) {
    const ab = lines.find((l) => l.group === line.group && l.name === 'X-ABLABEL');
    if (ab) {
      const text = textOf(ab);
      const m = /^_\$!<(.+)>!\$_$/.exec(text);
      return (m ? m[1] : text).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    }
  }
  const types = param(line, 'TYPE').flatMap((t) => t.split(','));
  const faxLike = types.some((t) => t.toUpperCase() === 'FAX');
  for (const t of types) {
    const up = t.toUpperCase();
    if (IGNORED_TYPES.has(up)) continue;
    if (faxLike && up !== 'FAX') return `${TYPE_LABELS[up] ?? up.toLowerCase()} fax`;
    return TYPE_LABELS[up] ?? t.toLowerCase();
  }
  return '';
}

function photoOf(lines: VLine[]): string | undefined {
  const line = lines.find((l) => l.name === 'PHOTO');
  if (!line) return undefined;
  const value = line.value.trim();
  if (/^data:image\//i.test(value)) return value.replace(/\s+/g, '');
  const encoded =
    hasParam(line, 'ENCODING', 'b') || hasParam(line, 'ENCODING', 'BASE64') || hasParam(line, 'ENCODING', 'B');
  if (!encoded) return undefined; // remote URL — never fetched
  const b64 = value.replace(/\s+/g, '');
  if (!b64) return undefined;
  let type = (param(line, 'TYPE')[0] ?? '').toLowerCase().replace(/^image\//, '');
  if (!type || !/^(jpeg|jpg|png|gif|webp|heic)$/.test(type)) {
    type = b64.startsWith('iVBOR') ? 'png' : b64.startsWith('R0lGOD') ? 'gif' : 'jpeg';
  }
  if (type === 'jpg') type = 'jpeg';
  return `data:image/${type};base64,${b64}`;
}

function nameOf(lines: VLine[]): string {
  const fn = lines.find((l) => l.name === 'FN');
  const fnText = fn ? textOf(fn) : '';
  if (fnText) return fnText;
  const n = lines.find((l) => l.name === 'N');
  if (n) {
    const [family = '', given = '', middle = '', prefix = '', suffix = ''] = componentsOf(n);
    const joined = [prefix, given, middle, family, suffix].filter(Boolean).join(' ');
    if (joined) return joined;
  }
  const org = lines.find((l) => l.name === 'ORG');
  if (org) {
    const o = componentsOf(org).filter(Boolean).join(', ');
    if (o) return o;
  }
  const other = lines.find((l) => l.name === 'EMAIL' || l.name === 'TEL');
  return other ? textOf(other) : 'No name';
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '#';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

function formatBirthday(raw: string): string {
  const m = /^(\d{4}|--)-?(\d{2})-?(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  const [, y, mo, d] = m;
  const month = new Date(2000, Number(mo) - 1, 1).toLocaleString(undefined, { month: 'long' });
  const noYear = y === '--' || y === '1604'; // Apple uses 1604 for "no year"
  return noYear ? `${Number(d)} ${month}` : `${Number(d)} ${month} ${y}`;
}

export function contactView(card: ParsedCard): ContactView {
  const { lines } = card;
  const name = nameOf(lines);
  const all = (prop: string) =>
    lines
      .filter((l) => l.name === prop)
      .map((l) => ({ label: labelFor(l, lines), value: textOf(l) }))
      .filter((lv) => lv.value);

  const orgLine = lines.find((l) => l.name === 'ORG');
  const org = orgLine ? componentsOf(orgLine).filter(Boolean).join(' · ') : undefined;
  const title = lines.find((l) => l.name === 'TITLE');
  const nickname = lines.find((l) => l.name === 'NICKNAME');
  const bday = lines.find((l) => l.name === 'BDAY');
  const note = lines.find((l) => l.name === 'NOTE');

  const addresses = lines
    .filter((l) => l.name === 'ADR')
    .map((l) => {
      const [, ext = '', street = '', city = '', region = '', zip = '', country = ''] = componentsOf(l);
      const value = [street, ext, [zip, city].filter(Boolean).join(' '), region, country]
        .map((s) => s.replace(/\n/g, ', '))
        .filter(Boolean)
        .join(', ');
      return { label: labelFor(l, lines), value };
    })
    .filter((a) => a.value);

  const socials = lines
    .filter((l) => l.name === 'X-SOCIALPROFILE' || l.name === 'IMPP')
    .map((l) => {
      const user = param(l, 'X-USER')[0];
      const type = param(l, 'TYPE')[0] ?? param(l, 'X-SERVICE-TYPE')[0] ?? '';
      const value = user || textOf(l).replace(/^x-apple:|^[a-z]+:/i, '');
      return { label: type.toLowerCase(), value };
    })
    .filter((s) => s.value);

  return {
    name,
    initials: initialsOf(name),
    org: org || undefined,
    title: title ? textOf(title) || undefined : undefined,
    nickname: nickname ? textOf(nickname) || undefined : undefined,
    phones: all('TEL'),
    emails: all('EMAIL'),
    addresses,
    urls: all('URL'),
    socials,
    birthday: bday ? formatBirthday(textOf(bday)) : undefined,
    note: note ? textOf(note) || undefined : undefined,
    photo: photoOf(lines),
  };
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Content fingerprint for cards without a UID: name + last 9 digits of the
 * first phone (tolerates "+44 7700…" vs "07700…"), falling back to email/org.
 */
function fingerprint(lines: VLine[]): string {
  const name = nameOf(lines).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const tel = lines.find((l) => l.name === 'TEL');
  const digits = tel ? textOf(tel).replace(/\D/g, '').slice(-9) : '';
  const email = lines.find((l) => l.name === 'EMAIL');
  const org = lines.find((l) => l.name === 'ORG');
  const extra = digits || (email ? textOf(email).toLowerCase() : '') || (org ? textOf(org).toLowerCase() : '');
  return `${name}|${extra}`;
}

function uuidFromHash(hex: string): string {
  const h = hex.slice(0, 32).split('');
  h[12] = '5'; // version 5 (name-based, SHA-1)
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16); // RFC 4122 variant
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Folds a content line at 75 octets without splitting UTF-8 sequences. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // continuation lines start with a space
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function escapeListName(name: string): string {
  return escapeText(name);
}

/**
 * Writes a card back out, byte-for-byte identical to the original except:
 *  - any existing X-CUSTOM-LISTS line is replaced by the current lists
 *  - a UID line is added if the card didn't have one (so the next import
 *    recognises it as the same contact)
 *  - X-CONTACTSORT-LISTS is written only when `listOrder` is given
 */
export function serializeCard(card: ParsedCard, lists: string[], listOrder?: string[]): string {
  const out: string[] = [];
  const last = card.lines.length - 1;
  const joinNames = (names: string[]) => names.map(escapeListName).join(';');
  card.lines.forEach((line, i) => {
    if (line.name === LISTS_PROP || line.name === LIST_ORDER_PROP) return;
    if (line.name === 'UID' && line.value.trim() === '') return;
    if (i === last) {
      if (!card.hasOwnUid) out.push(foldLine(`UID:${escapeText(card.uid)}`));
      if (lists.length) out.push(foldLine(`${LISTS_PROP}:${joinNames(lists)}`));
      if (listOrder?.length) out.push(foldLine(`${LIST_ORDER_PROP}:${joinNames(listOrder)}`));
    }
    out.push(line.raw);
  });
  return out.join('\r\n') + '\r\n';
}

/** The card exactly as it came in, minus any ContactSort lines: nothing added. */
export function serializeClean(card: ParsedCard): string {
  return (
    card.lines
      .filter((l) => l.name !== LISTS_PROP && l.name !== LIST_ORDER_PROP)
      .map((l) => l.raw)
      .join('\r\n') + '\r\n'
  );
}

export function serializeCards(entries: { card: ParsedCard; lists: string[] }[], listOrder?: string[]): string {
  return entries.map(({ card, lists }, i) => serializeCard(card, lists, i === 0 ? listOrder : undefined)).join('');
}
