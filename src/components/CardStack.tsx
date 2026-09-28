import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import type { ListDef, Vec } from '../lib/session';
import type { ContactView } from '../lib/vcard';
import { sliceAt } from '../lib/wheel';
import { ContactCardFace } from './ContactCard';
import { labelPoint, WheelOverlay, type WheelState } from './WheelOverlay';

export interface CardStackHandle {
  /** Animate the top card into list `index` (keyboard / buttons). */
  assign(index: number): void;
  skip(): void;
}

export interface EnterToken {
  uid: string;
  from: Vec;
  n: number;
}

interface Xf {
  x: number;
  y: number;
  rot: number;
  scale: number;
  opacity: number;
}

interface Ghost {
  key: number;
  uid: string;
  from: Xf;
  to: Xf;
  stamp: ListDef | null;
  duration: number;
}

interface Drag {
  id: number;
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  moved: boolean;
  threshold: number;
  samples: { t: number; x: number; y: number }[];
  active: number | null;
  armed: boolean;
}

interface Props {
  ref?: Ref<CardStackHandle>;
  queue: string[];
  views: Map<string, ContactView>;
  lists: ListDef[];
  assignments: Record<string, string[]>;
  enter: EnterToken | null;
  keyboard: boolean;
  onAssign(uid: string, listId: string, exit: Vec): void;
  onSkip(uid: string): void;
  onTap(uid: string): void;
  onNeedLists(): void;
}

const xf = (t: Pick<Xf, 'x' | 'y' | 'rot' | 'scale'>) =>
  `translate(${t.x}px, ${t.y}px) rotate(${t.rot}deg) scale(${t.scale})`;
const REST: Xf = { x: 0, y: 0, rot: 0, scale: 1, opacity: 1 };
const deg = (y: number, x: number) => (Math.atan2(y, x) * 180) / Math.PI;

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function GhostCard({ ghost, view, onDone }: { ghost: Ghost; view: ContactView; onDone(key: number): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(
      [
        { transform: xf(ghost.from), opacity: ghost.from.opacity },
        { transform: xf(ghost.to), opacity: ghost.to.opacity },
      ],
      { duration: ghost.duration, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' },
    );
    anim.onfinish = () => onDone(ghost.key);
    return () => anim.cancel();
  }, [ghost, onDone]);
  return (
    <div ref={ref} className="card ghost" style={{ transform: xf(ghost.from) }}>
      <ContactCardFace view={view} stamp={ghost.stamp} className={ghost.stamp ? 'stamp-on' : ''} />
    </div>
  );
}

