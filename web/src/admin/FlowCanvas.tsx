import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The map of a bot: every block as a card, every connection as a line, on a board that can be moved and zoomed.
 *
 * The board is a view of the flow and edits two things only: which block is selected (the form of that block is the place
 * where it is edited) and where a card sits. Where a card sits is kept in the flow as `layout`, so it is saved with the bot
 * and comes back in the undo history. The connections themselves are chosen in the forms; the map shows them and shows the
 * ones that lead nowhere in red. Without a mouse: Tab to a card and Enter to select it; with the board focused, the arrow
 * keys move the view, + and - zoom, 0 fits everything.
 */

type Pos = { x: number; y: number };
type FlowNode = { type: string; text?: string; next?: string; options?: { id: string; label: string; next: string }[]; cases?: { equals?: string; contains?: string; next: string }[]; else?: string; empty?: string; query?: string; subject?: string };
export type MapFlow = { start: string; nodes: Record<string, FlowNode>; layout?: Record<string, Pos> };

const CARD_W = 196;
const CARD_H = 64;
const GAP_X = 92;
const GAP_Y = 36;

const LABEL: Record<string, string> = {
  message: 'Message', buttons: 'Buttons', ask_text: 'Asks', ask_email: 'Asks email', ask_service: 'Asks service', branch: 'Branch', search_kb: 'Searches docs',
  suggest_article: 'Article', create_ticket: 'Ticket', set_priority: 'Priority', assign_department: 'Department', transfer: 'Person', end: 'End',
};

function edgesOf(node: FlowNode): { to: string; label?: string }[] {
  switch (node.type) {
    case 'buttons':
      return (node.options ?? []).map((option) => ({ to: option.next, label: option.label }));
    case 'branch':
      return [...(node.cases ?? []).map((c) => ({ to: c.next, label: c.equals ?? c.contains })), ...(node.else ? [{ to: node.else, label: 'otherwise' }] : [])];
    case 'search_kb':
      return [...(node.next ? [{ to: node.next }] : []), ...(node.empty ? [{ to: node.empty, label: 'nothing found' }] : [])];
    case 'end':
    case 'transfer':
      return [];
    default:
      return node.next ? [{ to: node.next }] : [];
  }
}

/** Columns by distance from the start; blocks that cannot be reached go in a column of their own at the end. */
export function autoLayout(flow: MapFlow): Record<string, Pos> {
  const depth = new Map<string, number>();
  const queue: string[] = flow.nodes[flow.start] ? [flow.start] : [];
  if (queue[0]) depth.set(queue[0], 0);
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!;
    for (const edge of edgesOf(flow.nodes[key]!)) {
      if (flow.nodes[edge.to] && !depth.has(edge.to)) {
        depth.set(edge.to, depth.get(key)! + 1);
        queue.push(edge.to);
      }
    }
  }
  const extra = Math.max(-1, ...depth.values()) + 1;
  const rows = new Map<number, number>();
  const out: Record<string, Pos> = {};
  for (const key of Object.keys(flow.nodes)) {
    const column = depth.get(key) ?? extra;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    out[key] = { x: column * (CARD_W + GAP_X), y: row * (CARD_H + GAP_Y) };
  }
  return out;
}

