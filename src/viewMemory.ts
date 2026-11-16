import { useLayoutEffect, useRef } from 'react';

/**
 * Where you were in each open tab (scroll offset, caret, active wiki section).
 * Views are unmounted when you switch tabs, so this lives outside React and is
 * cleared when the tab closes. Keys start with the tab key, e.g. "chapter:<id>".
 */
const memory = new Map<string, unknown>();

export function recall<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

export function remember(key: string, value: unknown) {
  memory.set(key, value);
}

/** Drops everything remembered for a tab and its parts. */
export function forgetTab(tabKey: string) {
  for (const key of memory.keys()) {
    if (key === tabKey || key.startsWith(`${tabKey}:`) || key.startsWith(`${tabKey}#`)) memory.delete(key);
  }
}

/** Restores and records the scroll offset of a scroll container. */
export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const memoryKey = `${key}#scroll`;
    const target = recall<number>(memoryKey) ?? 0;
    // The editor and images fill the page in after mounting: re-apply the offset each time the
    // content grows, until it sticks, the reader scrolls, or a couple of seconds pass.
    let restoring = target > 0;
    const restore = () => {
      if (!restoring) return;
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) <= 1) stop();
    };
    const observer = new ResizeObserver(restore);
    const giveUp = window.setTimeout(() => stop(), 2000);
    function stop() {
      restoring = false;
      observer.disconnect();
      window.clearTimeout(giveUp);
    }
    if (restoring) {
      for (const child of Array.from(el.children)) observer.observe(child);
      restore();
    }
    const onScroll = () => {
      if (!restoring) remember(memoryKey, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('pointerdown', stop);
    el.addEventListener('keydown', stop);
    return () => {
      stop();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('keydown', stop);
    };
  }, [key]);
  return ref;
}
