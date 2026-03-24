import { useState, useEffect, useRef } from 'react';

const DEFAULT_SIZE = { width: 1000, height: 700 };
const DEBOUNCE_MS = 200;
const MIN_DELTA = 50;

export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(DEFAULT_SIZE);
  const lastSize = useRef(DEFAULT_SIZE);

  useEffect(() => {
    const el = document.querySelector('.react-flow');
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      // Ignore small changes to avoid layout thrash
      const dx = Math.abs(width - lastSize.current.width);
      const dy = Math.abs(height - lastSize.current.height);
      if (dx < MIN_DELTA && dy < MIN_DELTA) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        lastSize.current = { width, height };
        setSize({ width, height });
      }, DEBOUNCE_MS);
    });

    // Initial measurement
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      lastSize.current = { width: rect.width, height: rect.height };
      setSize({ width: rect.width, height: rect.height });
    }

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return size;
}
