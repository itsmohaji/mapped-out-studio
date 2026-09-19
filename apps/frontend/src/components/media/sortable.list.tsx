'use client';

import { useEffect, useRef } from 'react';
import { ItemInterface, ReactSortable, ReactSortableProps } from 'react-sortablejs';

/**
 * Destroy the Sortable instance living on `el`, if any.
 *
 * react-sortablejs 6.1.4 calls `Sortable.create()` on mount but never stores the
 * instance and has no componentWillUnmount, so `destroy()` never runs. Sortable
 * keeps every live container in a module-level registry until destroyed — and a
 * retained element keeps its whole detached tree alive through parentNode. Heap
 * snapshots (2026-09-19) showed exactly that: every composer open left ~300
 * detached DOM nodes (the closed composer) behind. Sortable stores the instance
 * on the element under a `Sortable<timestamp>` key; react-sortablejs finds it
 * the same way.
 */
export const destroySortable = (el: Element | null | undefined) => {
  if (!el) return;
  const key = Object.keys(el).find((k) => k.startsWith('Sortable'));
  const instance = key ? (el as any)[key] : null;
  if (instance && typeof instance.destroy === 'function') instance.destroy();
};

/** ReactSortable that cleans up after itself. Same props; layout unchanged. */
export function SortableList<T extends ItemInterface>(props: ReactSortableProps<T>) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current?.firstElementChild;
    return () => destroySortable(el);
  }, []);
  return (
    <div ref={wrap} style={{ display: 'contents' }}>
      <ReactSortable {...props} />
    </div>
  );
}
