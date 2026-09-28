import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CardStack, type CardStackHandle, type EnterToken } from './components/CardStack';
import { DetailsModal, ImportDialog } from './components/Dialogs';
import {
  CheckIcon,
  DownloadIcon,
  FolderIcon,
  LogoMark,
  MoreIcon,
  SkipIcon,
  UndoIcon,
  UploadIcon,
} from './components/icons';
import { Landing } from './components/Landing';
import { ListsDrawer } from './components/ListsDrawer';
import { dateStamp, downloadFile } from './lib/download';
import { SAMPLE_VCF } from './lib/sample';
import {
  buildSession,
  countByList,
  exportAll,
  exportList,
  exportListsZip,
  isSorted,
  readImportFile,
  reducer,
  safeFileName,
  type Action,
  type ImportFile,
  type ImportPlanItem,
  type ListDef,
  type Session,
} from './lib/session';
import { clearSaved, loadSaved, save } from './lib/storage';
import { contactView } from './lib/vcard';
import { wheelOffset } from './lib/wheel';

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

/** Ring around the folder button: the wheel in miniature. */
function wheelRing(lists: ListDef[]): string {
  if (!lists.length) return 'conic-gradient(rgba(255,255,255,.14) 0 360deg)';
  const step = 360 / lists.length;
  const from = wheelOffset(lists.length) + 90 - step / 2;
  const stops = lists.map((l, i) => `${l.color} ${i * step}deg ${(i + 1) * step}deg`).join(', ');
  return `conic-gradient(from ${from}deg, ${stops})`;
}

interface Toast {
  text: string;
  error?: boolean;
  n: number;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [saved, setSaved] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<ImportFile[] | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const [menu, setMenu] = useState<'export' | 'more' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [enter, setEnter] = useState<EnterToken | null>(null);
  const [fileDrag, setFileDrag] = useState(false);
  const stack = useRef<CardStackHandle>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const dispatch = useCallback((a: Action) => setSession((s) => (s ? reducer(s, a) : s)), []);

  const showToast = useCallback((text: string, error = false) => setToast({ text, error, n: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Restore an autosaved session (offered on the landing page).
  useEffect(() => {
    loadSaved().then((s) => {
      setSaved(s);
      setReady(true);
    });
  }, []);

  // Autosave (debounced).
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => {
      save(session).then((ok) => !ok && console.warn('ContactSort: autosave unavailable in this browser'));
    }, 400);
    return () => clearTimeout(t);
  }, [session]);

  const views = useMemo(() => new Map((session?.contacts ?? []).map((c) => [c.uid, contactView(c)])), [session?.contacts]);

