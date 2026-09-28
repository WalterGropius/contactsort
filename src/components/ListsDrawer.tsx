import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { validListName, type Action, type ListDef } from '../lib/session';
import type { ContactView } from '../lib/vcard';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, DownloadIcon, PlusIcon, TrashIcon } from './icons';
import { WheelPreview } from './WheelOverlay';

const SUGGESTIONS = ['Family', 'Friends', 'Work', 'Clients', 'Acquaintances', 'Delete later'];

interface Props {
  open: boolean;
  lists: ListDef[];
  counts: Record<string, number>;
  unsorted: number;
  members: (listId: string) => { uid: string; view: ContactView }[];
  dispatch(a: Action): void;
  onExportList(listId: string): void;
  onClose(): void;
}

function ListRow({
  list,
  index,
  total,
  count,
  members,
  dispatch,
  onExport,
}: {
  list: ListDef;
  index: number;
  total: number;
  count: number;
  members: () => { uid: string; view: ContactView }[];
  dispatch(a: Action): void;
  onExport(): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.name]);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const commitName = () => {
    if (name.trim() && name.trim() !== list.name) dispatch({ type: 'renameList', id: list.id, name });
    else setName(list.name);
  };

  return (
    <li className="list-row" style={{ '--c': list.color } as CSSProperties}>
      <div className="list-row-main">
        <button
          className="list-swatch"
          title="Change colour"
          aria-label={`Change colour of ${list.name}`}
          onClick={() => dispatch({ type: 'recolorList', id: list.id })}
        >
          {index < 10 ? (index + 1) % 10 : ''}
        </button>
        <input
          className="list-name"
          value={name}
          aria-label="List name"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(list.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <button
          className={`list-count ${expanded ? 'is-open' : ''}`}
          onClick={() => setExpanded((x) => !x)}
          disabled={count === 0}
          title={count ? 'Show contacts' : undefined}
        >
          {count}
          {count > 0 && <ChevronDownIcon size={14} />}
        </button>
        <div className="list-actions">
          <button className="icon-btn sm" title="Move earlier on the wheel" disabled={index === 0} onClick={() => dispatch({ type: 'moveList', id: list.id, delta: -1 })}>
            <ChevronUpIcon size={16} />
          </button>
          <button className="icon-btn sm" title="Move later on the wheel" disabled={index === total - 1} onClick={() => dispatch({ type: 'moveList', id: list.id, delta: 1 })}>
            <ChevronDownIcon size={16} />
          </button>
          <button className="icon-btn sm" title="Export just this list (.vcf)" disabled={count === 0} onClick={onExport}>
            <DownloadIcon size={16} />
          </button>
          {confirmDelete ? (
            <button className="btn danger xs" onClick={() => dispatch({ type: 'deleteList', id: list.id })}>
              Delete{count ? ` · ${count} back to stack` : ''}
            </button>
          ) : (
            <button className="icon-btn sm" title="Delete list" onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={16} />
            </button>
          )}
        </div>
      </div>
      {expanded && count > 0 && (
        <ul className="member-list">
          {members().map(({ uid, view }) => (
            <li key={uid}>
              <span className="member-name">{view.name}</span>
              <span className="member-sub">{view.org ?? view.phones[0]?.value ?? view.emails[0]?.value ?? ''}</span>
              <button
                className="icon-btn xs"
                title="Remove from list (back to the stack)"
                onClick={() => dispatch({ type: 'unassign', uid, listId: list.id })}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ListsDrawer({ open, lists, counts, unsorted, members, dispatch, onExportList, onClose }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && lists.length === 0) setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, lists.length]);

  const add = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    dispatch({ type: 'addList', name: draft });
    setDraft('');
  };

  const taken = new Set(lists.map((l) => l.name.toLowerCase()));
  const suggestions = SUGGESTIONS.filter((s) => !taken.has(s.toLowerCase())).slice(0, 5);

  return (
    <div className={`sheet-root ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="sheet-backdrop" onClick={onClose} />
      <section className="sheet" role="dialog" aria-label="Lists" aria-modal="true">
        <div className="sheet-grip" />
        <header className="sheet-head">
          <div>
            <h3>Lists</h3>
            <p className="muted">
              {lists.length} {lists.length === 1 ? 'list' : 'lists'} · {unsorted} still unsorted
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close lists">
            <CloseIcon />
          </button>
        </header>

        <div className="sheet-intro">
          <WheelPreview lists={lists} />
          <p>
            Each list gets an equal slice of the wheel around the card. Drag a card into a slice to file it there.
            The order below sets where each slice sits (and its number key).
          </p>
        </div>

        {lists.length > 0 && (
          <ul className="list-rows">
            {lists.map((l, i) => (
              <ListRow
                key={l.id}
                list={l}
                index={i}
                total={lists.length}
                count={counts[l.id] ?? 0}
                members={() => members(l.id)}
                dispatch={dispatch}
                onExport={() => onExportList(l.id)}
              />
            ))}
          </ul>
        )}

        <form className="add-list" onSubmit={add}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={lists.length ? 'Add another list…' : 'Name your first list, e.g. Family'}
            aria-label="New list name"
            maxLength={60}
          />
          <button className="btn primary" type="submit" disabled={!validListName({ lists }, draft)}>
            <PlusIcon size={18} /> Add
          </button>
        </form>
        {suggestions.length > 0 && lists.length < 6 && (
          <div className="suggestions">
            <span className="muted">Quick add:</span>
            {suggestions.map((s) => (
              <button key={s} className="chip-btn" onClick={() => dispatch({ type: 'addList', name: s })}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
