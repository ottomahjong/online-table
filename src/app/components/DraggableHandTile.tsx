import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';

// A rack tile you can tap, or hold and drag to reorder. Built on pointer
// events so it works the same with a finger and a mouse (the browser's native
// drag-and-drop barely works on phones).
//
// Touch: press shows instantly; hold ~150ms and the tile lifts (with a
// haptic tick where supported) and follows your finger. A quick swipe still
// scrolls the rack. Mouse: drag starts after a few pixels of movement.
// Neighbouring tiles slide into place as you pass them.

const HOLD_MS = 150;
const TOUCH_SLOP = 8;   // px a finger may wander before a hold becomes a scroll
const MOUSE_SLOP = 4;
const EDGE_SCROLL = 36; // px from the rack edge where dragging scrolls the rack

interface DraggableHandTileProps {
  index: number;
  tileId: string;
  moveTile: (fromIndex: number, toIndex: number) => void;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function DraggableHandTile({
  index,
  tileId,
  moveTile,
  onClick,
  children,
  disabled = false,
}: DraggableHandTileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null); // null = not lifted
  const [dragY, setDragY] = useState(0);

  const indexRef = useRef(index);
  const pendingIndexRef = useRef<number | null>(null);
  indexRef.current = index;
  if (pendingIndexRef.current === index) pendingIndexRef.current = null;

  const gesture = useRef<{
    id: number; type: string; startX: number; startY: number;
    grabOffset: number; grabOffsetY: number; lifted: boolean; timer?: number;
  } | null>(null);
  const suppressClick = useRef(false);

  // The wrapper the rack lays out (this tile's slot) and the row of slots.
  const slot = () => ref.current?.parentElement ?? null;
  const row = () => slot()?.parentElement ?? null;

  // Slide into a new slot instead of jumping (sorting, or a neighbour being dragged past).
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const s = slot();
    if (!s) return;
    const pos = { x: s.offsetLeft, y: s.offsetTop };
    const prev = lastPos.current;
    lastPos.current = pos;
    if (!prev || (prev.x === pos.x && prev.y === pos.y) || dragX !== null || !ref.current) return;
    ref.current.animate(
      [{ transform: `translate(${prev.x - pos.x}px, ${prev.y - pos.y}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const followPointer = (clientX: number, clientY: number) => {
    const s = slot(), r = row();
    if (!s || !r) return;
    const box = s.getBoundingClientRect();
    setDragX(clientX - gesture.current!.grabOffset - box.left);
    setDragY(clientY - gesture.current!.grabOffsetY - box.top);

    // Over another slot (any row) → move there.
    if (pendingIndexRef.current === null) {
      const slots = Array.from(r.children) as HTMLElement[];
      const at = slots.indexOf(s);
      const dist = (el: HTMLElement) => {
        const b = el.getBoundingClientRect();
        return Math.hypot(clientX - (b.left + b.width / 2), clientY - (b.top + b.height / 2));
      };
      let best = at, bestD = dist(s);
      slots.forEach((el, i) => { const d = dist(el); if (d < bestD - 4) { best = i; bestD = d; } });
      if (best !== at) {
        const to = indexRef.current + (best - at);
        pendingIndexRef.current = to;
        moveTile(indexRef.current, to);
      }
    }

    // Near the rack's edge → scroll it.
    const scroller = r.parentElement;
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      const b = scroller.getBoundingClientRect();
      if (clientX < b.left + EDGE_SCROLL) scroller.scrollLeft -= 8;
      else if (clientX > b.right - EDGE_SCROLL) scroller.scrollLeft += 8;
    }
  };

  const lift = () => {
    const g = gesture.current;
    if (!g || g.lifted) return;
    g.lifted = true;
    suppressClick.current = true;
    setDragX(0);
    if (g.type === 'touch') navigator.vibrate?.(10);
    ref.current?.animate(
      [{ transform: 'scale(0.95)' }, { transform: 'translate(0px, -12px) scale(1.08)' }],
      { duration: 120, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  };

  const end = () => {
    const g = gesture.current;
    if (g?.timer) window.clearTimeout(g.timer);
    gesture.current = null;
    setPressed(false);
    setDragX(null);
    setDragY(0);
    pendingIndexRef.current = null;
    window.removeEventListener('pointermove', stable.move);
    window.removeEventListener('pointerup', stable.up);
    window.removeEventListener('pointercancel', stable.up);
  };

  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (!g.lifted) {
      const slop = g.type === 'mouse' ? MOUSE_SLOP : TOUCH_SLOP;
      if (Math.hypot(dx, dy) < slop) return;
      if (g.type === 'mouse') { lift(); } else { end(); return; } // finger moved first: it's a scroll
    }
    followPointer(e.clientX, e.clientY);
  };
  const onUp = (e: PointerEvent) => { if (gesture.current?.id === e.pointerId) end(); };

  // Window listeners must keep one identity to be removable; they call the latest handlers.
  const latest = useRef({ onMove, onUp });
  latest.current = { onMove, onUp };
  const stable = useRef({
    move: (e: PointerEvent) => latest.current.onMove(e),
    up: (e: PointerEvent) => latest.current.onUp(e),
  }).current;

  // While a tile is lifted, stop the rack (and page) from scrolling under the finger.
  useEffect(() => {
    if (dragX === null) return;
    const block = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    window.addEventListener('touchmove', block, { passive: false });
    return () => window.removeEventListener('touchmove', block);
  }, [dragX === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const box = ref.current!.getBoundingClientRect();
    gesture.current = {
      id: e.pointerId, type: e.pointerType, startX: e.clientX, startY: e.clientY,
      grabOffset: e.clientX - box.left, grabOffsetY: e.clientY - box.top, lifted: false,
    };
    suppressClick.current = false;
    setPressed(true);
    if (e.pointerType !== 'mouse') gesture.current.timer = window.setTimeout(lift, HOLD_MS);
    window.addEventListener('pointermove', stable.move);
    window.addEventListener('pointerup', stable.up);
    window.addEventListener('pointercancel', stable.up);
  };

  const handleClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onClick();
  };

  const lifted = dragX !== null;
  return (
    <div
      ref={ref}
      className="relative"
      data-drag-tile={tileId}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        cursor: disabled ? undefined : lifted ? 'grabbing' : 'grab',
        touchAction: lifted ? 'none' : 'pan-x',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        zIndex: lifted ? 30 : undefined,
        transform: lifted
          ? `translate(${dragX}px, ${dragY - 12}px) scale(1.08)`
          : pressed ? 'scale(0.95)' : undefined,
        filter: lifted ? 'drop-shadow(0 10px 14px rgba(27,42,74,0.35))' : undefined,
        transition: lifted ? 'filter 0.12s ease' : 'transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.16s ease',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}
