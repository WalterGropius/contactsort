import { describe, expect, it } from 'vitest';
import { contactView, foldLine, parseVcf, serializeCard, serializeCards } from './vcard';
import { sha1Hex } from './sha1';

const APPLE = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//Apple Inc.//iPhone OS 18.0//EN',
  'N:Doe;John;Q;Dr.;',
  'FN:John Doe',
  'ORG:Acme Inc.;',
  'TITLE:Engineer',
  'TEL;type=CELL;type=VOICE;type=pref:+1 (555) 019-2834',
  'item1.EMAIL;type=INTERNET;type=pref:john@example.com',
  'item1.X-ABLabel:_$!<HomePage>!$_',
  'NOTE:Line one\\nLine two\\, with comma and a very long text that will definitely be fo',
  ' lded by the exporter',
  'BDAY:1604-03-14',
  'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQ',
  ' AAAQABAAD',
  'END:VCARD',
  'BEGIN:VCARD',
  'VERSION:3.0',
  'N:;;;;',
  'FN:',
  'ORG:Pizza Place;',
  'TEL;type=WORK:030 1234 5678',
  'END:VCARD',
  '',
].join('\r\n');

describe('sha1', () => {
  it('matches known vectors', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1Hex('a'.repeat(1000))).toBe('291e9a6c66994949b57ba5e650361e98fc36b1ba');
  });
});

describe('parseVcf', () => {
  it('reads Apple vCard 3.0 cards', () => {
    const cards = parseVcf(APPLE);
    expect(cards).toHaveLength(2);
    const v = contactView(cards[0]);
    expect(v.name).toBe('John Doe');
    expect(v.initials).toBe('JD');
    expect(v.org).toBe('Acme Inc.');
    expect(v.title).toBe('Engineer');
    expect(v.phones).toEqual([{ label: 'mobile', value: '+1 (555) 019-2834' }]);
    expect(v.emails).toEqual([{ label: 'home page', value: 'john@example.com' }]);
    expect(v.note).toBe('Line one\nLine two, with comma and a very long text that will definitely be folded by the exporter');
    expect(v.birthday).toMatch(/^14 /);
    expect(v.photo).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD');
  });

  it('falls back to the organisation when there is no name', () => {
    const v = contactView(parseVcf(APPLE)[1]);
    expect(v.name).toBe('Pizza Place');
    expect(v.phones[0].label).toBe('work');
  });

  it('gives UID-less cards a stable, deterministic UID', () => {
    const a = parseVcf(APPLE);
    const b = parseVcf(APPLE.replace(/\r\n/g, '\n'));
    expect(a[0].hasOwnUid).toBe(false);
    expect(a[0].uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.map((c) => c.uid)).toEqual(b.map((c) => c.uid));
    expect(a[0].uid).not.toBe(a[1].uid);
  });

  it('matches the same person across phone formatting differences', () => {
    const one = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ann Lee\nTEL:+44 7700 900123\nEND:VCARD\n';
    const two = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ann  Lee\nTEL:07700 900123\nEND:VCARD\n';
    expect(parseVcf(one)[0].uid).toBe(parseVcf(two)[0].uid);
  });

  it('keeps exact duplicates as distinct contacts', () => {
    const card = 'BEGIN:VCARD\nVERSION:3.0\nFN:Twin\nEND:VCARD\n';
    const [a, b] = parseVcf(card + card);
    expect(a.uid).not.toBe(b.uid);
  });

  it('prefers the UID in the file', () => {
    const [c] = parseVcf('BEGIN:VCARD\nVERSION:3.0\nUID:ABC-123\nFN:X\nEND:VCARD\n');
    expect(c.uid).toBe('ABC-123');
    expect(c.hasOwnUid).toBe(true);
  });

  it('reads X-CUSTOM-LISTS with ; or , separators and escapes', () => {
    const [c] = parseVcf('BEGIN:VCARD\nVERSION:3.0\nFN:X\nX-CUSTOM-LISTS:Work;Clients, VIP;R\\&D\\; Lab;work\nEND:VCARD\n');
    expect(c.lists).toEqual(['Work', 'Clients', 'VIP', 'R\\&D; Lab']);
  });

  it('decodes vCard 2.1 quoted-printable with soft line breaks', () => {
    const text = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BC=',
      'ller',
      'TEL;CELL:+49 151 000',
      'END:VCARD',
    ].join('\r\n');
    const v = contactView(parseVcf(text)[0]);
    expect(v.name).toBe('Jürgen Müller');
    expect(v.phones[0].label).toBe('mobile');
  });

  it('ignores remote photo URLs', () => {
    const [c] = parseVcf('BEGIN:VCARD\nVERSION:3.0\nFN:X\nPHOTO;VALUE=uri:https://example.com/a.jpg\nEND:VCARD\n');
    expect(contactView(c).photo).toBeUndefined();
  });
});

describe('serializeCard', () => {
  it('adds UID + lists and leaves every other line untouched', () => {
    const [card] = parseVcf(APPLE);
    const out = serializeCard(card, ['Work', 'A;B']);
    expect(out).toContain('NOTE:Line one\\nLine two\\, with comma and a very long text that will definitely be fo\r\n lded by the exporter\r\n');
    expect(out).toContain(`UID:${card.uid}\r\nX-CUSTOM-LISTS:Work;A\\;B\r\nEND:VCARD\r\n`);
    expect(parseVcf(out)[0].lists).toEqual(['Work', 'A;B']);
  });

  it('is idempotent: export → import → export yields identical bytes', () => {
    const cards = parseVcf(APPLE);
    const first = serializeCards(cards.map((card, i) => ({ card, lists: i === 0 ? ['Friends'] : [] })));
    const again = parseVcf(first);
    expect(again.map((c) => c.uid)).toEqual(cards.map((c) => c.uid));
    const second = serializeCards(again.map((card) => ({ card, lists: card.lists })));
    expect(second).toBe(first);
  });

  it('replaces previous lists instead of appending', () => {
    const [card] = parseVcf('BEGIN:VCARD\nVERSION:3.0\nUID:u1\nFN:X\nX-CUSTOM-LISTS:Old\nEND:VCARD\n');
    const out = serializeCard(card, ['New']);
    expect(out).toBe('BEGIN:VCARD\r\nVERSION:3.0\r\nUID:u1\r\nFN:X\r\nX-CUSTOM-LISTS:New\r\nEND:VCARD\r\n');
    expect(serializeCard(card, [])).not.toContain('X-CUSTOM-LISTS');
  });
});

describe('foldLine', () => {
  it('folds at 75 octets without splitting multi-byte characters', () => {
    const line = 'X-CUSTOM-LISTS:' + 'ü'.repeat(100);
    const folded = foldLine(line);
    const enc = new TextEncoder();
    for (const part of folded.split('\r\n')) expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });
});
