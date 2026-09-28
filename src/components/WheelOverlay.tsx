import type { CSSProperties } from 'react';
import type { ListDef } from '../lib/session';
import { labelBox, labelPosition, sliceCenter, slicePath, type Point } from '../lib/wheel';

export interface WheelState {
  center: Point;
  half: { w: number; h: number };
  viewport: { w: number; h: number };
  threshold: number;
  active: number | null;
  armed: boolean;
  visible: boolean;
}

export function labelPoint(state: WheelState, lists: ListDef[], i: number): Point {
  return labelPosition(sliceCenter(i, lists.length), state.center, state.half, labelBox(lists[i].name), state.viewport);
}

/**
 * The "pie" that appears while dragging: one equal slice per list, radiating
 * from the card stack. Wherever the card is dropped, that slice's list wins.
 */
export function WheelOverlay({ state, lists }: { state: WheelState | null; lists: ListDef[] }) {
  if (!state) return null;
  const { center, viewport, active, armed, visible, threshold } = state;
  const n = lists.length;
  const r = Math.hypot(Math.max(center.x, viewport.w - center.x), Math.max(center.y, viewport.h - center.y)) + 20;

  return (
    <>
      <svg
        className={`wheel-bg ${visible ? 'is-visible' : ''}`}
        width={viewport.w}
        height={viewport.h}
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        aria-hidden="true"
      >
        <defs>
          {lists.map((l, i) => (
            <radialGradient
              key={l.id}
              id={`wg-${i}`}
              gradientUnits="userSpaceOnUse"
              cx={center.x}
              cy={center.y}
              r={r}
            >
              <stop offset="0" stopColor={l.color} stopOpacity="0" />
              <stop offset="0.18" stopColor={l.color} stopOpacity="0.1" />
              <stop offset="1" stopColor={l.color} stopOpacity="0.55" />
            </radialGradient>
          ))}
        </defs>
        <rect width={viewport.w} height={viewport.h} className="wheel-dim" />
        {lists.map((l, i) => (
          <path
            key={l.id}
            d={slicePath(i, n, center, r)}
            fill={`url(#wg-${i})`}
            className={`wheel-slice ${active === i ? (armed ? 'is-armed' : 'is-active') : ''}`}
          />
        ))}
        {n > 1 &&
          lists.map((l, i) => {
            const a = ((sliceCenter(i, n) - 180 / n) * Math.PI) / 180;
            return (
              <line
                key={`sep-${l.id}`}
                x1={center.x}
                y1={center.y}
                x2={center.x + r * Math.cos(a)}
                y2={center.y + r * Math.sin(a)}
                className="wheel-sep"
              />
            );
          })}
        <circle cx={center.x} cy={center.y} r={threshold} className={`wheel-hub ${armed ? 'is-armed' : ''}`} />
      </svg>
      <div className={`wheel-labels ${visible ? 'is-visible' : ''}`} aria-hidden="true">
        {n === 0 ? (
          <div className="wheel-empty" style={{ left: center.x, top: Math.max(60, center.y - state.half.h - 36) }}>
            No lists yet — add some with the folder button below
          </div>
        ) : (
          lists.map((l, i) => {
            const p = labelPoint(state, lists, i);
            const cls = active === i ? (armed ? 'is-armed' : 'is-active') : '';
            return (
              <div
                key={l.id}
                className={`wheel-label ${cls}`}
                style={{ left: p.x, top: p.y, '--c': l.color } as CSSProperties}
              >
                <span className="wheel-dot" />
                <span className="wheel-name">{l.name}</span>
                {i < 10 && <kbd>{(i + 1) % 10}</kbd>}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/** Small static preview of the wheel layout, used in the lists drawer. */
export function WheelPreview({ lists, size = 124 }: { lists: ListDef[]; size?: number }) {
  const c = { x: size / 2, y: size / 2 };
  const r = size / 2 - 2;
  const n = lists.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="wheel-preview" aria-hidden="true">
      <circle cx={c.x} cy={c.y} r={r} fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.1)" />
      {lists.map((l, i) => (
        <path key={l.id} d={slicePath(i, n, c, r)} fill={l.color} opacity={0.85} stroke="#141821" strokeWidth={2} />
      ))}
      {lists.map((l, i) => {
        if (i >= 10) return null;
        const a = (sliceCenter(i, n) * Math.PI) / 180;
        const d = n === 1 ? 0 : r * 0.62;
        return (
          <text
            key={`t-${l.id}`}
            x={c.x + d * Math.cos(a)}
            y={c.y + d * Math.sin(a)}
            textAnchor="middle"
            dominantBaseline="central"
            className="wheel-preview-num"
          >
            {(i + 1) % 10}
          </text>
        );
      })}
      <rect x={c.x - 11} y={c.y - 15} width={22} height={30} rx={4} fill="#f4f5f8" stroke="#141821" strokeWidth={2} />
    </svg>
  );
}
