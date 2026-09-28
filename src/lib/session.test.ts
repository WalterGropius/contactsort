import { describe, expect, it } from 'vitest';
import { buildSession, exportAll, exportListsZip, readImportFile, reducer, type Session } from './session';
import { parseVcf } from './vcard';
import { SAMPLE_VCF } from './sample';

const card = (name: string, extra = '') => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nTEL:+1 555 ${name.length}00${name.charCodeAt(0)}\r\n${extra}END:VCARD\r\n`;

function start(text: string, addToList = ''): Session {
  return buildSession([{ file: readImportFile('a.vcf', text), addToList }]);
}

describe('session', () => {
  it('queues only unsorted contacts and creates lists from X-CUSTOM-LISTS', () => {
    const s = start(card('Ann', 'X-CUSTOM-LISTS:Work\r\n') + card('Bob') + card('Cy', 'X-CUSTOM-LISTS:Unsorted\r\n'));
    expect(s.lists.map((l) => l.name)).toEqual(['Work']);
    expect(s.queue.length).toBe(2);
    expect(s.contacts.length).toBe(3);
  });

  it('assign → export → reload resumes exactly where you left off', () => {
    let s = start(SAMPLE_VCF);
    s = reducer(s, { type: 'addList', name: 'Family' });
    s = reducer(s, { type: 'addList', name: 'Work' });
    const [family, work] = s.lists;
    s = reducer(s, { type: 'assign', uid: s.queue[0], listId: family.id, exit: { x: 1, y: 0 } });
    s = reducer(s, { type: 'assign', uid: s.queue[0], listId: work.id, exit: { x: -1, y: 0 } });
    const file = exportAll(s);
    const resumed = start(file);
    expect(resumed.queue).toEqual(s.queue);
    expect(resumed.lists.map((l) => l.name)).toEqual(['Family', 'Work']);
    // …and exporting again without changes is byte-identical
    expect(exportAll(resumed)).toBe(file);
  });

  it('merges a fresh UID-less export into a sorted file without duplicates', () => {
    let s = start(SAMPLE_VCF);
    s = reducer(s, { type: 'addList', name: 'Friends' });
    s = reducer(s, { type: 'assign', uid: s.queue[0], listId: s.lists[0].id, exit: { x: 0, y: 1 } });
    const resumed = start(exportAll(s));
    const merged = buildSession([{ file: readImportFile('fresh.vcf', SAMPLE_VCF + card('Newbie')), addToList: '' }], resumed);
    expect(merged.contacts.length).toBe(parseVcf(SAMPLE_VCF).length + 1);
    expect(merged.queue.length).toBe(resumed.queue.length + 1);
  });

  it('can use a file as a list (per-list exports from iPhone)', () => {
    const all = readImportFile('All.vcf', card('Ann') + card('Bob') + card('Cy'));
    const fam = readImportFile('Family.vcf', card('Bob'));
    const s = buildSession([
      { file: all, addToList: '' },
      { file: fam, addToList: 'Family' },
    ]);
    expect(s.contacts.length).toBe(3);
    expect(s.queue.length).toBe(2);
    expect(s.lists[0].name).toBe('Family');
  });

  it('undo restores the card to the top and its previous lists', () => {
    let s = start(card('Ann') + card('Bob'));
    s = reducer(s, { type: 'addList', name: 'L' });
    const top = s.queue[0];
    s = reducer(s, { type: 'assign', uid: top, listId: s.lists[0].id, exit: { x: 0, y: 0 } });
    expect(s.queue).not.toContain(top);
    s = reducer(s, { type: 'undo' });
    expect(s.queue[0]).toBe(top);
    expect(s.assignments[top]).toBeUndefined();
  });

  it('skip moves the top card to the back, and undo brings it back', () => {
    let s = start(card('Ann') + card('Bob') + card('Cy'));
    const [a, b, c] = s.queue;
    s = reducer(s, { type: 'skip', uid: a });
    expect(s.queue).toEqual([b, c, a]);
    s = reducer(s, { type: 'undo' });
    expect(s.queue).toEqual([a, b, c]);
  });

  it('deleting a list returns its contacts to the stack', () => {
    let s = start(card('Ann', 'X-CUSTOM-LISTS:Gone\r\n') + card('Bob'));
    expect(s.queue.length).toBe(1);
    s = reducer(s, { type: 'deleteList', id: s.lists[0].id });
    expect(s.queue.length).toBe(2);
    expect(exportAll(s)).not.toContain('X-CUSTOM-LISTS');
  });

  it('builds a zip with one vcf per list', () => {
    const s = start(card('Ann', 'X-CUSTOM-LISTS:A/B\r\n') + card('Bob', 'X-CUSTOM-LISTS:C\r\n') + card('Cy'));
    const zip = exportListsZip(s);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('A_B.vcf');
    expect(text).toContain('C.vcf');
    expect(text).toContain('_Unsorted.vcf');
    expect(new DataView(zip.buffer).getUint32(zip.length - 22, true)).toBe(0x06054b50);
  });
});

describe('list definitions', () => {
  it('keeps empty lists and wheel order across export → reload', () => {
    let s = start(card('Ann') + card('Bob'));
    for (const name of ['Zeta', 'Alpha', 'Empty']) s = reducer(s, { type: 'addList', name });
    // assign in reverse order so first-appearance order differs from wheel order
    s = reducer(s, { type: 'assign', uid: s.queue[0], listId: s.lists[1].id, exit: { x: 0, y: 0 } });
    s = reducer(s, { type: 'assign', uid: s.queue[0], listId: s.lists[0].id, exit: { x: 0, y: 0 } });
    const file = exportAll(s);
    expect(file.match(/X-CONTACTSORT-LISTS/g)).toHaveLength(1);
    expect(file).toContain('X-CONTACTSORT-LISTS:Zeta;Alpha;Empty\r\n');
    const resumed = start(file);
    expect(resumed.lists.map((l) => l.name)).toEqual(['Zeta', 'Alpha', 'Empty']);
    expect(resumed.lists.map((l) => l.color)).toEqual(s.lists.map((l) => l.color));
    expect(exportAll(resumed)).toBe(file);
  });

  it('does not put list definitions into per-list exports', () => {
    const s = start(card('Ann', 'X-CUSTOM-LISTS:A\r\n'));
    expect(new TextDecoder().decode(exportListsZip(s))).not.toContain('X-CONTACTSORT-LISTS');
  });
});
