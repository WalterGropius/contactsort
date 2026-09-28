import { useRef, useState, type CSSProperties } from 'react';
import type { Session } from '../lib/session';
import { PALETTE, isSorted } from '../lib/session';
import { LogoMark, ShieldIcon, UploadIcon } from './icons';

interface Props {
  saved: Session | null;
  onFiles(files: File[]): void;
  onResume(): void;
  onDiscard(): void;
  onSample(): void;
}

function HeroArt() {
  const slices = PALETTE.slice(0, 5);
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 240 240" className="hero-wheel">
        {slices.map((c, i) => {
          const step = 360 / slices.length;
          const a0 = ((-90 + i * step - step / 2) * Math.PI) / 180;
          const a1 = ((-90 + i * step + step / 2) * Math.PI) / 180;
          const r = 118;
          return (
            <path
              key={c}
              d={`M120 120 L${120 + r * Math.cos(a0)} ${120 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${120 + r * Math.cos(a1)} ${120 + r * Math.sin(a1)}Z`}
              fill={c}
              opacity={i === 1 ? 0.9 : 0.28}
            />
          );
        })}
      </svg>
      <div className="hero-card back" />
      <div className="hero-card mid" />
      <div className="hero-card front" style={{ '--c': PALETTE[1] } as CSSProperties}>
        <div className="hero-card-top">
          <span>AL</span>
        </div>
        <div className="hero-card-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

export function Landing({ saved, onFiles, onResume, onDiscard, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const savedSorted = saved ? saved.contacts.filter((c) => isSorted(saved, c.uid)).length : 0;

  return (
    <div className="landing">
      <header className="landing-top">
        <div className="brand">
          <LogoMark />
          <span>ContactSort</span>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-copy">
            <h1>
              Sort your contacts
              <br />
              <span className="grad">like you swipe.</span>
            </h1>
            <p className="lead">
              Load a .vcf export of your address book, fling each card into a list, and export a file that remembers
              everything — stop halfway and pick up tomorrow.
            </p>
            <p className="privacy">
              <ShieldIcon size={18} />
              Runs entirely in this browser. Your contacts are never uploaded anywhere.
            </p>
          </div>
          <HeroArt />
        </section>

        {saved && (
          <section className="resume">
            <div>
              <strong>Continue where you left off</strong>
              <span className="muted">
                {saved.sources.join(', ')} · {savedSorted} of {saved.contacts.length} sorted · {saved.lists.length}{' '}
                lists{saved.dirty ? ' · not exported yet' : ''}
              </span>
            </div>
            <div className="resume-actions">
              <button className="btn ghost" onClick={onDiscard}>
                Discard
              </button>
              <button className="btn primary" onClick={onResume}>
                Resume
              </button>
            </div>
          </section>
        )}

        <section
          className={`dropzone ${over ? 'is-over' : ''}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          // The drop itself is handled by the window-level listener in App.
          onDrop={() => setOver(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        >
          <div className="dropzone-icon">
            <UploadIcon size={28} />
          </div>
          <strong>Drop your .vcf file here</strong>
          <span className="muted">or click to choose · several files at once is fine</span>
          <input
            ref={input}
            type="file"
            accept=".vcf,.vcard,text/vcard,text/x-vcard"
            multiple
            hidden
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </section>
        {saved && <p className="muted small center">Loading a file starts a new session and replaces the saved one.</p>}

        <div className="center">
          <button className="btn link" onClick={onSample}>
            No file handy? Try it with sample contacts →
          </button>
        </div>

        <section className="howto">
          <details>
            <summary>How do I get a .vcf out of my iPhone?</summary>
            <ol>
              <li>
                Open <b>Contacts</b> and tap <b>Lists</b> (top left).
              </li>
              <li>
                Touch and hold <b>All Contacts</b>, then tap <b>Export</b>.
              </li>
              <li>Choose the fields to include (keep photos for nicer cards) and tap Done.</li>
              <li>
                <b>Save to Files</b> (or AirDrop it to this computer) and drop the file above.
              </li>
            </ol>
            <p className="muted small">
              Already have lists on the iPhone? Export each list the same way (touch and hold the list → Export) and
              drop all the files together — each file can become a list, and duplicates are merged. From a Mac or
              iCloud.com: select all contacts and use <b>Export vCard</b>.
            </p>
          </details>
          <details>
            <summary>How do I continue tomorrow?</summary>
            <p>
              Export any time. With <b>Progress file</b> you get one .vcf that holds every contact plus an{' '}
              <code>X-CUSTOM-LISTS</code> line with its lists. Drop it here next time: lists come back, and contacts
              you already sorted stay out of the stack.
            </p>
            <p>
              With <b>Separate lists</b> you get one plain .vcf per list and nothing is added to the cards. To continue,
              drop those files here together with your original export. Each file becomes its list again.
            </p>
            <p>The browser also autosaves, so an accidental refresh won’t lose anything.</p>
          </details>
          <details>
            <summary>How do I get the lists back into my contacts app?</summary>
            <p>
              A single .vcf can’t carry Apple’s lists, so choose <b>Export → Separate lists</b>. That gives one plain
              .vcf per list (5 lists → 5 files). Then, for each file:
            </p>
            <ul>
              <li>
                <b>Google Contacts:</b> Import → choose the file → “Import and add to label”.
              </li>
              <li>
                <b>Mac Contacts:</b> create the list in the sidebar, then drag that list’s .vcf onto it. If it asks
                about duplicates, update the existing cards instead of adding copies. iCloud syncs the list to the
                iPhone.
              </li>
            </ul>
            <p className="muted small">Keep your original export as a backup, and try one small list first.</p>
          </details>
        </section>
      </main>
    </div>
  );
}