export function FlowCanvas({ flow, selected, onSelect, onMove, readOnly }: { flow: MapFlow; selected: string | null; onSelect: (id: string) => void; onMove: (id: string, pos: Pos) => void; readOnly: boolean }) {
  const board = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 24, y: 24, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const base = useMemo(() => autoLayout(flow), [flow.start, JSON.stringify(Object.entries(flow.nodes).map(([key, node]) => [key, edgesOf(node).map((edge) => edge.to)]))]);
  const at = (key: string): Pos => flow.layout?.[key] ?? base[key] ?? { x: 0, y: 0 };
  const [dragging, setDragging] = useState<{ id: string; pos: Pos } | null>(null);
  const position = (key: string): Pos => (dragging?.id === key ? dragging.pos : at(key));

  const fit = () => {
    const el = board.current;
    const keys = Object.keys(flow.nodes);
    if (!el || keys.length === 0) return;
    const xs = keys.map((key) => at(key).x);
    const ys = keys.map((key) => at(key).y);
    const width = Math.max(...xs) + CARD_W - Math.min(...xs);
    const height = Math.max(...ys) + CARD_H - Math.min(...ys);
    const k = Math.min(1.2, Math.max(0.25, Math.min((el.clientWidth - 48) / width, (el.clientHeight - 48) / height)));
    setView({ k, x: 24 - Math.min(...xs) * k, y: 24 - Math.min(...ys) * k });
  };
  useEffect(fit, []); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const current = viewRef.current;
    const k = Math.min(2, Math.max(0.2, current.k * factor));
    setView({ k, x: cx - ((cx - current.x) / current.k) * k, y: cy - ((cy - current.y) / current.k) * k });
  };

  // The wheel zooms the board and does not scroll the page: the listener has to be able to cancel it.
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onBoardDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('[data-card]')) return;
    pan.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    board.current?.setPointerCapture(event.pointerId);
  };
  const onBoardMove = (event: React.PointerEvent) => {
    if (!pan.current) return;
    setView({ ...viewRef.current, x: pan.current.vx + event.clientX - pan.current.x, y: pan.current.vy + event.clientY - pan.current.y });
  };
  const onBoardUp = () => {
    pan.current = null;
  };

  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const onCardDown = (id: string) => (event: React.PointerEvent) => {
    event.stopPropagation();
    const origin = at(id);
    drag.current = { id, sx: event.clientX, sy: event.clientY, ox: origin.x, oy: origin.y, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onCardMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || readOnly) return;
    const dx = (event.clientX - d.sx) / viewRef.current.k;
    const dy = (event.clientY - d.sy) / viewRef.current.k;
    if (!d.moved && Math.hypot(dx, dy) * viewRef.current.k < 4) return;
    d.moved = true;
    setDragging({ id: d.id, pos: { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) } });
  };
  const onCardUp = (event: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved && dragging) onMove(d.id, dragging.pos);
    else onSelect(d.id);
    setDragging(null);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  };

  const onKey = (event: React.KeyboardEvent) => {
    const step = 40;
    if (event.key === 'ArrowLeft') setView({ ...view, x: view.x + step });
    else if (event.key === 'ArrowRight') setView({ ...view, x: view.x - step });
    else if (event.key === 'ArrowUp') setView({ ...view, y: view.y + step });
    else if (event.key === 'ArrowDown') setView({ ...view, y: view.y - step });
    else if (event.key === '+' || event.key === '=') zoomAt(1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2);
    else if (event.key === '-') zoomAt(1 / 1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2);
    else if (event.key === '0') fit();
    else return;
    event.preventDefault();
  };

  const reached = useMemo(() => {
    const seen = new Set<string>();
    const walk = (key: string) => {
      if (seen.has(key) || !flow.nodes[key]) return;
      seen.add(key);
      for (const edge of edgesOf(flow.nodes[key]!)) walk(edge.to);
    };
    walk(flow.start);
    return seen;
  }, [flow]);

  const lines = Object.keys(flow.nodes).flatMap((key) =>
    edgesOf(flow.nodes[key]!).map((edge, index) => {
      const from = position(key);
      const target = flow.nodes[edge.to] ? position(edge.to) : null;
      const x1 = from.x + CARD_W;
      const y1 = from.y + CARD_H / 2;
      const x2 = target ? target.x : x1 + 60;
      const y2 = target ? target.y + CARD_H / 2 : y1 + 30;
      const bend = Math.max(40, Math.abs(x2 - x1) / 2);
      return { id: `${key}-${index}`, from: key, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, label: edge.label, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, broken: !target };
    }),
  );

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Map controls">
        <button type="button" onClick={() => zoomAt(1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2)} className="h-11 min-w-11 rounded-full border border-line bg-card px-3 text-[15px] font-semibold text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(1 / 1.2, (board.current?.clientWidth ?? 0) / 2, (board.current?.clientHeight ?? 0) / 2)} className="h-11 min-w-11 rounded-full border border-line bg-card px-3 text-[15px] font-semibold text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc" aria-label="Zoom out">−</button>
        <button type="button" onClick={fit} className="h-11 rounded-full border border-line bg-card px-4 text-[13.5px] font-medium text-ink hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Fit</button>
        {!readOnly && Object.keys(flow.layout ?? {}).length > 0 && <span className="text-[12.5px] text-ink3">Drag a block to move it. Drag the board to move the view.</span>}
        <span className="ml-auto text-[12.5px] tabular-nums text-ink3">{Math.round(view.k * 100)}%</span>
      </div>
      <div
        ref={board}
        tabIndex={0}
        role="application"
        aria-label="Map of the bot. Arrow keys move the view, plus and minus zoom, zero fits."
        onKeyDown={onKey}
        onPointerDown={onBoardDown}
        onPointerMove={onBoardMove}
        onPointerUp={onBoardUp}
        onPointerCancel={onBoardUp}
        className="relative h-[420px] touch-none select-none overflow-hidden rounded-2xl border border-line bg-s1 outline-none focus-visible:ring-2 focus-visible:ring-acc"
        style={{ cursor: pan.current ? 'grabbing' : 'grab' }}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden="true">
            {lines.map((line) => (
              <g key={line.id}>
                <path d={line.d} fill="none" strokeWidth={2} className={line.broken ? 'stroke-bad' : 'stroke-ink3'} strokeDasharray={line.broken ? '6 4' : undefined} opacity={0.7} />
                {line.label && <text x={line.mx} y={line.my - 6} textAnchor="middle" className="fill-ink3" fontSize="11">{line.label.slice(0, 22)}</text>}
              </g>
            ))}
          </svg>
          {Object.entries(flow.nodes).map(([key, node]) => {
            const pos = position(key);
            const isSelected = selected === key;
            return (
              <button
                key={key}
                type="button"
                data-card=""
                aria-pressed={isSelected}
                aria-label={`${LABEL[node.type] ?? node.type} block ${key}${flow.start === key ? ', first block' : ''}${reached.has(key) ? '' : ', not reached'}`}
                onPointerDown={onCardDown(key)}
                onPointerMove={onCardMove}
                onPointerUp={onCardUp}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(key);
                  }
                }}
                className={`absolute grid content-center gap-0.5 rounded-xl border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-acc ${isSelected ? 'border-acc bg-card' : 'border-line bg-card'} ${reached.has(key) ? '' : 'opacity-55'}`}
                style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H, cursor: readOnly ? 'pointer' : 'move' }}
              >
                <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink3">
                  <span>{LABEL[node.type] ?? node.type}</span>
                  {flow.start === key && <span className="text-acc">start</span>}
                </span>
                <span className="truncate text-[13px] text-ink">{key}</span>
                <span className="truncate text-[12px] text-ink3">{node.text ?? node.query ?? node.subject ?? ''}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
