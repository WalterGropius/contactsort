import type { CSSProperties, ReactNode } from 'react';
import type { ListDef } from '../lib/session';
import type { ContactView } from '../lib/vcard';
import { BuildingIcon, CakeIcon, LinkIcon, MailIcon, NoteIcon, PhoneIcon, PinIcon } from './icons';

export function avatarGradient(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const hue = h % 360;
  return `linear-gradient(145deg, hsl(${hue} 72% 62%), hsl(${(hue + 48) % 360} 70% 44%))`;
}

function Row({ icon, children, label }: { icon: ReactNode; children: ReactNode; label?: string }) {
  return (
    <div className="card-row">
      <span className="card-row-icon">{icon}</span>
      <span className="card-row-value">{children}</span>
      {label ? <span className="card-row-label">{label}</span> : null}
    </div>
  );
}

interface Props {
  view: ContactView;
  lists?: ListDef[];
  /** list currently targeted while dragging — shown as a stamp */
  stamp?: ListDef | null;
  className?: string;
  style?: CSSProperties;
}

/** Visual only. Drag behaviour lives in CardStack. */
export function ContactCardFace({ view, lists = [], stamp, className = '', style }: Props) {
  const rows: ReactNode[] = [];
  view.phones.slice(0, 2).forEach((p, i) =>
    rows.push(
      <Row key={`t${i}`} icon={<PhoneIcon size={16} />} label={p.label}>
        {p.value}
      </Row>,
    ),
  );
  view.emails.slice(0, 2).forEach((e, i) =>
    rows.push(
      <Row key={`e${i}`} icon={<MailIcon size={16} />} label={e.label}>
        {e.value}
      </Row>,
    ),
  );
  if (view.addresses[0])
    rows.push(
      <Row key="a" icon={<PinIcon size={16} />} label={view.addresses[0].label}>
        {view.addresses[0].value}
      </Row>,
    );
  if (view.birthday)
    rows.push(
      <Row key="b" icon={<CakeIcon size={16} />}>
        {view.birthday}
      </Row>,
    );
  if (view.urls[0] || view.socials[0]) {
    const u = view.urls[0] ?? view.socials[0];
    rows.push(
      <Row key="u" icon={<LinkIcon size={16} />} label={u.label}>
        {u.value}
      </Row>,
    );
  }
  const hidden =
    Math.max(0, view.phones.length - 2) +
    Math.max(0, view.emails.length - 2) +
    Math.max(0, view.addresses.length - 1) +
    Math.max(0, view.urls.length + view.socials.length - 1);

  const subtitle = [view.title, view.org].filter(Boolean).join(' · ');

  return (
    <div className={`card-face ${className}`} style={style}>
      <div className="card-hero" style={{ background: avatarGradient(view.name) }}>
        {view.photo ? (
          <img className="card-photo" src={view.photo} alt="" draggable={false} />
        ) : (
          <span className="card-initials">{view.initials}</span>
        )}
        <div className="card-scrim" />
        <div className="card-hero-text">
          <h2 className="card-name">{view.name}</h2>
          {subtitle ? (
            <div className="card-sub">
              <BuildingIcon size={15} />
              <span>{subtitle}</span>
            </div>
          ) : view.nickname ? (
            <div className="card-sub">“{view.nickname}”</div>
          ) : null}
        </div>
        {lists.length > 0 && (
          <div className="card-lists">
            {lists.map((l) => (
              <span key={l.id} className="chip" style={{ '--c': l.color } as CSSProperties}>
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="card-body">
        {rows.length === 0 && !view.note ? <div className="card-empty">No details on this card</div> : rows}
        {view.note ? (
          <div className="card-note">
            <NoteIcon size={16} />
            <p>{view.note}</p>
          </div>
        ) : null}
        {hidden > 0 ? <div className="card-more">+{hidden} more · tap for details</div> : null}
      </div>
      {stamp !== undefined && (
        <div className="stamp" style={{ '--c': stamp?.color ?? 'transparent' } as CSSProperties}>
          {stamp?.name}
        </div>
      )}
    </div>
  );
}