export function CardStack({
  ref,
  queue,
  views,
  lists,
  assignments,
  enter,
  keyboard,
  onAssign,
  onSkip,
  onTap,
  onNeedLists,
}: Props) {
  const stackRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [wheel, setWheel] = useState<WheelState | null>(null);
  const wheelTimers = useRef<number[]>([]);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const ghostKey = useRef(0);
  const n = lists.length;
  const top = queue[0];

  const clearWheelTimers = () => {
    wheelTimers.current.forEach(clearTimeout);
    wheelTimers.current = [];
  };

  const hideWheel = useCallback((delay = 0) => {
    clearWheelTimers();
    wheelTimers.current.push(
      window.setTimeout(() => setWheel((w) => (w ? { ...w, visible: false } : w)), delay),
      window.setTimeout(() => setWheel(null), delay + 220),
    );
  }, []);

  useEffect(() => () => clearWheelTimers(), []);

  const measure = useCallback((): WheelState | null => {
    const st = stackRef.current;
    if (!st) return null;
    const r = st.getBoundingClientRect();
    return {
      center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      half: { w: r.width / 2, h: r.height / 2 },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      threshold: Math.max(80, Math.min(130, Math.min(r.width, r.height) * 0.3)),
      active: null,
      armed: false,
      visible: true,
    };
  }, []);

  const resetTop = () => {
    stackRef.current?.style.setProperty('--p', '0');
    const el = topRef.current;
    if (el) {
      el.style.transform = '';
      el.style.setProperty('--stamp', '0');
    }
  };

  /** Fly the top card into the label of list `index`, then commit. */
  const sendTo = (index: number, from: Xf) => {
    if (!top || index < 0 || index >= n) return;
    const w = measure();
    if (!w) return;
    const list = lists[index];
    const target = labelPoint(w, lists, index);
    const tx = target.x - w.center.x;
    const ty = target.y - w.center.y;
    const len = Math.hypot(tx, ty) || 1;
    clearWheelTimers();
    setWheel({ ...w, active: index, armed: true, visible: true });
    hideWheel(420);
    setGhosts((g) => [
      ...g,
      {
        key: ++ghostKey.current,
        uid: top,
        from,
        to: { x: tx, y: ty, rot: from.rot * 0.3, scale: 0.12, opacity: 0 },
        stamp: list,
        duration: 440,
      },
    ]);
    resetTop();
    onAssign(top, list.id, { x: tx / len, y: ty / len });
  };

  const skip = () => {
    if (!top || drag.current) return;
    if (queue.length < 2) {
      topRef.current?.animate(
        [{ transform: xf(REST) }, { transform: xf({ ...REST, x: -10 }) }, { transform: xf({ ...REST, x: 10 }) }, { transform: xf(REST) }],
        { duration: 260 },
      );
      return;
    }
    setGhosts((g) => [
      ...g,
      {
        key: ++ghostKey.current,
        uid: top,
        from: REST,
        to: { x: 0, y: 70, rot: 0, scale: 0.86, opacity: 0 },
        stamp: null,
        duration: 280,
      },
    ]);
    onSkip(top);
  };

  const latest = useRef({ sendTo, skip });
  latest.current = { sendTo, skip };

  useImperativeHandle(
    ref,
    () => ({
      assign: (i) => !drag.current && latest.current.sendTo(i, REST),
      skip: () => latest.current.skip(),
    }),
    [],
  );

  // Keyboard: 1–9/0 send to a list, arrows send toward that side of the wheel, space skips.
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      // Ignore auto-repeat so holding a key down can't fling a whole run of cards.
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || drag.current) return;
      const arrows: Record<string, number> = { ArrowRight: 0, ArrowDown: 90, ArrowLeft: 180, ArrowUp: -90 };
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        latest.current.sendTo(e.key === '0' ? 9 : Number(e.key) - 1, REST);
      } else if (e.key in arrows && n > 0) {
        e.preventDefault();
        latest.current.sendTo(sliceAt(arrows[e.key], n), REST);
      } else if (e.key === ' ') {
        e.preventDefault();
        latest.current.skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, n]);

  // Undo: the returning card flies back in from where it left.
  const handledEnter = useRef(0);
  useLayoutEffect(() => {
    if (!enter || enter.n === handledEnter.current) return;
    handledEnter.current = enter.n;
    const el = topRef.current;
    if (!el || top !== enter.uid) return;
    const d = 280;
    el.animate(
      [
        { transform: xf({ x: enter.from.x * d, y: enter.from.y * d, rot: enter.from.x * 10, scale: 0.35 }), opacity: 0 },
        { transform: xf(REST), opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.08)' },
    );
  }, [enter, top]);

  // --- pointer dragging --------------------------------------------------

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    const w = measure();
    if (!w) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      threshold: w.threshold,
      samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }],
      active: null,
      armed: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    const now = performance.now();
    d.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (d.samples.length > 2 && now - d.samples[0].t > 120) d.samples.shift();
    const dist = Math.hypot(d.dx, d.dy);

    if (!d.moved) {
      if (dist < 6) return;
      d.moved = true;
      stackRef.current?.classList.add('dragging');
      if (topRef.current) topRef.current.style.transition = ''; // cancel a spring-back still in flight
      clearWheelTimers();
      const w = measure();
      if (w) setWheel(w);
    }

    const el = topRef.current;
    if (el) {
      const rot = Math.max(-16, Math.min(16, d.dx * 0.06));
      el.style.transform = xf({ x: d.dx, y: d.dy, rot, scale: 1 });
      el.style.setProperty('--stamp', n ? String(Math.max(0, Math.min(1, (dist - 16) / (d.threshold - 16)))) : '0');
    }
    stackRef.current?.style.setProperty('--p', Math.min(1, dist / d.threshold).toFixed(3));

    const active = n > 0 && dist > 16 ? sliceAt(deg(d.dy, d.dx), n) : null;
    const armed = n > 0 && dist >= d.threshold;
    if (active !== d.active || armed !== d.armed) {
      d.active = active;
      d.armed = armed;
      setWheel((w) => (w ? { ...w, active, armed } : w));
    }
  };

  const release = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    stackRef.current?.classList.remove('dragging');
    if (!d.moved) {
      if (!cancelled && top) onTap(top);
      return;
    }

    const dist = Math.hypot(d.dx, d.dy);
    const now = performance.now();
    const old = d.samples.find((s) => now - s.t < 100) ?? d.samples[0];
    const dt = Math.max(1, now - old.t);
    const vx = (e.clientX - old.x) / dt;
    const vy = (e.clientY - old.y) / dt;
    const flick = Math.hypot(vx, vy) > 0.6 && dist > 40 && vx * d.dx + vy * d.dy > 0;
    const rot = Math.max(-16, Math.min(16, d.dx * 0.06));

    if (!cancelled && n > 0 && (dist >= d.threshold || flick)) {
      sendTo(sliceAt(deg(d.dy, d.dx), n), { x: d.dx, y: d.dy, rot, scale: 1, opacity: 1 });
      return;
    }

    // Not far enough: spring back to the stack.
    const el = topRef.current;
    if (el) {
      el.style.transition = 'transform .55s cubic-bezier(.2,1.45,.35,1)';
      requestAnimationFrame(() => {
        el.style.transform = '';
        el.style.setProperty('--stamp', '0');
      });
      const done = () => {
        el.style.transition = '';
        el.removeEventListener('transitionend', done);
      };
      el.addEventListener('transitionend', done);
    }
    stackRef.current?.style.setProperty('--p', '0');
    hideWheel();
    if (n === 0 && dist >= d.threshold) onNeedLists();
  };

  const removeGhost = useCallback((key: number) => setGhosts((g) => g.filter((x) => x.key !== key)), []);

  const listsById = new Map(lists.map((l) => [l.id, l]));
  const visible = queue.slice(0, 3);
  const stamp = wheel?.active != null ? (lists[wheel.active] ?? null) : null;

  return (
    <>
      <WheelOverlay state={wheel} lists={lists} />
      <div className={`stack ${wheel ? 'elevated' : ''}`} ref={stackRef}>
        {visible
          .map((uid, depth) => {
            const view = views.get(uid);
            if (!view) return null;
            const cardLists = (assignments[uid] ?? []).map((id) => listsById.get(id)).filter((l): l is ListDef => !!l);
            if (depth === 0) {
              return (
                <div
                  key={uid}
                  ref={topRef}
                  className="card is-top"
                  data-depth={0}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => release(e, false)}
                  onPointerCancel={(e) => release(e, true)}
                  role="button"
                  tabIndex={-1}
                  aria-label={`${view.name}. Drag onto a list, or press 1 to ${Math.min(n, 9) || 1}.`}
                >
                  <ContactCardFace view={view} lists={cardLists} stamp={stamp} />
                </div>
              );
            }
            return (
              <div key={uid} className="card" data-depth={depth} aria-hidden="true">
                <ContactCardFace view={view} lists={cardLists} />
              </div>
            );
          })
          .reverse()}
        {ghosts.map((g) => {
          const view = views.get(g.uid);
          return view ? <GhostCard key={g.key} ghost={g} view={view} onDone={removeGhost} /> : null;
        })}
      </div>
    </>
  );
}