  const start = useCallback(
    (s: Session) => {
      setSession(s);
      setSaved(null);
      setMenu(null);
      const sorted = s.contacts.filter((c) => isSorted(s, c.uid)).length;
      showToast(
        `${s.contacts.length} contacts loaded${sorted ? ` · ${sorted} already sorted` : ''}${
          s.lists.length ? ` · ${s.lists.length} ${s.lists.length === 1 ? 'list' : 'lists'}` : ''
        }`,
      );
      if (s.lists.length === 0) setTimeout(() => setDrawer(true), 450);
    },
    [showToast],
  );

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    const parsed = await Promise.all(files.map(async (f) => readImportFile(f.name, await f.text())));
    const good = parsed.filter((p) => p.cards.length > 0);
    const bad = parsed.filter((p) => p.cards.length === 0);
    if (bad.length) showToast(`No contacts found in ${bad.map((b) => b.name).join(', ')}`, true);
    if (!good.length) return;
    if (!session && good.length === 1) start(buildSession([{ file: good[0], addToList: '' }]));
    else setPending(good);
  };
  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;

  const confirmImport = (items: ImportPlanItem[], merge: boolean) => {
    setPending(null);
    start(buildSession(items, merge && session ? session : undefined));
  };

  // Files can be dropped anywhere on the window.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setFileDrag(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setFileDrag(false);
    };
    const onOver = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setFileDrag(false);
      handleFilesRef.current(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const undo = () => {
    const last = session?.history[session.history.length - 1];
    if (!last) return;
    setEnter({ uid: last.uid, from: last.kind === 'assign' ? last.exit : { x: 0, y: 0.4 }, n: Date.now() });
    dispatch({ type: 'undo' });
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;

  const modalOpen = Boolean(details || pending);

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        setDrawer(false);
        setMenu(null);
        return;
      }
      if (modalOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        undoRef.current();
      } else if (e.key === 'Backspace' && !mod) {
        e.preventDefault();
        undoRef.current();
      } else if ((e.key === 'l' || e.key === 'L') && !mod && !e.altKey) {
        setDrawer((d) => !d);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, modalOpen]);

  // --- export ------------------------------------------------------------

  const exportProgress = () => {
    if (!session) return;
    downloadFile(`contacts-sorted-${dateStamp()}.vcf`, exportAll(session), 'text/vcard;charset=utf-8');
    dispatch({ type: 'exported' });
    setMenu(null);
    const sorted = session.contacts.filter((c) => isSorted(session, c.uid)).length;
    showToast(`Saved ${session.contacts.length} contacts (${sorted} sorted). Load this file next time to continue.`);
  };
  const exportZip = () => {
    if (!session) return;
    downloadFile(`contact-lists-${dateStamp()}.zip`, exportListsZip(session), 'application/zip');
    setMenu(null);
    showToast(`Exported ${session.lists.length} lists as separate .vcf files`);
  };
  const exportOne = (listId: string) => {
    if (!session) return;
    const list = session.lists.find((l) => l.id === listId);
    if (!list) return;
    downloadFile(`${safeFileName(list.name)}.vcf`, exportList(session, listId), 'text/vcard;charset=utf-8');
  };

  const startOver = async () => {
    setMenu(null);
    if (session?.dirty && !window.confirm('You have changes that are not exported yet. Discard them and start over?')) return;
    await clearSaved();
    setSession(null);
    setSaved(null);
    setDrawer(false);
  };

  // --- render ------------------------------------------------------------

  if (!ready) return <div className="boot" />;

  if (!session) {
    return (
      <>
        <Landing
          saved={saved}
          onFiles={handleFiles}
          onResume={() => saved && start({ ...saved, history: saved.history ?? [] })}
          onDiscard={async () => {
            await clearSaved();
            setSaved(null);
          }}
          onSample={() => start(buildSession([{ file: readImportFile('Sample contacts.vcf', SAMPLE_VCF), addToList: '' }]))}
        />
        {pending && (
          <ImportDialog files={pending} canMerge={false} dirty={false} onCancel={() => setPending(null)} onConfirm={confirmImport} />
        )}
        {toast && <div className={`toast ${toast.error ? 'is-error' : ''}`} key={toast.n}>{toast.text}</div>}
      </>
    );
  }

  const { lists, queue, contacts, assignments, history } = session;
  const counts = countByList(session);
  const sortedCount = contacts.filter((c) => isSorted(session, c.uid)).length;
  const pct = contacts.length ? (sortedCount / contacts.length) * 100 : 0;
  const listsById = new Map(lists.map((l) => [l.id, l]));
  const last = history[history.length - 1];
  const lastView = last ? views.get(last.uid) : undefined;
  const lastList = last?.kind === 'assign' ? listsById.get(assignments[last.uid]?.[0] ?? '') : undefined;
  const detailsView = details ? views.get(details) : undefined;
  const keyboard = !drawer && !modalOpen && !menu;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LogoMark size={26} />
          <span>ContactSort</span>
        </div>
        <div className="progress" title={`${sortedCount} of ${contacts.length} contacts are in a list`}>
          <div className="progress-text">
            <b>{sortedCount}</b> of {contacts.length} sorted
            {queue.length > 0 && <span className="muted"> · {queue.length} in stack</span>}
          </div>
          <div className="progress-bar">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="top-actions">
          <button className="icon-btn" title="Import more .vcf files" onClick={() => importInput.current?.click()}>
            <UploadIcon />
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".vcf,.vcard,text/vcard,text/x-vcard"
            multiple
            hidden
            onChange={(e) => {
              handleFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <div className="menu-wrap">
            <button className="btn primary" onClick={() => setMenu(menu === 'export' ? null : 'export')} aria-expanded={menu === 'export'}>
              <DownloadIcon size={18} />
              <span className="hide-sm">Export</span>
              {session.dirty && <span className="unsaved-dot" title="Changes not exported yet" />}
            </button>
            {menu === 'export' && (
              <div className="menu">
                <button className="menu-item" onClick={exportProgress}>
                  <strong>Save progress (.vcf)</strong>
                  <span>All {contacts.length} contacts with their lists. Load it next time to continue where you left off.</span>
                </button>
                <button className="menu-item" onClick={exportZip} disabled={sortedCount === 0}>
                  <strong>One file per list (.zip)</strong>
                  <span>A separate .vcf for each list, for importing into Apple or Google Contacts list by list.</span>
                </button>
              </div>
            )}
          </div>
          <div className="menu-wrap">
            <button className="icon-btn" onClick={() => setMenu(menu === 'more' ? null : 'more')} aria-label="More" aria-expanded={menu === 'more'}>
              <MoreIcon />
            </button>
            {menu === 'more' && (
              <div className="menu">
                <label className="menu-item toggle">
                  <input
                    type="checkbox"
                    checked={session.includeSorted}
                    onChange={(e) => dispatch({ type: 'setIncludeSorted', value: e.target.checked })}
                  />
                  <span>
                    <strong>Include already sorted</strong>
                    <span>Put sorted contacts back in the stack to re-sort them.</span>
                  </span>
                </label>
                <button className="menu-item" onClick={() => { setMenu(null); importInput.current?.click(); }}>
                  <strong>Import more files…</strong>
                  <span>Merge another .vcf into this session. Duplicates are merged.</span>
                </button>
                <button className="menu-item danger" onClick={startOver}>
                  <strong>Start over</strong>
                  <span>Close this session and clear the autosave.</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {menu && <div className="menu-backdrop" onClick={() => setMenu(null)} />}

      <main className="stage">
        {lists.length === 0 && queue.length > 0 && (
          <button className="callout" onClick={() => setDrawer(true)}>
            <FolderIcon size={18} /> Start by creating a few lists — they become the slices you drag cards into.
          </button>
        )}
        {queue.length > 0 ? (
          <CardStack
            ref={stack}
            queue={queue}
            views={views}
            lists={lists}
            assignments={session.includeSorted ? assignments : {}}
            enter={enter}
            keyboard={keyboard}
            onAssign={(uid, listId, exit) => dispatch({ type: 'assign', uid, listId, exit })}
            onSkip={(uid) => dispatch({ type: 'skip', uid })}
            onTap={(uid) => setDetails(uid)}
            onNeedLists={() => setDrawer(true)}
          />
        ) : (
          <div className="done">
            <div className="done-badge">
              <CheckIcon size={34} />
            </div>
            <h2>{session.includeSorted ? 'That’s everyone.' : 'All sorted!'}</h2>
            <p className="muted">
              {sortedCount} of {contacts.length} contacts are in {lists.length} {lists.length === 1 ? 'list' : 'lists'}.
              Export now to keep the result.
            </p>
            <div className="done-actions">
              <button className="btn primary" onClick={exportProgress}>
                <DownloadIcon size={18} /> Save progress (.vcf)
              </button>
              <button className="btn" onClick={exportZip} disabled={sortedCount === 0}>
                One file per list (.zip)
              </button>
            </div>
            <button className="btn link" onClick={() => dispatch({ type: 'setIncludeSorted', value: true })}>
              Go through sorted contacts again
            </button>
          </div>
        )}
        {queue.length > 0 && (
          <p className="hint">
            <span className="touch-only">Drag a card into a slice · tap it for details</span>
            <span className="hover-only">
              Drag a card into a slice · <kbd>1</kbd>–<kbd>{Math.min(Math.max(lists.length, 1), 9)}</kbd> or arrows to
              send · <kbd>Space</kbd> skip · <kbd>Z</kbd> undo · <kbd>L</kbd> lists
            </span>
          </p>
        )}
      </main>

      <footer className="dock">
        <div className="last-action" aria-live="polite">
          {last && lastView ? (
            last.kind === 'assign' && lastList ? (
              <>
                <span className="last-name">{lastView.name}</span> →{' '}
                <span className="chip" style={{ '--c': lastList.color } as CSSProperties}>
                  {lastList.name}
                </span>
                <button className="btn link xs" onClick={undo}>
                  Undo
                </button>
              </>
            ) : last.kind === 'skip' ? (
              <>
                Skipped <span className="last-name">{lastView.name}</span> for now
                <button className="btn link xs" onClick={undo}>
                  Undo
                </button>
              </>
            ) : null
          ) : null}
        </div>
        <div className="dock-buttons">
          <button className="round-btn" onClick={undo} disabled={!history.length} title="Undo (Z)" aria-label="Undo">
            <UndoIcon />
          </button>
          <button
            className={`round-btn big folder ${lists.length === 0 ? 'pulse' : ''}`}
            onClick={() => setDrawer(true)}
            title="Lists (L)"
            aria-label="Lists"
            style={{ '--ring': wheelRing(lists) } as CSSProperties}
          >
            <FolderIcon size={28} />
            <span className="badge">{lists.length}</span>
          </button>
          <button
            className="round-btn"
            onClick={() => stack.current?.skip()}
            disabled={queue.length < 2}
            title="Skip for now (Space)"
            aria-label="Skip"
          >
            <SkipIcon />
          </button>
        </div>
      </footer>

      <ListsDrawer
        open={drawer}
        lists={lists}
        counts={counts}
        unsorted={contacts.length - sortedCount}
        members={(listId) =>
          contacts
            .filter((c) => assignments[c.uid]?.includes(listId))
            .map((c) => ({ uid: c.uid, view: views.get(c.uid)! }))
        }
        dispatch={dispatch}
        onExportList={exportOne}
        onClose={() => setDrawer(false)}
      />

      {detailsView && details && (
        <DetailsModal
          view={detailsView}
          lists={lists}
          current={assignments[details] ?? []}
          onClose={() => setDetails(null)}
          onSend={(i) => {
            setDetails(null);
            requestAnimationFrame(() => stack.current?.assign(i));
          }}
        />
      )}
      {pending && (
        <ImportDialog
          files={pending}
          canMerge
          dirty={session.dirty}
          onCancel={() => setPending(null)}
          onConfirm={confirmImport}
        />
      )}
      {fileDrag && !pending && <div className="file-drop">Drop .vcf files to import</div>}
      {toast && <div className={`toast ${toast.error ? 'is-error' : ''}`} key={toast.n}>{toast.text}</div>}
    </div>
  );
}
