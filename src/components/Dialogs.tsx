import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ImportFile, ImportPlanItem, ListDef } from '../lib/session';
import type { ContactView } from '../lib/vcard';
import { avatarGradient } from './ContactCard';
import { BuildingIcon, CakeIcon, CloseIcon, LinkIcon, MailIcon, NoteIcon, PhoneIcon, PinIcon } from './icons';

export function Modal({ onClose, children, className = '' }: { onClose(): void; children: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={onClose} />
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function stripExt(name: string) {
  return name.replace(/\.(vcf|vcard)$/i, '');
}

export function ImportDialog({
  files,
  canMerge,
  dirty,
  onCancel,
  onConfirm,
}: {
  files: ImportFile[];
  canMerge: boolean;
  dirty: boolean;
  onCancel(): void;
  onConfirm(items: ImportPlanItem[], merge: boolean): void;
}) {
  // Several plain exports dropped together are most likely per-list exports
  // from the iPhone, so offer each file name as its list — except for the
  // "all contacts" file, i.e. one that contains every other file's contacts.
  const [names, setNames] = useState(() => {
    const sets = files.map((f) => new Set(f.cards.map((c) => c.uid)));
    const isAll = (i: number) =>
      files.length > 1 &&
      sets.every((other, j) => j === i || (other.size < sets[i].size && [...other].every((u) => sets[i].has(u))));
    return files.map((f, i) => (files.length > 1 && !f.hasLists && !isAll(i) ? stripExt(f.name) : ''));
  });
  const [merge, setMerge] = useState(canMerge);
  const total = files.reduce((s, f) => s + f.cards.length, 0);

  return (
    <Modal onClose={onCancel} className="import-modal">
      <header className="modal-head">
        <h3>
          Import {files.length} {files.length === 1 ? 'file' : 'files'} · {total} contacts
        </h3>
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
          <CloseIcon />
        </button>
      </header>
      <p className="muted small">
        Contacts that appear in more than one file are merged, never duplicated. Put a file’s contacts straight into a
        list by naming it — handy for lists you exported one by one from your iPhone.
      </p>
      <ul className="import-rows">
        {files.map((f, i) => (
          <li key={i}>
            <div className="import-file">
              <strong title={f.name}>{f.name}</strong>
              <span className="muted small">
                {f.cards.length} contacts{f.hasLists ? ' · includes saved lists' : ''}
              </span>
            </div>
            <input
              value={names[i]}
              placeholder="No list"
              aria-label={`List for ${f.name}`}
              onChange={(e) => setNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))}
            />
          </li>
        ))}
      </ul>
      {canMerge && (
        <div className="segmented" role="radiogroup">
          <button role="radio" aria-checked={merge} className={merge ? 'is-on' : ''} onClick={() => setMerge(true)}>
            Add to current session
          </button>
          <button role="radio" aria-checked={!merge} className={!merge ? 'is-on' : ''} onClick={() => setMerge(false)}>
            Start fresh
          </button>
        </div>
      )}
      {canMerge && !merge && dirty && (
        <p className="warn small">Your current progress hasn’t been exported yet — starting fresh discards it.</p>
      )}
      <footer className="modal-foot">
        <button className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onConfirm(
              files.map((file, i) => ({ file, addToList: names[i] })),
              merge,
            )
          }
        >
          Import
        </button>
      </footer>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function DetailGroup({ icon, items }: { icon: ReactNode; items: { label: string; value: string }[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((it, i) => (
        <div className="detail-row" key={i}>
          <span className="detail-icon">{icon}</span>
          <div>
            <div className="detail-value">{it.value}</div>
            {it.label && <div className="detail-label">{it.label}</div>}
          </div>
        </div>
      ))}
    </>
  );
}

export function DetailsModal({
  view,
  lists,
  current,
  onSend,
  onClose,
}: {
  view: ContactView;
  lists: ListDef[];
  current: string[];
  onSend(index: number): void;
  onClose(): void;
}) {
  return (
    <Modal onClose={onClose} className="details-modal">
      <div className="details-hero" style={{ background: avatarGradient(view.name) }}>
        {view.photo ? <img src={view.photo} alt="" /> : <span>{view.initials}</span>}
        <button className="icon-btn on-dark" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <div className="details-body">
        <h3>{view.name}</h3>
        {(view.title || view.org) && (
          <div className="details-sub">
            <BuildingIcon size={15} /> {[view.title, view.org].filter(Boolean).join(' · ')}
          </div>
        )}
        <DetailGroup icon={<PhoneIcon size={16} />} items={view.phones} />
        <DetailGroup icon={<MailIcon size={16} />} items={view.emails} />
        <DetailGroup icon={<PinIcon size={16} />} items={view.addresses} />
        <DetailGroup icon={<LinkIcon size={16} />} items={[...view.urls, ...view.socials]} />
        {view.birthday && <DetailGroup icon={<CakeIcon size={16} />} items={[{ label: 'birthday', value: view.birthday }]} />}
        {view.note && <DetailGroup icon={<NoteIcon size={16} />} items={[{ label: 'note', value: view.note }]} />}
        {lists.length > 0 && (
          <div className="details-send">
            <div className="muted small">Send to</div>
            <div className="details-send-row">
              {lists.map((l, i) => (
                <button
                  key={l.id}
                  className={`chip-btn solid ${current.includes(l.id) ? 'is-current' : ''}`}
                  style={{ '--c': l.color } as CSSProperties}
                  onClick={() => onSend(i)}
                >
                  {i < 10 && <kbd>{(i + 1) % 10}</kbd>} {l.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
